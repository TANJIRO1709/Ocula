"use client";

// Thin wrappers around the Web Speech API (on-device / browser speech). Works in Chrome on Android & desktop.

const LOCALES: Record<string, string> = { en: "en-IN", hi: "hi-IN", or: "or-IN" };
export const localeFor = (lang: string) => LOCALES[lang] || "en-IN";

export function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, lang: string, rate = 0.95): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak() || !text) return resolve();
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const loc = localeFor(lang);
    u.lang = loc;
    u.rate = rate;
    const voice = synth.getVoices().find((v) => v.lang === loc) || synth.getVoices().find((v) => v.lang.startsWith(loc.slice(0, 2)));
    if (voice) u.voice = voice;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

export function canListen() {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
}

/** Listen once; resolves with the transcript ("" on silence / error). */
export function listenOnce(lang: string, onInterim?: (t: string) => void): { promise: Promise<string>; cancel: () => void } {
  const Ctor: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return { promise: Promise.resolve(""), cancel: () => undefined };
  const rec: Recognition = new Ctor();
  rec.lang = localeFor(lang);
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  let final = "";
  const promise = new Promise<string>((resolve) => {
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      onInterim?.(final || interim);
    };
    rec.onerror = () => resolve(final);
    rec.onend = () => resolve(final);
  });
  try {
    rec.start();
  } catch {
    /* already started */
  }
  return { promise, cancel: () => rec.abort() };
}

/** Map spoken direction words (en / hi / or) to E-test answers. */
export function spokenDirection(t: string): "up" | "down" | "left" | "right" | null {
  const s = t.toLowerCase();
  if (/(up|upar|ऊपर|ଉପର)/.test(s)) return "up";
  if (/(down|neeche|niche|नीचे|ତଳ)/.test(s)) return "down";
  if (/(left|baaye|baen|बाएं|बाएँ|बाये|ବାମ)/.test(s)) return "left";
  if (/(right|daaye|daen|दाएं|दाएँ|दाये|ଡାହାଣ)/.test(s)) return "right";
  return null;
}
