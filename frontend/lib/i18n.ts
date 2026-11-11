// UI strings for the customer-facing flow. Hindi / Odia drafts should be reviewed by native speakers.
import type { Lang } from "./store";

const S = {
  start: { en: "Start eye check", hi: "आँखों की जाँच शुरू करें", or: "ଆଖି ପରୀକ୍ଷା ଆରମ୍ଭ କରନ୍ତୁ" },
  consentTitle: { en: "Before we begin", hi: "शुरू करने से पहले", or: "ଆରମ୍ଭ ପୂର୍ବରୁ" },
  consentBody: {
    en: "Ocula uses your camera and microphone only on this device to measure distance and hear your answers. No photos are uploaded — only numbers like distance and eye measurements. This is a screening, not a prescription.",
    hi: "ओक्युला आपके कैमरे और माइक्रोफ़ोन का इस्तेमाल सिर्फ़ इसी डिवाइस पर दूरी मापने और आपके जवाब सुनने के लिए करता है। कोई फ़ोटो अपलोड नहीं होती — सिर्फ़ दूरी और आँखों के माप जैसे नंबर। यह जाँच है, प्रिस्क्रिप्शन नहीं।",
    or: "ଓକ୍ୟୁଲା ଆପଣଙ୍କ କ୍ୟାମେରା ଓ ମାଇକ୍ କେବଳ ଏହି ଡିଭାଇସରେ ଦୂରତା ମାପିବା ଓ ଉତ୍ତର ଶୁଣିବା ପାଇଁ ବ୍ୟବହାର କରେ। କୌଣସି ଫଟୋ ଅପଲୋଡ୍ ହୁଏ ନାହିଁ — କେବଳ ଦୂରତା ଓ ଆଖି ମାପ ପରି ସଂଖ୍ୟା। ଏହା ଏକ ସ୍କ୍ରିନିଂ, ପ୍ରେସକ୍ରିପସନ୍ ନୁହେଁ।",
  },
  agree: { en: "I agree, continue", hi: "मैं सहमत हूँ, आगे बढ़ें", or: "ମୁଁ ରାଜି, ଆଗକୁ ଯାଆନ୍ତୁ" },
  next: { en: "Next", hi: "आगे", or: "ଆଗକୁ" },
  skip: { en: "Skip", hi: "छोड़ें", or: "ଛାଡ଼ନ୍ତୁ" },
  cardTitle: { en: "Size the screen with a card", hi: "कार्ड से स्क्रीन का साइज़ सेट करें", or: "କାର୍ଡ ଦ୍ୱାରା ସ୍କ୍ରିନ୍ ମାପ କରନ୍ତୁ" },
  cardBody: {
    en: "Place any ATM, debit or ID card on the screen. Drag the slider until the box matches the card exactly.",
    hi: "कोई भी ATM, डेबिट या ID कार्ड स्क्रीन पर रखें। स्लाइडर तब तक खिसकाएँ जब तक बॉक्स कार्ड के बराबर न हो जाए।",
    or: "ଯେକୌଣସି ATM, ଡେବିଟ୍ ବା ID କାର୍ଡ ସ୍କ୍ରିନ୍ ଉପରେ ରଖନ୍ତୁ। ବକ୍ସ କାର୍ଡ ସହ ସମାନ ନହେବା ପର୍ଯ୍ୟନ୍ତ ସ୍ଲାଇଡର୍ ଘୁଞ୍ଚାନ୍ତୁ।",
  },
  distanceTitle: { en: "Camera distance check", hi: "कैमरा दूरी जाँच", or: "କ୍ୟାମେରା ଦୂରତା ଯାଞ୍ଚ" },
  coverLeft: { en: "Cover your LEFT eye with your palm", hi: "अपनी बाईं आँख हथेली से ढकें", or: "ଆପଣଙ୍କ ବାମ ଆଖି ପାପୁଲିରେ ଘୋଡ଼ାନ୍ତୁ" },
  coverRight: { en: "Cover your RIGHT eye with your palm", hi: "अपनी दाईं आँख हथेली से ढकें", or: "ଆପଣଙ୍କ ଡାହାଣ ଆଖି ପାପୁଲିରେ ଘୋଡ଼ାନ୍ତୁ" },
  bothEyes: { en: "Use both eyes", hi: "दोनों आँखों से देखें", or: "ଦୁଇ ଆଖିରେ ଦେଖନ୍ତୁ" },
  acuityTitle: { en: "Which way is the E pointing?", hi: "E किस तरफ़ इशारा कर रहा है?", or: "E କେଉଁ ଦିଗକୁ ଦେଖାଉଛି?" },
  acuityHint: {
    en: "Swipe, tap an arrow, or say up / down / left / right. If you can't tell, just guess.",
    hi: "स्वाइप करें, तीर दबाएँ, या बोलें ऊपर / नीचे / बाएँ / दाएँ। समझ न आए तो अंदाज़ा लगाएँ।",
    or: "ସ୍ୱାଇପ୍ କରନ୍ତୁ, ତୀର ଦବାନ୍ତୁ, କିମ୍ବା କୁହନ୍ତୁ ଉପର / ତଳ / ବାମ / ଡାହାଣ। ବୁଝିପାରୁ ନଥିଲେ ଅନୁମାନ କରନ୍ତୁ।",
  },
  farTitle: { en: "Move the phone away until the text blurs", hi: "फ़ोन को तब तक दूर करें जब तक अक्षर धुंधले न हों", or: "ଅକ୍ଷର ଅସ୍ପଷ୍ଟ ନହେବା ପର୍ଯ୍ୟନ୍ତ ଫୋନ୍ ଦୂରକୁ ନିଅନ୍ତୁ" },
  farBody: {
    en: "Start with the phone close to your face. Slowly move it away. Tap the button the moment the letters first start to blur.",
    hi: "फ़ोन को चेहरे के पास से शुरू करें। धीरे-धीरे दूर ले जाएँ। जैसे ही अक्षर धुंधले होने लगें, बटन दबाएँ।",
    or: "ଫୋନ୍ ମୁହଁ ପାଖରୁ ଆରମ୍ଭ କରନ୍ତୁ। ଧୀରେ ଧୀରେ ଦୂରକୁ ନିଅନ୍ତୁ। ଅକ୍ଷର ଅସ୍ପଷ୍ଟ ହେବା ମାତ୍ରେ ବଟନ୍ ଦବାନ୍ତୁ।",
  },
  blurryNow: { en: "It's blurry now", hi: "अब धुंधला है", or: "ଏବେ ଅସ୍ପଷ୍ଟ" },
  stillClear: { en: "Still clear at arm's length", hi: "हाथ भर दूरी पर भी साफ़ है", or: "ହାତ ଲମ୍ବା ଦୂରରେ ବି ସ୍ପଷ୍ଟ" },
  nearTitle: { en: "Bring the phone closer until the text blurs", hi: "फ़ोन को तब तक पास लाएँ जब तक अक्षर धुंधले न हों", or: "ଅକ୍ଷର ଅସ୍ପଷ୍ଟ ନହେବା ପର୍ଯ୍ୟନ୍ତ ଫୋନ୍ ପାଖକୁ ଆଣନ୍ତୁ" },
  nearBody: {
    en: "Hold the phone at arm's length with both eyes open. Slowly bring it closer. Tap the moment the small text can no longer be kept clear.",
    hi: "दोनों आँखें खुली रखकर फ़ोन को हाथ भर दूरी पर रखें। धीरे-धीरे पास लाएँ। जैसे ही छोटे अक्षर साफ़ न रहें, बटन दबाएँ।",
    or: "ଦୁଇ ଆଖି ଖୋଲା ରଖି ଫୋନ୍ ହାତ ଲମ୍ବା ଦୂରରେ ଧରନ୍ତୁ। ଧୀରେ ପାଖକୁ ଆଣନ୍ତୁ। ଛୋଟ ଅକ୍ଷର ସ୍ପଷ୍ଟ ନରହିବା ମାତ୍ରେ ଦବାନ୍ତୁ।",
  },
  clockTitle: { en: "Do any lines look darker or sharper?", hi: "क्या कोई रेखाएँ ज़्यादा गहरी या साफ़ दिखती हैं?", or: "କୌଣସି ରେଖା ଅଧିକ ଗାଢ଼ ବା ସ୍ପଷ୍ଟ ଦେଖାଯାଉଛି କି?" },
  allSame: { en: "All look the same", hi: "सब एक जैसी दिखती हैं", or: "ସବୁ ସମାନ ଦେଖାଯାଉଛି" },
  duoTitle: { en: "Which side's rings look sharper and darker?", hi: "किस तरफ़ के गोले ज़्यादा साफ़ और गहरे दिखते हैं?", or: "କେଉଁ ପାର୍ଶ୍ୱର ବୃତ୍ତ ଅଧିକ ସ୍ପଷ୍ଟ ଓ ଗାଢ଼?" },
  red: { en: "Red side", hi: "लाल तरफ़", or: "ନାଲି ପାର୍ଶ୍ୱ" },
  green: { en: "Green side", hi: "हरी तरफ़", or: "ସବୁଜ ପାର୍ଶ୍ୱ" },
  same: { en: "About the same", hi: "लगभग एक जैसे", or: "ପ୍ରାୟ ସମାନ" },
  contrastTitle: { en: "Which letter do you see?", hi: "आपको कौन सा अक्षर दिखता है?", or: "ଆପଣ କେଉଁ ଅକ୍ଷର ଦେଖୁଛନ୍ତି?" },
  cantSee: { en: "Can't see it", hi: "नहीं दिख रहा", or: "ଦେଖାଯାଉନି" },
  colorTitle: { en: "Which number is hidden in the dots?", hi: "बिंदुओं में कौन सा नंबर छिपा है?", or: "ବିନ୍ଦୁ ମଧ୍ୟରେ କେଉଁ ସଂଖ୍ୟା ଲୁଚିଛି?" },
  amslerTitle: { en: "Look at the centre dot. Tap any wavy, blurry or missing area.", hi: "बीच के बिंदु को देखें। कोई लहरदार, धुंधला या गायब हिस्सा हो तो उसे छुएँ।", or: "ମଝି ବିନ୍ଦୁକୁ ଦେଖନ୍ତୁ। କୌଣସି ଢେଉ ପରି, ଅସ୍ପଷ୍ଟ ବା ଗାୟବ ଅଂଶ ଛୁଅନ୍ତୁ।" },
  allStraight: { en: "All lines are straight", hi: "सभी रेखाएँ सीधी हैं", or: "ସବୁ ରେଖା ସିଧା" },
  done: { en: "Done", hi: "हो गया", or: "ହୋଇଗଲା" },
  selfieTitle: { en: "One photo for measurements", hi: "माप के लिए एक फ़ोटो", or: "ମାପ ପାଇଁ ଗୋଟିଏ ଫଟୋ" },
  selfieBody: {
    en: "Look straight at the camera. Optionally hold a bank card flat under your nose for extra accuracy. The screen will flash white for a moment.",
    hi: "सीधे कैमरे में देखें। ज़्यादा सटीकता के लिए चाहें तो बैंक कार्ड नाक के नीचे सीधा पकड़ें। स्क्रीन एक पल के लिए सफ़ेद चमकेगी।",
    or: "ସିଧା କ୍ୟାମେରାକୁ ଦେଖନ୍ତୁ। ଅଧିକ ସଠିକତା ପାଇଁ ଚାହିଁଲେ ବ୍ୟାଙ୍କ କାର୍ଡ ନାକ ତଳେ ସିଧା ଧରନ୍ତୁ। ସ୍କ୍ରିନ୍ କିଛି କ୍ଷଣ ଧଳା ଚମକିବ।",
  },
  capture: { en: "Take photo", hi: "फ़ोटो लें", or: "ଫଟୋ ନିଅନ୍ତୁ" },
  seeResults: { en: "See my results", hi: "मेरे नतीजे देखें", or: "ମୋ ଫଳାଫଳ ଦେଖନ୍ତୁ" },
  speak: { en: "Tap to speak", hi: "बोलने के लिए दबाएँ", or: "କହିବା ପାଇଁ ଦବାନ୍ତୁ" },
  typeAnswer: { en: "Or type your answer", hi: "या अपना जवाब लिखें", or: "କିମ୍ବା ଉତ୍ତର ଲେଖନ୍ତୁ" },
  yes: { en: "Yes", hi: "हाँ", or: "ହଁ" },
  no: { en: "No", hi: "नहीं", or: "ନା" },
  tooClose: { en: "Move a little further away", hi: "थोड़ा दूर हो जाइए", or: "ଟିକିଏ ଦୂରକୁ ଯାଆନ୍ତୁ" },
  tooFar: { en: "Come a little closer", hi: "थोड़ा पास आइए", or: "ଟିକିଏ ପାଖକୁ ଆସନ୍ତୁ" },
  noFace: { en: "Face not found — look at the screen", hi: "चेहरा नहीं दिखा — स्क्रीन की ओर देखें", or: "ମୁହଁ ମିଳିଲା ନାହିଁ — ସ୍କ୍ରିନ୍ ଆଡ଼କୁ ଦେଖନ୍ତୁ" },
} as const;

export type Key = keyof typeof S;
export const t = (k: Key, lang: Lang) => S[k][lang] ?? S[k].en;
export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "or", label: "ଓଡ଼ିଆ" },
];
