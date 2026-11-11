/** Screening sessions: create -> calibration -> interview -> tests -> selfie -> complete -> report. */
import { Router } from "express";
import { z } from "zod";
import { audit, type Ctx, requireUser, sessionWriter } from "../context.js";
import { j } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { progressionFor } from "../kids.js";
import { itemDict, passportUrl, sessionDict, sessionSummary } from "../serialize.js";
import { newSessionId } from "../security.js";

const Mode = z.enum(["adult", "kids", "camp", "phone"]);
const TEST_KEY = /^(acuity|far_point|near_point|astigmatism|duochrome|amsler)(_[RL])?$|^(contrast|color|behaviour)$/;

export async function defaultStoreId(ctx: Ctx): Promise<number | null> {
  return (await ctx.db.one<{ id: number }>("SELECT id FROM stores ORDER BY id LIMIT 1"))?.id ?? null;
}

export async function activeCatalog(ctx: Ctx) {
  return (await ctx.db.query("SELECT * FROM catalog_items WHERE active = true")).map(itemDict);
}

export function sessionRoutes(ctx: Ctx) {
  const r = Router();
  const writer = sessionWriter(ctx);
  const customerOf = (s: Record<string, any>) =>
    s.customer_id ? ctx.db.one("SELECT * FROM customers WHERE id=$1", [s.customer_id]) : Promise.resolve(null);
  const update = (id: string, col: string, value: unknown) =>
    ctx.db.one(`UPDATE screening_sessions SET ${col} = $2::jsonb WHERE id=$1 RETURNING *`, [id, j(value)]);

  r.post("/", async (req, res) => {
    const b = parse(z.object({
      language: z.string().max(8).default("en"), mode: Mode.default("adult"), consent: z.boolean(),
      store_id: z.number().int().nullable().optional(), camp_id: z.number().int().nullable().optional(),
      customer_id: z.number().int().nullable().optional(), passport_token: z.string().nullable().optional(),
      customer: z.object({
        name: z.string().max(200).nullable().optional(), phone: z.string().max(32).nullable().optional(),
        age: z.number().int().min(1).max(110).nullable().optional(), is_child: z.boolean().optional(),
        guardian_phone: z.string().max(32).nullable().optional(), school_class: z.string().max(40).nullable().optional(),
      }).nullable().optional(),
    }), req.body);
    if (!b.consent) throw new HttpError(400, "Consent is required to start a screening");
    const kid = b.mode === "kids" || b.mode === "camp";

    let customer: Record<string, any> | null = null;
    if (b.passport_token) {
      const cid = ctx.tokens.verifyPassport(b.passport_token);
      if (!cid) throw new HttpError(400, "Invalid Vision Passport");
      customer = await ctx.db.one("SELECT * FROM customers WHERE id=$1", [cid]);
    } else if (b.customer_id) {
      customer = await ctx.db.one("SELECT * FROM customers WHERE id=$1", [b.customer_id]);
    } else if (b.customer) {
      const c = b.customer;
      if (c.phone) customer = await ctx.db.one("SELECT * FROM customers WHERE phone=$1 AND name IS NOT DISTINCT FROM $2::text ORDER BY id LIMIT 1", [c.phone, c.name ?? null]);
      if (!customer) {
        customer = await ctx.db.one(
          "INSERT INTO customers (name, phone, age, is_child, guardian_phone, school_class) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
          [c.name ?? null, c.phone ?? null, c.age ?? null, !!c.is_child || kid, c.guardian_phone ?? null, c.school_class ?? null],
        );
      }
    }
    if (!customer) customer = await ctx.db.one("INSERT INTO customers (is_child) VALUES ($1) RETURNING *", [kid]);

    const profile: Record<string, unknown> = { is_child: customer!.is_child };
    if (customer!.age) profile.age = customer!.age;
    const id = newSessionId();
    await ctx.db.query(
      `INSERT INTO screening_sessions (id, store_id, customer_id, camp_id, mode, language, consent_at, profile)
       VALUES ($1,$2,$3,$4,$5,$6,now(),$7::jsonb)`,
      [id, b.store_id ?? (await defaultStoreId(ctx)), customer!.id, b.camp_id ?? null, b.mode, b.language, j(profile)],
    );
    await audit(ctx.db, "device", "session_create", id, { mode: b.mode });
    res.status(201).json({ id, session_token: ctx.tokens.session(id), passport_token: ctx.tokens.signPassport(customer!.id) });
  });

  r.get("/", requireUser, async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit ?? 50) || 50);
    const where: string[] = [];
    const params: unknown[] = [];
    if (req.query.status) { params.push(String(req.query.status)); where.push(`s.status = $${params.length}`); }
    if (req.query.mode) { params.push(String(req.query.mode)); where.push(`s.mode = $${params.length}`); }
    params.push(limit);
    const rows = await ctx.db.query(
      `SELECT s.*, row_to_json(c.*) AS customer_row FROM screening_sessions s LEFT JOIN customers c ON c.id = s.customer_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY s.created_at DESC LIMIT $${params.length}`,
      params,
    );
    res.json(rows.map((s) => ({ ...sessionDict(ctx, s, s.customer_row, false), summary: sessionSummary(s) })));
  });

  r.get("/:id", writer, async (req, res) => {
    const s = req.sessionRow!;
    res.json(sessionDict(ctx, s, await customerOf(s)));
  });

  r.post("/:id/calibration", writer, async (req, res) => {
    const b = parse(z.object({
      px_per_mm: z.number().positive().nullable().optional(), card_calibrated: z.boolean().default(false),
      distance_tracking: z.boolean().default(false), lighting_ok: z.boolean().nullable().optional(),
    }).passthrough(), req.body);
    const s = await update(req.sessionRow!.id, "calibration", { ...req.sessionRow!.calibration, ...b });
    res.json({ ok: true, calibration: s!.calibration });
  });

  r.patch("/:id/profile", writer, async (req, res) => {
    const b = parse(z.record(z.string(), z.unknown()), req.body);
    const s = await update(req.sessionRow!.id, "profile", { ...req.sessionRow!.profile, ...b });
    if (typeof b.age === "number" && s!.customer_id) {
      await ctx.db.query("UPDATE customers SET age = COALESCE(age, $2) WHERE id=$1", [s!.customer_id, b.age]);
    }
    res.json({ ok: true, profile: s!.profile });
  });

  r.post("/:id/tests", writer, async (req, res) => {
    const b = parse(z.object({ key: z.string().regex(TEST_KEY), data: z.record(z.string(), z.unknown()) }), req.body);
    // jsonb_set keeps concurrent writes of different tests from clobbering each other
    const s = await ctx.db.one(
      "UPDATE screening_sessions SET tests = jsonb_set(tests, ARRAY[$2::text], $3::jsonb, true) WHERE id=$1 RETURNING tests",
      [req.sessionRow!.id, b.key, j(b.data)],
    );
    res.json({ ok: true, saved: b.key, tests_done: Object.keys(s!.tests).sort() });
  });

  r.post("/:id/selfie", writer, async (req, res) => {
    const b = parse(z.object({
      landmarks: z.record(z.string(), z.unknown()), card_width_px: z.number().nullable().optional(),
      reflex: z.record(z.string(), z.unknown()).nullable().optional(), frame_bottom_y: z.number().nullable().optional(),
      image_w: z.number().nullable().optional(), image_h: z.number().nullable().optional(),
    }), req.body);
    const m = await ctx.engine.selfie(b);
    await update(req.sessionRow!.id, "measurements", m);
    res.json(m);
  });

  r.post("/:id/complete", writer, async (req, res) => {
    const s = req.sessionRow!;
    const customer = await customerOf(s);
    let progression: number | null = null;
    const profile = { ...s.profile };
    if (customer?.is_child) {
      profile.is_child = true;
      progression = (await progressionFor(ctx, customer.id, s.id)).rate_d_per_year;
    }
    const out = await ctx.engine.compute({
      tests: s.tests, profile, measurements: s.measurements, calibration: s.calibration,
      catalog: await activeCatalog(ctx), progression, language: s.language,
    });
    const r0 = out.result;
    const status = ["urgent", "soon"].includes(r0.referral_level) ? "referred" : "completed";
    const row = await ctx.db.one(
      `UPDATE screening_sessions SET result=$2::jsonb, confidence=$3, referral_level=$4, ruleset_version=$5, status=$6, completed_at=now()
       WHERE id=$1 RETURNING *`,
      [s.id, j(out), r0.confidence.score, r0.referral_level, r0.recommendation.ruleset_version, status],
    );
    await audit(ctx.db, req.user?.email ?? "device", "session_complete", s.id, { referral: r0.referral_level, confidence: r0.confidence.score });
    res.json(sessionDict(ctx, row!, customer));
  });

  r.get("/:id/report.pdf", writer, async (req, res) => {
    const s = req.sessionRow!;
    if (!s.result?.result) throw new HttpError(409, "Session not completed yet");
    const customer = await customerOf(s);
    const pdf = await ctx.engine.sessionReport({ session: sessionDict(ctx, s, customer), passport_url: customer ? passportUrl(ctx, customer.id) : null });
    res.type("application/pdf").setHeader("Content-Disposition", `inline; filename="ocula-report-${s.id.slice(0, 8)}.pdf"`);
    res.send(pdf);
  });

  r.post("/:id/outcome", requireUser, async (req, res) => {
    const b = parse(z.object({ purchased: z.boolean(), sku: z.string().nullable().optional(), notes: z.string().nullable().optional() }), req.body);
    const s = await ctx.db.one("UPDATE screening_sessions SET purchased=$2, purchased_sku=$3, notes=$4 WHERE id=$1 RETURNING id",
      [req.params.id, b.purchased, b.sku ?? null, b.notes ?? null]);
    if (!s) throw new HttpError(404, "Session not found");
    await audit(ctx.db, req.user!.email, "session_outcome", s.id, { purchased: b.purchased });
    res.json({ ok: true });
  });

  return r;
}
