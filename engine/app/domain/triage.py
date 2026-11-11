"""Red-flag triage. Any urgent flag stops the retail flow and shows a referral.

Ocula is a screening and retail-assist tool, not a diagnostic device: triage only decides *whether and how
quickly* someone should see an eye-care professional.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

LEVEL_ORDER = {"urgent": 3, "soon": 2, "routine": 1}


@dataclass
class Flag:
    code: str
    level: str  # urgent | soon | routine
    reason: str
    source: str  # interview | test | selfie | profile

    def dict(self) -> dict:
        return asdict(self)


INTERVIEW_FLAGS: dict[str, tuple[str, str]] = {
    "sudden_vision_loss": ("urgent", "Sudden loss or dimming of vision"),
    "flashes_floaters": ("urgent", "New flashes of light or a shower of floaters"),
    "curtain_shadow": ("urgent", "A curtain or shadow across the vision"),
    "eye_pain": ("urgent", "Eye pain"),
    "eye_injury": ("urgent", "Recent eye injury or chemical exposure"),
    "red_painful_eye": ("urgent", "Red, painful eye"),
    "double_vision_sudden": ("urgent", "Sudden double vision"),
    "halos_headache": ("urgent", "Halos around lights with headache or nausea"),
}


def triage_profile(profile: dict) -> list[Flag]:
    flags: list[Flag] = []
    for code in profile.get("red_flags", []) or []:
        level, reason = INTERVIEW_FLAGS.get(code, ("soon", code.replace("_", " ").capitalize()))
        flags.append(Flag(code, level, reason, "interview"))
    if profile.get("diabetes"):
        flags.append(Flag("diabetes_annual_exam", "routine", "Diabetes: yearly dilated eye exam recommended", "profile"))
    age = profile.get("age")
    if isinstance(age, int | float) and age >= 60:
        flags.append(Flag("age_60_full_exam", "routine", "Age 60+: full eye health check recommended (cataract, glaucoma)", "profile"))
    if profile.get("family_glaucoma"):
        flags.append(Flag("family_glaucoma", "soon", "Family history of glaucoma: pressure check recommended", "profile"))
    return flags


def triage_tests(summary: dict) -> list[Flag]:
    flags: list[Flag] = []
    if summary.get("amsler_distortion"):
        flags.append(Flag("amsler_distortion", "urgent", "Wavy or missing areas on the Amsler grid (possible macular problem)", "test"))
    best = summary.get("best_logmar")
    if best is not None and best >= 0.5 and not summary.get("explained_by_refraction", False):
        flags.append(Flag("low_best_acuity", "soon", "Vision remains reduced (6/19 or worse) — needs a full exam", "test"))
    diff = summary.get("interocular_logmar_diff")
    if diff is not None and diff >= 0.2:
        flags.append(Flag("acuity_asymmetry", "soon", "Two-line or greater difference between the eyes", "test"))
    if summary.get("contrast_reduced"):
        flags.append(Flag("reduced_contrast", "soon", "Reduced contrast sensitivity (cataract / night-driving risk)", "test"))
    if summary.get("color_deficiency"):
        flags.append(Flag("color_vision", "routine", "Possible colour-vision deficiency — confirm with a clinical test", "test"))
    if summary.get("near_below_age_norm"):
        flags.append(Flag("low_accommodation", "routine", "Focusing range below what is expected for age", "test"))
    return flags


def triage_selfie(m: dict) -> list[Flag]:
    flags: list[Flag] = []
    hb = m.get("hirschberg") or {}
    if hb.get("deviation_prism", 0) >= 15:
        flags.append(Flag("possible_strabismus", "soon", "Corneal light reflex not centred in both eyes (possible squint)", "selfie"))
    lid = m.get("eyelid_asymmetry")
    if lid is not None and lid >= 0.25:
        flags.append(Flag("eyelid_asymmetry", "routine", "Eyelid opening differs between the eyes (possible droop)", "selfie"))
    return flags


def overall_level(flags: list[Flag]) -> str | None:
    if not flags:
        return None
    return max(flags, key=lambda f: LEVEL_ORDER[f.level]).level
