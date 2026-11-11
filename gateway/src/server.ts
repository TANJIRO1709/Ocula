import { mkdirSync } from "node:fs";
import { pino } from "pino";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { Ctx } from "./context.js";
import { connect, migrate } from "./db.js";
import { HttpEngine } from "./engine.js";
import { makeNotifier } from "./notify.js";
import { seed } from "./seed.js";
import { Tokens } from "./security.js";

const cfg = loadConfig();
const logger = pino({ level: cfg.LOG_LEVEL, base: { service: "ocula-gateway" } });

async function main() {
  if (!cfg.DATABASE_URL && cfg.PGLITE_DIR !== "memory") mkdirSync(cfg.PGLITE_DIR, { recursive: true });
  const db = await connect(cfg);
  const applied = await migrate(db);
  if (cfg.SEED_DEMO_DATA) await seed(db, cfg);
  logger.info({ db: db.kind, migrationsApplied: applied }, "database ready");

  const engine = new HttpEngine(cfg);
  const ctx: Ctx = { cfg, db, engine, tokens: new Tokens(cfg), notify: makeNotifier(cfg, (m) => logger.info(m)) };
  const app = createApp(ctx, logger);
  const server = app.listen(cfg.PORT, () => logger.info({ port: cfg.PORT, engine: cfg.ENGINE_URL }, "Ocula gateway listening"));

  // Keep the engine warm (free hosting tiers sleep idle services) and log its status.
  const ping = () => engine.health().then((h) => logger.info({ engine: h.status }, "engine ping")).catch((e) => logger.warn({ err: e.message }, "engine not reachable yet"));
  void ping();
  const keepalive = cfg.ENGINE_KEEPALIVE_MINUTES > 0 ? setInterval(ping, cfg.ENGINE_KEEPALIVE_MINUTES * 60_000) : null;

  const shutdown = async (sig: string) => {
    logger.info({ sig }, "shutting down");
    if (keepalive) clearInterval(keepalive);
    server.close(() => void db.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((e) => {
  logger.fatal({ err: e }, "failed to start");
  process.exit(1);
});
