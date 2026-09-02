// ---------------------------------------------------------------------------
// Popshot — punch-in sound effects
// WebAudio-synthesized whoosh and pop (no audio assets), scheduled at the
// auto-zoom moments. One audio graph serves both jobs: monitoring during
// preview, and a clean mixed stream (voice + SFX) for the exporter.
// ---------------------------------------------------------------------------

let ctx = null;
let elSource = null;
let monitorGain = null;   // video voice → speakers (preview listening)
let recordDest = null;    // video voice + SFX → export stream
let scheduled = [];

export function sfxReady() { return !!ctx; }

// Must be called from a user gesture the first time (autoplay policy).
export function sfxInit(video) {
  if (ctx) return true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    elSource = ctx.createMediaElementSource(video);   // reroutes the element's audio
    monitorGain = ctx.createGain();
    recordDest = ctx.createMediaStreamDestination();
    elSource.connect(monitorGain);
    monitorGain.connect(ctx.destination);
    elSource.connect(recordDest);
    ctx.resume();
    return true;
  } catch (e) {
    console.warn('sfx graph init failed', e);
    ctx = null;
    return false;
  }
}

export function setMonitor(on) {
  if (monitorGain) monitorGain.gain.value = on ? 1 : 0;
}

export function recordStream() {
  return recordDest ? recordDest.stream : null;
}

function connectOut(node, { monitor, record }) {
  if (monitor) node.connect(ctx.destination);
  if (record) node.connect(recordDest);
}

// Airy noise sweep — marks a sentence-start push
function whoosh(at, outs) {
  const dur = 0.3;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.1;
  f.frequency.setValueAtTime(350, at);
  f.frequency.exponentialRampToValueAtTime(2400, at + dur * 0.75);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.4, at + 0.07);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f); f.connect(g);
  connectOut(g, outs);
  src.start(at); src.stop(at + dur + 0.02);
  scheduled.push(src);
}

// Rounded thump with a pitch drop — marks a keyword punch
function pop(at, outs) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(620, at);
  osc.frequency.exponentialRampToValueAtTime(170, at + 0.14);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.55, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  osc.connect(g);
  connectOut(g, outs);
  osc.start(at); osc.stop(at + 0.2);
  scheduled.push(osc);
}

export function cancelSfx() {
  for (const s of scheduled) { try { s.stop(); } catch { /* already done */ } }
  scheduled = [];
}

// Schedule every upcoming punch-in relative to the current playhead.
// `videoT` is where playback stands right now; keyword punches (amount .12) pop,
// sentence punches whoosh.
export function scheduleZoomSfx(zoomPlan, videoT, outs = { monitor: true, record: false }) {
  if (!ctx) return 0;
  cancelSfx();
  const now = ctx.currentTime;
  let n = 0;
  for (const z of zoomPlan) {
    const dt = (z.start + 0.12) - videoT;   // hit at the visual punch moment
    if (dt < -0.05) continue;
    const at = now + Math.max(0.01, dt);
    (z.amount >= 0.11 ? pop : whoosh)(at, outs);
    n++;
  }
  return n;
}
