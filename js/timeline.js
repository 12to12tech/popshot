// ---------------------------------------------------------------------------
// Popshot — editor timeline
// Canvas-based, four rows: time ruler, caption track (Lines or Words mode),
// and a B-roll track. Click/drag the ruler or empty space to scrub. In Words
// mode drag a word block to move it, drag its edges to retime. B-roll blocks
// move/resize the same way. Zoom + horizontal scroll for long clips.
// ---------------------------------------------------------------------------

const ROW_RULER = 20;
const ROW_CAPS = 34;
const ROW_BROLL = 24;
const PAD_X = 12;
const EDGE_PX = 6;          // grab zone for edge resize
const MIN_WORD_DUR = 0.08;
const MIN_BROLL_DUR = 0.3;

export class Timeline {
  // api: { getWords, getGroups, getBroll, getDuration, getTime, seek(t),
  //        onWordsChanged(), onBrollChanged(), onSelect(kind, index) }
  constructor(canvas, api) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.api = api;
    this.mode = 'words';    // 'words' | 'lines'
    this.zoom = 1;          // 1 = whole clip fits
    this.scrollX = 0;
    this.selected = -1;     // word index (words mode)
    this.selectedBroll = -1;
    this.drag = null;
    this._dirty = true;

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', (e) => this._up(e));
    canvas.addEventListener('wheel', (e) => {
      if (this.zoom <= 1) return;
      e.preventDefault();
      this._setScroll(this.scrollX + (e.deltaX || e.deltaY));
    }, { passive: false });

    this._ro = new ResizeObserver(() => { this._resize(); this.markDirty(); });
    this._ro.observe(canvas.parentElement || canvas);
    this._resize();
  }

  markDirty() { this._dirty = true; }
  setMode(m) { this.mode = m; this.markDirty(); }

  setZoom(z) {
    const t = this.api.getTime();
    this.zoom = Math.max(1, Math.min(16, z));
    const px = this._xOf(t);
    const w = this._cssW();
    if (px < PAD_X || px > w - PAD_X) this._setScroll(this._contentX(t) - w / 2);
    else this._setScroll(this.scrollX);
    this.markDirty();
  }

  setSelected(i) { this.selected = i; this.markDirty(); }

  // ── geometry ────────────────────────────────────────────────────────────
  _cssW() { return this.canvas.clientWidth || 600; }
  _cssH() { return ROW_RULER + ROW_CAPS + ROW_BROLL + 12; }
  _trackW() { return (this._cssW() - PAD_X * 2) * this.zoom; }
  _pps() { return this._trackW() / Math.max(0.01, this.api.getDuration()); }
  _contentX(t) { return PAD_X + t * this._pps(); }
  _xOf(t) { return this._contentX(t) - this.scrollX; }
  _tOf(x) { return Math.max(0, Math.min(this.api.getDuration(), (x + this.scrollX - PAD_X) / this._pps())); }
  _setScroll(v) {
    const max = Math.max(0, this._trackW() + PAD_X * 2 - this._cssW());
    this.scrollX = Math.max(0, Math.min(max, v));
    this.markDirty();
  }
  _capsTop() { return ROW_RULER + 4; }
  _brollTop() { return ROW_RULER + ROW_CAPS + 8; }

  _resize() {
    const dpr = devicePixelRatio || 1;
    const w = this._cssW(), h = this._cssH();
    this.canvas.style.height = h + 'px';
    if (this.canvas.width !== Math.round(w * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
  }

  // ── input ───────────────────────────────────────────────────────────────
  // Blocks are hit in two passes so an interior click always beats a
  // neighbour's edge zone, and blocks too narrow for edge handles (< 3×EDGE_PX)
  // always move — dragging a 5px word must never silently retime it.
  _hitBlocks(x, kind, items) {
    // pass 1: interior
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.skip) continue;
      const x0 = this._xOf(it.s), x1 = this._xOf(it.e);
      if (x < x0 || x > x1) continue;
      const bw = x1 - x0;
      if (bw < EDGE_PX * 3) return { type: 'move', kind, i };
      if (x - x0 <= EDGE_PX) return { type: 'resize-l', kind, i };
      if (x1 - x <= EDGE_PX) return { type: 'resize-r', kind, i };
      return { type: 'move', kind, i };
    }
    // pass 2: edge tolerance just outside a block
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.skip) continue;
      const x0 = this._xOf(it.s), x1 = this._xOf(it.e);
      if (x1 - x0 < EDGE_PX * 3) continue;
      if (Math.abs(x - x0) <= EDGE_PX) return { type: 'resize-l', kind, i };
      if (Math.abs(x - x1) <= EDGE_PX) return { type: 'resize-r', kind, i };
    }
    return null;
  }

  _hit(x, y) {
    const capsTop = this._capsTop(), capsH = ROW_CAPS - 8;
    const brTop = this._brollTop(), brH = ROW_BROLL - 6;

    if (y >= capsTop && y <= capsTop + capsH && this.mode === 'words') {
      const hit = this._hitBlocks(x, 'word',
        this.api.getWords().map(w => ({ s: w.start, e: w.end, skip: w.deleted })));
      if (hit) return hit;
    }
    if (y >= capsTop && y <= capsTop + capsH && this.mode === 'lines') {
      const groups = this.api.getGroups();
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (x >= this._xOf(g.start) && x <= this._xOf(g.hold ?? g.end)) return { type: 'line', kind: 'line', i };
      }
    }
    if (y >= brTop && y <= brTop + brH) {
      const hit = this._hitBlocks(x, 'broll',
        (this.api.getBroll?.() || []).map(b => ({ s: b.start, e: b.start + b.dur })));
      if (hit) return hit;
    }
    return { type: 'seek' };
  }

  _down(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = this._hit(x, y);
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }

    if (hit.type === 'seek') {
      this.drag = { type: 'seek' };
      this.api.seek(this._tOf(x));
    } else if (hit.type === 'line') {
      const g = this.api.getGroups()[hit.i];
      this.api.seek(g.start + 0.01);
      this.drag = { type: 'seek' };
    } else if (hit.kind === 'word') {
      const w = this.api.getWords()[hit.i];
      this.selected = hit.i;
      this.selectedBroll = -1;
      this.api.onSelect?.('word', hit.i);
      this.drag = { ...hit, x0: x, start0: w.start, end0: w.end, changed: false };
      this.api.seek(w.start + 0.01);
    } else { // broll
      const b = (this.api.getBroll?.() || [])[hit.i];
      this.selectedBroll = hit.i;
      this.selected = -1;
      this.api.onSelect?.('broll', hit.i);
      this.drag = { ...hit, x0: x, start0: b.start, dur0: b.dur, changed: false };
    }
    this.markDirty();
  }

  _move(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (!this.drag) {
      const hit = this._hit(x, y);
      this.canvas.style.cursor =
        hit.type === 'move' ? 'grab' :
        hit.type === 'seek' || hit.type === 'line' ? 'default' : 'ew-resize';
      return;
    }
    if (this.drag.type === 'seek') { this.api.seek(this._tOf(x)); this.markDirty(); return; }

    const dt = (x - this.drag.x0) / this._pps();
    const dur = this.api.getDuration();

    if (this.drag.kind === 'word') {
      const words = this.api.getWords();
      const w = words[this.drag.i];
      let prevEnd = 0, nextStart = dur;
      for (let j = this.drag.i - 1; j >= 0; j--) if (!words[j].deleted) { prevEnd = words[j].end - 0.02; break; }
      for (let j = this.drag.i + 1; j < words.length; j++) if (!words[j].deleted) { nextStart = words[j].start + 0.02; break; }
      if (this.drag.type === 'move') {
        const d = this.drag.end0 - this.drag.start0;
        let s = Math.max(prevEnd, Math.min(nextStart - d, this.drag.start0 + dt));
        w.start = s; w.end = s + d;
      } else if (this.drag.type === 'resize-l') {
        w.start = Math.max(prevEnd, Math.min(this.drag.end0 - MIN_WORD_DUR, this.drag.start0 + dt));
      } else {
        w.end = Math.min(nextStart, Math.max(this.drag.start0 + MIN_WORD_DUR, this.drag.end0 + dt));
      }
    } else { // broll
      const b = (this.api.getBroll?.() || [])[this.drag.i];
      if (!b) return;
      if (this.drag.type === 'move') {
        b.start = Math.max(0, Math.min(dur - this.drag.dur0, this.drag.start0 + dt));
      } else if (this.drag.type === 'resize-l') {
        const end = this.drag.start0 + this.drag.dur0;
        b.start = Math.max(0, Math.min(end - MIN_BROLL_DUR, this.drag.start0 + dt));
        b.dur = end - b.start;
      } else {
        b.dur = Math.max(MIN_BROLL_DUR, Math.min(dur - b.start, this.drag.dur0 + dt));
      }
    }
    this.drag.changed = true;
    this.markDirty();
  }

  _up(e) {
    if (this.drag && this.drag.changed) {
      if (this.drag.kind === 'broll') this.api.onBrollChanged?.();
      else this.api.onWordsChanged?.();
    }
    this.drag = null;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }

  // ── drawing ─────────────────────────────────────────────────────────────
  draw(playing) {
    if (!this._dirty && !playing) return;
    this._dirty = false;
    this._resize();
    const ctx = this.ctx;
    const dpr = devicePixelRatio || 1;
    const W = this._cssW(), H = this._cssH();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const dur = this.api.getDuration();
    if (!dur) return;

    const t = this.api.getTime();
    if (playing) {
      const px = this._xOf(t);
      if (px > W - 60) this._setScroll(this.scrollX + (px - (W - 60)));
      else if (px < 60) this._setScroll(this.scrollX - (60 - px));
    }

    // ruler
    const pps = this._pps();
    let step = 1;
    for (const s of [0.5, 1, 2, 5, 10, 30, 60]) { if (s * pps >= 46) { step = s; break; } step = s; }
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b8b96';
    ctx.strokeStyle = '#e3e1d6';
    ctx.textBaseline = 'top';
    for (let s = 0; s <= dur + 1e-6; s += step) {
      const x = this._xOf(s);
      if (x < -20 || x > W + 20) continue;
      ctx.beginPath(); ctx.moveTo(x, ROW_RULER - 6); ctx.lineTo(x, H); ctx.stroke();
      const mm = Math.floor(s / 60), ss = (s % 60);
      const label = mm ? `${mm}:${String(Math.floor(ss)).padStart(2, '0')}` : (step < 1 ? ss.toFixed(1) : `${Math.floor(ss)}`) + 's';
      ctx.fillText(label, x + 3, 2);
    }
    // track labels
    ctx.font = '800 8px "JetBrains Mono", monospace';
    ctx.fillStyle = '#a1a1ac';
    ctx.fillText('CAPTIONS', PAD_X, this._capsTop() - 2);
    ctx.fillText('B-ROLL', PAD_X, this._brollTop() - 2);

    const capsTop = this._capsTop() + 6, capsH = ROW_CAPS - 14;
    ctx.textBaseline = 'middle';

    if (this.mode === 'lines') {
      ctx.font = '700 10px Inter';
      for (const g of this.api.getGroups()) {
        const x0 = this._xOf(g.start), x1 = this._xOf(g.hold ?? g.end);
        if (x1 < 0 || x0 > W) continue;
        const bw = Math.max(2, x1 - x0);
        const activeNow = t >= g.start && t < (g.hold ?? g.end);
        ctx.fillStyle = activeNow ? '#5145cd' : '#e9e7f8';
        ctx.strokeStyle = activeNow ? '#5145cd' : '#c9c5ec';
        rr(ctx, x0, capsTop, bw, capsH, 5); ctx.fill(); ctx.stroke();
        if (bw > 34) {
          ctx.save();
          ctx.beginPath(); ctx.rect(x0 + 4, capsTop, bw - 8, capsH); ctx.clip();
          ctx.fillStyle = activeNow ? '#fff' : '#3a3653';
          ctx.fillText(g.words.map(w => w.text).join(' '), x0 + 6, capsTop + capsH / 2 + 0.5);
          ctx.restore();
        }
      }
    } else {
      const words = this.api.getWords();
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const x0 = this._xOf(w.start), x1 = this._xOf(w.end);
        if (x1 < 0 || x0 > W) continue;
        const bw = Math.max(2, x1 - x0);
        const activeNow = !w.deleted && t >= w.start && t < w.end;
        ctx.fillStyle = w.deleted ? '#efeee8' :
                        activeNow ? '#5145cd' :
                        i === this.selected ? '#d6d2f2' : '#f2f1fb';
        ctx.strokeStyle = i === this.selected ? '#5145cd' : '#d9d6ee';
        rr(ctx, x0, capsTop, bw, capsH, 5); ctx.fill(); ctx.stroke();
        if (w.deleted && bw > 8) {
          ctx.strokeStyle = '#c9c7bd';
          ctx.beginPath(); ctx.moveTo(x0 + 2, capsTop + capsH - 3); ctx.lineTo(x1 - 2, capsTop + 3); ctx.stroke();
        }
        if (bw > 22) {
          ctx.save();
          ctx.beginPath(); ctx.rect(x0 + 3, capsTop, bw - 6, capsH); ctx.clip();
          ctx.font = '600 10px Inter';
          ctx.fillStyle = w.deleted ? '#b6b4aa' : activeNow ? '#ffffff' : '#3a3653';
          ctx.fillText(w.text, x0 + 5, capsTop + capsH / 2 + 0.5);
          ctx.restore();
        }
        if (i === this.selected && !w.deleted && bw > 14) {
          ctx.fillStyle = '#5145cd';
          ctx.fillRect(x0 - 1.5, capsTop + 2, 3, capsH - 4);
          ctx.fillRect(x1 - 1.5, capsTop + 2, 3, capsH - 4);
        }
      }
    }

    // b-roll track
    const brTop = this._brollTop() + 6, brH = ROW_BROLL - 10;
    const broll = this.api.getBroll?.() || [];
    ctx.font = '700 9px Inter';
    for (let i = 0; i < broll.length; i++) {
      const b = broll[i];
      const x0 = this._xOf(b.start), x1 = this._xOf(b.start + b.dur);
      if (x1 < 0 || x0 > W) continue;
      const bw = Math.max(2, x1 - x0);
      ctx.fillStyle = i === this.selectedBroll ? '#0d9488' : '#99e6dd';
      ctx.strokeStyle = '#0d9488';
      rr(ctx, x0, brTop, bw, brH, 4); ctx.fill(); ctx.stroke();
      if (bw > 30) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x0 + 3, brTop, bw - 6, brH); ctx.clip();
        ctx.fillStyle = i === this.selectedBroll ? '#fff' : '#0f4740';
        ctx.fillText((b.kind === 'video' ? '▶ ' : '🖼 ') + (b.name || 'b-roll'), x0 + 5, brTop + brH / 2 + 0.5);
        ctx.restore();
      }
    }

    // playhead
    const px = this._xOf(t);
    ctx.strokeStyle = '#16161c';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, 2); ctx.lineTo(px, H - 2); ctx.stroke();
    ctx.fillStyle = '#16161c';
    ctx.beginPath();
    ctx.moveTo(px - 5, 2); ctx.lineTo(px + 5, 2); ctx.lineTo(px, 10); ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1;
  }
}

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
