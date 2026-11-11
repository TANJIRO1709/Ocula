/** Children: myopia progression (linear regression of spherical equivalent over time) and camp rows. */
import type { Ctx } from "./context.js";

export const FAST_PROGRESSION = -0.5; // D per year

const minSe = (result: any): number | null => {
  try {
    return Math.min(...Object.values(result.eyes).map((e: any) => e.se));
  } catch {
    return null;
  }
};

export async function progressionFor(ctx: Ctx, customerId: number, excludeSession?: string) {
  const rows = await ctx.db.query(
    "SELECT id, completed_at, result FROM screening_sessions WHERE customer_id=$1 AND completed_at IS NOT NULL ORDER BY completed_at",
    [customerId],
  );
  const points = rows
    .filter((r) => r.id !== excludeSession)
    .map((r) => ({ date: new Date(r.completed_at).toISOString(), se: minSe(r.result?.result), session_id: r.id }))
    .filter((p): p is { date: string; se: number; session_id: string } => p.se !== null && Number.isFinite(p.se));
  const out = { points, rate_d_per_year: null as number | null, fast: false };
  if (points.length >= 2) {
    const t0 = new Date(points[0].date).getTime();
    const xs = points.map((p) => (new Date(p.date).getTime() - t0) / (365.25 * 86400e3));
    const ys = points.map((p) => p.se);
    if (xs[xs.length - 1] - xs[0] >= 60 / 365.25) {
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
      const slope = den ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den : 0;
      out.rate_d_per_year = Math.round(slope * 100) / 100;
      out.fast = slope <= FAST_PROGRESSION;
    }
  }
  return out;
}

const fmt = (e: any) => `${e.snellen ?? "—"} / ${e.sphere >= 0 ? "+" : ""}${Number(e.sphere).toFixed(2)}`;

export function studentRow(s: Record<string, any>, name: string | null, schoolClass: string | null) {
  const r = s.result?.result;
  if (!r) return { session_id: s.id, name, school_class: schoolClass, status: "incomplete", needs_followup: null };
  const eyes = r.eyes;
  const reasons: string[] = r.flags.filter((f: any) => ["urgent", "soon"].includes(f.level)).map((f: any) => f.reason);
  const worst = Math.max(...Object.values(eyes).map((e: any) => e.acuity_logmar ?? 0));
  if (worst >= 0.3 && !reasons.length) reasons.push("Reduced vision (worse than 6/12)");
  if (Math.min(...Object.values(eyes).map((e: any) => e.se)) <= -0.5 && !reasons.length) reasons.push("Short-sightedness detected");
  return {
    session_id: s.id, name, school_class: schoolClass, status: s.status, right: fmt(eyes.R), left: fmt(eyes.L),
    needs_followup: reasons.length > 0, reason: reasons.slice(0, 2).join("; "),
  };
}
