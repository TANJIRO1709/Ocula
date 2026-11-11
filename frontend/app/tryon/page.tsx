"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Logo } from "@/components/ui";
import { useFaceTracker } from "@/components/useFaceTracker";
import { useSessionResult } from "@/components/useSessionResult";
import { api } from "@/lib/api";
import { IDX, toPx } from "@/lib/face";
import { fmtD, lensThickness } from "@/lib/optics";

/*
 * AR try-on that shows the REAL lens: frames are anchored to the face with MediaPipe, and each lens is extruded to
 * the edge thickness computed for the customer's power, index and frame size. Turn your head to see the edges.
 */

type Frame = { sku: string; name: string; shape: string; a: number; dbl: number; b: number };
const FALLBACK: Frame[] = [
  { sku: "FR-RECT-52", name: "Classic Rectangle 52-18", shape: "rectangle", a: 52, dbl: 18, b: 34 },
  { sku: "FR-ROUND-47", name: "Round Panto 47-20", shape: "round", a: 47, dbl: 20, b: 42 },
  { sku: "FR-SQ-53", name: "Bold Square 53-17", shape: "square", a: 53, dbl: 17, b: 44 },
  { sku: "FR-AVI-55", name: "Aviator 55-16", shape: "aviator", a: 55, dbl: 16, b: 46 },
  { sku: "FR-CAT-51", name: "Cat-eye 51-18", shape: "cat_eye", a: 51, dbl: 18, b: 38 },
];
const INDICES = [1.5, 1.6, 1.67, 1.74];
const COLORS = ["#1b1b1b", "#6b3f1d", "#0F766E", "#9b1c31", "#c0a062"];

function lensShape(shape: string, a: number, b: number, inset = 0): THREE.Shape {
  const w = a / 2 - inset, h = b / 2 - inset;
  const s = new THREE.Shape();
  if (shape === "round" || shape === "oval") {
    s.absellipse(0, 0, w, h, 0, Math.PI * 2, false, 0);
    return s;
  }
  const r = shape === "square" ? 4 : shape === "rectangle" ? 7 : 10;
  if (shape === "aviator") {
    s.moveTo(-w, h * 0.7);
    s.quadraticCurveTo(-w, h, -w * 0.4, h);
    s.lineTo(w * 0.7, h);
    s.quadraticCurveTo(w, h, w, h * 0.5);
    s.quadraticCurveTo(w, -h * 1.05, 0, -h);
    s.quadraticCurveTo(-w, -h * 0.9, -w, h * 0.7);
    return s;
  }
  if (shape === "cat_eye") {
    s.moveTo(-w, h * 0.3);
    s.quadraticCurveTo(-w, h, -w * 0.2, h * 0.9);
    s.lineTo(w * 0.9, h * 1.15);
    s.quadraticCurveTo(w * 1.05, h * 0.4, w * 0.8, -h * 0.6);
    s.quadraticCurveTo(w * 0.3, -h * 1.05, -w * 0.5, -h * 0.9);
    s.quadraticCurveTo(-w, -h * 0.6, -w, h * 0.3);
    return s;
  }
  const rr = Math.min(r, w, h);
  s.moveTo(-w + rr, -h);
  s.lineTo(w - rr, -h);
  s.quadraticCurveTo(w, -h, w, -h + rr);
  s.lineTo(w, h - rr);
  s.quadraticCurveTo(w, h, w - rr, h);
  s.lineTo(-w + rr, h);
  s.quadraticCurveTo(-w, h, -w, h - rr);
  s.lineTo(-w, -h + rr);
  s.quadraticCurveTo(-w, -h, -w + rr, -h);
  return s;
}

function buildGlasses(f: Frame, edgeMm: number, color: string) {
  const g = new THREE.Group();
  const rim = 2.6;
  const frameMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: "#cfe9ff", transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, side: THREE.DoubleSide });
  const edgeMat = new THREE.MeshStandardMaterial({ color: "#e8f6ff", transparent: true, opacity: 0.85, roughness: 0.2 });
  for (const sx of [-1, 1]) {
    const cx = sx * (f.a / 2 + f.dbl / 2);
    const outer = lensShape(f.shape, f.a + rim * 2, f.b + rim * 2);
    outer.holes.push(new THREE.Path(lensShape(f.shape, f.a, f.b).getPoints(64)));
    const rimGeo = new THREE.ExtrudeGeometry(outer, { depth: 3.5, bevelEnabled: false, curveSegments: 32 });
    const rimMesh = new THREE.Mesh(rimGeo, frameMat);
    rimMesh.position.set(cx, 0, -1.75);
    if (sx === 1) rimMesh.scale.x = -1; // mirror shapes for the second eye
    g.add(rimMesh);
    const lensGeo = new THREE.ExtrudeGeometry(lensShape(f.shape, f.a, f.b), { depth: Math.max(0.6, edgeMm), bevelEnabled: false, curveSegments: 32 });
    const lens = new THREE.Mesh(lensGeo, [lensMat, edgeMat]); // group 0 = faces, group 1 = edge band
    lens.position.set(cx, 0, -Math.max(0.6, edgeMm));
    if (sx === 1) lens.scale.x = -1;
    g.add(lens);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(f.dbl + 2, 2.2, 3), frameMat);
  bridge.position.set(0, f.b * 0.28, 0);
  g.add(bridge);
  return g;
}

function TryOnInner() {
  const sid = useSearchParams().get("sid");
  const { result } = useSessionResult(sid);
  const tracker = useFaceTracker({ facing: "user", track: true, width: 960 });
  const [frames, setFrames] = useState<Frame[]>(FALLBACK);
  const [frame, setFrame] = useState<Frame>(FALLBACK[0]);
  const [index, setIndex] = useState(1.5);
  const [color, setColor] = useState(COLORS[0]);
  const [rx, setRx] = useState({ sphere: -5, cyl: 0, pd: 63 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glassesRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  useEffect(() => {
    tracker.start();
    api<any[]>("/catalog?category=frame").then((items) => {
      const fs = items.filter((i) => i.active).map((i) => ({ sku: i.sku, name: i.name, shape: i.attrs.shape, a: i.attrs.a, dbl: i.attrs.dbl, b: i.attrs.b }));
      if (fs.length) {
        setFrames(fs);
        setFrame(fs[0]);
      }
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!result) return;
    const e = Math.abs(result.eyes.R.se) >= Math.abs(result.eyes.L.se) ? result.eyes.R : result.eyes.L;
    setRx({ sphere: e.sphere, cyl: e.cyl || 0, pd: result.measurements?.pd_mm || 63 });
    const idx = result.products?.index?.lens_index;
    if (idx) setIndex(idx >= 1.74 ? 1.74 : idx >= 1.67 ? 1.67 : idx >= 1.59 ? 1.6 : 1.5);
    if (result.frames?.[0]) setFrame({ sku: result.frames[0].sku, name: result.frames[0].name, shape: result.frames[0].shape, a: result.frames[0].a, dbl: result.frames[0].dbl, b: result.frames[0].b });
  }, [result]);

  const th = useMemo(() => lensThickness(rx.sphere, rx.cyl, index, frame.a, frame.dbl, rx.pd, frame.b), [rx, index, frame]);
  const base = useMemo(() => lensThickness(rx.sphere, rx.cyl, 1.5, frame.a, frame.dbl, rx.pd, frame.b), [rx, frame]);
  const minus = rx.sphere + rx.cyl / 2 < 0;
  const shown = minus ? th.edgeMax : th.center;
  const baseShown = minus ? base.edgeMax : base.center;

  // three.js setup + render loop driven by face landmarks
  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dl = new THREE.DirectionalLight(0xffffff, 1.4);
    dl.position.set(0.3, 0.6, 1);
    scene.add(dl);
    const cam = new THREE.OrthographicCamera(0, 1, 1, 0, -2000, 2000);
    let raf = 0;
    const loop = () => {
      const L = tracker.latest.current;
      const g = glassesRef.current;
      if (L.w && (canvas.width !== L.w || canvas.height !== L.h)) {
        renderer.setSize(L.w, L.h, false);
        cam.right = L.w;
        cam.top = L.h;
        cam.updateProjectionMatrix();
      }
      if (g) {
        if (L.lm && L.metrics?.present) {
          const P = (i: number) => toPx(L.lm![i], L.w, L.h);
          const a = P(IDX.irisA.center), b = P(IDX.irisB.center);
          const ipdPx = Math.hypot(a.x - b.x, a.y - b.y);
          const s = ipdPx / stateRef.current.pd; // px per mm at the face
          const nb = P(IDX.noseBridge);
          g.visible = true;
          g.position.set((a.x + b.x) / 2, L.h - ((a.y + b.y) / 2 * 0.8 + nb.y * 0.2), 0);
          g.scale.setScalar(s);
          const yaw = ((L.metrics.yawDeg ?? 0) * Math.PI) / 180;
          const roll = Math.atan2(b.y - a.y, b.x - a.x);
          g.rotation.set(0, -yaw, -roll);
        } else g.visible = false;
      }
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stateRef = useRef({ pd: rx.pd });
  stateRef.current = { pd: rx.pd };

  // rebuild glasses when frame / thickness / colour changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (glassesRef.current) scene.remove(glassesRef.current);
    const g = buildGlasses(frame, minus ? th.edgeMax : th.edgeMin, color);
    glassesRef.current = g;
    scene.add(g);
  }, [frame, th, color, minus]);

  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pb-12 pt-4">
        <div className="flex items-center justify-between"><Logo />{sid && <Link href={`/result/${sid}`} className="text-sm font-semibold text-teal">← Results</Link>}</div>
        <div>
          <p className="label">Feature 02</p>
          <h1 className="font-display text-3xl font-semibold">Lens-thickness try-on</h1>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="relative overflow-hidden rounded-3xl bg-navy">
            <video ref={tracker.videoRef} className="mirror aspect-video w-full object-cover" muted playsInline aria-label="Camera" />
            <canvas ref={canvasRef} className="mirror pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
            {!tracker.ready && <div className="absolute inset-0 flex items-center justify-center text-white">{tracker.error ?? "Starting camera…"}</div>}
            <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-sm text-white">Turn your head to see the lens edges</div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="card p-4">
              <p className="label">Lens index</p>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {INDICES.map((i) => <button key={i} className={`btn !px-2 ${index === i ? "bg-teal text-white" : "btn-ghost"}`} onClick={() => setIndex(i)}>{i.toFixed(2)}</button>)}
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div><div className="text-xs uppercase tracking-wider text-slate-500">{minus ? "Thickest edge" : "Centre"}</div><div className="font-display text-4xl font-bold">{shown.toFixed(1)} mm</div></div>
                {index > 1.5 && <div className="rounded-full bg-teal-pale px-3 py-1 text-sm font-bold text-teal">{Math.round(100 * (1 - shown / baseShown))}% thinner than 1.50</div>}
              </div>
              <Profile minus={minus} t15={baseShown} t={shown} center={th.center} />
            </div>
            <div className="card p-4">
              <p className="label">Frame</p>
              <select className="input mt-2" value={frame.sku} onChange={(e) => setFrame(frames.find((f) => f.sku === e.target.value) || frames[0])} aria-label="Frame">
                {frames.map((f) => <option key={f.sku} value={f.sku}>{f.name}</option>)}
              </select>
              <div className="mt-3 flex gap-2">{COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-teal" : "border-white"}`} style={{ background: c }} aria-label={`Colour ${c}`} />)}</div>
            </div>
            <div className="card p-4 text-sm">
              <p className="label">Prescription {result ? "(from your check)" : "(demo)"}</p>
              <label className="mt-2 block">Sphere {fmtD(rx.sphere)}<input type="range" min={-10} max={6} step={0.25} value={rx.sphere} onChange={(e) => setRx({ ...rx, sphere: Number(e.target.value) })} className="w-full" /></label>
              <label className="block">PD {rx.pd} mm<input type="range" min={52} max={74} step={0.5} value={rx.pd} onChange={(e) => setRx({ ...rx, pd: Number(e.target.value) })} className="w-full" /></label>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Cross-section of the lens edge vs a 1.50 lens. */
function Profile({ minus, t15, t, center }: { minus: boolean; t15: number; t: number; center: number }) {
  const k = 88 / Math.max(t15, 1);
  const half = (x: number) => (x * k) / 2;
  const path = (edge: number, mid: number) =>
    minus
      ? `M10 ${60 - half(edge)} Q150 ${60 - half(mid)} 290 ${60 - half(edge)} L290 ${60 + half(edge)} Q150 ${60 + half(mid)} 10 ${60 + half(edge)} Z`
      : `M10 ${60 - half(1)} Q150 ${60 - half(edge)} 290 ${60 - half(1)} L290 ${60 + half(1)} Q150 ${60 + half(edge)} 10 ${60 + half(1)} Z`;
  return (
    <svg viewBox="0 0 300 120" className="mt-3 w-full" role="img" aria-label="Lens cross-section compared with a 1.50 lens">
      <path d={path(t15, minus ? 2 : t15)} fill="#e2e8f0" stroke="#94a3b8" />
      <path d={path(t, minus ? center : t)} fill="#2DD4BF" fillOpacity="0.5" stroke="#0F766E" />
      <text x="10" y="118" fontSize="11" fill="#64748b">grey = 1.50 · teal = selected index</text>
    </svg>
  );
}

export default function TryOnPage() {
  return (
    <Suspense fallback={null}>
      <TryOnInner />
    </Suspense>
  );
}
