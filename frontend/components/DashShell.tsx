"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui";
import { api, getStaff, setStaff, type Staff } from "@/lib/api";

const NAV = [
  ["/dashboard", "Overview"],
  ["/dashboard/sessions", "Screenings"],
  ["/dashboard/camps", "School camps"],
  ["/dashboard/catalog", "Catalog"],
  ["/phone", "Missed-call demo"],
];

export function DashShell({ children }: { children: (staff: Staff) => React.ReactNode }) {
  const [staff, setS] = useState<Staff | null>(null);
  const [loaded, setLoaded] = useState(false);
  const path = usePathname();
  useEffect(() => {
    setS(getStaff());
    setLoaded(true);
  }, []);
  if (!loaded) return null;
  if (!staff) return <Login onLogin={(s) => { setStaff(s); setS(s); }} />;
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="flex flex-wrap gap-1 text-sm">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className={`rounded-full px-3 py-1.5 font-semibold ${path === href ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/screen" className="btn-primary !min-h-0 !py-2">+ New screening</Link>
            <span className="text-slate-500">{staff.user.name} · {staff.user.role}</span>
            <button className="text-slate-500 underline" onClick={() => { setStaff(null); setS(null); }}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children(staff)}</main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (s: Staff) => void }) {
  const [email, setEmail] = useState("admin@ocula.app");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy p-4">
      <form className="card w-full max-w-sm space-y-4 p-6" onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          onLogin(await api<Staff>("/auth/login", { body: { email, password }, staff: false }));
        } catch (x) {
          setErr(x instanceof Error ? x.message : String(x));
        }
      }}>
        <Logo />
        <h1 className="font-display text-2xl font-semibold">Staff sign in</h1>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" autoComplete="username" />
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Password" autoComplete="current-password" />
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full">Sign in</button>
      </form>
    </main>
  );
}
