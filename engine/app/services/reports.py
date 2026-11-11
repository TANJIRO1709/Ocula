"""PDF reports (customer report + school camp class report) and QR codes."""

from __future__ import annotations

import io
from datetime import datetime

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

TEAL = colors.HexColor("#0F766E")
NAVY = colors.HexColor("#0B1A2C")
AMBER = colors.HexColor("#B45309")


def qr_png(data: str, box: int = 8) -> bytes:
    img = qrcode.make(data, box_size=box, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("H", parent=ss["Heading1"], textColor=NAVY, fontSize=20, spaceAfter=4))
    ss.add(ParagraphStyle("H2x", parent=ss["Heading2"], textColor=TEAL, fontSize=13, spaceBefore=10, spaceAfter=4))
    ss.add(ParagraphStyle("Small", parent=ss["BodyText"], fontSize=8, textColor=colors.HexColor("#475569")))
    ss.add(ParagraphStyle("Warn", parent=ss["BodyText"], textColor=AMBER, fontSize=11, leading=14))
    return ss


def _table(rows, widths, header=True):
    t = Table(rows, colWidths=widths)
    style = [("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
             ("FONTSIZE", (0, 0), (-1, -1), 9), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 4)]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white)]
    t.setStyle(TableStyle(style))
    return t


def _p(v) -> str:
    return "—" if v is None else f"{v:+.2f}" if isinstance(v, float) else str(v)


def session_report_pdf(session: dict, passport_url: str | None) -> bytes:
    ss = _styles()
    r = session["result"]
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                            title="Ocula vision screening report")
    el: list = []
    el.append(Paragraph("Ocula — Estimated Vision Profile", ss["H"]))
    cust = session.get("customer") or {}
    meta = f"Session {session['id'][:8]} · {datetime.fromisoformat(session['created_at']).strftime('%d %b %Y %H:%M')}"
    if cust.get("name"):
        meta = f"{cust['name']} · " + meta
    el.append(Paragraph(meta, ss["Small"]))
    el.append(Spacer(1, 6))

    if r.get("retail_paused"):
        el.append(Paragraph("<b>URGENT:</b> please see an eye doctor today. Do not wait to buy glasses.", ss["Warn"]))

    el.append(Paragraph("Estimated refraction (screening estimate — not a prescription)", ss["H2x"]))
    rows = [["Eye", "Sphere (range)", "Cyl", "Axis", "Acuity", "Basis"]]
    for eye, label in (("R", "Right"), ("L", "Left")):
        e = r["eyes"][eye]
        rng = e["sphere_range"]
        rows.append([label, f"{_p(e['sphere'])}  ({_p(rng[0])} to {_p(rng[1])})", _p(e["cyl"]) if e["cyl"] else "—",
                     e["axis"] or "—", f"{e['snellen'] or '—'} ({e['acuity_type']})", ", ".join(e["sources"])[:40]])
    el.append(_table(rows, [16 * mm, 50 * mm, 16 * mm, 14 * mm, 40 * mm, 42 * mm]))
    m = r.get("measurements") or {}
    extra = [["Reading add", _p(r.get("add")) if r.get("add") else "none"],
             ["PD", f"{m.get('pd_mm', '—')} mm (±{m.get('pd_uncertainty_mm', '—')})"],
             ["Face shape", (m.get("face") or {}).get("shape") or "—"],
             ["Contrast (logCS)", (r.get("contrast") or {}).get("log_cs") or "—"],
             ["Confidence", f"{r['confidence']['score']} / 100 ({r['confidence']['level']})"]]
    el.append(Spacer(1, 4))
    el.append(_table(extra, [40 * mm, 138 * mm], header=False))

    el.append(Paragraph("Recommended lenses", ss["H2x"]))
    p = r["products"]
    rows = [["Item", "Why"]]
    for item in [p.get("design"), p.get("index"), *p.get("coatings", []), *p.get("features", [])]:
        if item:
            rows.append([Paragraph(item["name"], ss["BodyText"]), Paragraph(" ".join(item["reasons"][:1]), ss["BodyText"])])
    el.append(_table(rows, [62 * mm, 116 * mm]))

    if r.get("frames"):
        el.append(Paragraph("Suggested frames", ss["H2x"]))
        rows = [["Frame", "Edge thickness", "Notes"]]
        for f in r["frames"][:3]:
            rows.append([f["name"], f"{f['thickness']['edge_max_mm']} mm", Paragraph(" ".join(f["notes"][:2]) or "—", ss["BodyText"])])
        el.append(_table(rows, [55 * mm, 30 * mm, 93 * mm]))

    if r.get("flags"):
        el.append(Paragraph("Health notes &amp; referrals", ss["H2x"]))
        rows = [["Level", "Note"]] + [[f["level"].upper(), Paragraph(f["reason"], ss["BodyText"])] for f in r["flags"]]
        el.append(_table(rows, [22 * mm, 156 * mm]))

    expl = (session.get("explanation") or {}).get("text")
    if expl and (session.get("explanation") or {}).get("language") == "en":
        el.append(Paragraph("In simple words", ss["H2x"]))
        el.append(Paragraph(expl, ss["BodyText"]))

    if passport_url:
        el.append(Spacer(1, 8))
        qr = Image(io.BytesIO(qr_png(passport_url, 4)), width=30 * mm, height=30 * mm)
        el.append(_table([[qr, Paragraph(f"<b>Vision Passport</b><br/>Scan at any Ocula store to see your history.<br/>{passport_url}",
                                         ss["BodyText"])]], [36 * mm, 142 * mm], header=False))
    el.append(Spacer(1, 8))
    el.append(Paragraph(r["disclaimer"] + f" Ruleset {session.get('ruleset_version')}.", ss["Small"]))
    doc.build(el)
    return buf.getvalue()


def camp_report_pdf(camp: dict, students: list[dict]) -> bytes:
    ss = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                            title="Ocula school screening report")
    flagged = [s for s in students if s.get("needs_followup")]
    el = [Paragraph(f"School vision screening — {camp['school']}", ss["H"]),
          Paragraph(f"{camp['name']} · Teacher: {camp.get('teacher') or '—'} · {len(students)} screened · "
                    f"{len(flagged)} need a follow-up eye exam", ss["Small"]), Spacer(1, 8)]
    rows = [["#", "Student", "Class", "Right", "Left", "Follow-up", "Reason"]]
    for i, s in enumerate(sorted(students, key=lambda x: not x.get("needs_followup")), 1):
        rows.append([i, s.get("name") or "—", s.get("school_class") or "—", s.get("right") or "—", s.get("left") or "—",
                     "YES" if s.get("needs_followup") else "no", Paragraph(s.get("reason") or "", ss["Small"])])
    t = _table(rows, [8 * mm, 40 * mm, 16 * mm, 24 * mm, 24 * mm, 18 * mm, 52 * mm])
    for i, s in enumerate(sorted(students, key=lambda x: not x.get("needs_followup")), 1):
        if s.get("needs_followup"):
            t.setStyle(TableStyle([("BACKGROUND", (0, i), (-1, i), colors.HexColor("#FEF3C7"))]))
    el.append(t)
    el.append(Spacer(1, 8))
    el.append(Paragraph("Screening only. Children marked YES should have a full eye examination by an optometrist "
                        "or ophthalmologist. Share results with parents.", ss["Small"]))
    doc.build(el)
    return buf.getvalue()
