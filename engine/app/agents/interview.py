"""Voice interview agent as a LangGraph state machine.

Per customer reply the graph runs:  extract -> triage -> (urgent? END) -> select_next -> phrase -> END

* extract: rule-based multilingual parser, optionally enriched by an LLM's structured JSON output.
* triage: any red-flag keyword in ANY reply interrupts the interview with an urgent referral.
* select_next: next unanswered question for this mode (adult / kids / camp / phone), honouring skip rules.
* phrase: question text in the customer's language (LLM translation for languages without templates).

The LLM never decides anything clinical — it only helps understand free speech and phrase questions.
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents import llm
from app.agents.extract import extract
from app.agents.questions import QUESTIONS, SUPPORTED_LANGS, phrase, questions_for, text_for
from app.domain.triage import INTERVIEW_FLAGS

MAX_ATTEMPTS = 2
_Q = {q.id: q for q in QUESTIONS}


class InterviewState(TypedDict, total=False):
    mode: str
    language: str
    profile: dict[str, Any]
    asked: list[str]  # question ids completed or skipped
    pending: str | None  # question id awaiting an answer
    attempts: int
    reply: str | None
    transcript: list[dict[str, str]]
    urgent: bool
    done: bool
    say: str  # what the agent says next


async def _llm_extract(state: InterviewState, qid: str, reply: str) -> dict | None:
    if not llm.enabled():
        return None
    q = _Q[qid]
    system = (
        "You extract structured answers from a customer's spoken reply during an eye-care screening interview in India. "
        "The reply may be in English, Hindi, Hinglish, Odia or another Indian language. Never give medical advice. "
        f"Return JSON: {{\"value\": <answer to the question or null>, \"red_flags\": [codes], \"other\": {{field: value}}}}. "
        f"Allowed red flag codes: {list(INTERVIEW_FLAGS)}. Value type: {q.kind} for field '{q.field}'. "
        "For 'symptoms' return a list from: distance_blur, near_blur, headache, eye_strain, glare, dry_eye, light_sensitive, double_vision, squint_rub. "
        "'other' may contain any of: age, screen_hours, outdoor_hours, night_driving, sports, diabetes, wears_glasses, occupation."
    )
    user = f"Question asked: {text_for(q, 'en')}\nCustomer reply: {reply}"
    return await llm.complete_json(system, user, max_tokens=250)


async def node_extract(state: InterviewState) -> InterviewState:
    reply = (state.get("reply") or "").strip()
    qid = state.get("pending")
    profile = dict(state.get("profile") or {})
    transcript = list(state.get("transcript") or [])
    asked = list(state.get("asked") or [])
    attempts = state.get("attempts", 0)
    if not reply or not qid:
        return {"profile": profile}

    transcript.append({"role": "customer", "text": reply})
    q = _Q[qid]
    rule = extract(q.kind, q.field, reply)
    updates, flags = dict(rule["updates"]), list(rule["red_flags"])

    llm_out = await _llm_extract(state, qid, reply)
    if llm_out:
        if llm_out.get("value") is not None and q.field not in updates:
            val = llm_out["value"]
            if q.kind == "redflag":
                updates["red_flag_screen"] = bool(val)
            else:
                updates[q.field] = val
        for code in llm_out.get("red_flags") or []:
            if code in INTERVIEW_FLAGS and code not in flags:
                flags.append(code)
        for k, v in (llm_out.get("other") or {}).items():
            if k not in profile and v is not None:
                updates.setdefault(k, v)

    existing = set(profile.get("red_flags", []))
    profile["red_flags"] = sorted(existing | set(flags))
    answered = q.field in updates or (q.kind == "redflag" and "red_flag_screen" in updates)
    profile.update(updates)
    if q.field == "symptoms" and "symptoms" in updates:
        s = updates["symptoms"]
        profile["near_complaint"] = "near_blur" in s
        profile["distance_complaint"] = "distance_blur" in s

    if answered or attempts + 1 >= MAX_ATTEMPTS:
        asked.append(qid)
        return {"profile": profile, "asked": asked, "pending": None, "attempts": 0, "transcript": transcript}
    return {"profile": profile, "attempts": attempts + 1, "transcript": transcript}


def node_triage(state: InterviewState) -> InterviewState:
    profile = state.get("profile") or {}
    urgent = any(INTERVIEW_FLAGS.get(c, ("soon",))[0] == "urgent" or c == "unspecified_urgent_symptom"
                 for c in profile.get("red_flags", []))
    return {"urgent": urgent}


def node_select(state: InterviewState) -> InterviewState:
    if state.get("pending"):  # still waiting on a retry
        return {}
    profile = state.get("profile") or {}
    asked = set(state.get("asked") or [])
    for q in questions_for(state.get("mode", "adult")):
        if q.id in asked:
            continue
        if q.skip_if(profile):
            continue
        if q.kind != "redflag" and profile.get(q.field) is not None:  # already known (e.g. age typed by staff)
            continue
        return {"pending": q.id, "attempts": 0}
    return {"pending": None, "done": True}


async def _say(text_en: str, localized: str | None, lang: str) -> str:
    if localized:
        return localized
    if lang != "en" and llm.enabled():
        out = await llm.complete(
            "Translate the eye-screening assistant's sentence into the target language. Use simple, warm, everyday words. "
            "Return only the translation.", f"Target language code: {lang}\nSentence: {text_en}", max_tokens=200)
        if out:
            return out.strip()
    return text_en


async def node_phrase(state: InterviewState) -> InterviewState:
    lang = state.get("language", "en")
    transcript = list(state.get("transcript") or [])
    templated = lang in SUPPORTED_LANGS
    if state.get("urgent"):
        say = await _say(phrase("urgent", "en"), phrase("urgent", lang) if templated else None, lang)
        transcript.append({"role": "agent", "text": say})
        return {"say": say, "done": True, "transcript": transcript}
    if state.get("done"):
        key = "done_phone" if state.get("mode") == "phone" else "done"
        say = await _say(phrase(key, "en"), phrase(key, lang) if templated else None, lang)
        transcript.append({"role": "agent", "text": say})
        return {"say": say, "transcript": transcript}
    q = _Q[state["pending"]]
    prefix = ""
    if state.get("attempts", 0) > 0:
        prefix = (phrase("retry", lang) if templated else phrase("retry", "en")) + " "
    say = prefix + await _say(text_for(q, "en"), text_for(q, lang) if templated else None, lang)
    transcript.append({"role": "agent", "text": say})
    return {"say": say, "transcript": transcript}


def _after_triage(state: InterviewState) -> str:
    return "phrase" if state.get("urgent") else "select"


def build_graph():
    g = StateGraph(InterviewState)
    g.add_node("extract", node_extract)
    g.add_node("triage", node_triage)
    g.add_node("select", node_select)
    g.add_node("phrase", node_phrase)
    g.add_edge(START, "extract")
    g.add_edge("extract", "triage")
    g.add_conditional_edges("triage", _after_triage, {"phrase": "phrase", "select": "select"})
    g.add_edge("select", "phrase")
    g.add_edge("phrase", END)
    return g.compile()


GRAPH = build_graph()


async def start(mode: str, language: str, profile: dict | None = None) -> InterviewState:
    state: InterviewState = {"mode": mode, "language": language, "profile": profile or {}, "asked": [],
                             "pending": None, "attempts": 0, "reply": None, "transcript": [], "urgent": False,
                             "done": False}
    return await GRAPH.ainvoke(state)


async def step(state: InterviewState, reply: str) -> InterviewState:
    if state.get("done"):
        return state
    nxt: InterviewState = {**state, "reply": reply}
    return await GRAPH.ainvoke(nxt)


def progress(state: InterviewState) -> dict[str, int]:
    total = [q for q in questions_for(state.get("mode", "adult")) if not q.skip_if(state.get("profile") or {})]
    return {"answered": len(state.get("asked") or []), "total": len(total)}
