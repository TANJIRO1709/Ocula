"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/ui";
import { LANGS, t } from "@/lib/i18n";
import { useScreening, type Lang } from "@/lib/store";

const FEATURES = [
  { href: "/simulate", title: "See Through My Eyes", body: "Your world, blurred at your power — then sharp with a ZEISS lens.", tag: "01" },
  { href: "/tryon", title: "Lens-thickness try-on", body: "AR frames that show how thick your lens edge really is.", tag: "02" },
  { href: "/screen", title: "Honest Eye", body: "The camera notices squinting and guessing during tests.", tag: "03" },
  { href: "/kids", title: "Kids mode", body: "The eye test becomes a space game. Teachers can screen a class.", tag: "04" },
  { href: "/phone", title: "Missed-call check", body: "No smartphone? A missed call starts a voice screening.", tag: "05" },
];

export default function Home() {
  const router = useRouter();
  const { lang, set, reset } = useScreening();
  const [code, setCode] = useState("");

  const begin = (mode: "adult" | "kids") => {
    reset();
    set({ mode });
    router.push(mode === "kids" ? "/kids" : "/screen");
  };

  return (
    <main className="min-h-dvh bg-navy text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo dark />
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/dashboard" className="rounded-full border border-white/20 px-4 py-2 hover:bg-white/10">Staff</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-12 pt-6 md:grid-cols-[1.2fr_1fr] md:pt-16">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-light">ZEISS India Hack · No-device vision intelligence</p>
          <h1 className="mt-4 font-display text-6xl font-bold leading-none tracking-tight md:text-8xl">Ocula</h1>
          <p className="mt-4 font-display text-2xl font-medium md:text-3xl">An eye clinic in every phone.</p>
          <p className="mt-4 max-w-xl text-lg text-slate-300">
            A 7-minute voice-guided vision screening with calibrated on-screen tests, a selfie for PD and frame fit, and an explainable lens
            recommendation — with a doctor referral whenever something looks wrong.
          </p>

          <div className="mt-8 flex flex-wrap gap-2" role="radiogroup" aria-label="Language">
            {LANGS.map((l) => (
              <button key={l.code} role="radio" aria-checked={lang === l.code} onClick={() => set({ lang: l.code as Lang })}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${lang === l.code ? "bg-teal-light text-navy" : "bg-white/10 hover:bg-white/20"}`}>
                {l.label}
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn-primary text-lg" onClick={() => begin("adult")}>{t("start", lang)} →</button>
            <button className="btn bg-white/10 text-white hover:bg-white/20" onClick={() => begin("kids")}>🚀 Kids mode</button>
          </div>

          <form className="mt-6 flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) router.push(`/passport/${encodeURIComponent(code.trim().split("/").pop() || "")}`); }}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Vision Passport code or link"
              className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-slate-400" aria-label="Vision Passport code" />
            <button className="btn bg-white text-navy">Open</button>
          </form>
        </div>

        <div className="relative hidden md:block" aria-hidden>
          <svg viewBox="0 0 600 600" className="w-full">
            <circle cx="300" cy="300" r="290" fill="none" stroke="#2DD4BF" strokeOpacity=".15" strokeWidth="2" />
            <circle cx="300" cy="300" r="230" fill="none" stroke="#2DD4BF" strokeOpacity=".28" strokeWidth="2" />
            <circle cx="300" cy="300" r="172" fill="none" stroke="#2DD4BF" strokeOpacity=".45" strokeWidth="3" />
            <circle cx="300" cy="300" r="120" fill="#0F766E" stroke="#2DD4BF" strokeWidth="4" />
            <circle cx="300" cy="300" r="52" fill="#0B1A2C" />
            <circle cx="332" cy="266" r="16" fill="#F4F6F5" />
          </svg>
        </div>
      </section>

      <section className="bg-paper text-navy">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <p className="label">Beyond the brief</p>
          <h2 className="mt-2 font-display text-4xl font-semibold">Five features no one else has</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {FEATURES.map((f) => (
              <Link key={f.tag} href={f.href} className="card flex flex-col gap-2 border-t-4 border-t-teal p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                <span className="text-sm font-bold text-teal">{f.tag}</span>
                <span className="font-display text-xl font-semibold leading-tight">{f.title}</span>
                <span className="text-sm text-slate-600">{f.body}</span>
              </Link>
            ))}
          </div>
          <p className="mt-10 text-sm text-slate-500">
            Ocula is a screening and retail-assist tool. Results are an estimated vision profile, not a prescription or diagnosis. Team Container_Service.
          </p>
        </div>
      </section>
    </main>
  );
}
