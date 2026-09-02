// ---------------------------------------------------------------------------
// Popshot — transcript keyword selection
// Scores every word across the WHOLE transcript and marks only the strongest
// few as keywords (w.key = true). Split-layer styles put exactly these words
// behind the speaker; every other caption stays in front — a handful of big
// moments, not a hero in every line.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(`a an the and or but so if then than because as of in on at to for from by
with about into over after before under again there here when where why how all any both each few
more most other some such no nor not only own same too very can will just should now i me my we our
you your he him his she her it its they them their this that these those am is are was were be been
being have has had having do does did doing would could may might must shall
hai hain ho ki ka ke ko se me na to bhi aur ya par kya woh yeh main hum tum aap raha rahe rahi tha
the thi gaya gaye kar karo karna nahi haan acha thik bas ek do teen abhi phir kuch sab log`.split(/\s+/));

const POWER = new Set(`never stop always every only best worst free secret mistake wrong right truth
money sales profit growth double triple win lose fail success problem result reason proof guarantee
sorry love hate fear dream goal power simple easy hard fast slow big huge small first last new old
important real fake honest change start finish today tomorrow year years crore lakh million billion
dhoka pyaar paisa dil dimaag sach jhooth kamaal dhamaka zindagi kamyabi mehnat`.split(/\s+/));

const bare = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

// Marks w.key on the strongest words. Returns how many were marked.
export function markKeywords(words, durationS) {
  const live = words.filter(w => !w.deleted);
  for (const w of words) delete w.key;
  if (live.length < 4) return 0;

  // frequency within this transcript — repeated words are less remarkable
  const freq = new Map();
  for (const w of live) {
    const b = bare(w.text);
    if (b) freq.set(b, (freq.get(b) || 0) + 1);
  }

  const scored = live.map((w, i) => {
    const b = bare(w.text);
    if (!b || STOPWORDS.has(b)) return { w, score: -1 };
    let score = Math.min(b.length, 10);            // substance
    if (/\d/.test(b)) score += 7;                  // numbers stop thumbs
    if (POWER.has(b)) score += 6;                  // charged words
    score += Math.max(0, 3 - (freq.get(b) - 1));   // rarity within the clip
    if (i < live.length * 0.15) score += 2;        // early hooks matter more
    if (/[!?]$/.test(w.text)) score += 2;
    if (b.length <= 3) score -= 3;
    return { w, score };
  }).filter(s => s.score > 4).sort((a, b) => b.score - a.score);

  // roughly one keyword every ~6 seconds, capped — and spaced out so two
  // hero moments never crowd the same breath
  const target = Math.max(2, Math.min(8, Math.round((durationS || 30) / 6)));
  const picked = [];
  for (const s of scored) {
    if (picked.length >= target) break;
    if (picked.some(p => Math.abs(p.w.start - s.w.start) < 2.5)) continue;
    if (picked.some(p => bare(p.w.text) === bare(s.w.text))) continue;
    picked.push(s);
  }
  for (const p of picked) p.w.key = true;
  return picked.length;
}
