import { z } from "zod";

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(8000),
  API_PREFIX: z.string().default("/api/v1"),
  // Postgres connection string (Render: Internal Database URL). Empty -> embedded PGlite (local dev / tests).
  DATABASE_URL: z.string().default(""),
  PGLITE_DIR: z.string().default("./data/pglite"),
  DATABASE_SSL: bool.default(false),
  SECRET_KEY: z.string().min(16).default("change-me-in-production-please-32-bytes-min"),
  ACCESS_TOKEN_MINUTES: z.coerce.number().default(30),
  REFRESH_TOKEN_DAYS: z.coerce.number().default(7),
  SESSION_TOKEN_HOURS: z.coerce.number().default(12),
  // Comma-separated list of allowed browser origins (your Next.js URL).
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  PUBLIC_BASE_URL: z.string().default("http://localhost:3000"), // frontend URL, used in passport links / QR codes
  API_BASE_URL: z.string().default("http://localhost:8000"), // this gateway's public URL, used for Twilio webhooks
  ENGINE_URL: z.string().default("http://localhost:8001"),
  ENGINE_API_KEY: z.string().default(""),
  ENGINE_TIMEOUT_MS: z.coerce.number().default(70000), // generous: a sleeping free-tier engine can take ~50 s to wake
  ENGINE_KEEPALIVE_MINUTES: z.coerce.number().default(10),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(240),
  SEED_DEMO_DATA: bool.default(true),
  ADMIN_EMAIL: z.string().default("admin@ocula.app"),
  ADMIN_PASSWORD: z.string().default(""), // set in .env; no admin is created while empty
  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_FROM_NUMBER: z.string().default(""),
  LOG_LEVEL: z.string().default("info"),
  // Render blueprint wiring: public hostnames of sibling services (free services can't use the private network)
  ENGINE_HOST: z.string().default(""),
  FRONTEND_HOST: z.string().default(""),
  RENDER_EXTERNAL_URL: z.string().default(""),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(overrides: Partial<Record<keyof Config, unknown>> = {}): Config {
  const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""));
  const cfg = schema.parse({ ...env, ...overrides });
  const set = (k: string) => k in env || k in overrides;
  const https = (h: string) => (/^https?:\/\//.test(h) ? h : `https://${h}`);
  if (!set("ENGINE_URL") && cfg.ENGINE_HOST) cfg.ENGINE_URL = https(cfg.ENGINE_HOST);
  if (!set("API_BASE_URL") && cfg.RENDER_EXTERNAL_URL) cfg.API_BASE_URL = cfg.RENDER_EXTERNAL_URL;
  if (cfg.FRONTEND_HOST) {
    const front = https(cfg.FRONTEND_HOST);
    if (!set("PUBLIC_BASE_URL")) cfg.PUBLIC_BASE_URL = front;
    if (!corsOrigins(cfg).includes(front)) cfg.CORS_ORIGINS = `${cfg.CORS_ORIGINS},${front}`;
  }
  if (cfg.NODE_ENV === "production" && cfg.SECRET_KEY.startsWith("change-me")) {
    throw new Error("SECRET_KEY must be set in production");
  }
  if (cfg.NODE_ENV === "production" && !cfg.ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD must be set in production");
  return cfg;
}

export const corsOrigins = (c: Config) => c.CORS_ORIGINS.split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
