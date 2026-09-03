// ---------------------------------------------------------------------------
// Popshot Paper — animations
//
// Every animation is a pure function of time: draw(ctx, W, H, art, t, opts)
// where `art` is a sheet from buildSheet() and t runs 0..1. Nothing here reads
// DOM state, so the preview loop and the exporter render identical frames.
//
// The target ctx is always transparent — backgrounds are composited by the
// caller — which lets the fold shading use 'source-atop' to tint only the
// panel it just drew and never the empty space around the paper.
// ---------------------------------------------------------------------------

import { ease, seg, rng } from './paperfx.js';

// Where the sheet sits inside a W×H frame.
export function fitArt(art, W, H, zoom = 0.86) {
  const aw = art.canvas.width, ah = art.canvas.height;
  const s = Math.min(W / aw, H / ah) * zoom;
  return { s, x: (W - aw * s) / 2, y: (H - ah * s) / 2, w: aw * s, h: ah * s };
}

function drawArt(ctx, art, box, { rot = 0, sx = 1, sy = 1, alpha = 1, dx = 0, dy = 0 } = {}) {
  const cx = box.x + box.w / 2 + dx, cy = box.y + box.h / 2 + dy;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(sx, sy);
  ctx.drawImage(art.canvas, -box.w / 2, -box.h / 2, box.w, box.h);
  ctx.restore();
}

// ── scratch canvases ──────────────────────────────────────────────────────
const scratch = [];
function getScratch(i, w, h) {
  if (!scratch[i]) scratch[i] = document.createElement('canvas');
  const c = scratch[i];
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  else c.getContext('2d').clearRect(0, 0, w, h);
  return c;
}

// ── the fold primitive ────────────────────────────────────────────────────
// Draws `src` into (dx,dy,w,h) split into n panels along one axis. Panel 0 is
// the anchor and stays flat; the rest swing open on their hinges with a
// stagger, so at p=0 you see a single folded panel and at p=1 the full sheet.
function unfold(ctx, src, { n, p, axis, dx, dy, w, h, crease = 0.5 }) {
  const horizontal = axis === 'x';
  const srcLen = horizontal ? src.width : src.height;
  const destLen = horizontal ? w : h;
  const panelSrc = srcLen / n;
  const panelDest = destLen / n;
  const stagger = 0.35 / Math.max(1, n - 1);
  const span = 1 + stagger * (n - 1);

  const widths = [];
  const angles = [];
  for (let j = 0; j < n; j++) {
    if (j === 0) { angles.push(0); widths.push(panelDest); continue; }
    const pj = Math.max(0, Math.min(1, p * span - (j - 1) * stagger));
    const th = (1 - ease.out(pj)) * (Math.PI / 2) * 0.985;
    angles.push(th);
    widths.push(panelDest * Math.cos(th));
  }
  const total = widths.reduce((a, b) => a + b, 0);
  let cur = (horizontal ? dx : dy) + (destLen - total) / 2;

  for (let j = 0; j < n; j++) {
    const len = widths[j];
    if (len < 0.6) { cur += len; continue; }
    if (horizontal) ctx.drawImage(src, j * panelSrc, 0, panelSrc, src.height, cur, dy, len, h);
    else ctx.drawImage(src, 0, j * panelSrc, src.width, panelSrc, dx, cur, w, len);

    // fold shading — alternate panels catch the light differently
    const lit = Math.sin(angles[j]);
    if (lit > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = lit * (j % 2 ? 0.5 : 0.24);
      ctx.fillStyle = j % 2 ? '#2a2419' : '#ffffff';
      if (horizontal) ctx.fillRect(cur, dy, len, h);
      else ctx.fillRect(dx, cur, w, len);
      ctx.restore();
    }
    cur += len;

    // crease line at each hinge, fading to a faint permanent fold mark
    if (j < n - 1 && crease > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = crease * (0.1 + 0.5 * Math.max(lit, Math.sin(angles[j + 1] || 0)));
      ctx.fillStyle = '#5b5140';
      if (horizontal) ctx.fillRect(cur - 1, dy, 2, h);
      else ctx.fillRect(dx, cur - 1, w, 2);
      ctx.restore();
    }
  }
}

// ── full-frame cover paper, for the rip reveal ────────────────────────────
const coverCache = new Map();
function getCover(W, H, tint, seed) {
  const key = `${W}x${H}:${tint}:${seed}`;
  if (coverCache.has(key)) return coverCache.get(key);
  if (coverCache.size > 6) coverCache.clear();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const cx = c.getContext('2d');
  cx.fillStyle = tint;
  cx.fillRect(0, 0, W, H);
  const r = rng(seed || 5);
  cx.globalAlpha = 0.07;
  for (let i = 0; i < Math.round((W * H) / 900); i++) {
    cx.fillStyle = r() > 0.5 ? '#6b6252' : '#ffffff';
    cx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
  cx.globalAlpha = 1;
  coverCache.set(key, c);
  return c;
}

// A ragged tear running top-to-bottom near x, as a list of points.
function tearLine(x, H, amp, seed) {
  const r = rng(seed);
  const pts = [];
  const steps = 26;
  let drift = 0;
  for (let i = 0; i <= steps; i++) {
    drift += (r() - 0.5) * amp * 0.5;
    drift *= 0.82;
    const jag = (r() - 0.5) * amp * 0.55;
    pts.push({ x: x + drift + jag, y: (i / steps) * H });
  }
  return pts;
}

// ── the animations ────────────────────────────────────────────────────────
export const ANIMS = [
  {
    id: 'foldout', name: 'Fold-out', group: 'Folds', dur: 2.4, loop: false,
    blurb: 'The sheet opens out of a folded strip, panel by panel.',
    draw(ctx, W, H, art, t, o) {
      const box = fitArt(art, W, H, o.zoom);
      const p = ease.inOut(seg(t, 0.08, 0.78));
      const drop = 1 - ease.out(seg(t, 0, 0.2));
      const settle = Math.sin(seg(t, 0.72, 1) * Math.PI * 2) * (1 - seg(t, 0.72, 1)) * 0.03;
      const src = getScratch(0, art.canvas.width, art.canvas.height);
      src.getContext('2d').drawImage(art.canvas, 0, 0);
      ctx.save();
      ctx.globalAlpha = Math.min(1, seg(t, 0, 0.12) * 1.2);
      ctx.translate(W / 2, H / 2 - drop * H * 0.06);
      ctx.rotate(settle);
      ctx.translate(-W / 2, -H / 2);
      unfold(ctx, src, { n: o.panels, p, axis: 'x', dx: box.x, dy: box.y, w: box.w, h: box.h, crease: o.crease });
      ctx.restore();
    },
  },
  {
    id: 'quarters', name: 'Quarter fold', group: 'Folds', dur: 3, loop: false,
    blurb: 'Folded in four — opens downward first, then sideways.',
    draw(ctx, W, H, art, t, o) {
      const box = fitArt(art, W, H, o.zoom);
      const aw = art.canvas.width, ah = art.canvas.height;
      // pass 1: vertical unfold into a scratch at art resolution
      const s1 = getScratch(1, aw, ah);
      const c1 = s1.getContext('2d');
      unfold(c1, art.canvas, {
        n: 2, p: ease.inOut(seg(t, 0.05, 0.45)), axis: 'y',
        dx: 0, dy: 0, w: aw, h: ah, crease: o.crease,
      });
      // pass 2: horizontal unfold of that result, straight to the target
      ctx.save();
      ctx.globalAlpha = Math.min(1, seg(t, 0, 0.1) * 1.4);
      unfold(ctx, s1, {
        n: 2, p: ease.inOut(seg(t, 0.42, 0.88)), axis: 'x',
        dx: box.x, dy: box.y, w: box.w, h: box.h, crease: o.crease,
      });
      ctx.restore();
    },
  },
  {
    id: 'concertina', name: 'Concertina', group: 'Folds', dur: 2.8, loop: false,
    blurb: 'A long accordion pull-out — more panels, slower stagger.',
    draw(ctx, W, H, art, t, o) {
      const box = fitArt(art, W, H, o.zoom);
      const src = getScratch(0, art.canvas.width, art.canvas.height);
      src.getContext('2d').drawImage(art.canvas, 0, 0);
      const p = ease.out(seg(t, 0.05, 0.9));
      ctx.save();
      ctx.globalAlpha = Math.min(1, seg(t, 0, 0.1) * 1.5);
      unfold(ctx, src, {
        n: Math.max(4, o.panels + 2), p, axis: 'x',
        dx: box.x, dy: box.y, w: box.w, h: box.h, crease: o.crease,
      });
      ctx.restore();
    },
  },
  {
    id: 'rip', name: 'Rip reveal', group: 'Reveals', dur: 2.2, loop: false,
    blurb: 'A covering sheet tears down the middle and pulls apart.',
    draw(ctx, W, H, art, t, o) {
      const box = fitArt(art, W, H, o.zoom);
      const p = ease.out(seg(t, 0.12, 0.95));
      drawArt(ctx, art, box, {
        alpha: 1,
        sx: 0.94 + 0.06 * ease.out(seg(t, 0.1, 0.6)),
        sy: 0.94 + 0.06 * ease.out(seg(t, 0.1, 0.6)),
      });
      if (p >= 1) return;
      const cover = getCover(W, H, o.tint, o.seed);
      const tear = tearLine(W / 2, H, W * 0.09, o.seed * 31 + 5);
      const shift = p * W * 0.72;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.beginPath();
        if (side < 0) {
          ctx.moveTo(-W, -H);
          ctx.lineTo(tear[0].x, -H);
          for (const q of tear) ctx.lineTo(q.x, q.y);
          ctx.lineTo(tear[tear.length - 1].x, H * 2);
          ctx.lineTo(-W, H * 2);
        } else {
          ctx.moveTo(W * 2, -H);
          ctx.lineTo(tear[0].x, -H);
          for (const q of tear) ctx.lineTo(q.x, q.y);
          ctx.lineTo(tear[tear.length - 1].x, H * 2);
          ctx.lineTo(W * 2, H * 2);
        }
        ctx.closePath();
        ctx.clip();
        ctx.translate(W / 2 + side * shift, H / 2);
        ctx.rotate(side * p * 0.14);
        ctx.globalAlpha = 1 - Math.max(0, p - 0.75) * 4;
        ctx.drawImage(cover, -W / 2, -H / 2);
        ctx.restore();
      }
    },
  },
  {
    id: 'popin', name: 'Cut-out pop', group: 'Entrances', dur: 1.5, loop: false,
    blurb: 'The cut-out lands with a squash and the shadow settles under it.',
    draw(ctx, W, H, art, t, o) {
      const box = fitArt(art, W, H, o.zoom);
      const e = ease.elastic(seg(t, 0, 0.75));
      const squash = 1 + Math.sin(seg(t, 0.28, 0.7) * Math.PI) * 0.09 * (1 - seg(t, 0.4, 1));
      drawArt(ctx, art, box, {
        alpha: Math.min(1, seg(t, 0, 0.14) * 2),
        sx: e * squash,
        sy: e / squash,
        rot: (1 - ease.out(seg(t, 0, 0.85))) * -0.16,
        dy: (1 - e) * H * 0.05,
      });
    },
  },
  {
    id: 'flip', name: 'Paper flip', group: 'Entrances', dur: 1.7, loop: false,
    blurb: 'Swings in edge-on and slaps flat against the frame.',
    draw(ctx, W, H, art, t, o) {
      const box = fitArt(art, W, H, o.zoom);
      const p = ease.out(seg(t, 0, 0.72));
      const wob = Math.sin(seg(t, 0.6, 1) * Math.PI * 3) * (1 - seg(t, 0.6, 1)) * 0.12;
      const th = (1 - p) * (Math.PI / 2) * 0.98 + wob * 0.4;
      drawArt(ctx, art, box, { sx: Math.max(0.001, Math.cos(th)), sy: 1, rot: wob * 0.08 });
      const lit = Math.abs(Math.sin(th));
      if (lit > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = lit * 0.45;
        ctx.fillStyle = '#241f16';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    },
  },
  {
    id: 'flutter', name: 'Flutter', group: 'Loops', dur: 3.2, loop: true,
    blurb: 'A slow paper sway — good as a looping sticker.',
    draw(ctx, W, H, art, t, o) {
      const box = fitArt(art, W, H, o.zoom);
      const a = t * Math.PI * 2;
      const strips = 16;
      const sh = box.h / strips;
      const srcSh = art.canvas.height / strips;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(Math.sin(a) * 0.035);
      ctx.translate(-W / 2, -H / 2);
      for (let i = 0; i < strips; i++) {
        const u = i / strips;
        const off = Math.sin(a + u * 3.4) * box.w * 0.022 * (0.35 + u);
        const sq = 1 + Math.cos(a + u * 3.4) * 0.012;
        ctx.drawImage(
          art.canvas, 0, i * srcSh, art.canvas.width, srcSh + 1,
          box.x + off, box.y + i * sh, box.w * sq, sh + 1,
        );
      }
      ctx.restore();
    },
  },
  {
    id: 'boil', name: 'Stop-motion boil', group: 'Loops', dur: 2, loop: true,
    blurb: 'The classic hand-cut wobble — the torn edge is redrawn every frame.',
    draw(ctx, W, H, art, t, o) {
      const box = fitArt(art, W, H, o.zoom);
      const steps = Math.max(4, Math.round(o.boilFps * (o.dur || 2)));
      const k = Math.floor(t * steps);
      const r = rng(k * 2654435761 + o.seed);
      const pool = (o.variants && o.variants.length) ? o.variants : [art];
      const frame = pool[k % pool.length];
      drawArt(ctx, frame, box, {
        dx: (r() - 0.5) * box.w * 0.012,
        dy: (r() - 0.5) * box.h * 0.012,
        rot: (r() - 0.5) * 0.018,
        sx: 1 + (r() - 0.5) * 0.008,
        sy: 1 + (r() - 0.5) * 0.008,
      });
    },
  },
  {
    id: 'stack', name: 'Layer stack', group: 'Entrances', dur: 2, loop: false,
    blurb: 'Three offset copies fly in and converge into one sheet.',
    draw(ctx, W, H, art, t, o) {
      const box = fitArt(art, W, H, o.zoom);
      for (let i = 2; i >= 0; i--) {
        const p = ease.out(seg(t, i * 0.1, 0.55 + i * 0.12));
        drawArt(ctx, art, box, {
          alpha: (i === 0 ? 1 : 0.5) * Math.min(1, seg(t, i * 0.08, i * 0.08 + 0.2) * 2),
          dx: (1 - p) * box.w * 0.5 * (i - 1) + (1 - p) * (i * 12),
          dy: (1 - p) * box.h * 0.22 * (i % 2 ? 1 : -1),
          rot: (1 - p) * 0.22 * (i - 1),
          sx: 0.9 + 0.1 * p,
          sy: 0.9 + 0.1 * p,
        });
      }
    },
  },
  {
    id: 'slide', name: 'Slide up', group: 'Entrances', dur: 1.4, loop: false,
    blurb: 'Simple, clean push from below with a soft overshoot.',
    draw(ctx, W, H, art, t, o) {
      const box = fitArt(art, W, H, o.zoom);
      const p = ease.back(seg(t, 0, 0.8));
      drawArt(ctx, art, box, {
        dy: (1 - p) * H * 0.6,
        alpha: Math.min(1, seg(t, 0, 0.2) * 2),
        rot: (1 - p) * 0.05,
      });
    },
  },
];

export const ANIM_BY_ID = Object.fromEntries(ANIMS.map(a => [a.id, a]));
