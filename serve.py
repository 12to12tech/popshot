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

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8020

MODEL_CANDIDATES = [
    os.path.expanduser('~/whisper-models/ggml-large-v3-turbo-q5_0.bin'),
    os.path.expanduser('~/whisper-models/ggml-large-v3-q5_0.bin'),
    os.path.expanduser('~/whisper-models/ggml-small.en.bin'),
]
WHISPER_CLI = shutil.which('whisper-cli')
FFMPEG = shutil.which('ffmpeg')
MODEL = next((m for m in MODEL_CANDIDATES if os.path.exists(m)), None)
LOCAL_ASR = bool(WHISPER_CLI and FFMPEG and MODEL)


def transcribe(media_bytes, lang):
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, 'input.bin')
        wav = os.path.join(td, 'audio.wav')
        out = os.path.join(td, 'out')
        with open(src, 'wb') as f:
            f.write(media_bytes)
        subprocess.run([FFMPEG, '-y', '-v', 'error', '-i', src,
                        '-ar', '16000', '-ac', '1', wav],
                       check=True, timeout=300)
        cmd = [WHISPER_CLI, '-m', MODEL, '-f', wav,
               '-ml', '1', '-sow',          # one word per segment
               '-oj', '-of', out,
               '-t', str(max(2, (os.cpu_count() or 4) - 2)),
               '-l', lang or 'auto']
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
        return super().do_GET()

    def do_POST(self):
        if not self.path.startswith('/transcribe'):
            return self._json(404, {'error': 'not found'})
        if not LOCAL_ASR:
            return self._json(503, {'error': 'local ASR unavailable'})
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length <= 0 or length > 2_000_000_000:
                return self._json(400, {'error': 'bad length'})
            body = self.rfile.read(length)
            lang = ''
            if '?' in self.path:
                for kv in self.path.split('?', 1)[1].split('&'):
                    if kv.startswith('lang='):
                        lang = kv[5:][:8]
            words = transcribe(body, lang)
            return self._json(200, {'words': words, 'model': os.path.basename(MODEL)})
        except subprocess.CalledProcessError as e:
            return self._json(500, {'error': f'transcription failed ({e})'})
        except Exception as e:  # noqa: BLE001 — surface anything to the client
            return self._json(500, {'error': str(e)})


if __name__ == '__main__':
    print(f'Popshot dev server :{PORT} — local ASR: {LOCAL_ASR}'
          + (f' ({os.path.basename(MODEL)})' if MODEL else ''))
    http.server.ThreadingHTTPServer(('', PORT), Handler).serve_forever()
