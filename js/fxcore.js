// ---------------------------------------------------------------------------
// Popshot Paper — shared effect helpers
//
// Everything the typography and scene effects reuse: paper grounds, text
// layout and fitting, partial-length polyline strokes (used by every "draws
// itself on" reveal), hand-drawn wobble, tiny 3D projection, halftone.
//
// Effects are pure functions of (t, options) so the preview, the template
// thumbnails and the exporters all render identical frames.
// ---------------------------------------------------------------------------

import { rng } from './paperfx.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, u) => a + (b - a) * u;
export const seg = (t, a, b) => clamp((t - a) / (b - a || 1), 0, 1);
export const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => 1 + 2.3 * Math.pow(t - 1, 3) + 1.5 * Math.pow(t - 1, 2),
  elastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1
    : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

export const font = (family, size, weight = 700, style = '') =>
  `${style} ${weight} ${size}px "${family}", Georgia, serif`.trim();

export function hexRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(hex, amt) {
  const [r, g, b] = hexRgb(hex);
  const f = (v) => clamp(Math.round(v + amt), 0, 255);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
export function rgba(hex, a) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ── grounds ───────────────────────────────────────────────────────────────
// Cached: the speckle must not re-randomise every frame or the page crawls
// and the "paper" flickers.
const groundCache = new Map();
export function paperGround(W, H, opts = {}) {
  const { tint = '#f2ead6', grain = 0.5, vignette = 0.35, seed = 1, lines = 0 } = opts;
  const key = [W, H, tint, grain, vignette, seed, lines].join('|');
  if (groundCache.has(key)) return groundCache.get(key);
  if (groundCache.size > 8) groundCache.clear();

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = tint;
  x.fillRect(0, 0, W, H);

  const r = rng(seed * 7717 + 3);
  // blotches first, then fibre specks — pulp reads as both scales at once
  x.globalAlpha = 0.05 * grain;
  for (let i = 0; i < 26; i++) {
    const g = x.createRadialGradient(r() * W, r() * H, 0, r() * W, r() * H, 40 + r() * W * 0.3);
    g.addColorStop(0, r() > 0.5 ? '#8a7d5e' : '#ffffff');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  x.globalAlpha = 0.09 * grain;
  for (let i = 0; i < (W * H) / 700; i++) {
    x.fillStyle = r() > 0.5 ? '#6b6252' : '#ffffff';
    x.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r());
  }
  if (lines > 0) {
    x.globalAlpha = 0.16 * lines;
    x.strokeStyle = '#7d8fa8';
    x.lineWidth = 1;
    for (let y = H * 0.12; y < H; y += Math.max(18, H / 26)) {
      x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke();
    }
  }
  if (vignette > 0) {
    x.globalAlpha = 1;
    const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32,
      W / 2, H / 2, Math.max(W, H) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(60,48,28,${0.4 * vignette})`);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  x.globalAlpha = 1;
  groundCache.set(key, c);
  return c;
}

// ── text layout ───────────────────────────────────────────────────────────
// Word-wrapped paragraph in reference units (size is whatever you pass).
export function layoutWords(mctx, text, opts = {}) {
  const { family = 'Inter', size = 40, weight = 700, maxW = 800, lineH = 1.32,
          align = 'center', style = '' } = opts;
  mctx.font = font(family, size, weight, style);
  const spaceW = mctx.measureText(' ').width;
  const src = text.replace(/\s+/g, ' ').trim();
  const lines = [];
  let line = [], lw = 0;
  for (const word of src.split(' ')) {
    if (!word) continue;
    const w = mctx.measureText(word).width;
    if (line.length && lw + spaceW + w > maxW) { lines.push({ words: line, w: lw }); line = []; lw = 0; }
    if (line.length) lw += spaceW;
    line.push({ text: word, w, x: lw });
    lw += w;
  }
  if (line.length) lines.push({ words: line, w: lw });

  const lh = size * lineH;
  const out = [];
  const blockW = Math.max(1, ...lines.map(l => l.w));
  lines.forEach((l, li) => {
    const off = align === 'center' ? -l.w / 2 : align === 'right' ? -l.w : 0;
    for (const w of l.words) {
      out.push({ ...w, x: w.x + off, y: (li - (lines.length - 1) / 2) * lh, size, family, weight, line: li });
    }
  });
  return { words: out, w: blockW, h: lines.length * lh, lines: lines.length, lineH: lh, size };
}

// Largest size at which `text` fits a box, found by measuring once and scaling.
export function fitBox(layout, W, H, fill = 0.84) {
  return Math.min((W * fill) / layout.w, (H * fill) / layout.h);
}

export function drawWords(ctx, layout, opts = {}) {
  const { color = '#16161c', alphaOf = null, transform = null } = opts;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const w of layout.words) {
    const a = alphaOf ? alphaOf(w) : 1;
    if (a <= 0.002) continue;
    ctx.save();
    if (transform) transform(ctx, w);
    ctx.globalAlpha = a;
    ctx.fillStyle = typeof color === 'function' ? color(w) : color;
    ctx.font = font(w.family, w.size, w.weight);
    ctx.fillText(w.text, w.x, w.y);
    ctx.restore();
  }
}

// ── polylines ─────────────────────────────────────────────────────────────
export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

// Strokes the first `p` of a polyline's arclength — the primitive behind every
// "draws itself on" reveal here.
export function strokePartial(ctx, pts, p) {
  if (pts.length < 2 || p <= 0) return null;
  const total = polyLength(pts);
  let want = total * clamp(p, 0, 1);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  let last = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (d >= want) {
      const u = d ? want / d : 0;
      last = { x: lerp(pts[i - 1].x, pts[i].x, u), y: lerp(pts[i - 1].y, pts[i].y, u) };
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
      return last;
    }
    want -= d;
    ctx.lineTo(pts[i].x, pts[i].y);
    last = pts[i];
  }
  ctx.stroke();
  return last;
}

// An ellipse that looks drawn by hand: slightly open, slightly out of round.
export function sketchEllipse(cx, cy, rx, ry, seed, wobble = 1, turns = 1.08) {
  const r = rng(seed);
  const rot = (r() - 0.5) * 0.3;
  const n = 84;
  const pts = [];
  const phase = r() * Math.PI * 2;
  for (let i = 0; i <= n * turns; i++) {
    const a = (i / n) * Math.PI * 2 + phase;
    const w = 1 + Math.sin(a * 3 + seed) * 0.035 * wobble + Math.sin(a * 7.3 + seed * 2) * 0.02 * wobble;
    const x = Math.cos(a) * rx * w, y = Math.sin(a) * ry * w;
    pts.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
  }
  return pts;
}

// Quadratic arc between two points with an arrowhead at the far end.
export function arrowPath(from, to, bend = 0.3) {
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
  const dx = to.x - from.x, dy = to.y - from.y;
  const cx = mx - dy * bend, cy = my + dx * bend;
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, v = 1 - u;
    pts.push({
      x: v * v * from.x + 2 * v * u * cx + u * u * to.x,
      y: v * v * from.y + 2 * v * u * cy + u * u * to.y,
    });
  }
  return pts;
}

export function arrowHead(ctx, at, dir, size) {
  const a = Math.atan2(dir.y, dir.x);
  ctx.beginPath();
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(at.x - Math.cos(a - 0.42) * size, at.y - Math.sin(a - 0.42) * size);
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(at.x - Math.cos(a + 0.42) * size, at.y - Math.sin(a + 0.42) * size);
  ctx.stroke();
}

// ── raster masks ──────────────────────────────────────────────────────────
// Alpha of rendered text on a small grid — the seed field for the Turing
// pattern and anything else that needs "where the letters are".
export function textMask(text, gw, gh, opts = {}) {
  const { family = 'Archivo Black', weight = 900, fill = 0.82, lineChars = 0 } = opts;
  const c = document.createElement('canvas');
  c.width = gw; c.height = gh;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#000';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const lines = lineChars ? wrapChars(text, lineChars) : text.split('\n');
  let size = gh / Math.max(1, lines.length) * 0.8;
  for (let i = 0; i < 30; i++) {
    x.font = font(family, size, weight);
    const w = Math.max(...lines.map(l => x.measureText(l).width));
    if (w <= gw * fill) break;
    size *= (gw * fill) / w;
  }
  x.font = font(family, size, weight);
  const lh = size * 1.08;
  lines.forEach((l, i) => x.fillText(l, gw / 2, gh / 2 + (i - (lines.length - 1) / 2) * lh));
  const d = x.getImageData(0, 0, gw, gh).data;
  const m = new Float32Array(gw * gh);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] / 255;
  return m;
}

export function wrapChars(text, n) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > n) { lines.push(line); line = w; }
    else line = line ? line + ' ' + w : w;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// ── 3D ────────────────────────────────────────────────────────────────────
export function rotate3(p, ax, ay) {
  let { x, y, z } = p;
  let c = Math.cos(ay), s = Math.sin(ay);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(ax); s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  return { x, y, z };
}

export function project(p, W, H, dist = 3.2, scale = 1) {
  const f = dist / (dist + p.z);
  return { x: W / 2 + p.x * f * scale, y: H / 2 + p.y * f * scale, f, z: p.z };
}

// ── decoration ────────────────────────────────────────────────────────────
export function halftone(ctx, W, H, opts = {}) {
  const { step = 9, color = 'rgba(20,20,26,.2)', radius = 0.3, angle = 0.4 } = opts;
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(W / 2, H / 2);
  ctx.rotate(angle);
  const R = Math.hypot(W, H);
  for (let y = -R / 2; y < R / 2; y += step) {
    for (let x = -R / 2; x < R / 2; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, step * radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function speedLines(ctx, W, H, { n = 40, color = 'rgba(20,20,26,.5)', inner = 0.34, seed = 3 } = {}) {
  const r = rng(seed);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const R = Math.hypot(W, H) / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.06;
    const r0 = R * (inner + r() * 0.1), r1 = R * (0.9 + r() * 0.2);
    ctx.lineWidth = 1 + r() * 3.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0);
    ctx.lineTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

// A jagged comic burst outline.
export function burstPath(cx, cy, rx, ry, spikes, seed, sharp = 0.42) {
  const r = rng(seed);
  const p = new Path2D();
  const n = spikes * 2;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const out = i % 2 === 0 ? 1 : 1 - sharp;
    const j = 1 + (r() - 0.5) * 0.16;
    const x = cx + Math.cos(a) * rx * out * j;
    const y = cy + Math.sin(a) * ry * out * j;
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

// Longest common subsequence pairs — shared by every "match cut" style effect,
// whether the items are characters or whole words.
export function lcsPairs(a, b, key = (v) => v) {
  const n = a.length, m = b.length;
  const dp = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * (m + 1) + j] = key(a[i]) === key(b[j])
        ? dp[(i + 1) * (m + 1) + j + 1] + 1
        : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
    }
  }
  const pairs = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) { pairs.push([i, j]); i++; j++; }
    else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) i++;
    else j++;
  }
  return pairs;
}

export { rng };
