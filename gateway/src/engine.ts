/** HTTP client for the FastAPI Ocula Engine (clinical intelligence service). */
import type { Config } from "./config.js";
import { HttpError } from "./errors.js";

export interface Engine {
  interviewStart(body: { mode: string; language: string; profile: Record<string, unknown> }): Promise<any>;
  interviewStep(body: { state: Record<string, unknown>; reply: string }): Promise<any>;
  compute(body: Record<string, unknown>): Promise<{ result: any; explanation: any }>;
  selfie(body: Record<string, unknown>): Promise<any>;
  thickness(body: Record<string, unknown>): Promise<any>;
  sessionReport(body: { session: unknown; passport_url: string | null }): Promise<Buffer>;
  campReport(body: { camp: unknown; students: unknown[] }): Promise<Buffer>;
  qr(data: string): Promise<Buffer>;
  health(): Promise<any>;
}

export class HttpEngine implements Engine {
  constructor(private cfg: Config) {}

  private async call(path: string, body?: unknown, binary = false, attempt = 0): Promise<any> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.ENGINE_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.cfg.ENGINE_URL.replace(/\/$/, "")}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", "X-Engine-Key": this.cfg.ENGINE_API_KEY },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      if ([502, 503, 504].includes(res.status) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // engine waking up on a free tier
        return this.call(path, body, binary, attempt + 1);
      }
      if (!res.ok) {
        let detail: unknown = res.statusText;
        try {
          detail = (await res.json()).detail ?? detail;
        } catch {
          /* not JSON */
        }
        throw new HttpError(res.status >= 500 ? 502 : res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      return binary ? Buffer.from(await res.arrayBuffer()) : res.json();
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (attempt < 1) return this.call(path, body, binary, attempt + 1);
      throw new HttpError(502, `Ocula engine unavailable: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  interviewStart = (b: any) => this.call("/v1/interview/start", b);
  interviewStep = (b: any) => this.call("/v1/interview/step", b);
  compute = (b: any) => this.call("/v1/compute", b);
  selfie = (b: any) => this.call("/v1/selfie", b);
  thickness = (b: any) => this.call("/v1/thickness", b);
  sessionReport = (b: any) => this.call("/v1/report/session", b, true);
  campReport = (b: any) => this.call("/v1/report/camp", b, true);
  qr = (data: string) => this.call("/v1/qr", { data }, true);
  health = () => this.call("/healthz");
}
