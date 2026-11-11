"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Logo } from "@/components/ui";
import { API_URL, api } from "@/lib/api";
import { fmtD } from "@/lib/optics";
import { useScreening } from "@/lib/store";

export default function PassportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const store = useScreening();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api(`/passport/${token}`).then(setData).catch((e) => setErr(e.message));
  }, [token]);

  const newCheck = async () => {
    const mode = data?.customer?.is_child ? "kids" : "adult";
    const r = await api<any>("/sessions", { body: { language: store.lang, mode, consent: true, passport_token: token }, staff: false });
    store.set({ sessionId: r.id, token: r.session_token, passport: r.passport_token, testsDone: [] });
    router.push(`/screen?sid=${r.id}&token=${encodeURIComponent(r.session_token)}&mode=${mode}`);
  };

  const prog = data?.progression;
  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-4">
        <div className="mb-4 flex items-center justify-between"><Logo /><Link href="/" className="text-sm font-semibold text-teal">Home</Link></div>
        <div className="card flex items-center gap-4 overflow-hidden bg-navy p-5 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${API_URL}/passport/${token}/qr.png`} alt="Passport QR" className="h-24 w-24 rounded-xl bg-white p-1" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-light">Vision Passport</p>
            <h1 className="font-display text-2xl font-semibold">{data?.customer?.name || data?.customer?.first_name || "Ocula customer"}</h1>
            <p className="text-sm text-slate-300">{data ? `${data.history.length} visit(s)` : ""}</p>
          </div>
        </div>
        {err && <p className="mt-4 rounded-xl bg-red-50 p-4 text-red-800">{err}</p>}

        {prog?.points?.length >= 2 && (
          <section className="card mt-4 p-5">
            <p className="label">Myopia progression</p>
            <Trend points={prog.points} />
            <p className={`mt-2 text-sm font-semibold ${prog.fast ? "text-amber-dark" : "text-teal"}`}>
              {prog.rate_d_per_year !== null ? `${fmtD(prog.rate_d_per_year)} D per year` : "Need ~2 months between visits for a rate"}
              {prog.fast && " — fast progression: myopia management and an optometrist visit are recommended."}
            </p>
          </section>
        )}

        <section className="mt-4 flex flex-col gap-3">
          {data?.history.map((h: any) => (
            <div key={h.session_id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{new Date(h.date).toLocaleDateString()} · {h.store ?? "Ocula"}</div>
                {h.referral_level && <span className="rounded-full bg-amber-pale px-2 py-0.5 text-xs font-bold uppercase text-amber-dark">{h.referral_level}</span>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>R {fmtD(h.R.sphere)}{h.R.cyl ? ` / ${fmtD(h.R.cyl)}×${h.R.axis}` : ""}</div>
                <div>L {fmtD(h.L.sphere)}{h.L.cyl ? ` / ${fmtD(h.L.cyl)}×${h.L.axis}` : ""}</div>
                <div>Add {h.add ? fmtD(h.add) : "—"}</div>
                <div>PD {h.pd_mm ?? "—"}</div>
              </div>
              {h.design && <div className="mt-1 text-sm text-slate-500">{h.design}</div>}
            </div>
          ))}
        </section>
        <button className="btn-primary mt-6 w-full" onClick={newCheck}>Start a new check for this passport</button>
      </div>
    </main>
  );
}

function Trend({ points }: { points: { date: string; se: number }[] }) {
  const W = 600, H = 160, pad = 30;
  const xs = points.map((p) => new Date(p.date).getTime());
  const ys = points.map((p) => p.se);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys, 0) - 0.25, Math.max(...ys, 0) + 0.25];
  const X = (x: number) => pad + ((x - x0) / Math.max(1, x1 - x0)) * (W - 2 * pad);
  const Y = (y: number) => pad / 2 + ((y1 - y) / (y1 - y0)) * (H - pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Spherical equivalent over time">
      <line x1={pad} x2={W - pad} y1={Y(0)} y2={Y(0)} stroke="#cbd5e1" strokeDasharray="4 4" />
      <polyline fill="none" stroke="#0F766E" strokeWidth="3" points={points.map((p, i) => `${X(xs[i])},${Y(p.se)}`).join(" ")} />
      {points.map((p, i) => <g key={i}><circle cx={X(xs[i])} cy={Y(p.se)} r="5" fill="#0F766E" /><text x={X(xs[i])} y={Y(p.se) - 10} textAnchor="middle" fontSize="12" fill="#0B1A2C">{fmtD(p.se)}</text></g>)}
    </svg>
  );
}
