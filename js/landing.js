// ---------------------------------------------------------------------------
// Popshot — landing page script
// Typewriter hero, live style gallery rendered by the real caption engine
// (cards animate on hover), upload + style validation, and file/style handoff
// to the editor via IndexedDB + sessionStorage.
// ---------------------------------------------------------------------------

import { CATEGORIES, presetsForCategory, FONT_FAMILIES } from './presets.js';
import { groupWords, drawFrame } from './engine.js';
import { stashFile } from './handoff.js';

// fonts
document.getElementById('gfonts').href = 'https://fonts.googleapis.com/css2?' +
  FONT_FAMILIES.map(f => 'family=' + f.replace(/ /g, '+')).join('&') + '&display=swap';

// ── Typewriter hero ────────────────────────────────────────────────────────
const TYPE_WORDS = ['pop.', 'animated.', 'readable.', 'designed.', 'post-ready.'];
(() => {
  const el = document.getElementById('typeword');
  if (!el) return;
  let wi = 0, ci = TYPE_WORDS[0].length, dir = -1, wait = 18;
  setInterval(() => {
    if (wait > 0) { wait--; return; }
    ci += dir;
    if (ci < 0) { dir = 1; ci = 0; wi = (wi + 1) % TYPE_WORDS.length; }
    el.textContent = TYPE_WORDS[wi].slice(0, ci) || ' ';
    if (ci >= TYPE_WORDS[wi].length) { dir = -1; wait = 22; } // hold the full word
  }, 90);
})();

// ── Marquees ───────────────────────────────────────────────────────────────
const strips = {
  mq1: 'UPLOAD · CAPTION · TRANSCRIPT · HOOK · THUMBNAIL · EXPORT · ',
  mq2: 'HOOK FIRST / READABLE ALWAYS / TRANSCRIPT SYNCED / EXPORT READY / ',
  mq3: 'UPLOAD / CAPTION / CLEAN / THUMBNAIL / EXPORT / ',
};
for (const [id, text] of Object.entries(strips)) {
  const el = document.getElementById(id);
  if (el) el.textContent = text.repeat(12);
}

// ── Hero upload + validation ───────────────────────────────────────────────
const drop = document.getElementById('heroDrop');
const fileInput = document.getElementById('heroFile');
let pendingFile = null;
let chosenStyle = null;

drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => e.target.files[0] && setFile(e.target.files[0]));
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', (e) => {
  e.preventDefault(); drop.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('video/')) setFile(f);
});

function setFile(f) {
  pendingFile = f;
  drop.classList.add('has-file');
  document.getElementById('heroDropLabel').innerHTML =
    `<strong>${f.name}</strong> · ${(f.size / 1e6).toFixed(1)} MB ✓`;
  validate('');
}

function validate(msg) {
  document.getElementById('heroValidate').textContent = msg;
}

document.getElementById('createBtn').addEventListener('click', async () => {
  if (!pendingFile && !chosenStyle) return validate('Add a clip and pick a style below to continue — or just open the editor from “Create”.');
  if (!pendingFile) return validate('Add a clip to continue.');
  try { await stashFile(pendingFile); } catch { /* editor shows its own dropzone */ }
  if (chosenStyle) { try { sessionStorage.setItem('popshot-style', chosenStyle); } catch { /* private mode */ } }
  location.href = 'editor.html';
});

// ── Style gallery ──────────────────────────────────────────────────────────
let activeCat = 'popular';
const tabsEl = document.getElementById('catTabs');
const descEl = document.getElementById('catDesc');
const gridEl = document.getElementById('styleGrid');

const SAMPLE_WORDS = [
  { text: 'make', start: 0, end: 0.4, deleted: false },
  { text: 'it', start: 0.4, end: 0.7, deleted: false },
  { text: 'POP', start: 0.7, end: 1.3, deleted: false },
];
const SAMPLE_LOOP = 1.8; // seconds per hover-animation loop

const sampleSource = (() => {
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
})();

function sampleMask() {
  const mask = document.createElement('canvas');
  mask.width = 270; mask.height = 480;
  const m = mask.getContext('2d');
  m.fillStyle = '#fff';
  m.beginPath(); m.arc(135, 250, 52, 0, Math.PI * 2); m.fill();
  m.beginPath(); m.ellipse(135, 420, 95, 130, 0, Math.PI, 0); m.fill();
  return mask;
}

function renderTabs() {
  tabsEl.innerHTML = CATEGORIES.map(c =>
    `<button class="cat-tab ${c.id === activeCat ? 'active' : ''}" data-cat="${c.id}">${c.name}${c.ai ? ' <span class="ai">AI</span>' : ''}</button>`
  ).join('');
}
tabsEl.addEventListener('click', (e) => {
  const t = e.target.closest('.cat-tab');
  if (!t) return;
  activeCat = t.dataset.cat;
  renderGallery();
});

function drawCard(cv, p, t, mask, scratch) {
  drawFrame(cv.getContext('2d'), sampleSource, t, groupWords(SAMPLE_WORDS, p), p,
    { mask, scratch, speaker: { name: 'Neha Sharma', role: 'Founder' } });
}

let renderSeq = 0;
async function renderGallery() {
  const token = ++renderSeq;   // overlapping calls: last one wins, no duplicate cards
  renderTabs();
  const cat = CATEGORIES.find(c => c.id === activeCat);
  descEl.textContent = cat?.desc || '';
  gridEl.innerHTML = '';
  await document.fonts.ready;
  if (token !== renderSeq) return;
  for (const p of presetsForCategory(activeCat)) {
    const card = document.createElement('a');
    card.className = 'style-card';
    card.href = 'editor.html';
    card.dataset.id = p.id;
    if (p.badge) card.innerHTML += `<span class="badge ${p.badge === 'TRENDING' ? 'trending' : ''}">${p.badge}</span>`;
    const cv = document.createElement('canvas');
    cv.width = 270; cv.height = 480;
    card.appendChild(cv);
    const label = document.createElement('div');
    label.className = 'style-name';
    label.innerHTML = `<span>${p.name}</span><span class="style-tier">${p.tier.toUpperCase()}</span>`;
    card.appendChild(label);
    gridEl.appendChild(card);

    const scratch = document.createElement('canvas');
    scratch.width = 270; scratch.height = 480;
    const mask = p.behind ? sampleMask() : null;
    drawCard(cv, p, 0.95, mask, scratch);

    // hover → replay the sample animation on this card only
    // (the loop kills itself if the card is detached by a gallery re-render)
    let raf = 0;
    card.addEventListener('mouseenter', () => {
      const start = performance.now();
      const loop = (now) => {
        if (!cv.isConnected) return;
        drawCard(cv, p, ((now - start) / 1000) % SAMPLE_LOOP, mask, scratch);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    card.addEventListener('mouseleave', () => {
      cancelAnimationFrame(raf);
      if (cv.isConnected) drawCard(cv, p, 0.95, mask, scratch);
    });

    // choosing a card remembers the style — and carries a staged hero clip along
    card.addEventListener('click', async (e) => {
      chosenStyle = p.id;
      try { sessionStorage.setItem('popshot-style', p.id); } catch { /* private mode */ }
      if (pendingFile) {
        e.preventDefault();
        try { await stashFile(pendingFile); } catch { /* editor shows its own dropzone */ }
        location.href = 'editor.html';
      }
    });
  }
}

renderGallery();
// re-render once webfonts arrive so cards use the real faces
document.fonts.ready.then(() => setTimeout(renderGallery, 400));
