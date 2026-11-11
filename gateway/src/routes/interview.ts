/** Voice interview: the gateway keeps the agent state; the FastAPI engine runs the LangGraph step. */
import { Router } from "express";
import { z } from "zod";
import { type Ctx, sessionWriter } from "../context.js";
import { j } from "../db.js";
import { parse } from "../errors.js";
import { interviewPublic } from "../serialize.js";

export function interviewRoutes(ctx: Ctx) {
  const r = Router();
  const writer = sessionWriter(ctx);

  const persist = async (id: string, out: Record<string, any>, prevProfile: Record<string, unknown>) => {
    const profile = { ...prevProfile, ...(out.profile ?? {}) };
    await ctx.db.query(
      `UPDATE screening_sessions SET interview=$2::jsonb, profile=$3::jsonb,
         referral_level = CASE WHEN $4 THEN 'urgent' ELSE referral_level END WHERE id=$1`,
      [id, j(out), j(profile), !!out.urgent],
    );
  };

  r.post("/:id/start", writer, async (req, res) => {
    const s = req.sessionRow!;
    const existing = s.interview ?? {};
    if (existing.state && (existing.pending || existing.done)) return res.json(interviewPublic(existing)); // resume
    const out = await ctx.engine.interviewStart({ mode: s.mode, language: s.language, profile: s.profile ?? {} });
    await persist(s.id, out, s.profile ?? {});
    res.json(interviewPublic(out));
  });

  r.post("/:id/reply", writer, async (req, res) => {
    const { text } = parse(z.object({ text: z.string().min(1).max(1000) }), req.body);
    const s = req.sessionRow!;
    let state = s.interview?.state;
    if (!state) state = (await ctx.engine.interviewStart({ mode: s.mode, language: s.language, profile: s.profile ?? {} })).state;
    const out = await ctx.engine.interviewStep({ state, reply: text });
    await persist(s.id, out, s.profile ?? {});
    res.json(interviewPublic(out));
  });

  return r;
}
