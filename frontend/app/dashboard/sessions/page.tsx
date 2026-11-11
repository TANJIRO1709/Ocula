"use client";

import { useEffect, useState } from "react";
import { DashShell } from "@/components/DashShell";
import { SessionsTable } from "@/components/SessionsTable";
import { api } from "@/lib/api";

export default function SessionsPage() {
  return <DashShell>{() => <List />}</DashShell>;
}

function List() {
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  useEffect(() => {
    const q = new URLSearchParams({ limit: "200" });
    if (status) q.set("status", status);
    if (mode) q.set("mode", mode);
    api<any[]>(`/sessions?${q}`).then(setRows).catch(() => undefined);
  }, [status, mode]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="label">History</p><h1 className="font-display text-3xl font-semibold">Screenings</h1></div>
        <div className="flex gap-2">
          <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option><option value="completed">Completed</option><option value="referred">Referred</option><option value="active">In progress</option>
          </select>
          <select className="input !w-auto" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode">
            <option value="">All modes</option><option value="adult">Adult</option><option value="kids">Kids</option><option value="camp">Camp</option><option value="phone">Phone</option>
          </select>
        </div>
      </div>
      <div className="card overflow-hidden"><SessionsTable rows={rows} /></div>
    </div>
  );
}
