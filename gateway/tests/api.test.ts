import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { makeApp, REAL_ENGINE } from "./helpers.js";

let app: any, ctx: any, admin: Record<string, string>;
const P = "/api/v1";
const RUN = Date.now().toString().slice(-7); // unique test data so the suite can rerun on a persistent database

const acuity = (threshold: number, distance = 0.5, squint = false) => ({
  trials: [1.0, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0].flatMap((lm) =>
    [0, 1].map(() => ({ logmar: lm, correct: lm >= threshold, response_ms: 1200, distance_m: distance, squint, lean: false, gaze_on_target: true }))),
});

async function newSession(body: Record<string, unknown> = {}) {
  const r = await request(app).post(`${P}/sessions`).send({ language: "en", mode: "adult", consent: true, ...body });
  expect(r.status).toBe(201);
  return { id: r.body.id as string, h: { "X-Session-Token": r.body.session_token as string }, passport: r.body.passport_token as string };
}

beforeAll(async () => {
  ({ app, ctx } = await makeApp());
  const r = await request(app).post(`${P}/auth/login`).send({ email: "admin@ocula.app", password: "ocula-admin" });
  expect(r.status).toBe(200);
  admin = { Authorization: `Bearer ${r.body.access_token}` };
}, 60000);

describe("platform", () => {
  it("health + 404 + bad json", async () => {
    expect((await request(app).get("/healthz")).body.status).toBe("ok");
    expect((await request(app).get(`${P}/nope`)).status).toBe(404);
    const bad = await request(app).post(`${P}/sessions`).set("Content-Type", "application/json").send("{bad");
    expect(bad.status).toBe(400);
  });

  it("auth: wrong password, refresh, me", async () => {
    expect((await request(app).post(`${P}/auth/login`).send({ email: "admin@ocula.app", password: "nope" })).status).toBe(401);
    const login = await request(app).post(`${P}/auth/login`).send({ email: "ADMIN@ocula.app", password: "ocula-admin" });
    const ref = await request(app).post(`${P}/auth/refresh`).send({ refresh_token: login.body.refresh_token });
    expect(ref.status).toBe(200);
    const me = await request(app).get(`${P}/auth/me`).set("Authorization", `Bearer ${ref.body.access_token}`);
    expect(me.body.role).toBe("admin");
    expect((await request(app).get(`${P}/auth/me`)).status).toBe(401);
  });

  it("passport tokens are tamper-proof", () => {
    const t = ctx.tokens.signPassport(42);
    expect(ctx.tokens.verifyPassport(t)).toBe(42);
    expect(ctx.tokens.verifyPassport(t.slice(0, -2) + "xx")).toBeNull();
    expect(ctx.tokens.verifyPassport("garbage")).toBeNull();
  });
});

describe("screening", () => {
  it("requires consent and enforces session tokens", async () => {
    expect((await request(app).post(`${P}/sessions`).send({ language: "en", mode: "adult", consent: false })).status).toBe(400);
    const a = await newSession();
    const b = await newSession();
    expect((await request(app).post(`${P}/sessions/${a.id}/tests`).send({ key: "contrast", data: {} })).status).toBe(401);
    expect((await request(app).post(`${P}/sessions/${a.id}/tests`).set(b.h).send({ key: "contrast", data: {} })).status).toBe(403);
    expect((await request(app).post(`${P}/sessions/${a.id}/tests`).set(a.h).send({ key: "evil", data: {} })).status).toBe(422);
  });

  it("full adult flow: calibration → interview → tests → selfie → complete → report → passport", async () => {
    const { id, h, passport } = await newSession({ customer: { name: "Ravi Kumar", phone: `+9199${RUN}` } });
    expect((await request(app).post(`${P}/sessions/${id}/calibration`).set(h).send({ px_per_mm: 15.2, card_calibrated: true, distance_tracking: true, lighting_ok: true })).status).toBe(200);

    let r = await request(app).post(`${P}/interview/${id}/start`).set(h).send({});
    expect(r.status).toBe(200);
    expect(r.body.state).toBeUndefined(); // agent state never leaves the server
    for (const a of ["I am 52", "no", "yes", "4 years", "trouble reading and glare at night", "7 hours", "I work in a bank office", "yes I drive at night", "1 hour", "no", "no", "no"]) {
      if (r.body.done) break;
      r = await request(app).post(`${P}/interview/${id}/reply`).set(h).send({ text: a });
      expect(r.status).toBe(200);
    }
    expect(r.body.done).toBe(true);
    expect(r.body.urgent).toBe(false);

    const tests: Record<string, unknown> = {
      acuity_R: acuity(0.1), acuity_L: acuity(0.1), far_point_R: { distance_m: 0.5, blurred: true }, far_point_L: { distance_m: 0.57, blurred: true },
      near_point: { distance_m: 0.6 }, astigmatism_R: { darkest_hour: 3, severity: "slight" }, astigmatism_L: { darkest_hour: null, severity: "equal" },
      duochrome_R: { answer: "red" }, duochrome_L: { answer: "red" }, contrast: { lowest_contrast: 0.025 }, color: { correct: 6, total: 6 },
      amsler_R: { distorted: false }, amsler_L: { distorted: false }, behaviour: { blinks: 20, duration_s: 90 },
    };
    await Promise.all(Object.entries(tests).map(([key, data]) => request(app).post(`${P}/sessions/${id}/tests`).set(h).send({ key, data })));
    const got = await request(app).get(`${P}/sessions/${id}`).set(h);
    expect(Object.keys(got.body.tests).sort()).toEqual(Object.keys(tests).sort()); // concurrent writes all kept

    const lm = { right_iris_center: [400, 500], left_iris_center: [700, 500], nose_bridge: [550, 480], right_iris_diameter_px: 57, left_iris_diameter_px: 57,
      face_top: [550, 180], chin: [550, 880], cheek_left: [860, 520], cheek_right: [240, 520], jaw_left: [800, 820], jaw_right: [300, 820],
      forehead_left: [790, 300], forehead_right: [310, 300], right_eye_aperture_px: 22, left_eye_aperture_px: 21 };
    r = await request(app).post(`${P}/sessions/${id}/selfie`).set(h).send({ landmarks: lm, reflex: { right: { dx: 0.07, dy: 0 }, left: { dx: -0.07, dy: 0 } } });
    expect(r.status).toBe(200);
    expect(r.body.pd_mm).toBeGreaterThan(55);

    r = await request(app).post(`${P}/sessions/${id}/complete`).set(h).send({});
    expect(r.status).toBe(200);
    const res = r.body.result;
    expect(res.eyes.R.sphere).toBeCloseTo(-2, 0);
    expect(r.body.explanation.text).toBeTruthy();
    if (REAL_ENGINE) {
      expect(res.eyes.R.cyl).toBe(-0.75);
      expect(res.eyes.R.axis).toBe(90);
      expect(res.add).toBeGreaterThanOrEqual(1);
      expect(res.products.design.sku).toBe("ZDS-PAL");
      expect(res.frames.length).toBeGreaterThan(0);
    }

    const pdf = await request(app).get(`${P}/sessions/${id}/report.pdf`).set(h).buffer(true).parse((resp, cb) => {
      const chunks: Buffer[] = [];
      resp.on("data", (c: Buffer) => chunks.push(c));
      resp.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");

    const pp = await request(app).get(`${P}/passport/${passport}`);
    expect(pp.status).toBe(200);
    expect(pp.body.history.length).toBe(1);
    expect(pp.body.customer.phone).toBeUndefined(); // public view hides contact details
    expect((await request(app).get(`${P}/passport/${passport}`).set(admin)).body.customer.phone).toBe(`+9199${RUN}`);
    const qr = await request(app).get(`${P}/passport/${passport}/qr.png`);
    expect(qr.headers["content-type"]).toContain("image/png");

    expect((await request(app).post(`${P}/sessions/${id}/outcome`).set(admin).send({ purchased: true, sku: "ZDS-PAL" })).status).toBe(200);
    const list = await request(app).get(`${P}/sessions?limit=5`).set(admin);
    expect(list.body[0].summary).toBeTruthy();
    const a = await request(app).get(`${P}/analytics/summary`).set(admin);
    expect(a.body.totals.completed).toBeGreaterThanOrEqual(1);
    expect(a.body.totals.conversion_rate).toBe(1);
    expect(a.body.per_day).toHaveLength(30);
    expect(a.body.districts[0][0]).toBe("Sundargarh");
  }, 120000);

  it("urgent red flag in the interview pauses retail", async () => {
    const { id, h } = await newSession({ language: "hi" });
    await request(app).post(`${P}/interview/${id}/start`).set(h).send({});
    await request(app).post(`${P}/interview/${id}/reply`).set(h).send({ text: "पचपन" });
    const r = await request(app).post(`${P}/interview/${id}/reply`).set(h).send({ text: "हाँ, आँख के आगे परदा सा आ गया" });
    expect(r.body.urgent).toBe(true);
    const s = await request(app).get(`${P}/sessions/${id}`).set(h);
    expect(s.body.referral_level).toBe("urgent");
    if (REAL_ENGINE) {
      const c = await request(app).post(`${P}/sessions/${id}/complete`).set(h).send({});
      expect(c.body.result.retail_paused).toBe(true);
    }
  }, 60000);

  it("Amsler distortion is an urgent referral", async () => {
    const { id, h } = await newSession();
    await request(app).patch(`${P}/sessions/${id}/profile`).set(h).send({ age: 67 });
    await request(app).post(`${P}/sessions/${id}/tests`).set(h).send({ key: "amsler_L", data: { distorted: true } });
    const r = await request(app).post(`${P}/sessions/${id}/complete`).set(h).send({});
    expect(r.body.referral_level).toBe("urgent");
    expect(r.body.status).toBe("referred");
  }, 60000);
});

describe("kids, camps, telephony, catalog", () => {
  it("school camp: add student → screen → class stats + report", async () => {
    const camp = (await request(app).post(`${P}/camps`).set(admin).send({ name: "Term 1", school: "DAV Public School" })).body;
    const st = (await request(app).post(`${P}/camps/${camp.id}/students`).set(admin).send({ name: "Asha", age: 10, school_class: "5B" })).body;
    const h = { "X-Session-Token": st.session_token };
    for (const [key, data] of Object.entries({ acuity_R: acuity(0.5, 2), acuity_L: acuity(0.4, 2), far_point_R: { distance_m: 0.4, blurred: true }, far_point_L: { distance_m: 0.45, blurred: true } })) {
      await request(app).post(`${P}/sessions/${st.session_id}/tests`).set(h).send({ key, data });
    }
    const r = await request(app).post(`${P}/sessions/${st.session_id}/complete`).set(h).send({});
    expect(r.body.result.products.design.sku).toBe("ZMYO");
    const c = await request(app).get(`${P}/camps/${camp.id}`).set(admin);
    expect(c.body.stats).toEqual({ screened: 1, followup: 1, incomplete: 0 });
    const pdf = await request(app).get(`${P}/camps/${camp.id}/report.pdf`).set(admin);
    expect(pdf.status).toBe(200);
    const prog = await request(app).get(`${P}/kids/${st.customer_id}/progression`).set(admin);
    expect(prog.body.points).toHaveLength(1);
  }, 60000);

  it("missed-call simulator ends with an SMS", async () => {
    const s = (await request(app).post(`${P}/telephony/simulate`).send({ phone: "+919800000002", language: "hi" })).body;
    let out: any;
    for (const a of ["चालीस", "नहीं", "नहीं", "दूर का धुंधला दिखता है", "पाँच घंटे", "दुकान चलाता हूँ", "हाँ", "दो घंटे", "नहीं", "नहीं"]) {
      out = (await request(app).post(`${P}/telephony/simulate/${s.session_id}/reply`).send({ text: a })).body;
      if (out.done) break;
    }
    expect(out.done).toBe(true);
    expect(out.sms).toContain("Passport");
    expect(ctx.notify.sent.some((m: any) => m.kind === "sms" && m.to === "+919800000002")).toBe(true);
  }, 60000);

  it("Twilio missed call rejects and calls back; voice webhook returns TwiML", async () => {
    const r = await request(app).post(`${P}/telephony/missed-call`).type("form").send({ From: "+919800000003" });
    expect(r.text).toContain("<Reject");
    const call = ctx.notify.sent.find((m: any) => m.kind === "call" && m.to === "+919800000003");
    const sid = call.body.split("/").pop();
    const v = await request(app).post(`${P}/telephony/voice/${sid}`).type("form").send({});
    expect(v.text).toContain("<Gather");
    const g = await request(app).post(`${P}/telephony/gather/${sid}`).type("form").send({ SpeechResult: "45" });
    expect(g.text).toMatch(/<Gather|<Hangup/);
  }, 60000);

  it("RBAC on catalog + thickness", async () => {
    await request(app).post(`${P}/auth/users`).set(admin).send({ email: "staff1@ocula.app", name: "Staff", password: "staffpass1", role: "staff" });
    const tok = (await request(app).post(`${P}/auth/login`).send({ email: "staff1@ocula.app", password: "staffpass1" })).body.access_token;
    const item = { sku: `TEST-${RUN}`, category: "coating", family: "X", name: "Test", tags: ["a", "b"] };
    expect((await request(app).post(`${P}/catalog`).set("Authorization", `Bearer ${tok}`).send(item)).status).toBe(403);
    const created = await request(app).post(`${P}/catalog`).set(admin).send(item);
    expect(created.status).toBe(201);
    expect(created.body.tags).toEqual(["a", "b"]);
    expect((await request(app).put(`${P}/catalog/TEST-${RUN}`).set(admin).send({ ...item, price_inr: 1999 })).body.price_inr).toBe(1999);
    expect((await request(app).delete(`${P}/catalog/TEST-${RUN}`).set(admin)).status).toBe(204);
    const frames = await request(app).get(`${P}/catalog?category=frame`);
    expect(frames.body.length).toBe(10);
    const t = await request(app).post(`${P}/lens/thickness`).send({ sphere: -6, index: 1.67, pd_mm: 62 });
    expect(t.body.edge_max_mm).toBeGreaterThan(t.body.center_mm);
  });
});

describe("config wiring for Render", () => {
  it("derives URLs from sibling hostnames", async () => {
    const { loadConfig, corsOrigins } = await import("../src/config.js");
    // CI sets ENGINE_URL etc. for the integration tests; explicit values (correctly) win, so clear them here.
    const keys = ["ENGINE_URL", "API_BASE_URL", "PUBLIC_BASE_URL", "CORS_ORIGINS"] as const;
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    keys.forEach((k) => delete process.env[k]);
    try {
    const c = loadConfig({ ENGINE_HOST: "ocula-engine.onrender.com", FRONTEND_HOST: "ocula-web.onrender.com", RENDER_EXTERNAL_URL: "https://ocula-api.onrender.com" });
    expect(c.ENGINE_URL).toBe("https://ocula-engine.onrender.com");
    expect(c.PUBLIC_BASE_URL).toBe("https://ocula-web.onrender.com");
    expect(c.API_BASE_URL).toBe("https://ocula-api.onrender.com");
    expect(corsOrigins(c)).toContain("https://ocula-web.onrender.com");
    expect(loadConfig({ ENGINE_URL: "http://x:1", ENGINE_HOST: "y" }).ENGINE_URL).toBe("http://x:1");
    } finally {
      for (const k of keys) if (saved[k] !== undefined) process.env[k] = saved[k];
    }
  });
});