"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Tracker } from "@/components/useFaceTracker";
import { DistanceBadge } from "@/components/ui";
import { t } from "@/lib/i18n";
import { letterHeightMm } from "@/lib/optics";
import type { Lang } from "@/lib/store";

const WORDS = "the river runs past green fields and small houses near the old temple where children play every evening".split(" ");

function ManualDistance({ onSet, label }: { onSet: (m: number) => void; label: string }) {
  const [cm, setCm] = useState(40);
  return (
    <div className="card flex w-full flex-col gap-2 p-4">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex items-center gap-3">
        <input type="range" min={8} max={100} value={cm} onChange={(e) => setCm(Number(e.target.value))} className="flex-1" aria-label="Distance in cm" />
        <span className="w-16 text-right font-bold">{cm} cm</span>
        <button className="btn-dark" onClick={() => onSet(cm / 100)}>OK</button>
      </div>
    </div>
  );
}

/** Far point: myope moves phone away until text blurs -> sphere ≈ −1/d. */
export function FarPoint({ eye, tracker, pxPerMm, lang, onDone }: { eye: "R" | "L"; tracker: Tracker; pxPerMm: number; lang: Lang; onDone: (d: Record<string, unknown>) => void }) {
  const [manual, setManual] = useState(false);
  const samples = useRef<number[]>([]);
  useEffect(() => {
    const iv = setInterval(() => {
      const d = tracker.latest.current.metrics?.distanceM;
      if (d) samples.current = [...samples.current.slice(-8), d];
    }, 100);
    return () => clearInterval(iv);
  }, [tracker]);
  // text sized for logMAR 0.2 at 1 m (readable at any arm's-length distance by a normal eye)
  const px = letterHeightMm(0.2, 1.0) * pxPerMm * 1.4;
  const text = useMemo(() => WORDS.slice(0, 9).join(" "), []);
  const capture = (blurred: boolean) => {
    const recent = samples.current.slice(-5);
    if (!recent.length) return setManual(true);
    const d = recent.reduce((a, b) => a + b, 0) / recent.length;
    onDone({ distance_m: Math.round(d * 1000) / 1000, blurred, method: "iris" });
  };
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full justify-between"><span className="rounded-full bg-navy px-3 py-1 text-sm font-bold text-white">{eye === "R" ? "Right eye" : "Left eye"}</span><DistanceBadge m={tracker.metrics} lang={lang} /></div>
      <h3 className="text-center text-xl font-semibold">{t("farTitle", lang)}</h3>
      <p className="text-center text-slate-600">{t("farBody", lang)}</p>
      <div className="card flex min-h-40 w-full items-center justify-center p-6"><p style={{ fontSize: Math.max(8, px) }} className="text-center font-semibold leading-snug">{text}</p></div>
      {manual ? (
        <ManualDistance label="Distance tracking unavailable. Measure from eye to screen and enter it:" onSet={(m) => onDone({ distance_m: m, blurred: true, method: "manual" })} />
      ) : (
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <button className="btn-primary flex-1" onClick={() => capture(true)}>{t("blurryNow", lang)}</button>
          <button className="btn-ghost flex-1" onClick={() => capture(false)}>{t("stillClear", lang)}</button>
        </div>
      )}
    </div>
  );
}

/** Near point (binocular): accommodation amplitude -> reading add. */
export function NearPoint({ tracker, pxPerMm, lang, onDone }: { tracker: Tracker; pxPerMm: number; lang: Lang; onDone: (d: Record<string, unknown>) => void }) {
  const [manual, setManual] = useState(false);
  const samples = useRef<number[]>([]);
  useEffect(() => {
    const iv = setInterval(() => {
      const d = tracker.latest.current.metrics?.distanceM;
      if (d) samples.current = [...samples.current.slice(-8), d];
    }, 100);
    return () => clearInterval(iv);
  }, [tracker]);
  const px = 1.2 * pxPerMm; // ~N6 print
  const capture = () => {
    const recent = samples.current.slice(-5);
    if (!recent.length) return setManual(true);
    onDone({ distance_m: Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 1000) / 1000, method: "iris" });
  };
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full justify-between"><span className="rounded-full bg-navy px-3 py-1 text-sm font-bold text-white">{t("bothEyes", lang)}</span><DistanceBadge m={tracker.metrics} lang={lang} /></div>
      <h3 className="text-center text-xl font-semibold">{t("nearTitle", lang)}</h3>
      <p className="text-center text-slate-600">{t("nearBody", lang)}</p>
      <div className="card w-full p-6"><p style={{ fontSize: Math.max(7, px) }} className="text-center leading-snug">{WORDS.join(" ")}</p></div>
      {manual ? (
        <ManualDistance label="Distance tracking unavailable. Measure from eye to screen and enter it:" onSet={(m) => onDone({ distance_m: m, method: "manual" })} />
      ) : (
        <button className="btn-primary w-full" onClick={capture}>{t("blurryNow", lang)}</button>
      )}
    </div>
  );
}

/** Clock dial (astigmatism fan). */
export function ClockDial({ eye, lang, onDone }: { eye: "R" | "L"; lang: Lang; onDone: (d: Record<string, unknown>) => void }) {
  const [hour, setHour] = useState<number | null>(null);
  const lines = Array.from({ length: 12 }, (_, i) => i + 1);
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="rounded-full bg-navy px-3 py-1 text-sm font-bold text-white">{eye === "R" ? "Right eye" : "Left eye"}</span>
      <h3 className="text-center text-xl font-semibold">{t("clockTitle", lang)}</h3>
      <svg viewBox="-120 -120 240 240" className="w-full max-w-sm" role="img" aria-label="Astigmatism clock dial">
        {lines.map((h) => {
          const a = ((h * 30 - 90) * Math.PI) / 180;
          const nx = -Math.sin(a), ny = Math.cos(a);
          return (
            <g key={h} onClick={() => setHour(h)} className="cursor-pointer">
              {[-3, 0, 3].map((o) => (
                <line key={o} x1={Math.cos(a) * 18 + nx * o} y1={Math.sin(a) * 18 + ny * o} x2={Math.cos(a) * 92 + nx * o} y2={Math.sin(a) * 92 + ny * o}
                  stroke={hour === h ? "#0F766E" : "#0B1A2C"} strokeWidth={1.6} />
              ))}
              <text x={Math.cos(a) * 106} y={Math.sin(a) * 106 + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={hour === h ? "#0F766E" : "#0B1A2C"}>{h}</text>
            </g>
          );
        })}
      </svg>
      {hour === null ? (
        <>
          <p className="text-center text-sm text-slate-500">Tap the number next to the darkest lines.</p>
          <button className="btn-ghost w-full" onClick={() => onDone({ darkest_hour: null, severity: "equal" })}>{t("allSame", lang)}</button>
        </>
      ) : (
        <div className="grid w-full grid-cols-3 gap-2">
          <button className="btn-ghost" onClick={() => onDone({ darkest_hour: hour, severity: "slight" })}>A little darker</button>
          <button className="btn-ghost" onClick={() => onDone({ darkest_hour: hour, severity: "moderate" })}>Clearly darker</button>
          <button className="btn-ghost" onClick={() => onDone({ darkest_hour: hour, severity: "strong" })}>Much darker</button>
        </div>
      )}
    </div>
  );
}

/** Red-green duochrome. */
export function Duochrome({ eye, lang, onDone }: { eye: "R" | "L"; lang: Lang; onDone: (d: Record<string, unknown>) => void }) {
  const Rings = () => (
    <svg viewBox="0 0 100 100" className="h-32 w-32" aria-hidden>
      {[40, 30, 20, 10].map((r) => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#000" strokeWidth="3" />)}
      <circle cx="50" cy="50" r="3" fill="#000" />
    </svg>
  );
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="rounded-full bg-navy px-3 py-1 text-sm font-bold text-white">{eye === "R" ? "Right eye" : "Left eye"}</span>
      <h3 className="text-center text-xl font-semibold">{t("duoTitle", lang)}</h3>
      <div className="grid w-full grid-cols-2 overflow-hidden rounded-3xl">
        <div className="flex h-48 items-center justify-center" style={{ background: "#D9381E" }}><Rings /></div>
        <div className="flex h-48 items-center justify-center" style={{ background: "#2E9B4A" }}><Rings /></div>
      </div>
      <div className="grid w-full grid-cols-3 gap-2">
        <button className="btn bg-[#D9381E] text-white" onClick={() => onDone({ answer: "red" })}>{t("red", lang)}</button>
        <button className="btn-ghost" onClick={() => onDone({ answer: "equal" })}>{t("same", lang)}</button>
        <button className="btn bg-[#2E9B4A] text-white" onClick={() => onDone({ answer: "green" })}>{t("green", lang)}</button>
      </div>
    </div>
  );
}

const SLOAN = "CDHKNORSVZ".split("");
const CONTRASTS = [1, 0.5, 0.25, 0.126, 0.063, 0.032, 0.016, 0.008];

/** Pelli-Robson style contrast sensitivity (letter at fixed size, contrast halves each step). */
export function Contrast({ pxPerMm, lang, onDone }: { pxPerMm: number; lang: Lang; onDone: (d: Record<string, unknown>) => void }) {
  const [i, setI] = useState(0);
  const [tries, setTries] = useState(0);
  const [lowest, setLowest] = useState<number | null>(null);
  const [letter, setLetter] = useState(() => SLOAN[Math.floor(Math.random() * SLOAN.length)]);
  const options = useMemo(() => {
    const others = SLOAN.filter((l) => l !== letter).sort(() => Math.random() - 0.5).slice(0, 3);
    return [...others, letter].sort();
  }, [letter]);
  const c = CONTRASTS[i];
  const gray = Math.round(255 - 255 * c * 0.85);
  const choose = (l: string | null) => {
    const ok = l === letter;
    if (ok) {
      const low = c;
      setLowest(low);
      if (i + 1 >= CONTRASTS.length) return onDone({ lowest_contrast: low });
      setI(i + 1);
      setTries(0);
    } else if (tries === 0 && l !== null) {
      setTries(1);
    } else {
      return onDone({ lowest_contrast: lowest });
    }
    setLetter(SLOAN.filter((x) => x !== letter)[Math.floor(Math.random() * (SLOAN.length - 1))]);
  };
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="rounded-full bg-navy px-3 py-1 text-sm font-bold text-white">{t("bothEyes", lang)} · {Math.round(c * 1000) / 10}% contrast</span>
      <h3 className="text-center text-xl font-semibold">{t("contrastTitle", lang)}</h3>
      <div className="flex h-56 w-full items-center justify-center rounded-3xl bg-white">
        <span style={{ fontSize: Math.min(160, 18 * pxPerMm), color: `rgb(${gray},${gray},${gray})` }} className="font-bold">{letter}</span>
      </div>
      <div className="grid w-full grid-cols-5 gap-2">
        {options.map((o) => <button key={o} className="btn-ghost text-xl" onClick={() => choose(o)}>{o}</button>)}
        <button className="btn-ghost text-sm" onClick={() => choose(null)}>{t("cantSee", lang)}</button>
      </div>
    </div>
  );
}

// ---------- pseudo-isochromatic plates (generated, not copied from any published test)
type Plate = { digit: string; control: boolean };
const PLATES: Plate[] = [{ digit: "12", control: true }, { digit: "8", control: false }, { digit: "29", control: false }, { digit: "5", control: false }, { digit: "74", control: false }, { digit: "6", control: false }];

function drawPlate(canvas: HTMLCanvasElement, p: Plate, seed: number) {
  const W = 320;
  canvas.width = W;
  canvas.height = W;
  const ctx = canvas.getContext("2d")!;
  const mask = document.createElement("canvas");
  mask.width = W;
  mask.height = W;
  const m = mask.getContext("2d")!;
  m.fillStyle = "#000";
  m.font = `bold ${p.digit.length > 1 ? 150 : 190}px sans-serif`;
  m.textAlign = "center";
  m.textBaseline = "middle";
  m.fillText(p.digit, W / 2, W / 2 + 8);
  const md = m.getImageData(0, 0, W, W).data;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = "#F4F6F5";
  ctx.fillRect(0, 0, W, W);
  const figure = p.control ? ["#1F4E9A", "#2A5DB0", "#173E7C"] : ["#D9774A", "#E08A55", "#C9673F", "#D88262"];
  const ground = p.control ? ["#9AA3AD", "#A9B1BA", "#8C959F"] : ["#9DA45A", "#8F9B52", "#A8AE63", "#B0A45A"];
  for (let k = 0; k < 1400; k++) {
    const r = 3 + rnd() * 7;
    const x = rnd() * W, y = rnd() * W;
    if ((x - W / 2) ** 2 + (y - W / 2) ** 2 > (W / 2 - r) ** 2) continue;
    const inFig = md[(Math.floor(y) * W + Math.floor(x)) * 4 + 3] > 128;
    const pal = inFig ? figure : ground;
    ctx.fillStyle = pal[Math.floor(rnd() * pal.length)];
    ctx.globalAlpha = 0.75 + rnd() * 0.25; // luminance jitter so brightness is not a cue
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function ColorPlates({ lang, onDone }: { lang: Lang; onDone: (d: Record<string, unknown>) => void }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const ref = useRef<HTMLCanvasElement>(null);
  const plate = PLATES[i];
  const opts = useMemo(() => {
    const pool = ["3", "5", "6", "8", "12", "29", "45", "70", "74", "21"].filter((x) => x !== plate.digit).sort(() => Math.random() - 0.5).slice(0, 3);
    return [...pool, plate.digit].sort();
  }, [plate]);
  useEffect(() => {
    if (ref.current) drawPlate(ref.current, plate, 1234 + i * 97);
  }, [plate, i]);
  const pick = (v: string | null) => {
    const next = [...answers, v === plate.digit];
    if (i + 1 >= PLATES.length) {
      const tested = next.slice(1);
      onDone({ correct: tested.filter(Boolean).length, total: tested.length, control_ok: next[0] });
    } else {
      setAnswers(next);
      setI(i + 1);
    }
  };
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="rounded-full bg-navy px-3 py-1 text-sm font-bold text-white">Plate {i + 1}/{PLATES.length}</span>
      <h3 className="text-center text-xl font-semibold">{t("colorTitle", lang)}</h3>
      <canvas ref={ref} className="w-full max-w-xs rounded-full" aria-label="Colour vision plate" />
      <div className="grid w-full grid-cols-5 gap-2">
        {opts.map((o) => <button key={o} className="btn-ghost text-lg" onClick={() => pick(o)}>{o}</button>)}
        <button className="btn-ghost text-sm" onClick={() => pick(null)}>{t("cantSee", lang)}</button>
      </div>
    </div>
  );
}

/** Amsler grid: macular red flag. */
export function Amsler({ eye, lang, onDone }: { eye: "R" | "L"; lang: Lang; onDone: (d: Record<string, unknown>) => void }) {
  const N = 20;
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const toggle = (k: number) => setMarked((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="rounded-full bg-navy px-3 py-1 text-sm font-bold text-white">{eye === "R" ? "Right eye" : "Left eye"}</span>
      <h3 className="text-center text-lg font-semibold">{t("amslerTitle", lang)}</h3>
      <div className="relative aspect-square w-full max-w-sm bg-white" style={{ display: "grid", gridTemplateColumns: `repeat(${N}, 1fr)` }} role="grid" aria-label="Amsler grid">
        {Array.from({ length: N * N }).map((_, k) => (
          <button key={k} onClick={() => toggle(k)} aria-label={`cell ${k}`}
            className={`border-[0.5px] border-navy ${marked.has(k) ? "bg-amber/70" : ""}`} />
        ))}
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-navy" />
      </div>
      <div className="flex w-full gap-2">
        <button className="btn-ghost flex-1" onClick={() => onDone({ distorted: false, regions: [] })}>{t("allStraight", lang)}</button>
        <button className="btn-dark flex-1" disabled={!marked.size} onClick={() => onDone({ distorted: true, regions: Array.from(marked) })}>{t("done", lang)} ({marked.size})</button>
      </div>
    </div>
  );
}
