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
    // Segmentation is by far the most expensive per-frame step; running it at
    // ~15 Hz and reusing the last mask in between keeps the preview at 60 fps
    // with no visible difference in the composite.
    this.minIntervalMs = 66;
    this._lastRun = -Infinity;
    this._hasMask = false;
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
  // Perf: segmentation runs on a downscaled copy of the frame (≤320px wide) —
  // the model resizes internally anyway, and a small mask means the per-pixel
  // alpha write is ~5× cheaper. Upscaling the mask with smoothing also gives a
  // softer cutout edge. The ImageData buffer is allocated once with RGB
  // prefilled, so each frame only touches the alpha channel.
  update(video, tMs) {
    if (!this.ready) return null;
    // throttle: reuse the previous mask between runs
    if (tMs - this._lastRun < this.minIntervalMs) return this._hasMask ? this.canvas : null;
    this._lastRun = tMs;
    if (tMs <= this._lastTs) tMs = this._lastTs + 1; // MediaPipe needs monotonic timestamps
    this._lastTs = tMs;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const w = Math.min(320, vw);
    const h = Math.round(vh * (w / vw));
    if (!this.inCanvas) { this.inCanvas = document.createElement('canvas'); this.inCtx = this.inCanvas.getContext('2d', { willReadFrequently: false }); }
    if (this.inCanvas.width !== w || this.inCanvas.height !== h) { this.inCanvas.width = w; this.inCanvas.height = h; this._imgData = null; }
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this._imgData = null; }
    this.inCtx.drawImage(video, 0, 0, w, h);
    let out = null;
    try {
      const res = this.segmenter.segmentForVideo(this.inCanvas, tMs);
      const mask = res.confidenceMasks?.[0];
      if (mask) {
        const data = mask.getAsFloat32Array();
        if (!this._imgData || this._imgData.data.length !== data.length * 4) {
          this._imgData = this.ctx.createImageData(w, h);
          const d = this._imgData.data;
          for (let i = 0; i < d.length; i += 4) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; }
        }
        const d = this._imgData.data;
        for (let i = 0; i < data.length; i++) d[i * 4 + 3] = data[i] * 255;
        this.ctx.putImageData(this._imgData, 0, 0);
        out = this.canvas;
        this._hasMask = true;
        mask.close();
      }
      res.close?.();
    } catch (e) {
      console.warn('segmentForVideo failed', e);
    }
    return out;
  }
}
