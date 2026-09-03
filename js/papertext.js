// ---------------------------------------------------------------------------
// Popshot Paper — text
//
// Two tools that share a layout core:
//   Magazine letters — every glyph gets its own torn scrap, its own font and
//                      its own tilt, then they pop in one after another.
//   Match cut        — consecutive phrases where the letters they share stay
//                      put and slide into their new place, while the rest tear
//                      away and drop out. That fixed pivot is what sells it.
//
// Everything is laid out once at a reference size and then uniformly scaled to
// the frame, so the same layout is exact at 400px preview and 1920px export.
// ---------------------------------------------------------------------------

import { FONT_FAMILIES } from './presets.js';
import { rng, ease, seg } from './paperfx.js';

const REF = 100;   // reference glyph size; layouts are scaled from this

// Display faces only — the workhorse text fonts read as flat next to a scrap.
export const RANSOM_FONTS = [
  'Archivo Black', 'Anton', 'Alfa Slab One', 'Bodoni Moda', 'DM Serif Display',
  'Playfair Display', 'Bebas Neue', 'Titan One', 'Abril Fatface', 'Shrikhand',
  'Space Mono', 'Press Start 2P', 'Lilita One', 'Bangers', 'Gloock',
  'Instrument Serif', 'Libre Caslon Text', 'Oswald', 'Permanent Marker',
].filter(f => FONT_FAMILIES.some(g => g.split(':')[0] === f));

export const SCRAP_PALETTE = [
  { bg: '#fbf7ec', fg: '#16161c' },   // paper white
  { bg: '#f3ecd8', fg: '#1d1a12' },   // cream
  { bg: '#e6e2d6', fg: '#26241c' },   // newsprint
  { bg: '#ffe600', fg: '#16161c' },   // highlighter
  { bg: '#16161c', fg: '#fbf7ec' },   // inked
  { bg: '#5145cd', fg: '#ffffff' },   // brand
  { bg: '#e0442f', fg: '#fff8f0' },   // pillar-box
  { bg: '#f7c9d8', fg: '#3b1020' },   // magazine pink
];

// A torn rectangle centred on the origin.
function scrapPath(w, h, seed, ragged = 1) {
  const r = rng(seed);
  const p = new Path2D();
  const per = 5;                     // points per side
  const jx = w * 0.045 * ragged, jy = h * 0.06 * ragged;
  const pts = [];
  const side = (x0, y0, x1, y1) => {
    for (let i = 0; i < per; i++) {
      const u = i / per;
      pts.push({
        x: x0 + (x1 - x0) * u + (r() - 0.5) * jx,
        y: y0 + (y1 - y0) * u + (r() - 0.5) * jy,
      });
    }
  };
  side(-w / 2, -h / 2, w / 2, -h / 2);
  side(w / 2, -h / 2, w / 2, h / 2);
  side(w / 2, h / 2, -w / 2, h / 2);
  side(-w / 2, h / 2, -w / 2, -h / 2);
  p.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
  p.closePath();
  return p;
}

const fontStr = (family, size) => `700 ${size}px "${family}", Georgia, serif`;

// ── magazine letters ──────────────────────────────────────────────────────
// opts: { seed, lineChars, mixFonts, palette, ragged, tilt }
export function layoutRansom(mctx, text, opts = {}) {
  const {
    seed = 7, lineChars = 9, mixFonts = true, ragged = 1, tilt = 1,
    font = RANSOM_FONTS[0], upper = true,
  } = opts;
  const r = rng(seed);
  const src = upper ? text.toUpperCase() : text;
  const wrapAt = REF * lineChars * 0.72;

  const words = src.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = [];
  let lineW = 0;

  const measure = (ch, family, size) => {
    mctx.font = fontStr(family, size);
    return mctx.measureText(ch).width;
  };

  for (const word of words) {
    const glyphs = [];
    let wordW = 0;
    for (const ch of word) {
      const family = mixFonts ? RANSOM_FONTS[Math.floor(r() * RANSOM_FONTS.length)] : font;
      const size = REF * (0.86 + r() * 0.3);
      const tw = measure(ch, family, size);
      const padX = size * 0.16, padY = size * 0.13;
      const g = {
        ch, family, size,
        w: tw + padX * 2,
        h: size * 1.02 + padY * 2,
        rot: (r() - 0.5) * 0.28 * tilt,
        dy: (r() - 0.5) * size * 0.14,
        seed: Math.floor(r() * 1e6),
        ...SCRAP_PALETTE[Math.floor(r() * SCRAP_PALETTE.length)],
        ragged,
      };
      glyphs.push(g);
      wordW += g.w * 0.94;
    }
    const space = REF * 0.34;
    if (line.length && lineW + space + wordW > wrapAt) {
      lines.push({ glyphs: line, w: lineW });
      line = []; lineW = 0;
    }
    if (line.length) lineW += space;
    for (const g of glyphs) { g.lineOffset = lineW; line.push(g); lineW += g.w * 0.94; }
    lineW += glyphs.length ? glyphs[glyphs.length - 1].w * 0.06 : 0;
  }
  if (line.length) lines.push({ glyphs: line, w: lineW });

  const lineH = REF * 1.32;
  const blockW = Math.max(1, ...lines.map(l => l.w));
  const blockH = lines.length * lineH;

  const all = [];
  lines.forEach((l, li) => {
    let x = -l.w / 2;
    for (const g of l.glyphs) {
      g.x = x + g.w / 2;
      g.y = (li - (lines.length - 1) / 2) * lineH + g.dy;
      x += g.w * 0.94;
      all.push(g);
    }
  });
  return { glyphs: all, w: blockW, h: blockH, lines: lines.length };
}

function drawGlyph(ctx, g, { scrap = true, alpha = 1, extraRot = 0, scale = 1, ink = null }) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(g.x, g.y);
  ctx.rotate(g.rot + extraRot);
  ctx.scale(scale, scale);
  if (scrap) {
    ctx.save();
    ctx.shadowColor = 'rgba(30,26,18,.34)';
    ctx.shadowBlur = g.size * 0.14;
    ctx.shadowOffsetY = g.size * 0.05;
    ctx.fillStyle = g.bg;
    ctx.fill(scrapPath(g.w, g.h, g.seed, g.ragged));
    ctx.restore();
  }
  ctx.fillStyle = ink || (scrap ? g.fg : '#16161c');
  ctx.font = fontStr(g.family, g.size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(g.ch, 0, g.size * 0.04);
  ctx.restore();
}

// Scales a layout to sit inside the frame and returns the fitted transform.
function frameFit(layout, W, H, fill = 0.82) {
  const s = Math.min((W * fill) / layout.w, (H * fill) / layout.h);
  return { s, cx: W / 2, cy: H / 2 };
}

// t runs 0..1 across `dur`. opts: { stagger, boil, scrap }
export function drawRansomFrame(ctx, W, H, layout, t, opts = {}) {
  const { stagger = 0.035, scrap = true, boil = 0, fill = 0.82, seed = 3 } = opts;
  const f = frameFit(layout, W, H, fill);
  ctx.save();
  ctx.translate(f.cx, f.cy);
  ctx.scale(f.s, f.s);
  const n = layout.glyphs.length;
  const span = Math.min(0.72, stagger * n);
  layout.glyphs.forEach((g, i) => {
    const start = span * (i / Math.max(1, n - 1));
    const p = seg(t, start, start + 0.26);
    if (p <= 0) return;
    const e = ease.back(p);
    let extraRot = (1 - p) * 0.5 * (i % 2 ? 1 : -1);
    let sc = 0.35 + 0.65 * e;
    if (boil > 0 && p >= 1) {
      const step = Math.floor(t * 10);
      const r = rng(step * 7919 + g.seed + seed);
      extraRot += (r() - 0.5) * 0.05 * boil;
      sc *= 1 + (r() - 0.5) * 0.02 * boil;
    }
    drawGlyph(ctx, g, { scrap, alpha: Math.min(1, p * 2.5), extraRot, scale: sc });
  });
  ctx.restore();
}

// ── match cut ─────────────────────────────────────────────────────────────
// One centred line per phrase, glyphs measured in reference units.
function layoutPhrase(mctx, text, opts) {
  const { seed = 11, style = 'ink', font = 'Archivo Black', upper = true } = opts;
  const r = rng(seed);
  const src = upper ? text.toUpperCase() : text;
  const glyphs = [];
  let x = 0;
  for (const ch of src) {
    if (ch === ' ') { x += REF * 0.34; continue; }
    const family = style === 'ransom'
      ? RANSOM_FONTS[Math.floor(r() * RANSOM_FONTS.length)]
      : font;
    const size = style === 'ransom' ? REF * (0.9 + r() * 0.22) : REF;
    mctx.font = fontStr(family, size);
    const tw = mctx.measureText(ch).width;
    const padX = size * 0.14, padY = size * 0.12;
    const g = {
      ch, family, size,
      w: tw + padX * 2, h: size * 1.02 + padY * 2,
      rot: style === 'ransom' ? (r() - 0.5) * 0.22 : 0,
      dy: style === 'ransom' ? (r() - 0.5) * size * 0.1 : 0,
      seed: Math.floor(r() * 1e6),
      ...SCRAP_PALETTE[Math.floor(r() * SCRAP_PALETTE.length)],
      ragged: 1,
    };
    g.x = x + g.w / 2;
    glyphs.push(g);
    x += g.w * (style === 'ransom' ? 0.94 : 0.99);
  }
  const w = Math.max(1, x);
  for (const g of glyphs) { g.x -= w / 2; g.y = g.dy; }
  const h = Math.max(...glyphs.map(g => g.h), REF);
  return { glyphs, w, h };
}

// Longest common subsequence over characters — the matched pairs are the
// letters that hold their position through the cut.
function matchPairs(a, b) {
  const n = a.length, m = b.length;
  const dp = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * (m + 1) + j] = a[i].ch === b[j].ch
        ? dp[(i + 1) * (m + 1) + j + 1] + 1
        : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
    }
  }
  const pairs = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i].ch === b[j].ch) { pairs.push([i, j]); i++; j++; }
    else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) i++;
    else j++;
  }
  return pairs;
}

// Build once, then draw any t. opts: { style, hold, trans, font, seed }
export function buildMatchCut(mctx, phrases, opts = {}) {
  const list = phrases.map(p => p.trim()).filter(Boolean);
  const layouts = list.map((p, i) => layoutPhrase(mctx, p, { ...opts, seed: (opts.seed || 11) + i * 97 }));
  const links = [];
  for (let i = 0; i + 1 < layouts.length; i++) {
    links.push(matchPairs(layouts[i].glyphs, layouts[i + 1].glyphs));
  }
  const hold = opts.hold ?? 0.9;
  const trans = opts.trans ?? 0.55;
  return {
    layouts, links, hold, trans,
    w: Math.max(1, ...layouts.map(l => l.w)),
    h: Math.max(1, ...layouts.map(l => l.h)),
    dur: layouts.length * hold + Math.max(0, layouts.length - 1) * trans,
  };
}

export function drawMatchCutFrame(ctx, W, H, mc, t, opts = {}) {
  const { style = 'ink', fill = 0.84, ink = '#16161c' } = opts;
  const scrap = style === 'ransom';
  const f = frameFit({ w: mc.w, h: mc.h }, W, H, fill);
  const time = t * mc.dur;
  const unit = mc.hold + mc.trans;
  let idx = Math.min(mc.layouts.length - 1, Math.floor(time / unit));
  const local = time - idx * unit;
  const inTrans = local > mc.hold && idx < mc.layouts.length - 1;
  const u = inTrans ? ease.inOut(Math.min(1, (local - mc.hold) / mc.trans)) : 0;

  const A = mc.layouts[idx];
  const B = inTrans ? mc.layouts[idx + 1] : null;
  const pairs = inTrans ? mc.links[idx] : [];
  const aMatched = new Map(pairs.map(([i, j]) => [i, j]));
  const bMatched = new Set(pairs.map(([, j]) => j));

  ctx.save();
  ctx.translate(f.cx, f.cy);
  ctx.scale(f.s, f.s);

  // the first phrase types itself in so the clip does not start on a static hold
  const intro = idx === 0 ? seg(time, 0, mc.hold * 0.75) : 1;

  A.glyphs.forEach((g, i) => {
    const introP = idx === 0
      ? seg(intro, (i / Math.max(1, A.glyphs.length)) * 0.8, (i / Math.max(1, A.glyphs.length)) * 0.8 + 0.25)
      : 1;
    if (introP <= 0) return;
    if (!inTrans) {
      drawGlyph(ctx, g, { scrap, alpha: Math.min(1, introP * 2), scale: 0.4 + 0.6 * ease.back(introP), ink: scrap ? null : ink });
      return;
    }
    const j = aMatched.get(i);
    if (j != null) {
      const to = B.glyphs[j];
      const k = to.size / g.size;
      drawGlyph(ctx, {
        ...g,
        x: g.x + (to.x - g.x) * u,
        y: g.y + (to.y - g.y) * u,
        size: g.size + (to.size - g.size) * u,
        w: g.w + (to.w - g.w) * u,
        h: g.h + (to.h - g.h) * u,
        rot: g.rot + (to.rot - g.rot) * u,
        family: u > 0.5 ? to.family : g.family,
        bg: u > 0.5 ? to.bg : g.bg,
        fg: u > 0.5 ? to.fg : g.fg,
      }, { scrap, alpha: 1, scale: 1 + Math.sin(u * Math.PI) * 0.06 * (k > 1 ? 1 : -1), ink: scrap ? null : ink });
    } else {
      // torn away: falls, spins and fades in the first half of the cut
      const v = Math.min(1, u * 1.8);
      drawGlyph(ctx, { ...g, y: g.y + v * v * g.size * 1.6 }, {
        scrap, alpha: 1 - v, extraRot: v * 0.6 * (i % 2 ? 1 : -1), scale: 1 - v * 0.25,
        ink: scrap ? null : ink,
      });
    }
  });

  if (inTrans) {
    B.glyphs.forEach((g, j) => {
      if (bMatched.has(j)) return;
      const v = seg(u, 0.38, 1);
      if (v <= 0) return;
      drawGlyph(ctx, { ...g, y: g.y - (1 - v) * g.size * 0.7 }, {
        scrap, alpha: v, extraRot: (1 - v) * -0.35, scale: 0.7 + 0.3 * ease.back(v),
        ink: scrap ? null : ink,
      });
    });
  }
  ctx.restore();
}
