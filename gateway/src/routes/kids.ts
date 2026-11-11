/** Kids mode (myopia progression) and school screening camps. */
import { Router } from "express";
import { z } from "zod";
import { audit, type Ctx, requireUser } from "../context.js";
import { j } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { progressionFor, studentRow } from "../kids.js";
import { newSessionId } from "../security.js";

const campOut = (c: any) => ({ id: c.id, name: c.name, school: c.school, teacher: c.teacher, created_at: new Date(c.created_at).toISOString() });

export function kidsRoutes(ctx: Ctx) {
  const r = Router();

  r.get("/kids/:cid/progression", requireUser, async (req, res) => {
    const c = await ctx.db.one("SELECT id, name FROM customers WHERE id=$1", [Number(req.params.cid)]);
    if (!c) throw new HttpError(404, "Not found");
    res.json({ customer_id: c.id, name: c.name, ...(await progressionFor(ctx, c.id)) });
  });

  r.post("/camps", requireUser, async (req, res) => {
    const b = parse(z.object({ name: z.string().min(1), school: z.string().min(1), teacher: z.string().default(""), store_id: z.number().int().nullable().optional() }), req.body);
    const c = await ctx.db.one("INSERT INTO camps (name, school, teacher, store_id) VALUES ($1,$2,$3,$4) RETURNING *",
      [b.name, b.school, b.teacher, b.store_id ?? req.user!.store_id]);
    await audit(ctx.db, req.user!.email, "camp_create", b.school);
    res.status(201).json(campOut(c));
  });

  r.get("/camps", requireUser, async (_req, res) => {
    res.json((await ctx.db.query("SELECT * FROM camps ORDER BY created_at DESC")).map(campOut));
  });

  const students = async (campId: number) => {
    const rows = await ctx.db.query(
      `SELECT s.*, c.name AS c_name, c.school_class AS c_class FROM screening_sessions s
       LEFT JOIN customers c ON c.id = s.customer_id WHERE s.camp_id=$1 ORDER BY s.created_at`, [campId]);
    return rows.map((s) => studentRow(s, s.c_name, s.c_class));
  };
  const getCamp = async (id: number) => {
    const c = await ctx.db.one("SELECT * FROM camps WHERE id=$1", [id]);
    if (!c) throw new HttpError(404, "Camp not found");
    return c;
  };

  r.get("/camps/:id", requireUser, async (req, res) => {
    const c = await getCamp(Number(req.params.id));
    const st = await students(c.id);
    const done = st.filter((s) => s.needs_followup !== null);
    res.json({ ...campOut(c), students: st, stats: { screened: done.length, followup: done.filter((s) => s.needs_followup).length, incomplete: st.length - done.length } });
  });

  r.post("/camps/:id/students", requireUser, async (req, res) => {
    const c = await getCamp(Number(req.params.id));
    const b = parse(z.object({
      name: z.string().min(1).max(200), age: z.number().int().min(3).max(18), school_class: z.string().max(40).nullable().optional(),
      guardian_phone: z.string().max(32).nullable().optional(), language: z.string().max(8).default("en"),
    }), req.body);
    const child = await ctx.db.one(
      "INSERT INTO customers (name, age, is_child, school_class, guardian_phone) VALUES ($1,$2,true,$3,$4) RETURNING id",
      [b.name, b.age, b.school_class ?? null, b.guardian_phone ?? null]);
    const id = newSessionId();
    // consent for camp screenings is collected by the school / guardian form
    await ctx.db.query(
      `INSERT INTO screening_sessions (id, customer_id, camp_id, store_id, mode, language, consent_at, profile)
       VALUES ($1,$2,$3,$4,'camp',$5,now(),$6::jsonb)`,
      [id, child!.id, c.id, c.store_id, b.language, j({ age: b.age, is_child: true })]);
    res.status(201).json({ session_id: id, session_token: ctx.tokens.session(id), customer_id: child!.id });
  });

  r.get("/camps/:id/report.pdf", requireUser, async (req, res) => {
    const c = await getCamp(Number(req.params.id));
    const pdf = await ctx.engine.campReport({ camp: campOut(c), students: await students(c.id) });
    res.type("application/pdf").setHeader("Content-Disposition", `inline; filename="camp-${c.id}.pdf"`);
    res.send(pdf);
  });

  return r;
}
