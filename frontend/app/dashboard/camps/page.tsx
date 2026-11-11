"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashShell } from "@/components/DashShell";
import { api } from "@/lib/api";

export default function CampsPage() {
  return <DashShell>{() => <Camps />}</DashShell>;
}

function Camps() {
  const [camps, setCamps] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", school: "", teacher: "" });
  const load = () => api<any[]>("/camps").then(setCamps).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <p className="label">Kids &amp; public health</p>
        <h1 className="font-display text-3xl font-semibold">School screening camps</h1>
        <p className="mt-1 text-slate-600">One teacher or volunteer screens a whole class on one tablet. Ocula flags children who need a full eye exam and prints a class report.</p>
        <div className="mt-5 grid gap-3">
          {camps.map((c) => (
            <Link key={c.id} href={`/dashboard/camps/${c.id}`} className="card flex items-center justify-between p-5 hover:shadow-md">
              <div><div className="font-display text-lg font-semibold">{c.school}</div><div className="text-sm text-slate-500">{c.name} · {c.teacher || "—"}</div></div>
              <span className="text-teal">Open →</span>
            </Link>
          ))}
          {camps.length === 0 && <p className="text-slate-500">No camps yet — create one.</p>}
        </div>
      </div>
      <form className="card h-fit space-y-3 p-5" onSubmit={async (e) => {
        e.preventDefault();
        await api("/camps", { body: form });
        setForm({ name: "", school: "", teacher: "" });
        load();
      }}>
        <h2 className="font-display text-xl font-semibold">New camp</h2>
        <input className="input" required placeholder="School name" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} aria-label="School" />
        <input className="input" required placeholder="Camp name (e.g. Term 1, Class 3–5)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Camp name" />
        <input className="input" placeholder="Teacher / volunteer" value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} aria-label="Teacher" />
        <button className="btn-primary w-full">Create camp</button>
      </form>
    </div>
  );
}
