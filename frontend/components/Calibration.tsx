"use client";

import { useState } from "react";
import type { Tracker } from "@/components/useFaceTracker";
import { DistanceBadge } from "@/components/ui";
import { hasFocalCalibration, saveFocalCalibration } from "@/lib/face";
import { t } from "@/lib/i18n";
import { CARD_H_MM, CARD_W_MM } from "@/lib/optics";
import type { Lang } from "@/lib/store";

type Props = {
  tracker: Tracker;
  lang: Lang;
  initialPxPerMm: number | null;
  onDone: (c: { px_per_mm: number; card_calibrated: boolean; distance_tracking: boolean; lighting_ok: boolean | null; brightness: number | null; focal_calibrated: boolean }) => void;
};

/**
 * Step 1: bank-card screen calibration (true mm on screen).
 * Step 2: camera check — face found, lighting OK, optional A4-sheet focal calibration for accurate distance.
 */
export function Calibration({ tracker, lang, initialPxPerMm, onDone }: Props) {
  const [phase, setPhase] = useState<"card" | "camera">("card");
  const [widthPx, setWidthPx] = useState(() => Math.round((initialPxPerMm ?? 96 / 25.4) * CARD_W_MM));
  const [carded, setCarded] = useState(!!initialPxPerMm);
  const [focalDone, setFocalDone] = useState(hasFocalCalibration());
  const pxPerMm = widthPx / CARD_W_MM;
  const m = tracker.metrics;
  const lightingOk = m?.brightness == null ? null : m.brightness > 45 && m.brightness < 215;

  if (phase === "card") {
    return (
      <div className="flex flex-col items-center gap-4">
        <h2 className="text-center text-2xl font-semibold">{t("cardTitle", lang)}</h2>
        <p className="text-center text-slate-600">{t("cardBody", lang)}</p>
        <div className="flex w-full justify-center overflow-hidden py-2">
          <div className="relative rounded-[14px] border-4 border-dashed border-teal bg-teal-pale"
            style={{ width: widthPx, height: (widthPx * CARD_H_MM) / CARD_W_MM }} aria-label="Card outline">
            <div className="absolute left-3 top-3 h-6 w-8 rounded bg-amber/70" />
            <span className="absolute bottom-2 right-3 text-xs font-bold text-teal">85.6 × 54 mm</span>
          </div>
        </div>
        <input type="range" min={150} max={700} value={widthPx} onChange={(e) => { setWidthPx(Number(e.target.value)); setCarded(true); }}
          className="w-full" aria-label="Card width" />
        <div className="flex w-full gap-2">
          <button className="btn-ghost flex-1" onClick={() => { setCarded(false); setPhase("camera"); }}>{t("skip", lang)}</button>
          <button className="btn-primary flex-1" onClick={() => { setCarded(true); setPhase("camera"); }}>{t("next", lang)}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <h2 className="text-center text-2xl font-semibold">{t("distanceTitle", lang)}</h2>
      <div className="relative w-full overflow-hidden rounded-3xl bg-navy">
        <video ref={(el) => { if (el && tracker.videoRef.current && el !== tracker.videoRef.current && tracker.videoRef.current.srcObject) { el.srcObject = tracker.videoRef.current.srcObject; el.play().catch(() => undefined); } }}
          className="mirror aspect-video w-full object-cover" muted playsInline aria-label="Camera preview" />
        <div className="absolute left-3 top-3"><DistanceBadge m={m} lang={lang} /></div>
      </div>
      {tracker.error && <p className="rounded-xl bg-amber-pale p-3 text-sm text-navy">{tracker.error}</p>}
      <ul className="w-full space-y-2 text-sm">
        <li className="flex justify-between rounded-xl bg-white p-3"><span>Screen calibrated with a card</span><b>{carded ? "✓ yes" : "— skipped"}</b></li>
        <li className="flex justify-between rounded-xl bg-white p-3"><span>Face tracking</span><b>{m?.present ? "✓ found" : tracker.ready ? "looking…" : "off"}</b></li>
        <li className="flex justify-between rounded-xl bg-white p-3"><span>Room lighting</span><b>{lightingOk === null ? "—" : lightingOk ? "✓ good" : "⚠ adjust light"}</b></li>
        <li className="flex justify-between rounded-xl bg-white p-3"><span>Distance accuracy (A4 check)</span><b>{focalDone ? "✓ calibrated" : "default"}</b></li>
      </ul>
      <details className="w-full rounded-2xl bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Improve distance accuracy (10 seconds, needs an A4 sheet)</summary>
        <p className="mt-2 text-slate-600">Hold the long edge of an A4 sheet (29.7 cm) from the bridge of your nose straight to the screen, then tap “Set”.</p>
        <button className="btn-dark mt-3" disabled={!m?.present || !m.irisPx}
          onClick={() => { if (m?.irisPx && tracker.latest.current.w) { saveFocalCalibration(m.irisPx, 0.297, tracker.latest.current.w); setFocalDone(true); } }}>
          Set — I&apos;m at 29.7 cm
        </button>
      </details>
      <button className="btn-primary w-full"
        onClick={() => onDone({ px_per_mm: pxPerMm, card_calibrated: carded, distance_tracking: !!m?.present, lighting_ok: lightingOk, brightness: m?.brightness ?? null, focal_calibrated: focalDone })}>
        {t("next", lang)}
      </button>
    </div>
  );
}
