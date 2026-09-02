// ---------------------------------------------------------------------------
// Popshot — Devanagari → Latin transliteration
// Two tiers: a dictionary of settled Hinglish spellings and English loanwords,
// then a unit-based phonetic engine ported from the author's own
// caption-studio project — proper schwa deletion (word-final always; medial
// between voweled syllables, right to left), positional vowel forms (paisa,
// hindi), anusvara assimilation (kampani), and aspirate geminates (achche).
// Tuned for how creators actually romanise Hindi on screen, not for IAST.
// ---------------------------------------------------------------------------

const CONSONANTS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'ळ': 'l',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'ड़': 'd', 'ढ़': 'dh', 'फ़': 'f', 'य़': 'y',
};
const NUKTA_MAP = { 'क': 'q', 'ख': 'kh', 'ग': 'gh', 'ज': 'z', 'ड': 'd', 'ढ': 'dh', 'फ': 'f', 'य': 'y' };
const INDEPENDENT = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऍ': 'e', 'ॠ': 'ri',
};
// [medial form, word-final form] — long vowels are written short at the end
const MATRAS = {
  'ा': ['aa', 'a'], 'ि': ['i', 'i'], 'ी': ['ee', 'i'], 'ु': ['u', 'u'],
  'ू': ['oo', 'u'], 'ृ': ['ri', 'ri'], 'े': ['e', 'e'], 'ै': ['ai', 'ai'],
  'ो': ['o', 'o'], 'ौ': ['au', 'au'], 'ॉ': ['o', 'o'], 'ॅ': ['e', 'e'],
};
const VIRAMA = '\u094d';
const NUKTA_MARK = '\u093c';
const ANUSVARA = '\u0902';
const CHANDRABINDU = '\u0901';
const VISARGA = '\u0903';
const DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };
const LABIALS = new Set(['प', 'फ', 'ब', 'भ', 'म']);

export function hasDevanagari(text) {
  return /[ऀ-ॿ]/.test(text);
}

function parse(word) {
  const units = [];
  let i = 0;
  while (i < word.length) {
    const ch = word[i];
    if (DIGITS[ch]) { units.push({ type: 'raw', out: DIGITS[ch] }); i++; continue; }
    if (INDEPENDENT[ch]) { units.push({ type: 'vowel', out: INDEPENDENT[ch] }); i++; continue; }
    let cons = CONSONANTS[ch];
    if (cons) {
      const srcCh = ch;
      i++;
      if (word[i] === NUKTA_MARK) { cons = NUKTA_MAP[srcCh] ?? cons; i++; }
      const unit = { type: 'cons', cons, ch: srcCh, vowel: null, schwa: true, nasal: false };
      if (word[i] === VIRAMA) { unit.schwa = false; i++; }
      else if (MATRAS[word[i]]) { unit.vowel = MATRAS[word[i]]; unit.schwa = false; i++; }
      if (word[i] === ANUSVARA) { unit.nasal = true; unit.anusvara = true; i++; }
      else if (word[i] === CHANDRABINDU) { unit.nasal = true; i++; }
      if (word[i] === VISARGA) { unit.visarga = true; i++; }
      units.push(unit);
      continue;
    }
    if (ch === ANUSVARA || ch === CHANDRABINDU) {
      const last = units[units.length - 1];
      if (last) { last.nasal = true; last.anusvara = ch === ANUSVARA; }
      i++; continue;
    }
    if (ch === VISARGA) { const l = units[units.length - 1]; if (l) l.visarga = true; i++; continue; }
    if (ch === 'ऽ' || ch === VIRAMA || ch === NUKTA_MARK) { i++; continue; }
    if (ch === '।' || ch === '॥') { units.push({ type: 'raw', out: '.' }); i++; continue; }
    units.push({ type: 'raw', out: ch });
    i++;
  }
  return units;
}

// Schwa deletion: word-final inherent 'a' always drops (unless nothing else
// carries a vowel); medial ones drop right-to-left when flanked by voweled
// syllables. The first syllable never loses its schwa.
function deleteSchwas(units) {
  const idx = units.map((u, i) => (u.type === 'cons' ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return;
  const hasVowel = (u) => u.type === 'vowel' || (u.type === 'cons' && (u.vowel || u.schwa));
  const lastPos = idx[idx.length - 1];
  const last = units[lastPos];
  if (last.schwa && units.slice(0, lastPos).some(hasVowel)) last.schwa = false;
  const consPos = idx.slice(0, -1);
  for (let n = consPos.length - 1; n >= 0; n--) {
    const p = consPos[n];
    const u = units[p];
    if (!u.schwa) continue;
    const prev = units[p - 1];
    if (!prev || !hasVowel(prev)) continue;
    if (prev.nasal) continue;                    // kampani keeps its vowel
    const next = units.slice(p + 1).find((v) => v.type === 'cons');
    if (!next || !hasVowel(next)) continue;
    u.schwa = false;
  }
}

function renderUnits(units) {
  let out = '';
  units.forEach((u, i) => {
    if (u.type !== 'cons') { out += u.out; return; }
    // aspirate geminate doubles the stop, not the aspiration: च्छ → "chch"
    const prev = units[i - 1];
    const geminate = prev?.type === 'cons' && !prev.vowel && !prev.schwa &&
      u.cons.length > prev.cons.length && u.cons.startsWith(prev.cons);
    out += geminate ? prev.cons : u.cons;
    const atEnd = !units.slice(i + 1).some((v) => v.type === 'cons' || v.type === 'vowel');
    if (u.vowel) out += u.vowel[atEnd ? 1 : 0];
    else if (u.schwa) out += 'a';
    if (u.nasal) {
      // anusvara assimilates to the following consonant's place
      const next = units.slice(i + 1).find((v) => v.type === 'cons');
      out += u.anusvara && next && LABIALS.has(next.ch) ? 'm' : 'n';
    }
    if (u.visarga) out += 'h';
  });
  return out;
}

// ── Dictionary tier: settled spellings win over rules ───────────────────────
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
  // additional loanwords from the author's caption-studio table
  'ऑडियो': 'audio', 'ऑफलाइन': 'offline', 'कंपनी': 'company', 'चैनल': 'channel',
  'गूगल': 'Google', 'ऐप': 'app', 'एप': 'app', 'डाउनलोड': 'download', 'अपलोड': 'upload',
  'लिंक': 'link', 'प्रोफाइल': 'profile', 'पेमेंट': 'payment', 'कोर्स': 'course',
  'स्किल': 'skill', 'जॉब': 'job', 'सैलरी': 'salary', 'इनकम': 'income',
  'प्रॉफिट': 'profit', 'स्ट्रैटेजी': 'strategy', 'वीक': 'week', 'मंथ': 'month',
  'ईयर': 'year', 'लेवल': 'level', 'सिस्टम': 'system', 'प्रोसेस': 'process',
  'फाइनल': 'final', 'सिंपल': 'simple', 'स्पेशल': 'special', 'रियल': 'real', 'पावर': 'power',
}));

export function romanise(text) {
  if (!hasDevanagari(text)) return text;
  const m = /^([^ऀ-ॿ]*)(.*?)([^ऀ-ॿ]*)$/s.exec(text.normalize('NFC'));
  const [, pre, core, post] = m;
  if (DICT.has(core)) return pre + DICT.get(core) + post;
  const units = parse(core);
  deleteSchwas(units);
  return pre + renderUnits(units) + post;
}
