// ---------------------------------------------------------------------------
// Popshot Paper — the paper-craft rendering engine
//
// Takes an image plus an alpha mask and turns it into a "sheet": the subject
// backed by a torn-edge paper card, with fibres, grain, layered cardstock and
// a drop shadow. The sheet is rendered once at art resolution; the animations
// below only ever transform that pre-built canvas, so preview stays at 60fps
// and export reuses the exact same code path at full size.
//
// Contours come from marching squares over the mask, so the deckle edge is a
// real polygon — it scales crisply from a 400px preview to a 1920px export.
// ---------------------------------------------------------------------------

export const ART_LONG_SIDE = 1400;   // sheet is built at this resolution
const TRACE_LONG_SIDE = 480;         // mask is traced at this (polygon, so cheap)

// ── seeded random ─────────────────────────────────────────────────────────
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Periodic noise over u ∈ [0,1) — integer harmonics so a traced loop closes
// seamlessly instead of showing a seam where it wraps.
function loopNoiseFn(seed, harmonics = [[2, 1], [5, 0.62], [11, 0.4], [23, 0.24],
                                        [47, 0.15], [89, 0.09], [151, 0.05]]) {
  const r = rng(seed);
  const terms = harmonics.map(([f, a]) => ({ f, a, p: r() * Math.PI * 2 }));
  // RMS, not sum-of-amplitudes: normalising by the sum would leave the result
  // hovering near zero and the tear would read as a clean die-cut.
  const norm = Math.sqrt(terms.reduce((s, t) => s + t.a * t.a, 0) / 2);
  return (u) => {
    let v = 0;
    for (const t of terms) v += t.a * Math.sin(t.f * u * Math.PI * 2 + t.p);
    return Math.max(-1.7, Math.min(1.7, v / norm));
  };
}

// ── marching squares ──────────────────────────────────────────────────────
// Per cell, emit directed midpoint segments with the interior on the left.
// Consistent winding means outer rings and holes wind opposite ways, so one
// nonzero-filled Path2D renders holes correctly and the normal
// (-ty, tx) always points out of the shape.
// sides: 0=N 1=E 2=S 3=W, matching pt() below
const MS = [
  [], [[2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[0, 1], [2, 3]], [[0, 2]], [[0, 3]],
  [[3, 0]], [[2, 0]], [[3, 0], [1, 2]], [[1, 0]], [[3, 1]], [[2, 1]], [[3, 2]], [],
];

function traceLoops(alpha, w, h, threshold = 128) {
  const inside = (x, y) => (x < 0 || y < 0 || x >= w || y >= h)
    ? 0 : (alpha[y * w + x] >= threshold ? 1 : 0);
  // midpoints, keyed on doubled coords so the hash is exact integer maths
  const pt = (x, y, side) => (
    side === 0 ? [2 * x + 1, 2 * y] :        // N
    side === 1 ? [2 * x + 2, 2 * y + 1] :    // E
    side === 2 ? [2 * x + 1, 2 * y + 2] :    // S
                 [2 * x, 2 * y + 1]          // W
  );
  const from = new Map();
  // pad by one cell so shapes that touch the image border still close
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      const idx = (inside(x, y) << 3) | (inside(x + 1, y) << 2)
                | (inside(x + 1, y + 1) << 1) | inside(x, y + 1);
      for (const [a, b] of MS[idx]) {
        const p = pt(x, y, a), q = pt(x, y, b);
        const key = p[0] * 100000 + p[1];
        if (!from.has(key)) from.set(key, []);
        from.get(key).push(q);
      }
    }
  }
  const loops = [];
  for (const startKey of Array.from(from.keys())) {
    while (from.get(startKey)?.length) {
      const loop = [];
      let key = startKey;
      for (let guard = 0; guard < 400000; guard++) {
        const outs = from.get(key);
        if (!outs || !outs.length) break;
        const q = outs.pop();
        loop.push({ x: q[0] / 2, y: q[1] / 2 });
        key = q[0] * 100000 + q[1];
        if (key === startKey) break;
      }
      if (loop.length > 8) loops.push(loop);
    }
  }
  return loops;
}

function polyArea(p) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    a += (p[j].x * p[i].y) - (p[i].x * p[j].y);
  }
  return a / 2;
}

// Uniform-arclength resample; the offset noise is indexed by normalised
// arclength, so even spacing keeps the tear frequency constant around the ring.
function resample(loop, step) {
  const out = [];
  let carry = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    let d = carry;
    while (d < len) {
      out.push({ x: a.x + (dx * d) / len, y: a.y + (dy * d) / len });
      d += step;
    }
    carry = d - len;
  }
  return out.length > 6 ? out : loop.slice();
}

function smoothLoop(loop, passes) {
  let p = loop;
  for (let n = 0; n < passes; n++) {
    const q = new Array(p.length);
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      q[i] = { x: a.x * 0.25 + b.x * 0.5 + c.x * 0.25, y: a.y * 0.25 + b.y * 0.5 + c.y * 0.25 };
    }
    p = q;
  }
  return p;
}

// Push each point along its outward normal by edge ± a torn wobble.
function deckle(loop, edge, ragged, noise) {
  const n = loop.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n], b = loop[i], c = loop[(i + 1) % n];
    let tx = c.x - a.x, ty = c.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;                       // interior is on the left
    const d = Math.max(edge * 0.18, edge * (1 + ragged * noise(i / n) * 1.15));
    out[i] = { x: b.x + nx * d, y: b.y + ny * d };
  }
  return out;
}

function pathFrom(loops, scale, ox, oy) {
  const p = new Path2D();
  for (const loop of loops) {
    p.moveTo(loop[0].x * scale + ox, loop[0].y * scale + oy);
    for (let i = 1; i < loop.length; i++) p.lineTo(loop[i].x * scale + ox, loop[i].y * scale + oy);
    p.closePath();
  }
  return p;
}

// ── paper grain ───────────────────────────────────────────────────────────
let grainPattern = null;
function getGrain(ctx) {
  if (grainPattern) return grainPattern;
  const t = document.createElement('canvas');
  t.width = t.height = 160;
  const tc = t.getContext('2d');
  const img = tc.createImageData(160, 160);
  const r = rng(20260903);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (r() - 0.5) * 130;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  tc.putImageData(img, 0, 0);
  // a few long fibres so the grain reads as pulp, not TV static
  tc.globalAlpha = 0.25;
  tc.strokeStyle = '#8a8375';
  for (let i = 0; i < 60; i++) {
    tc.beginPath();
    const x = r() * 160, y = r() * 160, a = r() * Math.PI;
    tc.moveTo(x, y);
    tc.lineTo(x + Math.cos(a) * (8 + r() * 26), y + Math.sin(a) * (8 + r() * 26));
    tc.lineWidth = 0.6 + r();
    tc.stroke();
  }
  grainPattern = ctx.createPattern(t, 'repeat');
  return grainPattern;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ── the sheet ─────────────────────────────────────────────────────────────
export const DEFAULT_LOOK = {
  edge: 3.4,          // deckle width, % of the art's short side
  ragged: 0.55,       // 0 = die-cut, 1 = hand-torn
  tint: '#fbf7ec',    // paper colour
  layers: 1,          // stacked cardstock behind the top sheet
  shadow: 0.5,
  grain: 0.4,
  fibres: 0.7,
  inner: 0.35,        // shading just inside the deckle edge
};

// { image, mask, look, seed } -> { canvas, pad, w, h, path, loops }
// `w`/`h` are the artwork box inside the canvas; the canvas is padded by `pad`
// on every side to hold the deckle plus the shadow.
export function buildSheet({ image, mask, look = DEFAULT_LOOK, seed = 1, maxSide = ART_LONG_SIDE }) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const k = Math.min(1, maxSide / Math.max(iw, ih));
  const W = Math.max(2, Math.round(iw * k));
  const H = Math.max(2, Math.round(ih * k));

  // 1 — trace the mask at low resolution; the result is a polygon, so the
  //     detail we lose here costs nothing once it is scaled back up.
  const tk = Math.min(1, Math.min(TRACE_LONG_SIDE, maxSide) / Math.max(mask.width, mask.height));
  const tw = Math.max(2, Math.round(mask.width * tk));
  const th = Math.max(2, Math.round(mask.height * tk));
  const tc = document.createElement('canvas');
  tc.width = tw; tc.height = th;
  const tcx = tc.getContext('2d', { willReadFrequently: true });
  tcx.drawImage(mask, 0, 0, tw, th);
  const alphaData = tcx.getImageData(0, 0, tw, th).data;
  const alpha = new Uint8ClampedArray(tw * th);
  for (let i = 0; i < alpha.length; i++) alpha[i] = alphaData[i * 4 + 3];

  const scale = W / tw;                       // trace coords -> art coords
  const edgePx = Math.max(1, (look.edge / 100) * Math.min(W, H));
  const shadowBlur = 26 * look.shadow + 6;
  const layerStep = edgePx * 0.55;
  const pad = Math.ceil(edgePx * 2.4 + shadowBlur + look.layers * layerStep + 10);

  const minArea = (tw * th) * 0.0012;
  const raw = traceLoops(alpha, tw, th)
    .filter(l => Math.abs(polyArea(l)) > minArea)
    .sort((a, b) => Math.abs(polyArea(b)) - Math.abs(polyArea(a)))
    .slice(0, 24);
  const loops = raw.length
    ? raw
    : [[{ x: 0, y: 0 }, { x: tw, y: 0 }, { x: tw, y: th }, { x: 0, y: th }]];

  // 2 — resample + smooth, then build one deckled ring per cardstock layer
  const step = Math.max(1, 3 / scale);
  const base = loops.map(l => smoothLoop(resample(l, step), 3));
  const noise = loopNoiseFn(seed * 7919 + 13);
  const rings = [];
  for (let l = 0; l < Math.max(1, look.layers); l++) {
    const n2 = loopNoiseFn(seed * 7919 + 13 + l * 601);
    rings.push(base.map(loop =>
      deckle(loop, (edgePx + l * layerStep) / scale, look.ragged, l === 0 ? noise : n2)));
  }

  const canvas = document.createElement('canvas');
  canvas.width = W + pad * 2;
  canvas.height = H + pad * 2;
  const ctx = canvas.getContext('2d');

  const paths = rings.map(r => pathFrom(r, scale, pad, pad));
  const topPath = paths[0];

  // 3 — cardstock behind the top sheet, darkest at the back
  for (let l = rings.length - 1; l >= 1; l--) {
    ctx.save();
    ctx.translate(l * edgePx * 0.12, l * edgePx * 0.16);
    ctx.fillStyle = shade(look.tint, -14 * l);
    ctx.shadowColor = `rgba(40,36,28,${0.22 * look.shadow})`;
    ctx.shadowBlur = shadowBlur * 0.6;
    ctx.shadowOffsetY = 4;
    ctx.fill(paths[l], 'nonzero');
    ctx.restore();
  }

  // 4 — the top sheet + its cast shadow
  ctx.save();
  ctx.shadowColor = `rgba(32,28,22,${0.42 * look.shadow})`;
  ctx.shadowBlur = shadowBlur;
  ctx.shadowOffsetY = shadowBlur * 0.35;
  ctx.fillStyle = look.tint;
  ctx.fill(topPath, 'nonzero');
  ctx.restore();

  // 5 — torn fibres feathering outwards from the deckle
  if (look.fibres > 0.02) {
    ctx.save();
    ctx.strokeStyle = look.tint;
    ctx.lineCap = 'round';
    const r = rng(seed * 104729 + 7);
    for (const ring of [rings[0]]) {
      for (const loop of ring) {
        const n = loop.length;
        for (let i = 0; i < n; i++) {
          if (r() > look.fibres * 0.55) continue;
          const a = loop[(i - 1 + n) % n], b = loop[i], c = loop[(i + 1) % n];
          let tx = c.x - a.x, ty = c.y - a.y;
          const tl = Math.hypot(tx, ty) || 1;
          const nx = (-ty / tl), ny = (tx / tl);
          const len = (0.6 + r() * 2.6) * (edgePx * 0.13);
          ctx.globalAlpha = 0.2 + r() * 0.55;
          ctx.lineWidth = (0.4 + r() * 0.9) * Math.max(1, edgePx * 0.05);
          ctx.beginPath();
          ctx.moveTo(b.x * scale + pad, b.y * scale + pad);
          ctx.lineTo((b.x + nx * len) * scale + pad, (b.y + ny * len) * scale + pad);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // 6 — grain and inner edge shading, both clipped to the sheet
  ctx.save();
  ctx.clip(topPath, 'nonzero');
  if (look.grain > 0.02) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = look.grain * 0.3;
    ctx.fillStyle = getGrain(ctx);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (look.inner > 0.02) {
    ctx.globalAlpha = look.inner * 0.5;
    ctx.strokeStyle = 'rgba(96,84,62,1)';
    ctx.lineWidth = edgePx * 0.5;
    ctx.filter = `blur(${Math.max(1, edgePx * 0.18)}px)`;
    ctx.stroke(topPath);
    ctx.filter = 'none';
  }
  ctx.restore();

  // 7 — the subject itself, cut out with the pixel mask so hair and fine
  //     detail survive (the polygon is only ever used for the paper)
  const cut = document.createElement('canvas');
  cut.width = W; cut.height = H;
  const cc = cut.getContext('2d');
  cc.imageSmoothingQuality = 'high';
  cc.drawImage(image, 0, 0, W, H);
  cc.globalCompositeOperation = 'destination-in';
  cc.drawImage(mask, 0, 0, W, H);
  ctx.save();
  ctx.shadowColor = `rgba(40,34,24,${0.3 * look.shadow})`;
  ctx.shadowBlur = edgePx * 0.5;
  ctx.shadowOffsetY = edgePx * 0.1;
  ctx.drawImage(cut, pad, pad);
  ctx.restore();

  return { canvas, pad, w: W, h: H, path: topPath, loops: rings[0], scale, edgePx };
}

// ── easing ────────────────────────────────────────────────────────────────
export const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => 1 + 2.3 * Math.pow(t - 1, 3) + 1.5 * Math.pow(t - 1, 2),
  elastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1
    : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const seg = (t, a, b) => clamp01((t - a) / (b - a || 1));
