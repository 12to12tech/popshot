// ---------------------------------------------------------------------------
// Popshot — thumbnail rendering (shared by the editor and the Tools page)
// Draws one thumbnail concept for a given <video> frame into a 2d context.
// ---------------------------------------------------------------------------

import { drawCover } from './engine.js';

export const CONCEPTS = [
  { id: 'clean', name: 'Clean frame' },
  { id: 'bold',  name: 'Bold text' },
  { id: 'tape',  name: 'Tape highlight' },
  { id: 'scene', name: 'Stylized scene' },
];

export function wrapTitle(c, title, W) {
  const words = title.split(/\s+/).slice(0, 10);
  const lines = [];
  let cur = '';
  c.font = `400 ${W * 0.12}px "Archivo Black"`;
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (c.measureText(test).width > W * 0.85 && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

// renderThumb(ctx, W, H, { source, styleId, title })
export function renderThumb(c, W, H, { source, styleId, title }) {
  c.canvas.width = W; c.canvas.height = H;
  drawCover(c, source, W, H);

  if (styleId === 'clean') return;

  if (styleId === 'scene') {
    c.save();
    c.globalCompositeOperation = 'color';
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#7c3aed'); g.addColorStop(1, '#0ea5e9');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'overlay';
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 0, W, H);
    c.restore();
  }

  // dim gradient for legibility
  const dim = c.createLinearGradient(0, H * 0.35, 0, H);
  dim.addColorStop(0, 'rgba(0,0,0,0)');
  dim.addColorStop(1, 'rgba(0,0,0,.75)');
  c.fillStyle = dim; c.fillRect(0, 0, W, H);

  const t = (title || 'WATCH THIS').toUpperCase();
  const lines = wrapTitle(c, t, W);
  const styles = {
    bold:      { font: (s) => `400 ${s}px "Archivo Black"`, size: W * 0.13, fill: '#ffffff', stroke: '#000', lh: 1.12 },
    tape:      { font: (s) => `800 ${s}px Montserrat`, size: W * 0.11, fill: '#111', tape: '#ffe600', lh: 1.35 },
    editorial: { font: (s) => `italic 600 ${s}px "Playfair Display"`, size: W * 0.115, fill: '#ffffff', lh: 1.2 },
    scene:     { font: (s) => `400 ${s}px "Archivo Black"`, size: W * 0.125, fill: '#ffe600', stroke: '#000', lh: 1.12 },
  };
  const st = styles[styleId] || styles.bold;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const totalH = lines.length * st.size * st.lh;
  let y = H * 0.78 - totalH / 2 + st.size / 2;
  for (const line of lines) {
    c.font = st.font(st.size);
    if (st.tape) {
      const tw = c.measureText(line).width;
      c.save();
      c.translate(W / 2, y);
      c.rotate(-0.015);
      c.fillStyle = st.tape;
      c.fillRect(-tw / 2 - st.size * 0.25, -st.size * 0.62, tw + st.size * 0.5, st.size * 1.24);
      c.fillStyle = st.fill;
      c.fillText(line, 0, st.size * 0.04);
      c.restore();
    } else {
      if (st.stroke) {
        c.lineJoin = 'round';
        c.strokeStyle = st.stroke;
        c.lineWidth = st.size * 0.14;
        c.strokeText(line, W / 2, y);
      }
      c.fillStyle = st.fill;
      c.fillText(line, W / 2, y);
    }
    y += st.size * st.lh;
  }
  c.textAlign = 'left';
}
