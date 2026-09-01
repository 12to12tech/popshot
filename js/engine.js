// ---------------------------------------------------------------------------
// Popshot — caption engine
// Pure-canvas renderer. Takes word timings + a preset and draws the caption
// state for any time t. Used identically by the live preview and the export,
// so what you see is what you download.
// ---------------------------------------------------------------------------

import { CONFIG } from './config.js';

// ── Grouping ────────────────────────────────────────────────────────────────
// Splits the word list into caption "pages" based on the preset's grouping
// mode, max word count and silence gaps. Deleted words are skipped entirely.

export function groupWords(words, preset) {
  const live = words.filter(w => !w.deleted && w.text.trim());
  const maxWords = preset.grouping.maxWords || CONFIG.captions.maxWordsPerGroup;
  const maxGap = CONFIG.captions.maxGapS;
  const groups = [];
  let cur = null;

  for (const w of live) {
    const startNew =
      !cur ||
      cur.words.length >= maxWords ||
      (w.start - cur.end) > maxGap ||
      /[.!?]$/.test(cur.words[cur.words.length - 1].text);
    if (startNew) {
      cur = { start: w.start, end: w.end, words: [] };
      groups.push(cur);
    }
    cur.words.push(w);
    cur.end = Math.max(cur.end, w.end);
  }
  // pad group end slightly so captions don't vanish between words
  for (let i = 0; i < groups.length; i++) {
    const next = groups[i + 1];
    groups[i].hold = next ? Math.min(next.start, groups[i].end + 0.35) : groups[i].end + 0.6;
  }
  return groups;
}

export function groupAt(groups, t) {
  for (const g of groups) if (t >= g.start - 0.05 && t < g.hold) return g;
  return null;
}

// ── Easing ─────────────────────────────────────────────────────────────────
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// deterministic per-word jitter so frames are stable across renders
function jitter(seedStr, amt) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) | 0;
  return (((h % 1000) / 1000) - 0.5) * 2 * amt;
}

function fontString(f, W) {
  const px = Math.round((f.size || 0.06) * W);
  const style = f.style === 'italic' ? 'italic ' : '';
  return `${style}${f.weight || 400} ${px}px ${f.family}`;
}

function applyTransform(text, f) {
  if (f.transform === 'upper') return text.toUpperCase();
  if (f.transform === 'lower') return text.toLowerCase();
  return text;
}

// ── Layout ─────────────────────────────────────────────────────────────────
// Produces positioned word boxes for a group. Lockup mode stacks words into
// up to 3 centered lines and promotes the longest word to the accent font.

function layoutGroup(ctx, group, preset, W, H) {
  const f = preset.font;
  const maxW = W * 0.86;
  const spaceW = () => ctx.measureText(' ').width;

  if (preset.grouping.mode === 'lockup') {
    // choose hero word: longest alphabetic word in the group
    let heroIdx = 0;
    group.words.forEach((w, i) => {
      if (w.text.replace(/\W/g, '').length > group.words[heroIdx].text.replace(/\W/g, '').length) heroIdx = i;
    });
    // distribute words into up to 3 lines, hero on its own line
    const lines = [];
    let buf = [];
    group.words.forEach((w, i) => {
      if (i === heroIdx) {
        if (buf.length) { lines.push({ words: buf, hero: false }); buf = []; }
        lines.push({ words: [w], hero: true });
      } else {
        buf.push(w);
        if (buf.length >= 3) { lines.push({ words: buf, hero: false }); buf = []; }
      }
    });
    if (buf.length) lines.push({ words: buf, hero: false });

    // measure
    const laid = [];
    let totalH = 0;
    for (const line of lines.slice(0, 4)) {
      const lf = line.hero && preset.accentFont ? preset.accentFont : f;
      ctx.font = fontString(lf, W);
      const lh = (lf.size || 0.06) * W * (lf.lineHeight || f.lineHeight || 1.1);
      let lw = 0;
      const items = line.words.map(w => {
        const txt = applyTransform(w.text, lf);
        const wd = ctx.measureText(txt).width + (lf.letterSpacing ? txt.length * lf.letterSpacing * (lf.size * W) : 0);
        lw += wd + spaceW();
        return { w, txt, wd, hero: line.hero };
      });
      lw -= spaceW();
      laid.push({ items, lw, lh, hero: line.hero, font: lf });
      totalH += lh;
    }
    // positions
    let y = H * preset.pos.y - totalH / 2;
    for (const line of laid) {
      let x = (W - Math.min(line.lw, maxW)) / 2;
      const scale = line.lw > maxW ? maxW / line.lw : 1;
      for (const it of line.items) {
        it.x = x; it.y = y + line.lh / 2; it.scale = scale;
        x += (it.wd + spaceW()) * scale;
      }
      y += line.lh;
    }
    return laid;
  }

  // chunk / word mode: greedy wrap into lines
  ctx.font = fontString(f, W);
  const lh = (f.size || 0.06) * W * (f.lineHeight || 1.15);
  const lines = [{ items: [], lw: 0 }];
  for (const w of group.words) {
    const txt = applyTransform(w.text, f);
    const wd = ctx.measureText(txt).width + (f.letterSpacing ? txt.length * f.letterSpacing * (f.size * W) : 0);
    let line = lines[lines.length - 1];
    if (line.items.length && line.lw + spaceW() + wd > maxW) {
      line = { items: [], lw: 0 };
      lines.push(line);
    }
    line.lw += (line.items.length ? spaceW() : 0) + wd;
    line.items.push({ w, txt, wd, hero: false });
  }
  const totalH = lines.length * lh;
  let y = H * preset.pos.y - totalH / 2 + lh / 2;
  const laid = [];
  for (const line of lines) {
    let x = preset.pos.align === 'left' ? W * 0.08 : (W - line.lw) / 2;
    for (const it of line.items) {
      it.x = x; it.y = y; it.scale = 1;
      x += it.wd + spaceW();
    }
    laid.push({ ...line, lh, font: f });
    y += lh;
  }
  return laid;
}

// ── Word draw ──────────────────────────────────────────────────────────────

function drawWord(ctx, it, line, preset, state, W, t) {
  const { txt, w } = it;
  const c = preset.colors;
  const active = state.active === w;
  const f = it.hero && preset.accentFont ? preset.accentFont : line.font;
  ctx.font = fontString(f, W);
  ctx.textBaseline = 'middle';

  // entrance animation progress for this word (or the whole group)
  const animBase = preset.anim.perWord ? w.start : state.groupStart;
  let p = clamp01((t - animBase) / 0.22);
  let scale = 1, dy = 0, alpha = 1, sx = 1, sy = 1;
  switch (preset.anim.in) {
    case 'pop':    scale = 0.5 + 0.5 * easeOutBack(p); alpha = p < 0.15 ? p / 0.15 : 1; break;
    case 'fade':   alpha = easeOutCubic(p); break;
    case 'rise':   dy = (1 - easeOutCubic(p)) * 0.35 * (f.size * W); alpha = easeOutCubic(p); break;
    case 'squash': { const q = easeOutBack(p); sx = 0.6 + 0.4 * q + (1 - p) * 0.25; sy = 1.4 - 0.4 * q - (1 - p) * 0.25; alpha = p < 0.1 ? p / 0.1 : 1; break; }
    case 'type':   if (t < w.start) alpha = 0; break;
    default: break;
  }
  if (preset.anim.in === 'type' && alpha === 0) return;

  // active-word extra scale
  if (active && preset.emphasis === 'scale') scale *= 1.18;

  const rot = preset.extra.rotateJitter ? jitter(w.text + (w.start | 0), preset.extra.rotateJitter) : 0;

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(it.x + it.wd * it.scale / 2, it.y + dy);
  ctx.rotate(rot);
  ctx.scale(scale * sx * it.scale, scale * sy * it.scale);
  ctx.translate(-it.wd / 2, 0);

  const px = f.size * W;

  // active word box / sticker background
  const boxed = (preset.emphasis === 'box' && active) || c.wordBgAll;
  if (boxed && (c.wordBg || c.wordBgAll)) {
    const padX = px * 0.18, padY = px * 0.16;
    ctx.fillStyle = c.wordBg || '#ffffff';
    roundRect(ctx, -padX, -px * 0.52 - padY + px * 0.06, it.wd + padX * 2, px * 1.04 + padY * 2 - px * 0.06, (c.bgRadius || 0.01) * W);
    ctx.fill();
  }

  // glitch finish: RGB-split ghost passes
  if (preset.extra.glitch) {
    const off = px * 0.045;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,0,80,.8)';  fillWordText(ctx, txt, f, px, -off, 0);
    ctx.fillStyle = 'rgba(0,220,255,.8)'; fillWordText(ctx, txt, f, px, off, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  // glow
  if (c.glow && (preset.emphasis !== 'glow' || active || true)) {
    ctx.shadowColor = active && preset.emphasis === 'glow' ? (c.active || c.glow) : c.glow;
    ctx.shadowBlur = px * (active ? 0.55 : 0.35);
  } else if (c.shadow) {
    ctx.shadowColor = c.shadow;
    ctx.shadowBlur = px * 0.18;
    ctx.shadowOffsetY = px * 0.06;
  }

  // stroke
  if (c.stroke && c.strokeWidth) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = c.strokeWidth * W;
    strokeWordText(ctx, txt, f, px);
  }

  // fill
  let fill = it.hero && c.accent ? c.accent : (active ? (c.active || c.text) : c.text);
  if (boxed && !c.wordBgAll && preset.emphasis === 'box') fill = c.active || '#ffffff';
  if (c.wordBgAll) fill = c.text;

  // karaoke sweep: horizontal wipe of the active color across the active word
  if (preset.extra.karaokeSweep && active) {
    const prog = clamp01((t - w.start) / Math.max(0.12, w.end - w.start));
    ctx.fillStyle = c.text;
    fillWordText(ctx, txt, f, px);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, -px, it.wd * prog, px * 2);
    ctx.clip();
    ctx.fillStyle = c.active;
    fillWordText(ctx, txt, f, px);
    ctx.restore();
  } else {
    ctx.fillStyle = fill;
    fillWordText(ctx, txt, f, px);
  }

  // underline emphasis
  if (preset.emphasis === 'underline' && active) {
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = c.active || '#ffe600';
    ctx.lineWidth = px * 0.09;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, px * 0.62);
    ctx.lineTo(it.wd, px * 0.62);
    ctx.stroke();
  }

  ctx.restore();
}

function fillWordText(ctx, txt, f, px, dx = 0, dy = 0) {
  if (f.letterSpacing) {
    let x = dx;
    for (const ch of txt) { ctx.fillText(ch, x, dy); x += ctx.measureText(ch).width + f.letterSpacing * px; }
  } else ctx.fillText(txt, dx, dy);
}
function strokeWordText(ctx, txt, f, px) {
  if (f.letterSpacing) {
    let x = 0;
    for (const ch of txt) { ctx.strokeText(ch, x, 0); x += ctx.measureText(ch).width + f.letterSpacing * px; }
  } else ctx.strokeText(txt, 0, 0);
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── Main render ────────────────────────────────────────────────────────────
// drawFrame(ctx, video, t, groups, preset, opts)
//   opts.mask     — optional person-mask canvas (same size as output) for
//                   behind-the-subject styles
//   opts.speaker  — { name, role } for lower-third styles
export function drawFrame(ctx, source, t, groups, preset, opts = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height;

  // 1. video frame, cover-cropped into the output aspect
  drawCover(ctx, source, W, H);

  // optional dim for behind styles
  if (preset.colors.dim) {
    ctx.fillStyle = preset.colors.dim;
    ctx.fillRect(0, 0, W, H);
  }

  if (preset.extra.vhs) drawVhsOverlay(ctx, W, H, t);

  const g = groupAt(groups, t);
  if (!g) return;

  const state = {
    groupStart: g.start,
    active: g.words.find(w => t >= w.start && t < w.end) ||
            (t >= g.end ? g.words[g.words.length - 1] : null),
  };

  const laid = layoutGroup(ctx, g, preset, W, H);

  // caption block background (bar / strip / glass / quote card)
  if (preset.colors.bg) drawBlockBg(ctx, laid, preset, W, H);
  if (preset.extra.lowerThird) drawLowerThirdChrome(ctx, laid, preset, W, H, opts.speaker);

  // 2. captions
  const paint = () => {
    ctx.save();
    if (preset.extra.quote) drawQuoteMark(ctx, laid, preset, W);
    for (const line of laid) for (const it of line.items) drawWord(ctx, it, line, preset, state, W, t);
    ctx.restore();
  };
  paint();

  // 3. behind-the-subject: re-draw the person cutout on top of the text
  if (preset.behind && opts.mask) {
    ctx.save();
    const tmp = opts.scratch;
    const tc = tmp.getContext('2d');
    tc.clearRect(0, 0, W, H);
    drawCover(tc, source, W, H);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(opts.mask, 0, 0, W, H);
    tc.globalCompositeOperation = 'source-over';
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }
}

export function drawCover(ctx, source, W, H) {
  const sw = source.videoWidth || source.width, sh = source.videoHeight || source.height;
  if (!sw || !sh) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
  const s = Math.max(W / sw, H / sh);
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function blockBounds(laid, preset, W) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const line of laid) for (const it of line.items) {
    minX = Math.min(minX, it.x);
    maxX = Math.max(maxX, it.x + it.wd * it.scale);
    minY = Math.min(minY, it.y - line.lh / 2);
    maxY = Math.max(maxY, it.y + line.lh / 2);
  }
  return { minX, maxX, minY, maxY };
}

function drawBlockBg(ctx, laid, preset, W, H) {
  const { minX, maxX, minY, maxY } = blockBounds(laid, preset, W);
  const pad = W * 0.025;
  ctx.save();
  ctx.fillStyle = preset.colors.bg;
  if (preset.colors.bgStroke) { ctx.strokeStyle = preset.colors.bgStroke; ctx.lineWidth = 2; }
  roundRect(ctx, minX - pad, minY - pad * 0.6, (maxX - minX) + pad * 2, (maxY - minY) + pad * 1.2, (preset.colors.bgRadius || 0) * W);
  ctx.fill();
  if (preset.colors.bgStroke) ctx.stroke();
  ctx.restore();
}

function drawLowerThirdChrome(ctx, laid, preset, W, H, speaker) {
  const { minY, maxY } = blockBounds(laid, preset, W);
  const pad = W * 0.025;
  // accent bar on the left edge of the caption strip
  ctx.save();
  ctx.fillStyle = preset.colors.accentBar || '#e11d48';
  ctx.fillRect(W * 0.08 - pad - W * 0.012, minY - pad * 0.6, W * 0.008, (maxY - minY) + pad * 1.2);
  // speaker label above
  if (speaker && speaker.name) {
    ctx.font = `800 ${Math.round(W * 0.03)}px Inter`;
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(speaker.name.toUpperCase(), W * 0.08, minY - pad);
    if (speaker.role) {
      ctx.font = `400 ${Math.round(W * 0.024)}px Inter`;
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillText(speaker.role, W * 0.08 + ctx.measureText(speaker.name.toUpperCase()).width + W * 0.09, minY - pad);
    }
  }
  ctx.restore();
}

function drawQuoteMark(ctx, laid, preset, W) {
  const { minX, minY } = blockBounds(laid, preset, W);
  ctx.save();
  ctx.font = `700 ${Math.round(W * 0.09)}px Lora`;
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('“', minX - W * 0.005, minY + W * 0.02);
  ctx.restore();
}

function drawVhsOverlay(ctx, W, H, t) {
  ctx.save();
  // scanlines
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#000';
  for (let y = (t * 40) % 4; y < H; y += 4) ctx.fillRect(0, y, W, 1.5);
  ctx.globalAlpha = 1;
  // corner timestamp
  ctx.font = `700 ${Math.round(W * 0.035)}px "Space Mono"`;
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.textBaseline = 'top';
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(Math.floor(t % 60)).padStart(2, '0');
  ctx.fillText(`▶ PLAY  00:${mm}:${ss}`, W * 0.06, H * 0.05);
  ctx.restore();
}
