"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Calibration } from "@/components/Calibration";
import { Interview } from "@/components/Interview";
import { Selfie } from "@/components/Selfie";
import { Acuity } from "@/components/tests/Acuity";
import { Amsler, ClockDial, ColorPlates, Contrast, Duochrome, FarPoint, NearPoint } from "@/components/tests/Simple";
import { Banner, Logo, Progress } from "@/components/ui";
import { useFaceTracker } from "@/components/useFaceTracker";
import { api, postQueued } from "@/lib/api";
import { LANGS, t } from "@/lib/i18n";
import { defaultPxPerMm, useScreening, type Lang, type Mode } from "@/lib/store";

type Step = { id: string; label: string; eye?: "R" | "L" };

function stepsFor(mode: Mode, preset: boolean): Step[] {
  const eyes = (id: string, label: string): Step[] => [{ id, label, eye: "R" }, { id, label, eye: "L" }];
  const head: Step[] = preset ? [] : [{ id: "consent", label: "Consent" }]; // preset sessions already have consent
  const core: Step[] = [
    ...head,
    { id: "calibration", label: "Calibration" },
    { id: "interview", label: "Interview" },
    ...eyes("acuity", "Letter test"),
    ...eyes("far_point", "Far point"),
  ];
  if (mode === "kids" || mode === "camp") return [...core, ...(mode === "kids" ? [{ id: "selfie", label: "Photo" }] : []), { id: "finish", label: "Results" }];
  return [
    ...core,
    ...eyes("astigmatism", "Clock dial"),
    ...eyes("duochrome", "Red / green"),
    { id: "near_point", label: "Near point" },
    { id: "contrast", label: "Contrast" },
    { id: "color", label: "Colour" },
    ...eyes("amsler", "Amsler grid"),
    { id: "selfie", label: "Photo" },
    { id: "finish", label: "Results" },
  ];
}

const COVER_FIRST = new Set(["acuity", "far_point", "astigmatism", "duochrome", "amsler"]);

export function Wizard({ mode, presetSession, returnTo }: { mode: Mode; presetSession?: { id: string; token: string } | null; returnTo?: string }) {
  const router = useRouter();
  const store = useScreening();
  const { lang, set } = store;
  const [viewing, setViewing] = useState<"arm" | "far">(mode === "camp" ? "far" : "arm");
  const steps = useMemo(() => stepsFor(mode, !!presetSession), [mode, presetSession]);
  const [idx, setIdx] = useState(0);
  const [covered, setCovered] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const tracker = useFaceTracker({ facing: "user", track: true, width: 1280 });
  const blinkStart = useMemo(() => ({ n: 0, t: 0 }), []);
  const step = steps[Math.min(idx, steps.length - 1)];
  const sessionId = presetSession?.id ?? store.sessionId;
  const token = presetSession?.token ?? store.token;
  const pxPerMm = store.pxPerMm ?? defaultPxPerMm();

  // camp sessions are created by the dashboard; start the camera right away
  useEffect(() => {
    if (presetSession) {
      set({ sessionId: presetSession.id, token: presetSession.token, mode });
      tracker.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetSession?.id]);

  const next = useCallback(() => {
    setCovered(false);
    setIdx((i) => Math.min(i + 1, steps.length - 1));
    window.scrollTo({ top: 0 });
  }, [steps.length]);

  const saveTest = useCallback(async (key: string, data: Record<string, unknown>) => {
    if (!sessionId || !token) return;
    await postQueued(`/sessions/${sessionId}/tests`, { key, data }, token).catch((e) => setErr(String(e.message || e)));
    store.markTest(key);
  }, [sessionId, token, store]);

  const startSession = async () => {
    setErr(null);
    try {
      const r = await api<{ id: string; session_token: string; passport_token: string }>("/sessions", {
        body: { language: lang, mode, consent: true }, staff: false,
      });
      set({ sessionId: r.id, token: r.session_token, passport: r.passport_token, mode, testsDone: [] });
      tracker.start();
      next();
    } catch (e) {
      setErr(`Could not start a session: ${e instanceof Error ? e.message : e}. Is the Ocula API running?`);
    }
  };

  const finish = async () => {
    if (!sessionId || !token) return;
    setFinishing(true);
    setErr(null);
    try {
      if (blinkStart.t) await saveTest("behaviour", { blinks: tracker.blinks.current - blinkStart.n, duration_s: (performance.now() - blinkStart.t) / 1000 });
      await api(`/sessions/${sessionId}/complete`, { body: {}, sessionToken: token });
      tracker.stop();
      router.push(returnTo ? returnTo : `/result/${sessionId}`);
    } catch (e) {
      setErr(`Could not finish: ${e instanceof Error ? e.message : e}. Your answers are saved — try again when online.`);
      setFinishing(false);
    }
  };

  // auto-run finish when reaching the last step
  useEffect(() => {
    if (step.id === "finish" && !finishing) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  const game = mode === "kids";
  const needsCover = step.eye && COVER_FIRST.has(step.id) && !covered;
  const key = step.eye ? `${step.id}_${step.eye}` : step.id;

  let body: React.ReactNode = null;
  if (step.id === "consent") {
    body = (
      <div className="flex flex-col gap-5">
        <h1 className="text-3xl font-semibold">{t("consentTitle", lang)}</h1>
        <div className="flex flex-wrap gap-2">
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => set({ lang: l.code as Lang })} className={`rounded-full px-4 py-2 text-sm font-semibold ${lang === l.code ? "bg-teal text-white" : "bg-white border border-slate-200"}`}>{l.label}</button>
          ))}
        </div>
        <p className="text-lg leading-relaxed text-slate-700">{t("consentBody", lang)}</p>
        {mode === "kids" && <Banner level="info">👪 A parent or guardian should give consent and answer the questions for the child.</Banner>}
        <button className="btn-primary text-lg" onClick={startSession}>{t("agree", lang)}</button>
      </div>
    );
  } else if (urgent) {
    body = (
      <div className="flex flex-col gap-4">
        <Banner level="urgent">
          <h2 className="text-2xl font-bold">Please see an eye doctor today</h2>
          <p className="mt-2">Some of the symptoms you mentioned can be serious and need prompt examination. This is not something glasses can fix. Please don&apos;t wait.</p>
        </Banner>
        <a className="btn bg-red-600 text-white" href="https://www.google.com/maps/search/eye+hospital+near+me" target="_blank" rel="noreferrer">🏥 Find the nearest eye hospital</a>
        <button className="btn-ghost" onClick={() => { setUrgent(false); setIdx(steps.length - 1); }}>Create referral report</button>
      </div>
    );
  } else if (step.id === "calibration") {
    body = <Calibration tracker={tracker} lang={lang} initialPxPerMm={store.pxPerMm}
      onDone={async (c) => {
        set({ pxPerMm: c.px_per_mm, cardCalibrated: c.card_calibrated });
        if (sessionId && token) await postQueued(`/sessions/${sessionId}/calibration`, { ...c, device: { ua: navigator.userAgent, dpr: devicePixelRatio, w: screen.width, h: screen.height } }, token);
        next();
      }} />;
  } else if (step.id === "interview" && sessionId && token) {
    body = <Interview sessionId={sessionId} token={token} lang={lang} onDone={(r) => { if (r.urgent) setUrgent(true); else next(); }} />;
  } else if (needsCover) {
    body = (
      <div className={`flex flex-col items-center gap-6 py-6 text-center ${game ? "text-white" : ""}`}>
        <div className="text-7xl" aria-hidden>{step.eye === "R" ? "🫲" : "🫱"}</div>
        <h2 className="text-3xl font-semibold">{step.eye === "R" ? t("coverLeft", lang) : t("coverRight", lang)}</h2>
        {step.id === "acuity" && step.eye === "R" && mode !== "kids" && (
          <div className="flex gap-2 rounded-full bg-white p-1 text-sm text-navy">
            <button className={`rounded-full px-4 py-2 ${viewing === "arm" ? "bg-navy text-white" : ""}`} onClick={() => setViewing("arm")}>Self test (arm&apos;s length)</button>
            <button className={`rounded-full px-4 py-2 ${viewing === "far" ? "bg-navy text-white" : ""}`} onClick={() => setViewing("far")}>Attendant mode (2 m)</button>
          </div>
        )}
        <button className={game ? "btn-amber text-lg" : "btn-primary text-lg"} onClick={() => { setCovered(true); if (step.id === "acuity" && step.eye === "R") { blinkStart.n = tracker.blinks.current; blinkStart.t = performance.now(); } }}>
          {game ? "🚀 Ready!" : t("next", lang)}
        </button>
      </div>
    );
  } else if (step.id === "acuity" && step.eye) {
    body = <Acuity key={key} eye={step.eye} tracker={tracker} pxPerMm={pxPerMm} lang={lang} skin={game ? "game" : "clinic"} viewing={viewing}
      onDone={async (d) => { await saveTest(key, d); next(); }} />;
  } else if (step.id === "far_point" && step.eye) {
    body = <FarPoint key={key} eye={step.eye} tracker={tracker} pxPerMm={pxPerMm} lang={lang} onDone={async (d) => { await saveTest(key, d); next(); }} />;
  } else if (step.id === "astigmatism" && step.eye) {
    body = <ClockDial key={key} eye={step.eye} lang={lang} onDone={async (d) => { await saveTest(key, d); next(); }} />;
  } else if (step.id === "duochrome" && step.eye) {
    body = <Duochrome key={key} eye={step.eye} lang={lang} onDone={async (d) => { await saveTest(key, d); next(); }} />;
  } else if (step.id === "near_point") {
    body = <NearPoint tracker={tracker} pxPerMm={pxPerMm} lang={lang} onDone={async (d) => { await saveTest("near_point", d); next(); }} />;
  } else if (step.id === "contrast") {
    body = <Contrast pxPerMm={pxPerMm} lang={lang} onDone={async (d) => { await saveTest("contrast", d); next(); }} />;
  } else if (step.id === "color") {
    body = <ColorPlates lang={lang} onDone={async (d) => { await saveTest("color", d); next(); }} />;
  } else if (step.id === "amsler" && step.eye) {
    body = <Amsler key={key} eye={step.eye} lang={lang} onDone={async (d) => { await saveTest(key, d); next(); }} />;
  } else if (step.id === "selfie" && sessionId && token) {
    body = <Selfie tracker={tracker} lang={lang} sessionId={sessionId} token={token} onDone={() => next()} />;
  } else if (step.id === "finish") {
    body = (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="h-14 w-14 animate-spin rounded-full border-4 border-teal border-t-transparent" aria-hidden />
        <h2 className="text-2xl font-semibold">Analysing your results…</h2>
        {err && <button className="btn-primary" onClick={finish}>Try again</button>}
      </div>
    );
  }

  return (
    <main className={`min-h-dvh ${game ? "bg-[#050b14] text-white" : "bg-paper"}`}>
      <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-16 pt-4">
        <div className="flex items-center justify-between">
          <Logo dark={game} />
          {mode === "kids" && <span className="font-display text-lg font-bold text-amber">🚀 Space Rescue</span>}
          {mode === "camp" && <span className="rounded-full bg-navy px-3 py-1 text-sm text-white">School camp</span>}
        </div>
        {step.id !== "consent" && <Progress step={idx + 1} total={steps.length} label={step.label} />}
        {err && <Banner level="soon"><span className="text-sm">{err}</span></Banner>}
        <section className={game && !["consent", "calibration", "interview", "selfie"].includes(step.id) ? "" : game ? "rounded-3xl bg-paper p-4 text-navy" : ""}>
          {body}
        </section>
      </div>
      {/* Hidden camera element that keeps the stream + tracker alive across steps */}
      <video ref={tracker.videoRef} className="pointer-events-none fixed bottom-2 right-2 h-px w-px opacity-0" muted playsInline aria-hidden />
    </main>
  );
}
