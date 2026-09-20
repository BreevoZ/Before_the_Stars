import { UNITS } from './game.js';
import { drawUnit } from './units.js';
import { drawTurret } from './turrets.js';

// Contour studies of the actual models preserve helmets, weapons, mounts and
// mechanisms. Extract edges at display resolution so line weight stays uniform
// across infantry, vehicles and towers, regardless of the model's dimensions.
// Generated only when the selected era/type changes, never per animation frame.
const studies = new WeakMap();
function study(document, type, turret) {
  if (!studies.has(document)) studies.set(document, new Map());
  const cache = studies.get(document), key = `${turret ? 'turret' : 'unit'}:${type}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.translate(220, 330);
  if (turret) drawTurret(ctx, { type, team: 'player', cooldown: 0 }, 0, 2.5, true);
  else drawUnit(ctx, { id: 0, team: 'player', type, x: 0, hp: UNITS[type].health, moving: false, attackAnimation: 0 }, 0, 2.5, true);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), data = pixels.data;
  let left = canvas.width, right = 0, top = canvas.height, bottom = 0;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const index = (y * canvas.width + x) * 4;
    if (!data[index + 3]) continue;
    if (data[index + 3] > 96) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  left = Math.max(0, left - 2); top = Math.max(0, top - 2);
  const width = Math.min(canvas.width - left, right - left + 3), height = Math.min(canvas.height - top, bottom - top + 3);
  const result = document.createElement('canvas'); result.width = 240; result.height = 144;
  const ink = result.getContext('2d', { willReadFrequently: true });
  const scale = Math.min(168 / width, (turret ? 88 : 104) / height), w = width * scale, h = height * scale;
  ink.drawImage(canvas, left, top, width, height, (240 - w) / 2, 128 - h, w, h);
  const source = ink.getImageData(0, 0, 240, 144), outline = ink.createImageData(240, 144);
  for (let y = 1; y < 143; y++) for (let x = 1; x < 239; x++) {
    const i = (y * 240 + x) * 4, a = source.data[i + 3] / 255;
    if (!a) continue;
    let boundary = 0, seam = 0;
    for (const offset of [-960, -4, 4, 960]) {
      const j = i + offset, b = source.data[j + 3] / 255;
      boundary = Math.max(boundary, a - b);
      if (Math.min(a, b) > .85) {
        const contrast = Math.max(...[0, 1, 2].map(c => Math.abs(source.data[i + c] - source.data[j + c])));
        seam = Math.max(seam, Math.max(0, contrast - 26) / 68);
      }
    }
    // A faint paper wash holds the shape together; the contour and selected
    // material joins carry the information, without tracing every shaded facet.
    const alpha = Math.max(a * .055, Math.min(1, boundary * 1.8) * .9, Math.min(1, seam) * .54);
    outline.data.set([168, 190, 164, Math.round(alpha * 255)], i);
  }
  ink.putImageData(outline, 0, 0);
  cache.set(key, result); return result;
}

export function drawCommandPortrait(canvas, type, turret = false) {
  const image = study(canvas.ownerDocument, type, turret);
  canvas.width = 240; canvas.height = 144;
  const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
  // A short, fading ground line anchors every model without enclosing it.
  const floor = ctx.createLinearGradient(22, 0, 98, 0);
  floor.addColorStop(0, '#77917e00'); floor.addColorStop(.5, '#77917e48'); floor.addColorStop(1, '#77917e00');
  ctx.fillStyle = floor; ctx.fillRect(22, 65, 76, .6);
  ctx.drawImage(image, 0, 0, 120, 72);
}
