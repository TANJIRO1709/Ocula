import type { Ctx } from "./context.js";

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

export function itemDict(c: Record<string, any>) {
  return {
    id: c.id, sku: c.sku, category: c.category, family: c.family, name: c.name, description: c.description,
    lens_index: c.lens_index, tags: c.tags ?? [], attrs: c.attrs ?? {}, price_inr: c.price_inr, active: c.active,
  };
}

export function customerDict(ctx: Ctx, c: Record<string, any> | null) {
  if (!c) return null;
  return {
    id: c.id, name: c.name, phone: c.phone, age: c.age, is_child: c.is_child, school_class: c.school_class,
    passport_token: ctx.tokens.signPassport(c.id),
  };
}

export function passportUrl(ctx: Ctx, customerId: number) {
  return `${ctx.cfg.PUBLIC_BASE_URL.replace(/\/$/, "")}/passport/${ctx.tokens.signPassport(customerId)}`;
}

export function sessionDict(ctx: Ctx, s: Record<string, any>, customer: Record<string, any> | null, full = true) {
  const base: Record<string, any> = {
    id: s.id, mode: s.mode, language: s.language, status: s.status, store_id: s.store_id, camp_id: s.camp_id,
    created_at: iso(s.created_at), completed_at: iso(s.completed_at), confidence: s.confidence,
    referral_level: s.referral_level, ruleset_version: s.ruleset_version, purchased: s.purchased,
    purchased_sku: s.purchased_sku, customer: customerDict(ctx, customer),
  };
  if (full) {
    const iv = s.interview ?? {};
    Object.assign(base, {
      calibration: s.calibration ?? {}, profile: s.profile ?? {}, tests: s.tests ?? {}, measurements: s.measurements ?? {},
      result: s.result?.result ?? null, explanation: s.result?.explanation ?? null,
      interview: { transcript: iv.transcript ?? [], done: !!iv.done, urgent: !!iv.urgent, say: iv.say ?? null },
    });
  }
  return base;
}

export function sessionSummary(s: Record<string, any>) {
  const r = s.result?.result;
  if (!r) return null;
  return {
    R: r.eyes.R.sphere, L: r.eyes.L.sphere, add: r.add ?? null,
    design: r.products?.design?.name ?? null, symptoms: s.profile?.symptoms ?? [],
  };
}

/** Public interview view returned to devices (the full agent state stays server-side). */
export function interviewPublic(e: Record<string, any>) {
  const { state: _state, ...pub } = e;
  return pub;
}
