// ---------------------------------------------------------------------------
// Popshot — Devanagari → Latin transliteration (readable "kya haal" style)
// A compact practical romanizer: consonants carry an inherent 'a' unless a
// vowel sign or virama follows; the trailing schwa is dropped at word end.
// Not a scholarly ISO-15919 mapping — tuned for Hinglish captions.
// ---------------------------------------------------------------------------

const CONS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'd', 'ढ़': 'dh', 'फ़': 'f', 'य़': 'y',
};
const VOWELS = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
  'ऑ': 'o', 'ऍ': 'e',
};
const MATRAS = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
  'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
  'ॉ': 'o', 'ॅ': 'e',
};
const VIRAMA = '्';
const ANUSVARA = 'ं';   // nasal — n/m
const CANDRABINDU = 'ँ';
const VISARGA = 'ः';
const NUKTA = '़';
const DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };

export function hasDevanagari(text) {
  return /[ऀ-ॿ]/.test(text);
}

// ── Dictionary tier ─────────────────────────────────────────────────────────
// Pure phonetics writes "bhaaee" for भाई and "minat" for मिनट. Real Hinglish
// has settled spellings, and English loanwords written in Devanagari should
// come back as English. High-frequency words resolve here; the phonetic
// engine below is only the fallback.
const DICT = new Map(Object.entries({
  // everyday Hindi, the way people actually type it
  'भाई': 'bhai', 'क्या': 'kya', 'है': 'hai', 'हैं': 'hain', 'नहीं': 'nahi', 'क्यों': 'kyun',
  'कैसे': 'kaise', 'कैसा': 'kaisa', 'अच्छा': 'acha', 'ठीक': 'thik', 'यार': 'yaar', 'दिल': 'dil',
  'प्यार': 'pyaar', 'ज़िंदगी': 'zindagi', 'जिंदगी': 'zindagi', 'पैसा': 'paisa', 'पैसे': 'paise',
  'काम': 'kaam', 'बात': 'baat', 'लोग': 'log', 'सब': 'sab', 'और': 'aur', 'मैं': 'main',
  'मेरा': 'mera', 'मेरी': 'meri', 'मेरे': 'mere', 'तेरा': 'tera', 'अपना': 'apna', 'अपनी': 'apni',
  'हम': 'hum', 'तुम': 'tum', 'आप': 'aap', 'वो': 'wo', 'वह': 'woh', 'यह': 'yeh', 'ये': 'ye',
  'अभी': 'abhi', 'फिर': 'phir', 'कुछ': 'kuch', 'बहुत': 'bahut', 'सिर्फ': 'sirf', 'सपना': 'sapna',
  'मेहनत': 'mehnat', 'कामयाबी': 'kamyabi', 'धन्यवाद': 'dhanyavad', 'नमस्ते': 'namaste',
  'जी': 'ji', 'हाँ': 'haan', 'हां': 'haan', 'मतलब': 'matlab', 'समझ': 'samajh', 'देखो': 'dekho',
  'सुनो': 'suno', 'चलो': 'chalo', 'करो': 'karo', 'करना': 'karna', 'होना': 'hona', 'जाना': 'jaana',
  'आना': 'aana', 'लेना': 'lena', 'देना': 'dena', 'मिलना': 'milna', 'सोचो': 'socho', 'बताओ': 'batao',
  'पता': 'pata', 'ज़रूर': 'zaroor', 'बिल्कुल': 'bilkul', 'शायद': 'shayad', 'हमेशा': 'hamesha',
  'कभी': 'kabhi', 'आज': 'aaj', 'कल': 'kal', 'साल': 'saal', 'दिन': 'din', 'रात': 'raat',
  'घर': 'ghar', 'देश': 'desh', 'दुनिया': 'duniya', 'शुक्रिया': 'shukriya', 'दोस्तों': 'doston',
  'दोस्त': 'dost', 'पिछले': 'pichhle', 'से': 'se', 'में': 'mein', 'को': 'ko', 'का': 'ka',
  'की': 'ki', 'के': 'ke', 'पर': 'par', 'भी': 'bhi', 'तो': 'toh', 'ना': 'na', 'अब': 'ab',
  'थे': 'the', 'था': 'tha', 'थी': 'thi', 'हूँ': 'hoon', 'हूं': 'hoon', 'गया': 'gaya',
  'गई': 'gayi', 'रहा': 'raha', 'रही': 'rahi', 'रहे': 'rahe', 'वाला': 'wala', 'वाली': 'wali',
  'ही': 'hi', 'कर': 'kar', 'हो': 'ho', 'मुझे': 'mujhe', 'आपको': 'aapko', 'इतना': 'itna',
  'ज्यादा': 'zyada', 'ज़्यादा': 'zyada', 'कम': 'kam', 'पहले': 'pehle', 'बाद': 'baad',
  'अंदर': 'andar', 'बाहर': 'bahar', 'ऊपर': 'upar', 'नीचे': 'neeche', 'सही': 'sahi',
  'गलत': 'galat', 'नया': 'naya', 'पुराना': 'purana', 'बड़ा': 'bada', 'छोटा': 'chota',
  'सबसे': 'sabse', 'लिए': 'liye', 'साथ': 'saath', 'बिना': 'bina', 'लेकिन': 'lekin',
  'अगर': 'agar', 'तुम्हें': 'tumhein', 'हमें': 'humein', 'चाहिए': 'chahiye', 'सकता': 'sakta',
  'सकते': 'sakte', 'सकती': 'sakti', 'करते': 'karte', 'करता': 'karta', 'करती': 'karti',
  'होता': 'hota', 'होती': 'hoti', 'होते': 'hote', 'आता': 'aata', 'जाता': 'jaata',
  'बार': 'baar', 'एक': 'ek', 'दो': 'do', 'तीन': 'teen', 'चार': 'chaar', 'पाँच': 'paanch',
  // English loanwords that Whisper writes in Devanagari — restore the English
  'मिनट': 'minute', 'मिनट्स': 'minutes', 'ट्रेनिंग': 'training', 'कोचिंग': 'coaching',
  'कोच': 'coach', 'इंडस्ट्री': 'industry', 'सोशल': 'social', 'मीडिया': 'media',
  'इंस्टाग्राम': 'Instagram', 'फेसबुक': 'Facebook', 'यूट्यूब': 'YouTube', 'व्हाट्सएप': 'WhatsApp',
  'मैसेज': 'message', 'रिप्लाई': 'reply', 'बिजनेस': 'business', 'बिज़नेस': 'business',
  'सेल्स': 'sales', 'मार्केटिंग': 'marketing', 'फोन': 'phone', 'मोबाइल': 'mobile',
  'वीडियो': 'video', 'फोटो': 'photo', 'कैमरा': 'camera', 'प्लीज': 'please', 'सॉरी': 'sorry',
  'थैंक': 'thank', 'हेलो': 'hello', 'टाइम': 'time', 'फैमिली': 'family', 'फ्रेंड': 'friend',
  'स्कूल': 'school', 'कॉलेज': 'college', 'ऑफिस': 'office', 'डॉक्टर': 'doctor',
  'मार्केट': 'market', 'ऑनलाइन': 'online', 'इंटरनेट': 'internet', 'कंप्यूटर': 'computer',
  'लैपटॉप': 'laptop', 'ईमेल': 'email', 'वेबसाइट': 'website', 'फॉलो': 'follow', 'लाइक': 'like',
  'शेयर': 'share', 'सब्सक्राइब': 'subscribe', 'कमेंट': 'comment', 'पोस्ट': 'post',
  'स्टोरी': 'story', 'रील': 'reel', 'वायरल': 'viral', 'कंटेंट': 'content', 'ब्रांड': 'brand',
  'प्रोडक्ट': 'product', 'सर्विस': 'service', 'प्लान': 'plan', 'फ्री': 'free', 'ऑफर': 'offer',
  'डिस्काउंट': 'discount', 'प्राइस': 'price', 'नंबर': 'number', 'कॉल': 'call',
  'स्टार्ट': 'start', 'स्टॉप': 'stop', 'स्टेडियम': 'stadium', 'कनेक्ट': 'connect',
  'लीड': 'lead', 'लीड्स': 'leads', 'ग्रोथ': 'growth', 'टीम': 'team', 'क्लाइंट': 'client',
  'कस्टमर': 'customer', 'वेबिनार': 'webinar', 'सेशन': 'session', 'प्रोग्राम': 'program',
  'गोल': 'goal', 'टारगेट': 'target', 'रिजल्ट': 'result', 'सक्सेस': 'success',
  'स्टूडेंट': 'student', 'अकाउंट': 'account',
  'लड़की': 'ladki', 'लड़का': 'ladka', 'लड़के': 'ladke', 'सड़क': 'sadak',
  'फरीदाबाद': 'Faridabad', 'फायदा': 'fayda', 'फिल्म': 'film', 'सफल': 'safal',
}));

export function romanise(text) {
  if (!hasDevanagari(text)) return text;
  // dictionary first: strip surrounding punctuation, look up the core word
  const m = text.normalize('NFC').match(/^([^ऀ-ॿ]*)([ऀ-ॿ]+)([^ऀ-ॿ]*)$/u);
  if (m && DICT.has(m[2])) return m[1] + DICT.get(m[2]) + m[3];
  return romanisePhonetic(text);
}

function romanisePhonetic(text) {
  let out = '';
  const chars = [...text.normalize('NFC')];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (CONS[ch]) {
      // merge a following nukta into the base consonant when present
      let base = ch;
      if (chars[i + 1] === NUKTA) { base = ch + NUKTA; if (CONS[base]) i++; else base = ch; }
      out += CONS[base] || CONS[ch];
      const next = chars[i + 1];
      if (next === VIRAMA) { i++; continue; }               // explicit cluster, no vowel
      if (next && MATRAS[next]) { out += MATRAS[next]; i++; continue; }
      // inherent 'a' — dropped at the end of a word (schwa deletion)
      const after = chars[i + 1];
      const wordEnds = !after || !(CONS[after] || VOWELS[after] || MATRAS[after] || after === ANUSVARA || after === CANDRABINDU || after === NUKTA || after === VIRAMA);
      if (!wordEnds) out += 'a';
    } else if (VOWELS[ch]) {
      out += VOWELS[ch];
    } else if (ch === ANUSVARA || ch === CANDRABINDU) {
      out += 'n';
    } else if (ch === VISARGA) {
      out += 'h';
    } else if (DIGITS[ch]) {
      out += DIGITS[ch];
    } else if (ch === '।' || ch === '॥') {
      out += '.';
    } else if (ch === NUKTA || ch === VIRAMA || MATRAS[ch]) {
      // stray combining mark — skip
    } else {
      out += ch;
    }
  }
  // casual-Hinglish finals: लड़की → "ladki" not "ladkee", गुरु → "guru"
  out = out.replace(/ee(?=[^a-z]|$)/g, 'i').replace(/oo(?=[^a-z]|$)/g, 'u').replace(/aa(?=[^a-z]|$)/g, 'a');
  return out;
}
