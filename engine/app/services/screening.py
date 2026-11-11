"""Turns raw test payloads + interview profile + selfie measurements into the final Ocula result."""

from __future__ import annotations

from typing import Any

from app.domain import optics
from app.domain.confidence import compute_confidence, honest_eye
from app.domain.rules.engine import evaluate
from app.domain.thickness import lens_thickness
from app.domain.triage import Flag, overall_level, triage_profile, triage_selfie, triage_tests
from app.vision.measure import suggest_frames

EYES = ("R", "L")
DISTANCE_ACUITY_MIN_M = 1.5
DISCLAIMER = ("Ocula provides an estimated vision profile for screening and lens advice. It is not a prescription "
              "or a medical diagnosis. Please confirm with a qualified optometrist or ophthalmologist.")


def _trials(payload: dict | None) -> list[optics.AcuityTrial]:
    out = []
    for t in (payload or {}).get("trials", []):
        out.append(optics.AcuityTrial(
            logmar=float(t["logmar"]), correct=bool(t["correct"]), distance_m=t.get("distance_m"),
            response_ms=t.get("response_ms"), squint=bool(t.get("squint")), lean=bool(t.get("lean")),
            gaze_on_target=t.get("gaze_on_target", True)))
    return out


def _mean_distance(trials: list[optics.AcuityTrial]) -> float | None:
    ds = [t.distance_m for t in trials if t.distance_m]
    return sum(ds) / len(ds) if ds else None


def analyse_eye(tests: dict, eye: str) -> dict[str, Any]:
    acuity_payload = tests.get(f"acuity_{eye}")
    trials = _trials(acuity_payload)
    acuity = optics.score_acuity(trials) if trials else None
    view_d = _mean_distance(trials) or (acuity_payload or {}).get("nominal_distance_m")
    is_distance_acuity = bool(view_d and view_d >= DISTANCE_ACUITY_MIN_M)

    fp = tests.get(f"far_point_{eye}") or {}
    far_point_m = fp.get("distance_m") if fp.get("blurred", True) else None

    duo = optics.duochrome_interpretation((tests.get(f"duochrome_{eye}") or {}).get("answer"),
                                          bool(tests.get("_wearing_glasses")))
    refr = optics.estimate_sphere(far_point_m, acuity.logmar if (acuity and is_distance_acuity) else None,
                                  duo.get("signal"))
    if fp and not fp.get("blurred", True):
        # Customer could not find a blur point within arm's reach: myopia is low (> about -1.25 D) or absent.
        refr.sources.append("no_blur_within_reach")
        refr.sphere_min = max(refr.sphere_min, -1.25)
        refr.sphere_reliable = True if refr.sphere == 0 else refr.sphere_reliable

    ast = optics.clock_dial_to_cyl(*((tests.get(f"astigmatism_{eye}") or {}).get(k) for k in ("darkest_hour", "severity")))
    amsler = tests.get(f"amsler_{eye}") or {}
    return {
        "sphere": refr.sphere, "sphere_range": [refr.sphere_min, refr.sphere_max], "sphere_reliable": refr.sphere_reliable,
        "cyl": ast["cyl"], "axis": ast["axis"], "se": optics.spherical_equivalent(refr.sphere, ast["cyl"]),
        "acuity_logmar": acuity.logmar if acuity else None, "snellen": acuity.snellen if acuity else None,
        "acuity_reliability": acuity.reliability if acuity else None,
        "acuity_viewing_distance_m": round(view_d, 2) if view_d else None,
        "acuity_type": "distance" if is_distance_acuity else "near/intermediate",
        "duochrome": duo.get("signal"), "sources": refr.sources, "amsler_distortion": bool(amsler.get("distorted")),
    }


def build_facts(profile: dict, eyes: dict, add: float, contrast: dict, progression: float | None) -> dict[str, Any]:
    max_power = max(optics.max_meridian_power(e["sphere"], e["cyl"]) for e in eyes.values())
    return {
        "age": profile.get("age"), "is_child": bool(profile.get("is_child") or (profile.get("age") or 99) < 16),
        "max_power": max_power, "sphere_se": min(e["se"] for e in eyes.values()),
        "cyl_abs": max(abs(e["cyl"]) for e in eyes.values()), "add": add,
        "screen_hours": profile.get("screen_hours") or 0, "outdoor_hours": profile.get("outdoor_hours") or 0,
        "night_driving": bool(profile.get("night_driving")), "sports": bool(profile.get("sports")),
        "desk_work": bool(profile.get("desk_work")), "glare_complaint": bool(profile.get("glare_complaint")),
        "light_sensitive": bool(profile.get("light_sensitive")), "near_complaint": bool(profile.get("near_complaint")),
        "reduced_contrast": bool(contrast.get("reduced")), "progression_d_per_year": progression,
    }


def compute_result(*, tests: dict, profile: dict, measurements: dict, calibration: dict, catalog: list[dict],
                   progression: float | None = None) -> dict[str, Any]:
    tests = {**tests, "_wearing_glasses": profile.get("wears_glasses")}
    eyes = {eye: analyse_eye(tests, eye) for eye in EYES}
    age = profile.get("age")

    # Near point (binocular preferred, else best eye)
    np_payload = tests.get("near_point") or tests.get("near_point_R") or tests.get("near_point_L") or {}
    near = None
    add = 0.0
    if np_payload.get("distance_m"):
        best_sphere = max(eyes["R"]["sphere"], eyes["L"]["sphere"])
        near = optics.near_point_to_add(float(np_payload["distance_m"]), best_sphere,
                                        age=age if isinstance(age, int) else None)
        add = near["add"]
    elif isinstance(age, int) and age >= 45 and profile.get("near_complaint"):
        add = optics.round_quarter(min(2.5, max(0.75, (age - 40) * 0.1 + 0.75)))
        near = {"add": add, "estimated_from_age": True}

    contrast = optics.contrast_log_cs((tests.get("contrast") or {}).get("lowest_contrast"))
    color = tests.get("color") or {}
    color_def = bool(color.get("total")) and color.get("correct", 0) / color["total"] < 0.8

    # Honest Eye (behaviour across both acuity runs)
    all_trials = (tests.get("acuity_R") or {}).get("trials", []) + (tests.get("acuity_L") or {}).get("trials", [])
    behaviour = tests.get("behaviour") or {}
    honest = honest_eye(all_trials, behaviour.get("duration_s"), behaviour.get("blinks"))

    # Triage
    logmars = [e["acuity_logmar"] for e in eyes.values() if e["acuity_logmar"] is not None]
    explained = any(abs(e["se"]) >= 0.75 for e in eyes.values()) or add >= 0.75
    test_summary = {
        "amsler_distortion": any(e["amsler_distortion"] for e in eyes.values()),
        "best_logmar": min(logmars) if logmars else None,
        "interocular_logmar_diff": abs(logmars[0] - logmars[1]) if len(logmars) == 2 else None,
        "explained_by_refraction": explained, "contrast_reduced": contrast.get("reduced"),
        "color_deficiency": color_def, "near_below_age_norm": bool(near and near.get("below_age_norm")),
    }
    flags: list[Flag] = triage_profile(profile) + triage_tests(test_summary) + triage_selfie(measurements)

    # Confidence
    done = {k.split("_")[0] if not k.startswith(("far_point", "near_point")) else "_".join(k.split("_")[:2])
            for k in tests if not k.startswith("_")}
    reliabilities = [e["acuity_reliability"] for e in eyes.values() if e["acuity_reliability"] is not None]
    conf = compute_confidence(
        calibration=calibration, acuity_reliability=min(reliabilities) if reliabilities else None,
        sphere_reliable=all(e["sphere_reliable"] for e in eyes.values()), honest=honest, tests_done=done,
        lighting_ok=calibration.get("lighting_ok"),
    )
    if conf.refer:
        flags.append(Flag("low_confidence", "soon", "Results uncertain — a full eye test is recommended before buying lenses", "test"))

    # Recommendation
    facts = build_facts(profile, eyes, add, contrast, progression)
    rec = evaluate(facts)
    if rec.refer:
        flags.append(Flag("rules_referral", rec.refer, "Professional follow-up recommended for this profile", "profile"))
    referral = overall_level(flags)

    by_sku = {c["sku"]: c for c in catalog}

    def product(sku: str | None) -> dict | None:
        if not sku or sku not in by_sku:
            return None
        c = by_sku[sku]
        return {"sku": sku, "name": c["name"], "family": c["family"], "category": c["category"],
                "description": c.get("description", ""), "lens_index": c.get("lens_index"),
                "price_inr": c.get("price_inr"), "reasons": rec.reasons.get(sku, [])}

    index_value = (by_sku.get(rec.index or "", {}) or {}).get("lens_index") or 1.5
    pd = measurements.get("pd_mm") or 63.0
    worst = max(eyes.values(), key=lambda e: optics.max_meridian_power(e["sphere"], e["cyl"]))
    frames = [c | c.get("attrs", {}) for c in catalog if c["category"] == "frame" and c.get("active", True)]
    frame_suggestions = suggest_frames(
        frames, face=(measurements.get("face") or {}).get("shape"), pd_mm=pd, sphere=worst["sphere"], cyl=worst["cyl"],
        add=add, lens_index=index_value, is_child=facts["is_child"], sports=facts["sports"])
    thickness_compare = {
        str(idx): lens_thickness(worst["sphere"], worst["cyl"], idx, 52, 18, pd, 36).dict()
        for idx in (1.50, 1.60, 1.67, 1.74)
    }

    urgent = referral == "urgent"
    result = {
        "eyes": eyes,
        "near": near, "add": add,
        "contrast": contrast, "color": {"deficiency_suspected": color_def, **color},
        "measurements": measurements,
        "honest_eye": honest.dict(),
        "confidence": conf.dict(),
        "flags": [f.dict() for f in flags],
        "referral_level": referral,
        "retail_paused": urgent,  # urgent referral: don't sell, send to a doctor
        "recommendation": rec.dict(),
        "products": {
            "design": product(rec.design), "index": product(rec.index),
            "coatings": [p for p in (product(s) for s in rec.coatings) if p],
            "features": [p for p in (product(s) for s in rec.features) if p],
        },
        "frames": frame_suggestions,
        "thickness_compare": thickness_compare,
        "simulation": {
            "R": {"sphere": eyes["R"]["sphere"], "cyl": eyes["R"]["cyl"], "axis": eyes["R"]["axis"]},
            "L": {"sphere": eyes["L"]["sphere"], "cyl": eyes["L"]["cyl"], "axis": eyes["L"]["axis"]},
            "add": add, "age": age, "reduced_contrast": bool(contrast.get("reduced")),
        },
        "facts": facts,
        "disclaimer": DISCLAIMER,
    }
    return result
