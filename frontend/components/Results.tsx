"use client";

import Link from "next/link";
import { useState } from "react";
import { Banner } from "@/components/ui";
import { API_URL, api, getStaff, openFile } from "@/lib/api";
import { fmtD } from "@/lib/optics";
import { speak, stopSpeaking } from "@/lib/speech";

type Product = { sku: string; name: string; family: string; reasons: string[]; description?: string; price_inr?: number | null; lens_index?: number | null };

export function Results({ session, token }: { session: any; token: string | null }) {
  const r = session.result;
  const [speaking, setSpeaking] = useState(false);
  const [outcome, setOutcome] = useState<boolean | null>(session.purchased);
  const staff = getStaff();
  if (!r) return <Banner level="info">This screening hasn&apos;t been completed yet.</Banner>;

  const conf = r.confidence;
  const passport = session.customer?.passport_token as string | undefined;
  const passportUrl = passport ? `${window.location.origin}/passport/${passport}` : null;
  const share = `Ocula eye check: ${r.products.design?.name ?? "results"}. ${passportUrl ? `My Vision Passport: ${passportUrl}` : ""}`;
  const p = r.products;
  const lensItems: Product[] = [p.design, p.index, ...p.coatings, ...p.features].filter(Boolean);
  const thick = Object.entries(r.thickness_compare as Record<string, { edge_max_mm: number; center_mm: number }>);
  const maxEdge = Math.max(...thick.map(([, v]) => Math.max(v.edge_max_mm, v.center_mm)), 1);
  const minus = Math.min(r.eyes.R.sphere, r.eyes.L.sphere) < 0;

  const readAloud = async () => {
    if (speaking) {
      stopSpeaking();
      return setSpeaking(false);
    }
    setSpeaking(true);
    await speak(session.explanation?.text ?? "", session.explanation?.language ?? "en");
    setSpeaking(false);
  };

  const mark = async (purchased: boolean) => {
    await api(`/sessions/${session.id}/outcome`, { body: { purchased, sku: p.design?.sku ?? null } });
    setOutcome(purchased);
  };

  return (
    <div className="flex flex-col gap-5">
      {r.referral_level === "urgent" && (
        <Banner level="urgent">
          <h2 className="text-2xl font-bold">See an eye doctor today</h2>
          <ul className="mt-2 list-disc pl-5">{r.flags.filter((f: any) => f.level === "urgent").map((f: any) => <li key={f.code}>{f.reason}</li>)}</ul>
          <a className="btn mt-3 bg-red-600 text-white" href="https://www.google.com/maps/search/eye+hospital+near+me" target="_blank" rel="noreferrer">🏥 Nearest eye hospital</a>
        </Banner>
      )}
      {r.referral_level === "soon" && <Banner level="soon"><b>Optometrist visit recommended soon.</b> {r.flags.filter((f: any) => f.level === "soon").map((f: any) => f.reason).join(" · ")}</Banner>}

      {/* explanation */}
      <section className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label">In simple words</p>
            <p className="mt-2 text-lg leading-relaxed">{session.explanation?.text}</p>
          </div>
          <button className="btn-ghost shrink-0 !px-3" onClick={readAloud} aria-label="Read aloud">{speaking ? "⏹" : "🔊"}</button>
        </div>
      </section>

      {/* estimated refraction */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between bg-navy px-5 py-3 text-white">
          <h2 className="font-display text-lg font-semibold">Estimated vision profile</h2>
          <span className="text-xs text-slate-300">estimate · not a prescription</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="p-3">Eye</th><th className="p-3">Sphere</th><th className="p-3">Range</th><th className="p-3">Cyl × Axis</th><th className="p-3">Acuity</th></tr>
            </thead>
            <tbody>
              {(["R", "L"] as const).map((e) => {
                const x = r.eyes[e];
                return (
                  <tr key={e} className="border-t">
                    <td className="p-3 font-bold">{e === "R" ? "Right" : "Left"}</td>
                    <td className="p-3 font-display text-lg font-bold">{fmtD(x.sphere)}</td>
                    <td className="p-3 text-slate-500">{fmtD(x.sphere_range[0])} to {fmtD(x.sphere_range[1])}</td>
                    <td className="p-3">{x.cyl ? `${fmtD(x.cyl)} × ${x.axis}°` : "—"}</td>
                    <td className="p-3">{x.snellen ?? "—"} <span className="text-xs text-slate-400">({x.acuity_type})</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
          {[
            ["Reading add", r.add ? fmtD(r.add) : "None"],
            ["PD", r.measurements?.pd_mm ? `${r.measurements.pd_mm} mm` : "—"],
            ["Face shape", r.measurements?.face?.shape ?? "—"],
            ["Contrast", r.contrast?.log_cs ? `${r.contrast.log_cs} logCS` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="bg-white p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">{k}</div><div className="mt-1 text-lg font-semibold capitalize">{v}</div></div>
          ))}
        </div>
      </section>

      {/* confidence + honest eye */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="label">Confidence</p>
          <div className="mt-3 flex items-center gap-4">
            <Gauge value={conf.score} />
            <div><div className="font-display text-2xl font-bold capitalize">{conf.level}</div><div className="text-sm text-slate-500">{conf.refer ? "Full eye test recommended" : "OK for lens advice"}</div></div>
          </div>
          {conf.reasons.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">{conf.reasons.map((x: string) => <li key={x}>{x}</li>)}</ul>}
        </div>
        <div className="card p-5">
          <p className="label">Honest Eye</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <Metric k="Squinting" v={`${Math.round(r.honest_eye.squint_rate * 100)}%`} />
            <Metric k="Leaning in" v={`${Math.round(r.honest_eye.lean_rate * 100)}%`} />
            <Metric k="Looked away" v={`${Math.round(r.honest_eye.gaze_off_rate * 100)}%`} />
            <Metric k="Blinks / min" v={r.honest_eye.blink_rate_per_min ?? "—"} />
          </div>
          <p className="mt-3 text-sm text-slate-600">{r.honest_eye.events.length ? r.honest_eye.events.join(" · ") : "No signs of struggling or guessing were detected."}</p>
        </div>
      </section>

      {/* recommendations */}
      {!r.retail_paused && (
        <section className="card p-5">
          <p className="label">Recommended lenses</p>
          <div className="mt-3 grid gap-3">
            {lensItems.map((it) => (
              <div key={it.sku} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-display text-lg font-semibold">{it.name}</div><div className="text-xs uppercase tracking-wider text-slate-400">{it.family}</div></div>
                  {it.price_inr ? <span className="font-semibold">₹{it.price_inr.toLocaleString("en-IN")}</span> : null}
                </div>
                {it.reasons?.[0] && <p className="mt-2 text-sm text-slate-700">{it.reasons[0]}</p>}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">Ruleset {r.recommendation.ruleset_version} · rules fired: {r.recommendation.fired.join(", ")}</p>
        </section>
      )}

      {/* thickness compare */}
      {!r.retail_paused && (
        <section className="card p-5">
          <p className="label">How thick will my lenses be?</p>
          <p className="mt-1 text-sm text-slate-600">{minus ? "Edge" : "Centre"} thickness in a typical 52 mm frame for your stronger eye.</p>
          <div className="mt-4 space-y-3">
            {thick.map(([idx, v]) => {
              const val = minus ? v.edge_max_mm : v.center_mm;
              return (
                <div key={idx} className="flex items-center gap-3">
                  <span className="w-14 text-sm font-bold">{Number(idx).toFixed(2)}</span>
                  <div className="h-7 flex-1 rounded-r-lg bg-slate-100"><div className="h-full rounded-r-lg bg-teal" style={{ width: `${(100 * val) / maxEdge}%` }} /></div>
                  <span className="w-16 text-right text-sm font-semibold">{val.toFixed(1)} mm</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* frames */}
      {!r.retail_paused && r.frames?.length > 0 && (
        <section className="card p-5">
          <p className="label">Frames that suit you</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {r.frames.map((f: any) => (
              <div key={f.sku} className="rounded-2xl border border-slate-200 p-4">
                <div className="font-semibold">{f.name}</div>
                <div className="text-xs text-slate-500">{f.shape} · {f.a}-{f.dbl} · edge ≈ {f.thickness.edge_max_mm} mm</div>
                {f.notes?.[0] && <p className="mt-2 text-sm text-slate-600">{f.notes[0]}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* actions */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Link className="btn-dark" href={`/simulate?sid=${session.id}`}>👓 See Through My Eyes</Link>
        <Link className="btn-dark" href={`/tryon?sid=${session.id}`}>🪞 Try frames (AR)</Link>
        <button className="btn-ghost" onClick={() => openFile(`/sessions/${session.id}/report.pdf`, token)}>📄 PDF report</button>
        <a className="btn bg-[#25D366] text-white" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer">WhatsApp</a>
      </section>

      {passport && (
        <section className="card flex items-center gap-4 p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${API_URL}/passport/${passport}/qr.png`} alt="Vision Passport QR code" className="h-28 w-28 rounded-xl" />
          <div>
            <p className="label">Vision Passport</p>
            <p className="mt-1 text-sm text-slate-600">Scan at any Ocula store to compare with this visit.</p>
            <Link href={`/passport/${passport}`} className="text-sm font-semibold text-teal underline">Open passport</Link>
          </div>
        </section>
      )}

      {staff && (
        <section className="card p-5">
          <p className="label">Staff · outcome</p>
          <div className="mt-3 flex gap-2">
            <button className={`btn flex-1 ${outcome === true ? "bg-teal text-white" : "btn-ghost"}`} onClick={() => mark(true)}>Purchased</button>
            <button className={`btn flex-1 ${outcome === false ? "bg-navy text-white" : "btn-ghost"}`} onClick={() => mark(false)}>Not purchased</button>
          </div>
        </section>
      )}

      <p className="text-xs leading-relaxed text-slate-500">{r.disclaimer}</p>
    </div>
  );
}

function Metric({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{k}</div><div className="font-semibold">{v}</div></div>;
}

function Gauge({ value }: { value: number }) {
  const r = 34, c = 2 * Math.PI * r;
  const color = value >= 75 ? "#0F766E" : value >= 55 ? "#F59E0B" : "#DC2626";
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`Confidence ${value} of 100`}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="#E2E8F0" strokeWidth="9" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="9" strokeDasharray={`${(c * value) / 100} ${c}`} strokeLinecap="round" transform="rotate(-90 44 44)" />
      <text x="44" y="50" textAnchor="middle" fontSize="20" fontWeight="700" fill="#0B1A2C">{Math.round(value)}</text>
    </svg>
  );
}
