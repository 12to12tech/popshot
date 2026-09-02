// ---------------------------------------------------------------------------
// Popshot — Tools: thumbnail maker
// Upload a video, scrub to a frame, get four cover concepts, click to save.
// ---------------------------------------------------------------------------

import { FONT_FAMILIES } from './presets.js';
import { renderThumb, CONCEPTS } from './thumbs.js';

document.getElementById('gfonts').href = 'https://fonts.googleapis.com/css2?' +
  FONT_FAMILIES.map(f => 'family=' + f.replace(/ /g, '+')).join('&') + '&display=swap';

const drop = document.getElementById('toolDrop');
const fileInput = document.getElementById('toolFile');
const grid = document.getElementById('toolGrid');

const video = document.createElement('video');
video.muted = true; video.playsInline = true; video.preload = 'auto';
let ready = false;
let pending = false;

drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => e.target.files[0] && load(e.target.files[0]));
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', (e) => {
  e.preventDefault(); drop.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('video/')) load(f);
});

function load(file) {
  if (video.src.startsWith('blob:')) URL.revokeObjectURL(video.src);
  video.src = URL.createObjectURL(file);
  video.load();
  ready = false;
  pending = false;   // forget any in-flight seek from the previous clip
  video.addEventListener('loadeddata', async () => {
    // recorder-produced WebMs report Infinity until seeked to the end once
    if (!isFinite(video.duration)) {
      video.currentTime = 1e7;
      await new Promise(res => { video.onseeked = res; setTimeout(res, 3000); });
      video.onseeked = null;
      video.currentTime = 0.01;
    }
    ready = true;
    drop.classList.add('has-file');
    document.getElementById('toolDropLabel').innerHTML =
      `<strong>${file.name}</strong> · ${(file.size / 1e6).toFixed(1)} MB ✓`;
    document.getElementById('toolControls').hidden = false;
    buildGrid();
    schedule();
  }, { once: true });
}

function buildGrid() {
  grid.innerHTML = '';
  for (const c of CONCEPTS) {
    const btn = document.createElement('button');
    btn.className = 'tool-thumb';
    btn.dataset.style = c.id;
    const cv = document.createElement('canvas');
    cv.width = 180; cv.height = 320;
    btn.appendChild(cv);
    const name = document.createElement('span');
    name.textContent = c.name;
    btn.appendChild(name);
    const dl = document.createElement('small');
    dl.textContent = '⬇ Download PNG';
    btn.appendChild(dl);
    btn.addEventListener('click', () => download(c.id));
    grid.appendChild(btn);
  }
}

function title() {
  return (document.getElementById('toolText').value.trim() || 'Watch this').toUpperCase();
}

let queued = false;
function schedule() {
  if (!ready) return;
  if (pending) { queued = true; return; }  // latest scrub position wins
  pending = true;
  const dur = isFinite(video.duration) ? video.duration : 1;
  const t = (document.getElementById('toolScrub').value / 100) * dur;
  video.addEventListener('seeked', () => {
    pending = false;
    render();
    if (queued) { queued = false; schedule(); }
  }, { once: true });
  video.currentTime = Math.max(0.01, Math.min(t, dur - 0.05));
}

async function render() {
  await document.fonts.ready;
  document.querySelectorAll('.tool-thumb').forEach(btn => {
    const cv = btn.querySelector('canvas');
    renderThumb(cv.getContext('2d'), 180, 320, {
      source: video,
      styleId: btn.dataset.style,
      title: btn.dataset.style === 'clean' ? '' : title(),
    });
  });
}

function download(styleId) {
  if (!ready) return;
  const big = document.createElement('canvas');
  renderThumb(big.getContext('2d'), 1080, 1920, {
    source: video,
    styleId,
    title: styleId === 'clean' ? '' : title(),
  });
  big.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `popshot-thumb-${styleId}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}

document.getElementById('toolScrub').addEventListener('input', schedule);
document.getElementById('toolText').addEventListener('input', () => { if (ready && !pending) render(); });
