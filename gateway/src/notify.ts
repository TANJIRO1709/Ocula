/** Outbound SMS / calls via Twilio's REST API, or console logging when Twilio isn't configured (demo mode). */
import crypto from "node:crypto";
import type { Config } from "./config.js";

export interface Notifier {
  sms(to: string, body: string): Promise<{ status: string }>;
  call(to: string, twimlUrl: string): Promise<{ status: string }>;
  sent: { kind: "sms" | "call"; to: string; body: string }[];
}

export function makeNotifier(cfg: Config, log: (msg: string) => void): Notifier {
  const sent: Notifier["sent"] = [];
  const enabled = cfg.TWILIO_ACCOUNT_SID && cfg.TWILIO_AUTH_TOKEN && cfg.TWILIO_FROM_NUMBER;
  const post = async (path: string, form: Record<string, string>) => {
    const auth = Buffer.from(`${cfg.TWILIO_ACCOUNT_SID}:${cfg.TWILIO_AUTH_TOKEN}`).toString("base64");
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.TWILIO_ACCOUNT_SID}/${path}`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
    });
    return r.ok;
  };
  return {
    sent,
    async sms(to, body) {
      sent.push({ kind: "sms", to, body });
      if (!enabled) {
        log(`[demo sms] to=${to} body=${body}`);
        return { status: "logged" };
      }
      return { status: (await post("Messages.json", { To: to, From: cfg.TWILIO_FROM_NUMBER, Body: body })) ? "sent" : "failed" };
    },
    async call(to, twimlUrl) {
      sent.push({ kind: "call", to, body: twimlUrl });
      if (!enabled) {
        log(`[demo call] to=${to} url=${twimlUrl}`);
        return { status: "logged" };
      }
      return { status: (await post("Calls.json", { To: to, From: cfg.TWILIO_FROM_NUMBER, Url: twimlUrl, Method: "POST" })) ? "queued" : "failed" };
    },
  };
}

/** Validate Twilio's X-Twilio-Signature (HMAC-SHA1 of URL + sorted form params). */
export function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", authToken).update(data).digest("base64");
  const a = Buffer.from(expected), b = Buffer.from(signature || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
