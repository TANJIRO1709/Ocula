"""Plain-language explanation of the result in the customer's language.

Deterministic templates (en / hi / or) always work. If an LLM is configured, it rewrites the same facts
more naturally — it is instructed to add no new medical claims and never change numbers or products.
"""

from __future__ import annotations

from app.agents import llm


def _fmt(x: float) -> str:
    return f"{x:+.2f}"


TEMPLATES = {
    "en": {
        "myopia": "Your eyes are slightly short-sighted, so far-away things look blurry.",
        "hyperopia": "Your eyes may be slightly long-sighted, which can make close work tiring.",
        "none": "Your distance vision looks good.",
        "astig": "One or both eyes show a little astigmatism, which can make lines look uneven.",
        "add": "Reading close up has become harder, which is normal with age. You need extra reading power of about {add}.",
        "lens": "We suggest {design}, because {reason}",
        "index": "For your power, {index} lenses keep the glasses thin and light.",
        "extras": "Also recommended: {extras}.",
        "refer_urgent": "Some of your answers or results need an eye doctor today. Please visit a clinic before buying glasses.",
        "refer_soon": "We recommend a full eye test with an optometrist soon to confirm these results.",
        "refer_routine": "A routine eye health check is a good idea.",
        "confidence": "Our confidence in this estimate is {level}.",
    },
    "hi": {
        "myopia": "आपकी आँखों में हल्का निकट-दृष्टि दोष है, इसलिए दूर की चीज़ें धुंधली दिखती हैं।",
        "hyperopia": "आपकी आँखों में हल्का दूर-दृष्टि दोष हो सकता है, जिससे पास का काम थकाने वाला लगता है।",
        "none": "आपकी दूर की नज़र अच्छी लग रही है।",
        "astig": "एक या दोनों आँखों में थोड़ा सिलिंड्रिकल नंबर (एस्टिग्मैटिज़्म) है, जिससे रेखाएँ असमान दिख सकती हैं।",
        "add": "पास पढ़ना मुश्किल हो गया है, जो उम्र के साथ सामान्य है। आपको लगभग {add} पढ़ने की अतिरिक्त पावर चाहिए।",
        "lens": "हम {design} सुझाते हैं, क्योंकि {reason}",
        "index": "आपकी पावर के लिए {index} लेंस चश्मे को पतला और हल्का रखते हैं।",
        "extras": "इसके साथ सुझाव: {extras}।",
        "refer_urgent": "आपके कुछ जवाबों या नतीजों के लिए आज ही आँखों के डॉक्टर को दिखाना ज़रूरी है। चश्मा लेने से पहले क्लिनिक जाएँ।",
        "refer_soon": "इन नतीजों की पुष्टि के लिए जल्द ही किसी ऑप्टोमेट्रिस्ट से पूरी आँखों की जाँच कराएँ।",
        "refer_routine": "एक सामान्य आँखों की स्वास्थ्य जाँच कराना अच्छा रहेगा।",
        "confidence": "इस अनुमान पर हमारा भरोसा: {level}।",
    },
    "or": {
        "myopia": "ଆପଣଙ୍କ ଆଖିରେ ସାମାନ୍ୟ ନିକଟ-ଦୃଷ୍ଟି ଦୋଷ ଅଛି, ତେଣୁ ଦୂରର ଜିନିଷ ଅସ୍ପଷ୍ଟ ଦେଖାଯାଏ।",
        "hyperopia": "ଆପଣଙ୍କ ଆଖିରେ ସାମାନ୍ୟ ଦୂର-ଦୃଷ୍ଟି ଦୋଷ ଥାଇପାରେ, ଯାହା ପାଖ କାମକୁ କ୍ଲାନ୍ତିକର କରେ।",
        "none": "ଆପଣଙ୍କ ଦୂର ଦୃଷ୍ଟି ଭଲ ଦେଖାଯାଉଛି।",
        "astig": "ଗୋଟିଏ ବା ଦୁଇ ଆଖିରେ ସାମାନ୍ୟ ଆଷ୍ଟିଗମାଟିଜିମ୍ ଅଛି, ଯାହା ରେଖାକୁ ଅସମାନ ଦେଖାଏ।",
        "add": "ପାଖରେ ପଢ଼ିବା କଷ୍ଟକର ହୋଇଛି, ଯାହା ବୟସ ସହ ସାଧାରଣ। ଆପଣଙ୍କୁ ପ୍ରାୟ {add} ପଢ଼ିବା ପାୱାର ଦରକାର।",
        "lens": "ଆମେ {design} ପରାମର୍ଶ ଦେଉଛୁ, କାରଣ {reason}",
        "index": "ଆପଣଙ୍କ ପାୱାର ପାଇଁ {index} ଲେନ୍ସ ଚଷମାକୁ ପତଳା ଓ ହାଲୁକା ରଖେ।",
        "extras": "ଏହା ସହିତ ପରାମର୍ଶ: {extras}।",
        "refer_urgent": "ଆପଣଙ୍କ କିଛି ଉତ୍ତର ବା ଫଳାଫଳ ପାଇଁ ଆଜି ହିଁ ଆଖି ଡାକ୍ତର ଦେଖାଇବା ଜରୁରୀ। ଚଷମା କିଣିବା ପୂର୍ବରୁ କ୍ଲିନିକ୍ ଯାଆନ୍ତୁ।",
        "refer_soon": "ଏହି ଫଳାଫଳ ନିଶ୍ଚିତ କରିବାକୁ ଶୀଘ୍ର ଜଣେ ଅପ୍ଟୋମେଟ୍ରିଷ୍ଟଙ୍କ ପାଖରେ ପୂର୍ଣ୍ଣ ଆଖି ପରୀକ୍ଷା କରାନ୍ତୁ।",
        "refer_routine": "ଏକ ସାଧାରଣ ଆଖି ସ୍ୱାସ୍ଥ୍ୟ ପରୀକ୍ଷା କରାଇବା ଭଲ।",
        "confidence": "ଏହି ଆକଳନରେ ଆମର ଭରସା: {level}।",
    },
}
LEVEL_WORDS = {"en": {"high": "high", "medium": "medium", "low": "low"},
               "hi": {"high": "उच्च", "medium": "मध्यम", "low": "कम"},
               "or": {"high": "ଉଚ୍ଚ", "medium": "ମଧ୍ୟମ", "low": "କମ୍"}}


def template_explanation(result: dict, lang: str) -> str:
    t = TEMPLATES.get(lang, TEMPLATES["en"])
    lw = LEVEL_WORDS.get(lang, LEVEL_WORDS["en"])
    parts: list[str] = []
    level = result.get("referral_level")
    if result.get("retail_paused"):
        return t["refer_urgent"]
    se = min(e["se"] for e in result["eyes"].values())
    hyper = any(e.get("duochrome") == "hyperopic" for e in result["eyes"].values())
    parts.append(t["myopia"] if se <= -0.5 else t["hyperopia"] if hyper else t["none"])
    if any(e["cyl"] for e in result["eyes"].values()):
        parts.append(t["astig"])
    if result.get("add", 0) >= 0.75:
        parts.append(t["add"].format(add=_fmt(result["add"])))
    p = result["products"]
    if p.get("design"):
        reason = (p["design"]["reasons"] or [""])[0]
        parts.append(t["lens"].format(design=p["design"]["name"], reason=reason[:1].lower() + reason[1:] if reason else ""))
    if p.get("index") and (p["index"].get("lens_index") or 1.5) > 1.5:
        parts.append(t["index"].format(index=p["index"]["name"]))
    extras = [x["name"] for x in p.get("coatings", []) + p.get("features", [])]
    if extras:
        parts.append(t["extras"].format(extras=", ".join(extras)))
    parts.append(t["confidence"].format(level=lw[result["confidence"]["level"]]))
    if level == "soon":
        parts.append(t["refer_soon"])
    elif level == "routine":
        parts.append(t["refer_routine"])
    return " ".join(parts)


async def explain(result: dict, lang: str) -> dict:
    base = template_explanation(result, lang)
    if llm.enabled():
        system = ("You are a friendly optical-store assistant in India. Rewrite the given explanation of an eye screening "
                  "result for the customer in simple, warm language in the requested language (max 120 words). "
                  "Do not add medical claims, do not change any numbers or product names, keep any referral advice, "
                  "and remind them it is an estimate, not a prescription.")
        out = await llm.complete(system, f"Language code: {lang}\nExplanation: {template_explanation(result, 'en')}",
                                 max_tokens=400, temperature=0.4)
        if out:
            return {"language": lang, "text": out.strip(), "source": "llm"}
    return {"language": lang, "text": base, "source": "template"}
