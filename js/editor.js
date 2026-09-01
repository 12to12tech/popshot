// ---------------------------------------------------------------------------
// Popshot — editor app
// Wires the whole flow: upload → transcribe → style → words → hook/thumbnail
// → export. State lives in one object; the preview loop re-renders from it.
// ---------------------------------------------------------------------------

import { CONFIG } from './config.js';
import { PRESETS, CATEGORIES, presetsForCategory, getPreset, FONT_FAMILIES } from './presets.js';
import { groupWords, drawFrame, drawCover } from './engine.js';
import { transcribeFile, timingsFromText } from './transcribe.js';
import { suggestHooks } from './hooks.js';
import { exportVideo, findWorkingMime } from './exporter.js';
import { MaskTracker } from './segmenter.js';
import { takeFile } from './handoff.js';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  file: null,
  url: null,
  words: [],          // [{text, start, end, deleted}]
  groups: [],
  preset: getPreset('beast-bold'),
  aspect: '9:16',
  hook: '',
  speaker: { name: '', role: '' },
  thumbTime: 1.0,
  step: 'upload',
};

const $ = (id) => document.getElementById(id);
const video = $('srcVideo');
const canvas = $('previewCanvas');
const ctx = canvas.getContext('2d');
const scratch = document.createElement('canvas');
let maskTracker = null;
let exporting = false;

// ── Fonts ──────────────────────────────────────────────────────────────────
$('gfonts').href = 'https://fonts.googleapis.com/css2?' +
  FONT_FAMILIES.map(f => 'family=' + f.replace(/ /g, '+')).join('&') + '&display=swap';

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, ms = 3500) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ── Step navigation ────────────────────────────────────────────────────────
const STEPS = ['upload', 'style', 'words', 'package', 'export'];
function goStep(step) {
  state.step = step;
  for (const s of STEPS) {
    $('panel-' + s).hidden = s !== step;
    const btn = document.querySelector(`[data-step="${s}"]`);
    btn.classList.toggle('active', s === step);
    btn.classList.toggle('done', STEPS.indexOf(s) < STEPS.indexOf(step));
  }
  if (step === 'style') renderStyleGrid();
  if (step === 'words') renderWordEditor();
  if (step === 'package') { renderHooks(); drawThumb(); }
  if (step === 'export') renderExportMeta();
}
function unlockStep(step) {
  document.querySelector(`[data-step="${step}"]`).disabled = false;
}
$('stepNav').addEventListener('click', (e) => {
  const btn = e.target.closest('.step');
  if (btn && !btn.disabled) goStep(btn.dataset.step);
});

// ── Upload ─────────────────────────────────────────────────────────────────
const dz = $('dropzone');
dz.addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', (e) => e.target.files[0] && loadFile(e.target.files[0]));
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', (e) => {
  e.preventDefault(); dz.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('video/')) loadFile(f);
  else toast('Drop a video file (MP4, MOV or WebM)');
});

function loadFile(file) {
  state.file = file;
  if (state.url) URL.revokeObjectURL(state.url);
  state.url = URL.createObjectURL(file);
  video.src = state.url;
  video.load();
  video.addEventListener('loadedmetadata', () => {
    $('previewEmpty').hidden = true;
    $('transcribeCard').hidden = false;
    $('scrubber').max = video.duration;
    updateTimeLabel();
    if (video.duration > 310) toast('Heads up: clips under 5 minutes work best.');
    video.currentTime = 0.05;
    toast(`Loaded ${file.name} · ${fmtTime(video.duration)}`);
  }, { once: true });
}

// landing-page handoff
takeFile().then(f => { if (f && !state.file) loadFile(f); }).catch(() => {});

// bundled sample clip
$('demoBtn').addEventListener('click', async () => {
  try {
    $('demoBtn').disabled = true;
    const res = await fetch('assets/demo.mp4');
    if (!res.ok) throw new Error('sample missing');
    const blob = await res.blob();
    loadFile(new File([blob], 'demo.mp4', { type: 'video/mp4' }));
  } catch {
    toast('Sample clip not found — drop in your own video instead.');
  } finally {
    $('demoBtn').disabled = false;
  }
});

// ── Transcription ──────────────────────────────────────────────────────────
$('transcribeBtn').addEventListener('click', async () => {
  if (!state.file) return toast('Upload a clip first');
  const prog = $('transcribeProgress'), msg = $('progressMsg');
  prog.hidden = false;
  $('transcribeBtn').disabled = true;
  try {
    state.words = await transcribeFile(state.file, {
      model: $('modelSel').value,
      onProgress: (m) => { msg.textContent = m; },
    });
    if (!state.words.length) {
      toast('No speech detected — you can paste the transcript manually.');
      $('manualBox').hidden = false;
    } else {
      afterTranscript();
    }
  } catch (err) {
    console.error(err);
    toast('Transcription failed (' + err.message + '). Paste the transcript manually instead.');
    $('manualBox').hidden = false;
  } finally {
    prog.hidden = true;
    $('transcribeBtn').disabled = false;
  }
});

$('manualBtn').addEventListener('click', () => { $('manualBox').hidden = !$('manualBox').hidden; });
$('manualGo').addEventListener('click', () => {
  const text = $('manualText').value;
  if (!text.trim()) return toast('Paste some text first');
  if (!video.duration) return toast('Upload a clip first');
  state.words = timingsFromText(text, video.duration);
  afterTranscript();
});

function afterTranscript() {
  rebuildGroups();
  ['style', 'words', 'package', 'export'].forEach(unlockStep);
  goStep('style');
  toast(`Transcribed ${state.words.length} words ✓`);
}

function rebuildGroups() {
  state.groups = groupWords(state.words, state.preset);
}

// ── Style picker ───────────────────────────────────────────────────────────
let activeCat = 'popular';
const sampleSource = makeSampleSource();

function makeSampleSource() {
  const c = document.createElement('canvas');
  c.width = 270; c.height = 480;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 270, 480);
  grad.addColorStop(0, '#1e1b4b'); grad.addColorStop(0.55, '#4c1d95'); grad.addColorStop(1, '#0f172a');
  g.fillStyle = grad; g.fillRect(0, 0, 270, 480);
  // abstract "speaker" silhouette so behind-styles read correctly in cards
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.arc(135, 250, 52, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(135, 420, 95, 130, 0, Math.PI, 0); g.fill();
  return c;
}

const SAMPLE_WORDS = [
  { text: 'make', start: 0, end: 0.4, deleted: false },
  { text: 'it', start: 0.4, end: 0.7, deleted: false },
  { text: 'POP', start: 0.7, end: 1.3, deleted: false },
];

function renderCatTabs() {
  $('catTabs').innerHTML = CATEGORIES.map(c =>
    `<button class="cat-tab ${c.id === activeCat ? 'active' : ''}" data-cat="${c.id}">${c.name}${c.ai ? ' <span class="ai">AI</span>' : ''}</button>`
  ).join('');
}
$('catTabs').addEventListener('click', (e) => {
  const t = e.target.closest('.cat-tab');
  if (!t) return;
  activeCat = t.dataset.cat;
  renderStyleGrid();
});

async function renderStyleGrid() {
  renderCatTabs();
  const cat = CATEGORIES.find(c => c.id === activeCat);
  $('catDesc').textContent = cat?.desc || '';
  const grid = $('styleGrid');
  grid.innerHTML = '';
  await document.fonts.ready;
  for (const p of presetsForCategory(activeCat)) {
    const card = document.createElement('div');
    card.className = 'style-card' + (p.id === state.preset.id ? ' selected' : '');
    card.dataset.id = p.id;
    if (p.badge) card.innerHTML += `<span class="badge ${p.badge === 'TRENDING' ? 'trending' : ''}">${p.badge}</span>`;
    const cv = document.createElement('canvas');
    cv.width = 270; cv.height = 480;
    card.appendChild(cv);
    const label = document.createElement('div');
    label.className = 'style-name';
    label.innerHTML = `<span>${p.name}</span><span class="style-tier">${p.tier.toUpperCase()}</span>`;
    card.appendChild(label);
    grid.appendChild(card);
    drawPresetSample(cv, p);
  }
}

function drawPresetSample(cv, preset) {
  const c = cv.getContext('2d');
  const groups = groupWords(SAMPLE_WORDS, preset);
  const sc = document.createElement('canvas');
  sc.width = cv.width; sc.height = cv.height;
  // sample mask: the silhouette region, for behind-styles
  let mask = null;
  if (preset.behind) {
    mask = document.createElement('canvas');
    mask.width = 270; mask.height = 480;
    const m = mask.getContext('2d');
    m.fillStyle = '#fff';
    m.beginPath(); m.arc(135, 250, 52, 0, Math.PI * 2); m.fill();
    m.beginPath(); m.ellipse(135, 420, 95, 130, 0, Math.PI, 0); m.fill();
  }
  drawFrame(c, sampleSource, 0.95, groups, preset, { mask, scratch: sc, speaker: { name: 'Neha Sharma', role: 'Founder' } });
}

$('styleGrid').addEventListener('click', async (e) => {
  const card = e.target.closest('.style-card');
  if (!card) return;
  selectPreset(card.dataset.id);
  document.querySelectorAll('.style-card').forEach(el => el.classList.toggle('selected', el.dataset.id === card.dataset.id));
});

async function selectPreset(id) {
  state.preset = getPreset(id);
  rebuildGroups();
  $('speakerCard').hidden = !state.preset.extra.lowerThird;
  if (state.preset.behind && !maskTracker) {
    maskTracker = new MaskTracker();
    toast('Loading person-segmentation model for behind-the-subject captions…');
    const ok = await maskTracker.init();
    toast(ok ? 'Behind-the-subject captions ready ✓' : 'Segmentation unavailable — captions will render in front.');
  }
}

$('toWordsBtn').addEventListener('click', () => goStep('words'));

// ── Word editor ────────────────────────────────────────────────────────────
function renderWordEditor() {
  const ed = $('wordEditor');
  ed.innerHTML = '';
  state.words.forEach((w, i) => {
    const chip = document.createElement('span');
    chip.className = 'word-chip' + (w.deleted ? ' cut' : '');
    chip.dataset.i = i;
    chip.innerHTML = `<span class="wtext">${escapeHtml(w.text)}</span><span class="x" title="Cut word">✕</span>`;
    ed.appendChild(chip);
  });
  updateWordCount();
}

function updateWordCount() {
  const cut = state.words.filter(w => w.deleted).length;
  $('wordCount').textContent = `${state.words.length - cut} words` + (cut ? ` · ${cut} cut` : '');
}

$('wordEditor').addEventListener('click', (e) => {
  const chip = e.target.closest('.word-chip');
  if (!chip) return;
  const i = +chip.dataset.i;
  const w = state.words[i];
  if (e.target.classList.contains('x')) {
    w.deleted = !w.deleted;
    chip.classList.toggle('cut', w.deleted);
    rebuildGroups();
    updateWordCount();
    return;
  }
  if (chip.querySelector('input')) return;
  // seek preview to this word and open inline edit
  if (video.duration) video.currentTime = Math.max(0, w.start + 0.01);
  const span = chip.querySelector('.wtext');
  const input = document.createElement('input');
  input.value = w.text;
  span.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    const val = input.value.trim();
    if (val) w.text = val; // empty edit = keep original
    renderWordEditor();
    rebuildGroups();
  };
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') commit();
    if (ev.key === 'Escape') renderWordEditor();
  });
  input.addEventListener('blur', commit);
});

$('fillerBtn').addEventListener('click', () => {
  let n = 0;
  const fillers = new Set(CONFIG.fillerWords.map(f => f.toLowerCase()));
  for (const w of state.words) {
    if (!w.deleted && fillers.has(w.text.toLowerCase().replace(/[^a-z']/g, ''))) { w.deleted = true; n++; }
  }
  renderWordEditor();
  rebuildGroups();
  toast(n ? `Cut ${n} filler word${n > 1 ? 's' : ''} ✂` : 'No filler words found — clean take!');
});

$('restoreBtn').addEventListener('click', () => {
  state.words.forEach(w => w.deleted = false);
  renderWordEditor();
  rebuildGroups();
});

$('toPackageBtn').addEventListener('click', () => goStep('package'));

// ── Hooks ──────────────────────────────────────────────────────────────────
function renderHooks() {
  const hooks = suggestHooks(state.words);
  const list = $('hookList');
  list.innerHTML = hooks.length
    ? hooks.map((h, i) => `<button class="hook-item ${i === 0 && !state.hook ? '' : ''}" data-text="${escapeHtml(h.text)}">“${escapeHtml(h.text)}”<span class="score">FROM TRANSCRIPT</span></button>`).join('')
    : '<p class="hint">Not enough transcript to suggest hooks yet.</p>';
  if (!state.hook && hooks.length) { state.hook = hooks[0].text; }
  [...list.children].forEach(el => el.classList?.toggle('selected', el.dataset?.text === state.hook));
}
$('hookList').addEventListener('click', (e) => {
  const item = e.target.closest('.hook-item');
  if (!item) return;
  state.hook = item.dataset.text;
  $('hookCustom').value = '';
  [...$('hookList').children].forEach(el => el.classList?.toggle('selected', el === item));
  drawThumb();
});
$('hookCustom').addEventListener('input', (e) => {
  if (e.target.value.trim()) {
    state.hook = e.target.value.trim();
    [...$('hookList').children].forEach(el => el.classList?.remove('selected'));
    drawThumb();
  }
});

// ── Speaker ────────────────────────────────────────────────────────────────
$('spkName').addEventListener('input', (e) => state.speaker.name = e.target.value);
$('spkRole').addEventListener('input', (e) => state.speaker.role = e.target.value);

// ── Thumbnail ──────────────────────────────────────────────────────────────
const thumbVideo = document.createElement('video');
thumbVideo.muted = true; thumbVideo.playsInline = true; thumbVideo.preload = 'auto';
let thumbReady = false;

function ensureThumbVideo() {
  if (thumbVideo.src !== state.url && state.url) {
    thumbVideo.src = state.url;
    thumbVideo.load();
    thumbReady = false;
    thumbVideo.addEventListener('loadeddata', () => { thumbReady = true; drawThumb(); }, { once: true });
  }
}

$('thumbScrub').addEventListener('input', (e) => {
  if (!video.duration) return;
  state.thumbTime = (e.target.value / 100) * video.duration;
  drawThumb();
});
$('thumbStyle').addEventListener('change', drawThumb);
$('thumbText').addEventListener('input', drawThumb);

function drawThumb() {
  ensureThumbVideo();
  if (!thumbReady) return;
  const seekTo = Math.min(state.thumbTime, (thumbVideo.duration || 1) - 0.05);
  const onSeeked = () => renderThumbTo($('thumbCanvas').getContext('2d'), 270, 480);
  thumbVideo.removeEventListener('seeked', onSeeked);
  thumbVideo.addEventListener('seeked', onSeeked, { once: true });
  thumbVideo.currentTime = Math.max(0.01, seekTo);
}

function thumbTitle() {
  return ($('thumbText').value.trim() || state.hook || 'Watch this').toUpperCase();
}

function renderThumbTo(c, W, H) {
  const styleId = $('thumbStyle').value;
  c.canvas.width = W; c.canvas.height = H;
  drawCover(c, thumbVideo, W, H);

  const title = thumbTitle();
  if (styleId === 'clean') return;

  if (styleId === 'scene') {
    // duotone-ish stylized treatment
    c.save();
    c.globalCompositeOperation = 'color';
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#7c3aed'); g.addColorStop(1, '#0ea5e9');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'overlay';
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 0, W, H);
    c.restore();
  }

  // dim gradient for legibility
  const dim = c.createLinearGradient(0, H * 0.35, 0, H);
  dim.addColorStop(0, 'rgba(0,0,0,0)');
  dim.addColorStop(1, 'rgba(0,0,0,.75)');
  c.fillStyle = dim; c.fillRect(0, 0, W, H);

  const lines = wrapTitle(c, title, W, styleId);
  const styles = {
    bold:      { font: (s) => `400 ${s}px "Archivo Black"`, size: W * 0.13, fill: '#ffffff', stroke: '#000', lh: 1.12 },
    tape:      { font: (s) => `800 ${s}px Montserrat`, size: W * 0.11, fill: '#111', tape: '#ffe600', lh: 1.35 },
    editorial: { font: (s) => `italic 600 ${s}px "Playfair Display"`, size: W * 0.115, fill: '#ffffff', lh: 1.2 },
    scene:     { font: (s) => `400 ${s}px "Archivo Black"`, size: W * 0.125, fill: '#ffe600', stroke: '#000', lh: 1.12 },
  };
  const st = styles[styleId] || styles.bold;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const totalH = lines.length * st.size * st.lh;
  let y = H * 0.78 - totalH / 2 + st.size / 2;
  for (const line of lines) {
    c.font = st.font(st.size);
    if (st.tape) {
      const tw = c.measureText(line).width;
      c.save();
      c.translate(W / 2, y);
      c.rotate(-0.015);
      c.fillStyle = st.tape;
      c.fillRect(-tw / 2 - st.size * 0.25, -st.size * 0.62, tw + st.size * 0.5, st.size * 1.24);
      c.fillStyle = st.fill;
      c.fillText(line, 0, st.size * 0.04);
      c.restore();
    } else {
      if (st.stroke) {
        c.lineJoin = 'round';
        c.strokeStyle = st.stroke;
        c.lineWidth = st.size * 0.14;
        c.strokeText(line, W / 2, y);
      }
      c.fillStyle = st.fill;
      c.fillText(line, W / 2, y);
    }
    y += st.size * st.lh;
  }
  c.textAlign = 'left';
}

function wrapTitle(c, title, W, styleId) {
  const words = title.split(/\s+/).slice(0, 10);
  const lines = [];
  let cur = '';
  c.font = `400 ${W * 0.12}px "Archivo Black"`;
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (c.measureText(test).width > W * 0.85 && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

$('thumbDownload').addEventListener('click', () => {
  if (!thumbReady) return toast('Load a clip first');
  const big = document.createElement('canvas');
  renderThumbTo(big.getContext('2d'), 1080, 1920);
  big.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'popshot-thumbnail.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
  toast('Thumbnail saved ⬇');
});

$('toExportBtn').addEventListener('click', () => goStep('export'));

// ── Preview loop ───────────────────────────────────────────────────────────
function setAspect(aspect) {
  state.aspect = aspect;
  const dims = { '9:16': [540, 960], '1:1': [720, 720], '16:9': [960, 540] }[aspect];
  canvas.width = dims[0]; canvas.height = dims[1];
  scratch.width = dims[0]; scratch.height = dims[1];
  const frame = $('previewFrame');
  frame.classList.toggle('wide', aspect === '16:9');
  frame.classList.toggle('square', aspect === '1:1');
}
$('aspectSel').addEventListener('change', (e) => setAspect(e.target.value));
setAspect('9:16');

function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
function updateTimeLabel() {
  $('timeLabel').textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration || 0)}`;
}

$('playBtn').addEventListener('click', () => {
  if (!video.src) return;
  if (video.paused) { video.play(); $('playBtn').textContent = '❚❚'; }
  else { video.pause(); $('playBtn').textContent = '▶'; }
});
video.addEventListener('ended', () => { $('playBtn').textContent = '▶'; });
$('scrubber').addEventListener('input', (e) => {
  if (video.duration) video.currentTime = +e.target.value;
});

let lastChipIdx = -1;
function previewLoop() {
  requestAnimationFrame(previewLoop);
  if (!video.src || video.readyState < 2 || exporting) return;
  const t = video.currentTime;
  if (!video.paused) { $('scrubber').value = t; }
  updateTimeLabel();

  let mask = null;
  if (state.preset.behind && maskTracker?.ready) {
    mask = maskTracker.update(video, performance.now());
  }
  drawFrame(ctx, video, t, state.groups, state.preset, { mask, scratch, speaker: state.speaker });

  // highlight the word being spoken in the transcript editor
  if (state.step === 'words' && !video.paused) {
    const idx = state.words.findIndex(w => !w.deleted && t >= w.start && t < w.end);
    if (idx !== lastChipIdx) {
      lastChipIdx = idx;
      document.querySelectorAll('.word-chip.playing').forEach(el => el.classList.remove('playing'));
      if (idx >= 0) {
        const chip = document.querySelector(`.word-chip[data-i="${idx}"]`);
        if (chip) { chip.classList.add('playing'); chip.scrollIntoView({ block: 'nearest' }); }
      }
    }
  }
}
requestAnimationFrame(previewLoop);

// ── Export ─────────────────────────────────────────────────────────────────
async function renderExportMeta() {
  const size = CONFIG.export.sizes[state.aspect];
  const mime = await findWorkingMime(size.w, size.h);
  const fmt = mime.startsWith('video/mp4') ? 'MP4 · H.264' : 'WebM';
  $('exportMeta').innerHTML =
    `RESOLUTION&nbsp; ${size.w} × ${size.h}<br>` +
    `FORMAT&nbsp;&nbsp;&nbsp;&nbsp; ${fmt} · ${CONFIG.export.fps} fps<br>` +
    `STYLE&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${state.preset.name}<br>` +
    `DURATION&nbsp;&nbsp; ${fmtTime(video.duration || 0)}`;
  $('exportNote').textContent = mime.startsWith('video/mp4')
    ? ''
    : 'This browser records WebM (plays everywhere modern; convert to MP4 with ffmpeg if a platform requires it). Chrome on macOS exports MP4 directly.';
}

let abortCtl = null;
$('exportBtn').addEventListener('click', async () => {
  if (!video.src || !state.groups.length) return toast('Nothing to export yet');
  if (exporting) return;
  exporting = true;
  abortCtl = new AbortController();
  $('exportBtn').disabled = true;
  $('cancelExportBtn').hidden = false;
  $('exportProgress').hidden = false;
  $('exportDone').hidden = true;
  try {
    if (state.preset.behind && !maskTracker) {
      maskTracker = new MaskTracker();
      await maskTracker.init();
    }
    const { blob, ext } = await exportVideo({
      video,
      groups: state.groups,
      preset: state.preset,
      aspect: state.aspect,
      maskTracker,
      speaker: state.speaker,
      signal: abortCtl.signal,
      onProgress: (p) => {
        $('exportBar').style.width = (p * 100).toFixed(1) + '%';
        $('exportMsg').textContent = `Rendering… ${(p * 100).toFixed(0)}%  (plays through the clip once)`;
      },
    });
    const url = URL.createObjectURL(blob);
    const link = $('downloadLink');
    link.href = url;
    link.download = `popshot-short.${ext}`;
    $('exportDoneMsg').textContent = `${(blob.size / 1e6).toFixed(1)} MB · ${state.preset.name} · ${state.aspect}` + (state.hook ? ` · hook: “${state.hook}”` : '');
    $('exportDone').hidden = false;
    link.click();
    toast('Export complete ✅');
  } catch (err) {
    if (err.name !== 'AbortError') { console.error(err); toast('Export failed: ' + err.message); }
    else toast('Export cancelled');
  } finally {
    exporting = false;
    $('exportBtn').disabled = false;
    $('cancelExportBtn').hidden = true;
    $('exportProgress').hidden = true;
  }
});
$('cancelExportBtn').addEventListener('click', () => abortCtl?.abort());

// ── Utils ──────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
