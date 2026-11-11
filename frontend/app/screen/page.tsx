"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Wizard } from "@/components/Wizard";

function ScreenInner() {
  const q = useSearchParams();
  const sid = q.get("sid");
  const token = q.get("token");
  const mode = (q.get("mode") as "adult" | "camp" | "kids" | null) || "adult";
  const back = q.get("back") || undefined;
  return <Wizard mode={mode} presetSession={sid && token ? { id: sid, token } : null} returnTo={back} />;
}

export default function ScreenPage() {
  return (
    <Suspense fallback={null}>
      <ScreenInner />
    </Suspense>
  );
}
