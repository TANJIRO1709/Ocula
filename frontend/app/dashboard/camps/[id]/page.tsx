"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { DashShell } from "@/components/DashShell";
import { Stat } from "@/components/ui";
import { api, openFile } from "@/lib/api";
import { useScreening } from "@/lib/store";

export default function CampPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DashShell>{() => <Camp id={id} />}</DashShell>;
}

function Camp({ id }: { id: string }) {
  const router = useRouter();
  const lang = useScreening((s) => s.lang);
  const [camp, setCamp] = useState<any>(null);
  const [form, setForm] = useState({ name: "", age: 10, school_class: "", guardian_phone: "" });
  useEffect(() => {
    api(`/camps/${id}`).then(setCamp).catch(() => undefined);
  }, [id]);

  const screenNext = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api<any>(`/camps/${id}/students`, { body: { ...form, guardian_phone: form.guardian_phone || null, school_class: form.school_class || null, language: lang } });
    router.push(`/screen?sid=${r.session_id}&token=${encodeURIComponent(r.session_token)}&mode=camp&back=${encodeURIComponent(`/dashboard/camps/${id}`)}`);
  };

  if (!camp) return <p className="text-slate-500">Loading…</p>;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><Link href="/dashboard/camps" className="text-sm text-teal">← Camps</Link><h1 className="font-display text-3xl font-semibold">{camp.school}</h1><p className="text-slate-500">{camp.name} · {camp.teacher}</p></div>
        <button className="btn-dark" onClick={() => openFile(`/camps/${id}/report.pdf`)}>📄 Class report (PDF)</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Screened" value={camp.stats.screened} />
        <Stat label="Need follow-up" value={camp.stats.followup} sub={camp.stats.screened ? `${Math.round((100 * camp.stats.followup) / camp.stats.screened)}% of class` : undefined} />
        <Stat label="Incomplete" value={camp.stats.incomplete} />
      </div>
      <form className="card grid gap-3 p-5 sm:grid-cols-5" onSubmit={screenNext}>
        <input className="input sm:col-span-2" required placeholder="Student name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Student name" />
        <input className="input" type="number" min={3} max={18} value={form.age} onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} aria-label="Age" />
        <input className="input" placeholder="Class (e.g. 5B)" value={form.school_class} onChange={(e) => setForm({ ...form, school_class: e.target.value })} aria-label="Class" />
        <button className="btn-primary">Screen next student →</button>
        <input className="input sm:col-span-2" placeholder="Parent phone (optional, for results SMS)" value={form.guardian_phone} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} aria-label="Parent phone" />
      </form>
      <section className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-3">Student</th><th className="p-3">Class</th><th className="p-3">Right</th><th className="p-3">Left</th><th className="p-3">Follow-up</th><th className="p-3">Reason</th></tr></thead>
          <tbody>
            {camp.students.map((s: any) => (
              <tr key={s.session_id} className={`border-t ${s.needs_followup ? "bg-amber-pale/60" : ""}`}>
                <td className="p-3"><Link className="font-semibold text-teal underline" href={`/result/${s.session_id}`}>{s.name}</Link></td>
                <td className="p-3">{s.school_class ?? "—"}</td>
                <td className="p-3">{s.right ?? "—"}</td>
                <td className="p-3">{s.left ?? "—"}</td>
                <td className="p-3 font-bold">{s.needs_followup === null ? "incomplete" : s.needs_followup ? "YES" : "no"}</td>
                <td className="p-3 text-slate-600">{s.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
