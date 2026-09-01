# ✦ Popshot

A fully in-browser caption studio for short-form video — a functional clone of the
makemoonshot.co workflow (upload → transcribe → style → edit words → hook →
thumbnail → export), built as a zero-backend static site. Not affiliated with
makemoonshot.co; all branding and copy here are original.

## What it does

- **Upload** an MP4/MOV/WebM talking-head clip (drag-drop on the landing page or the editor).
- **Transcribe on-device** — Whisper runs inside the browser via transformers.js
  (WebGPU when available, WASM otherwise). Nothing is uploaded anywhere.
  Fallback: paste the transcript manually and Popshot distributes word timings.
- **30+ designed caption styles** across Popular, Behind-the-Person, Playful,
  Multiline lockups, Dynamic, Editorial, Social, Neon & FX, Retro, Desi and
  Speakers — karaoke sweeps, boxed highlights, neon glow, glitch/VHS, pixel,
  squash-and-stretch, serif lockups with a hero word, lower-thirds, quote cards.
- **Behind-the-subject captions** — words render *behind* the speaker using
  MediaPipe person segmentation, live in preview and identical in export.
- **Edit words, not a timeline** — click a word to fix it, ✕ to cut it,
  one-click filler removal. Captions resync instantly. Playback highlights the
  spoken word in the transcript.
- **Hook suggestions** scored from your own transcript (heuristics, no API key).
- **Thumbnail builder** — scrub to any frame, five text treatments,
  1080×1920 PNG download.
- **Export** — renders the exact preview composition. 9:16 / 1:1 / 16:9.
  H.264 MP4 in Chrome, WebM elsewhere, original audio included.

## Run it

Any static file server works:

```bash
cd popshot && python3 -m http.server 8020
```

Then open http://localhost:8020 (landing) or http://localhost:8020/editor.html
(editor). Click **“Or try the sample clip”** in the editor to test without your
own footage.

First transcription downloads the Whisper model (~40–80 MB) from the HuggingFace
CDN and caches it in the browser. Behind-the-subject styles download the
MediaPipe segmentation model on first use.

## Configuration

All tunables are in [js/config.js](js/config.js): app name, Whisper model ids,
filler-word list, caption grouping, export fps/bitrate/sizes/codecs, hook
heuristics, segmentation model URLs.

Caption styles are pure data in [js/presets.js](js/presets.js) — add a new style
by appending an object (fonts, colors, grouping, emphasis, animation, position);
it appears in the gallery and editor automatically. Add any new font family to
`FONT_FAMILIES` in the same file.

## Files

| File | Purpose |
|---|---|
| `index.html` + `css/landing.css` + `js/landing.js` | Marketing landing page with live style gallery |
| `editor.html` + `css/editor.css` + `js/editor.js` | The 5-step editor app |
| `js/engine.js` | Canvas caption renderer (grouping, layout, animation, FX) |
| `js/presets.js` | Style + category definitions (pure data) |
| `js/transcribe.js` | In-browser Whisper + manual-transcript fallback |
| `js/hooks.js` | Hook-line scoring |
| `js/exporter.js` | MediaRecorder-based renderer (MP4/WebM) |
| `js/segmenter.js` | MediaPipe person masks for behind-the-subject styles |
| `js/handoff.js` | IndexedDB file handoff landing → editor |
| `assets/demo.mp4` | Bundled sample clip (synthesized speech) |

## Browser support

Chrome/Edge give the full experience (WebGPU Whisper, MP4 export). Safari and
Firefox work with WASM transcription and WebM export. Everything is client-side;
there is no server component and no account system.
