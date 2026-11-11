"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useScreening } from "@/lib/store";

/** Loads a completed session's result (device token or staff login). */
export function useSessionResult(sid: string | null) {
  const store = useScreening();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!sid) return;
    const token = store.sessionId === sid ? store.token : null;
    api(`/sessions/${sid}`, { sessionToken: token })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [sid, store.sessionId, store.token]);
  return { session: data, result: data?.result ?? null, error };
}
