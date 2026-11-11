"use client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const OUTBOX_KEY = "ocula.outbox";
const STAFF_KEY = "ocula.staff";

export type Staff = { access_token: string; refresh_token: string; user: { id: number; email: string; name: string; role: string } };

export function getStaff(): Staff | null {
  try {
    const raw = localStorage.getItem(STAFF_KEY);
    return raw ? (JSON.parse(raw) as Staff) : null;
  } catch {
    return null;
  }
}
export function setStaff(s: Staff | null) {
  try {
    if (s) localStorage.setItem(STAFF_KEY, JSON.stringify(s));
    else localStorage.removeItem(STAFF_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; sessionToken?: string | null; staff?: boolean; raw?: boolean; form?: boolean };

async function refreshStaff(): Promise<boolean> {
  const s = getStaff();
  if (!s) return false;
  const r = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!r.ok) {
    setStaff(null);
    return false;
  }
  setStaff(await r.json());
  return true;
}

export async function api<T = any>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.sessionToken) headers["X-Session-Token"] = opts.sessionToken;
  const staff = getStaff();
  if (opts.staff !== false && staff) headers["Authorization"] = `Bearer ${staff.access_token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && staff && !retried && !opts.sessionToken) {
    if (await refreshStaff()) return api<T>(path, opts, true);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, msg);
  }
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Fetch a protected file (PDF) and open it in a new tab. */
export async function openFile(path: string, sessionToken?: string | null) {
  const res = await api<Response>(path, { sessionToken, raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}

// ---------------- offline outbox: test results are never lost on a flaky rural connection

type Pending = { path: string; body: unknown; sessionToken: string | null; at: number };

function readOutbox(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeOutbox(items: Pending[]) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function outboxSize() {
  return readOutbox().length;
}

/** POST that queues itself when offline and is replayed when the connection returns. */
export async function postQueued(path: string, body: unknown, sessionToken: string | null) {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
    return await api(path, { body, sessionToken });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    writeOutbox([...readOutbox(), { path, body, sessionToken, at: Date.now() }]);
    return { queued: true };
  }
}

export async function flushOutbox(): Promise<number> {
  const items = readOutbox();
  const remaining: Pending[] = [];
  let sent = 0;
  for (const it of items) {
    try {
      await api(it.path, { body: it.body, sessionToken: it.sessionToken });
      sent++;
    } catch (e) {
      if (!(e instanceof ApiError)) remaining.push(it);
    }
  }
  writeOutbox(remaining);
  return sent;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushOutbox().catch(() => undefined);
  });
}
