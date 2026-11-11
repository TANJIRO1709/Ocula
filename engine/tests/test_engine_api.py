import os

os.environ["ENGINE_API_KEY"] = "test-key"
os.environ["LLM_PROVIDER"] = "none"

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402

get_settings.cache_clear()
pytestmark = pytest.mark.anyio
H = {"X-Engine-Key": "test-key"}

CATALOG = [
    {"sku": s, "category": c, "family": f, "name": n, "lens_index": i, "attrs": a, "active": True, "description": ""}
    for s, c, f, n, i, a in [
        ("ZSL-SV", "design", "ZEISS SmartLife", "ZEISS SmartLife Single Vision", None, {}),
        ("ZSL-PAL", "design", "ZEISS SmartLife", "ZEISS SmartLife Progressive", None, {}),
        ("ZDS-PAL", "design", "ZEISS DriveSafe", "ZEISS DriveSafe Progressive", None, {}),
        ("ZDS-SV", "design", "ZEISS DriveSafe", "ZEISS DriveSafe Single Vision", None, {}),
        ("ZOFF", "design", "ZEISS Officelens", "ZEISS Officelens", None, {}),
        ("ZMYO", "design", "ZEISS MyoCare", "ZEISS MyoCare", None, {}),
        ("IDX-150", "material", "Index", "1.50 standard", 1.5, {}),
        ("IDX-160", "material", "Index", "1.60 thin", 1.6, {}),
        ("IDX-PC", "material", "Polycarbonate", "1.59 polycarbonate", 1.59, {}),
        ("DV-PLAT", "coating", "ZEISS DuraVision", "ZEISS DuraVision Platinum UV", None, {}),
        ("DV-BP", "coating", "ZEISS DuraVision", "ZEISS DuraVision BlueProtect UV", None, {}),
        ("FR-RECT-52", "frame", "Frames", "Classic Rectangle 52-18", None, {"shape": "rectangle", "a": 52, "dbl": 18, "b": 34}),
        ("FR-KID-44", "frame", "Frames", "Kids Flex 44-16", None, {"shape": "round", "a": 44, "dbl": 16, "b": 34, "kids": True}),
    ]
]


def _acuity(threshold, distance=0.5):
    return {"trials": [{"logmar": lm, "correct": lm >= threshold, "response_ms": 1200, "distance_m": distance}
                       for lm in (1.0, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0) for _ in range(2)]}


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://e") as c:
        yield c


async def test_health_and_key(client):
    assert (await client.get("/healthz")).json()["status"] == "ok"
    assert (await client.post("/v1/thickness", json={"sphere": -3})).status_code == 401
    r = await client.post("/v1/thickness", headers=H, json={"sphere": -6, "index": 1.67})
    assert r.status_code == 200 and r.json()["edge_max_mm"] > r.json()["center_mm"]


async def test_interview_roundtrip_is_stateless(client):
    r = (await client.post("/v1/interview/start", headers=H, json={"mode": "adult", "language": "hi"})).json()
    assert r["pending"] == "age" and r["speech_locale"] == "hi-IN"
    state = r["state"]
    r = (await client.post("/v1/interview/step", headers=H, json={"state": state, "reply": "पचपन"})).json()
    assert r["profile"]["age"] == 55
    r = (await client.post("/v1/interview/step", headers=H, json={"state": r["state"], "reply": "हाँ, आँख के आगे परदा"})).json()
    assert r["urgent"] and r["done"]


async def test_compute_full(client):
    tests = {"acuity_R": _acuity(0.1), "acuity_L": _acuity(0.1), "far_point_R": {"distance_m": 0.5, "blurred": True},
             "far_point_L": {"distance_m": 0.5, "blurred": True}, "near_point": {"distance_m": 0.6},
             "astigmatism_R": {"darkest_hour": 3, "severity": "slight"}, "duochrome_R": {"answer": "red"}}
    profile = {"age": 52, "night_driving": True, "screen_hours": 7, "desk_work": True}
    r = await client.post("/v1/compute", headers=H, json={"tests": tests, "profile": profile, "catalog": CATALOG,
                                                           "calibration": {"card_calibrated": True, "distance_tracking": True}})
    assert r.status_code == 200
    res = r.json()["result"]
    assert res["eyes"]["R"]["sphere"] == -2.0 and res["eyes"]["R"]["axis"] == 90
    assert res["products"]["design"]["sku"] == "ZDS-PAL"
    assert r.json()["explanation"]["text"]


async def test_selfie_and_reports(client):
    lm = {"right_iris_center": [400, 500], "left_iris_center": [700, 500], "nose_bridge": [550, 480],
          "right_iris_diameter_px": 56, "left_iris_diameter_px": 56}
    m = (await client.post("/v1/selfie", headers=H, json={"landmarks": lm})).json()
    assert 55 < m["pd_mm"] < 70
    bad = await client.post("/v1/selfie", headers=H, json={"landmarks": {}})
    assert bad.status_code == 422
    comp = (await client.post("/v1/compute", headers=H, json={"tests": {"acuity_R": _acuity(0.2)}, "catalog": CATALOG})).json()
    session = {"id": "abc123456789", "created_at": "2026-11-11T10:00:00.000Z", "result": comp["result"],
               "explanation": comp["explanation"], "customer": {"name": "Ravi"}, "ruleset_version": "x"}
    pdf = await client.post("/v1/report/session", headers=H, json={"session": session, "passport_url": "https://x/p/1"})
    assert pdf.content[:4] == b"%PDF"
    camp = await client.post("/v1/report/camp", headers=H, json={"camp": {"name": "T1", "school": "DAV"},
                                                                 "students": [{"name": "Asha", "needs_followup": True, "reason": "x"}]})
    assert camp.content[:4] == b"%PDF"
    qr = await client.post("/v1/qr", headers=H, json={"data": "hello"})
    assert qr.content[:4] == b"\x89PNG"
