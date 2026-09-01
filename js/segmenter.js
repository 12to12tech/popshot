// ---------------------------------------------------------------------------
// Popshot — person segmentation for behind-the-subject captions
// Uses MediaPipe tasks-vision (selfie segmenter) loaded on demand from CDN.
// Produces a soft alpha-mask canvas of the speaker for each frame.
// ---------------------------------------------------------------------------

import { CONFIG } from './config.js';

let segmenterPromise = null;

export async function getSegmenter() {
  if (segmenterPromise) return segmenterPromise;
  segmenterPromise = (async () => {
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
    const files = await vision.FilesetResolver.forVisionTasks(CONFIG.segmentation.wasmBase);
    return vision.ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: CONFIG.segmentation.modelUrl, delegate: 'GPU' },
      runningMode: 'VIDEO',
      outputConfidenceMasks: true,
    });
  })();
  return segmenterPromise;
}

// Maintains a mask canvas matched to the video frame; call update(video, tMs)
// each frame you need a fresh mask.
export class MaskTracker {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ready = false;
    this.failed = false;
    this._lastTs = -1;
  }

  async init() {
    try {
      this.segmenter = await getSegmenter();
      this.ready = true;
    } catch (e) {
      console.warn('Segmentation unavailable, behind-subject styles will render in front:', e);
      this.failed = true;
    }
    return this.ready;
  }

  // returns the mask canvas (person = opaque white) or null
  update(video, tMs) {
    if (!this.ready) return null;
    if (tMs <= this._lastTs) tMs = this._lastTs + 1; // MediaPipe needs monotonic timestamps
    this._lastTs = tMs;
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return null;
    if (this.canvas.width !== w) { this.canvas.width = w; this.canvas.height = h; }
    let out = null;
    try {
      const res = this.segmenter.segmentForVideo(video, tMs);
      const mask = res.confidenceMasks?.[0];
      if (mask) {
        const data = mask.getAsFloat32Array();
        const img = this.ctx.createImageData(w, h);
        for (let i = 0; i < data.length; i++) {
          const a = Math.min(255, Math.max(0, data[i] * 255));
          const o = i * 4;
          img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255;
          img.data[o + 3] = a;
        }
        this.ctx.putImageData(img, 0, 0);
        out = this.canvas;
        mask.close();
      }
      res.close?.();
    } catch (e) {
      console.warn('segmentForVideo failed', e);
    }
    return out;
  }
}
