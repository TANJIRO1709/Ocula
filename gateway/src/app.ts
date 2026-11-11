import compression from "compression";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import client from "prom-client";
import type { Logger } from "pino";
import { corsOrigins } from "./config.js";
import { attachUser, type Ctx } from "./context.js";
import { HttpError } from "./errors.js";
import { authRoutes } from "./routes/auth.js";
import { interviewRoutes } from "./routes/interview.js";
import { kidsRoutes } from "./routes/kids.js";
import { miscRoutes } from "./routes/misc.js";
import { sessionRoutes } from "./routes/sessions.js";
import { telephonyRoutes } from "./routes/telephony.js";

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
const httpHist = new client.Histogram({
  name: "ocula_http_request_seconds", help: "HTTP latency", labelNames: ["method", "route", "status"], registers: [registry],
});

export function createApp(ctx: Ctx, logger?: Logger) {
  const app = express();
  app.set("trust proxy", 1); // Render / Vercel sit behind one proxy hop
  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  const origins = corsOrigins(ctx.cfg);
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || origins.includes("*") || origins.includes(origin.replace(/\/$/, ""))),
    credentials: true, exposedHeaders: ["x-request-id"],
  }));
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false })); // Twilio webhooks
  if (logger) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/healthz" } }));
  app.use((req, res, next) => {
    const end = httpHist.startTimer();
    res.on("finish", () => end({ method: req.method, route: req.route?.path ?? "unmatched", status: res.statusCode }));
    next();
  });
  app.use(rateLimit({
    windowMs: 60_000, limit: ctx.cfg.RATE_LIMIT_PER_MINUTE, standardHeaders: "draft-8", legacyHeaders: false,
    skip: (req) => req.path === "/healthz" || req.path === "/metrics",
    message: { detail: "Too many requests" },
  }));

  app.get("/", (_req, res) => {
    res.json({ service: "ocula-gateway", docs: "See README — API under " + ctx.cfg.API_PREFIX });
  });
  app.get("/healthz", async (_req, res) => {
    await ctx.db.one("SELECT 1 AS ok");
    res.json({ status: "ok", service: "ocula-gateway", db: ctx.db.kind });
  });
  app.get("/readyz", async (_req, res) => {
    const engine = await ctx.engine.health().catch((e: Error) => ({ status: "down", error: e.message }));
    res.status(engine.status === "ok" ? 200 : 503).json({ gateway: "ok", db: ctx.db.kind, engine });
  });
  app.get("/metrics", async (_req, res) => {
    res.type(registry.contentType).send(await registry.metrics());
  });

  const api = express.Router();
  api.use(attachUser(ctx));
  api.use("/auth", authRoutes(ctx));
  api.use("/sessions", sessionRoutes(ctx));
  api.use("/interview", interviewRoutes(ctx));
  api.use("/telephony", telephonyRoutes(ctx));
  api.use("/", kidsRoutes(ctx));
  api.use("/", miscRoutes(ctx));
  app.use(ctx.cfg.API_PREFIX, api);

  app.use((_req, _res, next) => next(new HttpError(404, "Not found")));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      for (const [k, v] of Object.entries(err.headers)) res.setHeader(k, v);
      return res.status(err.status).json({ detail: err.message });
    }
    const e = err as { type?: string; status?: number; message?: string };
    if (e?.type === "entity.parse.failed") return res.status(400).json({ detail: "Invalid JSON body" });
    (req as any).log?.error({ err }, "unhandled error");
    if (!(req as any).log) console.error(err);
    res.status(500).json({ detail: "Internal server error" });
  });
  return app;
}
