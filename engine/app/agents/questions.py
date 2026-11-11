"""Interview question bank (English, Hindi, Odia).

Translations were written for the prototype and should be reviewed by native speakers before deployment.
For any other language code, the LLM (when configured) translates the English prompt on the fly.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

SUPPORTED_LANGS = {"en": "English", "hi": "हिन्दी", "or": "ଓଡ଼ିଆ"}
SPEECH_LOCALES = {"en": "en-IN", "hi": "hi-IN", "or": "or-IN", "bn": "bn-IN", "ta": "ta-IN", "te": "te-IN",
                  "mr": "mr-IN", "gu": "gu-IN", "kn": "kn-IN", "ml": "ml-IN"}


@dataclass
class Question:
    id: str
    field: str
    kind: str  # number | yesno | text | symptoms | redflag
    text: dict[str, str]
    modes: tuple[str, ...] = ("adult", "phone")
    skip_if: Callable[[dict], bool] = field(default=lambda p: False)
    unit: str | None = None


def _adult(p: dict) -> bool:
    return (p.get("age") or 99) < 16


QUESTIONS: list[Question] = [
    Question("age", "age", "number", {
        "en": "Welcome to Ocula. Let's start — how old are you?",
        "hi": "ओक्युला में आपका स्वागत है। चलिए शुरू करते हैं — आपकी उम्र कितनी है?",
        "or": "ଓକ୍ୟୁଲାକୁ ସ୍ୱାଗତ। ଆରମ୍ଭ କରିବା — ଆପଣଙ୍କ ବୟସ କେତେ?",
    }, modes=("adult", "phone")),
    Question("child_age", "age", "number", {
        "en": "Hi! I'll ask the parent a few quick questions. How old is the child?",
        "hi": "नमस्ते! मैं माता-पिता से कुछ छोटे सवाल पूछूँगा। बच्चे की उम्र कितनी है?",
        "or": "ନମସ୍କାର! ମୁଁ ଅଭିଭାବକଙ୍କୁ କିଛି ଛୋଟ ପ୍ରଶ୍ନ ପଚାରିବି। ପିଲାର ବୟସ କେତେ?",
    }, modes=("kids", "camp")),
    Question("red_flags", "red_flag_screen", "redflag", {
        "en": "In the last few days, has there been any sudden loss of vision, flashes of light, a curtain over the vision, eye pain, or an eye injury?",
        "hi": "पिछले कुछ दिनों में क्या अचानक दिखना कम हुआ है, रोशनी की चमक दिखी है, आँख के आगे परदा सा आया है, आँख में दर्द या चोट लगी है?",
        "or": "ଗତ କିଛି ଦିନରେ ହଠାତ୍ ଦେଖିବା କମିଯାଇଛି କି, ଆଲୋକର ଝଲକ ଦେଖାଯାଇଛି କି, ଆଖି ଆଗରେ ପରଦା ପରି ଲାଗିଛି କି, କିମ୍ବା ଆଖିରେ ଯନ୍ତ୍ରଣା ବା ଆଘାତ ଅଛି କି?",
    }, modes=("adult", "phone", "kids", "camp")),
    Question("wears_glasses", "wears_glasses", "yesno", {
        "en": "Do you wear glasses or contact lenses right now?",
        "hi": "क्या आप अभी चश्मा या कॉन्टैक्ट लेंस पहनते हैं?",
        "or": "ଆପଣ ବର୍ତ୍ତମାନ ଚଷମା କିମ୍ବା କଣ୍ଟାକ୍ଟ ଲେନ୍ସ ପିନ୍ଧନ୍ତି କି?",
    }, modes=("adult", "phone", "kids", "camp")),
    Question("glasses_age", "glasses_age_years", "number", {
        "en": "How many years old are your current glasses?",
        "hi": "आपका मौजूदा चश्मा कितने साल पुराना है?",
        "or": "ଆପଣଙ୍କ ବର୍ତ୍ତମାନର ଚଷମା କେତେ ବର୍ଷ ପୁରୁଣା?",
    }, skip_if=lambda p: not p.get("wears_glasses"), unit="years"),
    Question("symptoms", "symptoms", "symptoms", {
        "en": "What problems do you notice? For example, blurry distance, trouble reading, headaches, tired eyes, or glare at night.",
        "hi": "आपको क्या परेशानी होती है? जैसे दूर का धुंधला दिखना, पढ़ने में दिक्कत, सिरदर्द, आँखों में थकान, या रात में चकाचौंध।",
        "or": "ଆପଣଙ୍କୁ କ'ଣ ଅସୁବିଧା ହେଉଛି? ଯେପରି ଦୂରର ଜିନିଷ ଅସ୍ପଷ୍ଟ, ପଢ଼ିବାରେ ଅସୁବିଧା, ମୁଣ୍ଡବିନ୍ଧା, ଆଖି ଥକା, କିମ୍ବା ରାତିରେ ଚମକ।",
    }),
    Question("child_symptoms", "symptoms", "symptoms", {
        "en": "Does the child sit very close to the TV or book, squint, rub their eyes, or complain of headaches?",
        "hi": "क्या बच्चा टीवी या किताब के बहुत पास बैठता है, आँखें सिकोड़ता है, आँखें मलता है, या सिरदर्द की शिकायत करता है?",
        "or": "ପିଲା ଟିଭି କିମ୍ବା ବହିର ବହୁତ ପାଖରେ ବସେ କି, ଆଖି ଛୋଟ କରେ କି, ଆଖି ଘଷେ କି, କିମ୍ବା ମୁଣ୍ଡବିନ୍ଧା କୁହେ କି?",
    }, modes=("kids", "camp")),
    Question("screen_hours", "screen_hours", "number", {
        "en": "About how many hours a day do you spend on a phone, computer or TV?",
        "hi": "आप दिन में लगभग कितने घंटे फ़ोन, कंप्यूटर या टीवी देखते हैं?",
        "or": "ଆପଣ ଦିନକୁ ପ୍ରାୟ କେତେ ଘଣ୍ଟା ଫୋନ୍, କମ୍ପ୍ୟୁଟର କିମ୍ବା ଟିଭି ଦେଖନ୍ତି?",
    }, modes=("adult", "phone", "kids", "camp"), unit="hours"),
    Question("occupation", "occupation", "text", {
        "en": "What kind of work do you do?",
        "hi": "आप किस तरह का काम करते हैं?",
        "or": "ଆପଣ କେଉଁ ପ୍ରକାର କାମ କରନ୍ତି?",
    }, skip_if=_adult),
    Question("night_driving", "night_driving", "yesno", {
        "en": "Do you drive or ride a vehicle at night?",
        "hi": "क्या आप रात में गाड़ी या बाइक चलाते हैं?",
        "or": "ଆପଣ ରାତିରେ ଗାଡ଼ି କିମ୍ବା ବାଇକ୍ ଚଳାନ୍ତି କି?",
    }, skip_if=lambda p: (p.get("age") or 99) < 18),
    Question("outdoor_hours", "outdoor_hours", "number", {
        "en": "About how many hours a day are you outdoors in daylight?",
        "hi": "आप दिन में लगभग कितने घंटे बाहर धूप में रहते हैं?",
        "or": "ଆପଣ ଦିନକୁ ପ୍ରାୟ କେତେ ଘଣ୍ଟା ବାହାରେ ଖରାରେ ରୁହନ୍ତି?",
    }, modes=("adult", "phone", "kids", "camp"), unit="hours"),
    Question("sports", "sports", "yesno", {
        "en": "Do you play sports or do physical work where glasses could get hit?",
        "hi": "क्या आप खेल खेलते हैं या ऐसा काम करते हैं जिसमें चश्मे पर चोट लग सकती है?",
        "or": "ଆପଣ ଖେଳ ଖେଳନ୍ତି କି କିମ୍ବା ଏମିତି କାମ କରନ୍ତି ଯେଉଁଥିରେ ଚଷମାରେ ଆଘାତ ଲାଗିପାରେ?",
    }, modes=("adult", "kids", "camp")),
    Question("family_myopia", "family_myopia", "yesno", {
        "en": "Does either parent wear glasses for distance?",
        "hi": "क्या माता या पिता में से कोई दूर के लिए चश्मा पहनते हैं?",
        "or": "ବାପା କିମ୍ବା ମା' ମଧ୍ୟରୁ କେହି ଦୂର ପାଇଁ ଚଷମା ପିନ୍ଧନ୍ତି କି?",
    }, modes=("kids", "camp")),
    Question("diabetes", "diabetes", "yesno", {
        "en": "Do you have diabetes or high blood sugar?",
        "hi": "क्या आपको डायबिटीज़ या शुगर है?",
        "or": "ଆପଣଙ୍କର ମଧୁମେହ ବା ସୁଗାର ଅଛି କି?",
    }, skip_if=lambda p: (p.get("age") or 99) < 25),
    Question("family_glaucoma", "family_glaucoma", "yesno", {
        "en": "Does anyone in your family have glaucoma?",
        "hi": "क्या आपके परिवार में किसी को ग्लूकोमा (काला मोतिया) है?",
        "or": "ଆପଣଙ୍କ ପରିବାରରେ କାହାର ଗ୍ଲୁକୋମା ଅଛି କି?",
    }, skip_if=lambda p: (p.get("age") or 99) < 35),
]

PHRASES = {
    "retry": {"en": "Sorry, I didn't catch that.", "hi": "माफ़ कीजिए, मैं समझ नहीं पाया।", "or": "କ୍ଷମା କରିବେ, ମୁଁ ବୁଝିପାରିଲି ନାହିଁ।"},
    "done": {
        "en": "Thank you! That's all my questions. Let's do a few quick eye games now.",
        "hi": "धन्यवाद! मेरे सवाल पूरे हुए। अब कुछ छोटे आँखों के खेल करते हैं।",
        "or": "ଧନ୍ୟବାଦ! ମୋ ପ୍ରଶ୍ନ ସରିଗଲା। ଏବେ କିଛି ଛୋଟ ଆଖି ଖେଳ ଖେଳିବା।",
    },
    "done_phone": {
        "en": "Thank you! That's all my questions. We'll send you an SMS now. Goodbye!",
        "hi": "धन्यवाद! मेरे सवाल पूरे हुए। हम अभी आपको एक SMS भेज रहे हैं। नमस्ते!",
        "or": "ଧନ୍ୟବାଦ! ମୋ ପ୍ରଶ୍ନ ସରିଗଲା। ଆମେ ଏବେ ଆପଣଙ୍କୁ SMS ପଠାଉଛୁ। ନମସ୍କାର!",
    },
    "urgent": {
        "en": "Thank you for telling me. These symptoms need an eye doctor today. Please don't wait — the staff will show you the nearest clinic.",
        "hi": "बताने के लिए धन्यवाद। इन लक्षणों के लिए आज ही आँखों के डॉक्टर को दिखाना ज़रूरी है। कृपया इंतज़ार न करें — स्टाफ़ आपको नज़दीकी क्लिनिक बताएगा।",
        "or": "କହିଥିବାରୁ ଧନ୍ୟବାଦ। ଏହି ଲକ୍ଷଣ ପାଇଁ ଆଜି ହିଁ ଆଖି ଡାକ୍ତର ଦେଖାଇବା ଜରୁରୀ। ଦୟାକରି ଅପେକ୍ଷା କରନ୍ତୁ ନାହିଁ — କର୍ମଚାରୀ ଆପଣଙ୍କୁ ପାଖ କ୍ଲିନିକ୍ ଦେଖାଇବେ।",
    },
}


def questions_for(mode: str) -> list[Question]:
    m = "adult" if mode not in ("adult", "phone", "kids", "camp") else mode
    return [q for q in QUESTIONS if m in q.modes]


def text_for(q: Question, lang: str) -> str:
    return q.text.get(lang) or q.text["en"]


def phrase(key: str, lang: str) -> str:
    return PHRASES[key].get(lang) or PHRASES[key]["en"]
