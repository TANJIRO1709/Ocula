"""Confidence model, including the "Honest Eye" behaviour signals captured during the tests.

Score in [0, 100]. Each component contributes a penalty with a short human-readable reason so staff can
see *why* Ocula is unsure. Below the referral threshold, Ocula recommends a full refraction instead of
recommending lenses with false precision.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean, pstdev

REFER_BELOW = 55.0


@dataclass
class HonestEyeReport:
    squint_rate: float = 0.0
    lean_rate: float = 0.0
    gaze_off_rate: float = 0.0
    blink_rate_per_min: float | None = None
    rt_cv: float | None = None  # response-time coefficient of variation
    fast_guess_rate: float = 0.0
    events: list[str] = field(default_factory=list)
    score: float = 100.0  # 100 = no signs of struggle/guessing

    def dict(self) -> dict:
        return self.__dict__.copy()


def honest_eye(trials: list[dict], duration_s: float | None = None, blinks: int | None = None) -> HonestEyeReport:
    """trials: [{correct, response_ms, squint, lean, gaze_on_target, logmar}]"""
    rep = HonestEyeReport()
    n = len(trials)
    if n == 0:
        return rep
    rep.squint_rate = round(sum(1 for t in trials if t.get("squint")) / n, 2)
    rep.lean_rate = round(sum(1 for t in trials if t.get("lean")) / n, 2)
    rep.gaze_off_rate = round(sum(1 for t in trials if t.get("gaze_on_target") is False) / n, 2)
    rts = [float(t["response_ms"]) for t in trials if t.get("response_ms")]
    if len(rts) >= 3:
        rep.rt_cv = round(pstdev(rts) / max(1.0, mean(rts)), 2)
        rep.fast_guess_rate = round(sum(1 for r in rts if r < 350) / len(rts), 2)
    if duration_s and blinks is not None and duration_s > 10:
        rep.blink_rate_per_min = round(blinks / duration_s * 60, 1)

    penalty = 0.0
    if rep.squint_rate > 0.15:
        penalty += min(25, rep.squint_rate * 60)
        rep.events.append(f"Squinting on {round(rep.squint_rate * 100)}% of letters")
    if rep.lean_rate > 0.15:
        penalty += min(20, rep.lean_rate * 50)
        rep.events.append(f"Leaned closer on {round(rep.lean_rate * 100)}% of letters")
    if rep.gaze_off_rate > 0.2:
        penalty += min(20, rep.gaze_off_rate * 40)
        rep.events.append("Often looked away from the letter")
    if rep.fast_guess_rate > 0.25:
        penalty += 15
        rep.events.append("Many very fast answers (possible guessing)")
    if rep.blink_rate_per_min is not None:
        if rep.blink_rate_per_min < 6:
            rep.events.append("Very low blink rate (possible eye strain / dry eye)")
        elif rep.blink_rate_per_min > 35:
            rep.events.append("High blink rate (possible irritation or strain)")
    rep.score = round(max(0.0, 100 - penalty), 1)
    return rep


@dataclass
class Confidence:
    score: float
    level: str  # high | medium | low
    reasons: list[str]
    refer: bool

    def dict(self) -> dict:
        return self.__dict__.copy()


def compute_confidence(*, calibration: dict, acuity_reliability: float | None, sphere_reliable: bool,
                       honest: HonestEyeReport | None, tests_done: set[str], lighting_ok: bool | None) -> Confidence:
    score = 100.0
    reasons: list[str] = []

    if not calibration.get("card_calibrated"):
        score -= 15
        reasons.append("Screen not calibrated with a card (letter sizes estimated)")
    if not calibration.get("distance_tracking"):
        score -= 15
        reasons.append("Live distance tracking unavailable (camera off or face not found)")
    if lighting_ok is False:
        score -= 10
        reasons.append("Room lighting outside the recommended range")
    if acuity_reliability is not None and acuity_reliability < 0.8:
        score -= (0.8 - acuity_reliability) * 50
        reasons.append("Inconsistent answers on the letter test")
    if not sphere_reliable:
        score -= 15
        reasons.append("Far point outside the phone's reliable range (power estimated from blur only)")
    core = {"acuity", "far_point", "near_point", "astigmatism"}
    missing = core - tests_done
    if missing:
        score -= 8 * len(missing)
        reasons.append("Skipped tests: " + ", ".join(sorted(missing)))
    if honest is not None and honest.score < 100:
        score -= (100 - honest.score) * 0.4
        reasons.extend(honest.events)

    score = round(max(0.0, min(100.0, score)), 1)
    level = "high" if score >= 75 else "medium" if score >= REFER_BELOW else "low"
    return Confidence(score=score, level=level, reasons=reasons, refer=score < REFER_BELOW)
