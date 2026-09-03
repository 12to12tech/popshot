// ---------------------------------------------------------------------------
// Popshot Paper — typography effects
//
// Pow Boom, Turing pattern, Word Sphere, Text Cube, Depth Focus.
// Each exports the effect contract described in js/effects.js: field schema,
// an optional cached build(), and draw(ctx, W, H, t, o, cache).
// ---------------------------------------------------------------------------

import {
  clamp, lerp, seg, ease, font, rgba, shade, rng,
  paperGround, textMask, wrapChars, rotate3, project,
  halftone, speedLines, burstPath,
} from './fxcore.js';

const words = (s) => s.split('\n').map(w => w.trim()).filter(Boolean);

// ── Pow Boom ──────────────────────────────────────────────────────────────
export const powboom = {
  id: 'powboom', name: 'Pow Boom Typography', cat: 'Typography',
  blurb: 'Elastic comic-book lettering, one burst per word.',
  dur: 3, loop: true,
  fields: [
    { k: 'text', type: 'textarea', label: 'Words (one per line)', def: 'POW\nBOOM\nSOLD' },
    { k: 'family', type: 'font', label: 'Font', def: 'Titan One' },
    { k: 'burst', type: 'color', label: 'Burst', def: '#ffe600' },
    { k: 'ink', type: 'color', label: 'Ink', def: '#16161c' },
    { k: 'accent', type: 'color', label: 'Letter fill', def: '#e0442f' },
    { k: 'spikes', type: 'range', label: 'Spikes', min: 6, max: 24, step: 1, def: 14 },
    { k: 'dots', type: 'check', label: 'Halftone dots', def: true },
    { k: 'lines', type: 'check', label: 'Speed lines', def: true },
  ],
  duration: (o) => Math.max(1, words(o.text).length) * 1,

  draw(ctx, W, H, t, o) {
    const list = words(o.text);
    if (!list.length) return;
    const per = 1 / list.length;
    const i = clamp(Math.floor(t / per), 0, list.length - 1);
    const u = (t - i * per) / per;
    const word = list[i];
    const R = Math.min(W, H);

    const pop = ease.elastic(seg(u, 0, 0.55));
    const out = 1 - seg(u, 0.86, 1);
    const wob = Math.sin(u * Math.PI * 6) * (1 - seg(u, 0, 0.7)) * 0.05;

    if (o.lines) {
      ctx.save();
      ctx.globalAlpha = 0.5 * pop * out;
      speedLines(ctx, W, H, { color: rgba(o.ink, 0.35), seed: i * 31 + 5, n: 46 });
      ctx.restore();
    }

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(wob + (1 - pop) * 0.3);
    ctx.scale(pop * out || 0.001, pop * out || 0.001);
    ctx.translate(-W / 2, -H / 2);

    // burst
    const path = burstPath(W / 2, H / 2, R * 0.42, R * 0.36, o.spikes, i * 977 + 11);
    ctx.fillStyle = o.burst;
    ctx.strokeStyle = o.ink;
    ctx.lineWidth = R * 0.014;
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.translate(R * 0.018, R * 0.022);
    ctx.fillStyle = rgba(o.ink, 0.9);
    ctx.fill(path);
    ctx.restore();
    ctx.fillStyle = o.burst;
    ctx.fill(path);
    ctx.stroke(path);

    if (o.dots) {
      ctx.save();
      ctx.clip(path);
      halftone(ctx, W, H, { step: R * 0.026, color: rgba(o.ink, 0.16), radius: 0.28, angle: 0.5 });
      ctx.restore();
    }

    // letters: fit to the burst, offset shadow, heavy outline
    let size = R * 0.3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let k = 0; k < 24; k++) {
      ctx.font = font(o.family, size, 900);
      if (ctx.measureText(word).width <= R * 0.6) break;
      size *= 0.93;
    }
    ctx.font = font(o.family, size, 900);
    const squash = 1 + Math.sin(seg(u, 0, 0.5) * Math.PI) * 0.12;
    ctx.translate(W / 2, H / 2);
    ctx.scale(squash, 1 / squash);
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.17;
    ctx.strokeStyle = o.ink;
    ctx.fillStyle = rgba(o.ink, 0.85);
    ctx.fillText(word, size * 0.07, size * 0.09);
    ctx.strokeText(word, 0, 0);
    ctx.fillStyle = o.accent;
    ctx.fillText(word, 0, 0);
    ctx.restore();
  },
};

// ── Turing pattern ────────────────────────────────────────────────────────
// Gray-Scott reaction-diffusion. The simulation is stateful, so step count is
// derived from t: scrubbing back resets and replays, which keeps preview,
// thumbnails and export identical for the same t.
const PRESETS = {
  coral:   { f: 0.0545, k: 0.062 },
  mitosis: { f: 0.0367, k: 0.0649 },
  maze:    { f: 0.029,  k: 0.057 },
  worms:   { f: 0.078,  k: 0.061 },
};

export const turing = {
  id: 'turing', name: 'Turing Pattern Typography', cat: 'Typography',
  blurb: 'Living reaction-diffusion patterns growing out of the letters.',
  dur: 6, loop: true,
  fields: [
    { k: 'text', type: 'textarea', label: 'Words', def: 'MAKE\nIDEAS' },
    { k: 'family', type: 'font', label: 'Font', def: 'Archivo Black' },
    { k: 'preset', type: 'select', label: 'Pattern', def: 'coral',
      options: [['coral', 'Coral'], ['mitosis', 'Mitosis'], ['maze', 'Maze'], ['worms', 'Worms']] },
    { k: 'accent', type: 'color', label: 'Pattern', def: '#e0442f' },
    { k: 'bg', type: 'color', label: 'Ground', def: '#f7f4ec' },
    { k: 'speed', type: 'range', label: 'Growth speed', min: 0.3, max: 3, step: 0.1, def: 1.2 },
    { k: 'knockout', type: 'check', label: 'Knock the text out', def: true },
  ],

  // `quality` is set by the caller, not the user: thumbnails run a coarser
  // grid so sixteen live cards do not each simulate a full-size field.
  key: (o) => [o.text, o.family, o.preset, o.speed, o.quality || 1].join('|'),
  build(o) {
    const gw = Math.max(64, Math.round(220 * (o.quality || 1)));
    const gh = gw;
    const n = gw * gh;
    const A = new Float32Array(n).fill(1);
    const B = new Float32Array(n);
    const mask = textMask(o.text, gw, gh, { family: o.family, lineChars: 0 });
    const r = rng(20260903);
    for (let i = 0; i < n; i++) {
      // seed heavily along the letters, lightly everywhere else, so the
      // pattern visibly grows out of the type
      if (mask[i] > 0.4 && r() > 0.35) B[i] = 1;
      else if (r() > 0.995) B[i] = 1;
    }
    return { gw, gh, A, B, mask, steps: 0, img: null, canvas: null };
  },

  draw(ctx, W, H, t, o, c) {
    const { gw, gh } = c;
    const { f, k } = PRESETS[o.preset] || PRESETS.coral;
    const target = Math.floor(t * 3200 * o.speed);
    if (target < c.steps) {                       // scrubbed backwards: replay
      const fresh = turing.build(o);
      c.A = fresh.A; c.B = fresh.B; c.steps = 0;
      c.A2 = null; c.B2 = null;
    }
    let todo = Math.min(target - c.steps, Math.round(260 * (o.quality || 1)));
    const { A, B } = c;
    const A2 = c.A2 || (c.A2 = new Float32Array(A.length));
    const B2 = c.B2 || (c.B2 = new Float32Array(B.length));
    while (todo-- > 0) {
      for (let y = 0; y < gh; y++) {
        const yp = ((y - 1 + gh) % gh) * gw, yn = ((y + 1) % gh) * gw, y0 = y * gw;
        for (let x = 0; x < gw; x++) {
          const xp = (x - 1 + gw) % gw, xn = (x + 1) % gw, i = y0 + x;
          const la = A[y0 + xp] + A[y0 + xn] + A[yp + x] + A[yn + x]
            + 0.25 * (A[yp + xp] + A[yp + xn] + A[yn + xp] + A[yn + xn]) - 5 * A[i];
          const lb = B[y0 + xp] + B[y0 + xn] + B[yp + x] + B[yn + x]
            + 0.25 * (B[yp + xp] + B[yp + xn] + B[yn + xp] + B[yn + xn]) - 5 * B[i];
          const ab = A[i] * B[i] * B[i];
          A2[i] = clamp(A[i] + (0.21 * la - ab + f * (1 - A[i])), 0, 1);
          B2[i] = clamp(B[i] + (0.105 * lb + ab - (k + f) * B[i]), 0, 1);
        }
      }
      A.set(A2); B.set(B2);
      c.steps++;
    }

    // paint the field into a small canvas and let the browser upscale it
    if (!c.canvas) {
      c.canvas = document.createElement('canvas');
      c.canvas.width = gw; c.canvas.height = gh;
      c.cctx = c.canvas.getContext('2d');
      c.img = c.cctx.createImageData(gw, gh);
    }
    const [ar, ag, ab_] = hex(o.accent);
    const [br, bg_, bb] = hex(o.bg);
    const d = c.img.data;
    for (let i = 0; i < B.length; i++) {
      const v = clamp((B[i] - 0.12) / 0.28, 0, 1);
      d[i * 4] = lerp(br, ar, v);
      d[i * 4 + 1] = lerp(bg_, ag, v);
      d[i * 4 + 2] = lerp(bb, ab_, v);
      d[i * 4 + 3] = 255;
    }
    c.cctx.putImageData(c.img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c.canvas, 0, 0, W, H);

    if (o.knockout) {
      const lines = o.text.split('\n').filter(Boolean);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let size = (H / Math.max(1, lines.length)) * 0.62;
      for (let i = 0; i < 30; i++) {
        ctx.font = font(o.family, size, 900);
        const w = Math.max(...lines.map(l => ctx.measureText(l).width));
        if (w <= W * 0.82) break;
        size *= 0.94;
      }
      ctx.font = font(o.family, size, 900);
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.11;
      ctx.strokeStyle = o.bg;
      ctx.fillStyle = o.bg;
      lines.forEach((l, i) => {
        const y = H / 2 + (i - (lines.length - 1) / 2) * size * 1.02;
        ctx.strokeText(l, W / 2, y);
        ctx.fillText(l, W / 2, y);
      });
      ctx.restore();
    }
  },
};
function hex(h) {
  const n = parseInt(String(h).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ── Word Sphere ───────────────────────────────────────────────────────────
export const wordsphere = {
  id: 'wordsphere', name: 'Word Sphere', cat: 'Typography',
  blurb: 'Kinetic type on a rotating spherical grid, front word in focus.',
  dur: 8, loop: true,
  fields: [
    { k: 'text', type: 'textarea', label: 'Words (one per line)',
      def: 'hit\nreach\nscale\nconvert\nrepeat\nfocus\nship\nlearn\ncompound\nshow up' },
    { k: 'family', type: 'font', label: 'Font', def: 'Archivo Black' },
    { k: 'bg', type: 'color', label: 'Ground', def: '#f2f1ee' },
    { k: 'ink', type: 'color', label: 'Ink', def: '#16161c' },
    { k: 'grid', type: 'range', label: 'Grid', min: 0, max: 1, step: 0.05, def: 0.5 },
    { k: 'spin', type: 'range', label: 'Spin', min: 0.2, max: 3, step: 0.1, def: 1 },
    { k: 'tilt', type: 'range', label: 'Tilt', min: -0.7, max: 0.7, step: 0.05, def: 0.22 },
  ],

  key: (o) => o.text,
  build(o) {
    const list = words(o.text);
    // fibonacci sphere — even coverage without clumping at the poles
    const pts = list.map((text, i) => {
      const y = 1 - (i / Math.max(1, list.length - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = i * Math.PI * (3 - Math.sqrt(5));
      return { text, x: Math.cos(th) * r, y, z: Math.sin(th) * r };
    });
    return { pts };
  },

  draw(ctx, W, H, t, o, c) {
    const R = Math.min(W, H);
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, W, H);
    // soft studio falloff so the sphere reads as a volume
    const g = ctx.createRadialGradient(W * 0.42, H * 0.36, R * 0.05, W / 2, H / 2, R * 0.78);
    g.addColorStop(0, rgba('#ffffff', 0.9));
    g.addColorStop(1, rgba(shade(o.bg, -34).replace('rgb(', '#').slice(0, 7) === '#' ? o.bg : o.bg, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const ay = t * Math.PI * 2 * o.spin, ax = o.tilt;
    const scale = R * 0.34;

    if (o.grid > 0.02) {
      ctx.strokeStyle = rgba(o.ink, 0.1 * o.grid + 0.02);
      ctx.lineWidth = Math.max(0.6, R * 0.0016);
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * Math.PI * 2;
          const la = (lat * Math.PI) / 180;
          const p = project(rotate3({
            x: Math.cos(la) * Math.cos(a), y: Math.sin(la), z: Math.cos(la) * Math.sin(a),
          }, ax, ay), W, H, 3.2, scale);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      for (let lon = 0; lon < 180; lon += 30) {
        ctx.beginPath();
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * Math.PI * 2;
          const lo = (lon * Math.PI) / 180;
          const p = project(rotate3({
            x: Math.cos(a) * Math.cos(lo), y: Math.sin(a), z: Math.cos(a) * Math.sin(lo),
          }, ax, ay), W, H, 3.2, scale);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }

    const drawn = c.pts.map(p => {
      const q = rotate3(p, ax, ay);
      return { ...p, ...project(q, W, H, 3.2, scale), depth: q.z };
    }).sort((a, b) => a.depth - b.depth);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of drawn) {
      const front = clamp((p.depth + 1) / 2, 0, 1);       // 1 = nearest
      const size = R * (0.028 + front * 0.11);
      ctx.globalAlpha = 0.14 + front * 0.86;
      ctx.fillStyle = o.ink;
      ctx.font = font(o.family, size, 800);
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  },
};

// ── Text Cube ─────────────────────────────────────────────────────────────
// Words live in the plane of each cube face, so they rotate and foreshorten
// with it instead of floating as flat billboards.
const FACES = [
  { o: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { o: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  { o: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { o: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { o: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { o: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
];

export const textcube = {
  id: 'textcube', name: 'Text Cube', cat: 'Typography',
  blurb: 'Words arranged on the faces of a slowly rotating cube.',
  dur: 10, loop: true,
  fields: [
    { k: 'text', type: 'textarea', label: 'Words (one per line)',
      def: 'create\nmagic\nsip\ncoffee\nmake\nship it\nagain\nslowly\nthen fast\nnotice\nbegin\nfinish' },
    { k: 'family', type: 'font', label: 'Font', def: 'Archivo Black' },
    { k: 'bg', type: 'color', label: 'Ground', def: '#fdfaf2' },
    { k: 'ink', type: 'color', label: 'Ink', def: '#16161c' },
    { k: 'accent', type: 'color', label: 'Accent', def: '#e0442f' },
    { k: 'spin', type: 'range', label: 'Spin', min: 0.2, max: 3, step: 0.1, def: 1 },
    { k: 'spread', type: 'range', label: 'Size', min: 0.5, max: 1.6, step: 0.05, def: 0.82 },
  ],

  key: (o) => o.text,
  build(o) {
    const list = words(o.text);
    const r = rng(4242);
    // deal the words round-robin onto the six faces, then stack each face's
    // share in rows — random placement puts words on top of each other
    const perFace = [[], [], [], [], [], []];
    list.forEach((text, i) => perFace[i % 6].push(text));
    const placed = [];
    perFace.forEach((ws, fi) => {
      const f = FACES[fi];
      ws.forEach((text, j) => {
        const v = ws.length === 1 ? 0 : (j / (ws.length - 1) - 0.5) * 1.25;
        placed.push({
          text, face: f,
          u: (r() - 0.5) * 0.55, v,
          size: 0.045 + r() * 0.05,
          accent: r() > 0.7,
        });
      });
    });
    return { placed };
  },

  draw(ctx, W, H, t, o, c) {
    const R = Math.min(W, H);
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, W, H);
    const ay = t * Math.PI * 2 * o.spin;
    const ax = Math.sin(t * Math.PI * 2) * 0.28 + 0.2;
    const scale = R * 0.3 * o.spread;
    const add = (a, b, s) => ({ x: a.x + b[0] * s, y: a.y + b[1] * s, z: a.z + b[2] * s });

    // wireframe first, behind the type
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      corners.push(project(rotate3({ x: sx, y: sy, z: sz }, ax, ay), W, H, 3.4, scale));
    }
    const EDGES = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
    ctx.save();
    ctx.strokeStyle = o.ink;
    ctx.lineWidth = Math.max(0.7, R * 0.0018);
    for (const [a, b] of EDGES) {
      ctx.globalAlpha = 0.05 + 0.09 * (1 - (corners[a].z + corners[b].z + 2) / 4);
      ctx.beginPath();
      ctx.moveTo(corners[a].x, corners[a].y);
      ctx.lineTo(corners[b].x, corners[b].y);
      ctx.stroke();
    }
    ctx.restore();

    const items = [];
    for (const p of c.placed) {
      const f = p.face;
      const base = { x: f.o[0], y: f.o[1], z: f.o[2] };
      const at = add(add(base, f.u, p.u), f.v, p.v);
      const q = rotate3(at, ax, ay);
      const n = rotate3({ x: f.o[0], y: f.o[1], z: f.o[2] }, ax, ay);
      // +z points away from the camera, so a face is visible when n.z < 0
      if (n.z > -0.04) continue;
      const pr = project(q, W, H, 3.4, scale);
      // in-plane axes, projected: gives the word its orientation on the face
      const pu = project(rotate3(add(at, f.u, 0.22), ax, ay), W, H, 3.4, scale);
      const pv = project(rotate3(add(at, f.v, 0.22), ax, ay), W, H, 3.4, scale);
      let ux = pu.x - pr.x, uy = pu.y - pr.y;
      const vx = pv.x - pr.x, vy = pv.y - pr.y;
      // A negative determinant makes fillText render mirrored. Flipping the
      // in-plane u axis restores it without moving the word off its face.
      if (ux * vy - uy * vx < 0) { ux = -ux; uy = -uy; }
      items.push({ p, pr, ux, uy, vx, vy, depth: q.z, facing: -n.z });
    }
    items.sort((a, b) => b.depth - a.depth);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const it of items) {
      const ul = Math.hypot(it.ux, it.uy) / (0.22 * scale);
      if (ul < 0.05) continue;
      ctx.save();
      ctx.setTransform(it.ux / 0.22 / scale, it.uy / 0.22 / scale,
                       it.vx / 0.22 / scale, it.vy / 0.22 / scale, it.pr.x, it.pr.y);
      ctx.globalAlpha = clamp(0.18 + it.facing * 1.1, 0, 1);
      ctx.fillStyle = it.p.accent ? o.accent : o.ink;
      ctx.font = font(o.family, R * it.p.size, 800);
      ctx.fillText(it.p.text, 0, 0);
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  },
};

// ── Depth Focus ───────────────────────────────────────────────────────────
export const depthfocus = {
  id: 'depthfocus', name: 'Depth Focus', cat: 'Typography',
  blurb: 'A focus rack between a foreground line and the words behind it.',
  dur: 5, loop: true,
  fields: [
    { k: 'front', type: 'textarea', label: 'Foreground line', def: 'You kept going' },
    { k: 'back', type: 'textarea', label: 'Background words',
      def: 'they said impossible\ntoo late\nno budget\nwrong timing\nnot ready' },
    { k: 'family', type: 'font', label: 'Font', def: 'Archivo Black' },
    { k: 'bg', type: 'color', label: 'Ground', def: '#f4f6f2' },
    { k: 'ink', type: 'color', label: 'Foreground', def: '#1d6b3f' },
    { k: 'backInk', type: 'color', label: 'Background', def: '#9aa79b' },
    { k: 'blur', type: 'range', label: 'Defocus', min: 2, max: 30, step: 1, def: 14 },
    { k: 'bokeh', type: 'range', label: 'Bokeh', min: 0, max: 60, step: 2, def: 26 },
  ],

  key: (o) => [o.back, o.bokeh].join('|'),
  build(o) {
    const r = rng(9091);
    const back = words(o.back).map((text) => ({
      text, x: 0.1 + r() * 0.8, y: 0.12 + r() * 0.76, s: 0.4 + r() * 0.7, rot: (r() - 0.5) * 0.16,
    }));
    const bokeh = Array.from({ length: Math.round(o.bokeh) }, () => ({
      x: r(), y: r(), r: 0.01 + r() * 0.05, a: 0.12 + r() * 0.4, depth: r(),
    }));
    return { back, bokeh };
  },

  draw(ctx, W, H, t, o, c) {
    const R = Math.min(W, H);
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, W, H);
    // rack: 0 = front sharp, 1 = back sharp, held at each end
    const rack = seg(t, 0.22, 0.48) - seg(t, 0.72, 0.98);
    const backBlur = o.blur * (1 - rack);
    const frontBlur = o.blur * rack;

    ctx.save();
    ctx.filter = `blur(${Math.max(0.01, backBlur * 0.6)}px)`;
    for (const b of c.bokeh) {
      ctx.globalAlpha = b.a * (0.35 + rack * 0.5);
      ctx.fillStyle = o.backInk;
      ctx.beginPath();
      ctx.arc(b.x * W, b.y * H, b.r * R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.filter = `blur(${Math.max(0.01, backBlur)}px)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = o.backInk;
    for (const b of c.back) {
      ctx.save();
      ctx.translate(b.x * W, b.y * H);
      ctx.rotate(b.rot);
      ctx.globalAlpha = 0.5 + rack * 0.5;
      ctx.font = font(o.family, R * 0.05 * b.s + R * 0.02, 700);
      ctx.fillText(b.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.filter = `blur(${Math.max(0.01, frontBlur)}px)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapChars(o.front, 16);
    let size = R * 0.14;
    for (let i = 0; i < 24; i++) {
      ctx.font = font(o.family, size, 900);
      if (Math.max(...lines.map(l => ctx.measureText(l).width)) <= W * 0.82) break;
      size *= 0.94;
    }
    ctx.font = font(o.family, size, 900);
    ctx.fillStyle = o.ink;
    const drift = (1 - rack) * 0 + Math.sin(t * Math.PI * 2) * R * 0.006;
    lines.forEach((l, i) => {
      ctx.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * size * 1.1 + drift);
    });
    ctx.restore();
    ctx.filter = 'none';
  },
};

export const TYPE_EFFECTS = [powboom, turing, wordsphere, textcube, depthfocus];
