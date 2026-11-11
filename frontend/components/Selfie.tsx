"use client";

import { useRef, useState } from "react";
import type { Tracker } from "@/components/useFaceTracker";
import { api } from "@/lib/api";
import { reflexOffset, selfieLandmarks } from "@/lib/face";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/store";

type Props = { tracker: Tracker; lang: Lang; sessionId: string; token: string; onDone: (m: Record<string, any> | null) => void };

/**
 * Selfie measurements: PD, face shape, eyelid symmetry and the Hirschberg corneal-reflex check.
 * The screen flashes white to create a corneal reflex; the frame is analysed on-device and only numbers are sent.
 */
export function Selfie({ tracker, lang, sessionId, token, onDone }: Props) {
  const [flash, setFlash] = useState(false);
  const [frame, setFrame] = useState<{ url: string; w: number; h: number; lm: ReturnType<typeof selfieLandmarks>; reflex: any } | null>(null);
  const [card, setCard] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const imgBox = useRef<HTMLDivElement>(null);
  const drag = useRef<0 | 1 | null>(null);

  const capture = async () => {
    setErr(null);
    setFlash(true);
    await new Promise((r) => setTimeout(r, 350)); // let the white flash reach the cornea
    const v = tracker.videoRef.current;
    const L = tracker.latest.current;
    setFlash(false);
    if (!v || !L.lm) return setErr("Face not found. Look straight at the camera and try again.");
    const c = document.createElement("canvas");
    c.width = L.w;
    c.height = L.h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, L.w, L.h);
    const lm = selfieLandmarks(L.lm, L.w, L.h);
    const img = ctx.getImageData(0, 0, L.w, L.h);
    const rr = lm.right_iris_diameter_px / 2, lr = lm.left_iris_diameter_px / 2;
    const right = reflexOffset(img, lm.right_iris_center[0], lm.right_iris_center[1], rr);
    const left = reflexOffset(img, lm.left_iris_center[0], lm.left_iris_center[1], lr);
    setFrame({ url: c.toDataURL("image/jpeg", 0.85), w: L.w, h: L.h, lm, reflex: right && left ? { right, left } : null });
    setCard([L.w * 0.35, L.w * 0.65]);
  };

  const submit = async (useCard: boolean) => {
    if (!frame) return;
    setBusy(true);
    try {
      const { _iris_keys, ...landmarks } = frame.lm;
      const m = await api(`/sessions/${sessionId}/selfie`, {
        body: { landmarks, reflex: frame.reflex, card_width_px: useCard && card ? Math.abs(card[1] - card[0]) : null, image_w: frame.w, image_h: frame.h },
        sessionToken: token,
      });
      setFrame(null); // drop the image from memory — it is never uploaded
      onDone(m);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onMove = (clientX: number) => {
    if (drag.current === null || !imgBox.current || !frame || !card) return;
    const r = imgBox.current.getBoundingClientRect();
    // the preview is mirrored: convert screen x to image x
    const x = (1 - (clientX - r.left) / r.width) * frame.w;
    const next: [number, number] = [...card] as [number, number];
    next[drag.current] = Math.max(0, Math.min(frame.w, x));
    setCard(next);
  };

  if (frame) {
    const toPct = (x: number) => `${100 - (100 * x) / frame.w}%`;
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold">Mark the card (optional)</h2>
        <p className="text-slate-600">If you held a bank card, drag the two teal lines to its left and right edges for a more accurate PD. Otherwise skip.</p>
        <div ref={imgBox} className="relative w-full touch-none select-none overflow-hidden rounded-3xl"
          onPointerMove={(e) => onMove(e.clientX)} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={frame.url} alt="Captured selfie (stays on this device)" className="mirror w-full" />
          {card?.map((x, i) => (
            <div key={i} onPointerDown={() => (drag.current = i as 0 | 1)} className="absolute top-0 h-full w-8 -translate-x-1/2 cursor-ew-resize" style={{ left: toPct(x) }} role="slider" aria-label={`Card edge ${i + 1}`} aria-valuenow={Math.round(x)}>
              <div className="mx-auto h-full w-1 bg-teal-light shadow" />
            </div>
          ))}
        </div>
        {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{err}</p>}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => setFrame(null)}>Retake</button>
          <button className="btn-ghost flex-1" disabled={busy} onClick={() => submit(false)}>No card</button>
          <button className="btn-primary flex-1" disabled={busy} onClick={() => submit(true)}>Use card</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold">{t("selfieTitle", lang)}</h2>
      <p className="text-slate-600">{t("selfieBody", lang)}</p>
      <div className="relative w-full overflow-hidden rounded-3xl bg-navy">
        <video ref={(el) => { if (el && tracker.videoRef.current?.srcObject && el !== tracker.videoRef.current) { el.srcObject = tracker.videoRef.current.srcObject; el.play().catch(() => undefined); } }}
          className="mirror aspect-video w-full object-cover" muted playsInline aria-label="Camera preview" />
        <svg viewBox="0 0 100 56" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <ellipse cx="50" cy="27" rx="15" ry="21" fill="none" stroke="#2DD4BF" strokeWidth="0.6" strokeDasharray="2 1.5" />
        </svg>
      </div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={() => onDone(null)}>{t("skip", lang)}</button>
        <button className="btn-primary flex-1" disabled={!tracker.metrics?.present} onClick={capture}>📸 {t("capture", lang)}</button>
      </div>
      {flash && <div className="fixed inset-0 z-50 bg-white" aria-hidden />}
    </div>
  );
}
