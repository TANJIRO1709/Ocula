"use client";

import Link from "next/link";
import { fmtD } from "@/lib/optics";

export function SessionsTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr><th className="p-3">When</th><th className="p-3">Customer</th><th className="p-3">Mode</th><th className="p-3">R / L</th><th className="p-3">Lens</th><th className="p-3">Confidence</th><th className="p-3">Referral</th><th className="p-3">Outcome</th></tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-t hover:bg-slate-50">
              <td className="p-3"><Link href={`/result/${s.id}`} className="font-semibold text-teal underline">{new Date(s.created_at).toLocaleString()}</Link></td>
              <td className="p-3">{s.customer?.name ?? s.customer?.phone ?? "—"}{s.customer?.age ? ` (${s.customer.age})` : ""}</td>
              <td className="p-3">{s.mode}</td>
              <td className="p-3">{s.summary ? `${fmtD(s.summary.R)} / ${fmtD(s.summary.L)}` : s.status}</td>
              <td className="p-3">{s.summary?.design ?? "—"}</td>
              <td className="p-3">{s.confidence ?? "—"}</td>
              <td className="p-3">{s.referral_level ? <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${s.referral_level === "urgent" ? "bg-red-100 text-red-800" : "bg-amber-pale text-amber-dark"}`}>{s.referral_level}</span> : "—"}</td>
              <td className="p-3">{s.purchased === null ? "—" : s.purchased ? "✓ sold" : "no"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td className="p-5 text-slate-500" colSpan={8}>No screenings yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
