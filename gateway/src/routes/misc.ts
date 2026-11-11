/** Lens thickness, Vision Passport, catalog and analytics. */
import { Router } from "express";
import { z } from "zod";
import { audit, type Ctx, requireRole, requireUser } from "../context.js";
import { j } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { progressionFor } from "../kids.js";
import { customerDict, itemDict, passportUrl } from "../serialize.js";

const CatalogIn = z.object({
  sku: z.string().min(1).max(64), category: z.enum(["design", "material", "coating", "feature", "frame"]), family: z.string(),
  name: z.string().min(1), description: z.string().default(""), lens_index: z.number().nullable().optional(),
  tags: z.array(z.string()).default([]), attrs: z.record(z.string(), z.unknown()).default({}),
  price_inr: z.number().nullable().optional(), active: z.boolean().default(true),
});

const countBy = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export function miscRoutes(ctx: Ctx) {
  const r = Router();

  // ---------------- lens
  r.post("/lens/thickness", async (req, res) => {
    const b = parse(z.object({
      sphere: z.number().min(-20).max(20), cyl: z.number().min(-8).max(0).default(0), index: z.number().min(1.4).max(1.9).default(1.5),
      frame_a: z.number().min(30).max(75).default(52), frame_dbl: z.number().min(10).max(30).default(18),
      frame_b: z.number().nullable().optional(), pd_mm: z.number().min(40).max(80).default(63),
    }), req.body);
    res.json(await ctx.engine.thickness(b));
  });

  // ---------------- passport
  const passportCustomer = async (token: string) => {
    const cid = ctx.tokens.verifyPassport(token);
    const c = cid ? await ctx.db.one("SELECT * FROM customers WHERE id=$1", [cid]) : null;
    if (!c) throw new HttpError(404, "Passport not found");
    return c;
  };

  r.get("/passport/:token", async (req, res) => {
    const c = await passportCustomer(String(req.params.token));
    const rows = await ctx.db.query(
      `SELECT s.*, st.name AS store_name FROM screening_sessions s LEFT JOIN stores st ON st.id = s.store_id
       WHERE s.customer_id=$1 AND s.completed_at IS NOT NULL ORDER BY s.completed_at DESC`, [c.id]);
    const pick = (e: any) => ({ sphere: e?.sphere ?? null, cyl: e?.cyl ?? null, axis: e?.axis ?? null, snellen: e?.snellen ?? null });
    const history = rows.map((s) => {
      const res0 = s.result?.result ?? {};
      return {
        session_id: s.id, date: new Date(s.completed_at).toISOString(), store: s.store_name, mode: s.mode,
        referral_level: s.referral_level, confidence: s.confidence, R: pick(res0.eyes?.R), L: pick(res0.eyes?.L),
        add: res0.add ?? null, pd_mm: res0.measurements?.pd_mm ?? null, design: res0.products?.design?.name ?? null,
      };
    });
    const out: Record<string, unknown> = {
      customer: req.user ? customerDict(ctx, c) : { first_name: (c.name ?? "").split(" ")[0] || null, is_child: c.is_child, age: c.age },
      history, passport_url: passportUrl(ctx, c.id),
    };
    if (c.is_child) out.progression = await progressionFor(ctx, c.id);
    res.json(out);
  });

  r.get("/passport/:token/qr.png", async (req, res) => {
    const c = await passportCustomer(String(req.params.token));
    const png = await ctx.engine.qr(passportUrl(ctx, c.id));
    res.type("image/png").setHeader("Cache-Control", "public, max-age=86400");
    res.send(png);
  });

  // ---------------- catalog
  r.get("/catalog", async (req, res) => {
    const params: unknown[] = [];
    let where = "";
    if (req.query.category) {
      params.push(String(req.query.category));
      where = "WHERE category = $1";
    }
    res.json((await ctx.db.query(`SELECT * FROM catalog_items ${where} ORDER BY category, sku`, params)).map(itemDict));
  });

  r.post("/catalog", requireRole("manager"), async (req, res) => {
    const b = parse(CatalogIn, req.body);
    if (await ctx.db.one("SELECT id FROM catalog_items WHERE sku=$1", [b.sku])) throw new HttpError(409, "SKU exists");
    const c = await ctx.db.one(
      `INSERT INTO catalog_items (sku, category, family, name, description, lens_index, tags, attrs, price_inr, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10) RETURNING *`,
      [b.sku, b.category, b.family, b.name, b.description, b.lens_index ?? null, j(b.tags), j(b.attrs), b.price_inr ?? null, b.active]);
    await audit(ctx.db, req.user!.email, "catalog_create", b.sku);
    res.status(201).json(itemDict(c!));
  });

  r.put("/catalog/:sku", requireRole("manager"), async (req, res) => {
    const b = parse(CatalogIn, req.body);
    const c = await ctx.db.one(
      `UPDATE catalog_items SET category=$2, family=$3, name=$4, description=$5, lens_index=$6, tags=$7::jsonb, attrs=$8::jsonb,
         price_inr=$9, active=$10 WHERE sku=$1 RETURNING *`,
      [req.params.sku, b.category, b.family, b.name, b.description, b.lens_index ?? null, j(b.tags), j(b.attrs), b.price_inr ?? null, b.active]);
    if (!c) throw new HttpError(404, "Not found");
    await audit(ctx.db, req.user!.email, "catalog_update", String(req.params.sku));
    res.json(itemDict(c));
  });

  r.delete("/catalog/:sku", requireRole("manager"), async (req, res) => {
    // soft delete keeps old reports resolvable
    const c = await ctx.db.one("UPDATE catalog_items SET active=false WHERE sku=$1 RETURNING id", [req.params.sku]);
    if (!c) throw new HttpError(404, "Not found");
    await audit(ctx.db, req.user!.email, "catalog_delete", String(req.params.sku));
    res.status(204).end();
  });

  // ---------------- analytics
  r.get("/analytics/summary", requireUser, async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days ?? 30) || 30));
    const rows = await ctx.db.query(
      `SELECT s.created_at, s.completed_at, s.referral_level, s.purchased, s.confidence, s.language, s.mode, s.profile,
              s.result -> 'result' -> 'products' -> 'design' ->> 'name' AS design, st.district
       FROM screening_sessions s LEFT JOIN stores st ON st.id = s.store_id
       WHERE s.created_at >= now() - ($1::int * interval '1 day')`, [days]);
    const completed = rows.filter((s) => s.completed_at);
    const dayKey = (d: unknown) => new Date(d as string).toISOString().slice(0, 10);
    const perDay = new Map(countBy(rows, (s) => dayKey(s.created_at)));
    const today = new Date();
    const dayList = Array.from({ length: days }, (_, i) => {
      const d = new Date(today.getTime() - (days - 1 - i) * 86400e3);
      return d.toISOString().slice(0, 10);
    });
    const referrals = Object.fromEntries(countBy(completed, (s) => s.referral_level ?? "none"));
    const decided = completed.filter((s) => s.purchased !== null);
    const conf = completed.map((s) => s.confidence).filter((x): x is number => typeof x === "number");
    const refCount = (referrals.urgent ?? 0) + (referrals.soon ?? 0);
    res.json({
      range_days: days,
      totals: {
        sessions: rows.length, completed: completed.length,
        referral_rate: completed.length ? Math.round((1000 * refCount) / completed.length) / 1000 : 0,
        conversion_rate: decided.length ? Math.round((1000 * decided.filter((s) => s.purchased).length) / decided.length) / 1000 : null,
        avg_confidence: conf.length ? Math.round((10 * conf.reduce((a, b) => a + b, 0)) / conf.length) / 10 : null,
      },
      per_day: dayList.map((d) => ({ date: d, count: perDay.get(d) ?? 0 })),
      referrals,
      symptoms: countBy(rows.flatMap((s) => (Array.isArray(s.profile?.symptoms) ? s.profile.symptoms : [])), (x) => String(x)).slice(0, 8),
      languages: countBy(rows, (s) => s.language),
      modes: countBy(rows, (s) => s.mode),
      districts: countBy(rows, (s) => s.district ?? "Unknown").slice(0, 20),
      designs: countBy(completed, (s) => s.design ?? "—").slice(0, 8),
    });
  });

  return r;
}
