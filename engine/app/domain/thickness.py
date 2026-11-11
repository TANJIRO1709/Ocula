"""Lens thickness model (used for the AR thickness try-on and index advice).

Uses the sag formula s = r - sqrt(r^2 - y^2) with a thin-lens approximation where all power sits on one
surface (r = (n-1)/|F|). Good to within ~10-15% of lab calculations — enough to *compare* frames and
indices, which is what the customer needs.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

MIN_CENTER_MINUS_MM = {1.50: 2.0, 1.59: 1.5, 1.60: 1.5, 1.67: 1.4, 1.74: 1.3}
MIN_EDGE_PLUS_MM = 1.0


@dataclass
class ThicknessResult:
    center_mm: float
    edge_max_mm: float
    edge_min_mm: float
    effective_diameter_mm: float
    decentration_mm: float
    lens_index: float
    weight_index: float  # relative volume vs a 1.50 lens of the same Rx and frame (1.0 = same)

    def dict(self) -> dict:
        return asdict(self)


def _sag(power_d: float, index: float, y_mm: float) -> float:
    if abs(power_d) < 1e-6:
        return 0.0
    r_mm = (index - 1) / abs(power_d) * 1000
    y = min(y_mm, r_mm * 0.999)
    return r_mm - math.sqrt(r_mm * r_mm - y * y)


def lens_thickness(sphere: float, cyl: float, index: float, frame_a: float, frame_dbl: float,
                   pd_mm: float, frame_b: float | None = None) -> ThicknessResult:
    """Estimate centre / edge thickness for one lens in a frame.

    frame_a = eye size (lens width), frame_dbl = bridge, pd_mm = binocular PD.
    """
    frame_pd = frame_a + frame_dbl
    decentration = max(0.0, (frame_pd - pd_mm) / 2)
    # farthest edge point from optical centre: half the eye size + decentration (+ a small blank margin)
    b = frame_b or frame_a * 0.7
    half_diag = math.hypot(frame_a / 2, b / 2)
    y_far = half_diag + decentration
    y_near = max(0.0, frame_a / 2 - decentration)
    ed = 2 * y_far

    p_strong = sphere + cyl if abs(sphere + cyl) > abs(sphere) else sphere
    p_weak = sphere if p_strong != sphere else sphere + cyl
    idx = round(index, 2)

    if p_strong < 0:  # minus lens: thin centre, thick edge
        tc = MIN_CENTER_MINUS_MM.get(idx, 1.8)
        edge_max = tc + _sag(p_strong, index, y_far)
        edge_min = tc + _sag(p_weak, index, y_near) if p_weak < 0 else tc
        center = tc
    else:  # plus lens: thick centre, thin edge
        center = MIN_EDGE_PLUS_MM + _sag(p_strong, index, y_far)
        edge_max = MIN_EDGE_PLUS_MM + max(0.0, _sag(p_strong, index, y_far) - _sag(p_strong, index, y_near))
        edge_min = MIN_EDGE_PLUS_MM

    ref = None
    if abs(index - 1.50) > 1e-6:
        ref = lens_thickness(sphere, cyl, 1.50, frame_a, frame_dbl, pd_mm, frame_b)
    vol = (center + edge_max) / 2
    weight_index = round(vol / ((ref.center_mm + ref.edge_max_mm) / 2), 2) if ref else 1.0

    return ThicknessResult(
        center_mm=round(center, 1), edge_max_mm=round(edge_max, 1), edge_min_mm=round(edge_min, 1),
        effective_diameter_mm=round(ed, 1), decentration_mm=round(decentration, 1), lens_index=index,
        weight_index=weight_index,
    )
