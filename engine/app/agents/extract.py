"""Rule-based multilingual answer extraction (English / Hindi / Hinglish / Odia).

This is the always-available fallback; when an LLM is configured its structured output is merged on top.
"""

from __future__ import annotations

import re
from typing import Any

DIGIT_MAP = str.maketrans("०१२३४५६७८९୦୧୨୩୪୫୬୭୮୯", "01234567890123456789")

NUMBER_WORDS = {
    # English
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90, "half": 0.5,
    # Hindi / Hinglish
    "ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5, "chhe": 6, "che": 6, "saat": 7,
    "aath": 8, "nau": 9, "das": 10, "bees": 20, "tees": 30, "chalis": 40, "pachas": 50, "saath": 60, "sattar": 70,
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "सात": 7, "आठ": 8, "नौ": 9,
    "दस": 10, "बारह": 12, "पंद्रह": 15, "बीस": 20, "पच्चीस": 25, "तीस": 30, "पैंतीस": 35, "चालीस": 40,
    "पैंतालीस": 45, "पचास": 50, "पचपन": 55, "साठ": 60, "पैंसठ": 65, "सत्तर": 70, "अस्सी": 80, "आधा": 0.5,
    # Odia
    "ଏକ": 1, "ଦୁଇ": 2, "ତିନି": 3, "ଚାରି": 4, "ପାଞ୍ଚ": 5, "ଛଅ": 6, "ସାତ": 7, "ଆଠ": 8, "ନଅ": 9, "ଦଶ": 10,
    "କୋଡ଼ିଏ": 20, "ତିରିଶ": 30, "ଚାଳିଶ": 40, "ପଚାଶ": 50, "ଷାଠିଏ": 60, "ସତୁରି": 70,
}

YES = ["yes", "yeah", "yep", "yup", "sure", "of course", "correct", "i do", "haan", "han", "ha", "haa", "ji", "hmm",
       "हाँ", "हां", "हा", "जी", "बिल्कुल", "ହଁ", "ହଁ", "ହ", "ଆଜ୍ଞା"]
NO = ["no", "nope", "not", "never", "don't", "dont", "do not", "nahi", "nahin", "na", "nai",
      "नहीं", "नही", "ना", "कभी नहीं", "ନା", "ନାହିଁ", "ନାହିଁ", "ନାଇଁ"]

SYMPTOMS = {
    "distance_blur": ["far", "distance", "board", "tv", "road sign", "blurry", "blur", "door", "दूर", "धुंधला", "ଦୂର", "ଅସ୍ପଷ୍ଟ"],
    "near_blur": ["read", "reading", "near", "small print", "newspaper", "phone text", "पढ़", "पढ़ने", "पास", "ପଢ଼", "ପାଖ"],
    "headache": ["headache", "head ache", "head pain", "सिरदर्द", "सर दर्द", "सिर दर्द", "ମୁଣ୍ଡବିନ୍ଧା", "ମୁଣ୍ଡ ବିନ୍ଧା"],
    "eye_strain": ["strain", "tired", "fatigue", "थकान", "थक", "ଥକା"],
    "glare": ["glare", "headlight", "halo", "night", "चकाचौंध", "चमक", "ଚମକ"],
    "dry_eye": ["dry", "itch", "burning", "watering", "सूखा", "खुजली", "जलन", "पानी", "ଶୁଖିଲା", "କୁଣ୍ଡେଇ"],
    "light_sensitive": ["sensitive to light", "light sensitivity", "sunlight hurts", "bright light", "रोशनी से", "ଆଲୋକ"],
    "double_vision": ["double", "two images", "दो दिख", "ଦୁଇଟା"],
    "squint_rub": ["squint", "rub", "close to tv", "close to the tv", "सिकोड़", "मलता", "पास बैठ", "ଘଷେ", "ପାଖରେ ବସେ"],
}

RED_FLAGS = {
    "sudden_vision_loss": ["sudden loss", "suddenly lost", "suddenly", "went dark", "vision loss", "lost vision",
                           "अचानक दिखना", "अचानक कम दिख", "अचानक धुंधला", "दिखना बंद", "ହଠାତ୍ ଦେଖିବା", "ହଠାତ୍ କମ୍", "ଦେଖାଯାଉନି"],
    "flashes_floaters": ["flash", "flashes", "floaters", "spots floating", "रोशनी की चमक", "बिजली जैसी", "ଆଲୋକର ଝଲକ", "ଝଲକ"],
    "curtain_shadow": ["curtain", "shadow", "veil", "परदा", "पर्दा", "ପରଦା"],
    "eye_pain": ["eye pain", "pain in eye", "pain in my eye", "pain in the eye", "eyes are paining", "eye is paining",
                 "आँख में दर्द", "आंख में दर्द", "आँखों में दर्द", "आंखों में दर्द", "ଆଖିରେ ଯନ୍ତ୍ରଣା", "ଆଖି ବିନ୍ଧୁଛି"],
    "eye_injury": ["injury", "injured", "hit in the eye", "chemical", "acid", "चोट", "ଆଘାତ", "କେମିକାଲ"],
    "double_vision_sudden": ["suddenly double", "sudden double"],
    "red_painful_eye": ["red and painful", "red painful"],
}

DESK_WORDS = ["office", "computer", "it ", "software", "engineer", "accountant", "clerk", "bank", "student", "teacher",
              "desk", "typing", "बैंक", "ऑफ़िस", "टीचर", "शिक्षक", "ବ୍ୟାଙ୍କ", "ଶିକ୍ଷକ", "ऑफिस", "दफ़्तर", "कंप्यूटर", "पढ़ाई", "छात्र", "ଅଫିସ୍", "କମ୍ପ୍ୟୁଟର", "ଛାତ୍ର"]


def _norm(text: str) -> str:
    return " " + re.sub(r"\s+", " ", text.lower().translate(DIGIT_MAP)).strip() + " "


def _has(text: str, words: list[str]) -> bool:
    for w in words:
        w = w.lower()
        if re.search(r"[a-z]", w):
            if re.search(rf"(?<![a-z]){re.escape(w)}(?![a-z])", text):
                return True
        elif w in text:
            return True
    return False


def parse_number(text: str) -> float | None:
    t = _norm(text)
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", t)]
    if len(nums) >= 2 and re.search(r"\d\s*(-|to|से|ରୁ)\s*\d", t):
        return round((nums[0] + nums[1]) / 2, 1)
    if nums:
        return nums[0]
    total, found = 0.0, False
    for token in re.findall(r"[^\s,.?!]+", t):
        if token in NUMBER_WORDS:
            total += NUMBER_WORDS[token]
            found = True
        elif "-" in token and all(p in NUMBER_WORDS for p in token.split("-")):
            total += sum(NUMBER_WORDS[p] for p in token.split("-"))
            found = True
    if found:
        return total
    if _has(t, ["none", "zero", "nothing", "बिल्कुल नहीं", "कुछ नहीं"]):
        return 0.0
    return None


def parse_yesno(text: str) -> bool | None:
    t = _norm(text)
    if _has(t, NO):
        return False
    if _has(t, YES):
        return True
    return None


def find_symptoms(text: str) -> list[str]:
    t = _norm(text)
    return [k for k, words in SYMPTOMS.items() if _has(t, words)]


def find_red_flags(text: str) -> list[str]:
    t = _norm(text)
    first = t.strip().split(" ")[0].strip(",.!") if t.strip() else ""
    if first in ("no", "nope", "nahi", "nahin", "नहीं", "नही", "ना", "ନା", "ନାହିଁ", "never"):
        return []
    return [k for k, words in RED_FLAGS.items() if _has(t, words)]


def extract(kind: str, field: str, text: str) -> dict[str, Any]:
    """Return {field: value} updates (possibly empty if nothing understood) plus detected red flags."""
    updates: dict[str, Any] = {}
    flags = find_red_flags(text)

    if kind == "number":
        n = parse_number(text)
        if n is not None:
            if field == "age" and not (1 <= n <= 110):
                n = None
            elif field.endswith("_hours") and not (0 <= n <= 24):
                n = None
        if n is not None:
            updates[field] = int(n) if field == "age" else n
    elif kind == "yesno":
        yn = parse_yesno(text)
        if yn is not None:
            updates[field] = yn
    elif kind == "symptoms":
        s = find_symptoms(text)
        if s or parse_yesno(text) is False:
            updates["symptoms"] = s
            if "glare" in s:
                updates["glare_complaint"] = True
            if "light_sensitive" in s:
                updates["light_sensitive"] = True
    elif kind == "redflag":
        yn = parse_yesno(text)
        if flags:
            updates["red_flag_screen"] = True
        elif yn is False:
            updates["red_flag_screen"] = False
        elif yn is True:
            updates["red_flag_screen"] = True
            flags = ["unspecified_urgent_symptom"]
    elif kind == "text":
        clean = text.strip()
        if clean:
            updates[field] = clean[:200]
            if field == "occupation":
                updates["desk_work"] = _has(_norm(clean), DESK_WORDS)
    return {"updates": updates, "red_flags": flags}
