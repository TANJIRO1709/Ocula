"""Optics math for phone-based screening.

All functions are pure and unit-tested. Distances are in metres unless stated, powers in dioptres (D).

Key relations
-------------
* A 6/6 (logMAR 0.0) optotype subtends 5 arcmin -> letter height = d * tan(5') ~= 1.454 mm per metre.
* Far point of an uncorrected myope at distance d -> spherical refraction ~= -1/d.
* Near point at distance d -> accommodation amplitude A = 1/d + Rx (Rx = distance refraction).
* Reading addition keeps half the amplitude in reserve: ADD = demand - A/2.
* Clock-dial astigmatism: minus-cylinder axis = (darkest line's lower clock hour) x 30.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from statistics import mean, pstdev
from typing import Any

ARCMIN_5 = math.radians(5 / 60)
IRIS_DIAMETER_MM = 11.7  # population mean horizontal visible iris diameter (approx.)


def round_quarter(x: float) -> float:
    return round(x * 4) / 4


def letter_height_mm(logmar: float, distance_m: float) -> float:
    """Physical height of a 5x5 optotype for a given logMAR at a viewing distance."""
    return distance_m * 1000 * math.tan(ARCMIN_5) * (10 ** logmar)


def logmar_to_snellen(logmar: float, base: int = 6) -> str:
    denom = base * (10 ** logmar)
    return f"{base}/{round(denom)}"


def distance_from_iris(iris_px: float, focal_px: float) -> float:
    """Pinhole camera model: distance (m) = f(px) * real size(mm) / image size(px) / 1000."""
    if iris_px <= 0 or focal_px <= 0:
        raise ValueError("iris_px and focal_px must be positive")
    return focal_px * IRIS_DIAMETER_MM / iris_px / 1000


# ---------------------------------------------------------------- acuity

@dataclass
class AcuityTrial:
    logmar: float
    correct: bool
    distance_m: float | None = None
    response_ms: float | None = None
    squint: bool = False
    lean: bool = False
    gaze_on_target: bool = True


@dataclass
class AcuityResult:
    logmar: float | None
    snellen: str | None
    reliability: float  # 0..1
    n_trials: int
    reversals: int
    flags: list[str] = field(default_factory=list)


def score_acuity(trials: list[AcuityTrial], line_pass_ratio: float = 0.6, min_per_line: int = 2) -> AcuityResult:
    """Threshold = smallest logMAR line passed (>= line_pass_ratio correct, >= min_per_line trials).

    Lines are corrected for the distance the customer actually sat at (live iris tracking): a letter shown
    for logMAR L at nominal distance but viewed from further away is effectively smaller.
    """
    if not trials:
        return AcuityResult(None, None, 0.0, 0, 0, ["no_trials"])

    lines: dict[float, list[bool]] = {}
    for t in trials:
        lines.setdefault(round(t.logmar, 1), []).append(t.correct)

    passed = [lm for lm, res in lines.items() if len(res) >= min_per_line and sum(res) / len(res) >= line_pass_ratio]
    flags: list[str] = []
    if not passed:
        threshold = max(lines) + 0.1  # failed even the largest line shown
        flags.append("failed_largest_line")
    else:
        threshold = min(passed)

    # staircase reversals (direction changes) – more reversals = more stable estimate
    reversals = 0
    for a, b, c in zip(trials, trials[1:], trials[2:]):
        if (b.logmar - a.logmar) * (c.logmar - b.logmar) < 0:
            reversals += 1

    # Inconsistency: correct answers on lines smaller than threshold that later failed bigger lines
    inconsistent = sum(1 for lm, res in lines.items() if lm < threshold and sum(res) / len(res) >= 0.5)
    reliability = 1.0
    reliability -= min(0.4, 0.1 * inconsistent)
    if len(trials) < 8:
        reliability -= 0.2
        flags.append("few_trials")
    if reversals < 2:
        reliability -= 0.1
    reliability = max(0.0, min(1.0, reliability))
    threshold = round(max(-0.3, min(1.3, threshold)), 2)
    return AcuityResult(threshold, logmar_to_snellen(threshold), reliability, len(trials), reversals, flags)


def acuity_to_myopia_estimate(logmar: float | None) -> float | None:
    """Very rough blur-to-refraction mapping for uncorrected *distance* acuity (myopia only).

    Empirically ~0.1 logMAR per 0.25-0.3 D for low myopia. Used only as a secondary signal.
    """
    if logmar is None:
        return None
    if logmar <= 0.1:
        return 0.0
    return -round_quarter(min(6.0, (logmar - 0.0) / 0.35))


# ---------------------------------------------------------------- refraction estimates

MAX_RELIABLE_FAR_POINT_M = 1.0  # beyond ~1 m (≈ -1.00 D) phone-based far point is unreliable
MIN_RELIABLE_FAR_POINT_M = 0.15  # closer than 15 cm (≈ -6.5 D) is hard to measure


def far_point_to_sphere(far_point_m: float) -> tuple[float, bool]:
    """Returns (sphere estimate, within_reliable_range)."""
    if far_point_m <= 0:
        raise ValueError("far point must be positive")
    sphere = -1.0 / far_point_m
    reliable = MIN_RELIABLE_FAR_POINT_M <= far_point_m <= MAX_RELIABLE_FAR_POINT_M
    return round_quarter(sphere), reliable


def hofstetter_min_amplitude(age: int) -> float:
    return max(0.0, 15 - 0.25 * age)


def hofstetter_mean_amplitude(age: int) -> float:
    return max(0.0, 18.5 - 0.3 * age)


def near_point_to_add(near_point_m: float, distance_sphere: float = 0.0, working_distance_m: float = 0.40,
                      age: int | None = None) -> dict[str, Any]:
    """Estimate accommodation amplitude and reading addition.

    near_point_m is measured *uncorrected*. For a myope the uncorrected near point already benefits from
    their myopia, so amplitude = 1/np + sphere (sphere is negative for myopes).
    """
    if near_point_m <= 0:
        raise ValueError("near point must be positive")
    amplitude = max(0.0, 1.0 / near_point_m + distance_sphere)
    demand = 1.0 / working_distance_m
    # ADD is prescribed on top of the full distance correction, so it depends only on the corrected amplitude.
    add = max(0.0, demand - amplitude / 2)
    add = round_quarter(min(3.5, add))
    out: dict[str, Any] = {"amplitude": round(amplitude, 2), "add": add, "working_distance_m": working_distance_m}
    if age is not None:
        expected_min = hofstetter_min_amplitude(age)
        out["expected_min_amplitude"] = round(expected_min, 2)
        out["below_age_norm"] = amplitude < expected_min - 1.0
    return out


def clock_dial_to_cyl(darkest_hour: int | None, severity: str | None) -> dict[str, Any]:
    """Clock dial: customer reports the darkest/sharpest line (1-12) and how much it stands out.

    Axis (minus cylinder) = lower clock number of the darkest line x 30; severity maps to a cylinder band.
    """
    if not darkest_hour or severity in (None, "none", "equal"):
        return {"cyl": 0.0, "axis": None, "present": False}
    hour = darkest_hour % 12 or 12
    lower = hour if hour <= 6 else hour - 6
    axis = lower * 30
    cyl = {"slight": -0.75, "moderate": -1.25, "strong": -2.0}.get(severity or "slight", -0.75)
    return {"cyl": cyl, "axis": axis, "present": True}


def duochrome_interpretation(answer: str | None, wearing_glasses: bool) -> dict[str, Any]:
    """Red sharper -> eye focuses in front of retina (myopic / under-minus); green -> hyperopic / over-minus."""
    if answer not in ("red", "green", "equal"):
        return {"signal": None}
    if answer == "equal":
        return {"signal": "balanced"}
    if wearing_glasses:
        return {"signal": "under_corrected" if answer == "red" else "over_corrected"}
    return {"signal": "myopic" if answer == "red" else "hyperopic"}


def contrast_log_cs(lowest_contrast_read: float | None) -> dict[str, Any]:
    """Pelli-Robson style: logCS = -log10(lowest Weber contrast correctly identified)."""
    if not lowest_contrast_read or lowest_contrast_read <= 0:
        return {"log_cs": None, "reduced": None}
    log_cs = round(-math.log10(lowest_contrast_read), 2)
    return {"log_cs": log_cs, "reduced": log_cs < 1.35}


@dataclass
class EyeRefraction:
    sphere: float
    sphere_min: float
    sphere_max: float
    cyl: float
    axis: int | None
    sources: list[str]
    sphere_reliable: bool


def estimate_sphere(far_point_m: float | None, acuity_logmar: float | None, duochrome_signal: str | None) -> EyeRefraction:
    """Fuse far point, acuity blur and duochrome into one sphere estimate with an uncertainty range."""
    sources: list[str] = []
    estimates: list[tuple[float, float]] = []  # (value, weight)
    reliable = False

    if far_point_m:
        sph, ok = far_point_to_sphere(far_point_m)
        estimates.append((sph, 3.0 if ok else 0.8))
        sources.append("far_point" if ok else "far_point_out_of_range")
        reliable = ok
    acuity_est = acuity_to_myopia_estimate(acuity_logmar)
    if acuity_est is not None:
        estimates.append((acuity_est, 1.0))
        sources.append("acuity")

    if not estimates:
        return EyeRefraction(0.0, -0.5, 0.5, 0.0, None, ["none"], False)

    total_w = sum(w for _, w in estimates)
    sph = round_quarter(sum(v * w for v, w in estimates) / total_w)
    spread = max(abs(v - sph) for v, _ in estimates)
    half_range = max(0.25, round_quarter(spread + (0.25 if reliable else 0.75)))

    if duochrome_signal == "hyperopic" and sph >= 0:
        sources.append("duochrome_hyperopia_hint")
        return EyeRefraction(sph, sph - 0.25, sph + 1.5, 0.0, None, sources, False)
    if duochrome_signal == "myopic" and sph == 0:
        sources.append("duochrome_myopia_hint")
        sph = -0.25
    return EyeRefraction(sph, sph - half_range, sph + half_range, 0.0, None, sources, reliable)


def spherical_equivalent(sphere: float, cyl: float) -> float:
    return sphere + cyl / 2


def max_meridian_power(sphere: float, cyl: float) -> float:
    """Largest absolute power across meridians (drives lens thickness / index choice)."""
    return max(abs(sphere), abs(sphere + cyl))


def summarize_variability(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    return round(pstdev(values) / (abs(mean(values)) + 1e-6), 3)
