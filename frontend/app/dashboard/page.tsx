"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashShell } from "@/components/DashShell";
import { SessionsTable } from "@/components/SessionsTable";
import { Stat } from "@/components/ui";
import { api } from "@/lib/api";

const SYMPTOM_LABEL: Record<string, string> = {
  distance_blur: "Distance blur", near_blur: "Near blur", headache: "Headache", eye_strain: "Eye strain", glare: "Glare",
  dry_eye: "Dry / itchy eyes", light_sensitive: "Light sensitivity", double_vision: "Double vision", squint_rub: "Squints / rubs eyes",
};

export default function Dashboard() {
  return <DashShell>{() => <Overview />}</DashShell>;
}

function Overview() {
  const [a, setA] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [days, setDays] = useState(30);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api(`/analytics/summary?days=${days}`).then(setA).catch((e) => setErr(e.message));
    api<any[]>("/sessions?limit=8").then(setRecent).catch(() => undefined);
  }, [days]);
  if (err) return <p className="rounded-xl bg-red-50 p-4 text-red-800">{err}</p>;
  if (!a) return <p className="text-slate-500">Loading…</p>;
  const tot = a.totals;
  const maxDay = Math.max(1, ...a.per_day.map((d: any) => d.count));
  const maxSym = Math.max(1, ...a.symptoms.map((s: any) => s[1]));
  const maxDist = Math.max(1, ...a.districts.map((s: any) => s[1]));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div><p className="label">Store analytics</p><h1 className="font-display text-3xl font-semibold">Overview</h1></div>
        <select className="input !w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Range">
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Screenings" value={tot.sessions} sub={`${tot.completed} completed`} />
        <Stat label="Referral rate" value={`${Math.round(tot.referral_rate * 100)}%`} sub="urgent + soon" />
        <Stat label="Conversion" value={tot.conversion_rate === null ? "—" : `${Math.round(tot.conversion_rate * 100)}%`} sub="of recorded outcomes" />
        <Stat label="Avg confidence" value={tot.avg_confidence ?? "—"} sub="out of 100" />
        <Stat label="Urgent referrals" value={a.referrals.urgent ?? 0} sub="sent to a doctor" />
      </div>

      <section className="card p-5">
        <p className="label">Screenings per day</p>
        <svg viewBox={`0 0 ${a.per_day.length * 20} 120`} className="mt-3 h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Screenings per day">
          {a.per_day.map((d: any, i: number) => {
            const h = (100 * d.count) / maxDay;
            return <rect key={d.date} x={i * 20 + 3} y={110 - h} width={14} height={Math.max(h, 0.5)} rx={3} fill="#0F766E"><title>{`${d.date}: ${d.count}`}</title></rect>;
          })}
        </svg>
        <div className="flex justify-between text-xs text-slate-400"><span>{a.per_day[0]?.date}</span><span>{a.per_day.at(-1)?.date}</span></div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5">
          <p className="label">Most common complaints</p>
          <div className="mt-3 space-y-2">
            {a.symptoms.length === 0 && <p className="text-sm text-slate-500">No data yet.</p>}
            {a.symptoms.map(([k, v]: [string, number]) => <Bar key={k} label={SYMPTOM_LABEL[k] ?? k} value={v} max={maxSym} />)}
          </div>
        </section>
        <section className="card p-5">
          <p className="label">District demand (rural reach)</p>
          <div className="mt-3 space-y-2">
            {a.districts.map(([k, v]: [string, number]) => <Bar key={k} label={k} value={v} max={maxDist} heat />)}
          </div>
        </section>
        <section className="card p-5">
          <p className="label">Mix</p>
          <h3 className="mt-3 text-sm font-semibold">Recommended designs</h3>
          <div className="mt-2 space-y-1 text-sm">{a.designs.map(([k, v]: [string, number]) => <div key={k} className="flex justify-between"><span>{k}</span><b>{v}</b></div>)}</div>
          <h3 className="mt-4 text-sm font-semibold">Languages · Modes</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {[...a.languages, ...a.modes].map(([k, v]: [string, number]) => <span key={k} className="rounded-full bg-slate-100 px-2 py-1">{k} · {v}</span>)}
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between p-5"><p className="label">Recent screenings</p><Link href="/dashboard/sessions" className="text-sm font-semibold text-teal">View all →</Link></div>
        <SessionsTable rows={recent} />
      </section>
    </div>
  );
}

function Bar({ label, value, max, heat }: { label: string; value: number; max: number; heat?: boolean }) {
  const pct = (100 * value) / max;
  const color = heat ? `hsl(${170 - pct * 1.3}, 70%, ${45 - pct * 0.1}%)` : "#0F766E";
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-36 truncate">{label}</span>
      <div className="h-5 flex-1 rounded bg-slate-100"><div className="h-full rounded" style={{ width: `${pct}%`, background: color }} /></div>
      <b className="w-8 text-right">{value}</b>
    </div>
  );
}
