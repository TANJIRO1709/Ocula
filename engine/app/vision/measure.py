"""Selfie-derived measurements from on-device facial landmarks (no image ever leaves the phone).

The browser runs MediaPipe Face Landmarker and sends named 2D points in image pixels. We convert to
millimetres with either a bank card held at the face plane (most accurate) or the iris-diameter prior.
"""

from __future__ import annotations

import math
from typing import Any

from app.domain.optics import IRIS_DIAMETER_MM
from app.domain.thickness import lens_thickness

CARD_WIDTH_MM = 85.6
HIRSCHBERG_PRISM_PER_MM = 22.0  # modern Hirschberg ratio ≈ 21–22 prism dioptres per mm of reflex shift

Point = tuple[float, float]


def _pt(p: Any) -> Point:
    if isinstance(p, dict):
        return float(p["x"]), float(p["y"])
    return float(p[0]), float(p[1])


def _dist(a: Any, b: Any) -> float:
    (ax, ay), (bx, by) = _pt(a), _pt(b)
    return math.hypot(ax - bx, ay - by)


def mm_per_px(lm: dict, card_width_px: float | None) -> tuple[float, str]:
    if card_width_px and card_width_px > 20:
        return CARD_WIDTH_MM / card_width_px, "card"
    irises = [d for d in (lm.get("left_iris_diameter_px"), lm.get("right_iris_diameter_px")) if d]
    if not irises:
        raise ValueError("Need iris diameters or a card reference")
    return IRIS_DIAMETER_MM / (sum(irises) / len(irises)), "iris"


def pupillary_distance(lm: dict, scale: float) -> dict[str, float]:
    """Binocular PD plus monocular PDs measured from the nose-bridge midline (landmark 168)."""
    right_c, left_c = lm["right_iris_center"], lm["left_iris_center"]  # subject's right / left
    pd = _dist(right_c, left_c) * scale
    out = {"pd_mm": round(pd, 1)}
    if lm.get("nose_bridge"):
        bx = _pt(lm["nose_bridge"])[0]
        out["pd_right_mm"] = round(abs(_pt(right_c)[0] - bx) * scale, 1)
        out["pd_left_mm"] = round(abs(_pt(left_c)[0] - bx) * scale, 1)
    return out


def face_shape(lm: dict) -> dict[str, Any]:
    """Heuristic face-shape classifier from width/length ratios (used only for frame styling)."""
    need = ("face_top", "chin", "cheek_left", "cheek_right", "jaw_left", "jaw_right", "forehead_left", "forehead_right")
    if not all(k in lm for k in need):
        return {"shape": None}
    length = _dist(lm["face_top"], lm["chin"])
    cheek = _dist(lm["cheek_left"], lm["cheek_right"])
    jaw = _dist(lm["jaw_left"], lm["jaw_right"])
    forehead = _dist(lm["forehead_left"], lm["forehead_right"])
    lr = length / cheek
    jr = jaw / cheek
    fr = forehead / cheek

    if lr >= 1.42:
        shape = "oblong"
    elif fr >= 0.86 and jr <= 0.78:
        shape = "heart"
    elif lr < 1.22 and jr >= 0.86:
        shape = "square"
    elif lr < 1.22:
        shape = "round"
    else:
        shape = "oval"
    return {"shape": shape, "length_to_width": round(lr, 2), "jaw_to_cheek": round(jr, 2),
            "forehead_to_cheek": round(fr, 2), "face_width_px": round(cheek, 1)}


def hirschberg(reflex: dict | None) -> dict[str, Any]:
    """reflex = {right:{dx,dy}, left:{dx,dy}}: reflex offset from iris centre in iris-radius units (image coords).

    A symmetric nasal offset is normal (angle kappa). An asymmetry between the eyes suggests a squint.
    """
    if not reflex or "left" not in reflex or "right" not in reflex:
        return {}
    r_iris_mm = IRIS_DIAMETER_MM / 2
    # convert to "nasal-positive" coordinates: subject's right eye is on image-left, so nasal = +x
    r_nasal = reflex["right"]["dx"] * r_iris_mm
    l_nasal = -reflex["left"]["dx"] * r_iris_mm
    dv = (reflex["right"]["dy"] - reflex["left"]["dy"]) * r_iris_mm
    dh = r_nasal - l_nasal
    dev_mm = math.hypot(dh, dv)
    return {
        "horizontal_mm": round(dh, 2), "vertical_mm": round(dv, 2),
        "deviation_prism": round(dev_mm * HIRSCHBERG_PRISM_PER_MM, 1),
        "type": None if dev_mm * HIRSCHBERG_PRISM_PER_MM < 15 else ("horizontal" if abs(dh) >= abs(dv) else "vertical"),
    }


def eyelid_asymmetry(lm: dict) -> float | None:
    a, b = lm.get("right_eye_aperture_px"), lm.get("left_eye_aperture_px")
    if not a or not b:
        return None
    return round(abs(a - b) / max(a, b), 2)


def analyse_selfie(payload: dict) -> dict[str, Any]:
    lm = payload["landmarks"]
    scale, method = mm_per_px(lm, payload.get("card_width_px"))
    out: dict[str, Any] = {"scale_mm_per_px": round(scale, 4), "scale_method": method}
    out.update(pupillary_distance(lm, scale))
    out["face"] = face_shape(lm)
    out["hirschberg"] = hirschberg(payload.get("reflex"))
    out["eyelid_asymmetry"] = eyelid_asymmetry(lm)
    if payload.get("frame_bottom_y") and lm.get("right_iris_center"):
        out["fitting_height_mm"] = round((payload["frame_bottom_y"] - _pt(lm["right_iris_center"])[1]) * scale, 1)
    out["pd_uncertainty_mm"] = 0.7 if method == "card" else 1.5
    return out


SHAPE_ADVICE = {
    "round": (["rectangle", "square", "cat_eye"], "Angular frames add definition to a round face."),
    "square": (["round", "oval", "aviator"], "Curved frames soften a strong jawline."),
    "oval": (["rectangle", "square", "aviator", "round", "oval", "cat_eye"], "Balanced proportions suit most styles."),
    "heart": (["oval", "round", "aviator"], "Lighter, rounder frames balance a wider forehead."),
    "oblong": (["square", "round", "aviator"], "Deeper frames make a long face look more balanced."),
}


def suggest_frames(frames: list[dict], *, face: str | None, pd_mm: float | None, sphere: float, cyl: float,
                   add: float, lens_index: float, is_child: bool, sports: bool) -> list[dict]:
    """Rank frames by face-shape fit, Rx suitability (thickness) and lifestyle."""
    preferred, why = SHAPE_ADVICE.get(face or "oval", SHAPE_ADVICE["oval"])
    pd = pd_mm or 63.0
    ranked = []
    for f in frames:
        a = f.get("a", 50)
        score, notes = 0.0, []
        if f.get("shape") in preferred:
            score += 3
            notes.append(why)
        th = lens_thickness(sphere, cyl, lens_index, a, f.get("dbl", 18), pd, f.get("b"))
        score -= max(0.0, th.edge_max_mm - 4) * 0.8  # thick edges look heavy
        if abs(sphere) >= 4 and a <= 50:
            score += 1.5
            notes.append("Smaller lens size keeps a strong prescription thin.")
        if add >= 0.75:
            if (f.get("b") or 0) >= 32:
                score += 1.5
                notes.append("Tall enough for a progressive lens (B ≥ 32 mm).")
            else:
                score -= 3
                notes.append("Too shallow for a comfortable progressive.")
        if is_child:
            score += 3 if f.get("kids") else -4
        elif f.get("kids"):
            score -= 6
        if sports and f.get("sport"):
            score += 2
        ranked.append({**f, "score": round(score, 2), "notes": notes, "thickness": th.dict()})
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked[:4]
