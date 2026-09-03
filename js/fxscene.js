// ---------------------------------------------------------------------------
// Popshot Paper — scene effects
//
// Typewriter, Magnifying Glass, Country Map, Text Trail, Comment Match Cut,
// Text Reshuffle. Same contract as the typography effects.
//
// The map is the only one that reaches the network: it pulls a small country
// outline set from a CDN on first use and renders a placeholder until it
// arrives, so draw() stays synchronous like everything else.
// ---------------------------------------------------------------------------

import {
  clamp, lerp, seg, ease, font, rgba, shade, rng,
  paperGround, layoutWords, wrapChars, strokePartial, sketchEllipse,
  arrowPath, arrowHead, polyLength, lcsPairs,
} from './fxcore.js';

const lines = (s) => s.split('\n').map(w => w.trim()).filter(Boolean);

// ── Typewriter ────────────────────────────────────────────────────────────
export const typewriter = {
  id: 'typewriter', name: 'Typewriter', cat: 'Scenes',
  blurb: 'Types onto a sheet with the misalignment and ink variation of a real machine.',
  dur: 5, loop: false,
  fields: [
    { k: 'text', type: 'textarea', label: 'Text',
      def: "it's never been as easy\nto make them stop\nscrolling" },
    { k: 'family', type: 'font', label: 'Font', def: 'Space Mono' },
    { k: 'tint', type: 'color', label: 'Paper', def: '#f6f2e6' },
    { k: 'ink', type: 'color', label: 'Ink', def: '#2b2620' },
    { k: 'cps', type: 'range', label: 'Characters / sec', min: 4, max: 40, step: 1, def: 13 },
    { k: 'jitter', type: 'range', label: 'Misalignment', min: 0, max: 2, step: 0.1, def: 1 },
    { k: 'chars', type: 'range', label: 'Line width', min: 12, max: 46, step: 1, def: 24 },
    { k: 'shake', type: 'check', label: 'Key-strike shake', def: true },
  ],
  duration: (o) => o.text.replace(/\s+/g, ' ').length / o.cps + 1.1,

  key: (o) => [o.text, o.chars].join('|'),
  build(o) {
    const rows = [];
    for (const para of o.text.split('\n')) {
      if (!para.trim()) { rows.push(''); continue; }
      for (const l of wrapChars(para, o.chars)) rows.push(l);
    }
    const total = rows.reduce((s, r) => s + r.length, 0) + rows.length;
    return { rows, total };
  },

  draw(ctx, W, H, t, o, c) {
    const R = Math.min(W, H);
    ctx.drawImage(paperGround(W, H, { tint: o.tint, grain: 0.55, vignette: 0.3, seed: 12 }), 0, 0);

    const typed = Math.floor(t * (c.total + o.cps * 0.8) );
    const shown = clamp(Math.round(t * (this.duration(o)) * o.cps), 0, c.total);

    // a struck key nudges the whole sheet, then it settles
    let shakeX = 0, shakeY = 0;
    if (o.shake) {
      const phase = (t * this.duration(o) * o.cps) % 1;
      const k = Math.exp(-phase * 7);
      const r = rng(shown * 2654435761);
      shakeX = (r() - 0.5) * R * 0.004 * k;
      shakeY = (r() - 0.5) * R * 0.003 * k;
    }

    const size = Math.min(W * 0.82 / (o.chars * 0.62), H / (c.rows.length + 1.6) * 0.72);
    const lh = size * 1.75;
    const top = H / 2 - (c.rows.length - 1) * lh / 2;

    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(o.family, size, 700);
    const charW = ctx.measureText('M').width;

    let seen = 0;
    let caret = null;
    for (let li = 0; li < c.rows.length; li++) {
      const row = c.rows[li];
      const x0 = W / 2 - (row.length * charW) / 2;
      const y = top + li * lh;
      for (let ci = 0; ci < row.length; ci++) {
        if (seen >= shown) { caret = caret || { x: x0 + ci * charW, y }; break; }
        seen++;
        const ch = row[ci];
        if (ch === ' ') continue;
        const r = rng(li * 7919 + ci * 131 + 5);
        const jx = (r() - 0.5) * size * 0.09 * o.jitter;
        const jy = (r() - 0.5) * size * 0.13 * o.jitter;
        const rot = (r() - 0.5) * 0.06 * o.jitter;
        // ink density varies letter to letter — the ribbon is never even
        const ink = 0.62 + r() * 0.38;
        // the freshest character lands with a tiny overshoot
        const age = shown - seen;
        const land = age < 2 ? 1 + (2 - age) * 0.06 : 1;
        ctx.save();
        ctx.translate(x0 + ci * charW + charW / 2 + jx, y + jy);
        ctx.rotate(rot);
        ctx.scale(land, land);
        ctx.globalAlpha = ink;
        ctx.fillStyle = o.ink;
        ctx.textAlign = 'center';
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      }
      seen++;                                    // the carriage return
      if (caret) break;
    }
    if (!caret) {
      const row = c.rows[c.rows.length - 1] || '';
      caret = { x: W / 2 + (row.length * charW) / 2, y: top + (c.rows.length - 1) * lh };
    }
    if ((t * 6) % 1 < 0.55) {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = o.ink;
      ctx.fillRect(caret.x, caret.y - size * 0.52, charW * 0.9, size * 0.09);
    }
    ctx.restore();
  },
};

// ── Magnifying Glass ──────────────────────────────────────────────────────
export const magnifier = {
  id: 'magnifier', name: 'Magnifying Glass', cat: 'Scenes',
  blurb: 'A lens sweeps across a page and blows up whatever sits under it.',
  dur: 5, loop: true,
  fields: [
    { k: 'text', type: 'textarea', label: 'Text',
      def: 'Innovation begins with curiosity and grows through persistence' },
    { k: 'family', type: 'font', label: 'Font', def: 'Playfair Display' },
    { k: 'tint', type: 'color', label: 'Paper', def: '#efe8d6' },
    { k: 'ink', type: 'color', label: 'Ink', def: '#2a251c' },
    { k: 'zoom', type: 'range', label: 'Magnification', min: 1.2, max: 4, step: 0.1, def: 2.1 },
    { k: 'lens', type: 'range', label: 'Lens size', min: 0.12, max: 0.42, step: 0.01, def: 0.24 },
    { k: 'path', type: 'select', label: 'Sweep', def: 'across',
      options: [['across', 'Across'], ['diagonal', 'Diagonal'], ['orbit', 'Orbit']] },
    { k: 'handle', type: 'check', label: 'Show the handle', def: true },
  ],

  key: (o) => [o.text, o.family].join('|'),
  build(o, mctx) {
    return { layout: layoutWords(mctx, o.text, { family: o.family, size: 100, weight: 600, maxW: 620 }) };
  },

  draw(ctx, W, H, t, o, c) {
    const R = Math.min(W, H);
    const ground = paperGround(W, H, { tint: o.tint, grain: 0.6, vignette: 0.45, seed: 21 });

    // page rendered once per size, then sampled twice: flat, and again
    // magnified inside the lens
    const key = `${W}x${H}`;
    if (!c.page || c.pageKey !== key) {
      c.pageKey = key;
      c.page = document.createElement('canvas');
      c.page.width = W; c.page.height = H;
      const p = c.page.getContext('2d');
      p.drawImage(ground, 0, 0);
      const s = Math.min((W * 0.8) / c.layout.w, (H * 0.72) / c.layout.h);
      p.save();
      p.translate(W / 2, H / 2);
      p.scale(s, s);
      p.textAlign = 'left';
      p.textBaseline = 'middle';
      p.fillStyle = o.ink;
      for (const w of c.layout.words) {
        p.font = font(w.family, w.size, w.weight, 'italic');
        p.fillText(w.text, w.x, w.y);
      }
      p.restore();
    }
    ctx.drawImage(c.page, 0, 0);

    const u = t;
    let lx, ly;
    if (o.path === 'orbit') {
      lx = W / 2 + Math.cos(u * Math.PI * 2) * W * 0.26;
      ly = H / 2 + Math.sin(u * Math.PI * 2) * H * 0.2;
    } else if (o.path === 'diagonal') {
      const v = Math.abs(((u * 2) % 2) - 1);
      lx = lerp(W * 0.22, W * 0.78, v);
      ly = lerp(H * 0.74, H * 0.26, v);
    } else {
      const v = Math.abs(((u * 2) % 2) - 1);
      lx = lerp(W * 0.18, W * 0.82, v);
      ly = H / 2 + Math.sin(u * Math.PI * 4) * H * 0.05;
    }
    const rad = R * o.lens;

    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, ly, rad * 1.04, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30,26,18,.22)';
    ctx.filter = `blur(${rad * 0.12}px)`;
    ctx.translate(rad * 0.1, rad * 0.14);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, ly, rad, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(lx, ly);
    ctx.scale(o.zoom, o.zoom);
    ctx.translate(-lx, -ly);
    ctx.drawImage(c.page, 0, 0);
    ctx.restore();

    // glass: warm tint, a rim highlight, a swept specular
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, ly, rad, 0, Math.PI * 2);
    ctx.clip();
    const g = ctx.createLinearGradient(lx - rad, ly - rad, lx + rad, ly + rad);
    g.addColorStop(0, 'rgba(255,255,255,.34)');
    g.addColorStop(0.42, 'rgba(255,255,255,.05)');
    g.addColorStop(1, 'rgba(120,140,160,.16)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - rad, ly - rad, rad * 2, rad * 2);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(lx - rad * 0.34, ly - rad * 0.42, rad * 0.3, rad * 0.16, -0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (o.handle) {
      const a = Math.PI * 0.28;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#6b4a2a';
      ctx.lineWidth = rad * 0.17;
      ctx.beginPath();
      ctx.moveTo(lx + Math.cos(a) * rad * 1.02, ly + Math.sin(a) * rad * 1.02);
      ctx.lineTo(lx + Math.cos(a) * rad * 2.15, ly + Math.sin(a) * rad * 2.15);
      ctx.stroke();
      ctx.strokeStyle = '#8a6237';
      ctx.lineWidth = rad * 0.07;
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = '#3b3128';
    ctx.lineWidth = rad * 0.1;
    ctx.beginPath();
    ctx.arc(lx, ly, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = rad * 0.028;
    ctx.beginPath();
    ctx.arc(lx, ly, rad * 0.955, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },
};

// ── Country Map ───────────────────────────────────────────────────────────
let worldPromise = null;
export function loadWorld() {
  if (!worldPromise) {
    worldPromise = (async () => {
      const [topo, data] = await Promise.all([
        import('https://cdn.jsdelivr.net/npm/topojson-client@3/+esm'),
        fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r => r.json()),
      ]);
      const fc = topo.feature(data, data.objects.countries);
      const byName = new Map();
      for (const f of fc.features) {
        const name = f.properties?.name;
        if (name) byName.set(name, f);
      }
      return { byName, names: [...byName.keys()].sort() };
    })().catch((e) => { worldPromise = null; throw e; });
  }
  return worldPromise;
}

function ringsOf(feature) {
  const g = feature.geometry;
  if (!g) return [];
  if (g.type === 'Polygon') return g.coordinates;
  if (g.type === 'MultiPolygon') return g.coordinates.flat();
  return [];
}

export const countrymap = {
  id: 'countrymap', name: 'Country Map', cat: 'Scenes',
  blurb: 'An outline that draws itself onto old paper, with a compass and a pin.',
  dur: 5, loop: false,
  fields: [
    { k: 'country', type: 'country', label: 'Country', def: 'Japan' },
    { k: 'label', type: 'text', label: 'Label', def: 'JAPAN' },
    { k: 'pin', type: 'text', label: 'Pin (optional)', def: 'TOKYO' },
    { k: 'tint', type: 'color', label: 'Paper', def: '#efe6cf' },
    { k: 'ink', type: 'color', label: 'Ink', def: '#4a3c22' },
    { k: 'accent', type: 'color', label: 'Land', def: '#e0a049' },
    { k: 'wobble', type: 'range', label: 'Hand-drawn', min: 0, max: 2.5, step: 0.1, def: 1 },
    { k: 'compass', type: 'check', label: 'Compass rose', def: true },
    { k: 'grid', type: 'check', label: 'Grid lines', def: true },
  ],

  key: (o) => [o.country, o.wobble].join('|'),
  build(o) {
    const state = { ready: false, error: null, rings: null, name: o.country };
    loadWorld().then((w) => {
      const f = w.byName.get(o.country) || w.byName.get('Japan');
      state.rings = ringsOf(f);
      state.ready = true;
    }).catch((e) => { state.error = e.message; });
    return state;
  },

  draw(ctx, W, H, t, o, c) {
    const R = Math.min(W, H);
    ctx.drawImage(paperGround(W, H, { tint: o.tint, grain: 0.7, vignette: 0.5, seed: 31 }), 0, 0);

    if (o.grid) {
      ctx.save();
      ctx.strokeStyle = rgba(o.ink, 0.12);
      ctx.lineWidth = Math.max(0.6, R * 0.0014);
      const step = R / 12;
      for (let x = step; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = step; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.restore();
    }
    // double rule frame
    ctx.save();
    ctx.strokeStyle = rgba(o.ink, 0.55);
    ctx.lineWidth = Math.max(1.5, R * 0.006);
    ctx.strokeRect(R * 0.045, R * 0.045, W - R * 0.09, H - R * 0.09);
    ctx.lineWidth = Math.max(0.8, R * 0.002);
    ctx.strokeRect(R * 0.062, R * 0.062, W - R * 0.124, H - R * 0.124);
    ctx.restore();

    if (!c.ready) {
      ctx.fillStyle = rgba(o.ink, 0.6);
      ctx.font = font('Space Mono', R * 0.035, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.error ? 'Map data unavailable' : 'Loading map data…', W / 2, H / 2);
      return;
    }

    // project: equirectangular, x compressed by cos(mid-latitude)
    let minL = 180, maxL = -180, minB = 90, maxB = -90;
    for (const ring of c.rings) for (const [lon, lat] of ring) {
      if (lon < minL) minL = lon; if (lon > maxL) maxL = lon;
      if (lat < minB) minB = lat; if (lat > maxB) maxB = lat;
    }
    const kx = Math.cos(((minB + maxB) / 2) * Math.PI / 180);
    const bw = (maxL - minL) * kx || 1, bh = (maxB - minB) || 1;
    const s = Math.min((W * 0.62) / bw, (H * 0.62) / bh);
    const ox = W / 2 - ((minL + maxL) / 2) * kx * s;
    const oy = H * 0.52 + ((minB + maxB) / 2) * s;
    const rw = rng(7331);
    const paths = c.rings.map((ring, ri) => ring.map(([lon, lat], i) => {
      const wob = o.wobble * R * 0.002;
      return {
        x: lon * kx * s + ox + (rw() - 0.5) * wob,
        y: -lat * s + oy + (rw() - 0.5) * wob,
      };
    }));
    // biggest landmass first, so the reveal starts on the part that reads
    paths.sort((a, b) => polyLength(b) - polyLength(a));

    const totalLen = paths.reduce((s2, p) => s2 + polyLength(p), 0);
    const drawP = ease.inOut(seg(t, 0.05, 0.62));
    const fillP = ease.out(seg(t, 0.5, 0.8));

    if (fillP > 0) {
      ctx.save();
      ctx.globalAlpha = fillP * 0.85;
      ctx.fillStyle = o.accent;
      ctx.beginPath();
      for (const p of paths) {
        ctx.moveTo(p[0].x, p[0].y);
        for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
        ctx.closePath();
      }
      ctx.fill('evenodd');
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = o.ink;
    ctx.lineWidth = Math.max(1.4, R * 0.005);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    let used = totalLen * drawP;
    for (const p of paths) {
      const L = polyLength(p);
      if (used <= 0) break;
      strokePartial(ctx, p, Math.min(1, used / L));
      used -= L;
    }
    ctx.restore();

    if (o.pin && t > 0.72) {
      const a = seg(t, 0.72, 0.86);
      const px = ox + ((minL + maxL) / 2 + (maxL - minL) * 0.12) * kx * s;
      const py = oy - ((minB + maxB) / 2 + (maxB - minB) * 0.02) * s;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.arc(px, py, R * 0.011 * ease.back(a), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = o.ink;
      ctx.font = font('Space Mono', R * 0.028, 700);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.pin, px + R * 0.022, py);
      ctx.restore();
    }

    if (o.label) {
      const a = ease.out(seg(t, 0.62, 0.82));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = o.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font('Bodoni Moda', R * 0.085 * (0.9 + a * 0.1), 700);
      ctx.fillText(o.label, W / 2, H * 0.16);
      ctx.restore();
    }

    if (o.compass) {
      const a = ease.out(seg(t, 0.78, 0.98));
      const cx = W - R * 0.16, cy = H - R * 0.16, cr = R * 0.075;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(cx, cy);
      ctx.rotate((1 - a) * -1.2);
      ctx.strokeStyle = o.ink;
      ctx.fillStyle = o.ink;
      ctx.lineWidth = Math.max(1, R * 0.003);
      ctx.beginPath(); ctx.arc(0, 0, cr, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, cr * 0.78, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * cr * 0.9, Math.sin(ang) * cr * 0.9);
        ctx.lineTo(Math.cos(ang + 0.35) * cr * 0.22, Math.sin(ang + 0.35) * cr * 0.22);
        ctx.lineTo(Math.cos(ang - 0.35) * cr * 0.22, Math.sin(ang - 0.35) * cr * 0.22);
        ctx.closePath();
        ctx.globalAlpha = a * (i === 0 ? 1 : 0.45);
        ctx.fill();
      }
      ctx.globalAlpha = a;
      ctx.font = font('Space Mono', cr * 0.42, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', 0, -cr * 1.28);
      ctx.restore();
    }
  },
};

// ── Text Trail ────────────────────────────────────────────────────────────
export const texttrail = {
  id: 'texttrail', name: 'Text Trail', cat: 'Scenes',
  blurb: 'Circles key words and links them with arrows while the camera follows.',
  dur: 6, loop: false,
  fields: [
    { k: 'text', type: 'textarea', label: 'Paragraph',
      def: 'Creativity involves thinking outside the lines, breaking down old problems and daring to defy the norms everyone else accepts. What is possible sits just beyond the limits we agreed to.' },
    { k: 'marks', type: 'text', label: 'Words to circle (comma separated)', def: 'lines, defy, limits' },
    { k: 'family', type: 'font', label: 'Font', def: 'Instrument Serif' },
    { k: 'tint', type: 'color', label: 'Paper', def: '#f3efe3' },
    { k: 'ink', type: 'color', label: 'Ink', def: '#2c261c' },
    { k: 'pen', type: 'color', label: 'Pen', def: '#16161c' },
    { k: 'zoom', type: 'range', label: 'Camera zoom', min: 1, max: 3.4, step: 0.1, def: 1.9 },
  ],

  key: (o) => [o.text, o.marks, o.family].join('|'),
  build(o, mctx) {
    const layout = layoutWords(mctx, o.text, { family: o.family, size: 40, weight: 400, maxW: 470 });
    const wanted = o.marks.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const targets = [];
    for (const want of wanted) {
      const hit = layout.words.find(w =>
        w.text.toLowerCase().replace(/[^a-z0-9']/g, '') === want && !targets.includes(w));
      if (hit) targets.push(hit);
    }
    return { layout, targets };
  },

  draw(ctx, W, H, t, o, c) {
    const R = Math.min(W, H);
    ctx.drawImage(paperGround(W, H, { tint: o.tint, grain: 0.5, vignette: 0.35, seed: 44 }), 0, 0);
    const L = c.layout;
    const base = Math.min((W * 0.86) / L.w, (H * 0.86) / L.h);
    const n = Math.max(1, c.targets.length);
    const per = 1 / n;
    const idx = clamp(Math.floor(t / per), 0, n - 1);
    const u = (t - idx * per) / per;

    // camera: eases from one circled word to the next, zoomed in
    const cur = c.targets[idx];
    const prev = c.targets[Math.max(0, idx - 1)];
    const move = ease.inOut(seg(u, 0, 0.42));
    const zoom = base * (1 + (o.zoom - 1) * (idx === 0 ? ease.out(seg(t, 0, per * 0.5)) : 1));
    const fx = cur ? lerp(prev.x + prev.w / 2, cur.x + cur.w / 2, idx === 0 ? 1 : move) : 0;
    const fy = cur ? lerp(prev.y, cur.y, idx === 0 ? 1 : move) : 0;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-fx, -fy);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const w of L.words) {
      const isTarget = c.targets.includes(w);
      ctx.globalAlpha = isTarget ? 1 : 0.72;
      ctx.fillStyle = o.ink;
      ctx.font = font(w.family, w.size, isTarget ? 700 : 400);
      ctx.fillText(w.text, w.x, w.y);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = o.pen;
    ctx.lineWidth = Math.max(1.2, 2.6 / 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let k = 0; k <= idx; k++) {
      const w = c.targets[k];
      if (!w) continue;
      const p = k < idx ? 1 : ease.out(seg(u, 0.34, 0.78));
      if (p <= 0) continue;
      const ring = sketchEllipse(w.x + w.w / 2, w.y, w.w * 0.72, w.size * 0.68, k * 313 + 7, 1);
      strokePartial(ctx, ring, p);

      if (k < idx || (k === idx && u > 0.8)) {
        const next = c.targets[k + 1];
        if (next) {
          const ap = k < idx ? 1 : ease.out(seg(u, 0.8, 1));
          const from = { x: w.x + w.w / 2, y: w.y + w.size * 0.8 };
          const to = { x: next.x + next.w / 2, y: next.y - next.size * 0.8 };
          const arc = arrowPath(from, to, 0.26);
          const tip = strokePartial(ctx, arc, ap);
          if (ap > 0.94 && tip) {
            const prevPt = arc[Math.max(0, arc.length - 3)];
            arrowHead(ctx, tip, { x: tip.x - prevPt.x, y: tip.y - prevPt.y }, w.size * 0.42);
          }
        }
      }
    }
    ctx.restore();
  },
};

// ── Comment Match Cut ─────────────────────────────────────────────────────
// The comment rows are generated, not scraped: handles are assembled from a
// syllable pool and avatars are drawn procedurally, so nothing here depicts a
// real account.
const SYL = ['pixel', 'north', 'quiet', 'ember', 'atlas', 'ghost', 'nova', 'ridge', 'lunar',
             'drift', 'sable', 'onyx', 'harbor', 'vale', 'crane', 'orbit', 'flint', 'moss'];
const TAIL = ['', '_', '.', '99', '_hq', 'xo', '21', 'tv', '_ig', '007'];
const SNIPPET = ['this hit different', 'needed to hear this today', 'saving this one',
                 'who else is here in 2026', 'the algorithm knew', 'this is the one',
                 'okay that last line', 'sending this to my group chat', 'no because actually',
                 'first time this made sense'];

export const commentmatch = {
  id: 'commentmatch', name: 'Comment Match Cut', cat: 'Match cuts',
  blurb: 'A bold line match-cuts over a morphing stack of comment rows.',
  dur: 0, loop: false,
  fields: [
    { k: 'text', type: 'textarea', label: 'Phrases (one per line)', def: 'this\nthis is\nthis is it' },
    { k: 'family', type: 'font', label: 'Font', def: 'Archivo Black' },
    { k: 'theme', type: 'select', label: 'Theme', def: 'light',
      options: [['light', 'Light'], ['dark', 'Dark']] },
    { k: 'accent', type: 'color', label: 'Links', def: '#3068c8' },
    { k: 'rows', type: 'range', label: 'Comment rows', min: 2, max: 7, step: 1, def: 4 },
    { k: 'ghost', type: 'range', label: 'Ghosting', min: 0, max: 2, step: 0.1, def: 1 },
    { k: 'hold', type: 'range', label: 'Hold', min: 0.3, max: 2.5, step: 0.05, def: 0.8 },
    { k: 'trans', type: 'range', label: 'Cut length', min: 0.2, max: 1.6, step: 0.05, def: 0.5 },
  ],
  duration: (o) => {
    const n = Math.max(1, lines(o.text).length);
    return n * o.hold + (n - 1) * o.trans;
  },

  key: (o) => [o.text, o.rows].join('|'),
  build(o) {
    const r = rng(5150);
    const phrases = lines(o.text);
    // one comment set per phrase; consecutive sets morph into each other
    const sets = phrases.map(() => Array.from({ length: 7 }, () => ({
      handle: '@' + SYL[Math.floor(r() * SYL.length)] + SYL[Math.floor(r() * SYL.length)]
              + TAIL[Math.floor(r() * TAIL.length)],
      body: SNIPPET[Math.floor(r() * SNIPPET.length)],
      likes: Math.floor(r() * 900) + 12,
      replies: Math.floor(r() * 40),
      age: Math.floor(r() * 11) + 1,
      unit: ['hours', 'days', 'weeks', 'months'][Math.floor(r() * 4)],
      hue: Math.floor(r() * 360),
    })));
    return { phrases, sets };
  },

  draw(ctx, W, H, t, o, c) {
    const dark = o.theme === 'dark';
    const bg = dark ? '#0f0f11' : '#ffffff';
    const ink = dark ? '#f2f2f4' : '#16161c';
    const dim = dark ? 'rgba(242,242,244,.55)' : 'rgba(22,22,28,.5)';
    const R = Math.min(W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const dur = this.duration(o);
    const unit = o.hold + o.trans;
    const time = t * dur;
    const idx = clamp(Math.floor(time / unit), 0, c.phrases.length - 1);
    const local = time - idx * unit;
    const inTrans = local > o.hold && idx < c.phrases.length - 1;
    const u = inTrans ? ease.inOut(clamp((local - o.hold) / o.trans, 0, 1)) : 0;

    const rows = Math.round(o.rows);
    const rowH = H / (rows + 0.4);
    const pad = W * 0.05;

    const drawRow = (item, y, alpha, dx, blur) => {
      if (alpha <= 0.004) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (blur > 0.2) ctx.filter = `blur(${blur}px)`;
      ctx.translate(dx, 0);
      const av = rowH * 0.24;
      // procedural avatar: a tinted disc with an abstract head-and-shoulders
      ctx.save();
      ctx.beginPath();
      ctx.arc(pad + av, y + av, av, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = `hsl(${item.hue} 45% ${dark ? 32 : 78}%)`;
      ctx.fillRect(pad, y, av * 2, av * 2);
      ctx.fillStyle = `hsl(${(item.hue + 40) % 360} 40% ${dark ? 62 : 38}%)`;
      ctx.beginPath();
      ctx.arc(pad + av, y + av * 0.78, av * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(pad + av, y + av * 2.05, av * 0.66, av * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const tx = pad + av * 2.6;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = font('Inter', rowH * 0.16, 800);
      ctx.fillStyle = ink;
      ctx.fillText(item.handle, tx, y + rowH * 0.13);
      const hw = ctx.measureText(item.handle).width;
      ctx.font = font('Inter', rowH * 0.13, 500);
      ctx.fillStyle = dim;
      ctx.fillText(`${item.age} ${item.unit} ago`, tx + hw + rowH * 0.12, y + rowH * 0.13);

      ctx.font = font('Inter', rowH * 0.19, 600);
      ctx.fillStyle = ink;
      ctx.fillText(item.body, tx, y + rowH * 0.42);

      ctx.font = font('Inter', rowH * 0.14, 600);
      ctx.fillStyle = dim;
      ctx.fillText(`♡ ${item.likes}`, tx, y + rowH * 0.68);
      ctx.fillText('Reply', tx + rowH * 0.72, y + rowH * 0.68);
      ctx.fillStyle = o.accent;
      ctx.fillText(`${item.replies} replies`, tx + rowH * 1.5, y + rowH * 0.68);
      ctx.restore();
    };

    const A = c.sets[idx], B = c.sets[Math.min(idx + 1, c.sets.length - 1)];
    for (let i = 0; i < rows; i++) {
      const y = rowH * 0.25 + i * rowH;
      if (!inTrans) { drawRow(A[i], y, 1, 0, 0); continue; }
      // both states are on screen through the cut, offset and blurred —
      // the doubled text is the effect, not an artefact
      drawRow(A[i], y, 1 - u * 0.85, -u * W * 0.03 * o.ghost, u * 3 * o.ghost);
      drawRow(B[i], y, u, (1 - u) * W * 0.03 * o.ghost, (1 - u) * 3 * o.ghost);
    }

    // the headline, char-matched between phrases
    const phraseA = c.phrases[idx].toUpperCase();
    const phraseB = (c.phrases[idx + 1] || '').toUpperCase();
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const measure = (s, size) => { ctx.font = font(o.family, size, 900); return ctx.measureText(s).width; };
    const fit = (s) => { let sz = R * 0.2; while (measure(s, sz) > W * 0.82 && sz > 8) sz *= 0.94; return sz; };
    const sa = fit(phraseA), sb = phraseB ? fit(phraseB) : sa;

    const posOf = (str, size) => {
      ctx.font = font(o.family, size, 900);
      const total = ctx.measureText(str).width;
      let x = -total / 2;
      return [...str].map((ch) => {
        const w = ctx.measureText(ch).width;
        const at = { ch, x, w, size };
        x += w;
        return at;
      });
    };
    const ga = posOf(phraseA, sa);
    const gb = phraseB ? posOf(phraseB, sb) : [];
    const pairs = inTrans ? lcsPairs(ga, gb, (g) => g.ch) : [];
    const aMap = new Map(pairs.map(([i, j]) => [i, j]));
    const bSet = new Set(pairs.map(([, j]) => j));

    ctx.translate(W / 2, H / 2);
    ctx.fillStyle = ink;
    ctx.shadowColor = dark ? 'rgba(0,0,0,.7)' : 'rgba(255,255,255,.9)';
    ctx.shadowBlur = R * 0.05;
    ga.forEach((g, i) => {
      const j = aMap.get(i);
      if (!inTrans || j != null) {
        const to = j != null ? gb[j] : g;
        const size = lerp(g.size, to.size, u);
        ctx.font = font(o.family, size, 900);
        ctx.globalAlpha = 1;
        ctx.fillText(g.ch, lerp(g.x, to.x, u), 0);
      } else {
        const v = Math.min(1, u * 1.8);
        ctx.font = font(o.family, g.size, 900);
        ctx.globalAlpha = 1 - v;
        ctx.fillText(g.ch, g.x, v * v * g.size * 0.9);
      }
    });
    if (inTrans) {
      gb.forEach((g, j) => {
        if (bSet.has(j)) return;
        const v = seg(u, 0.4, 1);
        if (v <= 0) return;
        ctx.font = font(o.family, g.size, 900);
        ctx.globalAlpha = v;
        ctx.fillText(g.ch, g.x, -(1 - v) * g.size * 0.6);
      });
    }
    ctx.restore();
  },
};

// ── Text Reshuffle ────────────────────────────────────────────────────────
export const reshuffle = {
  id: 'reshuffle', name: 'Text Reshuffle', cat: 'Match cuts',
  blurb: 'Whole words fly to their new slot; only the new ones fade in.',
  dur: 0, loop: false,
  fields: [
    { k: 'text', type: 'textarea', label: 'Sentences (one per line)',
      def: "Start before you're ready\nYou're ready. Start.\nStart." },
    { k: 'family', type: 'font', label: 'Font', def: 'Archivo Black' },
    { k: 'bg', type: 'color', label: 'Ground', def: '#ffffff' },
    { k: 'ink', type: 'color', label: 'Ink', def: '#16161c' },
    { k: 'accent', type: 'color', label: 'New words', def: '#5145cd' },
    { k: 'hold', type: 'range', label: 'Hold', min: 0.3, max: 3, step: 0.05, def: 1 },
    { k: 'trans', type: 'range', label: 'Shuffle length', min: 0.3, max: 2, step: 0.05, def: 0.75 },
    { k: 'arc', type: 'range', label: 'Flight arc', min: 0, max: 1.2, step: 0.05, def: 0.5 },
  ],
  duration: (o) => {
    const n = Math.max(1, lines(o.text).length);
    return n * o.hold + (n - 1) * o.trans;
  },

  key: (o) => [o.text, o.family].join('|'),
  build(o, mctx) {
    const phrases = lines(o.text);
    const layouts = phrases.map(p =>
      layoutWords(mctx, p, { family: o.family, size: 100, weight: 800, maxW: 560 }));
    const links = [];
    for (let i = 0; i + 1 < layouts.length; i++) {
      links.push(lcsPairs(layouts[i].words, layouts[i + 1].words,
        (w) => w.text.toLowerCase().replace(/[^a-z0-9']/g, '')));
    }
    return { layouts, links };
  },

  draw(ctx, W, H, t, o, c) {
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, W, H);
    const dur = this.duration(o);
    const unit = o.hold + o.trans;
    const time = t * dur;
    const idx = clamp(Math.floor(time / unit), 0, c.layouts.length - 1);
    const local = time - idx * unit;
    const inTrans = local > o.hold && idx < c.layouts.length - 1;
    const u = inTrans ? ease.inOut(clamp((local - o.hold) / o.trans, 0, 1)) : 0;

    const A = c.layouts[idx];
    const B = inTrans ? c.layouts[idx + 1] : null;
    const sa = Math.min((W * 0.82) / A.w, (H * 0.62) / A.h);
    const sb = B ? Math.min((W * 0.82) / B.w, (H * 0.62) / B.h) : sa;
    const s = lerp(sa, sb, u);
    const pairs = inTrans ? c.links[idx] : [];
    const aMap = new Map(pairs.map(([i, j]) => [i, j]));
    const bSet = new Set(pairs.map(([, j]) => j));

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(s, s);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    A.words.forEach((w, i) => {
      const j = aMap.get(i);
      ctx.font = font(w.family, w.size, w.weight);
      if (!inTrans) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = o.ink;
        ctx.fillText(w.text, w.x, w.y);
        return;
      }
      if (j != null) {
        const to = B.words[j];
        // words that keep their identity fly along an arc rather than sliding
        const lift = Math.sin(u * Math.PI) * o.arc * w.size * 0.55 * ((i % 2) ? 1 : -1);
        ctx.globalAlpha = 1;
        ctx.fillStyle = o.ink;
        ctx.save();
        ctx.translate(lerp(w.x, to.x, u), lerp(w.y, to.y, u) - lift);
        ctx.rotate(Math.sin(u * Math.PI) * 0.12 * ((i % 2) ? 1 : -1));
        ctx.fillText(w.text, 0, 0);
        ctx.restore();
      } else {
        const v = Math.min(1, u * 1.7);
        ctx.globalAlpha = 1 - v;
        ctx.fillStyle = o.ink;
        ctx.fillText(w.text, w.x, w.y + v * v * w.size * 0.7);
      }
    });

    if (inTrans) {
      B.words.forEach((w, j) => {
        if (bSet.has(j)) return;
        const v = seg(u, 0.42, 1);
        if (v <= 0) return;
        ctx.globalAlpha = v;
        ctx.fillStyle = o.accent;
        ctx.font = font(w.family, w.size, w.weight);
        ctx.fillText(w.text, w.x, w.y - (1 - v) * w.size * 0.5);
      });
    }
    ctx.restore();
  },
};

export const SCENE_EFFECTS = [typewriter, magnifier, countrymap, texttrail, commentmatch, reshuffle];
