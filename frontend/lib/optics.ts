// Client-side optics helpers (mirrors backend app/domain/optics.py and thickness.py)

export const IRIS_MM = 11.7;
export const CARD_W_MM = 85.6;
export const CARD_H_MM = 53.98;
const ARCMIN5 = (5 / 60) * (Math.PI / 180);

/** Physical letter height (mm) for an optotype of the given logMAR viewed from distance (m). */
export function letterHeightMm(logmar: number, distanceM: number) {
  return distanceM * 1000 * Math.tan(ARCMIN5) * Math.pow(10, logmar);
}

export function snellen(logmar: number) {
  return `6/${Math.round(6 * Math.pow(10, logmar))}`;
}

export const fmtD = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(2)}`;

// ---- lens thickness (same model as backend)
const MIN_CENTER_MINUS: Record<string, number> = { "1.5": 2.0, "1.59": 1.5, "1.6": 1.5, "1.67": 1.4, "1.74": 1.3 };

function sag(power: number, n: number, y: number) {
  if (Math.abs(power) < 1e-6) return 0;
  const r = ((n - 1) / Math.abs(power)) * 1000;
  const yy = Math.min(y, r * 0.999);
  return r - Math.sqrt(r * r - yy * yy);
}

export type Thickness = { center: number; edgeMax: number; edgeMin: number };

export function lensThickness(sphere: number, cyl: number, n: number, a: number, dbl: number, pd: number, b?: number): Thickness {
  const dec = Math.max(0, (a + dbl - pd) / 2);
  const bb = b ?? a * 0.7;
  const yFar = Math.hypot(a / 2, bb / 2) + dec;
  const yNear = Math.max(0, a / 2 - dec);
  const pStrong = Math.abs(sphere + cyl) > Math.abs(sphere) ? sphere + cyl : sphere;
  const pWeak = pStrong === sphere ? sphere + cyl : sphere;
  if (pStrong < 0) {
    const tc = MIN_CENTER_MINUS[String(Math.round(n * 100) / 100)] ?? 1.8;
    return { center: tc, edgeMax: tc + sag(pStrong, n, yFar), edgeMin: pWeak < 0 ? tc + sag(pWeak, n, yNear) : tc };
  }
  const center = 1 + sag(pStrong, n, yFar);
  return { center, edgeMax: 1 + Math.max(0, sag(pStrong, n, yFar) - sag(pStrong, n, yNear)), edgeMin: 1 };
}

/** Retinal blur for defocus D (dioptres) through a pupil (mm) -> angular blur diameter in degrees. */
export function blurDegrees(defocusD: number, pupilMm = 4) {
  return ((pupilMm / 1000) * Math.abs(defocusD) * 180) / Math.PI;
}
