// ---------------------------------------------------------------------------
// Popshot — editor app (studio layout)
// Tool rail + panels on the left, direct-manipulation canvas in the middle,
// timeline with captions + b-roll tracks at the bottom. One state object;
// the preview re-renders only when something changed (or while playing).
// ---------------------------------------------------------------------------

import { CONFIG } from './config.js';
import { CATEGORIES, presetsForCategory, getPreset, FONT_FAMILIES } from './presets.js';
import { groupWords, drawFrame } from './engine.js';
import { transcribeFile, timingsFromText, localAsrModel } from './transcribe.js';
import { suggestHooks } from './hooks.js';
import { exportVideo, findWorkingMime } from './exporter.js';
import { MaskTracker } from './segmenter.js';
import { takeFile } from './handoff.js';
import { Timeline } from './timeline.js';
import { renderThumb } from './thumbs.js';
import { romanise, hasDevanagari } from './translit.js';
import { markKeywords } from './keywords.js';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  file: null,
  url: null,
  words: [],          // [{text, start, end, deleted, orig?}]
  groups: [],
  broll: [],          // [{id, start, dur, kind, el, url, name}]
  preset: getPreset('beast-bold'),
  eff: null,
  overrides: {},      // { size, posX, posY, maxWords, caseMode, text, active }
  styleVersion: 0,
  aspect: '9:16',
  hook: '',
  hookBurn: false,
  autoZoom: false,
  autoEmoji: false,
  showSafe: false,
  speakers: false,
  speaker: { name: '', role: '' },
  thumbTime: 1.0,
  thumbStyle: 'bold',
  selectedWord: -1,
  selection: null,    // 'caption' | null — canvas selection
  tool: 'transcript',
};

const $ = (id) => document.getElementById(id);
const video = $('srcVideo');
const canvas = $('previewCanvas');
const ctx = canvas.getContext('2d');
const scratch = document.createElement('canvas');
let maskTracker = null;
let exporting = false;
let needsDraw = true;
let timeline = null;
let lastBounds = null;      // front caption block bounds from the last engine draw
let lastHeroBounds = null;  // behind-hero block bounds (split-layer styles)

const markDirty = () => { needsDraw = true; timeline?.markDirty(); };

// ── Fonts ──────────────────────────────────────────────────────────────────
$('gfonts').href = 'https://fonts.googleapis.com/css2?' +
  FONT_FAMILIES.map(f => 'family=' + f.replace(/ /g, '+')).join('&') + '&display=swap';
// once webfonts land, cached layouts measured with fallback fonts are stale —
// bump the layout version and repaint everything font-dependent
document.fonts.ready.then(() => setTimeout(() => {
  state.styleVersion++;
  markDirty();
  if (state.tool === 'templates') renderStyleGrid();
}, 300));

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, ms = 3500) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ── Undo / redo ────────────────────────────────────────────────────────────
const undoStack = [], redoStack = [];
let pendingSnap = null;
const snapshot = () => JSON.stringify({ words: state.words, overrides: state.overrides });
function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  syncUndoButtons();
}
function beginPending() { pendingSnap = snapshot(); }
function commitPending() {
  if (pendingSnap != null) {
    undoStack.push(pendingSnap);
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    pendingSnap = null;
    syncUndoButtons();
  }
}
function applySnap(snap) {
  const s = JSON.parse(snap);
  state.words = s.words;
  state.overrides = s.overrides;
  buildEff();
  rebuildGroups();
  renderTranscript();
  syncFineTune();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  applySnap(undoStack.pop());
  syncUndoButtons();
  toast('Undone ↶', 1200);
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  applySnap(redoStack.pop());
  syncUndoButtons();
  toast('Redone ↷', 1200);
}
function syncUndoButtons() {
  $('undoBtn').disabled = !undoStack.length;
  $('redoBtn').disabled = !redoStack.length;
}
$('undoBtn').addEventListener('click', undo);
$('redoBtn').addEventListener('click', redo);

// ── Effective preset ───────────────────────────────────────────────────────
function buildEff() {
  const p = state.preset, o = state.overrides;
  const eff = {
    ...p,
    font: { ...p.font },
    accentFont: p.accentFont ? { ...p.accentFont } : null,
    grouping: { ...p.grouping },
    colors: { ...p.colors },
    pos: { ...p.pos },
    heroPos: p.heroPos ? { ...p.heroPos } : { y: 0.18 },
    anim: { ...p.anim },
    extra: { ...p.extra },
  };
  if (o.size) { eff.font.size *= o.size; if (eff.accentFont) eff.accentFont.size *= o.size; }
  if (o.posY != null) eff.pos.y = o.posY;
  if (o.posX != null) eff.pos.x = o.posX;
  if (o.heroPosY != null) { eff.heroPos.y = o.heroPosY; eff.heroPos.auto = false; } // user pinned it — stop auto-placement
  if (o.heroPosX != null) eff.heroPos.x = o.heroPosX;
  if (o.maxWords) eff.grouping.maxWords = o.maxWords;
  if (o.caseMode !== undefined && o.caseMode !== null) {
    const t = o.caseMode === 'none' ? null : o.caseMode;
    eff.font.transform = t;
    if (eff.accentFont) eff.accentFont.transform = t;
  }
  if (o.text) eff.colors.text = o.text;
  if (o.active) { eff.colors.active = o.active; if (p.colors.accent) eff.colors.accent = o.active; }
  if (state.autoEmoji) eff.extra.autoEmoji = true;
  state.styleVersion++;
  state.eff = eff;
}
buildEff();

function rebuildGroups() {
  // re-pick transcript keywords whenever the words change — split styles put
  // exactly these (and nothing else) behind the speaker
  markKeywords(state.words, video.duration || 0);
  state.groups = groupWords(state.words, state.eff);
  buildZoomPlan();
  markDirty();
}

// ── Auto-zoom ──────────────────────────────────────────────────────────────
// Punch-ins where an editor would put them: on keywords, and at the start of
// a sentence that follows a real pause. Spaced out and capped — constant
// zooming reads as cheap, a few well-placed pushes read as energy.
let zoomPlan = [];
function buildZoomPlan() {
  const live = state.words.filter(w => !w.deleted);
  const candidates = [];
  live.forEach((w, i) => {
    const gap = i === 0 ? Infinity : w.start - live[i - 1].end;
    const sentenceStart = i === 0 || gap >= 0.5 || /[.!?]$/.test(live[i - 1]?.text ?? '');
    if (w.key) candidates.push({ at: w.start, weight: 2 });
    else if (sentenceStart) candidates.push({ at: w.start, weight: 1 });
  });
  const plan = [];
  for (const c of candidates.sort((a, b) => b.weight - a.weight || a.at - b.at)) {
    if (plan.some(z => Math.abs(z.start - c.at) < 3.5)) continue;
    plan.push({ start: Math.max(0, c.at - 0.12), end: c.at + 1.6, amount: c.weight === 2 ? 0.12 : 0.08 });
    if (plan.length >= 12) break;
  }
  zoomPlan = plan.sort((a, b) => a.start - b.start);
}
function zoomAt(t) {
  if (!state.autoZoom) return 1;
  const RAMP = 0.5;
  let z = 1;
  for (const w of zoomPlan) {
    if (t < w.start || t > w.end) continue;
    z += w.amount * Math.min(1, (t - w.start) / RAMP) * Math.min(1, (w.end - t) / RAMP);
  }
  return z;
}

// ── Tool rail ──────────────────────────────────────────────────────────────
const TOOLS = ['templates', 'customize', 'transcript', 'broll', 'thumbnail', 'title', 'settings'];
function setTool(tool) {
  state.tool = tool;
  for (const t of TOOLS) $('tp-' + t).hidden = t !== tool;
  document.querySelectorAll('.rail-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  if (tool === 'templates') renderStyleGrid();
  if (tool === 'transcript') renderTranscript();
  if (tool === 'thumbnail') scheduleConcepts();
  if (tool === 'title') { renderHooks(); renderHookReport(); }
  if (tool === 'broll') renderBrollList();
}
$('rail').addEventListener('click', (e) => {
  const btn = e.target.closest('.rail-btn');
  if (btn) setTool(btn.dataset.tool);
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
    $('transcribeCard').hidden = false;
    $('scrubber').max = video.duration;
    $('timeDur').textContent = fmtTime(video.duration);
    $('clipInfo').textContent = `${file.name} · ${fmtTime(video.duration)} · ${video.videoWidth}×${video.videoHeight}`;
    state.thumbTime = Math.min(video.duration * 0.12, video.duration - 0.05);
    if (video.duration > 310) toast('Heads up: clips under 5 minutes work best.');
    video.currentTime = 0.05;
    markDirty();
    toast(`Loaded ${file.name} · ${fmtTime(video.duration)}`);
    if (!$('projName').dataset.touched) $('projName').value = file.name.replace(/\.\w+$/, '').slice(0, 24);
  }, { once: true });
}
video.addEventListener('seeked', markDirty);
$('projName').addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
$('replaceClipBtn').addEventListener('click', () => $('fileInput').click());

// bundled + local sample clips (samples are optional and never committed)
async function initSamples() {
  const row = $('sampleRow');
  for (const s of [{ url: 'assets/samples/review.mp4', name: '▶ Review (Hinglish)' }, { url: 'assets/samples/camera.mp4', name: '▶ Camera take' }]) {
    try {
      const head = await fetch(s.url, { method: 'HEAD' });
      if (head.ok) {
        const b = document.createElement('button');
        b.className = 'btn btn-small btn-plain';
        b.dataset.sample = s.url;
        b.textContent = s.name;
        row.appendChild(b);
      }
    } catch { /* not present */ }
  }
}
initSamples();
$('sampleRow').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-sample]');
  if (!btn) return;
  try {
    btn.disabled = true;
    const res = await fetch(btn.dataset.sample);
    if (!res.ok) throw new Error('missing');
    const blob = await res.blob();
    loadFile(new File([blob], btn.dataset.sample.split('/').pop(), { type: 'video/mp4' }));
  } catch {
    toast('Sample clip not found — drop in your own video instead.');
  } finally {
    btn.disabled = false;
  }
});

// offer the machine's own whisper.cpp model when the dev server exposes it
localAsrModel().then(name => {
  if (!name) return;
  const opt = document.createElement('option');
  opt.value = 'local';
  opt.textContent = `Local · ${name} (this machine, fastest)`;
  $('modelSel').prepend(opt);
  $('modelSel').value = 'local';
}).catch(() => {});

// landing-page handoff + style preselect
takeFile().then(f => { if (f && !state.file) loadFile(f); }).catch(() => {});
try {
  const pre = sessionStorage.getItem('popshot-style');
  if (pre) { sessionStorage.removeItem('popshot-style'); selectPreset(pre); }
} catch { /* private mode */ }

// ── Transcription ──────────────────────────────────────────────────────────
async function runTranscription({ silent = false } = {}) {
  if (!state.file) { toast('Upload a clip first'); return false; }
  const prog = $('transcribeProgress'), msg = $('progressMsg');
  if (!silent) prog.hidden = false;
  $('transcribeBtn').disabled = true;
  try {
    let words = await transcribeFile(state.file, {
      model: $('modelSel').value,
      language: $('langSel').value,
      onProgress: (m) => { if (silent) toast(m, 2500); else msg.textContent = m; },
    });
    if (!words.length) {
      toast('No speech detected — you can paste the transcript manually.');
      $('manualBox').hidden = false;
      return false;
    }
    if ($('scriptSel').value === 'roman') {
      words = words.map(w => hasDevanagari(w.text) ? { ...w, orig: w.text, text: romanise(w.text) } : w);
    }
    state.words = words;
    afterTranscript();
    return true;
  } catch (err) {
    console.error(err);
    toast('Transcription failed (' + err.message + '). Paste the transcript manually instead.');
    $('manualBox').hidden = false;
    return false;
  } finally {
    prog.hidden = true;
    $('transcribeBtn').disabled = false;
  }
}
$('transcribeBtn').addEventListener('click', () => runTranscription());
$('retranscribeBtn').addEventListener('click', async () => {
  if (!state.words.length) return runTranscription();
  pushUndo();
  toast('Re-transcribing…');
  await runTranscription({ silent: true });
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
  $('stageEmpty').hidden = true;
  initTimeline();
  renderTranscript();
  setTool('transcript');
  toast(`Transcribed ${state.words.length} words ✓`);
}

// language & writing system
$('langHide').addEventListener('click', () => {
  const body = $('langBody');
  body.hidden = !body.hidden;
  $('langHide').textContent = body.hidden ? 'Show' : 'Hide';
});
$('scriptSel').addEventListener('change', (e) => {
  if (!state.words.length) return;
  pushUndo();
  if (e.target.value === 'roman') {
    let n = 0;
    for (const w of state.words) {
      if (hasDevanagari(w.text)) { w.orig = w.text; w.text = romanise(w.text); n++; }
    }
    toast(n ? `Romanised ${n} words — kya haal ✓` : 'Nothing to romanise in this transcript.');
  } else {
    let n = 0;
    for (const w of state.words) if (w.orig) { w.text = w.orig; delete w.orig; n++; }
    toast(n ? 'Restored original script ✓' : 'Already in the original script.');
  }
  rebuildGroups();
  renderTranscript();
});

// speakers (pause-based heuristic — labels alternate on gaps)
$('speakersToggle').addEventListener('change', (e) => {
  state.speakers = e.target.checked;
  renderTranscript();
  toast(state.speakers ? 'Speaker labels on (from pauses in the clip)' : 'Speaker labels off');
});

// ── Transcript panel ───────────────────────────────────────────────────────
const msel = new Set();
document.querySelectorAll('.tp-tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tp-tab').forEach(t => t.classList.toggle('active', t === tab));
  $('ttab-subtitles').hidden = tab.dataset.ttab !== 'subtitles';
  $('ttab-script').hidden = tab.dataset.ttab !== 'script';
  if (tab.dataset.ttab === 'script') renderScript();
}));

function speakerFor(gi) {
  // alternate the label whenever the silence between caption lines exceeds 1s
  let spk = 0;
  for (let i = 1; i <= gi; i++) {
    if (state.groups[i].start - state.groups[i - 1].end > 1.0) spk = 1 - spk;
  }
  return 'S' + (spk + 1);
}

function renderTranscript() {
  const box = $('tpLines');
  box.innerHTML = '';
  // groups only contain live words; walk the full word list so cut words stay
  // visible (struck through, restorable) on the line they belong to
  const wordToGroup = new Map();
  state.groups.forEach((g, gi) => g.words.forEach(w => wordToGroup.set(w, gi)));
  const lines = state.groups.map(g => ({ start: g.start, words: [] }));
  if (!lines.length && state.words.length) lines.push({ start: state.words[0].start, words: [] });
  let cur = 0;
  for (const w of state.words) {
    if (wordToGroup.has(w)) cur = wordToGroup.get(w);
    lines[Math.min(cur, lines.length - 1)]?.words.push(w);
  }
  lines.forEach((lineData, gi) => {
    const line = document.createElement('div');
    line.className = 'tp-line';
    line.dataset.gi = gi;
    const time = document.createElement('span');
    time.className = 'tp-line-time';
    time.textContent = fmtTime(lineData.start);
    line.appendChild(time);
    if (state.speakers && state.groups[gi]) {
      const spk = document.createElement('span');
      spk.className = 'tp-line-spk';
      spk.textContent = speakerFor(gi);
      line.appendChild(spk);
    }
    const wordsEl = document.createElement('div');
    wordsEl.className = 'tp-line-words';
    for (const w of lineData.words) {
      const i = state.words.indexOf(w);
      const el = document.createElement('span');
      el.className = 'tp-word' + (w.deleted ? ' cut' : '') + (msel.has(i) ? ' msel' : '');
      el.dataset.i = i;
      el.innerHTML = `<span class="wtext">${escapeHtml(w.text)}</span><span class="x" title="${w.deleted ? 'Restore word' : 'Cut word'}">${w.deleted ? '↺' : '✕'}</span>`;
      wordsEl.appendChild(el);
    }
    line.appendChild(wordsEl);
    box.appendChild(line);
  });
  updateWordCount();
}

function updateWordCount() {
  const cut = state.words.filter(w => w.deleted).length;
  $('wordCount').textContent = `${state.words.length - cut} words` + (cut ? ` · ${cut} cut` : '');
}

$('tpLines').addEventListener('click', (e) => {
  const wEl = e.target.closest('.tp-word');
  if (!wEl) return;
  const i = +wEl.dataset.i;
  const w = state.words[i];
  state.selectedWord = i;
  updateSelLabel();

  if ($('multiSelect').checked && !e.target.classList.contains('x')) {
    if (msel.has(i)) msel.delete(i); else msel.add(i);
    wEl.classList.toggle('msel', msel.has(i));
    $('multiActions').hidden = msel.size === 0;
    return;
  }
  if (e.target.classList.contains('x')) {
    pushUndo();
    w.deleted = !w.deleted;
    rebuildGroups();
    renderTranscript();
    return;
  }
  if (wEl.querySelector('input')) return;
  if (video.duration) video.currentTime = Math.max(0, w.start + 0.01);
  const span = wEl.querySelector('.wtext');
  const input = document.createElement('input');
  input.value = w.text;
  span.replaceWith(input);
  input.focus();
  input.select();
  let cancelled = false;
  const commit = () => {
    if (cancelled) return;
    cancelled = true; // a commit also disarms the blur that follows DOM removal
    const val = input.value.trim();
    if (val && val !== w.text) { pushUndo(); w.text = val; delete w.orig; }
    rebuildGroups();
    renderTranscript();
  };
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') commit();
    if (ev.key === 'Escape') { cancelled = true; renderTranscript(); }
    ev.stopPropagation();
  });
  input.addEventListener('blur', commit);
});

$('multiSelect').addEventListener('change', (e) => {
  if (!e.target.checked) { msel.clear(); $('multiActions').hidden = true; renderTranscript(); }
});
$('cutSelBtn').addEventListener('click', () => {
  if (!msel.size) return;
  pushUndo();
  for (const i of msel) state.words[i].deleted = true;
  toast(`Cut ${msel.size} words ✂`);
  msel.clear();
  $('multiActions').hidden = true;
  rebuildGroups();
  renderTranscript();
});
$('clearSelBtn').addEventListener('click', () => {
  msel.clear();
  $('multiActions').hidden = true;
  renderTranscript();
});

$('fillerBtn').addEventListener('click', () => {
  const fillers = new Set(CONFIG.fillerWords.map(f => f.toLowerCase()));
  const hits = state.words.filter(w => !w.deleted && fillers.has(w.text.toLowerCase().replace(/[^a-z']/g, '')));
  if (!hits.length) return toast('No filler words found — clean take!');
  pushUndo();
  hits.forEach(w => w.deleted = true);
  rebuildGroups();
  renderTranscript();
  toast(`Cut ${hits.length} filler word${hits.length > 1 ? 's' : ''} ✂`);
});
$('restoreBtn').addEventListener('click', () => {
  pushUndo();
  state.words.forEach(w => w.deleted = false);
  rebuildGroups();
  renderTranscript();
});

function renderScript() {
  $('scriptView').innerHTML = state.words
    .map(w => `<span class="${w.deleted ? 'cut' : ''}">${escapeHtml(w.text)}</span>`)
    .join(' ');
}
$('copyScriptBtn').addEventListener('click', async () => {
  const text = state.words.filter(w => !w.deleted).map(w => w.text).join(' ');
  try { await navigator.clipboard.writeText(text); toast('Script copied ⧉'); }
  catch { toast('Copy blocked — select the text manually.'); }
});

// ── Timeline ───────────────────────────────────────────────────────────────
function initTimeline() {
  if (timeline) { timeline.markDirty(); return; }
  timeline = new Timeline($('timelineCanvas'), {
    getWords: () => state.words,
    getGroups: () => state.groups,
    getBroll: () => state.broll,
    getDuration: () => video.duration || 0,
    getTime: () => video.currentTime || 0,
    seek: (t) => { if (exporting) return; video.currentTime = t; markDirty(); },
    onDragStart: () => beginPending(),
    onWordsChanged: () => { commitPending(); rebuildGroups(); updateSelLabel(); },
    onBrollChanged: () => { pendingSnap = null; renderBrollList(); markDirty(); },
    onSelect: (kind, i) => {
      if (kind === 'word') { state.selectedWord = i; updateSelLabel(); }
      else { state.selectedWord = -1; updateSelLabel(); }
    },
  });
  // hook drag-start into pointerdown via the api callback
  const origDown = timeline._down.bind(timeline);
  timeline._down = (e) => { origDown(e); if (timeline.drag && timeline.drag.type !== 'seek' && timeline.drag.kind === 'word') beginPending(); };
}
function tlZoomLabel() { $('tlZoomVal').textContent = Math.round(timeline.zoom * 100) + '%'; }
$('tlZoomIn').addEventListener('click', () => { timeline.setZoom(timeline.zoom * 2); tlZoomLabel(); });
$('tlZoomOut').addEventListener('click', () => { timeline.setZoom(timeline.zoom / 2); tlZoomLabel(); });
$('tlFit').addEventListener('click', () => { timeline.setZoom(1); tlZoomLabel(); });
document.querySelectorAll('.tl-mode').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tl-mode').forEach(b => b.classList.toggle('active', b === btn));
  timeline?.setMode(btn.dataset.mode);
}));

function updateSelLabel() {
  const i = state.selectedWord;
  const w = state.words[i];
  $('tlSel').textContent = w ? `“${w.text}” ${w.start.toFixed(2)}–${w.end.toFixed(2)}s` : '';
  timeline?.setSelected(i);
}

// keyboard
document.addEventListener('keydown', (e) => {
  if (exporting) return;   // never touch playback or words mid-recording
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
  if (e.key.startsWith('Arrow')) {
    const step = e.shiftKey ? 0.03 : 0.01;
    const moved = nudgeSelection(
      e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
      e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0,
    );
    if (moved) { e.preventDefault(); return; }
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (timeline?.selectedBroll >= 0) { removeBroll(timeline.selectedBroll); return; }
    if (state.selectedWord >= 0) {
      const w = state.words[state.selectedWord];
      if (!w) return;
      pushUndo();
      w.deleted = !w.deleted;
      rebuildGroups();
      renderTranscript();
      updateSelLabel();
      toast(w.deleted ? `Cut “${w.text}”` : `Restored “${w.text}”`);
    }
  }
});

// ── Templates ──────────────────────────────────────────────────────────────
let activeCat = 'popular';
const sampleSource = makeSampleSource();

// Live previews: once a clip is loaded, template cards render on an actual
// frame of the user's video with their own first words — like the product's
// gallery — falling back to the synthetic sample before upload.
const templateFrame = document.createElement('canvas');
templateFrame.width = 270; templateFrame.height = 480;
let templateFrameReady = false;
let templateFrameVersion = 0;
let lastCaptureAt = 0;
const cardCache = new Map(); // `${preset.id}|${frameVersion}|${wordsSig}` -> canvas

function captureTemplateFrame() {
  if (!video.src || video.readyState < 2) return;
  // recapturing on every seek re-rendered the whole grid each time — throttle
  // hard: a fresh frame at most every 5s, and only while templates are open
  const now = performance.now();
  if (templateFrameReady && (now - lastCaptureAt < 5000 || state.tool !== 'templates')) return;
  lastCaptureAt = now;
  drawCoverInto(templateFrame, video);
  templateFrameReady = true;
  templateFrameVersion++;
  if (state.tool === 'templates') renderStyleGrid();
}
function drawCoverInto(cv, source) {
  const c = cv.getContext('2d');
  const sw = source.videoWidth, sh = source.videoHeight;
  if (!sw) return;
  const s = Math.max(cv.width / sw, cv.height / sh);
  c.drawImage(source, (cv.width - sw * s) / 2, (cv.height - sh * s) / 2, sw * s, sh * s);
}
// capture whenever a seek settles on a fresh frame (cheap, replaces the still)
video.addEventListener('seeked', () => { if (!exporting) captureTemplateFrame(); });

function sampleWordsForCards() {
  const live = state.words.filter(w => !w.deleted).slice(0, 4);
  if (live.length < 3) return SAMPLE_WORDS;
  const t0 = live[0].start;
  return live.map(w => ({ text: w.text.replace(/[.,!?"]+$/, ''), start: w.start - t0, end: w.end - t0, deleted: false }));
}

// "For you": recent picks + a few related styles from the same categories
const RECENTS_KEY = 'popshot-recent-styles';
function getRecents() {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch { return []; }
}
function rememberStyle(id) {
  try {
    const r = [id, ...getRecents().filter(x => x !== id)].slice(0, 6);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(r));
  } catch { /* private mode */ }
}
function forYouPresets() {
  const recents = getRecents().map(getPreset).filter(Boolean);
  const cats = [...new Set(recents.map(p => p.category))];
  const related = cats.flatMap(c => presetsForCategory(c)).filter(p => !recents.some(r => r.id === p.id)).slice(0, 4);
  return [...recents, ...related];
}

function makeSampleSource() {
  const c = document.createElement('canvas');
  c.width = 270; c.height = 480;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 270, 480);
  grad.addColorStop(0, '#1e1b4b'); grad.addColorStop(0.55, '#4c1d95'); grad.addColorStop(1, '#0f172a');
  g.fillStyle = grad; g.fillRect(0, 0, 270, 480);
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
  const tabs = [{ id: 'foryou', name: 'For you', ai: false }, ...CATEGORIES];
  $('catTabs').innerHTML = tabs.map(c =>
    `<button class="cat-tab ${c.id === activeCat ? 'active' : ''}" data-cat="${c.id}">${c.name}${c.ai ? ' <span class="ai">AI</span>' : ''}</button>`
  ).join('');
}
$('catTabs').addEventListener('click', (e) => {
  const t = e.target.closest('.cat-tab');
  if (!t) return;
  activeCat = t.dataset.cat;
  renderStyleGrid();
});

let styleGridSeq = 0;
async function renderStyleGrid() {
  const token = ++styleGridSeq;
  renderCatTabs();
  const cat = activeCat === 'foryou'
    ? { desc: 'Your recent picks, plus a few related styles.' }
    : CATEGORIES.find(c => c.id === activeCat);
  $('catDesc').textContent = cat?.desc || '';
  const grid = $('styleGrid');
  grid.innerHTML = '';
  await document.fonts.ready;
  if (token !== styleGridSeq) return;
  const list = activeCat === 'foryou' ? forYouPresets() : presetsForCategory(activeCat);
  if (!list.length) { grid.innerHTML = '<p class="tp-hint">Pick a few styles and they will show up here.</p>'; return; }
  const pending = [];
  for (const p of list) {
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
    // cached bitmaps blit instantly; misses render in small rAF batches so
    // opening the panel or switching tabs never freezes the UI
    const key = `${p.id}|f${templateFrameVersion}`;
    const cached = cardCache.get(key);
    if (cached) cv.getContext('2d').drawImage(cached, 0, 0);
    else pending.push({ cv, p, key });
  }
  const renderChunk = () => {
    if (token !== styleGridSeq) return;
    for (const job of pending.splice(0, 3)) {
      drawPresetSample(job.cv, job.p);
      const copy = document.createElement('canvas');
      copy.width = 270; copy.height = 480;
      copy.getContext('2d').drawImage(job.cv, 0, 0);
      cardCache.set(job.key, copy);
      if (cardCache.size > 120) cardCache.delete(cardCache.keys().next().value);
    }
    if (pending.length) requestAnimationFrame(renderChunk);
  };
  requestAnimationFrame(renderChunk); // let the tab switch paint before any card renders
}

function syntheticMask() {
  const mask = document.createElement('canvas');
  mask.width = 270; mask.height = 480;
  const m = mask.getContext('2d');
  m.fillStyle = '#fff';
  m.beginPath(); m.arc(135, 250, 52, 0, Math.PI * 2); m.fill();
  m.beginPath(); m.ellipse(135, 420, 95, 130, 0, Math.PI, 0); m.fill();
  return mask;
}

function drawPresetSample(cv, preset) {
  const c = cv.getContext('2d');
  const useReal = templateFrameReady;
  const words = useReal ? sampleWordsForCards() : SAMPLE_WORDS;
  const groups = groupWords(words, preset);
  const sc = document.createElement('canvas');
  sc.width = cv.width; sc.height = cv.height;
  let mask = null;
  if (preset.behind) {
    // prefer the segmenter's latest real mask; fall back to the silhouette
    mask = (useReal && maskTracker?.ready && maskTracker._hasMask) ? maskTracker.canvas : syntheticMask();
  }
  const source = useReal ? templateFrame : sampleSource;
  const t = Math.min(0.95, (groups[0]?.end ?? 1) - 0.05);
  drawFrame(c, source, t, groups, preset, { mask, scratch: sc, speaker: { name: 'Neha Sharma', role: 'Founder' } });
}

$('styleGrid').addEventListener('click', (e) => {
  const card = e.target.closest('.style-card');
  if (!card) return;
  selectPreset(card.dataset.id);
  document.querySelectorAll('.style-card').forEach(el => el.classList.toggle('selected', el.dataset.id === card.dataset.id));
});

async function selectPreset(id) {
  state.preset = getPreset(id);
  state.overrides = {};
  buildEff();
  rebuildGroups();
  syncFineTune();
  rememberStyle(state.preset.id);
  $('speakerCard').hidden = !state.preset.extra.lowerThird;
  $('ftHeroRow').hidden = !state.preset.extra.splitHero;
  if (state.words.length) {
    toast(state.preset.extra.splitHero
      ? 'Drag any text to move it · pull a corner to resize · the big word places itself around you'
      : 'Drag the caption to move it · pull a corner to resize', 4500);
  }
  if (state.preset.behind && !maskTracker) {
    maskTracker = new MaskTracker();
    toast('Loading person-segmentation model for behind-the-subject captions…');
    const ok = await maskTracker.init();
    toast(ok ? 'Behind-the-subject captions ready ✓' : 'Segmentation unavailable — captions will render in front.');
    markDirty();
  }
}

// ── Customize ──────────────────────────────────────────────────────────────
function toHex(color) {
  if (/^#([0-9a-f]{6})$/i.test(color)) return color;
  const m = /^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/.exec(color || '');
  if (m) return '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
  return null;
}
function syncFineTune() {
  const p = state.preset, o = state.overrides;
  $('ftStyleName').textContent = '· ' + p.name;
  $('ftSize').value = Math.round((o.size || 1) * 100);
  $('ftSizeVal').textContent = Math.round((o.size || 1) * 100) + '%';
  $('ftPos').value = Math.round((o.posY ?? p.pos.y) * 100);
  $('ftPosVal').textContent = o.posY != null ? Math.round(o.posY * 100) + '%' : 'auto';
  $('ftHero').value = Math.round((o.heroPosY ?? p.heroPos?.y ?? 0.18) * 100);
  $('ftHeroVal').textContent = o.heroPosY != null ? Math.round(o.heroPosY * 100) + '%' : 'auto';
  $('ftWords').value = o.maxWords || p.grouping.maxWords;
  $('ftWordsVal').textContent = o.maxWords || 'auto';
  $('ftCase').value = o.caseMode ?? '';
  $('ftText').value = o.text || toHex(p.colors.text) || '#ffffff';
  $('ftActive').value = o.active || toHex(p.colors.active) || '#ffe600';
}
function applyFineTune() { buildEff(); rebuildGroups(); renderTranscript(); }

$('ftSize').addEventListener('input', (e) => {
  state.overrides.size = e.target.value / 100;
  $('ftSizeVal').textContent = e.target.value + '%';
  applyFineTune();
});
$('ftPos').addEventListener('input', (e) => {
  state.overrides.posY = e.target.value / 100;
  $('ftPosVal').textContent = e.target.value + '%';
  applyFineTune();
});
$('ftHero').addEventListener('input', (e) => {
  state.overrides.heroPosY = e.target.value / 100;
  $('ftHeroVal').textContent = e.target.value + '%';
  applyFineTune();
});
$('ftWords').addEventListener('input', (e) => {
  state.overrides.maxWords = +e.target.value;
  $('ftWordsVal').textContent = e.target.value;
  applyFineTune();
});
$('ftCase').addEventListener('change', (e) => {
  if (e.target.value === '') delete state.overrides.caseMode;
  else state.overrides.caseMode = e.target.value;
  applyFineTune();
});
$('ftText').addEventListener('input', (e) => { state.overrides.text = e.target.value; applyFineTune(); });
$('ftActive').addEventListener('input', (e) => { state.overrides.active = e.target.value; applyFineTune(); });
$('ftReset').addEventListener('click', () => {
  pushUndo();
  state.overrides = {};
  syncFineTune();
  applyFineTune();
  toast('Style reset to defaults');
});
$('spkName').addEventListener('input', (e) => { state.speaker.name = e.target.value; markDirty(); });
$('spkRole').addEventListener('input', (e) => { state.speaker.role = e.target.value; markDirty(); });

// ── Canvas direct manipulation ─────────────────────────────────────────────
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
  };
}
// Two independently draggable blocks: the front caption block and — for
// split-layer styles — the hero word behind the speaker. Generous hit zones,
// all four corners resize (scaling by distance from the block center), the
// body moves, hovering shows an outline before you even click, and arrow
// keys nudge the selected block.
let canvasDrag = null;
let hoverTarget = null;
const inBox = (p, b, pad) => b && p.x >= b.minX - pad && p.x <= b.maxX + pad && p.y >= b.minY - pad && p.y <= b.maxY + pad;
const HIT_PAD = () => canvas.width * 0.045;
const CORNER = () => canvas.width * 0.06;

function blockAt(p) {
  if (inBox(p, lastHeroBounds, HIT_PAD())) return 'hero';
  if (inBox(p, lastBounds, HIT_PAD())) return 'caption';
  return null;
}
function boundsOf(target) { return target === 'hero' ? lastHeroBounds : lastBounds; }
function onCorner(p, b) {
  if (!b) return false;
  const c = CORNER();
  return [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]]
    .some(([hx, hy]) => Math.abs(p.x - hx) < c && Math.abs(p.y - hy) < c);
}
const center = (b) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

canvas.addEventListener('pointerdown', (e) => {
  if (exporting) return;
  if ($('stageEmpty') && !$('stageEmpty').hidden) return;
  const p = canvasPoint(e);
  const target = blockAt(p);
  if (target) {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    state.selection = target;
    const b = boundsOf(target);
    canvasDrag = {
      target,
      mode: onCorner(p, b) ? 'resize' : 'move',
      x0: p.x, y0: p.y,
      c0: center(b),
      d0: Math.max(20, dist(p, center(b))),
      posX0: target === 'hero'
        ? (state.overrides.heroPosX ?? state.eff.heroPos.x ?? 0.5)
        : (state.overrides.posX ?? state.eff.pos.x ?? 0.5),
      posY0: target === 'hero'
        ? (state.overrides.heroPosY ?? state.eff.heroPos.y)
        : (state.overrides.posY ?? state.eff.pos.y),
      size0: state.overrides.size || 1,
      moved: false,
    };
  } else {
    state.selection = null;
  }
  markDirty();
});
canvas.addEventListener('pointermove', (e) => {
  const p = canvasPoint(e);
  if (!canvasDrag) {
    const t = blockAt(p);
    if (t !== hoverTarget) { hoverTarget = t; markDirty(); }
    const b = t ? boundsOf(t) : null;
    canvas.style.cursor = !t ? 'default' : onCorner(p, b) ? 'nwse-resize' : 'grab';
    return;
  }
  if (!canvasDrag.moved && (Math.abs(p.x - canvasDrag.x0) + Math.abs(p.y - canvasDrag.y0)) > 3) {
    canvasDrag.moved = true;
    beginPending();
    canvas.style.cursor = canvasDrag.mode === 'resize' ? 'nwse-resize' : 'grabbing';
  }
  if (!canvasDrag.moved) return;
  if (canvasDrag.mode === 'move') {
    const nx = clamp(canvasDrag.posX0 + (p.x - canvasDrag.x0) / canvas.width, 0.1, 0.9);
    const ny = clamp(canvasDrag.posY0 + (p.y - canvasDrag.y0) / canvas.height, 0.05, 0.95);
    if (canvasDrag.target === 'hero') { state.overrides.heroPosX = nx; state.overrides.heroPosY = ny; }
    else { state.overrides.posX = nx; state.overrides.posY = ny; }
  } else {
    // scale by how far the pointer moved from the block's center — grabbing a
    // corner and pulling outward grows the text, pulling inward shrinks it
    state.overrides.size = clamp(canvasDrag.size0 * (dist(p, canvasDrag.c0) / canvasDrag.d0), 0.4, 2.6);
  }
  buildEff();
  syncFineTune();
  markDirty();
});
canvas.addEventListener('pointerup', (e) => {
  if (canvasDrag?.moved) commitPending();
  canvasDrag = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch { /* released */ }
});
canvas.addEventListener('pointerleave', () => {
  if (hoverTarget) { hoverTarget = null; markDirty(); }
});

// arrow keys nudge the selected block (Shift = coarse steps)
function nudgeSelection(dx, dy) {
  if (!state.selection) return false;
  beginPending();
  if (state.selection === 'hero') {
    state.overrides.heroPosX = clamp((state.overrides.heroPosX ?? state.eff.heroPos.x ?? 0.5) + dx, 0.1, 0.9);
    state.overrides.heroPosY = clamp((state.overrides.heroPosY ?? state.eff.heroPos.y) + dy, 0.05, 0.95);
  } else {
    state.overrides.posX = clamp((state.overrides.posX ?? state.eff.pos.x ?? 0.5) + dx, 0.1, 0.9);
    state.overrides.posY = clamp((state.overrides.posY ?? state.eff.pos.y) + dy, 0.05, 0.95);
  }
  commitPending();
  buildEff();
  syncFineTune();
  markDirty();
  return true;
}

function drawSelectionChrome() {
  // hover affordance: faint outline on the block under the cursor
  if (hoverTarget && hoverTarget !== state.selection) {
    const hb = boundsOf(hoverTarget);
    if (hb) {
      const W2 = canvas.width, pad2 = W2 * 0.015;
      ctx.save();
      ctx.strokeStyle = 'rgba(81,69,205,.45)';
      ctx.lineWidth = Math.max(1, W2 * 0.002);
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(hb.minX - pad2, hb.minY - pad2, (hb.maxX - hb.minX) + pad2 * 2, (hb.maxY - hb.minY) + pad2 * 2);
      ctx.restore();
    }
  }
  if (!state.selection) return;
  const b = state.selection === 'hero' ? lastHeroBounds : lastBounds;
  if (!b) return;
  const W = canvas.width;
  const pad = W * 0.015;
  ctx.save();
  ctx.strokeStyle = '#5145cd';
  ctx.lineWidth = Math.max(1.5, W * 0.003);
  ctx.setLineDash([6, 5]);
  ctx.strokeRect(b.minX - pad, b.minY - pad, (b.maxX - b.minX) + pad * 2, (b.maxY - b.minY) + pad * 2);
  ctx.setLineDash([]);
  // handles
  const hs = W * 0.022;
  ctx.fillStyle = '#5145cd';
  for (const [hx, hy] of [[b.minX - pad, b.minY - pad], [b.maxX + pad, b.minY - pad], [b.minX - pad, b.maxY + pad], [b.maxX + pad, b.maxY + pad]]) {
    ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
  }
  // label
  const label = state.selection === 'hero' || (state.eff.behind && !state.eff.extra.splitHero) ? 'BEHIND' : 'CAPTION';
  ctx.font = `800 ${Math.round(W * 0.022)}px Inter`;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = '#5145cd';
  ctx.fillRect(b.minX - pad, b.minY - pad - W * 0.042, tw + W * 0.024, W * 0.036);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, b.minX - pad + W * 0.012, b.minY - pad - W * 0.024);
  ctx.restore();
}

// canvas pills
$('safeBtn').addEventListener('click', () => {
  state.showSafe = !state.showSafe;
  $('safeBtn').classList.toggle('on', state.showSafe);
  markDirty();
});
$('zoomBtn').addEventListener('click', () => {
  state.autoZoom = !state.autoZoom;
  $('zoomBtn').classList.toggle('on', state.autoZoom);
  markDirty();
  toast(state.autoZoom
    ? `Auto-zoom on — ${zoomPlan.length} punch-ins planned on keywords and fresh sentences 🎥`
    : 'Auto-zoom off');
});
$('cutoutBtn').addEventListener('click', async () => {
  if (!state.eff.behind) return toast('Sharper cutouts apply to Behind-the-Person styles — pick one in Templates.');
  if (!maskTracker) { maskTracker = new MaskTracker(); await maskTracker.init(); }
  const sharp = maskTracker.minIntervalMs > 40;
  maskTracker.minIntervalMs = sharp ? 33 : 66;
  $('cutoutBtn').classList.toggle('on', sharp);
  toast(sharp ? 'Sharper cutouts on — segmentation at full rate ✨' : 'Standard cutouts (battery-friendly)');
  markDirty();
});
$('aspectSel').addEventListener('change', (e) => {
  if (exporting) { e.target.value = state.aspect; return; }
  setAspect(e.target.value);
});

function setAspect(aspect) {
  state.aspect = aspect;
  const dims = { '9:16': [540, 960], '1:1': [720, 720], '16:9': [960, 540] }[aspect];
  canvas.width = dims[0]; canvas.height = dims[1];
  scratch.width = dims[0]; scratch.height = dims[1];
  const wrap = $('canvasWrap');
  wrap.classList.toggle('wide', aspect === '16:9');
  wrap.classList.toggle('square', aspect === '1:1');
  state.styleVersion++;
  scheduleConcepts();
  markDirty();
}
setAspect('9:16');

// ── B-roll ─────────────────────────────────────────────────────────────────
let brollSeq = 0;
$('brollAddBtn').addEventListener('click', () => $('brollFile').click());
$('brollFile').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) addBrollFile(f);
  e.target.value = '';
});
// paste or drop anywhere adds b-roll at the playhead (once a clip is loaded)
document.addEventListener('paste', (e) => {
  if (!state.words.length) return;
  const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/') || i.type.startsWith('video/'));
  if (item) { addBrollFile(item.getAsFile()); e.preventDefault(); }
});
for (const target of [$('canvasWrap'), $('timelineBar')]) {
  target.addEventListener('dragover', (e) => { if (state.words.length) e.preventDefault(); });
  target.addEventListener('drop', (e) => {
    if (!state.words.length) return;
    const f = e.dataTransfer?.files?.[0];
    if (f && (f.type.startsWith('image/') || f.type.startsWith('video/'))) {
      e.preventDefault();
      addBrollFile(f);
    }
  });
}

function addBrollFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const kind = file.type.startsWith('video/') ? 'video' : 'image';
  const item = { id: ++brollSeq, start: video.currentTime || 0, dur: 3, kind, url, name: file.name };
  if (kind === 'image') {
    const img = new Image();
    img.onload = () => { markDirty(); };
    img.src = url;
    item.el = img;
    finishAdd();
  } else {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.src = url;
    v.addEventListener('loadedmetadata', () => {
      item.dur = Math.min(Math.max(MINB(v.duration), 0.5), 6, videoDurLeft(item.start));
      finishAdd();
    }, { once: true });
    item.el = v;
  }
  function finishAdd() {
    item.dur = Math.min(item.dur, videoDurLeft(item.start));
    state.broll.push(item);
    state.broll.sort((a, b) => a.start - b.start);
    renderBrollList();
    markDirty();
    toast(`B-roll added at ${fmtTime(item.start)} 🎞`);
  }
}
const MINB = (d) => isFinite(d) ? d : 3;
const videoDurLeft = (start) => Math.max(0.5, (video.duration || 10) - start);

function removeBroll(i) {
  const b = state.broll[i];
  if (!b) return;
  URL.revokeObjectURL(b.url);
  state.broll.splice(i, 1);
  if (timeline) timeline.selectedBroll = -1;
  renderBrollList();
  markDirty();
  toast('B-roll removed');
}

function renderBrollList() {
  const list = $('brollList');
  if (!state.broll.length) { list.innerHTML = '<p class="tp-hint">No b-roll yet.</p>'; return; }
  list.innerHTML = '';
  state.broll.forEach((b, i) => {
    const row = document.createElement('div');
    row.className = 'broll-item';
    const thumb = b.kind === 'image' ? `<img src="${b.url}" alt="">` : `<video src="${b.url}" muted></video>`;
    row.innerHTML = `${thumb}
      <div class="bi-meta"><div class="bi-name">${escapeHtml(b.name)}</div>
      <div class="bi-time">${fmtTime(b.start)} → ${fmtTime(b.start + b.dur)}</div></div>
      <button class="bi-del" title="Remove">✕</button>`;
    row.querySelector('.bi-del').addEventListener('click', () => removeBroll(i));
    row.addEventListener('click', (e) => {
      if (e.target.closest('.bi-del')) return;
      video.currentTime = b.start + 0.01;
      markDirty();
    });
    list.appendChild(row);
  });
}

// keep b-roll video elements in sync with the main clock
function syncBroll(t, playing) {
  for (const b of state.broll) {
    if (b.kind !== 'video' || !b.el) continue;
    const active = t >= b.start && t < b.start + b.dur;
    const local = Math.max(0, Math.min(t - b.start, (b.el.duration || b.dur) - 0.05));
    if (active) {
      if (playing && b.el.paused) { b.el.currentTime = local; b.el.play().catch(() => {}); }
      if (!playing && Math.abs(b.el.currentTime - local) > 0.2) b.el.currentTime = local;
    } else if (!b.el.paused) {
      b.el.pause();
    }
  }
}

// ── Hooks / title ──────────────────────────────────────────────────────────
function renderHooks() {
  const hooks = suggestHooks(state.words);
  const list = $('hookList');
  list.innerHTML = hooks.length
    ? hooks.map(h => `<button class="hook-item" data-text="${escapeHtml(h.text)}">“${escapeHtml(h.text)}”<span class="score">FROM TRANSCRIPT</span></button>`).join('')
    : '<p class="tp-hint">Not enough transcript to suggest hooks yet.</p>';
  if (!state.hook && hooks.length) state.hook = hooks[0].text;
  [...list.children].forEach(el => el.classList?.toggle('selected', el.dataset?.text === state.hook));
}
$('hookList').addEventListener('click', (e) => {
  const item = e.target.closest('.hook-item');
  if (!item) return;
  state.hook = item.dataset.text;
  $('hookCustom').value = '';
  [...$('hookList').children].forEach(el => el.classList?.toggle('selected', el === item));
  scheduleConcepts();
  markDirty();
});
$('hookCustom').addEventListener('input', (e) => {
  const val = e.target.value.trim();
  if (val) {
    state.hook = val;
    [...$('hookList').children].forEach(el => el.classList?.remove('selected'));
  } else {
    // cleared → fall back to the top suggestion so the state matches the UI
    const first = $('hookList').querySelector('.hook-item');
    state.hook = first?.dataset.text || '';
    if (first) first.classList.add('selected');
  }
  scheduleConcepts();
  markDirty();
});
$('hookBurn').addEventListener('change', (e) => {
  state.hookBurn = e.target.checked;
  markDirty();
  if (state.hookBurn) { video.currentTime = 0.4; toast('Hook title will show for the first 2.5 s'); }
});
$('autoEmoji').addEventListener('change', (e) => {
  state.autoEmoji = e.target.checked;
  buildEff();          // bumps the layout version so cached geometry refreshes
  rebuildGroups();
  toast(state.autoEmoji ? 'Highlight words get an emoji 🔥' : 'Emoji off');
});

// How the opening reads — each finding names something fixable. The scroll
// decision happens in the first three seconds, so this is the panel that
// most affects whether a short travels.
function renderHookReport() {
  const box = $('hookReport');
  const live = state.words.filter(w => !w.deleted);
  if (!live.length) { box.innerHTML = ''; return; }
  const opening = live.filter(w => w.start < 3);
  const findings = [];
  let score = 100;
  if (!opening.length) {
    box.innerHTML = `<div class="hr-score bad">0</div><div class="hr-item bad">Nothing is said before the viewer decides to scroll. Cut straight to the first line.</div>`;
    return;
  }
  const text = opening.map(w => w.text).join(' ');
  if (opening.length < 5) { score -= 25; findings.push(['warn', `Only ${opening.length} words in three seconds — a hook usually needs 6–10. Trim the run-up.`]); }
  if (opening.length / 3 > 4.5) { score -= 10; findings.push(['warn', 'Very fast delivery — the opening may not land. Leave a beat after the first line.']); }
  if (/^(so|um|uh|ok|okay|hi|hey|hello|guys|yeah|right|basically|actually|तो|अच्छा|हाँ|नमस्ते)\b/i.test(opening[0].text)) {
    score -= 20; findings.push(['bad', `Opens on “${opening[0].text}” — a throwaway word. Start on the claim instead.`]);
  }
  if (live[0].start > 0.8) { score -= 15; findings.push(['warn', `${live[0].start.toFixed(1)}s of silence before the first word. Trim the lead-in (cut the words, the captions follow).`]); }
  if (!/\?/.test(text) && !/\d/.test(text)) { score -= 10; findings.push(['tip', 'No question and no number in the opening — both give a viewer a reason to stay.']); }
  if (!findings.length) findings.push(['good', 'Opens quickly and with substance. Nothing to fix.']);
  score = Math.max(0, Math.min(100, score));
  const cls = score >= 80 ? 'good' : score >= 55 ? 'warn' : 'bad';
  box.innerHTML = `<div class="hr-score ${cls}">${score}<span>/100</span></div>` +
    findings.map(([lvl, t]) => `<div class="hr-item ${lvl}">${escapeHtml(t)}</div>`).join('');
}

// ── Thumbnails ─────────────────────────────────────────────────────────────
const thumbVideo = document.createElement('video');
thumbVideo.muted = true; thumbVideo.playsInline = true; thumbVideo.preload = 'auto';
let thumbReady = false;
let conceptsPending = false;

const THUMB_DIMS = {
  '9:16': { sw: 180, sh: 320, bw: 1080, bh: 1920 },
  '1:1':  { sw: 240, sh: 240, bw: 1080, bh: 1080 },
  '16:9': { sw: 320, sh: 180, bw: 1920, bh: 1080 },
};
function ensureThumbVideo() {
  if (thumbVideo.src !== state.url && state.url) {
    thumbVideo.src = state.url;
    thumbVideo.load();
    thumbReady = false;
    thumbVideo.addEventListener('loadeddata', () => { thumbReady = true; scheduleConcepts(); }, { once: true });
  }
}
$('thumbScrub').addEventListener('input', (e) => {
  if (!video.duration) return;
  state.thumbTime = (e.target.value / 100) * video.duration;
  scheduleConcepts();
});
$('thumbText').addEventListener('input', scheduleConcepts);

let conceptsQueued = false;
function scheduleConcepts() {
  if (state.tool !== 'thumbnail') return;
  ensureThumbVideo();
  if (!thumbReady) return;
  if (conceptsPending) { conceptsQueued = true; return; } // latest request wins
  conceptsPending = true;
  const seekTo = Math.max(0.01, Math.min(state.thumbTime, (thumbVideo.duration || 1) - 0.05));
  thumbVideo.addEventListener('seeked', () => {
    conceptsPending = false;
    renderConcepts();
    if (conceptsQueued) { conceptsQueued = false; scheduleConcepts(); }
  }, { once: true });
  thumbVideo.currentTime = seekTo;
}
function thumbTitle() {
  return ($('thumbText').value.trim() || state.hook || 'Watch this').toUpperCase();
}
function renderConcepts() {
  const d = THUMB_DIMS[state.aspect];
  document.querySelectorAll('#conceptGrid .concept').forEach(btn => {
    btn.classList.toggle('wide', state.aspect === '16:9');
    btn.classList.toggle('square', state.aspect === '1:1');
    renderThumb(btn.querySelector('canvas').getContext('2d'), d.sw, d.sh, {
      source: thumbVideo,
      styleId: btn.dataset.style,
      title: btn.dataset.style === 'clean' ? '' : thumbTitle(),
    });
  });
}
$('conceptGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('.concept');
  if (!btn) return;
  state.thumbStyle = btn.dataset.style;
  document.querySelectorAll('#conceptGrid .concept').forEach(el => el.classList.toggle('selected', el === btn));
});
$('thumbDownload').addEventListener('click', () => {
  if (!thumbReady) return toast('Load a clip first');
  const d = THUMB_DIMS[state.aspect];
  const big = document.createElement('canvas');
  renderThumb(big.getContext('2d'), d.bw, d.bh, {
    source: thumbVideo,
    styleId: state.thumbStyle,
    title: state.thumbStyle === 'clean' ? '' : thumbTitle(),
  });
  big.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `popshot-thumbnail-${state.thumbStyle}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
  toast('Thumbnail saved ⬇');
});

// ── Transport ──────────────────────────────────────────────────────────────
function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
function togglePlay() {
  if (!video.src || exporting) return;
  if (video.paused) { video.play(); $('playBtn').textContent = '❚❚'; }
  else { video.pause(); $('playBtn').textContent = '▶'; }
}
$('playBtn').addEventListener('click', togglePlay);
video.addEventListener('ended', () => { $('playBtn').textContent = '▶'; });
video.addEventListener('pause', () => { $('playBtn').textContent = '▶'; });
$('muteBtn').addEventListener('click', () => {
  video.muted = !video.muted;
  $('muteBtn').textContent = video.muted ? '🔇' : '🔊';
});
$('scrubber').addEventListener('input', (e) => {
  if (video.duration && !exporting) { video.currentTime = +e.target.value; markDirty(); }
});

// ── Preview loop ───────────────────────────────────────────────────────────
function drawSafeArea() {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,230,0,.6)';
  ctx.setLineDash([8, 7]);
  ctx.lineWidth = 2;
  ctx.strokeRect(W * 0.05, H * 0.06, W * 0.9, H * 0.78);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,230,0,.1)';
  ctx.fillRect(0, H * 0.84, W, H * 0.16);
  ctx.fillRect(W * 0.86, H * 0.3, W * 0.14, H * 0.44);
  ctx.font = `700 ${Math.round(W * 0.026)}px Inter`;
  ctx.fillStyle = 'rgba(255,230,0,.85)';
  ctx.fillText('SAFE ZONE', W * 0.05 + 8, H * 0.06 + 18);
  ctx.restore();
}

function frameOpts(t) {
  return {
    scratch,
    speaker: state.speaker,
    layoutVersion: state.styleVersion,
    hookTitle: state.hookBurn && state.hook ? { text: state.hook, until: 2.5 } : null,
    broll: state.broll,
    zoom: zoomAt(t ?? video.currentTime),
  };
}

function drawPreview() {
  const t = video.currentTime;
  const opts = frameOpts(t);
  if (state.eff.behind && maskTracker?.ready) opts.mask = maskTracker.update(video, performance.now());
  const res = drawFrame(ctx, video, t, state.groups, state.eff, opts);
  lastBounds = res?.bounds || null;
  lastHeroBounds = res?.heroBounds || null;
  if (state.showSafe) drawSafeArea();
  drawSelectionChrome();
}

let lastTimeText = '';
let lastWordIdx = -1;
let lastLineIdx = -1;
function previewLoop() {
  requestAnimationFrame(previewLoop);
  timeline?.draw(!video.paused && !exporting);
  if (!video.src || video.readyState < 2 || exporting) return;
  const playing = !video.paused && !video.ended;
  const t = video.currentTime;

  const txt = fmtTime(t);
  if (txt !== lastTimeText) {
    lastTimeText = txt;
    $('timeCur').textContent = txt;
    $('tlTime').textContent = `${txt} / ${fmtTime(video.duration || 0)}`;
  }
  if (playing) $('scrubber').value = t;

  syncBroll(t, playing);
  if (!playing && !needsDraw) return;
  needsDraw = false;
  drawPreview();

  // highlight the word + line being spoken in the transcript panel
  if (state.tool === 'transcript' && playing) {
    const idx = state.words.findIndex(w => !w.deleted && t >= w.start && t < w.end);
    if (idx !== lastWordIdx) {
      lastWordIdx = idx;
      document.querySelectorAll('.tp-word.playing').forEach(el => el.classList.remove('playing'));
      if (idx >= 0) document.querySelector(`.tp-word[data-i="${idx}"]`)?.classList.add('playing');
    }
    const li = state.groups.findIndex(g => t >= g.start && t < g.hold);
    if (li !== lastLineIdx) {
      lastLineIdx = li;
      document.querySelectorAll('.tp-line.current').forEach(el => el.classList.remove('current'));
      if (li >= 0) {
        const line = document.querySelector(`.tp-line[data-gi="${li}"]`);
        if (line) { line.classList.add('current'); line.scrollIntoView({ block: 'nearest' }); }
      }
    }
  }
}
requestAnimationFrame(previewLoop);

// rAF pauses in hidden/occluded windows; this watchdog keeps seeks and edits
// rendering (cheap: only fires when something is actually dirty)
setInterval(() => {
  if (needsDraw && video.src && video.readyState >= 2 && !exporting) {
    needsDraw = false;
    drawPreview();
    timeline?.draw(false);
  }
}, 250);

// ── Export ─────────────────────────────────────────────────────────────────
$('exportOpenBtn').addEventListener('click', () => {
  if (!state.groups.length) return toast('Transcribe your clip first — captions are the whole point ✦');
  $('exportModal').hidden = false;
  renderExportMeta();
});
$('exportCloseBtn').addEventListener('click', () => { if (!exporting) $('exportModal').hidden = true; });
$('exportModal').addEventListener('click', (e) => {
  if (e.target === $('exportModal') && !exporting) $('exportModal').hidden = true;
});

async function renderExportMeta() {
  const size = CONFIG.export.sizes[state.aspect];
  $('exportMeta').innerHTML = 'Probing this browser’s encoders…';
  const mime = await findWorkingMime(size.w, size.h);
  const fmt = mime.startsWith('video/mp4') ? 'MP4 · H.264' : 'WebM';
  $('exportMeta').innerHTML =
    `RESOLUTION&nbsp; ${size.w} × ${size.h}<br>` +
    `FORMAT&nbsp;&nbsp;&nbsp;&nbsp; ${fmt} · ${CONFIG.export.fps} fps<br>` +
    `STYLE&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${state.preset.name}<br>` +
    `DURATION&nbsp;&nbsp; ${fmtTime(video.duration || 0)}` +
    (state.broll.length ? `<br>B-ROLL&nbsp;&nbsp;&nbsp;&nbsp; ${state.broll.length} cutaway${state.broll.length > 1 ? 's' : ''}` : '') +
    (state.hookBurn && state.hook ? `<br>HOOK&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; burned in for 2.5 s` : '');
  $('exportNote').textContent = mime.startsWith('video/mp4')
    ? ''
    : 'This browser records WebM (plays everywhere modern; convert to MP4 with ffmpeg if a platform requires it). Chrome on desktop usually exports MP4 directly.';
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
    if (state.eff.behind && !maskTracker) {
      maskTracker = new MaskTracker();
      await maskTracker.init();
    }
    const { blob, ext } = await exportVideo({
      video,
      groups: state.groups,
      preset: state.eff,
      aspect: state.aspect,
      maskTracker,
      speaker: state.speaker,
      layoutVersion: state.styleVersion,
      hookTitle: state.hookBurn && state.hook ? { text: state.hook, until: 2.5 } : null,
      broll: state.broll,
      zoomFn: zoomAt,
      prepFrame: (t) => syncBroll(t, true),
      signal: abortCtl.signal,
      onProgress: (p) => {
        $('exportBar').style.width = (p * 100).toFixed(1) + '%';
        $('exportMsg').textContent = `Rendering… ${(p * 100).toFixed(0)}%  (plays through the clip once)`;
      },
    });
    const link = $('downloadLink');
    if (link.href.startsWith('blob:')) URL.revokeObjectURL(link.href); // free the previous render
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `${($('projName').value || 'popshot-short').replace(/[^\w-]+/g, '-')}.${ext}`;
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
    markDirty();
  }
});
$('cancelExportBtn').addEventListener('click', () => abortCtl?.abort());

// ── Utils ──────────────────────────────────────────────────────────────────
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// debug handle for automated tests (harmless in production)
window.__ps = { state, get bounds() { return lastBounds; }, markDirty, rebuildGroups };
