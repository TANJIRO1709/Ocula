"use client";

import Link from "next/link";
import type { FaceMetrics } from "@/lib/face";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/store";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="Ocula home">
      <svg width="30" height="30" viewBox="0 0 512 512" aria-hidden>
        <rect width="512" height="512" rx="112" fill={dark ? "#F4F6F5" : "#0B1A2C"} />
        <circle cx="256" cy="256" r="110" fill="#0F766E" stroke="#2DD4BF" strokeWidth="12" />
        <circle cx="256" cy="256" r="46" fill={dark ? "#F4F6F5" : "#0B1A2C"} />
        <circle cx="282" cy="228" r="16" fill={dark ? "#0B1A2C" : "#F4F6F5"} />
      </svg>
      <span className={`font-display text-xl font-bold tracking-tight ${dark ? "text-white" : "text-navy"}`}>Ocula</span>
    </Link>
  );
}

export function Progress({ step, total, label }: { step: number; total: number; label?: string }) {
  return (
    <div className="w-full">
      {label && <div className="mb-1 flex justify-between text-xs font-semibold text-slate-500"><span>{label}</span><span>{step}/{total}</span></div>}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={step} aria-valuemax={total}>
        <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${(100 * step) / total}%` }} />
      </div>
    </div>
  );
}

export function DistanceBadge({ m, lang, target }: { m: FaceMetrics | null; lang: Lang; target?: [number, number] }) {
  if (!m) return null;
  if (!m.present) return <span className="rounded-full bg-amber-pale px-3 py-1 text-sm font-semibold text-amber-dark">{t("noFace", lang)}</span>;
  const d = m.distanceM ?? 0;
  let hint = "";
  if (target && d < target[0]) hint = t("tooClose", lang);
  if (target && d > target[1]) hint = t("tooFar", lang);
  return (
    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${hint ? "bg-amber-pale text-amber-dark" : "bg-teal-pale text-teal"}`}>
      📏 {Math.round(d * 100)} cm {hint && `· ${hint}`}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold text-navy">{value}</div>
      {sub && <div className="text-sm text-slate-500">{sub}</div>}
    </div>
  );
}

export function Banner({ level, children }: { level: "urgent" | "soon" | "routine" | "info"; children: React.ReactNode }) {
  const cls = {
    urgent: "bg-red-50 border-red-300 text-red-900",
    soon: "bg-amber-pale border-amber text-navy",
    routine: "bg-teal-pale border-teal/40 text-navy",
    info: "bg-white border-slate-200 text-navy",
  }[level];
  return <div className={`rounded-2xl border-2 p-4 ${cls}`} role={level === "urgent" ? "alert" : undefined}>{children}</div>;
}
