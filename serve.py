#!/usr/bin/env python3
"""Popshot dev server.

Static files with caching disabled, plus a local transcription endpoint that
uses whisper.cpp (whisper-cli) with the large-v3-turbo model when present on
the machine — much faster and more accurate than the in-browser fallback.

  GET  /transcribe/health -> {"ok": true, "model": "..."} when local ASR works
  POST /transcribe?lang=hi -> {"words": [{"text","start","end"}]}
       (body = raw video/audio bytes)
"""
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8020

# .env (untracked) — DEEPSEEK_API_KEY=sk-... enables AI keyword picking
def _load_env():
    try:
        with open('.env') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass
_load_env()

LLM_KEY = os.environ.get('DEEPSEEK_API_KEY', '')
LLM_BASE = os.environ.get('DEEPSEEK_BASE', 'https://api.deepseek.com')
LLM_MODEL = os.environ.get('DEEPSEEK_MODEL', 'deepseek-chat')


def pick_keywords_llm(words, duration):
    """Ask the LLM which words deserve visual emphasis. Returns word indices."""
    target = max(2, min(10, round((duration or 30) / 6)))
    listing = ' '.join(f'{i}:{w["text"]}' for i, w in enumerate(words))
    prompt = (
        'You choose which words in a short-form video transcript deserve BIG visual '
        'emphasis (rendered huge behind the speaker). Pick the words that carry the '
        'meaning of each key moment: the topic nouns, numbers, charged verbs, names — '
        'never filler, pronouns or connectives. Spread picks across the video; at most '
        f'one per sentence. Pick exactly {target} or fewer.\n'
        'Transcript as index:word pairs:\n' + listing[:6000] + '\n'
        'Reply with ONLY a JSON array of the chosen indices, e.g. [3,17,42].'
    )
    body = json.dumps({
        'model': LLM_MODEL,
        'messages': [{'role': 'user', 'content': prompt}],
        'temperature': 0.2,
        'max_tokens': 200,
    }).encode()
    req = urllib.request.Request(
        LLM_BASE.rstrip('/') + '/chat/completions',
        data=body,
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {LLM_KEY}'},
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        out = json.load(res)
    text = out['choices'][0]['message']['content']
    start, end = text.find('['), text.rfind(']')
    idx = json.loads(text[start:end + 1])
    return [i for i in idx if isinstance(i, int) and 0 <= i < len(words)][:target]

MODEL_CANDIDATES = [
    os.path.expanduser('~/whisper-models/ggml-large-v3-turbo-q5_0.bin'),
    os.path.expanduser('~/whisper-models/ggml-large-v3-q5_0.bin'),
    os.path.expanduser('~/whisper-models/ggml-small.en.bin'),
]
# "best" trades speed for the full large-v3 decoder — noticeably better on
# code-switched Hinglish, where turbo invents English words for Hindi sounds
BEST_MODEL = os.path.expanduser('~/whisper-models/ggml-large-v3-q5_0.bin')
VAD_MODEL = os.path.expanduser('~/whisper-models/ggml-silero-v5.1.2.bin')
WHISPER_CLI = shutil.which('whisper-cli')
FFMPEG = shutil.which('ffmpeg')
MODEL = next((m for m in MODEL_CANDIDATES if os.path.exists(m)), None)
LOCAL_ASR = bool(WHISPER_CLI and FFMPEG and MODEL)


def transcribe(media_bytes, lang, quality='fast'):
    model = BEST_MODEL if quality == 'best' and os.path.exists(BEST_MODEL) else MODEL
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, 'input.bin')
        wav = os.path.join(td, 'audio.wav')
        out = os.path.join(td, 'out')
        with open(src, 'wb') as f:
            f.write(media_bytes)
        subprocess.run([FFMPEG, '-y', '-v', 'error', '-i', src,
                        '-ar', '16000', '-ac', '1', wav],
                       check=True, timeout=300)
        cmd = [WHISPER_CLI, '-m', model, '-f', wav,
               '-ml', '1', '-sow',          # one word per segment
               '-oj', '-of', out,
               '-t', str(max(2, (os.cpu_count() or 4) - 2)),
               '-l', lang or 'auto']
        # Silero VAD suppresses the hallucinated words that show up in
        # silences — a common source of nonsense tokens
        vad = ['--vad', '-vm', VAD_MODEL] if os.path.exists(VAD_MODEL) else []
        try:
            subprocess.run(cmd + vad, check=True, timeout=1800,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except subprocess.CalledProcessError:
            if not vad:
                raise
            subprocess.run(cmd, check=True, timeout=1800,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        with open(out + '.json') as f:
            data = json.load(f)
    words = []
    for seg in data.get('transcription', []):
        text = (seg.get('text') or '').strip()
        if not text or text.startswith('[') or text.startswith('('):
            continue  # skip [MUSIC]/(noise) style annotations
        start = seg['offsets']['from'] / 1000.0
        end = seg['offsets']['to'] / 1000.0
        if end <= start:
            end = start + 0.15
        words.append({'text': text, 'start': round(start, 3), 'end': round(end, 3)})
    return words


def finalize_video(media_bytes):
    """Re-encode a browser recording to a socially bulletproof MP4.

    MediaRecorder output (WebM, or fragmented MP4 with no proper moov atom)
    reads as corrupt on WhatsApp and gets brutalized by Instagram. This
    produces H.264 high@4.0, yuv420p, 30fps, ~10Mbps with AAC 44.1kHz and
    +faststart — inside IG's recommended envelope so recompression is minimal.
    """
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, 'in.bin')
        out = os.path.join(td, 'out.mp4')
        with open(src, 'wb') as f:
            f.write(media_bytes)
        subprocess.run([
            FFMPEG, '-y', '-v', 'error', '-i', src,
            '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.0',
            '-pix_fmt', 'yuv420p', '-r', '30',
            '-b:v', '10M', '-maxrate', '12M', '-bufsize', '20M',
            '-c:a', 'aac', '-b:a', '192k', '-ar', '44100',
            '-movflags', '+faststart',
            out,
        ], check=True, timeout=1800)
        with open(out, 'rb') as f:
            return f.read()


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/transcribe/health'):
            return self._json(200, {
                'ok': LOCAL_ASR,
                'model': os.path.basename(MODEL) if MODEL else None,
            })
        if self.path.startswith('/keywords/health'):
            return self._json(200, {'ok': bool(LLM_KEY), 'model': LLM_MODEL if LLM_KEY else None})
        if self.path.startswith('/finalize/health'):
            return self._json(200, {'ok': bool(FFMPEG)})
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith('/finalize'):
            if not FFMPEG:
                return self._json(503, {'error': 'ffmpeg unavailable'})
            try:
                length = int(self.headers.get('Content-Length', 0))
                if length <= 0 or length > 4_000_000_000:
                    return self._json(400, {'error': 'bad length'})
                out = finalize_video(self.rfile.read(length))
                self.send_response(200)
                self.send_header('Content-Type', 'video/mp4')
                self.send_header('Content-Length', str(len(out)))
                self.end_headers()
                self.wfile.write(out)
                return None
            except Exception as e:  # noqa: BLE001
                return self._json(500, {'error': str(e)})
        if self.path.startswith('/keywords'):
            if not LLM_KEY:
                return self._json(503, {'error': 'no DEEPSEEK_API_KEY — add it to popshot/.env and restart'})
            try:
                length = int(self.headers.get('Content-Length', 0))
                payload = json.loads(self.rfile.read(length))
                words = payload.get('words', [])[:2000]
                idx = pick_keywords_llm(words, payload.get('duration', 0))
                return self._json(200, {'indices': idx, 'model': LLM_MODEL})
            except Exception as e:  # noqa: BLE001
                return self._json(500, {'error': str(e)})
        if not self.path.startswith('/transcribe'):
            return self._json(404, {'error': 'not found'})
        if not LOCAL_ASR:
            return self._json(503, {'error': 'local ASR unavailable'})
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length <= 0 or length > 2_000_000_000:
                return self._json(400, {'error': 'bad length'})
            body = self.rfile.read(length)
            lang, quality = '', 'fast'
            if '?' in self.path:
                for kv in self.path.split('?', 1)[1].split('&'):
                    if kv.startswith('lang='):
                        lang = kv[5:][:8]
                    elif kv.startswith('quality='):
                        quality = kv[8:][:8]
            words = transcribe(body, lang, quality)
            model = BEST_MODEL if quality == 'best' and os.path.exists(BEST_MODEL) else MODEL
            return self._json(200, {'words': words, 'model': os.path.basename(model)})
        except subprocess.CalledProcessError as e:
            return self._json(500, {'error': f'transcription failed ({e})'})
        except Exception as e:  # noqa: BLE001 — surface anything to the client
            return self._json(500, {'error': str(e)})


if __name__ == '__main__':
    print(f'Popshot dev server :{PORT} — local ASR: {LOCAL_ASR}'
          + (f' ({os.path.basename(MODEL)})' if MODEL else ''))
    http.server.ThreadingHTTPServer(('', PORT), Handler).serve_forever()
