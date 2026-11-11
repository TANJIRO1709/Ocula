"""Ocula Engine — stateless clinical-intelligence service.

The Node.js gateway owns users, data and integrations; this service owns everything that needs Python:
optics maths, the versioned rules engine, triage + confidence (Honest Eye), the LangGraph voice-interview
agent, selfie measurements, explanations and PDF / QR generation. It stores nothing.
"""

import hmac
import logging
import time
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field

from app.agents import interview as agent
from app.agents import llm
from app.agents.questions import SPEECH_LOCALES
from app.config import get_settings
from app.domain.rules.engine import load_ruleset
from app.domain.thickness import lens_thickness
from app.services.explain import explain
from app.services.reports import camp_report_pdf, qr_png, session_report_pdf
from app.services.screening import compute_result
from app.vision.measure import analyse_selfie

log = logging.getLogger("ocula.engine")
logging.basicConfig(level=logging.INFO, format='{"ts":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_ruleset()  # fail fast on a malformed ruleset
    yield


app = FastAPI(title="Ocula Engine", version="2.0.0", lifespan=lifespan,
              description="Stateless optics, rules, interview-agent and report service for Ocula (team Container_Service).")
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def timing(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["x-engine-ms"] = f"{(time.perf_counter() - start) * 1000:.1f}"
    if request.url.path != "/healthz":
        log.info("%s %s %s %.0fms", request.method, request.url.path, response.status_code, (time.perf_counter() - start) * 1000)
    return response


def require_key(x_engine_key: str | None = Header(default=None)) -> None:
    expected = get_settings().engine_api_key
    if expected and not hmac.compare_digest(expected, x_engine_key or ""):
        raise HTTPException(401, "Invalid engine key")


# ------------------------------------------------------------------ schemas

class InterviewStart(BaseModel):
    mode: Literal["adult", "kids", "camp", "phone"] = "adult"
    language: str = "en"
    profile: dict[str, Any] = {}


class InterviewStep(BaseModel):
    state: dict[str, Any]
    reply: str = Field(max_length=1000)


class ComputeIn(BaseModel):
    tests: dict[str, Any] = {}
    profile: dict[str, Any] = {}
    measurements: dict[str, Any] = {}
    calibration: dict[str, Any] = {}
    catalog: list[dict[str, Any]]
    progression: float | None = None
    language: str = "en"


class SelfieIn(BaseModel):
    landmarks: dict[str, Any]
    card_width_px: float | None = None
    reflex: dict[str, Any] | None = None
    frame_bottom_y: float | None = None
    image_w: int | None = None
    image_h: int | None = None


class ThicknessIn(BaseModel):
    sphere: float = Field(ge=-20, le=20)
    cyl: float = Field(default=0, ge=-8, le=0)
    index: float = Field(default=1.5, ge=1.4, le=1.9)
    frame_a: float = Field(default=52, ge=30, le=75)
    frame_dbl: float = Field(default=18, ge=10, le=30)
    frame_b: float | None = None
    pd_mm: float = Field(default=63, ge=40, le=80)


class SessionReportIn(BaseModel):
    session: dict[str, Any]
    passport_url: str | None = None


class CampReportIn(BaseModel):
    camp: dict[str, Any]
    students: list[dict[str, Any]]


class QrIn(BaseModel):
    data: str = Field(max_length=2000)


# ------------------------------------------------------------------ routes

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "ocula-engine", "ruleset": load_ruleset()["version"], "llm": llm.enabled()}


def _public(state: dict) -> dict:
    return {"state": state, "say": state.get("say"), "done": bool(state.get("done")), "urgent": bool(state.get("urgent")),
            "pending": state.get("pending"), "profile": state.get("profile") or {}, "progress": agent.progress(state),
            "speech_locale": SPEECH_LOCALES.get(state.get("language", "en"), "en-IN"), "transcript": state.get("transcript", [])}


@app.post("/v1/interview/start", dependencies=[Depends(require_key)])
async def interview_start(body: InterviewStart):
    return _public(dict(await agent.start(body.mode, body.language, body.profile)))


@app.post("/v1/interview/step", dependencies=[Depends(require_key)])
async def interview_step(body: InterviewStep):
    if not body.state.get("mode"):
        raise HTTPException(422, "state must come from /v1/interview/start")
    return _public(dict(await agent.step(body.state, body.reply)))  # type: ignore[arg-type]


@app.post("/v1/compute", dependencies=[Depends(require_key)])
async def compute(body: ComputeIn):
    result = compute_result(tests=body.tests, profile=body.profile, measurements=body.measurements,
                            calibration=body.calibration, catalog=body.catalog, progression=body.progression)
    return {"result": result, "explanation": await explain(result, body.language)}


@app.post("/v1/selfie", dependencies=[Depends(require_key)])
async def selfie(body: SelfieIn):
    try:
        return analyse_selfie(body.model_dump())
    except (KeyError, ValueError) as exc:
        raise HTTPException(422, f"Could not measure: {exc}") from exc


@app.post("/v1/thickness", dependencies=[Depends(require_key)])
async def thickness(body: ThicknessIn):
    return lens_thickness(body.sphere, body.cyl, body.index, body.frame_a, body.frame_dbl, body.pd_mm, body.frame_b).dict()


@app.post("/v1/report/session", dependencies=[Depends(require_key)])
async def report_session(body: SessionReportIn):
    if not (body.session.get("result")):
        raise HTTPException(409, "Session not completed")
    return Response(session_report_pdf(body.session, body.passport_url), media_type="application/pdf")


@app.post("/v1/report/camp", dependencies=[Depends(require_key)])
async def report_camp(body: CampReportIn):
    return Response(camp_report_pdf(body.camp, body.students), media_type="application/pdf")


@app.post("/v1/qr", dependencies=[Depends(require_key)])
async def qr(body: QrIn):
    return Response(qr_png(body.data), media_type="image/png")


@app.get("/v1/ruleset", dependencies=[Depends(require_key)])
async def ruleset():
    return load_ruleset()
