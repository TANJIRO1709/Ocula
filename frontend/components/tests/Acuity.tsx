"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Tracker } from "@/components/useFaceTracker";
import { DistanceBadge } from "@/components/ui";
import { t } from "@/lib/i18n";
import { letterHeightMm } from "@/lib/optics";
import { canListen, listenOnce, spokenDirection } from "@/lib/speech";
import type { Lang } from "@/lib/store";
import { ArrowPad, TumblingE, randomDir, type Dir } from "./Optotype";

const LINES = [1.0, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0, -0.1];
const MIN_PX = 7; // below this the E can't be rendered faithfully

export type Trial = {
  logmar: number; nominal_logmar: number; correct: boolean; response_ms: number; distance_m: number | null;
  squint: boolean; lean: boolean; gaze_on_target: boolean;
};

type Props = {
  eye: "R" | "L";
  tracker: Tracker;
  pxPerMm: number;
  lang: Lang;
  skin?: "clinic" | "game";
  viewing: "arm" | "far"; // arm's length self-test, or 2 m with an attendant tapping answers
  onDone: (data: { trials: Trial[]; nominal_distance_m: number; viewing: string; display_limited: boolean }) => void;
};

/**
 * Adaptive tumbling-E acuity. 2 letters per line (3rd as tiebreak). Letter size is recomputed from the live
 * face-to-screen distance, and Honest Eye signals (squint, lean, gaze, response time) are recorded per letter.
 */
export function Acuity({ eye, tracker, pxPerMm, lang, skin = "clinic", viewing, onDone }: Props) {
  const nominal = viewing === "far" ? 2.0 : 0.4;
  const [lineIdx, setLineIdx] = useState(0);
  const [dir, setDir] = useState<Dir>(randomDir());
  const [lineResults, setLineResults] = useState<boolean[]>([]);
  const [score, setScore] = useState(0);
  const [burst, setBurst] = useState(false);
  const [voice, setVoice] = useState(false);
  const trials = useRef<Trial[]>([]);
  const trialStart = useRef({ t: performance.now(), d: null as number | null, maxSquint: 0, minD: Infinity, samples: 0, onTarget: 0 });
  const baselineSquint = useRef<number | null>(null);
  const done = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const liveDistance = () => {
    const d = tracker.latest.current.metrics?.distanceM;
    if (viewing === "far") return d && d > 1.2 ? d : nominal;
    return d && d > 0.15 && d < 1.5 ? d : nominal;
  };
  const [dDisplay, setDDisplay] = useState(nominal);
  const logmar = LINES[lineIdx];
  const sizePx = letterHeightMm(logmar, dDisplay) * pxPerMm;

  // sample Honest-Eye signals during each letter
  useEffect(() => {
    const iv = setInterval(() => {
      const m = tracker.latest.current.metrics;
      const ts = trialStart.current;
      if (!m || !m.present) return;
      if (baselineSquint.current === null) baselineSquint.current = m.squint;
      ts.maxSquint = Math.max(ts.maxSquint, m.squint);
      if (m.distanceM) ts.minD = Math.min(ts.minD, m.distanceM);
      ts.samples += 1;
      if (m.gazeX !== null && m.gazeX > 0.28 && m.gazeX < 0.72) ts.onTarget += 1;
    }, 100);
    return () => clearInterval(iv);
  }, [tracker]);

  const newLetter = useCallback((prev?: Dir) => {
    const d = liveDistance();
    setDDisplay(d);
    setDir(randomDir(prev));
    trialStart.current = { t: performance.now(), d, maxSquint: 0, minD: Infinity, samples: 0, onTarget: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    newLetter();
  }, [newLetter]);

  const finish = useCallback((displayLimited = false) => {
    if (done.current) return;
    done.current = true;
    onDone({ trials: trials.current, nominal_distance_m: nominal, viewing, display_limited: displayLimited });
  }, [nominal, onDone, viewing]);

  const answer = useCallback((a: Dir) => {
    if (done.current) return;
    const ts = trialStart.current;
    const dNow = liveDistance();
    const effective = logmar + Math.log10((ts.d ?? dNow) / dNow); // letter got effectively smaller if they moved back
    const base = baselineSquint.current ?? 0;
    const correct = a === dir;
    trials.current.push({
      logmar: Math.round(effective * 100) / 100, nominal_logmar: logmar, correct,
      response_ms: Math.round(performance.now() - ts.t), distance_m: tracker.latest.current.metrics?.present ? dNow : null,
      squint: ts.maxSquint > 0.45 && ts.maxSquint > base + 0.2,
      lean: ts.d !== null && ts.minD < ts.d * 0.88,
      gaze_on_target: ts.samples === 0 ? true : ts.onTarget / ts.samples > 0.5,
    });
    if (correct && skin === "game") {
      setScore((s) => s + 10);
      setBurst(true);
      setTimeout(() => setBurst(false), 350);
    }
    const res = [...lineResults, correct];
    const nCorrect = res.filter(Boolean).length;
    const passed = (res.length >= 2 && nCorrect >= 2) || (res.length === 3 && nCorrect >= 2);
    const failed = (res.length === 2 && nCorrect === 0) || (res.length === 3 && nCorrect < 2);
    if (passed) {
      const nextIdx = lineIdx + 1;
      const nextSize = nextIdx < LINES.length ? letterHeightMm(LINES[nextIdx], dNow) * pxPerMm : 0;
      if (nextIdx >= LINES.length) return finish();
      if (nextSize < MIN_PX) return finish(true);
      setLineIdx(nextIdx);
      setLineResults([]);
    } else if (failed) {
      return finish();
    } else {
      setLineResults(res);
    }
    newLetter(dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, lineIdx, lineResults, logmar, pxPerMm, skin, finish, newLetter]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
      if (m[e.key]) {
        e.preventDefault();
        answer(m[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer]);

  // voice answers
  useEffect(() => {
    if (!voice || done.current) return;
    const l = listenOnce(lang);
    l.promise.then((txt) => {
      const d = spokenDirection(txt);
      if (d) answer(d);
    });
    return () => l.cancel();
  }, [voice, dir, lineIdx, lineResults.length, lang, answer]);

  const game = skin === "game";
  return (
    <div className={`flex flex-col items-center gap-5 ${game ? "text-white" : ""}`}>
      <div className="flex w-full items-center justify-between gap-2">
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${game ? "bg-white/10" : "bg-navy text-white"}`}>
          {eye === "R" ? "Right eye" : "Left eye"} · line {lineIdx + 1}/{LINES.length}
        </span>
        {game ? <span className="font-display text-xl font-bold text-amber">★ {score}</span> : <DistanceBadge m={tracker.metrics} lang={lang} target={viewing === "arm" ? [0.3, 0.7] : undefined} />}
      </div>
      <p className={`text-center text-lg font-semibold ${game ? "" : "text-navy"}`}>
        {game ? "Which way is the space ship flying?" : t("acuityTitle", lang)}
      </p>
      <div
        className={`relative flex h-64 w-full items-center justify-center overflow-hidden rounded-3xl ${game ? "bg-[radial-gradient(circle_at_50%_40%,#13263D,#050b14)]" : "bg-white border border-slate-200"}`}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const s = touch.current;
          if (!s) return;
          const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) > 30) answer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
          touch.current = null;
        }}
      >
        {game && <Stars />}
        <TumblingE dir={dir} sizePx={Math.max(MIN_PX, sizePx)} color={game ? "#2DD4BF" : "#0B1A2C"} glow={game} />
        {burst && <span className="absolute text-6xl" aria-hidden>💥</span>}
      </div>
      <p className={`text-center text-sm ${game ? "text-slate-300" : "text-slate-500"}`}>{t("acuityHint", lang)}</p>
      <ArrowPad onAnswer={answer} dark={game} />
      {canListen() && (
        <button className={game ? "btn bg-white/10 text-white" : "btn-ghost"} onClick={() => setVoice((v) => !v)} aria-pressed={voice}>
          🎤 {voice ? "Voice answers on" : "Answer by voice"}
        </button>
      )}
    </div>
  );
}

function Stars() {
  return (
    <svg className="absolute inset-0 h-full w-full" aria-hidden>
      {Array.from({ length: 40 }).map((_, i) => (
        <circle key={i} cx={`${(i * 37) % 100}%`} cy={`${(i * 53) % 100}%`} r={(i % 3) * 0.6 + 0.4} fill="#fff" opacity={0.3 + (i % 5) * 0.1} />
      ))}
    </svg>
  );
}
