"use client";

import { useEffect, useState } from "react";
import { API_URL, flushOutbox, outboxSize } from "@/lib/api";

export function SwRegister() {
  const [offline, setOffline] = useState(false);
  const [queued, setQueued] = useState(0);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    // Wake the API + engine early (free hosting tiers sleep when idle) while the customer reads the first screen.
    fetch(API_URL.replace(/\/api\/v1\/?$/, "") + "/readyz", { mode: "cors" }).catch(() => undefined);
    const update = () => {
      setOffline(!navigator.onLine);
      setQueued(outboxSize());
    };
    update();
    const onOnline = async () => {
      await flushOutbox().catch(() => undefined);
      update();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", update);
    const iv = setInterval(update, 4000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", update);
      clearInterval(iv);
    };
  }, []);
  if (!offline && !queued) return null;
  return (
    <div className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-full bg-navy px-4 py-2 text-sm text-white shadow-lg" role="status">
      {offline ? "Offline — tests keep working, results will sync" : `Syncing ${queued} saved result(s)…`}
    </div>
  );
}
