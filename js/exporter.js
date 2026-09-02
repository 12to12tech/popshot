// ---------------------------------------------------------------------------
// Popshot — export
// Renders the exact preview composition to an offscreen canvas in real time
// while the clip plays, capturing canvas + original audio with MediaRecorder.
// MP4 (H.264) where the browser supports it, WebM otherwise.
// ---------------------------------------------------------------------------

import { CONFIG } from './config.js';
import { drawFrame } from './engine.js';

export function pickMimeType() {
  for (const m of CONFIG.export.mimeCandidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

// isTypeSupported() can approve a codec whose encoder then refuses to
// initialize at the target resolution. Probe each candidate with a short real
// recording at the output size and cache the first one that produces data.
const probeCache = new Map();
const probeInFlight = new Map();
export function findWorkingMime(w, h) {
  const key = `${w}x${h}`;
  if (probeCache.has(key)) return Promise.resolve(probeCache.get(key));
  if (probeInFlight.has(key)) return probeInFlight.get(key);
  const p = probeMimes(w, h, key).finally(() => probeInFlight.delete(key));
  probeInFlight.set(key, p);
  return p;
}
async function probeMimes(w, h, key) {
  for (const mime of CONFIG.export.mimeCandidates) {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(mime)) continue;
    const ok = await new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      try {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d');
        cx.fillStyle = '#000'; cx.fillRect(0, 0, w, h);
        const stream = c.captureStream(10);
        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_000_000 });
        rec.ondataavailable = (e) => { if (e.data.size > 0) { try { rec.stop(); } catch {} done(true); } };
        rec.onerror = () => done(false);
        rec.start(100);
        // keep frames flowing during the probe
        let n = 0;
        const paint = () => { cx.fillRect(0, 0, 2, 2); if (++n < 12 && !settled) requestAnimationFrame(paint); };
        paint();
        setTimeout(() => { try { rec.stop(); } catch {} done(false); }, 1500);
      } catch {
        done(false);
      }
    });
    if (ok) { probeCache.set(key, mime); return mime; }
  }
  probeCache.set(key, '');
  return '';
}

// opts: { video, groups, preset, aspect, maskTracker, speaker, layoutVersion,
//         hookTitle, broll, prepFrame(t), onProgress, signal }
// resolves { blob, ext, mime }
export async function exportVideo(opts) {
  const { video, groups, preset, aspect = CONFIG.export.defaultAspect, maskTracker,
          speaker, layoutVersion, hookTitle, broll, prepFrame, zoomFn, progressBar,
          audioStream: providedAudio, onStarted, onProgress, signal } = opts;
  const size = CONFIG.export.sizes[aspect] || CONFIG.export.sizes['9:16'];

  const canvas = document.createElement('canvas');
  canvas.width = size.w; canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  const scratch = document.createElement('canvas');
  scratch.width = size.w; scratch.height = size.h;

  onProgress?.(0);
  const mime = await findWorkingMime(size.w, size.h);
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';

  // canvas stream + audio. When the editor supplies a pre-mixed stream
  // (voice + SFX from its WebAudio graph), use that and leave the element's
  // volume alone — the graph controls what the user hears.
  const stream = canvas.captureStream(CONFIG.export.fps);
  let audioStream = providedAudio || null;
  if (!audioStream) {
    try {
      audioStream = video.captureStream ? video.captureStream() : video.mozCaptureStream?.();
    } catch { /* some browsers refuse before playback; retry after play() below */ }
  }

  const wasMuted = video.muted, wasTime = video.currentTime, wasVolume = video.volume;
  video.muted = false;         // muted elements produce silent capture tracks in some browsers
  if (!providedAudio) video.volume = 0.0001; // effectively silent for the user, audible to the recorder
  video.currentTime = 0;

  await video.play();
  onStarted?.();
  if (!audioStream) {
    try { audioStream = video.captureStream ? video.captureStream() : null; } catch { /* video-only export */ }
  }
  const at = audioStream?.getAudioTracks?.()[0];
  if (at) stream.addTrack(at);

  const rec = new MediaRecorder(stream, {
    mimeType: mime || undefined,
    videoBitsPerSecond: CONFIG.export.videoBitsPerSecond,
  });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const done = new Promise((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime || 'video/webm' }));
    rec.onerror = (e) => reject(e.error || new Error('Recorder error'));
  });
  rec.start(250);

  // Driven by setInterval, not requestAnimationFrame — rAF pauses in hidden
  // or occluded windows, which would stall the export at 0% forever.
  const duration = video.duration;
  let timer = null, busy = false, finished = false;
  const tick = () => {
    if (busy || finished) return;
    busy = true;
    try {
      if (signal?.aborted) { finish(); return; }
      const t = video.currentTime;
      let mask = null;
      if (preset.behind && maskTracker?.ready) mask = maskTracker.update(video, performance.now());
      prepFrame?.(t);
      drawFrame(ctx, video, t, groups, preset, {
        mask, scratch, speaker, layoutVersion, hookTitle, broll,
        zoom: zoomFn?.(t) || 1,
        progress: progressBar ? t / duration : null,
      });
      onProgress?.(Math.min(1, t / duration));
      if (video.ended || t >= duration - 0.03) finish();
    } finally {
      busy = false;
    }
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    if (rec.state !== 'inactive') rec.stop();
    video.pause();
    video.muted = wasMuted;
    video.volume = providedAudio ? wasVolume : 1;
    video.currentTime = wasTime;
  };
  const onEnded = () => finish();
  video.addEventListener('ended', onEnded, { once: true });
  timer = setInterval(tick, Math.max(10, Math.floor(1000 / CONFIG.export.fps)));
  tick();

  const blob = await done;
  video.removeEventListener('ended', onEnded);
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  return { blob, ext, mime: mime || 'video/webm' };
}
