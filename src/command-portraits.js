import { UNITS } from './game.js';
import { drawUnit } from './units.js';
import { drawTurret } from './turrets.js';

// Small UI studies of the real models: a shared sage palette and an optical
// crop keep skin, wood and metal from looking like unrelated colored stickers.
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
    const luminance = data[index] * .2126 + data[index + 1] * .7152 + data[index + 2] * .0722;
    const tone = luminance < 115 ? [73, 98, 89] : luminance < 170 ? [122, 147, 131] : [179, 193, 164];
    [data[index], data[index + 1], data[index + 2]] = tone;
  }
  ctx.putImageData(pixels, 0, 0);
  left = Math.max(0, left - 2); top = Math.max(0, top - 2);
  const result = { canvas, left, top, width: Math.min(canvas.width - left, right - left + 3), height: Math.min(canvas.height - top, bottom - top + 3) };
  cache.set(key, result); return result;
}

export function drawCommandPortrait(canvas, type, turret = false) {
  const image = study(canvas.ownerDocument, type, turret);
  canvas.width = 240; canvas.height = 144;
  const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
  const scale = Math.min(84 / image.width, (turret ? 44 : 52) / image.height);
  const width = image.width * scale, height = image.height * scale;
  // A short, fading ground line anchors every model without enclosing it.
  const floor = ctx.createLinearGradient(22, 0, 98, 0);
  floor.addColorStop(0, '#77917e00'); floor.addColorStop(.5, '#77917e48'); floor.addColorStop(1, '#77917e00');
  ctx.fillStyle = floor; ctx.fillRect(22, 65, 76, .6);
  ctx.drawImage(image.canvas, image.left, image.top, image.width, image.height, (120 - width) / 2, 64 - height, width, height);
}
