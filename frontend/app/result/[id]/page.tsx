"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Results } from "@/components/Results";
import { Logo } from "@/components/ui";
import { api } from "@/lib/api";
import { useScreening } from "@/lib/store";

export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const store = useScreening();
  const token = store.sessionId === id ? store.token : null;
  const [session, setSession] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api(`/sessions/${id}`, { sessionToken: token }).then(setSession).catch((e) => setErr(e.message));
  }, [id, token]);

  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-4">
        <div className="mb-4 flex items-center justify-between">
          <Logo />
          <Link href="/" className="text-sm font-semibold text-teal">New check</Link>
        </div>
        <h1 className="mb-1 font-display text-3xl font-semibold">Your Ocula results</h1>
        {session && <p className="mb-5 text-sm text-slate-500">{session.customer?.name ? `${session.customer.name} · ` : ""}{new Date(session.created_at).toLocaleString()}</p>}
        {err && <p className="rounded-xl bg-red-50 p-4 text-red-800">Could not load results: {err}. Staff can open any result after signing in.</p>}
        {!session && !err && <p className="text-slate-500">Loading…</p>}
        {session && <Results session={session} token={token} />}
      </div>
    </main>
  );
}
