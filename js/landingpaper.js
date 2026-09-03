// ---------------------------------------------------------------------------
// Popshot — the Paper & Motion strip on the landing page
//
// A curated slice of the Motion Lab, animating live. It reuses the same
// registries the tool itself runs on, so a card here can never drift from what
// the link opens; each card deep-links to that animation or effect.
// ---------------------------------------------------------------------------

import { buildSheet } from './paperfx.js';
import { ANIM_BY_ID } from './paperanim.js';
import { EFFECT_BY_ID, defaultsFor, effectDuration } from './effects.js';
import { TEMPLATE_BY_ID, placeholderArt } from './papertemplates.js';

const PICKS = ['brochure', 'tearaway', 'boiling', 'sticker', 'ransom',
               'powboom', 'turing', 'commentmatch', 'countrymap', 'magnifier'];

const host = document.getElementById('landingPaper');
if (host) {
  const ASPECTS = { '1:1': [1080, 1080], '9:16': [1080, 1920], '4:5': [1080, 1350], '16:9': [1920, 1080] };
  const measure = document.createElement('canvas').getContext('2d');
  const sample = placeholderArt();
  const sheets = new Map();
  const cards = [];
  const visible = new Set();

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target);
    }
  }, { rootMargin: '200px' });

  for (const id of PICKS) {
    const tpl = TEMPLATE_BY_ID[id];
    if (!tpl) continue;
    const target = tpl.kind === 'fx' ? tpl.fx : tpl.anim;

    const a = document.createElement('a');
    a.className = 'paper-card';
    a.href = `paper.html#${target}`;
    const cv = document.createElement('canvas');
    const [aw, ah] = ASPECTS[tpl.aspect];
    const s = 300 / Math.max(aw, ah);
    cv.width = Math.round(aw * s); cv.height = Math.round(ah * s);
    a.appendChild(cv);
    const meta = document.createElement('div');
    meta.className = 'paper-card-meta';
    const tag = document.createElement('span');
    tag.className = 'paper-card-tag';
    tag.textContent = tpl.cat.toUpperCase();
    const name = document.createElement('strong');
    name.textContent = tpl.name;
    meta.append(tag, name);
    a.appendChild(meta);
    host.appendChild(a);
    io.observe(a);

    const card = { tpl, el: a, cv, ctx: cv.getContext('2d'), phase: Math.random() };
    if (tpl.kind === 'fx') {
      card.fx = EFFECT_BY_ID[tpl.fx];
      card.opts = { ...defaultsFor(card.fx), ...(tpl.opts || {}), quality: 0.4 };
      card.dur = effectDuration(card.fx, card.opts, null);
    } else {
      const key = JSON.stringify(tpl.look);
      if (!sheets.has(key)) {
        sheets.set(key, buildSheet({
          image: sample.image, mask: sample.mask, look: tpl.look, seed: 3, maxSide: 260,
        }));
      }
      card.art = sheets.get(key);
      card.dur = tpl.dur || ANIM_BY_ID[tpl.anim].dur;
    }
    cards.push(card);
  }

  // one transparent layer per size, shared: the fold shading composites with
  // 'source-atop' and must not touch the card background
  const layers = new Map();
  const layerFor = (w, h) => {
    const k = `${w}x${h}`;
    let c = layers.get(k);
    if (!c) { c = document.createElement('canvas'); c.width = w; c.height = h; layers.set(k, c); }
    c.getContext('2d').clearRect(0, 0, w, h);
    return c;
  };

  let clock = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (now - clock < 55) return;             // ~18fps is plenty for a strip
    clock = now;
    for (const card of cards) {
      if (!visible.has(card.el)) continue;
      const { tpl, ctx, cv } = card;
      const W = cv.width, H = cv.height;
      const t = ((now / 1000 / card.dur) + card.phase) % 1;
      ctx.clearRect(0, 0, W, H);
      if (tpl.bg !== 'transparent') { ctx.fillStyle = tpl.bg; ctx.fillRect(0, 0, W, H); }
      const layer = layerFor(W, H);
      const lc = layer.getContext('2d');
      try {
        if (tpl.kind === 'fx') {
          if (card.fx.build) {
            const key = card.fx.key ? card.fx.key(card.opts) : 'static';
            if (card.cacheKey !== key) { card.cacheKey = key; card.cache = card.fx.build(card.opts, measure); }
          }
          card.fx.draw(lc, W, H, t, card.opts, card.cache);
        } else {
          ANIM_BY_ID[tpl.anim].draw(lc, W, H, card.art, t, {
            panels: tpl.panels || 3, zoom: tpl.zoom || 0.84, crease: 0.5,
            seed: 3, tint: tpl.look.tint, boilFps: 10, dur: card.dur,
          });
        }
        ctx.drawImage(layer, 0, 0);
      } catch { /* a single card must not stall the strip */ }
    }
  }
  requestAnimationFrame(tick);
  document.fonts.ready.then(() => { for (const c of cards) { c.cacheKey = null; c.cache = null; } });
}
