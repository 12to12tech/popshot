// ---------------------------------------------------------------------------
// Popshot — caption style presets
//
// Every style is pure data interpreted by engine.js. A preset controls fonts,
// colors, grouping, emphasis of the active word, entrance animation, position
// and special finishes (glow, pixel, glitch, tape, boxes, lower-thirds…).
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
  { id: 'desi',      name: 'Desi',          ai: false, desc: 'Hinglish and Devanagari — one face for both scripts.' },
  { id: 'speakers',  name: 'Speakers',      ai: false, desc: 'Lower-thirds, podcast labels and quote cards for talking heads.' },
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
    id: 'swiss-lockup', name: 'Swiss', category: 'multiline', badge: 'TRENDING', tier: 'creator',
    font: { family: 'Inter', weight: 400, size: 0.062, lineHeight: 1.15 },
    accentFont: { family: 'Archivo Black', weight: 400, size: 0.105, transform: 'upper' },
    grouping: { mode: 'lockup', maxWords: 6 },
    colors: { text: 'rgba(255,255,255,.9)', active: '#ffffff', accent: '#ffffff', shadow: 'rgba(0,0,0,.5)' },
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
    id: 'epic-pro', name: 'Epic Pro', category: 'multiline', tier: 'creator',
    font: { family: 'Arial', weight: 400, size: 0.056, lineHeight: 1.18 },
    accentFont: { family: 'Anton', weight: 400, size: 0.12, transform: 'upper' },
    grouping: { mode: 'lockup', maxWords: 6 },
    colors: { text: 'rgba(255,255,255,.9)', active: '#ffffff', accent: '#f97316', shadow: 'rgba(0,0,0,.5)' },
    emphasis: 'none', anim: { in: 'pop', perWord: false }, pos: { y: 0.70, align: 'center' },
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
    font: { family: 'Proxima Nova, Montserrat', weight: 700, size: 0.062 },
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
    const ids = ['beast-bold', 'karaoke-flip', 'boxed-hype', 'clean-bar', 'one-word-pop',
                 'bubble-pop', 'swiss-lockup', 'behind-anthem', 'neon-glow', 'retro-yellow'];
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
  'Anton', 'Playfair Display:ital,wght@0,500;0,600;1,500', 'Lilita One',
  'Permanent Marker', 'Poppins:wght@600;800', 'Bangers', 'Abril Fatface',
  'Bebas Neue', 'Titan One', 'Space Mono:wght@700', 'Oswald:ital,wght@0,600;0,700;1,700',
  'Cormorant Garamond:ital,wght@0,600;1,600', 'Libre Caslon Text:wght@700',
  'Nunito:wght@800', 'JetBrains Mono:wght@700', 'Press Start 2P', 'Shrikhand',
  'Baloo 2:wght@800', 'Noto Sans Devanagari:wght@800', 'Lora:ital,wght@1,600',
];
