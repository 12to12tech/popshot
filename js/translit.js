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
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f', 'य़': 'y',
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

export function romanise(text) {
  if (!hasDevanagari(text)) return text;
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
  return out;
}
