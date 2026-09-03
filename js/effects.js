// ---------------------------------------------------------------------------
// Popshot Paper — effect registry
//
// The contract every effect implements:
//   id, name, cat, blurb, dur, loop, opaque?
//   fields:      schema the control rail renders itself from
//   duration(o): optional, when the length follows the content
//   key(o):      optional, cache identity for build()
//   build(o, mctx): optional, expensive state built once per key
//   draw(ctx, W, H, t, o, cache)
//
// `opaque` means the effect paints its own full-frame ground, so the page
// hides the canvas background swatches for it.
// ---------------------------------------------------------------------------

import { FONT_FAMILIES } from './presets.js';
import { layoutRansom, drawRansomFrame, buildMatchCut, drawMatchCutFrame } from './papertext.js';
import { TYPE_EFFECTS } from './fxtype.js';
import { SCENE_EFFECTS } from './fxscene.js';

export const FONT_LIST = FONT_FAMILIES.map(f => f.split(':')[0]);

// ── the two originals, wrapped in the same contract ───────────────────────
const ransom = {
  id: 'ransom', name: 'Magazine Letters', cat: 'Typography',
  blurb: 'Ransom-note lettering — every glyph its own scrap, font and tilt.',
  dur: 2.4, loop: false,
  fields: [
    { k: 'text', type: 'textarea', label: 'Words', def: 'CUT IT OUT' },
    { k: 'lineChars', type: 'range', label: 'Letters per line', min: 3, max: 18, step: 1, def: 8 },
    { k: 'tilt', type: 'range', label: 'Tilt', min: 0, max: 2.2, step: 0.1, def: 1 },
    { k: 'boil', type: 'range', label: 'Boil', min: 0, max: 1.5, step: 0.1, def: 0.6 },
    { k: 'mixFonts', type: 'check', label: 'Mix fonts', def: true },
  ],
  key: (o) => [o.text, o.lineChars, o.tilt, o.mixFonts, o.seed].join('|'),
  build: (o, mctx) => layoutRansom(mctx, o.text.replace(/\n/g, ' '), {
    seed: o.seed || 11, lineChars: o.lineChars, tilt: o.tilt, mixFonts: o.mixFonts,
  }),
  draw(ctx, W, H, t, o, cache) {
    drawRansomFrame(ctx, W, H, cache, t, { boil: o.boil, seed: o.seed || 11 });
  },
};

const matchcut = {
  id: 'matchcut', name: 'Match Cut', cat: 'Match cuts',
  blurb: 'Letters two phrases share hold their place while the rest tear away.',
  dur: 0, loop: false,
  fields: [
    { k: 'text', type: 'textarea', label: 'Phrases (one per line)',
      def: 'MAKE IT\nMAKE IT POP\nPOPSHOT' },
    { k: 'style', type: 'select', label: 'Style', def: 'ink',
      options: [['ink', 'Clean type'], ['ransom', 'Paper scraps']] },
    { k: 'hold', type: 'range', label: 'Hold', min: 0.3, max: 2.5, step: 0.05, def: 0.85 },
    { k: 'trans', type: 'range', label: 'Cut length', min: 0.2, max: 1.6, step: 0.05, def: 0.6 },
    { k: 'ink', type: 'color', label: 'Ink', def: '#16161c' },
  ],
  key: (o) => [o.text, o.hold, o.trans, o.style, o.seed].join('|'),
  build: (o, mctx) => buildMatchCut(mctx, o.text.split('\n'), {
    style: o.style, hold: o.hold, trans: o.trans, seed: o.seed || 11,
  }),
  duration: (o, cache) => cache?.dur || 2.5,
  draw(ctx, W, H, t, o, cache) {
    drawMatchCutFrame(ctx, W, H, cache, t, { style: o.style, ink: o.ink });
  },
};

// Effects that lay down their own full-frame ground.
const OPAQUE = new Set(['turing', 'wordsphere', 'textcube', 'depthfocus', 'typewriter',
                        'magnifier', 'countrymap', 'texttrail', 'commentmatch', 'reshuffle']);

export const EFFECTS = [ransom, matchcut, ...TYPE_EFFECTS, ...SCENE_EFFECTS]
  .map(e => ({ ...e, opaque: OPAQUE.has(e.id) }));

export const EFFECT_BY_ID = Object.fromEntries(EFFECTS.map(e => [e.id, e]));
export const EFFECT_CATS = [...new Set(EFFECTS.map(e => e.cat))];

export function defaultsFor(effect) {
  const o = { seed: 11 };
  for (const f of effect.fields) o[f.k] = f.def;
  return o;
}

// Length of one pass: an explicit duration() wins, else the declared default.
export function effectDuration(effect, o, cache) {
  if (effect.duration) {
    try { return Math.max(0.4, effect.duration.call(effect, o, cache)); } catch { /* fall through */ }
  }
  return effect.dur || 2.4;
}
