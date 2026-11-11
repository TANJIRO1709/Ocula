"""Provider-agnostic LLM adapter (OpenAI, Anthropic, or any OpenAI-compatible endpoint such as Sarvam/Groq/vLLM).

Every call is optional: callers must handle `None` and fall back to deterministic behaviour.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.config import get_settings

log = logging.getLogger("ocula.llm")


def enabled() -> bool:
    s = get_settings()
    return s.llm_provider != "none" and bool(s.llm_api_key)


async def complete(system: str, user: str, *, max_tokens: int = 500, temperature: float = 0.2) -> str | None:
    s = get_settings()
    if not enabled():
        return None
    try:
        async with httpx.AsyncClient(timeout=s.llm_timeout_s) as client:
            if s.llm_provider == "anthropic":
                r = await client.post(
                    (s.llm_base_url or "https://api.anthropic.com") + "/v1/messages",
                    headers={"x-api-key": s.llm_api_key or "", "anthropic-version": "2023-06-01"},
                    json={"model": s.llm_model, "max_tokens": max_tokens, "temperature": temperature,
                          "system": system, "messages": [{"role": "user", "content": user}]},
                )
                r.raise_for_status()
                return "".join(b.get("text", "") for b in r.json().get("content", []))
            base = s.llm_base_url or "https://api.openai.com/v1"
            r = await client.post(
                base.rstrip("/") + "/chat/completions",
                headers={"Authorization": f"Bearer {s.llm_api_key}"},
                json={"model": s.llm_model, "max_tokens": max_tokens, "temperature": temperature,
                      "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
    except Exception as exc:  # network, auth, schema — never break the screening flow
        log.warning("llm call failed: %s", exc)
        return None


async def complete_json(system: str, user: str, **kw: Any) -> dict | None:
    text = await complete(system + "\nRespond with a single JSON object and nothing else.", user, **kw)
    if not text:
        return None
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
