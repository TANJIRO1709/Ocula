"""Deterministic, versioned recommendation rules engine.

The LLM never chooses lenses. Rules produce the decision + reasons; the LLM (optional) only rewrites the
reasons in plain language in the customer's own language.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

RULESET_PATH = Path(__file__).with_name("ruleset_v1.yaml")

OPS = {
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
    "gt": lambda a, b: a is not None and a > b,
    "gte": lambda a, b: a is not None and a >= b,
    "lt": lambda a, b: a is not None and a < b,
    "lte": lambda a, b: a is not None and a <= b,
    "between": lambda a, b: a is not None and b[0] <= a <= b[1],
    "in": lambda a, b: a in b,
}


@dataclass
class Match:
    rule_id: str
    reason: str
    priority: int


@dataclass
class Recommendation:
    ruleset_version: str
    design: str | None = None
    index: str | None = None
    coatings: list[str] = field(default_factory=list)
    features: list[str] = field(default_factory=list)
    reasons: dict[str, list[str]] = field(default_factory=dict)  # sku -> reasons
    fired: list[str] = field(default_factory=list)
    refer: str | None = None

    def dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


def _check(cond: dict, facts: dict) -> bool:
    if "all" in cond:
        return all(_check(c, facts) for c in cond["all"])
    if "any" in cond:
        return any(_check(c, facts) for c in cond["any"])
    op = OPS[cond["op"]]
    try:
        return bool(op(facts.get(cond["fact"]), cond["value"]))
    except TypeError:
        return False


@lru_cache
def load_ruleset(path: str = str(RULESET_PATH)) -> dict:
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    for r in data["rules"]:
        for op_cond in _walk(r["when"]):
            if op_cond["op"] not in OPS:
                raise ValueError(f"Unknown op {op_cond['op']} in rule {r['id']}")
    return data


def _walk(cond: dict):
    if "all" in cond:
        for c in cond["all"]:
            yield from _walk(c)
    elif "any" in cond:
        for c in cond["any"]:
            yield from _walk(c)
    else:
        yield cond


def evaluate(facts: dict, ruleset: dict | None = None) -> Recommendation:
    rs = ruleset or load_ruleset()
    rec = Recommendation(ruleset_version=rs["version"])
    single: dict[str, tuple[int, str, str]] = {}  # category -> (priority, sku, reason)
    refer_levels = {"urgent": 3, "soon": 2, "routine": 1}

    for rule in rs["rules"]:
        if not _check(rule["when"], facts):
            continue
        rec.fired.append(rule["id"])
        then = rule["then"]
        reason = rule.get("reason", "")
        for cat in rs.get("single_choice", []):
            if cat in then and (cat not in single or rule["priority"] > single[cat][0]):
                single[cat] = (rule["priority"], then[cat], reason)
        for sku in then.get("coating", []):
            if sku not in rec.coatings:
                rec.coatings.append(sku)
            rec.reasons.setdefault(sku, []).append(reason)
        for sku in then.get("feature", []):
            if sku not in rec.features:
                rec.features.append(sku)
            rec.reasons.setdefault(sku, []).append(reason)
        if then.get("refer") and refer_levels[then["refer"]] > refer_levels.get(rec.refer or "", 0):
            rec.refer = then["refer"]

    if "design" in single:
        rec.design = single["design"][1]
        rec.reasons.setdefault(rec.design, []).insert(0, single["design"][2])
        # A task-specific design that lost to a higher-priority everyday design becomes a suggested second pair.
        for rule in rs["rules"]:
            sp = rule["then"].get("design")
            if rule["id"] in rec.fired and rule["then"].get("second_pair") and sp != rec.design:
                if sp not in rec.features:
                    rec.features.append(sp)
                rec.reasons.setdefault(sp, []).append("Second pair: " + rule.get("reason", ""))
    if "index" in single:
        rec.index = single["index"][1]
        rec.reasons.setdefault(rec.index, []).insert(0, single["index"][2])

    # A blue-light coating supersedes the plain AR coating; avoid recommending a design twice as a feature.
    if "DV-BP" in rec.coatings and "DV-PLAT" in rec.coatings:
        rec.coatings.remove("DV-PLAT")
    rec.features = [f for f in rec.features if f != rec.design]
    if rec.design in ("ZDS-SV", "ZDS-PAL"):
        rec.features = [f for f in rec.features if not f.startswith("ZDS")]
    return rec
