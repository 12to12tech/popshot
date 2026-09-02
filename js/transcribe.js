// ---------------------------------------------------------------------------
// Popshot — transcription
// Runs Whisper fully in-browser via transformers.js (model downloaded once
// from the HuggingFace CDN, then cached). Falls back to a paste-your-own
// transcript path with evenly distributed timings.
// ---------------------------------------------------------------------------

import { CONFIG } from './config.js';

let pipelinePromise = null;
let loadedModel = null;

async function getPipeline(modelKey, onProgress) {
  const modelId = CONFIG.transcription.models[modelKey] || CONFIG.transcription.models.fast;
  if (pipelinePromise && loadedModel === modelId) return pipelinePromise;
  loadedModel = modelId;
  const attempt = (async () => {
    const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3');
    env.allowLocalModels = false;
    let device = 'wasm', dtype = 'q8';
    if (navigator.gpu) {
      try { if (await navigator.gpu.requestAdapter()) { device = 'webgpu'; dtype = 'fp32'; } } catch { /* wasm fallback */ }
    }
    return pipeline('automatic-speech-recognition', modelId, {
      device, dtype,
      progress_callback: (p) => {
        if (p.status === 'progress' && onProgress) {
          onProgress(`Downloading model… ${p.file.split('/').pop()} ${Math.round(p.progress || 0)}%`);
        }
      },
    });
  })();
  // don't cache failures — a dropped connection must not poison every retry
  attempt.catch(() => {
    if (pipelinePromise === attempt) { pipelinePromise = null; loadedModel = null; }
  });
  pipelinePromise = attempt;
  return pipelinePromise;
}

// Decode a video/audio File into 16 kHz mono Float32Array for Whisper
async function decodeAudio(file, onProgress) {
  onProgress?.('Decoding audio…');
  const buf = await file.arrayBuffer();
  const ac = new AudioContext();
  const decoded = await ac.decodeAudioData(buf);
  ac.close();
  const targetRate = 16000;
  const frames = Math.ceil(decoded.duration * targetRate);
  const off = new OfflineAudioContext(1, frames, targetRate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return { audio: rendered.getChannelData(0), duration: decoded.duration };
}

// → [{ text, start, end, deleted:false }]
// `language` (ISO code like 'hi') hints multilingual models; English-only
// models ignore it.
export async function transcribeFile(file, { model = CONFIG.transcription.defaultModel, language = '', onProgress } = {}) {
  const { audio, duration } = await decodeAudio(file, onProgress);
  onProgress?.('Loading speech model…');
  const asr = await getPipeline(model, onProgress);
  onProgress?.('Transcribing…');
  const opts = {
    return_timestamps: 'word',
    chunk_length_s: CONFIG.transcription.chunkLengthS,
    stride_length_s: CONFIG.transcription.strideLengthS,
  };
  const modelId = CONFIG.transcription.models[model] || '';
  if (language && !modelId.includes('.en')) { opts.language = language; opts.task = 'transcribe'; }
  const out = await asr(audio, opts);
  const words = (out.chunks || [])
    .map(c => ({
      text: (c.text || '').trim(),
      start: c.timestamp?.[0] ?? 0,
      end: c.timestamp?.[1] ?? ((c.timestamp?.[0] ?? 0) + 0.3),
      deleted: false,
    }))
    .filter(w => w.text);
  // guard against null/overlapping tail timestamps
  let last = 0;
  for (const w of words) {
    if (!(w.start >= 0)) w.start = last;
    if (!(w.end > w.start)) w.end = w.start + 0.25;
    if (w.end > duration) w.end = duration;
    last = w.end;
  }
  return words;
}

// Fallback: user pastes text; spread timings across the clip duration,
// weighted by word length so long words hold a little longer.
export function timingsFromText(text, duration) {
  const raw = text.trim().split(/\s+/).filter(Boolean);
  if (!raw.length) return [];
  const weights = raw.map(w => Math.max(2, w.replace(/\W/g, '').length) + 1.5);
  const total = weights.reduce((a, b) => a + b, 0);
  const usable = Math.max(0.5, duration - 0.4);
  let t = 0.2;
  return raw.map((w, i) => {
    const d = (weights[i] / total) * usable;
    const word = { text: w, start: t, end: t + d * 0.9, deleted: false };
    t += d;
    return word;
  });
}
