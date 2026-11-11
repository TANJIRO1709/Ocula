import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Config } from "./config.js";

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h).catch(() => false);

type Typ = "access" | "refresh" | "session";

export class Tokens {
  constructor(private cfg: Config) {}

  private sign(payload: object, typ: Typ, expiresInSec: number) {
    return jwt.sign({ ...payload, typ }, this.cfg.SECRET_KEY, { algorithm: "HS256", expiresIn: expiresInSec });
  }
  access(userId: number, role: string) {
    return this.sign({ sub: String(userId), role }, "access", this.cfg.ACCESS_TOKEN_MINUTES * 60);
  }
  refresh(userId: number) {
    return this.sign({ sub: String(userId) }, "refresh", this.cfg.REFRESH_TOKEN_DAYS * 86400);
  }
  /** Capability token that lets a kiosk / customer device write to exactly one screening session. */
  session(sessionId: string) {
    return this.sign({ sid: sessionId }, "session", this.cfg.SESSION_TOKEN_HOURS * 3600);
  }
  verify(token: string, typ: Typ): Record<string, any> | null {
    try {
      const data = jwt.verify(token, this.cfg.SECRET_KEY, { algorithms: ["HS256"] }) as Record<string, any>;
      return data.typ === typ ? data : null;
    } catch {
      return null;
    }
  }

  // ---- Vision Passport: short, URL-safe, HMAC-signed customer ids ----
  private passportMac(raw: Buffer) {
    return crypto.createHmac("sha256", this.cfg.SECRET_KEY).update(Buffer.concat([Buffer.from("passport:"), raw])).digest().subarray(0, 12);
  }
  signPassport(customerId: number) {
    const raw = Buffer.from(String(customerId));
    return `${raw.toString("base64url")}.${this.passportMac(raw).toString("base64url")}`;
  }
  verifyPassport(token: string): number | null {
    const [a, b] = token.split(".");
    if (!a || !b) return null;
    try {
      const raw = Buffer.from(a, "base64url");
      const mac = Buffer.from(b, "base64url");
      const expected = this.passportMac(raw);
      if (mac.length !== expected.length || !crypto.timingSafeEqual(mac, expected)) return null;
      const id = Number(raw.toString());
      return Number.isInteger(id) && id > 0 ? id : null;
    } catch {
      return null;
    }
  }
}

export const newSessionId = () => crypto.randomUUID().replace(/-/g, "");
