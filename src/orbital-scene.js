import { drawBase } from './bases.js';

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

// Each ship has a permanent launch well. Doors open before its lift brings the
// nose above ground; ignition and free flight start only after the hull clears.
export function orbitalLaunchPose(ship, seconds, width, height) {
  const { time, camera } = orbitalFrame(seconds);
  const scale = ship.scale * (width < 700 ? .74 : 1.1);
  const doors = ease((time - ship.delay + 2.8) / 1.2);
  const lift = ease((time - ship.delay + 1.8) / 1.8);
  const ignition = ease((time - ship.delay) / .8);
  const flight = Math.max(0, time - ship.delay - .8);
  const padX = width * ship.x, padY = height * .87 + (.3 + ship.row * .9) * Math.min(16, height * .035) + camera * height * 1.15;
  return { scale, doors, lift, ignition, flight, padX, padY,
    x: padX + width * ship.drift * ease(flight / 15),
    y: padY + 42 * scale * (1 - lift) - height * (.01 * flight ** 2 + .015 * flight * ease(flight)),
  };
}

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
function ruins(ctx, width, height, camera) {
  const ground = height * .87, random = randomSource(87);
  ctx.save(); ctx.translate(0, camera * height * 1.15);
  ctx.fillStyle = '#0d1919'; ctx.beginPath(); ctx.moveTo(0, height + 100); ctx.lineTo(0, ground);
  for (let x = 0; x <= width + 60; x += 60) ctx.lineTo(x, ground + 6 - random() * 20);
  ctx.lineTo(width, height + 100); ctx.fill();
  ctx.translate(0, ground); ctx.globalAlpha = .35;
  for (const [x, age, scale] of [[.12,2,1.2], [.32,4,1.1], [.65,5,1.6], [.88,3,1.2]]) {
    drawBase(ctx, { x: width * x, team: 'player', hp: 0, maxHp: 1 }, age, 0, scale * (width < 700 ? .7 : 1));
  }
  ctx.restore(); return ground;
}
function rocket(ctx, ship, time, width, height) {
  const { x, y, scale, padX, padY, doors, lift, ignition, flight } = orbitalLaunchPose(ship, time, width, height);
  // Recessed foundations and service lights exist from the opening frame.
  ctx.save(); ctx.translate(padX, padY); ctx.scale(scale, scale);
  ctx.fillStyle = '#243431'; ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(-10, -7);
  ctx.lineTo(10, -7); ctx.lineTo(14, -2); ctx.lineTo(14, 4); ctx.lineTo(-14, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#080f11'; ctx.fillRect(-8, -5, 16, 7);
  ctx.fillStyle = '#859a86'; ctx.globalAlpha = .35 + doors * .35; ctx.fillRect(-12, -2, 2, 1); ctx.fillRect(10, -2, 2, 1);
  ctx.restore();
  if (y >= -200 && y <= height + 100) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, -200, width, padY + 200); ctx.clip();
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.globalAlpha = (.4 + ship.scale * .35) * (1 - ease((time - 22) / 2));
    const plume = 18 + ignition * 30;
    ctx.save(); ctx.globalAlpha *= ignition;
    const exhaust = ctx.createLinearGradient(0, 0, 0, plume + 80);
    exhaust.addColorStop(0, '#c3d8ce90'); exhaust.addColorStop(.24, '#85a9a658'); exhaust.addColorStop(1, '#52757500');
    ctx.fillStyle = exhaust; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.quadraticCurveTo(-7, 42, -2, plume + 80);
    ctx.quadraticCurveTo(8, 38, 3, 0); ctx.fill();
    ctx.fillStyle = '#b6cac0'; ctx.beginPath(); ctx.moveTo(-2.4, 0); ctx.lineTo(0, plume * (.85 + Math.sin(time * 4 + ship.phase) * .06)); ctx.lineTo(2.4,0); ctx.fill();
    ctx.restore();
    // Slim armored hull, offset service spine, split fins and a recessed blue lens.
    ctx.fillStyle = '#819a92'; ctx.beginPath(); ctx.moveTo(0,-37); ctx.lineTo(4,-26); ctx.lineTo(4,-5); ctx.lineTo(7,2); ctx.lineTo(2,0); ctx.lineTo(-2,0); ctx.lineTo(-7,2); ctx.lineTo(-4,-5); ctx.lineTo(-4,-26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c0cbc0'; ctx.beginPath(); ctx.moveTo(0,-37); ctx.lineTo(1,-26); ctx.lineTo(1,-4); ctx.lineTo(-3,-4); ctx.lineTo(-3,-26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#364d4b'; ctx.fillRect(1,-23,2,14); ctx.fillRect(-3,-6,6,2);
    ctx.fillStyle = '#a8d4cd'; ctx.fillRect(-1.5,-24,2,3);
    ctx.restore(); ctx.restore();
  }
  // The front lip masks the lift and exhaust below ground. Sliding shutters
  // remain attached to the same foundation throughout the launch.
  ctx.save(); ctx.translate(padX, padY); ctx.scale(scale, scale);
  ctx.fillStyle = '#708174'; ctx.fillRect(-7, Math.min(0, 42 * (1 - lift) - 1), 14, 1);
  ctx.fillStyle = '#40534c';
  ctx.fillRect(-8 - doors * 7, -5, 8, 3); ctx.fillRect(doors * 7, -5, 8, 3);
  ctx.fillStyle = '#192723'; ctx.fillRect(-14, 0, 28, 4);
  const dust = ignition * (1 - ease(flight / 3));
  ctx.globalAlpha = dust * .23; ctx.fillStyle = '#889385';
  for (const direction of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(direction * (8 + flight * 7), 0, 6 + flight * 7, 2 + flight, 0, 0, Math.PI * 2); ctx.fill();
  }
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
  ruins(ctx, width, height, frame.camera);
  for (const ship of ORBITAL_FLEET) rocket(ctx, ship, frame.time, width, height);
  horizon(ctx, width, height, ease((frame.time - 17) / 7)); ctx.restore();
  return frame;
}
