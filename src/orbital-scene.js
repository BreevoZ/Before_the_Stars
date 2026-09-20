import { drawBaseRuins } from './bases.js';

export const ORBITAL_SECONDS = 24;
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
function randomSource(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
const random = randomSource(2718);
export const ORBITAL_FLEET = Object.freeze(Array.from({ length: 36 }, (_, i) => Object.freeze({
  row: Math.floor(i / 12), x: (i % 12 + .2 + random() * .6) / 12, delay: 2.8 + random() * 4.8,
  scale: .52 + Math.floor(i / 12) * .27 + random() * .14,
  drift: (random() - .5) * .025, phase: random() * 6.28,
})).sort((a,b) => a.scale - b.scale));

// Presentation only: seekable, deterministic, no simulation or persistence hooks.
export function orbitalFrame(seconds, reducedMotion = false) {
  const time = reducedMotion ? ORBITAL_SECONDS : Math.max(0, Math.min(ORBITAL_SECONDS, seconds));
  return { time, treeOpacity: 1 - ease(time / 3.6), camera: ease((time - 9) / 13),
    arrival: ease((time - 20) / 3), actions: ease((time - 22) / 2), complete: time >= ORBITAL_SECONDS };
}

// Ships start entirely behind the ground. Acceleration reveals them through
// the opaque foreground, never by spawning/fading a hull into open sky.
export function orbitalLaunchPose(ship, seconds, width, height) {
  const { time, camera } = orbitalFrame(seconds);
  const scale = ship.scale * (width < 700 ? .7 : 1);
  const flight = Math.max(0, time - ship.delay);
  const ground = height * .87 + camera * height * 1.15;
  const rise = (7 + height * .004) * flight ** 2;
  return { scale, flight, ground, rise, ignition: ease(flight / 1.2),
    x: width * (ship.x + ship.drift * ease(flight / 15)),
    y: ground + 56 * scale + 8 + ship.row * 4 - rise,
  };
}

const mix = (a, b, t) => `rgb(${a.map((value, i) => Math.round(value + (b[i] - value) * t)).join(',')})`;
function departureLight(time) { return ease((time - 2) / 7) * (1 - ease((time - 12) / 7)); }

function sky(ctx, width, height, camera) {
  const wash = ctx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, '#0c1519'); wash.addColorStop(.7, '#132322'); wash.addColorStop(1, '#192923');
  ctx.fillStyle = wash; ctx.fillRect(0, 0, width, height);
  const light = ctx.createRadialGradient(width * .5, height * .75, 0, width * .5, height * .75, Math.max(width, height) * .55);
  light.addColorStop(0, '#64745b20'); light.addColorStop(1, '#15202000'); ctx.fillStyle = light; ctx.fillRect(0, 0, width, height);
  const starRandom = randomSource(57);
  for (let i = 0; i < 140; i++) {
    const x = starRandom() * width, y = (starRandom() * .88 + camera * .09) % 1 * height;
    const size = starRandom() * 1.15 + .25;
    ctx.globalAlpha = starRandom() * .45 + .1; ctx.fillStyle = '#c8d3b9';
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function dawn(ctx, width, height, frame) {
  const light = departureLight(frame.time);
  if (!light) return;
  const ground = height * .87 + frame.camera * height * 1.15;
  // A broad, warm horizon opens behind the silhouettes as the fleet leaves.
  // The glow belongs to the distance; it never washes out the foreground.
  ctx.save(); ctx.translate(width * .5, ground); ctx.scale(width / height * 1.6, .65);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, height * .8);
  glow.addColorStop(0, '#ddcf9c'); glow.addColorStop(.22, '#9d9b78');
  glow.addColorStop(.6, '#647969'); glow.addColorStop(1, '#64796900');
  ctx.globalAlpha = light * .38; ctx.fillStyle = glow;
  ctx.fillRect(-height, -height, height * 2, height * 2); ctx.restore();
}

function ruins(ctx, width, height, frame) {
  const ground = height * .87, random = randomSource(87), light = departureLight(frame.time);
  const material = {
    body: mix([29, 43, 39], [55, 65, 51], light), shade: '#14221f', dark: '#101d1c',
    roof: mix([35, 46, 39], [67, 72, 53], light), light: mix([46, 58, 48], [96, 97, 70], light),
  };
  ctx.save(); ctx.translate(0, frame.camera * height * 1.15);
  // Solid material, not translucent ruins: rockets and exhaust are genuinely
  // hidden by walls and earth until they emerge above them.
  ctx.save(); ctx.translate(0, ground); ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel';
  for (const [x, age, scale] of [[.12,2,1.2], [.32,4,1.1], [.65,5,1.6], [.88,3,1.2]]) {
    ctx.save(); ctx.translate(width * x, 0); ctx.scale(scale * (width < 700 ? .7 : 1), scale * (width < 700 ? .7 : 1));
    drawBaseRuins(ctx, age, material); ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = '#0d1919'; ctx.beginPath(); ctx.moveTo(0, height + 100); ctx.lineTo(0, ground);
  for (let x = 0; x <= width + 60; x += 60) ctx.lineTo(x, ground + 6 - random() * 20);
  ctx.lineTo(width, height + 100); ctx.fill(); ctx.restore();
}

function rocket(ctx, ship, time, width, height) {
  const { x, y, scale, ignition, flight } = orbitalLaunchPose(ship, time, width, height);
  if (y < -240 || y > height + 100) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.globalAlpha = (.45 + ship.scale * .35) * (1 - ease((time - 22) / 2));
  const plume = 24 + ease(flight / 5) * 110;
  ctx.save(); ctx.globalAlpha *= ignition;
  const halo = ctx.createRadialGradient(0, 5, 0, 0, 5, 22);
  halo.addColorStop(0, '#e4d9ac60'); halo.addColorStop(1, '#d4c89100');
  ctx.fillStyle = halo; ctx.fillRect(-22, -17, 44, 44);
  const exhaust = ctx.createLinearGradient(0, 0, 0, plume);
  exhaust.addColorStop(0, '#eee2bbd0'); exhaust.addColorStop(.2, '#c4c9ac70'); exhaust.addColorStop(1, '#809c9500');
  ctx.fillStyle = exhaust; ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.quadraticCurveTo(-5, plume * .25, -1, plume);
  ctx.quadraticCurveTo(5, plume * .25, 2.5, 0); ctx.fill();
  ctx.fillStyle = '#ede4c5'; ctx.beginPath(); ctx.moveTo(-1.6, 0); ctx.lineTo(0, 15 + ignition * 14); ctx.lineTo(1.6,0); ctx.fill();
  ctx.restore();
  // Quiet hulls, one lit edge, and a bright engine. The light carries the scene.
  ctx.fillStyle = '#7c958c'; ctx.beginPath(); ctx.moveTo(0,-37); ctx.lineTo(4,-26); ctx.lineTo(4,-5); ctx.lineTo(7,2); ctx.lineTo(2,0); ctx.lineTo(-2,0); ctx.lineTo(-7,2); ctx.lineTo(-4,-5); ctx.lineTo(-4,-26); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c4cbb5'; ctx.beginPath(); ctx.moveTo(0,-37); ctx.lineTo(1,-26); ctx.lineTo(1,-4); ctx.lineTo(-3,-4); ctx.lineTo(-3,-26); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#364d4b'; ctx.fillRect(1,-23,2,14); ctx.fillRect(-3,-6,6,2);
  ctx.fillStyle = '#c5dbcf'; ctx.fillRect(-1.5,-24,2,3);
  ctx.restore();
}
function horizon(ctx, width, height, amount) {
  if (!amount) return;
  ctx.save(); ctx.globalAlpha = amount;
  const radius = Math.max(width * .8, height * 1.2), y = height + radius - height * .1;
  const halo = ctx.createRadialGradient(width * .5, y, radius - 8, width * .5, y, radius + 32);
  halo.addColorStop(0, '#0c181b'); halo.addColorStop(.18, '#587c7920'); halo.addColorStop(1, '#587c7900');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#0b171c'; ctx.beginPath(); ctx.arc(width * .5, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6d989166'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
}

export function drawOrbitalScene(ctx, width, height, seconds, { reducedMotion = false } = {}) {
  const frame = orbitalFrame(seconds, reducedMotion);
  ctx.save(); sky(ctx, width, height, frame.camera);
  dawn(ctx, width, height, frame);
  for (const ship of ORBITAL_FLEET) rocket(ctx, ship, frame.time, width, height);
  ruins(ctx, width, height, frame);
  horizon(ctx, width, height, ease((frame.time - 17) / 7)); ctx.restore();
  return frame;
}
