/**
 * Missed-call eye check (Twilio) for people without smartphones.
 *  1. Missed call -> POST /telephony/missed-call : reject (free for the caller) and queue a call-back.
 *  2. Twilio fetches POST /telephony/voice/:id   : first question inside <Gather input="speech">.
 *  3. Each answer -> POST /telephony/gather/:id   : same LangGraph agent (via the engine) as the app.
 *  4. End: urgent -> "see an eye doctor today" SMS; otherwise store invite + Vision Passport link.
 * /telephony/simulate runs the identical flow in the browser for demos.
 */
import { type Request, Router } from "express";
import { z } from "zod";
import type { Ctx } from "../context.js";
import { j } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { validTwilioSignature } from "../notify.js";
import { passportUrl } from "../serialize.js";
import { newSessionId } from "../security.js";
import { defaultStoreId } from "./sessions.js";

const VOICE_LANGS: Record<string, string> = { en: "en-IN", hi: "hi-IN" };
const SPEECH_LOCALES: Record<string, string> = { en: "en-IN", hi: "hi-IN", or: "or-IN" };
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export function telephonyRoutes(ctx: Ctx) {
  const r = Router();
  const base = () => ctx.cfg.API_BASE_URL.replace(/\/$/, "") + ctx.cfg.API_PREFIX + "/telephony";
  const twiml = (res: any, body: string) => res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`);

  const verify = (req: Request) => {
    const form = Object.fromEntries(Object.entries(req.body ?? {}).map(([k, v]) => [k, String(v)]));
    if (ctx.cfg.TWILIO_AUTH_TOKEN) {
      const url = ctx.cfg.API_BASE_URL.replace(/\/$/, "") + req.originalUrl;
      if (!validTwilioSignature(ctx.cfg.TWILIO_AUTH_TOKEN, url, form, req.header("x-twilio-signature") ?? "")) {
        throw new HttpError(403, "Invalid Twilio signature");
      }
    }
    return form;
  };

  const newPhoneSession = async (phone: string, language: string) => {
    let cust = await ctx.db.one("SELECT * FROM customers WHERE phone=$1 ORDER BY id LIMIT 1", [phone]);
    if (!cust) cust = await ctx.db.one("INSERT INTO customers (phone) VALUES ($1) RETURNING *", [phone]);
    const id = newSessionId();
    const lang = VOICE_LANGS[language] ? language : "hi";
    await ctx.db.query(
      "INSERT INTO screening_sessions (id, customer_id, store_id, mode, language, consent_at) VALUES ($1,$2,$3,'phone',$4,now())",
      [id, cust!.id, await defaultStoreId(ctx), lang]);
    return { id, lang, customer: cust! };
  };

  const saveState = (id: string, out: any, prevProfile: Record<string, unknown> = {}) =>
    ctx.db.query("UPDATE screening_sessions SET interview=$2::jsonb, profile=$3::jsonb WHERE id=$1",
      [id, j(out), j({ ...prevProfile, ...(out.profile ?? {}) })]);

  const finish = async (s: Record<string, any>, out: any) => {
    const cust = await ctx.db.one("SELECT * FROM customers WHERE id=$1", [s.customer_id]);
    const store = await ctx.db.one("SELECT name FROM stores ORDER BY id LIMIT 1");
    let body: string;
    if (out.urgent) {
      body = "Ocula: Based on your answers, please see an eye doctor TODAY. Do not wait. If vision is lost suddenly, go to the nearest hospital eye department.";
      await ctx.db.query("UPDATE screening_sessions SET referral_level='urgent', status='referred' WHERE id=$1", [s.id]);
    } else {
      body = `Ocula: Thank you! Visit us${store ? ` at ${store.name}` : ""} for a free 7-minute vision check and lens advice. Your Vision Passport: ${passportUrl(ctx, cust!.id)}`;
      await ctx.db.query("UPDATE screening_sessions SET status='completed' WHERE id=$1", [s.id]);
    }
    await ctx.notify.sms(cust!.phone ?? "", body);
    return body;
  };

  const gatherXml = (id: string, say: string, lang: string) => {
    const loc = VOICE_LANGS[lang] ?? "hi-IN";
    const action = esc(`${base()}/gather/${id}`);
    return `<Gather input="speech" language="${loc}" speechTimeout="auto" action="${action}" method="POST"><Say language="${loc}">${esc(say)}</Say></Gather><Redirect method="POST">${action}</Redirect>`;
  };

  r.post("/missed-call", async (req, res) => {
    const form = verify(req);
    const caller = form.From;
    if (!caller) return twiml(res, "<Reject/>");
    const s = await newPhoneSession(caller, String(req.query.lang ?? "hi"));
    void ctx.notify.call(caller, `${base()}/voice/${s.id}`); // call back without blocking Twilio's webhook
    twiml(res, '<Reject reason="busy"/>');
  });

  r.post("/voice/:id", async (req, res) => {
    verify(req);
    const s = await ctx.db.one("SELECT * FROM screening_sessions WHERE id=$1 AND mode='phone'", [req.params.id]);
    if (!s) return twiml(res, "<Hangup/>");
    const out = await ctx.engine.interviewStart({ mode: "phone", language: s.language, profile: s.profile ?? {} });
    await saveState(s.id, out, s.profile);
    twiml(res, gatherXml(s.id, out.say, s.language));
  });

  r.post("/gather/:id", async (req, res) => {
    const form = verify(req);
    const s = await ctx.db.one("SELECT * FROM screening_sessions WHERE id=$1 AND mode='phone'", [req.params.id]);
    if (!s?.interview?.state) return twiml(res, "<Hangup/>");
    const text = (form.SpeechResult ?? "").trim();
    const out = text ? await ctx.engine.interviewStep({ state: s.interview.state, reply: text }) : s.interview;
    await saveState(s.id, out, s.profile);
    const loc = VOICE_LANGS[s.language] ?? "hi-IN";
    if (out.done) {
      await finish(s, out);
      return twiml(res, `<Say language="${loc}">${esc(out.say)}</Say><Hangup/>`);
    }
    twiml(res, gatherXml(s.id, out.say, s.language));
  });

  // ---------------- browser simulator (no phone line needed)
  r.post("/simulate", async (req, res) => {
    const b = parse(z.object({ phone: z.string().min(6).max(32), language: z.string().default("hi") }), req.body);
    const s = await newPhoneSession(b.phone, b.language);
    const out = await ctx.engine.interviewStart({ mode: "phone", language: s.lang, profile: {} });
    await saveState(s.id, out);
    res.json({ session_id: s.id, session_token: ctx.tokens.session(s.id), say: out.say, speech_locale: SPEECH_LOCALES[s.lang] ?? "hi-IN", done: false });
  });

  r.post("/simulate/:id/reply", async (req, res) => {
    const { text } = parse(z.object({ text: z.string().min(1).max(1000) }), req.body);
    const s = await ctx.db.one("SELECT * FROM screening_sessions WHERE id=$1 AND mode='phone'", [req.params.id]);
    if (!s?.interview?.state) throw new HttpError(404, "Phone session not found");
    if (s.interview.done) throw new HttpError(409, "Call already finished");
    const out = await ctx.engine.interviewStep({ state: s.interview.state, reply: text });
    await saveState(s.id, out, s.profile);
    const sms = out.done ? await finish(s, out) : null;
    res.json({ say: out.say, done: !!out.done, urgent: !!out.urgent, sms, profile: out.profile });
  });

  return r;
}
