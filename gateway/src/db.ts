/**
 * Tiny database layer over plain SQL.
 * - Production (Render): PostgreSQL via `pg`.
 * - Local dev / tests: PGlite — real Postgres compiled to WASM, so the exact same SQL runs everywhere.
 */
import pg from "pg";
import type { Config } from "./config.js";
import { MIGRATIONS } from "./migrations.js";

export type Row = Record<string, any>;

export interface Db {
  kind: "postgres" | "pglite";
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function connect(cfg: Config): Promise<Db> {
  if (cfg.DATABASE_URL) {
    const pool = new pg.Pool({
      connectionString: cfg.DATABASE_URL,
      max: 10,
      ssl: cfg.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    });
    const wrap = (q: { query: pg.Pool["query"] }): Omit<Db, "tx" | "close" | "kind"> => ({
      async query(sql, params) {
        return (await q.query(sql, params as any[])).rows;
      },
      async one(sql, params) {
        return (await q.query(sql, params as any[])).rows[0] ?? null;
      },
      async exec(sql) {
        await q.query(sql);
      },
    });
    const db: Db = {
      kind: "postgres",
      ...wrap(pool),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const inner: Db = { ...db, ...wrap(client as any), tx: (f) => f(inner) };
          const out = await fn(inner);
          await client.query("COMMIT");
          return out;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
    return db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const lite = cfg.PGLITE_DIR === "memory" ? new PGlite() : new PGlite(cfg.PGLITE_DIR);
  await lite.waitReady;
  const db: Db = {
    kind: "pglite",
    async query(sql, params) {
      return (await lite.query(sql, params as any[])).rows as any[];
    },
    async one(sql, params) {
      return ((await lite.query(sql, params as any[])).rows[0] as any) ?? null;
    },
    async exec(sql) {
      await lite.exec(sql);
    },
    tx: (fn) => fn(db), // PGlite is single-connection; statements are already serialised
    close: () => lite.close(),
  };
  return db;
}

/** Versioned, idempotent migrations tracked in schema_migrations. */
export async function migrate(db: Db): Promise<number> {
  await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const done = new Set((await db.query<{ version: number }>("SELECT version FROM schema_migrations")).map((r) => Number(r.version)));
  let applied = 0;
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    await db.exec(m.sql);
    await db.query("INSERT INTO schema_migrations (version) VALUES ($1)", [m.version]);
    applied++;
  }
  return applied;
}

/** JSON helper for jsonb parameters (always stringify so arrays aren't turned into Postgres arrays). */
export const j = (v: unknown) => JSON.stringify(v ?? null);
