// ---------------------------------------------------------------------------
// Popshot — hook suggestions
// Scores sentences from the user's own transcript and surfaces the strongest
// opening lines. Pure heuristics — no API key needed.
// ---------------------------------------------------------------------------

import { CONFIG } from './config.js';

function sentencesFromWords(words) {
  const live = words.filter(w => !w.deleted);
  const sentences = [];
  let cur = [];
  for (const w of live) {
    cur.push(w);
    if (/[.!?]$/.test(w.text) || cur.length >= 18) {
      sentences.push(cur);
      cur = [];
    }
  }
  if (cur.length) sentences.push(cur);
  return sentences;
}

export function suggestHooks(words) {
  const cfg = CONFIG.hooks;
  const sentences = sentencesFromWords(words);
  const scored = sentences.map((s, idx) => {
    const text = s.map(w => w.text).join(' ').replace(/\s+([.,!?])/g, '$1');
    let score = 0;
    const n = s.length;
    if (n >= cfg.minWords && n <= cfg.maxWords) score += 2;
    else if (n < cfg.minWords) score -= 2;
    for (const pat of cfg.powerPatterns) if (pat.test(text)) score += 2;
    // early sentences make natural hooks
    if (idx === 0) score += 2;
    else if (idx <= 2) score += 1;
    // penalize trailing fragments and filler-heavy lines
    if (/^(and|but|so|because|then)/i.test(text)) score -= 1;
    if (/\b(um|uh)\b/i.test(text)) score -= 2;
    return { text, score, start: s[0].start };
  });
  return scored
    .filter(h => h.text.split(' ').length >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.maxSuggestions);
}
