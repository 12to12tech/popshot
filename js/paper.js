// ---------------------------------------------------------------------------
// Popshot Paper — page wiring
//
// Holds the state, keeps the controls and the canvas in sync, and hands the
// same render(ctx, W, H, t) callback to the preview loop, the template
// thumbnails and every exporter.
//
// Two modes share one stage: "Paper" runs the cut-out → sheet → animation
// pipeline, and "Effects" runs one entry from the effect registry, whose
// control panel is generated from that effect's own field schema.
// ---------------------------------------------------------------------------

import { FONT_FAMILIES } from './presets.js';
import { DEFAULT_LOOK, buildSheet } from './paperfx.js';
import { ANIMS, ANIM_BY_ID } from './paperanim.js';
import {
  sheetMask, subjectMask, backdropMask, refineMask, invertMask, paintMask,
} from './cutout.js';
import {
  EFFECTS, EFFECT_BY_ID, EFFECT_CATS, FONT_LIST, defaultsFor, effectDuration,
} from './effects.js';
import { loadWorld } from './fxscene.js';
import { TEMPLATES, TEMPLATE_CATEGORIES, placeholderArt } from './papertemplates.js';
import { exportPNG, exportGIF, exportVideo } from './paperout.js';

document.getElementById('gfonts').href = 'https://fonts.googleapis.com/css2?' +
  FONT_FAMILIES.map(f => 'family=' + f.replace(/ /g, '+')).join('&') + '&display=swap';

const $ = (id) => document.getElementById(id);
const ASPECTS = { '1:1': [1080, 1080], '9:16': [1080, 1920], '4:5': [1080, 1350], '16:9': [1920, 1080] };
const FOLD_ANIMS = new Set(['foldout', 'quarters', 'concertina']);

const S = {
  mode: 'image',
  image: null, maskBase: null, mask: null, art: null, variants: null,
  cut: { mode: 'subject', tolerance: 0.14, erode: 1, feather: 1.2, invert: false },
  look: { ...DEFAULT_LOOK },
  motion: { anim: 'foldout', dur: 2.4, panels: 3, zoom: 0.84, loop: true, crease: 0.5, boilFps: 10 },
  canvas: { aspect: '1:1', bg: '#f7f6f1' },
  fx: { id: 'ransom', dur: null, loop: false },
  seed: 7,
  playing: true, t: 1, lastFrame: 0,
  brush: { on: false, mode: 'keep', size: 40 },
};

// One options object per effect, so switching back and forth keeps your edits.
const fxOpts = Object.fromEntries(EFFECTS.map(e => [e.id, defaultsFor(e)]));

const stage = $('stage');
const sctx = stage.getContext('2d');
const maskStage = $('maskStage');
const measure = document.createElement('canvas').getContext('2d');

// ── status ────────────────────────────────────────────────────────────────
function setBusy(text) {
  $('busy').hidden = !text;
  if (text) $('busyText').textContent = text;
}
function note(msg, isErr = false) {
  const el = $('stageNote');
  el.textContent = msg || '';
  el.classList.toggle('err', !!isErr);
}

// ── source ────────────────────────────────────────────────────────────────
function loadFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); adoptImage(img); };
  img.onerror = () => { URL.revokeObjectURL(url); note('That file would not decode as an image.', true); };
  img.src = url;
}

async function adoptImage(img) {
  S.image = img;
  $('drop').hidden = true;
  // A PNG that already carries alpha is its own cut-out — respect it.
  if (hasAlpha(img)) {
    S.cut.mode = 'sheet';
    S.maskBase = alphaOf(img);
    syncSeg('cutModes', 'sheet');
    note('This PNG already had transparency, so we tore around the existing alpha.');
    applyRefine();
  } else {
    await computeMask();
  }
  rebuildThumbArt();
}

function hasAlpha(img) {
  const c = document.createElement('canvas');
  const w = Math.min(160, img.naturalWidth || img.width);
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * (w / (img.naturalWidth || img.width))));
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 16) clear++;
  return clear > (d.length / 4) * 0.04;
}

function alphaOf(img) {
  const c = document.createElement('canvas');
  const k = Math.min(1, 900 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  c.width = Math.round((img.naturalWidth || img.width) * k);
  c.height = Math.round((img.naturalHeight || img.height) * k);
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, c.width, c.height);
  cx.globalCompositeOperation = 'source-in';   // keep only the alpha, painted white
  cx.fillStyle = '#fff';
  cx.fillRect(0, 0, c.width, c.height);
  return c;
}

async function computeMask() {
  if (!S.image) return;
  try {
    if (S.cut.mode === 'sheet') {
      S.maskBase = sheetMask(S.image);
    } else if (S.cut.mode === 'backdrop') {
      setBusy('Growing the selection…');
      const r = backdropMask(S.image, { tolerance: S.cut.tolerance });
      S.maskBase = r.canvas;
      if (r.coverage < 0.02) note('Almost everything matched the border colour — lower the tolerance.', true);
      else if (r.coverage > 0.985) note('Nothing matched the border colour — raise the tolerance.', true);
      else note('');
    } else {
      setBusy('Loading the segmentation model…');
      const r = await subjectMask(S.image);
      if (r.coverage < 0.01) {
        note('No person found in this image — switched to backdrop removal.', true);
        S.cut.mode = 'backdrop';
        syncSeg('cutModes', 'backdrop');
        setBusy(null);
        return computeMask();
      }
      S.maskBase = r.canvas;
      note('');
    }
  } catch (e) {
    console.warn(e);
    note('Segmentation is unavailable here — falling back to backdrop removal.', true);
    S.cut.mode = 'backdrop';
    syncSeg('cutModes', 'backdrop');
    S.maskBase = backdropMask(S.image, { tolerance: S.cut.tolerance }).canvas;
  }
  setBusy(null);
  applyRefine();
}

function applyRefine() {
  if (!S.maskBase) return;
  let m = refineMask(S.maskBase, { erode: S.cut.erode, feather: S.cut.feather });
  if (S.cut.invert) m = invertMask(m);
  S.mask = m;
  rebuildArt();
  if (S.brush.on) drawMaskStage();
}

// ── the sheet ─────────────────────────────────────────────────────────────
let buildTimer = null;
function rebuildArt(delay = 90) {
  clearTimeout(buildTimer);
  buildTimer = setTimeout(() => {
    if (!S.image || !S.mask) return;
    const t0 = performance.now();
    S.art = buildSheet({ image: S.image, mask: S.mask, look: S.look, seed: S.seed });
    // the boil animation cycles three separately-torn cuts of the same art
    S.variants = null;
    if (S.motion.anim === 'boil') {
      S.variants = [S.art,
        buildSheet({ image: S.image, mask: S.mask, look: S.look, seed: S.seed + 811 }),
        buildSheet({ image: S.image, mask: S.mask, look: S.look, seed: S.seed + 1621 })];
    }
    if (performance.now() - t0 > 900) note('Large image — drop in something smaller if this feels sluggish.');
  }, delay);
}

// ── effect state ──────────────────────────────────────────────────────────
let fxCacheId = '', fxCacheKey = '', fxCacheVal = null;
function fxCache(effect, o) {
  if (!effect.build) return null;
  const key = effect.key ? effect.key(o) : JSON.stringify(o);
  if (fxCacheId !== effect.id || fxCacheKey !== key) {
    fxCacheId = effect.id; fxCacheKey = key;
    fxCacheVal = effect.build(o, measure);
  }
  return fxCacheVal;
}
function invalidateFx() { fxCacheId = ''; fxCacheKey = ''; fxCacheVal = null; }

function currentEffect() { return EFFECT_BY_ID[S.fx.id]; }

function currentDuration() {
  if (S.mode === 'text') {
    const fx = currentEffect();
    const o = fxOpts[fx.id];
    if (fx.duration) return effectDuration(fx, o, fxCache(fx, o));
    return S.fx.dur ?? fx.dur;
  }
  return S.motion.dur;
}

function currentLoop() {
  if (S.mode === 'text') return S.fx.loop;
  return S.motion.loop || !!ANIM_BY_ID[S.motion.anim]?.loop;
}

// ── render ────────────────────────────────────────────────────────────────
// Content always lands on a transparent layer first; the fold shading uses
// 'source-atop' and would otherwise tint the background too.
const layers = new Map();
function getLayer(W, H) {
  const key = `${W}x${H}`;
  let c = layers.get(key);
  if (!c) {
    if (layers.size > 4) layers.clear();
    c = document.createElement('canvas');
    c.width = W; c.height = H;
    layers.set(key, c);
  }
  c.getContext('2d').clearRect(0, 0, W, H);
  return c;
}

function renderContent(ctx, W, H, t) {
  const layer = getLayer(W, H);
  const lc = layer.getContext('2d');
  if (S.mode === 'text') {
    const fx = currentEffect();
    const o = fxOpts[fx.id];
    try {
      fx.draw(lc, W, H, t, o, fxCache(fx, o));
    } catch (e) {
      console.error(`effect "${fx.id}" failed`, e);
      note(`That effect hit an error: ${e.message}`, true);
    }
  } else if (S.art) {
    const anim = ANIM_BY_ID[S.motion.anim] || ANIMS[0];
    anim.draw(lc, W, H, S.art, t, {
      ...S.motion, seed: S.seed, tint: S.look.tint, variants: S.variants, dur: S.motion.dur,
    });
  }
  ctx.drawImage(layer, 0, 0);
}

function paintStage() {
  const [aw, ah] = ASPECTS[S.canvas.aspect];
  const scale = 660 / Math.max(aw, ah);
  const W = Math.round(aw * scale), H = Math.round(ah * scale);
  if (stage.width !== W || stage.height !== H) { stage.width = W; stage.height = H; }
  sctx.clearRect(0, 0, W, H);
  if (S.canvas.bg !== 'transparent') { sctx.fillStyle = S.canvas.bg; sctx.fillRect(0, 0, W, H); }
  renderContent(sctx, W, H, S.t);
}

// ── preview loop ──────────────────────────────────────────────────────────
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - S.lastFrame) / 1000 || 0);
  S.lastFrame = now;
  if (S.playing) {
    const dur = currentDuration() || 1;
    S.t += dt / dur;
    if (S.t >= 1) {
      if (currentLoop()) S.t -= 1;
      else { S.t = 1; setPlaying(false); }
    }
    $('scrub').value = Math.round(S.t * 1000);
    $('time').textContent = (S.t * dur).toFixed(1) + 's';
  }
  if (!S.brush.on) paintStage();
  paintThumbs(now);
}

function setPlaying(on) {
  S.playing = on;
  $('play').innerHTML = on
    ? '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>'
    : '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
}
function restart() { S.t = 0; setPlaying(true); }

// ── mask touch-up view ────────────────────────────────────────────────────
// Removed areas read as the transparency checkerboard with a ghost of the
// original underneath — a colour wash would collide with the subject whenever
// the subject happens to be that colour.
let checker = null;
function getChecker(ctx) {
  if (checker) return checker;
  const t = document.createElement('canvas');
  t.width = t.height = 24;
  const tc = t.getContext('2d');
  tc.fillStyle = '#ffffff';
  tc.fillRect(0, 0, 24, 24);
  tc.fillStyle = '#dad7ca';
  tc.fillRect(0, 0, 12, 12);
  tc.fillRect(12, 12, 12, 12);
  checker = ctx.createPattern(t, 'repeat');
  return checker;
}

function drawMaskStage() {
  if (!S.maskBase) return;
  const m = S.maskBase;
  maskStage.width = m.width; maskStage.height = m.height;
  const c = maskStage.getContext('2d');
  c.clearRect(0, 0, m.width, m.height);
  c.fillStyle = getChecker(c);
  c.fillRect(0, 0, m.width, m.height);
  c.globalAlpha = 0.22;                       // ghost of what is currently cut
  c.drawImage(S.image, 0, 0, m.width, m.height);
  c.globalAlpha = 1;

  const kept = document.createElement('canvas');
  kept.width = m.width; kept.height = m.height;
  const kc = kept.getContext('2d');
  kc.drawImage(S.image, 0, 0, m.width, m.height);
  kc.globalCompositeOperation = 'destination-in';
  kc.drawImage(m, 0, 0);
  c.drawImage(kept, 0, 0);
}

function setTouchup(on) {
  S.brush.on = on;
  $('touchPanel').hidden = !on;
  maskStage.hidden = !on;
  stage.hidden = on;
  $('touchup').textContent = on ? 'Close touch-up' : 'Touch up…';
  if (on) { drawMaskStage(); note('Paint on the image: restore adds back, erase cuts away.'); }
  else note('');
}

let painting = false;
function brushAt(e) {
  const r = maskStage.getBoundingClientRect();
  const x = (e.clientX - r.left) * (maskStage.width / r.width);
  const y = (e.clientY - r.top) * (maskStage.height / r.height);
  const rad = S.brush.size * (maskStage.width / r.width) * 0.5;
  paintMask(S.maskBase, x, y, rad, S.brush.mode);
  drawMaskStage();
}
maskStage.addEventListener('pointerdown', (e) => {
  painting = true; maskStage.setPointerCapture(e.pointerId); brushAt(e);
});
maskStage.addEventListener('pointermove', (e) => { if (painting) brushAt(e); });
maskStage.addEventListener('pointerup', () => { if (painting) { painting = false; applyRefine(); } });
maskStage.addEventListener('pointercancel', () => { painting = false; });

// ── control helpers ───────────────────────────────────────────────────────
const SEG_ATTR = { cutModes: 'cut', brushModes: 'brush', aspects: 'aspect' };
function syncSeg(groupId, value) {
  const attr = SEG_ATTR[groupId];
  document.querySelectorAll(`#${groupId} button`).forEach(b => {
    b.classList.toggle('active', b.dataset[attr] === value);
  });
}
function bindRange(id, readoutId, apply, opts = {}) {
  const el = $(id);
  const out = readoutId ? $(readoutId) : null;
  const handler = () => {
    const v = parseFloat(el.value);
    if (out) out.textContent = v;
    apply(v);
  };
  el.addEventListener('input', handler);
  if (opts.init !== false) handler();
}
function bindSeg(groupId, attr, apply) {
  document.querySelectorAll(`#${groupId} button`).forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll(`#${groupId} button`).forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      apply(b.dataset[attr]);
    });
  });
}

// ── source controls ───────────────────────────────────────────────────────
$('drop').addEventListener('click', (e) => { if (e.target.id !== 'useSample') $('file').click(); });
$('file').addEventListener('change', (e) => e.target.files[0] && loadFile(e.target.files[0]));
$('useSample').addEventListener('click', (e) => {
  e.stopPropagation();
  const { image, mask } = placeholderArt();
  S.image = image; S.maskBase = mask;
  S.cut.mode = 'sheet';
  syncSeg('cutModes', 'sheet');
  $('drop').hidden = true;
  note('Sample shape loaded — drop a real image over it whenever you like.');
  applyRefine();
  rebuildThumbArt();
});
const wrap = $('stageWrap');
wrap.addEventListener('dragover', (e) => { e.preventDefault(); $('drop').classList.add('drag'); });
wrap.addEventListener('dragleave', () => $('drop').classList.remove('drag'));
wrap.addEventListener('drop', (e) => {
  e.preventDefault();
  $('drop').classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) { $('drop').hidden = true; loadFile(f); }
});

// ── cut-out ───────────────────────────────────────────────────────────────
bindSeg('cutModes', 'cut', (v) => {
  S.cut.mode = v;
  $('cutHint').textContent = {
    subject: 'Finds a person on-device and cuts around them.',
    backdrop: 'Grows a selection in from the frame border. Best on flat or gradient backdrops.',
    sheet: 'Keeps the whole rectangle — a photo mounted on card.',
  }[v];
  document.querySelectorAll('[data-cut-only]').forEach(el => { el.hidden = el.dataset.cutOnly !== v; });
  computeMask();
});
let maskTimer = null;
const debouncedMask = () => { clearTimeout(maskTimer); maskTimer = setTimeout(computeMask, 220); };
bindRange('tol', 'vTol', (v) => { S.cut.tolerance = v; if (S.cut.mode === 'backdrop') debouncedMask(); }, { init: false });
bindRange('erode', 'vErode', (v) => { S.cut.erode = v; applyRefine(); }, { init: false });
bindRange('feather', 'vFeather', (v) => { S.cut.feather = v; applyRefine(); }, { init: false });
$('invert').addEventListener('change', (e) => { S.cut.invert = e.target.checked; applyRefine(); });
$('touchup').addEventListener('click', () => setTouchup(!S.brush.on));
$('doneTouch').addEventListener('click', () => setTouchup(false));
$('resetMask').addEventListener('click', () => computeMask());
bindSeg('brushModes', 'brush', (v) => { S.brush.mode = v; });
bindRange('brush', 'vBrush', (v) => { S.brush.size = v; }, { init: false });

// ── paper ─────────────────────────────────────────────────────────────────
const lookBind = [
  ['edge', 'vEdge', 'edge'], ['ragged', 'vRag', 'ragged'], ['layers', 'vLayers', 'layers'],
  ['shadow', 'vShadow', 'shadow'], ['grain', 'vGrain', 'grain'], ['fibres', 'vFibres', 'fibres'],
];
for (const [id, out, key] of lookBind) {
  bindRange(id, out, (v) => { S.look[key] = v; rebuildArt(140); rebuildThumbArt(400); }, { init: false });
}
$('tint').addEventListener('input', (e) => { S.look.tint = e.target.value; rebuildArt(140); });
$('reseed').addEventListener('click', () => { S.seed = Math.floor(Math.random() * 1e6); rebuildArt(0); rebuildThumbArt(0); });

// ── motion ────────────────────────────────────────────────────────────────
const animSel = $('anim');
for (const a of ANIMS) {
  const o = document.createElement('option');
  o.value = a.id; o.textContent = `${a.group} · ${a.name}`;
  animSel.appendChild(o);
}
animSel.value = S.motion.anim;
function syncAnim() {
  const a = ANIM_BY_ID[S.motion.anim];
  $('animHint').textContent = a.blurb;
  $('panelsField').hidden = !FOLD_ANIMS.has(a.id);
}
animSel.addEventListener('change', () => {
  S.motion.anim = animSel.value;
  const a = ANIM_BY_ID[S.motion.anim];
  S.motion.dur = a.dur;
  $('dur').value = a.dur; $('vDur').textContent = a.dur;
  $('loop').checked = S.motion.loop = !!a.loop || S.motion.loop;
  syncAnim();
  rebuildArt(0);
  restart();
});
bindRange('dur', 'vDur', (v) => { S.motion.dur = v; }, { init: false });
bindRange('panels', 'vPanels', (v) => { S.motion.panels = v; }, { init: false });
bindRange('zoom', 'vZoom', (v) => { S.motion.zoom = v; }, { init: false });
$('loop').addEventListener('change', (e) => { S.motion.loop = e.target.checked; });

// ── effects: a control panel generated from each effect's field schema ────
const fxSelect = $('fxSelect');
for (const cat of EFFECT_CATS) {
  const group = document.createElement('optgroup');
  group.label = cat;
  for (const e of EFFECTS.filter(x => x.cat === cat)) {
    const opt = document.createElement('option');
    opt.value = e.id; opt.textContent = e.name;
    group.appendChild(opt);
  }
  fxSelect.appendChild(group);
}

function labelled(text, control, readout) {
  const l = document.createElement('label');
  l.className = 'pf-field';
  const s = document.createElement('span');
  s.textContent = text;
  if (readout) { const b = document.createElement('b'); b.textContent = readout; s.appendChild(b); }
  l.appendChild(s);
  l.appendChild(control);
  return l;
}

function renderFxFields() {
  const fx = currentEffect();
  const o = fxOpts[fx.id];
  const host = $('fxFields');
  host.replaceChildren();

  for (const f of fx.fields) {
    const changed = () => { invalidateFx(); restart(); };
    if (f.type === 'textarea' || f.type === 'text') {
      const el = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
      if (f.type === 'textarea') el.rows = Math.min(5, Math.max(2, String(o[f.k]).split('\n').length));
      else el.type = 'text';
      el.value = o[f.k];
      el.addEventListener('input', () => { o[f.k] = el.value; changed(); });
      host.appendChild(labelled(f.label, el));
    } else if (f.type === 'range') {
      const el = document.createElement('input');
      el.type = 'range'; el.min = f.min; el.max = f.max; el.step = f.step; el.value = o[f.k];
      const wrapEl = labelled(f.label, el, String(o[f.k]));
      const out = wrapEl.querySelector('b');
      el.addEventListener('input', () => { o[f.k] = parseFloat(el.value); out.textContent = el.value; changed(); });
      host.appendChild(wrapEl);
    } else if (f.type === 'color') {
      const el = document.createElement('input');
      el.type = 'color'; el.value = o[f.k];
      el.addEventListener('input', () => { o[f.k] = el.value; changed(); });
      host.appendChild(labelled(f.label, el));
    } else if (f.type === 'check') {
      const l = document.createElement('label');
      l.className = 'pf-check';
      const el = document.createElement('input');
      el.type = 'checkbox'; el.checked = !!o[f.k];
      el.addEventListener('change', () => { o[f.k] = el.checked; changed(); });
      l.append(el, document.createTextNode(' ' + f.label));
      host.appendChild(l);
    } else if (f.type === 'select' || f.type === 'font' || f.type === 'country') {
      const el = document.createElement('select');
      const fill = (pairs) => {
        el.replaceChildren();
        for (const [v, label] of pairs) {
          const opt = document.createElement('option');
          opt.value = v; opt.textContent = label;
          el.appendChild(opt);
        }
        el.value = o[f.k];
      };
      if (f.type === 'font') fill(FONT_LIST.map(v => [v, v]));
      else if (f.type === 'country') {
        fill([[o[f.k], o[f.k] + ' — loading list…']]);
        loadWorld()
          .then(w => { fill(w.names.map(v => [v, v])); el.value = o[f.k]; })
          .catch(() => fill([[o[f.k], o[f.k] + ' (list unavailable)']]));
      } else fill(f.options);
      el.addEventListener('change', () => { o[f.k] = el.value; changed(); });
      host.appendChild(labelled(f.label, el));
    }
  }
}

function syncFx() {
  const fx = currentEffect();
  fxSelect.value = fx.id;
  $('fxHint').textContent = fx.blurb;
  renderFxFields();
  // effects whose length follows their content own the timing; the rest keep
  // the duration slider
  const contentTimed = !!fx.duration;
  $('fxDur').parentElement.parentElement.hidden = contentTimed;
  if (!contentTimed) {
    S.fx.dur = S.fx.dur ?? fx.dur;
    $('fxDur').value = S.fx.dur;
    $('vFxDur').textContent = S.fx.dur;
  }
  S.fx.loop = !!fx.loop;
  $('fxLoop').checked = S.fx.loop;
  // an effect that paints its own ground makes the canvas swatches a no-op
  $('bgRow').hidden = !!fx.opaque;
  $('bgLocked').hidden = !fx.opaque;
}

fxSelect.addEventListener('change', () => {
  S.fx.id = fxSelect.value;
  S.fx.dur = null;
  invalidateFx();
  syncFx();
  restart();
});
bindRange('fxDur', 'vFxDur', (v) => { S.fx.dur = v; }, { init: false });
$('fxLoop').addEventListener('change', (e) => { S.fx.loop = e.target.checked; });
$('reseedText').addEventListener('click', () => {
  fxOpts[S.fx.id].seed = Math.floor(Math.random() * 1e6);
  invalidateFx();
  restart();
});

// ── canvas ────────────────────────────────────────────────────────────────
bindSeg('aspects', 'aspect', (v) => { S.canvas.aspect = v; });
document.querySelectorAll('#bgs button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#bgs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    S.canvas.bg = b.dataset.bg;
  });
});
$('bgCustom').addEventListener('input', (e) => {
  document.querySelectorAll('#bgs button').forEach(x => x.classList.remove('active'));
  S.canvas.bg = e.target.value;
});

// ── mode switch ───────────────────────────────────────────────────────────
function setMode(mode) {
  S.mode = mode;
  document.querySelectorAll('.pf-mode').forEach(x => {
    const on = x.dataset.mode === mode;
    x.classList.toggle('active', on);
    x.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll('.pf-sec[data-for]').forEach(sec => { sec.hidden = sec.dataset.for !== mode; });
  if (mode === 'text') { setTouchup(false); $('drop').hidden = true; syncFx(); }
  else {
    $('drop').hidden = !!S.image;
    $('bgRow').hidden = false;
    $('bgLocked').hidden = true;
  }
  restart();
}
document.querySelectorAll('.pf-mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

// ── transport ─────────────────────────────────────────────────────────────
$('play').addEventListener('click', () => { if (!S.playing && S.t >= 1) S.t = 0; setPlaying(!S.playing); });
$('replay').addEventListener('click', restart);
$('scrub').addEventListener('input', (e) => {
  setPlaying(false);
  S.t = e.target.value / 1000;
  $('time').textContent = (S.t * (currentDuration() || 1)).toFixed(1) + 's';
});

// ── export ────────────────────────────────────────────────────────────────
function outSize(maxW) {
  const [aw, ah] = ASPECTS[S.canvas.aspect];
  const s = maxW ? Math.min(1, maxW / aw) : 1;
  return [Math.round(aw * s / 2) * 2, Math.round(ah * s / 2) * 2];
}
function exportName(ext) {
  const tag = S.mode === 'text' ? S.fx.id : S.motion.anim;
  return `popshot-paper-${tag}.${ext}`;
}
function progress(v) {
  $('progWrap').hidden = v == null;
  if (v != null) $('progBar').style.width = `${Math.round(v * 100)}%`;
}
function guard() {
  if (S.mode === 'image' && !S.art) { note('Load an image first.', true); return false; }
  return true;
}
async function withBusy(label, fn) {
  setBusy(label); progress(0);
  const wasPlaying = S.playing;
  setPlaying(false);
  try { await fn(); note(''); }
  catch (e) { console.error(e); note(`Export failed: ${e.message}`, true); }
  finally { setBusy(null); progress(null); setPlaying(wasPlaying); }
}
// Simulated effects must be replayed from zero, not sampled from wherever the
// preview happened to be paused.
function resetSim() { if (S.mode === 'text') invalidateFx(); }

$('expPng').addEventListener('click', () => {
  if (!guard()) return;
  const [W, H] = outSize();
  withBusy('Rendering PNG…', () => exportPNG({
    render: renderContent, W, H, bg: S.canvas.bg, t: S.t, name: exportName('png'),
  }));
});
$('expGif').addEventListener('click', () => {
  if (!guard()) return;
  const [W, H] = outSize(parseInt($('gifW').value, 10));
  resetSim();
  withBusy('Encoding GIF…', () => exportGIF({
    render: renderContent, W, H,
    bg: S.canvas.bg,
    transparent: $('gifAlpha').checked || (S.canvas.bg === 'transparent' && !currentEffect().opaque),
    fps: parseInt($('gifFps').value, 10),
    dur: currentDuration(),
    loops: parseInt($('repeats').value, 10),
    name: exportName('gif'),
    onProgress: progress,
  }));
});
$('expVid').addEventListener('click', () => {
  if (!guard()) return;
  const [W, H] = outSize();
  resetSim();
  withBusy('Recording video…', () => exportVideo({
    render: renderContent, W, H,
    bg: S.canvas.bg === 'transparent' ? '#00b140' : S.canvas.bg,
    fps: 30,
    dur: currentDuration(),
    loops: parseInt($('repeats').value, 10),
    name: exportName('').replace(/\.$/, ''),
    onProgress: progress,
  }));
});
bindRange('gifW', 'vGifW', () => {});
bindRange('gifFps', 'vGifFps', () => {});
bindRange('repeats', 'vRepeats', () => {});

// ── motion lab ────────────────────────────────────────────────────────────
const cards = [];
let thumbArt = new Map();
const visible = new Set();

function lookKey(look) {
  return [look.edge, look.ragged, look.layers, look.shadow, look.grain, look.fibres, look.tint].join('|');
}

let thumbTimer = null;
function rebuildThumbArt(delay = 120) {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    thumbArt = new Map();
    const image = S.image, mask = S.mask;
    if (!image || !mask) return;
    for (const tpl of TEMPLATES) {
      if (tpl.kind !== 'paper') continue;
      const key = lookKey(tpl.look);
      if (thumbArt.has(key)) continue;
      thumbArt.set(key, buildSheet({ image, mask, look: tpl.look, seed: 3, maxSide: 300 }));
    }
  }, delay);
}

function buildLab() {
  const tabs = $('labTabs');
  TEMPLATE_CATEGORIES.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'cat-tab' + (i === 0 ? ' active' : '');
    b.textContent = c;
    b.addEventListener('click', () => {
      tabs.querySelectorAll('.cat-tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      for (const card of cards) card.el.hidden = c !== 'All' && card.tpl.cat !== c;
    });
    tabs.appendChild(b);
  });

  const grid = $('labGrid');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target);
    }
  }, { rootMargin: '150px' });

  for (const tpl of TEMPLATES) {
    const el = document.createElement('button');
    el.className = 'pf-card';
    el.type = 'button';
    const cv = document.createElement('canvas');
    const [aw, ah] = ASPECTS[tpl.aspect];
    const s = 260 / Math.max(aw, ah);
    cv.width = Math.round(aw * s); cv.height = Math.round(ah * s);
    el.appendChild(cv);
    const meta = document.createElement('div');
    meta.className = 'pf-card-meta';
    const tag = document.createElement('span');
    tag.className = 'pf-card-tag';
    tag.textContent = tpl.cat.toUpperCase();
    const name = document.createElement('strong');
    name.textContent = tpl.name;
    const blurb = document.createElement('span');
    blurb.textContent = tpl.blurb;
    meta.append(tag, name, blurb);
    el.appendChild(meta);
    el.addEventListener('click', () => applyTemplate(tpl, el));
    grid.appendChild(el);
    io.observe(el);

    const card = { tpl, el, cv, ctx: cv.getContext('2d'), phase: Math.random() };
    if (tpl.kind === 'fx') {
      const fx = EFFECT_BY_ID[tpl.fx];
      // thumbnails get their own options object and a coarser quality budget
      card.fx = fx;
      card.opts = { ...defaultsFor(fx), ...(tpl.opts || {}), quality: 0.45 };
      card.dur = effectDuration(fx, card.opts, null);
    }
    cards.push(card);
  }
}

const fallback = placeholderArt();
const fallbackArt = new Map();
function thumbSheet(tpl) {
  const key = lookKey(tpl.look);
  if (thumbArt.has(key)) return thumbArt.get(key);
  if (!fallbackArt.has(key)) {
    fallbackArt.set(key, buildSheet({
      image: fallback.image, mask: fallback.mask, look: tpl.look, seed: 3, maxSide: 260,
    }));
  }
  return fallbackArt.get(key);
}

let thumbClock = 0;
function paintThumbs(now) {
  // thumbnails run at ~18fps; thirty live canvases at 60 is wasted work
  if (now - thumbClock < 55) return;
  thumbClock = now;
  for (const card of cards) {
    if (card.el.hidden || !visible.has(card.el)) continue;
    const { tpl, ctx, cv } = card;
    const W = cv.width, H = cv.height;
    const dur = card.dur || tpl.dur || 2.4;
    const t = ((now / 1000 / dur) + card.phase) % 1;
    ctx.clearRect(0, 0, W, H);
    if (tpl.bg !== 'transparent') { ctx.fillStyle = tpl.bg; ctx.fillRect(0, 0, W, H); }
    const layer = getLayer(W, H);
    const lc = layer.getContext('2d');
    try {
      if (tpl.kind === 'fx') {
        if (card.fx.build) {
          const key = card.fx.key ? card.fx.key(card.opts) : 'static';
          if (card.cacheKey !== key) { card.cacheKey = key; card.cache = card.fx.build(card.opts, measure); }
        }
        card.fx.draw(lc, W, H, t, card.opts, card.cache);
        if (!card.dur) card.dur = effectDuration(card.fx, card.opts, card.cache);
      } else {
        const art = thumbSheet(tpl);
        ANIM_BY_ID[tpl.anim].draw(lc, W, H, art, t, {
          panels: tpl.panels || 3, zoom: tpl.zoom || 0.84, crease: 0.5,
          seed: 3, tint: tpl.look.tint, boilFps: 10, dur,
        });
      }
      ctx.drawImage(layer, 0, 0);
    } catch (e) {
      // one bad card must not stall the gallery
      if (!card.warned) { card.warned = true; console.warn(`thumbnail "${tpl.id}" failed`, e); }
    }
  }
}

function applyTemplate(tpl, el) {
  document.querySelectorAll('.pf-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  S.canvas.aspect = tpl.aspect;
  syncSeg('aspects', tpl.aspect);
  S.canvas.bg = tpl.bg;
  document.querySelectorAll('#bgs button').forEach(b => b.classList.toggle('active', b.dataset.bg === tpl.bg));

  if (tpl.kind === 'fx') {
    S.fx.id = tpl.fx;
    S.fx.dur = null;
    Object.assign(fxOpts[tpl.fx], tpl.opts || {});
    invalidateFx();
    setMode('text');          // setMode calls syncFx, which rebuilds the panel
    return;
  }

  setMode('image');
  Object.assign(S.look, tpl.look);
  for (const [id, out, key] of lookBind) { $(id).value = S.look[key]; $(out).textContent = S.look[key]; }
  $('tint').value = S.look.tint;
  S.motion.anim = tpl.anim;
  animSel.value = tpl.anim;
  S.motion.dur = tpl.dur || ANIM_BY_ID[tpl.anim].dur;
  S.motion.panels = tpl.panels || 3;
  S.motion.zoom = tpl.zoom || 0.84;
  S.motion.loop = !!tpl.loop || !!ANIM_BY_ID[tpl.anim].loop;
  $('dur').value = S.motion.dur; $('vDur').textContent = S.motion.dur;
  $('panels').value = S.motion.panels; $('vPanels').textContent = S.motion.panels;
  $('zoom').value = S.motion.zoom; $('vZoom').textContent = S.motion.zoom;
  $('loop').checked = S.motion.loop;
  syncAnim();
  rebuildArt(0);
  restart();
  if (!S.image) note('Template loaded — drop an image in and it will take this look.');
}

// ── deep links ────────────────────────────────────────────────────────────
// The nav menu links straight at an animation or effect, e.g. paper.html#boil
// or paper.html#countrymap. Handled on load and on hashchange, so following a
// menu link from this page switches without a reload.
function applyHash() {
  const id = decodeURIComponent(location.hash.replace('#', '')).trim();
  if (!id) return false;
  if (ANIM_BY_ID[id]) {
    S.motion.anim = id;
    const a = ANIM_BY_ID[id];
    S.motion.dur = a.dur;
    S.motion.loop = !!a.loop;
    animSel.value = id;
    $('dur').value = a.dur; $('vDur').textContent = a.dur;
    $('loop').checked = S.motion.loop;
    syncAnim();
    setMode('image');
    rebuildArt(0);
    return true;
  }
  if (EFFECT_BY_ID[id]) {
    S.fx.id = id;
    S.fx.dur = null;
    invalidateFx();
    setMode('text');
    return true;
  }
  return false;
}
window.addEventListener('hashchange', () => {
  if (applyHash()) document.querySelector('.pf-app')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ── boot ──────────────────────────────────────────────────────────────────
// On a phone every panel open at once buries the canvas under a very long
// scroll, so only the first one starts expanded.
if (window.matchMedia('(max-width: 700px)').matches) {
  document.querySelectorAll('.pf-sec').forEach((sec, i) => { if (i > 0) sec.open = false; });
}
document.querySelectorAll('[data-cut-only]').forEach(el => { el.hidden = el.dataset.cutOnly !== S.cut.mode; });
syncAnim();
syncFx();
document.querySelectorAll('.pf-sec[data-for]').forEach(sec => { sec.hidden = sec.dataset.for !== S.mode; });
$('bgRow').hidden = false;
$('bgLocked').hidden = true;
setPlaying(true);
buildLab();
requestAnimationFrame(loop);
applyHash();
document.fonts.ready.then(() => {
  invalidateFx();
  for (const c of cards) { c.cacheKey = null; c.cache = null; }
});
