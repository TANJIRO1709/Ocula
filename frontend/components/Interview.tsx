"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { canListen, listenOnce, speak, stopSpeaking } from "@/lib/speech";
import type { Lang } from "@/lib/store";

type Turn = { role: "agent" | "customer"; text: string };
type Reply = { say: string; done: boolean; urgent: boolean; pending: string | null; progress: { answered: number; total: number }; transcript: Turn[] };

const YESNO = new Set(["red_flags", "wears_glasses", "night_driving", "sports", "family_myopia", "diabetes", "family_glaucoma"]);
const QUICK_NUM: Record<string, string[]> = {
  screen_hours: ["1", "3", "5", "8", "10"],
  outdoor_hours: ["0", "1", "2", "4", "6"],
  glasses_age: ["1", "2", "3", "5"],
};

/** Voice-first interview with the LangGraph agent. Speaks every question; listens or accepts typed / tapped answers. */
export function Interview({ sessionId, token, lang, onDone }: { sessionId: string; token: string; lang: Lang; onDone: (r: { urgent: boolean }) => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [state, setState] = useState<Reply | null>(null);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cancelRef = useRef<() => void>(() => undefined);
  const bottom = useRef<HTMLDivElement>(null);

  const apply = (r: Reply) => {
    setState(r);
    setTurns(r.transcript);
    if (!muted) speak(r.say, lang);
  };

  useEffect(() => {
    api<Reply>(`/interview/${sessionId}/start`, { body: {}, sessionToken: token }).then(apply).catch((e) => setErr(String(e.message || e)));
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [turns, interim]);

  const send = async (answer: string) => {
    if (!answer.trim() || busy) return;
    setBusy(true);
    setText("");
    setInterim("");
    stopSpeaking();
    setTurns((tt) => [...tt, { role: "customer", text: answer }]);
    try {
      apply(await api<Reply>(`/interview/${sessionId}/reply`, { body: { text: answer }, sessionToken: token }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const mic = async () => {
    if (listening) return cancelRef.current();
    stopSpeaking();
    setListening(true);
    const l = listenOnce(lang, setInterim);
    cancelRef.current = l.cancel;
    const heard = await l.promise;
    setListening(false);
    if (heard) send(heard);
  };

  const pending = state?.pending || "";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">🎙️ Quick chat</h2>
        <button className="btn-ghost !min-h-0 !px-3 !py-2 text-sm" onClick={() => { setMuted((m) => !m); stopSpeaking(); }} aria-pressed={muted}>
          {muted ? "🔇 Voice off" : "🔊 Voice on"}
        </button>
      </div>
      {state && <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-teal transition-all" style={{ width: `${(100 * state.progress.answered) / Math.max(1, state.progress.total)}%` }} /></div>}
      <div className="card flex max-h-[50vh] min-h-64 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        {turns.map((tt, i) => (
          <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-3 text-base leading-snug ${tt.role === "agent" ? "self-start bg-teal-pale text-navy" : "self-end bg-navy text-white"}`}>
            {tt.text}
          </div>
        ))}
        {interim && <div className="self-end rounded-2xl bg-slate-200 px-4 py-3 italic text-slate-600">{interim}…</div>}
        <div ref={bottom} />
      </div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{err}</p>}

      {state?.done ? (
        <button className={state.urgent ? "btn bg-red-600 text-white" : "btn-primary"} onClick={() => onDone({ urgent: state.urgent })}>
          {state.urgent ? "See referral advice →" : `${t("next", lang)} →`}
        </button>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {YESNO.has(pending) && (
              <>
                <button className="btn-ghost" disabled={busy} onClick={() => send(t("yes", lang))}>{t("yes", lang)}</button>
                <button className="btn-ghost" disabled={busy} onClick={() => send(t("no", lang))}>{t("no", lang)}</button>
              </>
            )}
            {(QUICK_NUM[pending] || []).map((n) => <button key={n} className="btn-ghost" disabled={busy} onClick={() => send(n)}>{n}</button>)}
          </div>
          <div className="flex gap-2">
            {canListen() && (
              <button onClick={mic} disabled={busy} aria-label={t("speak", lang)}
                className={`btn h-14 w-14 shrink-0 rounded-full !p-0 text-2xl ${listening ? "animate-pulse bg-red-600 text-white" : "bg-teal text-white"}`}>🎤</button>
            )}
            <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("typeAnswer", lang)} aria-label="Answer" />
              <button className="btn-dark" disabled={busy || !text.trim()}>→</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
