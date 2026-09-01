// ---------------------------------------------------------------------------
// Popshot — global configuration
// Everything tunable lives here so behavior can be changed without touching
// engine code.
// ---------------------------------------------------------------------------

export const CONFIG = {
  appName: 'Popshot',
  tagline: 'make your videos pop.',

  // Transcription (runs fully in-browser via transformers.js / Whisper)
  transcription: {
    // Models are downloaded once from the HuggingFace CDN and cached by the browser.
    // "_timestamped" exports include cross-attentions, required for word-level timestamps
    models: {
      fast:     'onnx-community/whisper-tiny.en_timestamped',  // English only, quickest
      balanced: 'onnx-community/whisper-base_timestamped',     // multilingual (Hinglish etc.)
    },
    defaultModel: 'fast',
    chunkLengthS: 28,
    strideLengthS: 4,
  },

  // Words treated as fillers by the one-click "Remove fillers" action
  fillerWords: ['um', 'uh', 'uhm', 'erm', 'hmm', 'like', 'you know', 'basically', 'actually', 'literally'],

  // Caption grouping defaults (presets can override)
  captions: {
    maxWordsPerGroup: 4,
    maxGapS: 0.8,           // start a new group after a silence longer than this
    minWordDurS: 0.12,
  },

  // Export
  export: {
    fps: 30,
    videoBitsPerSecond: 12_000_000,
    // Output canvas sizes by aspect choice
    sizes: {
      '9:16':  { w: 1080, h: 1920 },
      '1:1':   { w: 1080, h: 1080 },
      '16:9':  { w: 1920, h: 1080 },
    },
    defaultAspect: '9:16',
    // Tried in order; first one whose encoder actually initializes wins
    // (isTypeSupported alone lies — some encoders refuse portrait 1080x1920 at init)
    mimeCandidates: [
      'video/mp4;codecs=avc1.64002a,mp4a.40.2',  // high profile, level 4.2
      'video/mp4;codecs=avc1.42e02a,mp4a.40.2',  // baseline, level 4.2
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ],
  },

  // Behind-the-subject captions (person segmentation)
  segmentation: {
    // MediaPipe tasks-vision, loaded from CDN on demand
    wasmBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    modelUrl: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  },

  // Hook suggestion heuristics
  hooks: {
    maxSuggestions: 3,
    minWords: 4,
    maxWords: 14,
    // phrases that score a sentence up as a strong opener
    powerPatterns: [
      /^(stop|never|don'?t|why|how|what|here'?s|this is|most people|nobody|everyone|the biggest|if you|you)/i,
      /\d/,
      /\?$/,
      /(secret|mistake|wrong|truth|actually|hack|rule|lesson|problem)/i,
    ],
  },

  // Free-tier simulation on the landing page (display only — the app itself is fully unlocked)
  plans: {
    free:    { name: 'Free',    priceMonth: 0,  limit: '1 video · up to 2 min · preview only' },
    creator: { name: 'Creator', priceMonth: 9,  priceWeek: 3, priceYear: 104, limit: 'Unlimited videos · 45 min/week' },
    pro:     { name: 'Pro',     priceMonth: 18, priceWeek: 6, priceYear: 209, limit: 'Everything · 60 min/week' },
  },
};
