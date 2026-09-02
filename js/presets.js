// ---------------------------------------------------------------------------
// Popshot — caption style presets
//
// Every style is pure data interpreted by engine.js. A preset controls fonts,
// colors, grouping, emphasis of the active word, entrance animation, position
// and special finishes (glow, pixel, glitch, tape, boxes, lower-thirds…).
//
// PAIRING SYSTEM — every two-font style follows one rule: the pair shares ONE
// trait and contrasts on ONE axis. Never two display faces together.
//   A. Didone display + its own quiet serif voice   (Gloock ↔ Instrument Serif
//      italic) — shared era, contrast of scale/weight. The fashion-cover look.
//   B. Grotesque black + light spaced grotesque     (Archivo Black ↔ Inter 300
//      tracked caps) — shared skeleton, contrast of weight. Swiss.
//   C. Fat-face didone + neutral text grotesque     (Abril Fatface ↔ Inter) —
//      contrast of era AND weight, shared neutrality of the support.
//   D. Condensed impact + humanist text             (Anton ↔ Source Sans 3) —
//      contrast of width, shared uprightness.
//   E. Raw marker/spray + engineered sans           (Rubik Spray Paint ↔ Inter
//      600 tracked caps) — contrast of texture, shared boldness.
//   F. Slab display + condensed caps                (Alfa Slab One ↔ Oswald) —
//      shared sturdiness, contrast of width. Letterpress poster.
// Support text is always the quieter voice: lighter, smaller, wider-tracked.
//
// Schema reference:
//   id, name, category, badge ('NEW'|'TRENDING'|null), tier ('free'|'creator'|'pro')
//   font:       { family, weight, size, transform?, style?, letterSpacing?, lineHeight? }
//               size is a fraction of canvas width (per line of text)
//   accentFont: same shape — used for the hero/active word (null = same as font)
//   grouping:   { mode: 'chunk'|'word'|'lockup', maxWords }
//   colors:     { text, active, stroke?, strokeWidth?, shadow?, glow?,
//                 bg?, bgRadius?, wordBg?, accent?, dim? }
//   emphasis:   'color' | 'box' | 'scale' | 'glow' | 'underline' | 'none'
//   anim:       { in: 'pop'|'fade'|'rise'|'squash'|'type'|'none', perWord: bool }
//   pos:        { y: 0..1 (center of block), align: 'center'|'left' }
//   behind:     true → words render behind the speaker (person segmentation)
//   extra:      { rotateJitter, pixelate, glitch, tape, italic, quote, lowerThird,
//                 karaokeSweep, altCase }
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  { id: 'popular',   name: 'Popular',       ai: true,  desc: 'The styles creators reach for most — across every category.' },
  { id: 'behind',    name: 'Behind the Person', ai: true, desc: 'Big statement text rendered behind the speaker.' },
  { id: 'playful',   name: 'Playful',       ai: true,  desc: 'Captions that pop in around you — auto-placed, never on your face.' },
  { id: 'multiline', name: 'Multiline',     ai: true,  desc: 'Three-line font lockups with a single hero word.' },
  { id: 'dynamic',   name: 'Dynamic',       ai: false, desc: 'Motion-driven per-word emphasis.' },
  { id: 'editorial', name: 'Editorial',     ai: true,  desc: 'Stacked serif-and-caps lockups.' },
  { id: 'social',    name: 'Social',        ai: false, desc: 'Clean, punchy styles for every feed.' },
  { id: 'neon',      name: 'Neon & FX',     ai: false, desc: 'Glass, glow, pixel and glitch finishes.' },
  { id: 'retro',     name: 'Retro',         ai: false, desc: 'Yellow, black, italic. Throwback energy.' },
  { id: 'creators',  name: 'Creators',      ai: false, desc: 'The signature looks people ask for by name.' },
  { id: 'desi',      name: 'Desi',          ai: false, desc: 'Hinglish and Devanagari — one face for both scripts.' },
  { id: 'speakers',  name: 'Speakers',      ai: false, desc: 'Lower-thirds, podcast labels and quote cards for talking heads.' },
  { id: 'ai-edits',  name: 'AI Edits',      ai: true,  desc: 'Turnkey treatments — the strongest word in every line gets promoted automatically.' },
];

const D = (o) => Object.assign({
  badge: null, tier: 'free', accentFont: null,
  grouping: { mode: 'chunk', maxWords: 4 },
  emphasis: 'color',
  anim: { in: 'pop', perWord: true },
  pos: { y: 0.74, align: 'center' },
  behind: false,
  extra: {},
}, o);

export const PRESETS = [

  // ── POPULAR ──────────────────────────────────────────────────────────────
  D({
    id: 'beast-bold', name: 'Beast Bold', category: 'popular', badge: 'TRENDING',
    font: { family: 'Archivo Black', weight: 400, size: 0.085, transform: 'upper', lineHeight: 1.08 },
    colors: { text: '#ffffff', active: '#ffe600', stroke: '#000000', strokeWidth: 0.014, shadow: 'rgba(0,0,0,.55)' },
    emphasis: 'color', anim: { in: 'pop', perWord: true },
  }),
  D({
    id: 'karaoke-flip', name: 'Karaoke Flip', category: 'popular', badge: 'TRENDING',
    font: { family: 'Montserrat', weight: 800, size: 0.075, transform: 'upper' },
    colors: { text: 'rgba(255,255,255,.92)', active: '#4ade80', stroke: '#000000', strokeWidth: 0.010 },
    emphasis: 'color', anim: { in: 'none', perWord: false }, extra: { karaokeSweep: true },
  }),
  D({
    id: 'boxed-hype', name: 'Boxed Hype', category: 'popular', badge: 'NEW',
    font: { family: 'Montserrat', weight: 900, size: 0.078, transform: 'upper' },
    colors: { text: '#ffffff', active: '#ffffff', wordBg: '#e11d48', stroke: '#000000', strokeWidth: 0.008 },
    emphasis: 'box', anim: { in: 'pop', perWord: true },
  }),
  D({
    id: 'clean-bar', name: 'Clean Bar', category: 'popular',
    font: { family: 'Inter', weight: 700, size: 0.058 },
    colors: { text: '#0b0b0f', active: '#e11d48', bg: 'rgba(255,255,255,.96)', bgRadius: 0.014 },
    emphasis: 'color', anim: { in: 'fade', perWord: false }, pos: { y: 0.80, align: 'center' },
  }),

  // ── BEHIND THE PERSON ────────────────────────────────────────────────────
  // Split-layer editorial looks. Pairing rule: one high-contrast display serif
  // carrying the hero word, its own italic (or a quiet neutral sans) carrying
  // the supporting words — contrast in size and voice, harmony in family.
  D({
    // Pairing A′: Gloock didone hero + Space Grotesk support — era contrast
    // (fashion serif vs modern grotesque), and the tall x-height keeps the
    // front captions readable on busy footage. White front, gold hero; the
    // active word flips to the hero's gold so the two layers converse.
    id: 'gilded', name: 'Gilded', category: 'behind', badge: 'TRENDING', tier: 'pro', behind: true,
    font: { family: '"Space Grotesk"', weight: 500, size: 0.062, lineHeight: 1.18 },
    accentFont: { family: 'Gloock', weight: 400, size: 0.28, transform: 'lower', letterSpacing: -0.02 },
    grouping: { mode: 'lockup', maxWords: 6 },
    heroPos: { y: 0.16 },
    colors: { text: '#ffffff', active: '#f4d47c', accent: '#f4d47c', shadow: 'rgba(0,0,0,.5)', dim: 'rgba(25,12,0,.14)' },
    emphasis: 'color', anim: { in: 'fade', perWord: false }, pos: { y: 0.8, align: 'center' },
    extra: { splitHero: true },
  }),
  D({
    // Pairing E: spray-paint hero + engineered spaced caps — raw texture
    // against order; both bold, so neither fights the other.
    id: 'inkwash', name: 'Ink Wash', category: 'behind', badge: 'NEW', tier: 'pro', behind: true,
    font: { family: 'Inter', weight: 600, size: 0.052, transform: 'upper', letterSpacing: 0.22 },
    accentFont: { family: '"Rubik Spray Paint"', weight: 400, size: 0.2, transform: 'lower' },
    grouping: { mode: 'lockup', maxWords: 6 },
    heroPos: { y: 0.15 },
    colors: { text: 'rgba(255,255,255,.96)', active: '#ffffff', accent: '#e63b2e', shadow: 'rgba(0,0,0,.5)', dim: 'rgba(0,0,0,.12)' },
    emphasis: 'none', anim: { in: 'fade', perWord: false }, pos: { y: 0.8, align: 'center' },
    extra: { splitHero: true },
  }),
  D({
    id: 'broadsheet', name: 'Broadsheet', category: 'behind', badge: 'NEW', tier: 'pro', behind: true,
    font: { family: '"DM Serif Display"', weight: 400, style: 'italic', size: 0.078, lineHeight: 1.12 },
    accentFont: { family: '"Bodoni Moda"', weight: 700, size: 0.23, transform: 'upper', letterSpacing: 0.01 },
    grouping: { mode: 'lockup', maxWords: 6 },
    heroPos: { y: 0.14 },
    colors: { text: '#ffffff', active: '#ffffff', accent: 'rgba(255,255,255,.97)', shadow: 'rgba(0,0,0,.5)', dim: 'rgba(0,0,0,.16)' },
    emphasis: 'none', anim: { in: 'rise', perWord: false }, pos: { y: 0.8, align: 'center' },
    extra: { splitHero: true },
  }),
  D({
    id: 'behind-anthem', name: 'Anthem', category: 'behind', badge: 'NEW', tier: 'pro', behind: true,
    font: { family: 'Anton', weight: 400, size: 0.16, transform: 'upper', lineHeight: 0.98 },
    grouping: { mode: 'lockup', maxWords: 3 },
    colors: { text: 'rgba(255,255,255,.94)', active: '#ffe600', dim: 'rgba(0,0,0,.25)' },
    emphasis: 'color', anim: { in: 'rise', perWord: false }, pos: { y: 0.40, align: 'center' },
  }),
  D({
    id: 'behind-editorial', name: 'Well Dressed', category: 'behind', badge: 'TRENDING', tier: 'pro', behind: true,
    font: { family: 'Playfair Display', weight: 500, size: 0.11, style: 'italic', lineHeight: 1.05 },
    accentFont: { family: 'Anton', weight: 400, size: 0.17, transform: 'upper' },
    grouping: { mode: 'lockup', maxWords: 3 },
    colors: { text: 'rgba(255,255,255,.92)', active: '#ffffff', accent: '#ffffff', dim: 'rgba(0,0,0,.22)' },
    emphasis: 'none', anim: { in: 'fade', perWord: false }, pos: { y: 0.38, align: 'center' },
  }),
  D({
    id: 'behind-hooks', name: 'Viral Hooks', category: 'behind', badge: 'NEW', tier: 'pro', behind: true,
    font: { family: 'Archivo Black', weight: 400, size: 0.13, transform: 'upper', lineHeight: 1.0 },
    grouping: { mode: 'lockup', maxWords: 4 },
    colors: { text: '#ff3b3b', active: '#ffffff', dim: 'rgba(0,0,0,.3)' },
    emphasis: 'color', anim: { in: 'pop', perWord: false }, pos: { y: 0.36, align: 'center' },
  }),

  // ── PAIRED HIGHLIGHTS (popular additions) ────────────────────────────────
  D({
    id: 'limelight', name: 'Limelight', category: 'popular', badge: 'TRENDING', tier: 'creator',
    font: { family: '"Space Grotesk"', weight: 700, size: 0.06 },
    colors: { text: '#111111', active: '#111111', wordBg: '#ffe600', wordBgAll: true, bgRadius: 0.016, glow: '#ffe600', shadow: 'rgba(0,0,0,.3)' },
    emphasis: 'box', anim: { in: 'pop', perWord: true },
  }),
  D({
    id: 'spotlit', name: 'Spotlit', category: 'popular', badge: 'NEW', tier: 'creator',
    font: { family: 'Archivo Black', weight: 400, size: 0.062, transform: 'upper' },
    accentFont: { family: 'Archivo Black', weight: 400, size: 0.062, transform: 'upper' },
    colors: { text: '#ffffff', active: '#111111', wordBg: '#ffe600', stroke: '#000000', strokeWidth: 0.008, shadow: 'rgba(0,0,0,.45)' },
    emphasis: 'box', anim: { in: 'none', perWord: false },
    extra: { autoKey: true },
  }),
  D({
    id: 'muse', name: 'Muse', category: 'editorial', badge: 'TRENDING', tier: 'creator',
    font: { family: 'Inter', weight: 300, size: 0.052, transform: 'upper', letterSpacing: 0.24 },
    accentFont: { family: '"Cormorant Garamond"', weight: 600, style: 'italic', size: 0.105, transform: 'lower' },
    grouping: { mode: 'lockup', maxWords: 4 },
    colors: { text: 'rgba(255,255,255,.92)', active: '#ffffff', accent: '#ffffff', shadow: 'rgba(0,0,0,.45)' },
    emphasis: 'none', anim: { in: 'fade', perWord: false }, pos: { y: 0.72, align: 'center' },
  }),

  // ── PLAYFUL ──────────────────────────────────────────────────────────────
  D({
    id: 'bubble-pop', name: 'Bubble Pop', category: 'playful', badge: 'TRENDING',
    font: { family: 'Lilita One', weight: 400, size: 0.082 },
    colors: { text: '#ffffff', active: '#ffd93d', stroke: '#7c3aed', strokeWidth: 0.016, shadow: 'rgba(124,58,237,.5)' },
    emphasis: 'scale', anim: { in: 'squash', perWord: true }, extra: { rotateJitter: 0.05 },
  }),
  D({
    id: 'marker-note', name: 'Marker Note', category: 'playful', badge: 'NEW',
    font: { family: 'Permanent Marker', weight: 400, size: 0.07 },
    colors: { text: '#fefefe', active: '#ff5d8f', shadow: 'rgba(0,0,0,.6)' },
    emphasis: 'underline', anim: { in: 'rise', perWord: true }, extra: { rotateJitter: 0.06 },
  }),
  D({
    id: 'sticker-white', name: 'Sticker', category: 'playful',
    font: { family: 'Poppins', weight: 800, size: 0.062 },
    colors: { text: '#111111', active: '#111111', wordBg: '#ffffff', bgRadius: 0.012, wordBgAll: true, shadow: 'rgba(0,0,0,.35)' },
    emphasis: 'box', anim: { in: 'pop', perWord: true }, extra: { rotateJitter: 0.03 },
  }),
  D({
    id: 'comic-pow', name: 'Comic Pow', category: 'playful', badge: 'NEW',
    font: { family: 'Bangers', weight: 400, size: 0.095, letterSpacing: 0.06 },
    colors: { text: '#fff200', active: '#ff2079', stroke: '#000000', strokeWidth: 0.014, shadow: 'rgba(0,0,0,.5)' },
    emphasis: 'scale', anim: { in: 'squash', perWord: true },
  }),

  // ── MULTILINE (lockups) ──────────────────────────────────────────────────
  D({
    // Pairing B: one grotesque skeleton, two weights — Archivo Black hero,
    // light wide-tracked Inter caps for support. Weight is the only contrast.
    id: 'swiss-lockup', name: 'Swiss', category: 'multiline', badge: 'TRENDING', tier: 'creator',
    font: { family: 'Inter', weight: 300, size: 0.052, transform: 'upper', letterSpacing: 0.14, lineHeight: 1.3 },
    accentFont: { family: 'Archivo Black', weight: 400, size: 0.108, transform: 'upper' },
    grouping: { mode: 'lockup', maxWords: 6 },
    colors: { text: 'rgba(255,255,255,.92)', active: '#ffffff', accent: '#ffffff', shadow: 'rgba(0,0,0,.5)' },
    emphasis: 'none', anim: { in: 'rise', perWord: false }, pos: { y: 0.70, align: 'center' },
  }),
  D({
    id: 'serif-contrast', name: 'Abril Contrast', category: 'multiline', badge: 'NEW', tier: 'creator',
    font: { family: 'Inter', weight: 300, size: 0.058, lineHeight: 1.2 },
    accentFont: { family: 'Abril Fatface', weight: 400, size: 0.115 },
    grouping: { mode: 'lockup', maxWords: 6 },
    colors: { text: 'rgba(255,255,255,.88)', active: '#ffffff', accent: '#ffd166', shadow: 'rgba(0,0,0,.5)' },
    emphasis: 'none', anim: { in: 'fade', perWord: false }, pos: { y: 0.70, align: 'center' },
  }),
  D({
    id: 'vanguard', name: 'Vanguard', category: 'multiline', badge: 'NEW', tier: 'creator',
    font: { family: 'Playfair Display', weight: 500, size: 0.06, style: 'italic', lineHeight: 1.2 },
    accentFont: { family: 'Bebas Neue', weight: 400, size: 0.13, transform: 'upper', letterSpacing: 0.04 },
    grouping: { mode: 'lockup', maxWords: 6 },
    colors: { text: 'rgba(255,255,255,.92)', active: '#ffffff', accent: '#7dd3fc', shadow: 'rgba(0,0,0,.55)' },
    emphasis: 'none', anim: { in: 'rise', perWord: false }, pos: { y: 0.70, align: 'center' },
  }),
  D({
    // Pairing D: condensed impact caps against a humanist text face — the
    // width contrast does the work; both stay upright and plain.
    id: 'epic-pro', name: 'Epic', category: 'multiline', tier: 'creator',
    font: { family: '"Source Sans 3"', weight: 400, size: 0.056, lineHeight: 1.22 },
    accentFont: { family: 'Anton', weight: 400, size: 0.125, transform: 'upper', letterSpacing: 0.01 },
    grouping: { mode: 'lockup', maxWords: 6 },
    colors: { text: 'rgba(255,255,255,.92)', active: '#ffffff', accent: '#f97316', shadow: 'rgba(0,0,0,.5)' },
    emphasis: 'none', anim: { in: 'pop', perWord: false }, pos: { y: 0.70, align: 'center' },
  }),
  D({
    // Pairing F: slab-serif display + condensed caps — both sturdy, the
    // width contrast keeps them apart. Letterpress poster energy.
    id: 'letterpress', name: 'Letterpress', category: 'multiline', badge: 'NEW', tier: 'creator',
    font: { family: 'Oswald', weight: 500, size: 0.055, transform: 'upper', letterSpacing: 0.1, lineHeight: 1.3 },
    accentFont: { family: '"Alfa Slab One"', weight: 400, size: 0.105 },
    grouping: { mode: 'lockup', maxWords: 6 },
    colors: { text: 'rgba(255,244,214,.95)', active: '#fff4d6', accent: '#fff4d6', shadow: 'rgba(40,20,0,.55)' },
    emphasis: 'none', anim: { in: 'rise', perWord: false }, pos: { y: 0.70, align: 'center' },
  }),

  // ── DYNAMIC ──────────────────────────────────────────────────────────────
  D({
    id: 'one-word-pop', name: 'One Word', category: 'dynamic', badge: 'TRENDING',
    font: { family: 'Archivo Black', weight: 400, size: 0.13, transform: 'upper' },
    grouping: { mode: 'word', maxWords: 1 },
    colors: { text: '#ffffff', active: '#ffffff', stroke: '#000000', strokeWidth: 0.012, shadow: 'rgba(0,0,0,.5)' },
    emphasis: 'none', anim: { in: 'pop', perWord: true }, pos: { y: 0.5, align: 'center' },
  }),
  D({
    id: 'squash-word', name: 'Squash', category: 'dynamic', badge: 'NEW',
    font: { family: 'Titan One', weight: 400, size: 0.115 },
    grouping: { mode: 'word', maxWords: 1 },
    colors: { text: '#fef08a', active: '#fef08a', stroke: '#312e81', strokeWidth: 0.016, shadow: 'rgba(49,46,129,.55)' },
    emphasis: 'none', anim: { in: 'squash', perWord: true }, pos: { y: 0.5, align: 'center' },
  }),
  D({
    id: 'typewriter', name: 'Typewriter', category: 'dynamic',
    font: { family: 'Space Mono', weight: 700, size: 0.06 },
    colors: { text: '#e2e8f0', active: '#e2e8f0', bg: 'rgba(2,6,23,.78)', bgRadius: 0.008 },
    emphasis: 'none', anim: { in: 'type', perWord: true }, pos: { y: 0.76, align: 'center' },
  }),
  D({
    id: 'rise-up', name: 'Rise Up', category: 'dynamic', badge: 'NEW',
    font: { family: 'Oswald', weight: 600, size: 0.082, transform: 'upper', letterSpacing: 0.03 },
    colors: { text: '#ffffff', active: '#38bdf8', shadow: 'rgba(0,0,0,.55)' },
    emphasis: 'color', anim: { in: 'rise', perWord: true },
  }),

  // ── EDITORIAL ────────────────────────────────────────────────────────────
  D({
    id: 'editorial-stack', name: 'Editorial Stack', category: 'editorial', badge: 'TRENDING', tier: 'creator',
    font: { family: 'Playfair Display', weight: 600, size: 0.07, lineHeight: 1.18 },
    accentFont: { family: 'Cormorant Garamond', weight: 600, size: 0.1, style: 'italic' },
    grouping: { mode: 'lockup', maxWords: 5 },
    colors: { text: '#f8fafc', active: '#f8fafc', accent: '#f8fafc', shadow: 'rgba(0,0,0,.5)' },
    emphasis: 'none', anim: { in: 'fade', perWord: false }, pos: { y: 0.68, align: 'center' },
  }),
  D({
    id: 'quiet-serif', name: 'Quiet Serif', category: 'editorial', tier: 'creator',
    font: { family: 'Cormorant Garamond', weight: 600, size: 0.064, style: 'italic' },
    colors: { text: '#fafaf9', active: '#fbbf24', shadow: 'rgba(0,0,0,.55)' },
    emphasis: 'color', anim: { in: 'fade', perWord: false }, pos: { y: 0.78, align: 'center' },
  }),
  D({
    id: 'magazine-caps', name: 'Magazine Caps', category: 'editorial', badge: 'NEW', tier: 'creator',
    font: { family: 'Libre Caslon Text', weight: 700, size: 0.062, transform: 'upper', letterSpacing: 0.1 },
    colors: { text: '#ffffff', active: '#ffffff', bg: 'rgba(12,10,9,.65)', bgRadius: 0 },
    emphasis: 'underline', anim: { in: 'fade', perWord: false }, pos: { y: 0.78, align: 'center' },
  }),

  // ── SOCIAL ───────────────────────────────────────────────────────────────
  D({
    id: 'tiktok-classic', name: 'Feed Classic', category: 'social',
    font: { family: '"Proxima Nova", Montserrat', weight: 700, size: 0.062 },
    colors: { text: '#ffffff', active: '#ffffff', stroke: '#000000', strokeWidth: 0.010 },
    emphasis: 'none', anim: { in: 'none', perWord: false },
  }),
  D({
    id: 'reels-clean', name: 'Reels Clean', category: 'social',
    font: { family: 'Inter', weight: 800, size: 0.058 },
    colors: { text: '#ffffff', active: '#a3e635', shadow: 'rgba(0,0,0,.6)' },
    emphasis: 'color', anim: { in: 'fade', perWord: false },
  }),
  D({
    id: 'soft-shadow', name: 'Soft Shadow', category: 'social',
    font: { family: 'Nunito', weight: 800, size: 0.06 },
    colors: { text: '#fff7ed', active: '#fdba74', shadow: 'rgba(0,0,0,.7)' },
    emphasis: 'color', anim: { in: 'rise', perWord: true },
  }),
  D({
    id: 'caption-strip', name: 'Caption Strip', category: 'social',
    font: { family: 'Inter', weight: 700, size: 0.052 },
    colors: { text: '#ffffff', active: '#ffe600', bg: 'rgba(0,0,0,.72)', bgRadius: 0.010 },
    emphasis: 'color', anim: { in: 'none', perWord: false }, pos: { y: 0.82, align: 'center' },
  }),

  // ── NEON & FX ────────────────────────────────────────────────────────────
  D({
    id: 'neon-glow', name: 'Neon Glow', category: 'neon', badge: 'TRENDING', tier: 'creator',
    font: { family: 'Bebas Neue', weight: 400, size: 0.1, transform: 'upper', letterSpacing: 0.05 },
    colors: { text: '#f0abfc', active: '#22d3ee', glow: '#d946ef' },
    emphasis: 'glow', anim: { in: 'fade', perWord: true },
  }),
  D({
    id: 'terminal-ship', name: 'Terminal', category: 'neon', badge: 'NEW', tier: 'creator',
    font: { family: 'JetBrains Mono, Space Mono', weight: 700, size: 0.055 },
    colors: { text: '#4ade80', active: '#ffffff', bg: 'rgba(3,7,18,.85)', bgRadius: 0.008, glow: '#22c55e' },
    emphasis: 'color', anim: { in: 'type', perWord: true }, pos: { y: 0.78, align: 'center' },
  }),
  D({
    id: 'pixel-quest', name: 'Pixel Quest', category: 'neon', badge: 'NEW', tier: 'creator',
    font: { family: '"Press Start 2P"', weight: 400, size: 0.045, lineHeight: 1.5 },
    colors: { text: '#facc15', active: '#f87171', stroke: '#1e1b4b', strokeWidth: 0.010 },
    emphasis: 'color', anim: { in: 'pop', perWord: true },
  }),
  D({
    id: 'glitch-check', name: 'Reality Glitch', category: 'neon', tier: 'creator',
    font: { family: 'Archivo Black', weight: 400, size: 0.085, transform: 'upper' },
    colors: { text: '#ffffff', active: '#ffffff' },
    emphasis: 'none', anim: { in: 'pop', perWord: true }, extra: { glitch: true },
  }),
  D({
    id: 'glass-panel', name: 'Glass Panel', category: 'neon', tier: 'creator',
    font: { family: 'Poppins', weight: 600, size: 0.055 },
    colors: { text: '#ffffff', active: '#67e8f9', bg: 'rgba(255,255,255,.14)', bgRadius: 0.018, bgStroke: 'rgba(255,255,255,.35)' },
    emphasis: 'color', anim: { in: 'fade', perWord: false }, pos: { y: 0.78, align: 'center' },
  }),

  // ── RETRO ────────────────────────────────────────────────────────────────
  D({
    id: 'retro-yellow', name: 'Retro Yellow', category: 'retro',
    font: { family: 'Oswald', weight: 700, size: 0.08, transform: 'upper', style: 'italic' },
    colors: { text: '#ffe600', active: '#000000', wordBg: '#ffe600', stroke: '#000000', strokeWidth: 0.006, shadow: 'rgba(0,0,0,.5)' },
    emphasis: 'box', anim: { in: 'pop', perWord: true },
  }),
  D({
    id: 'vhs-tape', name: 'VHS Tape', category: 'retro',
    font: { family: 'Space Mono', weight: 700, size: 0.06, transform: 'upper' },
    colors: { text: '#ffffff', active: '#ffffff' },
    emphasis: 'none', anim: { in: 'none', perWord: false }, extra: { glitch: true, vhs: true }, pos: { y: 0.8, align: 'center' },
  }),
  D({
    id: 'groovy-70s', name: 'Groovy', category: 'retro', badge: 'NEW',
    font: { family: 'Shrikhand', weight: 400, size: 0.085 },
    colors: { text: '#fb923c', active: '#fde047', stroke: '#7c2d12', strokeWidth: 0.012, shadow: 'rgba(124,45,18,.5)' },
    emphasis: 'color', anim: { in: 'squash', perWord: true }, extra: { rotateJitter: 0.03 },
  }),

  // ── CREATORS ─────────────────────────────────────────────────────────────
  D({
    id: 'spaced-read', name: 'Read This Now', category: 'creators', badge: 'NEW', tier: 'creator',
    font: { family: 'Bebas Neue', weight: 400, size: 0.09, transform: 'upper', letterSpacing: 0.22 },
    grouping: { mode: 'word', maxWords: 1 },
    colors: { text: '#ffffff', active: '#ffffff', shadow: 'rgba(0,0,0,.6)' },
    emphasis: 'none', anim: { in: 'type', perWord: true }, pos: { y: 0.5, align: 'center' },
  }),
  D({
    id: 'chapter-two', name: 'Chapter Two', category: 'creators', badge: 'TRENDING', tier: 'creator',
    font: { family: 'Libre Caslon Text', weight: 700, size: 0.052, transform: 'upper', letterSpacing: 0.16 },
    accentFont: { family: 'Playfair Display', weight: 600, size: 0.12, style: 'italic' },
    grouping: { mode: 'lockup', maxWords: 4 },
    colors: { text: 'rgba(255,255,255,.85)', active: '#ffffff', accent: '#ffffff', shadow: 'rgba(0,0,0,.55)' },
    emphasis: 'none', anim: { in: 'fade', perWord: false }, pos: { y: 0.5, align: 'center' },
  }),
  D({
    id: 'software-pick', name: 'Pick Your Tool', category: 'creators', badge: 'NEW', tier: 'creator',
    font: { family: 'JetBrains Mono, "Space Mono"', weight: 700, size: 0.05 },
    colors: { text: '#e2e8f0', active: '#0b0b0f', wordBg: '#4ade80', bgRadius: 0.008, bg: 'rgba(2,6,23,.7)' },
    emphasis: 'box', anim: { in: 'type', perWord: true }, pos: { y: 0.78, align: 'center' },
  }),
  D({
    id: 'quiet-confidence', name: 'Quiet Confidence', category: 'creators', tier: 'creator',
    font: { family: 'Inter', weight: 300, size: 0.055, transform: 'lower', letterSpacing: 0.06 },
    accentFont: { family: 'Inter', weight: 800, size: 0.055 },
    grouping: { mode: 'lockup', maxWords: 5 },
    colors: { text: 'rgba(255,255,255,.9)', active: '#ffffff', accent: '#ffffff', shadow: 'rgba(0,0,0,.5)' },
    emphasis: 'none', anim: { in: 'rise', perWord: false }, pos: { y: 0.72, align: 'center' },
  }),

  // ── AI EDITS (turnkey auto-emphasis) ─────────────────────────────────────
  D({
    id: 'ai-punch', name: 'Auto Punch', category: 'ai-edits', badge: 'TRENDING', tier: 'pro',
    font: { family: 'Montserrat', weight: 700, size: 0.06 },
    accentFont: { family: 'Anton', weight: 400, size: 0.095, transform: 'upper' },
    colors: { text: 'rgba(255,255,255,.92)', active: '#ffffff', accent: '#ffe600', stroke: '#000000', strokeWidth: 0.008, shadow: 'rgba(0,0,0,.5)' },
    emphasis: 'color', anim: { in: 'pop', perWord: true },
    extra: { autoKey: true },
  }),
  D({
    id: 'ai-essay', name: 'Auto Essay', category: 'ai-edits', badge: 'NEW', tier: 'pro',
    font: { family: 'Inter', weight: 400, size: 0.052 },
    accentFont: { family: 'Playfair Display', weight: 600, size: 0.075, style: 'italic' },
    colors: { text: 'rgba(255,255,255,.88)', active: '#ffffff', accent: '#7dd3fc', shadow: 'rgba(0,0,0,.55)', dim: 'rgba(0,0,0,.18)' },
    emphasis: 'color', anim: { in: 'fade', perWord: false },
    extra: { autoKey: true },
  }),
  D({
    id: 'ai-hype', name: 'Auto Hype', category: 'ai-edits', badge: 'NEW', tier: 'pro',
    font: { family: 'Poppins', weight: 800, size: 0.058, transform: 'upper' },
    accentFont: { family: 'Titan One', weight: 400, size: 0.09 },
    colors: { text: '#ffffff', active: '#ffffff', accent: '#4ade80', stroke: '#0f172a', strokeWidth: 0.01, shadow: 'rgba(15,23,42,.5)' },
    emphasis: 'scale', anim: { in: 'squash', perWord: true },
    extra: { autoKey: true },
  }),

  // ── DESI ─────────────────────────────────────────────────────────────────
  D({
    id: 'hinglish-bold', name: 'Hinglish Bold', category: 'desi', badge: 'TRENDING',
    font: { family: '"Baloo 2", "Noto Sans Devanagari"', weight: 800, size: 0.075 },
    colors: { text: '#ffffff', active: '#fbbf24', stroke: '#000000', strokeWidth: 0.012, shadow: 'rgba(0,0,0,.5)' },
    emphasis: 'color', anim: { in: 'pop', perWord: true },
  }),
  D({
    id: 'desi-pop', name: 'Desi Pop', category: 'desi', badge: 'NEW',
    font: { family: '"Baloo 2", "Noto Sans Devanagari"', weight: 800, size: 0.07 },
    colors: { text: '#111111', active: '#111111', wordBg: '#4ade80', wordBgAll: true, bgRadius: 0.014, shadow: 'rgba(0,0,0,.35)' },
    emphasis: 'box', anim: { in: 'squash', perWord: true }, extra: { rotateJitter: 0.03 },
  }),

  // ── SPEAKERS ─────────────────────────────────────────────────────────────
  D({
    id: 'lower-third', name: 'Lower Third', category: 'speakers', badge: 'NEW', tier: 'creator',
    font: { family: 'Inter', weight: 700, size: 0.048 },
    colors: { text: '#ffffff', active: '#ffffff', bg: 'rgba(15,23,42,.85)', bgRadius: 0.006, accentBar: '#e11d48' },
    emphasis: 'none', anim: { in: 'rise', perWord: false }, pos: { y: 0.86, align: 'left' },
    extra: { lowerThird: true },
  }),
  D({
    id: 'podcast-quote', name: 'Podcast Quote', category: 'speakers', tier: 'creator',
    font: { family: 'Lora', weight: 600, size: 0.058, style: 'italic' },
    colors: { text: '#f5f5f4', active: '#f5f5f4', bg: 'rgba(28,25,23,.72)', bgRadius: 0.016 },
    emphasis: 'none', anim: { in: 'fade', perWord: false }, pos: { y: 0.76, align: 'center' },
    extra: { quote: true },
  }),
  D({
    id: 'breath-minimal', name: 'Take a Breath', category: 'speakers', badge: 'TRENDING', tier: 'creator',
    font: { family: 'Inter', weight: 300, size: 0.06, letterSpacing: 0.12, transform: 'lower' },
    grouping: { mode: 'word', maxWords: 1 },
    colors: { text: 'rgba(255,255,255,.95)', active: 'rgba(255,255,255,.95)', shadow: 'rgba(0,0,0,.45)' },
    emphasis: 'none', anim: { in: 'fade', perWord: true }, pos: { y: 0.5, align: 'center' },
  }),
];

// styles surfaced under "Popular" also keep their home category; build the tab lists here
export function presetsForCategory(catId) {
  if (catId === 'popular') {
    const ids = ['gilded', 'beast-bold', 'limelight', 'spotlit', 'karaoke-flip', 'boxed-hype',
                 'muse', 'clean-bar', 'one-word-pop', 'bubble-pop', 'swiss-lockup', 'neon-glow'];
    return ids.map(id => PRESETS.find(p => p.id === id)).filter(Boolean);
  }
  return PRESETS.filter(p => p.category === catId);
}

export function getPreset(id) {
  return PRESETS.find(p => p.id === id) || PRESETS[0];
}

// Google Fonts needed by the presets (loaded in <head> of both pages)
export const FONT_FAMILIES = [
  'Archivo Black', 'Montserrat:wght@700;800;900', 'Inter:wght@300;400;700;800',
  'Anton', 'Playfair Display:ital,wght@0,500;0,600;1,500;1,600', 'Lilita One',
  'Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,300;1,9..144,400',
  'Bodoni Moda:opsz,wght@6..96,700', 'DM Serif Display:ital@0;1', 'Space Grotesk:wght@500;700',
  'Gloock', 'Instrument Serif:ital@0;1', 'Rubik Spray Paint', 'Alfa Slab One', 'Source Sans 3:wght@400;600',
  'Permanent Marker', 'Poppins:wght@600;800', 'Bangers', 'Abril Fatface',
  'Bebas Neue', 'Titan One', 'Space Mono:wght@700', 'Oswald:ital,wght@0,600;0,700;1,700',
  'Cormorant Garamond:ital,wght@0,600;1,600', 'Libre Caslon Text:wght@700',
  'Nunito:wght@800', 'JetBrains Mono:wght@700', 'Press Start 2P', 'Shrikhand',
  'Baloo 2:wght@800', 'Noto Sans Devanagari:wght@800', 'Lora:ital,wght@1,600',
];
