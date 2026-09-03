// ---------------------------------------------------------------------------
// Popshot Paper — export
//
// Every exporter drives the same render(ctx, W, H, t) callback the preview
// uses, so what you download is what you watched. Three targets:
//   PNG   — one frame, alpha preserved
//   GIF   — gifenc, optional one-bit transparency
//   Video — MediaRecorder (MP4 where the browser encodes it, WebM otherwise),
//           on a solid or chroma-key background since video has no alpha
// ---------------------------------------------------------------------------

import { findWorkingMime } from './exporter.js';

export const GREEN_SCREEN = '#00b140';

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

function frameCanvas(W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return c;
}

function paintBg(ctx, W, H, bg) {
  ctx.clearRect(0, 0, W, H);
  if (!bg || bg === 'transparent') return;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
}

// ── PNG ───────────────────────────────────────────────────────────────────
export async function exportPNG({ render, W, H, bg, t = 1, name = 'popshot-paper.png' }) {
  const c = frameCanvas(W, H);
  const ctx = c.getContext('2d');
  paintBg(ctx, W, H, bg);
  await render(ctx, W, H, t);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  download(blob, name);
  return blob;
}

// ── GIF ───────────────────────────────────────────────────────────────────
let gifencPromise = null;
function loadGifenc() {
  if (!gifencPromise) gifencPromise = import('https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm');
  return gifencPromise;
}

export async function exportGIF({
  render, W, H, bg, fps = 20, dur = 2, loops = 1,
  transparent = false, name = 'popshot-paper.gif', onProgress,
}) {
  const { GIFEncoder, quantize, applyPalette } = await loadGifenc();
  const c = frameCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const gif = GIFEncoder();
  const total = Math.max(2, Math.round(fps * dur * loops));
  const delay = Math.round(1000 / fps);

  for (let i = 0; i < total; i++) {
    const t = ((i / (fps * dur)) % 1);
    paintBg(ctx, W, H, transparent ? null : bg);
    await render(ctx, W, H, t);
    const data = ctx.getImageData(0, 0, W, H).data;

    if (transparent) {
      // one-bit alpha: GIF has no partial transparency, so commit each pixel
      for (let p = 3; p < data.length; p += 4) data[p] = data[p] < 128 ? 0 : 255;
    }
    const fmt = transparent ? 'rgba4444' : 'rgb565';
    const palette = quantize(data, 256, { format: fmt, oneBitAlpha: transparent });
    const index = applyPalette(data, palette, fmt);
    let tIdx = -1;
    if (transparent) {
      tIdx = palette.findIndex(p => p.length > 3 && p[3] === 0);
    }
    gif.writeFrame(index, W, H, {
      palette, delay,
      transparent: tIdx >= 0,
      transparentIndex: tIdx >= 0 ? tIdx : 0,
      dispose: tIdx >= 0 ? 2 : -1,
    });
    onProgress?.((i + 1) / total);
    if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));   // keep the UI alive
  }
  gif.finish();
  const blob = new Blob([gif.bytesView()], { type: 'image/gif' });
  download(blob, name);
  return blob;
}

// ── video ────────────────────────────────────────────────────────────────
// Two paths, in order of preference:
//
//  1. WebCodecs + mp4-muxer. Frames are encoded one at a time as fast as the
//     machine manages, so the output is deterministic and every frame lands.
//     The result is a real H.264 MP4 with a proper moov atom and a duration,
//     which is what players need in order to show a scrubber.
//
//  2. MediaRecorder. Records in real time and — in Chrome — emits a WebM with
//     no Duration element at all, so players cannot tell how long the clip is
//     and macOS cannot open VP9 WebM in the first place. Only used when
//     WebCodecs is missing, and then routed through the local ffmpeg endpoint
//     when one is listening.
const AVC_CODECS = ['avc1.640033', 'avc1.640028', 'avc1.4d0028', 'avc1.42001f'];

let muxerPromise = null;
const loadMuxer = () => (muxerPromise ||= import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/+esm'));

async function pickAvc(W, H, fps) {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of AVC_CODECS) {
    try {
      const cfg = { codec, width: W, height: H, bitrate: 12_000_000, framerate: fps };
      const s = await VideoEncoder.isConfigSupported(cfg);
      if (s?.supported) return cfg;
    } catch { /* try the next profile */ }
  }
  return null;
}

async function encodeMp4({ render, W, H, bg, fps, dur, loops, onProgress, signal }) {
  const cfg = await pickAvc(W, H, fps);
  if (!cfg) return null;
  const { Muxer, ArrayBufferTarget } = await loadMuxer();

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H },
    fastStart: 'in-memory',        // moov up front, so it streams and seeks
  });
  let failed = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failed = e; },
  });
  encoder.configure(cfg);

  const c = frameCanvas(W, H);
  const ctx = c.getContext('2d');
  const total = Math.max(2, Math.round(fps * dur * loops));
  const frameUs = 1e6 / fps;

  for (let i = 0; i < total; i++) {
    if (failed) throw failed;
    if (signal?.aborted) break;
    const t = (i / (fps * dur)) % 1;
    paintBg(ctx, W, H, bg || '#000');
    await render(ctx, W, H, t);
    const frame = new VideoFrame(c, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    // keep the encoder queue short so a long export does not balloon memory
    if (encoder.encodeQueueSize > 8) {
      await new Promise(r => setTimeout(r, 0));
      while (encoder.encodeQueueSize > 8 && !failed) await new Promise(r => setTimeout(r, 4));
    }
    onProgress?.((i + 1) / total);
  }
  await encoder.flush();
  encoder.close();
  if (failed) throw failed;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

// The dev server exposes ffmpeg at /finalize; when it is up, a fallback
// recording becomes a clean MP4 instead of a duration-less WebM.
let finalizeAvailable = null;
async function canFinalize() {
  if (finalizeAvailable !== null) return finalizeAvailable;
  try {
    const r = await fetch('/finalize/health', { signal: AbortSignal.timeout(2000) });
    finalizeAvailable = r.ok && (await r.json()).ok;
  } catch { finalizeAvailable = false; }
  return finalizeAvailable;
}

async function recordFallback({ render, W, H, bg, fps, dur, loops, onProgress }) {
  const c = frameCanvas(W, H);
  const ctx = c.getContext('2d');
  const mime = await findWorkingMime(W, H);
  const stream = c.captureStream(fps);
  const rec = new MediaRecorder(stream, {
    mimeType: mime || undefined,
    videoBitsPerSecond: 12_000_000,
  });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime || 'video/webm' }));
    rec.onerror = (e) => reject(e.error || new Error('recorder error'));
  });

  paintBg(ctx, W, H, bg);
  await render(ctx, W, H, 0);
  rec.start(200);

  const total = Math.max(2, Math.round(fps * dur * loops));
  // setInterval rather than rAF: rAF stalls in a backgrounded tab and would
  // leave the recording hanging at whatever frame it reached
  await new Promise((resolve) => {
    let i = 0;
    const timer = setInterval(async () => {
      if (i >= total) { clearInterval(timer); resolve(); return; }
      const t = (i / (fps * dur)) % 1;
      paintBg(ctx, W, H, bg);
      await render(ctx, W, H, t);
      onProgress?.(++i / total);
    }, 1000 / fps);
  });
  await new Promise(r => setTimeout(r, 250));   // let the tail flush
  rec.stop();
  let blob = await done;
  let ext = (mime || '').startsWith('video/mp4') ? 'mp4' : 'webm';
  if (await canFinalize()) {
    try {
      const res = await fetch('/finalize', { method: 'POST', body: blob });
      if (res.ok) { blob = await res.blob(); ext = 'mp4'; }
    } catch { /* keep the raw recording */ }
  }
  return { blob, ext };
}

export async function exportVideo({
  render, W, H, bg = GREEN_SCREEN, fps = 30, dur = 2, loops = 1,
  name = 'popshot-paper', onProgress, signal,
}) {
  let blob = null, ext = 'mp4', how = 'WebCodecs H.264';
  try {
    blob = await encodeMp4({ render, W, H, bg, fps, dur, loops, onProgress, signal });
  } catch (e) {
    console.warn('WebCodecs export failed, falling back to MediaRecorder:', e);
    blob = null;
  }
  if (!blob) {
    const r = await recordFallback({ render, W, H, bg, fps, dur, loops, onProgress });
    blob = r.blob; ext = r.ext; how = 'MediaRecorder';
  }
  download(blob, `${name}.${ext}`);
  return { blob, ext, how };
}
