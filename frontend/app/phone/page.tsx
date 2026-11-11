"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/ui";
import { api } from "@/lib/api";
import { canListen, listenOnce, speak, stopSpeaking } from "@/lib/speech";

type Msg = { from: "ocula" | "caller" | "sms"; text: string };

/**
 * Missed-call eye check — demo simulator. Runs the exact same backend flow as the Twilio phone line
 * (/telephony/missed-call -> call back -> speech interview -> SMS), but in the browser.
 */
export default function PhonePage() {
  const [phone, setPhone] = useState("+91 98");
  const [lang, setLang] = useState<"hi" | "en">("hi");
  const [sid, setSid] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "ringing" | "call" | "ended">("idle");
  const [listening, setListening] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);

  const missedCall = async () => {
    setState("ringing");
    setMsgs([]);
    await new Promise((r) => setTimeout(r, 1800)); // the call is rejected, then Ocula calls back
    const r = await api<any>("/telephony/simulate", { body: { phone: phone.replace(/\s/g, ""), language: lang }, staff: false });
    setSid(r.session_id);
    setState("call");
    setMsgs([{ from: "ocula", text: r.say }]);
    speak(r.say, lang);
  };

  const reply = async (answer: string) => {
    if (!sid || !answer.trim()) return;
    stopSpeaking();
    setText("");
    setMsgs((m) => [...m, { from: "caller", text: answer }]);
    const r = await api<any>(`/telephony/simulate/${sid}/reply`, { body: { text: answer }, staff: false });
    setMsgs((m) => [...m, { from: "ocula", text: r.say }, ...(r.sms ? [{ from: "sms" as const, text: r.sms }] : [])]);
    await speak(r.say, lang);
    if (r.done) setState("ended");
  };

  const mic = async () => {
    setListening(true);
    const heard = await listenOnce(lang).promise;
    setListening(false);
    if (heard) reply(heard);
  };

  return (
    <main className="min-h-dvh bg-navy text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-12 pt-4 md:flex-row md:items-start">
        <div className="flex-1">
          <Logo dark />
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-teal-light">Feature 05</p>
          <h1 className="font-display text-4xl font-semibold">Missed-call eye check</h1>
          <p className="mt-3 text-slate-300">
            No smartphone needed. Give a missed call, Ocula calls back and runs the voice interview on an ordinary phone line in Hindi or English.
            Urgent symptoms get an immediate SMS to see a doctor; everyone else gets an invitation to the nearest store and a Vision Passport link.
          </p>
          <ol className="mt-6 space-y-2 text-sm text-slate-300">
            <li>1. Caller → missed call (free) → Twilio webhook <code className="text-teal-light">/telephony/missed-call</code></li>
            <li>2. Ocula rejects and calls back → speech <code className="text-teal-light">&lt;Gather&gt;</code></li>
            <li>3. Same LangGraph agent + red-flag triage as the app</li>
            <li>4. SMS with referral or store invitation + passport</li>
          </ol>
        </div>

        <div className="mx-auto w-[340px] shrink-0 rounded-[44px] border-8 border-black bg-[#0d1117] p-4 shadow-2xl">
          <div className="mx-auto mb-3 h-5 w-24 rounded-full bg-black" />
          {state === "idle" && (
            <div className="flex flex-col gap-3 p-2">
              <label className="text-sm text-slate-400">Your phone number</label>
              <input className="rounded-xl bg-white/10 px-4 py-3 text-lg" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone number" />
              <div className="flex gap-2">
                {(["hi", "en"] as const).map((l) => <button key={l} onClick={() => setLang(l)} className={`flex-1 rounded-xl py-2 ${lang === l ? "bg-teal-light text-navy" : "bg-white/10"}`}>{l === "hi" ? "हिन्दी" : "English"}</button>)}
              </div>
              <button className="btn mt-4 bg-green-600 text-white" onClick={missedCall} disabled={phone.replace(/\D/g, "").length < 10}>📞 Give a missed call</button>
            </div>
          )}
          {state === "ringing" && <div className="flex h-96 flex-col items-center justify-center gap-3"><div className="animate-pulse text-6xl">📞</div><p>Missed call sent… Ocula is calling you back</p></div>}
          {(state === "call" || state === "ended") && (
            <div className="flex h-[480px] flex-col">
              <div className="mb-2 text-center text-sm text-slate-400">{state === "call" ? "● Call with Ocula" : "Call ended"}</div>
              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {msgs.map((m, i) => (
                  <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.from === "ocula" ? "bg-teal/80" : m.from === "caller" ? "ml-auto bg-white/15" : "border border-amber bg-amber/20"}`}>
                    {m.from === "sms" && <div className="mb-1 text-xs font-bold text-amber">✉ SMS</div>}
                    {m.text}
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              {state === "call" ? (
                <div className="mt-2 flex gap-2">
                  {canListen() && <button onClick={mic} className={`h-11 w-11 shrink-0 rounded-full ${listening ? "animate-pulse bg-red-600" : "bg-teal"}`} aria-label="Speak">🎤</button>}
                  <form className="flex flex-1 gap-1" onSubmit={(e) => { e.preventDefault(); reply(text); }}>
                    <input className="w-full rounded-full bg-white/10 px-3 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Say or type…" aria-label="Answer" />
                  </form>
                </div>
              ) : (
                <button className="btn mt-2 bg-white/10" onClick={() => { setState("idle"); setSid(null); }}>Call again</button>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
