import type { NextFunction, Request, Response } from "express";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import type { Engine } from "./engine.js";
import { HttpError } from "./errors.js";
import type { Notifier } from "./notify.js";
import { Tokens } from "./security.js";

export type User = { id: number; email: string; name: string; role: "admin" | "manager" | "staff"; store_id: number | null };

export interface Ctx {
  cfg: Config;
  db: Db;
  engine: Engine;
  tokens: Tokens;
  notify: Notifier;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User | null;
      sessionRow?: Record<string, any>;
    }
  }
}

const RANK = { staff: 1, manager: 2, admin: 3 } as const;

/** Attach the staff user (if a valid Bearer access token is present). Never rejects. */
export const attachUser = (ctx: Ctx) => async (req: Request, _res: Response, next: NextFunction) => {
  req.user = null;
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) {
    const data = ctx.tokens.verify(h.slice(7), "access");
    if (data) {
      const u = await ctx.db.one<User & { is_active: boolean }>(
        "SELECT id, email, name, role, store_id, is_active FROM users WHERE id=$1", [Number(data.sub)],
      );
      if (u?.is_active) req.user = { id: u.id, email: u.email, name: u.name, role: u.role, store_id: u.store_id };
    }
  }
  next();
};

export const requireUser = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) throw new HttpError(401, "Not authenticated", { "WWW-Authenticate": "Bearer" });
  next();
};

export const requireRole = (role: keyof typeof RANK) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  if (RANK[req.user.role] < RANK[role]) throw new HttpError(403, `${role} role required`);
  next();
};

/** A screening session can be written by staff, or by the device holding that session's token. */
export const sessionWriter = (ctx: Ctx) => async (req: Request, _res: Response, next: NextFunction) => {
  const id = String(req.params.id);
  const s = await ctx.db.one("SELECT * FROM screening_sessions WHERE id=$1", [id]);
  if (!s) throw new HttpError(404, "Session not found");
  if (!req.user) {
    const tok = req.header("x-session-token");
    if (!tok) throw new HttpError(401, "Session token required");
    const data = ctx.tokens.verify(tok, "session");
    if (!data) throw new HttpError(401, "Invalid session token");
    if (data.sid !== id) throw new HttpError(403, "Token does not match session");
  }
  req.sessionRow = s;
  next();
};

export async function audit(db: Db, actor: string, action: string, target = "", detail: Record<string, unknown> = {}) {
  await db.query("INSERT INTO audit_logs (actor, action, target, detail) VALUES ($1,$2,$3,$4::jsonb)", [
    actor, action, target, JSON.stringify(detail),
  ]);
}
