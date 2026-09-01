// ---------------------------------------------------------------------------
// Popshot — landing page script
// Renders the style gallery with the real caption engine, runs the marquees,
// and hands a dropped file to the editor via IndexedDB.
// ---------------------------------------------------------------------------

import { CATEGORIES, presetsForCategory, FONT_FAMILIES } from './presets.js';
import { groupWords, drawFrame } from './engine.js';
import { stashFile } from './handoff.js';

// fonts
document.getElementById('gfonts').href = 'https://fonts.googleapis.com/css2?' +
  FONT_FAMILIES.map(f => 'family=' + f.replace(/ /g, '+')).join('&') + '&display=swap';

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

// ── Hero dropzone → editor handoff ─────────────────────────────────────────
const drop = document.getElementById('heroDrop');
const fileInput = document.getElementById('heroFile');
drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => e.target.files[0] && handoff(e.target.files[0]));
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', (e) => {
  e.preventDefault(); drop.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('video/')) handoff(f);
});
async function handoff(file) {
  try { await stashFile(file); } catch { /* editor will just show its own dropzone */ }
  location.href = 'editor.html';
}

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

async function renderGallery() {
  renderTabs();
  const cat = CATEGORIES.find(c => c.id === activeCat);
  descEl.textContent = cat?.desc || '';
  gridEl.innerHTML = '';
  await document.fonts.ready;
  for (const p of presetsForCategory(activeCat)) {
    const card = document.createElement('a');
    card.className = 'style-card';
    card.href = 'editor.html';
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
    drawFrame(cv.getContext('2d'), sampleSource, 0.95, groupWords(SAMPLE_WORDS, p), p,
      { mask, scratch, speaker: { name: 'Neha Sharma', role: 'Founder' } });
  }
}

renderGallery();
// re-render once webfonts arrive so cards use the real faces
document.fonts.ready.then(() => setTimeout(renderGallery, 400));
