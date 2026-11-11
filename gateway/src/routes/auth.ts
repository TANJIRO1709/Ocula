import { Router } from "express";
import { z } from "zod";
import { audit, type Ctx, requireRole, requireUser } from "../context.js";
import { HttpError, parse } from "../errors.js";
import { hashPassword, verifyPassword } from "../security.js";

const userOut = (u: any) => ({ id: u.id, email: u.email, name: u.name, role: u.role, store_id: u.store_id });

export function authRoutes(ctx: Ctx) {
  const r = Router();
  const tokens = (u: any) => ({
    access_token: ctx.tokens.access(u.id, u.role), refresh_token: ctx.tokens.refresh(u.id), token_type: "bearer", user: userOut(u),
  });

  r.post("/login", async (req, res) => {
    const body = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    const u = await ctx.db.one("SELECT * FROM users WHERE lower(email)=lower($1)", [body.email]);
    if (!u || !u.is_active || !(await verifyPassword(body.password, u.hashed_password))) throw new HttpError(401, "Invalid email or password");
    await audit(ctx.db, u.email, "login");
    res.json(tokens(u));
  });

  r.post("/refresh", async (req, res) => {
    const { refresh_token } = parse(z.object({ refresh_token: z.string() }), req.body);
    const data = ctx.tokens.verify(refresh_token, "refresh");
    if (!data) throw new HttpError(401, "Invalid refresh token");
    const u = await ctx.db.one("SELECT * FROM users WHERE id=$1", [Number(data.sub)]);
    if (!u || !u.is_active) throw new HttpError(401, "User disabled");
    res.json(tokens(u));
  });

  r.get("/me", requireUser, (req, res) => {
    res.json(req.user);
  });

  r.post("/users", requireRole("admin"), async (req, res) => {
    const b = parse(z.object({
      email: z.string().email(), name: z.string().min(1), password: z.string().min(8),
      role: z.enum(["admin", "manager", "staff"]).default("staff"), store_id: z.number().int().nullable().optional(),
    }), req.body);
    if (await ctx.db.one("SELECT id FROM users WHERE lower(email)=lower($1)", [b.email])) throw new HttpError(409, "Email already registered");
    const u = await ctx.db.one(
      "INSERT INTO users (email, name, hashed_password, role, store_id) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [b.email, b.name, await hashPassword(b.password), b.role, b.store_id ?? req.user!.store_id],
    );
    await audit(ctx.db, req.user!.email, "create_user", b.email, { role: b.role });
    res.status(201).json(userOut(u));
  });

  r.get("/users", requireRole("manager"), async (_req, res) => {
    res.json((await ctx.db.query("SELECT * FROM users ORDER BY id")).map(userOut));
  });

  return r;
}
