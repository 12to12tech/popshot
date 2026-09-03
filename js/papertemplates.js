// ---------------------------------------------------------------------------
// Popshot Paper — Motion Lab templates
//
// A template is a whole look in one click: for `kind: 'paper'` that means the
// paper settings plus an animation; for `kind: 'fx'` it is an effect id and
// the options to override. Nothing here is a new capability — each one is a
// point in the space the controls already cover, chosen because it reads well.
//
// The gallery renders every card live from these objects, so adding one is
// appending to this array.
// ---------------------------------------------------------------------------

import { DEFAULT_LOOK } from './paperfx.js';

const look = (o) => ({ ...DEFAULT_LOOK, ...o });

export const TEMPLATE_CATEGORIES = ['All', 'Paper', 'Typography', 'Match cuts', 'Scenes'];

export const TEMPLATES = [
  // ── Paper ───────────────────────────────────────────────────────────────
  {
    id: 'brochure', name: 'Brochure open', cat: 'Paper', kind: 'paper',
    anim: 'foldout', aspect: '1:1', bg: '#f7f6f1', zoom: 0.82, panels: 3,
    look: look({ edge: 3.2, ragged: 0.35, layers: 1, shadow: 0.55 }),
    blurb: 'Three-panel flyer opening flat. The default for a product shot.',
  },
  {
    id: 'zine', name: 'Zine drop', cat: 'Paper', kind: 'paper',
    anim: 'quarters', aspect: '9:16', bg: '#efece1', zoom: 0.8, panels: 2,
    look: look({ edge: 4.6, ragged: 0.8, layers: 2, grain: 0.7, tint: '#f2ead6' }),
    blurb: 'Hand-folded quarter sheet, heavy grain, opens on two axes.',
  },
  {
    id: 'confetti', name: 'Cut-out pop', cat: 'Paper', kind: 'paper',
    anim: 'popin', aspect: '1:1', bg: '#5145cd', zoom: 0.78,
    look: look({ edge: 4.2, ragged: 0.65, layers: 3, shadow: 0.8 }),
    blurb: 'Layered cardstock landing with a squash. Loud on a colour field.',
  },
  {
    id: 'slap', name: 'Paper slap', cat: 'Paper', kind: 'paper',
    anim: 'flip', aspect: '16:9', bg: '#16161c', zoom: 0.72,
    look: look({ edge: 2.6, ragged: 0.3, shadow: 0.9, inner: 0.5 }),
    blurb: 'Swings in edge-on and hits the frame flat. Good for a hard cut.',
  },
  {
    id: 'collage', name: 'Collage build', cat: 'Paper', kind: 'paper',
    anim: 'stack', aspect: '4:5', bg: '#f3ecd8', zoom: 0.8,
    look: look({ edge: 5, ragged: 0.9, layers: 3, tint: '#fffdf7', grain: 0.5 }),
    blurb: 'Three offset scraps flying in and settling into register.',
  },
  {
    id: 'tearaway', name: 'Tear away', cat: 'Paper', kind: 'paper',
    anim: 'rip', aspect: '9:16', bg: '#e6e2d6', zoom: 0.84,
    look: look({ edge: 3.6, ragged: 0.7, tint: '#f0e9d8' }),
    blurb: 'A covering sheet rips down the middle and pulls off frame.',
  },
  {
    id: 'unwrap', name: 'Slow unwrap', cat: 'Paper', kind: 'paper',
    anim: 'concertina', aspect: '16:9', bg: '#faf7ef', zoom: 0.9, panels: 5, dur: 3.4,
    look: look({ edge: 2.4, ragged: 0.25, shadow: 0.4, layers: 1 }),
    blurb: 'A long concertina pull-out. Reads as a banner unrolling.',
  },
  {
    id: 'liftoff', name: 'Lift off', cat: 'Paper', kind: 'paper',
    anim: 'slide', aspect: '9:16', bg: 'transparent', zoom: 0.86,
    look: look({ edge: 3, ragged: 0.5, shadow: 0.65 }),
    blurb: 'Clean push from below on a transparent canvas — drops into any edit.',
  },
  {
    id: 'boiling', name: 'Boiling line', cat: 'Paper', kind: 'paper',
    anim: 'boil', aspect: '1:1', bg: '#fbf7ec', zoom: 0.8, loop: true, dur: 1.2,
    look: look({ edge: 4.4, ragged: 0.95, fibres: 1, grain: 0.6 }),
    blurb: 'The torn edge is re-cut every frame — hand-made stop-motion wobble.',
  },
  {
    id: 'breeze', name: 'Breeze', cat: 'Paper', kind: 'paper',
    anim: 'flutter', aspect: '9:16', bg: 'transparent', zoom: 0.82, loop: true, dur: 3.6,
    look: look({ edge: 3, ragged: 0.45, shadow: 0.5 }),
    blurb: 'A slow sway that never lands. Loops seamlessly as a GIF.',
  },
  {
    id: 'sticker', name: 'Sticker wobble', cat: 'Paper', kind: 'paper',
    anim: 'boil', aspect: '1:1', bg: 'transparent', zoom: 0.9, loop: true, dur: 1,
    look: look({ edge: 6, ragged: 0.5, layers: 2, tint: '#ffffff', shadow: 0.35, grain: 0.15 }),
    blurb: 'Thick white die-cut border on transparent — a chat sticker.',
  },
  {
    id: 'pin', name: 'Pinned cut-out', cat: 'Paper', kind: 'paper',
    anim: 'popin', aspect: '1:1', bg: 'transparent', zoom: 0.88, dur: 1.2,
    look: look({ edge: 5.4, ragged: 0.25, tint: '#ffffff', layers: 1, shadow: 0.7, inner: 0.15 }),
    blurb: 'Crisp die-cut sticker pop. Export as a transparent PNG or GIF.',
  },

  // ── Typography ──────────────────────────────────────────────────────────
  {
    id: 'ransom', name: 'Magazine Letters', cat: 'Typography', kind: 'fx',
    fx: 'ransom', aspect: '1:1', bg: '#efece1',
    opts: { text: 'CUT IT OUT', mixFonts: true, lineChars: 8, boil: 0.6 },
    blurb: 'Ransom-note text — every letter its own scrap, font and tilt.',
  },
  {
    id: 'ransom-loud', name: 'Loud clipping', cat: 'Typography', kind: 'fx',
    fx: 'ransom', aspect: '9:16', bg: '#16161c',
    opts: { text: 'READ THIS TWICE', mixFonts: true, lineChars: 6, tilt: 1.5, boil: 1 },
    blurb: 'Tall stack of clippings on black. Built for a vertical hook.',
  },
  {
    id: 'powboom', name: 'Pow Boom Typography', cat: 'Typography', kind: 'fx',
    fx: 'powboom', aspect: '1:1', bg: '#f7f4ec',
    opts: { text: 'POW\nBOOM\nSOLD', burst: '#ffe600', accent: '#e0442f' },
    blurb: 'Elastic comic-book lettering bursting one word at a time.',
  },
  {
    id: 'turing', name: 'Turing Pattern Typography', cat: 'Typography', kind: 'fx',
    fx: 'turing', aspect: '1:1', bg: '#f7f4ec',
    opts: { text: 'MAKE\nIDEAS', preset: 'coral', accent: '#e0442f', speed: 1.4 },
    blurb: 'Living reaction-diffusion patterns growing out of the letters.',
  },
  {
    id: 'turing-maze', name: 'Maze pattern', cat: 'Typography', kind: 'fx',
    fx: 'turing', aspect: '9:16', bg: '#101014',
    opts: { text: 'DEEP\nWORK', preset: 'maze', accent: '#5145cd', bg: '#101014', speed: 1 },
    blurb: 'The same simulation set to maze — slower, denser, on ink.',
  },
  {
    id: 'wordsphere', name: 'Word Sphere', cat: 'Typography', kind: 'fx',
    fx: 'wordsphere', aspect: '1:1', bg: '#f2f1ee',
    opts: { spin: 0.8, grid: 0.6 },
    blurb: 'Kinetic type orbiting a spherical grid, front word in focus.',
  },
  {
    id: 'textcube', name: 'Text Cube', cat: 'Typography', kind: 'fx',
    fx: 'textcube', aspect: '1:1', bg: '#fdfaf2',
    opts: { spin: 0.7, accent: '#e0442f' },
    blurb: 'Words sitting on the faces of a slowly rotating cube.',
  },
  {
    id: 'depthfocus', name: 'Depth Focus', cat: 'Typography', kind: 'fx',
    fx: 'depthfocus', aspect: '9:16', bg: '#f4f6f2',
    opts: { blur: 16, bokeh: 34 },
    blurb: 'A focus rack between the line in front and the doubts behind it.',
  },

  // ── Match cuts ──────────────────────────────────────────────────────────
  {
    id: 'matchcut', name: 'Match Cut', cat: 'Match cuts', kind: 'fx',
    fx: 'matchcut', aspect: '16:9', bg: '#faf7ef',
    opts: { text: 'MAKE IT\nMAKE IT POP\nPOPSHOT', style: 'ink', hold: 0.85, trans: 0.6 },
    blurb: 'Shared letters hold their place while the rest tear away.',
  },
  {
    id: 'matchcut-paper', name: 'Match cut, torn', cat: 'Match cuts', kind: 'fx',
    fx: 'matchcut', aspect: '1:1', bg: '#5145cd',
    opts: { text: 'PAPER\nPAPER CUT\nCUT\nCUT IT', style: 'ransom', hold: 0.75, trans: 0.55 },
    blurb: 'The same trick played on scraps instead of clean type.',
  },
  {
    id: 'commentmatch', name: 'Comment Match Cut', cat: 'Match cuts', kind: 'fx',
    fx: 'commentmatch', aspect: '9:16', bg: '#ffffff',
    opts: { text: 'this\nthis is\nthis is it', theme: 'light', rows: 4, ghost: 1 },
    blurb: 'A bold line match-cuts over a morphing stack of comment rows.',
  },
  {
    id: 'commentmatch-dark', name: 'Comments, dark', cat: 'Match cuts', kind: 'fx',
    fx: 'commentmatch', aspect: '9:16', bg: '#0f0f11',
    opts: { text: 'wait\nwait for it\nfor real', theme: 'dark', rows: 5, ghost: 1.4 },
    blurb: 'Night-mode thread, heavier ghosting, five rows deep.',
  },
  {
    id: 'reshuffle', name: 'Text Reshuffle', cat: 'Match cuts', kind: 'fx',
    fx: 'reshuffle', aspect: '16:9', bg: '#ffffff',
    opts: { text: "Start before you're ready\nYou're ready. Start.\nStart.", arc: 0.5 },
    blurb: 'Whole words fly to their new slot; only the new ones fade in.',
  },

  // ── Scenes ──────────────────────────────────────────────────────────────
  {
    id: 'typewriter', name: 'Typewriter', cat: 'Scenes', kind: 'fx',
    fx: 'typewriter', aspect: '4:5', bg: '#f6f2e6',
    opts: { text: "it's never been as easy\nto make them stop\nscrolling", cps: 13 },
    blurb: 'Types onto a sheet with real misalignment and ink variation.',
  },
  {
    id: 'magnifier', name: 'Magnifying Glass', cat: 'Scenes', kind: 'fx',
    fx: 'magnifier', aspect: '4:5', bg: '#efe8d6',
    opts: { zoom: 2.2, lens: 0.26, path: 'across' },
    blurb: 'A lens sweeps the page and blows up whatever sits under it.',
  },
  {
    id: 'countrymap', name: 'Country Map', cat: 'Scenes', kind: 'fx',
    fx: 'countrymap', aspect: '1:1', bg: '#efe6cf',
    opts: { country: 'Japan', label: 'JAPAN', pin: 'TOKYO' },
    blurb: 'An outline that draws itself onto old paper, compass and all.',
  },
  {
    id: 'texttrail', name: 'Text Trail', cat: 'Scenes', kind: 'fx',
    fx: 'texttrail', aspect: '4:5', bg: '#f3efe3',
    opts: { marks: 'lines, defy, limits', zoom: 2 },
    blurb: 'Circles key words and links them with arrows as the camera follows.',
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map(t => [t.id, t]));

// A procedural stand-in so the paper cards animate before anything is uploaded.
export function placeholderArt() {
  const W = 420, H = 520;
  const img = document.createElement('canvas');
  img.width = W; img.height = H;
  const c = img.getContext('2d');
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#6f63e8');
  g.addColorStop(0.55, '#5145cd');
  g.addColorStop(1, '#241f5e');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(255,230,0,.9)';
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? W * 0.16 : W * 0.34;
    c.lineTo(W / 2 + Math.cos(a) * r, H * 0.42 + Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  c.fillStyle = '#fff';
  c.font = '700 34px Inter, sans-serif';
  c.textAlign = 'center';
  c.fillText('sample', W / 2, H * 0.82);

  const mask = document.createElement('canvas');
  mask.width = W; mask.height = H;
  const m = mask.getContext('2d');
  m.fillStyle = '#fff';
  m.beginPath();
  m.ellipse(W / 2, H * 0.44, W * 0.42, H * 0.33, 0, 0, Math.PI * 2);
  m.fill();
  m.beginPath();
  m.roundRect(W * 0.12, H * 0.7, W * 0.76, H * 0.2, W * 0.09);
  m.fill();
  return { image: img, mask };
}
