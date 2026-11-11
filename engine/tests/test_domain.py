import pytest

from app.agents.extract import extract, find_red_flags, parse_number, parse_yesno
from app.domain import optics
from app.domain.confidence import compute_confidence, honest_eye
from app.domain.rules.engine import evaluate
from app.domain.thickness import lens_thickness
from app.vision.measure import face_shape, hirschberg, pupillary_distance, suggest_frames


# ---------------- optics
def test_letter_height_6_6_at_1m():
    assert optics.letter_height_mm(0.0, 1.0) == pytest.approx(1.454, abs=0.01)
    assert optics.letter_height_mm(1.0, 1.0) == pytest.approx(14.54, abs=0.1)


def test_snellen():
    assert optics.logmar_to_snellen(0.0) == "6/6"
    assert optics.logmar_to_snellen(0.3) == "6/12"
    assert optics.logmar_to_snellen(1.0) == "6/60"


def test_far_point_to_sphere():
    assert optics.far_point_to_sphere(0.5) == (-2.0, True)
    assert optics.far_point_to_sphere(0.25) == (-4.0, True)
    sph, ok = optics.far_point_to_sphere(2.0)
    assert sph == -0.5 and ok is False


def test_near_point_add_presbyope():
    out = optics.near_point_to_add(1.0, 0.0, age=60)  # near point 1 m -> amplitude 1 D
    assert out["amplitude"] == 1.0
    assert out["add"] == 2.0  # 2.5 demand - 0.5 reserve
    young = optics.near_point_to_add(0.08, 0.0, age=20)
    assert young["add"] == 0.0


def test_near_point_myope_amplitude_corrected():
    # A -3 D myope's uncorrected near point (25 cm) mostly reflects the myopia: amplitude is only ~1 D,
    # so with distance glasses they still need a +2.00 reading add.
    out = optics.near_point_to_add(0.25, -3.0, age=50)
    assert out["amplitude"] == 1.0 and out["add"] == 2.0


def test_clock_dial_axis():
    assert optics.clock_dial_to_cyl(3, "moderate") == {"cyl": -1.25, "axis": 90, "present": True}
    assert optics.clock_dial_to_cyl(9, "slight")["axis"] == 90
    assert optics.clock_dial_to_cyl(1, "strong")["axis"] == 30
    assert optics.clock_dial_to_cyl(12, "slight")["axis"] == 180
    assert optics.clock_dial_to_cyl(None, None)["present"] is False


def test_acuity_staircase():
    trials = []
    for lm, ok in [(1.0, 1), (0.8, 1), (0.6, 1), (0.4, 1), (0.4, 1), (0.3, 1), (0.3, 1), (0.2, 0), (0.2, 0), (0.3, 1), (0.2, 0)]:
        trials.append(optics.AcuityTrial(lm, bool(ok)))
    r = optics.score_acuity(trials)
    assert r.logmar == 0.3 and r.snellen == "6/12"


def test_estimate_sphere_fuses_far_point():
    r = optics.estimate_sphere(0.5, 0.6, "myopic")
    assert -2.25 <= r.sphere <= -1.75 and r.sphere_reliable


def test_contrast():
    assert optics.contrast_log_cs(0.02)["log_cs"] == pytest.approx(1.7, abs=0.01)
    assert optics.contrast_log_cs(0.1)["reduced"] is True


# ---------------- thickness
def test_higher_index_is_thinner():
    t150 = lens_thickness(-5, 0, 1.50, 52, 18, 62)
    t174 = lens_thickness(-5, 0, 1.74, 52, 18, 62)
    assert t150.edge_max_mm > t174.edge_max_mm
    assert t150.edge_max_mm > t150.center_mm  # minus lens: thick edges
    assert t174.weight_index < 1


def test_plus_lens_thick_center():
    t = lens_thickness(+4, 0, 1.5, 50, 18, 64)
    assert t.center_mm > t.edge_max_mm


def test_smaller_frame_thinner_edges():
    big = lens_thickness(-4, 0, 1.6, 56, 16, 60)
    small = lens_thickness(-4, 0, 1.6, 48, 20, 60)
    assert big.edge_max_mm > small.edge_max_mm


# ---------------- rules
BASE = {"age": 30, "is_child": False, "max_power": 1.0, "sphere_se": -1.0, "add": 0, "screen_hours": 1,
        "outdoor_hours": 1, "night_driving": False, "sports": False, "desk_work": False}


def test_rules_default():
    r = evaluate(BASE)
    assert r.design == "ZSL-SV" and r.index == "IDX-150" and "DV-PLAT" in r.coatings


def test_rules_presbyope_night_driver():
    r = evaluate({**BASE, "age": 52, "add": 1.75, "night_driving": True, "max_power": 2.5})
    assert r.design == "ZDS-PAL" and r.index == "IDX-160"


def test_rules_child_myopia():
    r = evaluate({**BASE, "age": 9, "is_child": True, "sphere_se": -1.5, "max_power": 1.5})
    assert r.design == "ZMYO" and r.index == "IDX-PC" and r.refer == "soon"


def test_rules_high_power_and_screens():
    r = evaluate({**BASE, "max_power": 6.5, "screen_hours": 8, "outdoor_hours": 4})
    assert r.index == "IDX-174"
    assert "DV-BP" in r.coatings and "DV-PLAT" not in r.coatings
    assert "PFX" in r.features and "BG" in r.features


# ---------------- extraction
def test_numbers_multilingual():
    assert parse_number("I am 45 years old") == 45
    assert parse_number("पैंतालीस") == 45
    assert parse_number("४५ साल") == 45
    assert parse_number("୩୫") == 35
    assert parse_number("6-8 hours") == 7
    assert parse_number("forty five") == 45


def test_yes_no_multilingual():
    assert parse_yesno("haan ji") is True
    assert parse_yesno("नहीं") is False
    assert parse_yesno("ନା") is False
    assert parse_yesno("yes I do") is True
    assert parse_yesno("I don't") is False


def test_red_flags():
    assert "flashes_floaters" in find_red_flags("I keep seeing flashes of light")
    assert "eye_pain" in find_red_flags("आँख में दर्द है")
    assert find_red_flags("No, nothing like that, no flashes") == []
    assert find_red_flags("सिरदर्द होता है") == []  # headache is not an eye-pain red flag
    assert find_red_flags("I am colour blind") == []


def test_extract_symptoms():
    out = extract("symptoms", "symptoms", "पढ़ने में दिक्कत और रात में चकाचौंध")
    assert set(out["updates"]["symptoms"]) >= {"near_blur", "glare"}
    assert out["updates"]["glare_complaint"] is True


# ---------------- confidence / honest eye
def test_honest_eye_penalises_squint_and_guessing():
    trials = [{"correct": True, "response_ms": 200, "squint": True, "lean": True, "gaze_on_target": True}] * 10
    rep = honest_eye(trials)
    assert rep.score < 50 and rep.events


def test_confidence_low_refers():
    rep = honest_eye([{"correct": True, "response_ms": 200, "squint": True, "lean": True}] * 10)
    c = compute_confidence(calibration={}, acuity_reliability=0.4, sphere_reliable=False, honest=rep,
                           tests_done={"acuity"}, lighting_ok=False)
    assert c.refer and c.level == "low"
    good = compute_confidence(calibration={"card_calibrated": True, "distance_tracking": True}, acuity_reliability=1.0,
                              sphere_reliable=True, honest=honest_eye([]),
                              tests_done={"acuity", "far_point", "near_point", "astigmatism"}, lighting_ok=True)
    assert good.level == "high" and not good.refer


# ---------------- vision
LM = {"right_iris_center": [400, 500], "left_iris_center": [700, 500], "nose_bridge": [552, 480],
      "right_iris_diameter_px": 56, "left_iris_diameter_px": 56,
      "face_top": [550, 200], "chin": [550, 1000], "cheek_left": [850, 520], "cheek_right": [250, 520],
      "jaw_left": [780, 850], "jaw_right": [320, 850], "forehead_left": [770, 300], "forehead_right": [330, 300]}


def test_pd_from_iris_scale():
    scale = 11.7 / 56
    out = pupillary_distance(LM, scale)
    assert out["pd_mm"] == pytest.approx(300 * scale, abs=0.1)
    assert out["pd_right_mm"] + out["pd_left_mm"] == pytest.approx(out["pd_mm"], abs=0.2)


def test_face_shape_oblong():
    assert face_shape(LM)["shape"] in {"oblong", "oval"}


def test_hirschberg_symmetric_vs_squint():
    normal = hirschberg({"right": {"dx": 0.08, "dy": 0}, "left": {"dx": -0.08, "dy": 0}})
    assert normal["deviation_prism"] < 5 and normal["type"] is None
    squint = hirschberg({"right": {"dx": 0.08, "dy": 0}, "left": {"dx": 0.3, "dy": 0}})
    assert squint["deviation_prism"] >= 15 and squint["type"] == "horizontal"


def test_frame_suggestions_progressive_needs_depth():
    frames = [{"sku": "a", "name": "shallow", "shape": "rectangle", "a": 50, "dbl": 18, "b": 28},
              {"sku": "b", "name": "deep", "shape": "rectangle", "a": 50, "dbl": 18, "b": 36}]
    out = suggest_frames(frames, face="round", pd_mm=62, sphere=-1, cyl=0, add=2.0, lens_index=1.6, is_child=False, sports=False)
    assert out[0]["name"] == "deep"


def test_office_lens_becomes_second_pair_when_driving_wins():
    r = evaluate({**BASE, "age": 50, "add": 1.5, "night_driving": True, "desk_work": True, "screen_hours": 8, "max_power": 2})
    assert r.design == "ZDS-PAL"
    assert "ZOFF" in r.features and "ZSL-PAL" not in r.features
    assert r.reasons["ZOFF"][0].startswith("Second pair")
