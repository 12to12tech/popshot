// ---------------------------------------------------------------------------
// Popshot Paper — cut-outs
//
// Produces the alpha mask that the paper engine tears around. Three ways in:
//   subject  — MediaPipe selfie segmentation (people, on-device)
//   backdrop — region-grow from the frame border (flat or gradient backgrounds)
//   sheet    — keep the whole rectangle, i.e. a plain photo on card
// plus erode / feather / brush touch-ups. Masks are white RGB with the alpha
// channel carrying the cut, so `destination-in` composites them directly.
// ---------------------------------------------------------------------------

import { CONFIG } from './config.js';

export const MASK_LONG_SIDE = 900;

export function maskCanvasFor(image) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const k = Math.min(1, MASK_LONG_SIDE / Math.max(iw, ih));
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(iw * k));
  c.height = Math.max(2, Math.round(ih * k));
  return c;
}

function writeAlpha(canvas, alpha) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0, n = alpha.length; i < n; i++) {
    d[i * 4] = 255; d[i * 4 + 1] = 255; d[i * 4 + 2] = 255;
    d[i * 4 + 3] = alpha[i];
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ── whole sheet ───────────────────────────────────────────────────────────
export function sheetMask(image) {
  const c = maskCanvasFor(image);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

// ── subject (person) ──────────────────────────────────────────────────────
let segPromise = null;
async function getImageSegmenter() {
  if (!segPromise) {
    segPromise = (async () => {
      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
      const files = await vision.FilesetResolver.forVisionTasks(CONFIG.segmentation.wasmBase);
      return vision.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: CONFIG.segmentation.modelUrl, delegate: 'GPU' },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
      });
    })().catch((e) => { segPromise = null; throw e; });
  }
  return segPromise;
}

// Resolves { canvas, coverage }. Coverage lets the caller notice that the
// model found nothing person-shaped and fall back to another mode.
export async function subjectMask(image) {
  const seg = await getImageSegmenter();
  const c = maskCanvasFor(image);
  const src = document.createElement('canvas');
  src.width = c.width; src.height = c.height;
  src.getContext('2d').drawImage(image, 0, 0, c.width, c.height);

  const res = seg.segment(src);
  const m = res.confidenceMasks?.[0];
  if (!m) { res.close?.(); throw new Error('segmentation returned no mask'); }
  const f = m.getAsFloat32Array();
  const alpha = new Uint8ClampedArray(c.width * c.height);
  let sum = 0;
  for (let i = 0; i < alpha.length; i++) {
    const v = f[i];
    // steepen the confidence ramp so the edge is a cut, not a fade
    const a = v <= 0.35 ? 0 : v >= 0.65 ? 1 : (v - 0.35) / 0.3;
    alpha[i] = a * 255;
    sum += a;
  }
  m.close?.(); res.close?.();
  writeAlpha(c, alpha);
  return { canvas: c, coverage: sum / alpha.length };
}

// ── backdrop removal ──────────────────────────────────────────────────────
// Region-grows inward from the border. A pixel joins the background if it is
// close to the sampled border colour OR close to the neighbour it spread from,
// which follows soft studio gradients without leaking into the subject.
export function backdropMask(image, { tolerance = 0.14 } = {}) {
  const c = maskCanvasFor(image);
  const w = c.width, h = c.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  // sample the border, take the median channel values as the seed colour
  const rs = [], gs = [], bs = [];
  const sample = (x, y) => {
    const i = (y * w + x) * 4;
    rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]);
  };
  for (let x = 0; x < w; x += 2) { sample(x, 0); sample(x, h - 1); }
  for (let y = 0; y < h; y += 2) { sample(0, y); sample(w - 1, y); }
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  const seed = [med(rs), med(gs), med(bs)];

  const tolG = (tolerance * 441) ** 2;      // global, vs the seed colour
  const tolL = (tolerance * 0.5 * 441) ** 2; // local, vs the spreading neighbour
  const bg = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const dist2 = (i, r, g, b) => {
    const dr = px[i * 4] - r, dg = px[i * 4 + 1] - g, db = px[i * 4 + 2] - b;
    return dr * dr + dg * dg + db * db;
  };
  const push = (i) => {
    if (bg[i]) return;
    if (dist2(i, seed[0], seed[1], seed[2]) > tolG) return;
    bg[i] = 1; stack[sp++] = i;
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }

  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w, y = (i / w) | 0;
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const step = (j) => {
      if (bg[j]) return;
      if (dist2(j, r, g, b) > tolL && dist2(j, seed[0], seed[1], seed[2]) > tolG) return;
      bg[j] = 1; stack[sp++] = j;
    };
    if (x > 0) step(i - 1);
    if (x < w - 1) step(i + 1);
    if (y > 0) step(i - w);
    if (y < h - 1) step(i + w);
  }

  const alpha = new Uint8ClampedArray(w * h);
  let kept = 0;
  for (let i = 0; i < alpha.length; i++) { alpha[i] = bg[i] ? 0 : 255; kept += bg[i] ? 0 : 1; }
  writeAlpha(c, alpha);
  return { canvas: c, coverage: kept / alpha.length };
}

// ── refinement ────────────────────────────────────────────────────────────
// Erode pulls the cut inwards (kills the halo of background colour left on the
// subject's edge); feather softens it afterwards.
export function refineMask(mask, { erode = 0, feather = 0 } = {}) {
  const w = mask.width, h = mask.height;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  const r = Math.max(0, erode);
  if (r > 0.2) {
    // min-filter by drawing the mask offset around a ring with 'destination-in'
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.drawImage(mask, Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.drawImage(mask, 0, 0);
  }
  if (feather > 0.2) {
    const blurred = document.createElement('canvas');
    blurred.width = w; blurred.height = h;
    const bc = blurred.getContext('2d');
    bc.filter = `blur(${feather}px)`;
    bc.drawImage(out, 0, 0);
    return blurred;
  }
  return out;
}

export function invertMask(mask) {
  const w = mask.width, h = mask.height;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(mask, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = 255 - img.data[i + 3];
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export function cloneMask(mask) {
  const out = document.createElement('canvas');
  out.width = mask.width; out.height = mask.height;
  out.getContext('2d').drawImage(mask, 0, 0);
  return out;
}

// Soft round brush used by the touch-up tool. mode 'keep' paints the subject
// back in, 'cut' removes it.
export function paintMask(mask, x, y, radius, mode) {
  const ctx = mask.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = mode === 'cut' ? 'destination-out' : 'source-over';
  const g = ctx.createRadialGradient(x, y, radius * 0.45, x, y, radius);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
