import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { Ctx } from "../src/context.js";
import { connect, migrate } from "../src/db.js";
import { type Engine, HttpEngine } from "../src/engine.js";
import { makeNotifier } from "../src/notify.js";
import { seed } from "../src/seed.js";
import { Tokens } from "../src/security.js";

/** Minimal stand-in for the FastAPI engine, used when ENGINE_URL isn't provided. */
export class FakeEngine implements Engine {
  async interviewStart(b: any) {
    const state = { mode: b.mode, language: b.language, profile: b.profile, n: 0, transcript: [{ role: "agent", text: "How old are you?" }] };
    return { state, say: "How old are you?", done: false, urgent: false, pending: "age", profile: b.profile, progress: { answered: 0, total: 3 }, speech_locale: "en-IN", transcript: state.transcript };
  }
  async interviewStep(b: any) {
    const urgent = /curtain|परदा|flash/i.test(b.reply);
    const n = b.state.n + 1;
    const profile = { ...b.state.profile, ...(n === 1 ? { age: Number(b.reply.match(/\d+/)?.[0] ?? 40) } : {}), red_flags: urgent ? ["curtain_shadow"] : [] };
    const done = urgent || n >= 3;
    const state = { ...b.state, n, profile, done, urgent, transcript: [...b.state.transcript, { role: "customer", text: b.reply }] };
    return { state, say: done ? "Thank you" : "Next question", done, urgent, pending: done ? null : "q", profile, progress: { answered: n, total: 3 }, speech_locale: "en-IN", transcript: state.transcript };
  }
  async compute(b: any) {
    const far = b.tests?.far_point_R?.distance_m;
    const sphere = far ? -Math.round(4 / far) / 4 : 0;
    const amsler = Object.keys(b.tests ?? {}).some((k) => k.startsWith("amsler") && b.tests[k].distorted);
    const eye = { sphere, se: sphere, cyl: 0, axis: null, snellen: "6/9", acuity_logmar: 0.2, sphere_range: [sphere - 0.5, sphere + 0.5] };
    const child = !!b.profile?.is_child;
    const design = child && sphere <= -0.5 ? "ZMYO" : "ZSL-SV";
    const flags = amsler ? [{ code: "amsler_distortion", level: "urgent", reason: "Amsler", source: "test" }] : [];
    return {
      result: {
        eyes: { R: eye, L: eye }, add: 0, flags, referral_level: amsler ? "urgent" : child && sphere <= -0.5 ? "soon" : null,
        confidence: { score: 80, level: "high", reasons: [], refer: false }, recommendation: { ruleset_version: "fake", fired: [] },
        products: { design: b.catalog.find((c: any) => c.sku === design) }, measurements: b.measurements,
      },
      explanation: { language: b.language, text: "ok", source: "template" },
    };
  }
  async selfie(b: any) {
    if (!b.landmarks?.right_iris_center) throw Object.assign(new Error("bad"), { status: 422 });
    return { pd_mm: 63.2, face: { shape: "oval" } };
  }
  async thickness(b: any) {
    return { center_mm: 1.4, edge_max_mm: 4 + Math.abs(b.sphere) / 2 };
  }
  async sessionReport() {
    return Buffer.from("%PDF-1.4 fake");
  }
  async campReport() {
    return Buffer.from("%PDF-1.4 fake");
  }
  async qr() {
    return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  }
  async health() {
    return { status: "ok" };
  }
}

export const REAL_ENGINE = !!process.env.ENGINE_URL;

export async function makeApp() {
  const cfg = loadConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL ?? "", PGLITE_DIR: "memory", ADMIN_PASSWORD: "test-admin-password", RATE_LIMIT_PER_MINUTE: 100000, ENGINE_KEEPALIVE_MINUTES: 0 });
  const db = await connect(cfg);
  await migrate(db);
  await seed(db, cfg);
  const engine: Engine = REAL_ENGINE ? new HttpEngine(cfg) : new FakeEngine();
  const ctx: Ctx = { cfg, db, engine, tokens: new Tokens(cfg), notify: makeNotifier(cfg, () => undefined) };
  return { app: createApp(ctx), ctx };
}
