"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/ui";
import { useSessionResult } from "@/components/useSessionResult";
import { blurDegrees, fmtD } from "@/lib/optics";
import { drawScene, type SceneId } from "@/lib/scenes";

/*
 * "See Through My Eyes": a WebGL shader blurs the live back camera (or a drawn scene) exactly as an eye with the
 * estimated refraction would see it — elliptical blur for astigmatism, glare bloom at night, haze for reduced
 * contrast — then one tap shows the same view through the recommended ZEISS lens.
 */

const VERT = `attribute vec2 p; varying vec2 uv; void main(){ uv = p*0.5+0.5; uv.y = 1.0-uv.y; gl_Position = vec4(p,0.,1.); }`;
const FRAG = `precision mediump float;
varying vec2 uv;
uniform sampler2D tex; uniform vec2 res; uniform float rMaj; uniform float rMin; uniform float ang;
uniform float glare; uniform float haze; uniform float tint; uniform float mirror;
const int N = 48;
void main(){
  vec2 st = vec2(mirror > 0.5 ? 1.0-uv.x : uv.x, uv.y);
  float ca = cos(ang), sa = sin(ang);
  vec3 acc = vec3(0.0); vec3 bright = vec3(0.0);
  // per-pixel random rotation turns discrete-tap "bokeh dots" into smooth, film-like noise
  float rot = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  for (int i = 0; i < N; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / float(N));
    float th = fi * 2.39996323 + rot;
    vec2 d = vec2(cos(th) * r * rMaj, sin(th) * r * rMin);
    d = vec2(d.x*ca - d.y*sa, d.x*sa + d.y*ca);
    vec3 c = texture2D(tex, st + d / res).rgb;
    acc += c;
    vec3 c2 = texture2D(tex, st + d * 2.5 / res).rgb;
    bright += max(c2 - 0.82, 0.0);
  }
  vec3 col = acc / float(N);
  col += bright / float(N) * glare * 7.0;               // headlight / sun glare bloom
  col = mix(col, vec3(0.78, 0.76, 0.72), haze);        // reduced contrast (e.g. early cataract)
  vec3 tinted = col * vec3(0.55, 0.50, 0.46);          // light-adaptive (photochromic) tint outdoors
  col = mix(col, tinted, tint);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

type Rx = { sphere: number; cyl: number; axis: number; add: number; age: number; reducedContrast: boolean };

function SimulateInner() {
  const sid = useSearchParams().get("sid");
  const { result } = useSessionResult(sid);
  const [scene, setScene] = useState<SceneId>("night");
  const [withLens, setWithLens] = useState(false);
  const [gain, setGain] = useState(2.5);
  const [rx, setRx] = useState<Rx>({ sphere: -2.0, cyl: -0.75, axis: 180, add: 0, age: 35, reducedContrast: false });
  const [camErr, setCamErr] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stateRef = useRef({ scene, withLens, gain, rx });
  stateRef.current = { scene, withLens, gain, rx };

  // pull Rx from the session (worse eye)
  useEffect(() => {
    if (!result) return;
    const e = Math.abs(result.eyes.R.se) >= Math.abs(result.eyes.L.se) ? result.eyes.R : result.eyes.L;
    setRx({ sphere: e.sphere, cyl: e.cyl || 0, axis: e.axis || 180, add: result.add || 0, age: result.simulation?.age || 35, reducedContrast: !!result.simulation?.reduced_contrast });
    if (result.add >= 0.75) setScene("reading");
  }, [result]);

  // camera for the live scene
  useEffect(() => {
    if (scene !== "camera") return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false })
      .then(async (s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
        }
      })
      .catch((e) => setCamErr(String(e.message || e)));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [scene]);

  // WebGL render loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: false });
    if (!gl) return;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const off = document.createElement("canvas");
    off.width = 960;
    off.height = 540;
    const octx = off.getContext("2d")!;
    let raf = 0;
    const frame = (t: number) => {
      const { scene, withLens, gain, rx } = stateRef.current;
      const W = canvas.clientWidth * Math.min(2, devicePixelRatio), H = canvas.clientHeight * Math.min(2, devicePixelRatio);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      gl.viewport(0, 0, W, H);
      let src: TexImageSource = off;
      let fov = 50;
      if (scene === "camera") {
        const v = videoRef.current;
        if (v && v.readyState >= 2) {
          src = v;
          fov = 65;
        } else {
          octx.fillStyle = "#0B1A2C";
          octx.fillRect(0, 0, 960, 540);
        }
      } else drawScene(octx, scene, 960, 540, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);

      // defocus per principal meridian (dioptres)
      let dA = 0, dB = 0;
      if (scene === "reading") {
        const amp = Math.max(0, 2 * (2.5 - rx.add));
        const near = (s: number) => Math.max(0, 2.5 + s - amp); // demand left after myopia + accommodation
        dA = near(rx.sphere);
        dB = near(rx.sphere + rx.cyl);
      } else {
        dA = Math.max(0, -rx.sphere);
        dB = Math.max(0, -(rx.sphere + rx.cyl));
        if (rx.sphere > 0 && rx.age >= 40) dA = dB = Math.max(dA, rx.sphere * 0.5); // latent hyperopia shows with age
      }
      const pxPerDeg = (W / fov) * gain;
      const lens = withLens ? 0 : 1;
      const rMaj = Math.max(0.01, (blurDegrees(Math.max(dA, dB)) / 2) * pxPerDeg * lens);
      const rMin = Math.max(0.01, (blurDegrees(Math.min(dA, dB)) / 2) * pxPerDeg * lens);
      gl.uniform2f(U("res"), W, H);
      gl.uniform1f(U("rMaj"), rMaj);
      gl.uniform1f(U("rMin"), rMin);
      gl.uniform1f(U("ang"), ((rx.axis || 0) * Math.PI) / 180);
      gl.uniform1f(U("glare"), scene === "night" || scene === "sun" ? (withLens ? 0.25 : 1.0) * (1 + Math.max(dA, dB) * 0.4) : 0);
      gl.uniform1f(U("haze"), rx.reducedContrast ? 0.28 : 0);
      gl.uniform1f(U("tint"), scene === "sun" && withLens ? 0.7 : 0);
      gl.uniform1f(U("mirror"), 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const lensName = useMemo(() => {
    if (!withLens) return "Your eyes today (no correction)";
    const d = result?.products?.design?.name;
    if (scene === "night") return d?.includes("DriveSafe") ? d : `${d ?? "ZEISS lens"} + anti-reflective`;
    if (scene === "sun") return "ZEISS PhotoFusion X (light-adaptive)";
    return d ?? "With ZEISS lenses";
  }, [withLens, scene, result]);

  return (
    <main className="min-h-dvh bg-navy text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 pb-12 pt-4">
        <div className="flex items-center justify-between"><Logo dark />{sid && <Link href={`/result/${sid}`} className="text-sm text-teal-light">← Results</Link>}</div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-light">Feature 01</p>
          <h1 className="font-display text-3xl font-semibold">See Through My Eyes</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {([["night", "🌙 Night drive"], ["sun", "☀️ Sunlight"], ["reading", "📰 Reading"], ["camera", "📷 Live camera"]] as [SceneId, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setScene(id)} className={`rounded-full px-4 py-2 text-sm font-semibold ${scene === id ? "bg-teal-light text-navy" : "bg-white/10"}`}>{label}</button>
          ))}
        </div>
        <div className="relative overflow-hidden rounded-3xl border border-white/10">
          <canvas ref={canvasRef} className="aspect-video w-full" aria-label="Vision simulation" />
          <video ref={videoRef} className="hidden" muted playsInline />
          <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-sm">{lensName}</div>
          {camErr && scene === "camera" && <div className="absolute inset-x-3 bottom-3 rounded-xl bg-amber-pale p-2 text-sm text-navy">Camera unavailable: {camErr}</div>}
        </div>
        <button onClick={() => setWithLens((v) => !v)} className={`btn text-lg ${withLens ? "bg-teal-light text-navy" : "bg-amber text-navy"}`} aria-pressed={withLens}>
          {withLens ? "👁 Show without lenses" : "✨ Show with ZEISS lenses"}
        </button>

        <details className="rounded-2xl bg-white/5 p-4" open={!result}>
          <summary className="cursor-pointer font-semibold">👪 Family mode — simulate anyone&apos;s eyes</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Slider label={`Sphere ${fmtD(rx.sphere)}`} min={-8} max={4} step={0.25} value={rx.sphere} onChange={(v) => setRx({ ...rx, sphere: v })} />
            <Slider label={`Cylinder ${fmtD(rx.cyl)}`} min={-4} max={0} step={0.25} value={rx.cyl} onChange={(v) => setRx({ ...rx, cyl: v })} />
            <Slider label={`Axis ${rx.axis}°`} min={0} max={180} step={5} value={rx.axis} onChange={(v) => setRx({ ...rx, axis: v })} />
            <Slider label={`Reading add ${fmtD(rx.add)}`} min={0} max={3} step={0.25} value={rx.add} onChange={(v) => setRx({ ...rx, add: v })} />
            <Slider label={`Perceptual strength ×${gain}`} min={1} max={5} step={0.5} value={gain} onChange={setGain} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rx.reducedContrast} onChange={(e) => setRx({ ...rx, reducedContrast: e.target.checked })} /> Reduced contrast (cataract-like haze)</label>
          </div>
        </details>
        <p className="text-xs text-slate-400">
          Illustrative simulation from the estimated refraction (blur ≈ pupil × defocus). Haze from reduced contrast is not fixed by glasses — that needs an eye examination.
        </p>
      </div>
    </main>
  );
}

function Slider({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export default function SimulatePage() {
  return (
    <Suspense fallback={null}>
      <SimulateInner />
    </Suspense>
  );
}
