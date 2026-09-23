// VII observatory: a tilted orrery. Everything is drawn in a 1000×620 frame and
// scaled, like the Earth view. Bodies on the far half of their orbit are drawn
// before the sun, so the sun and the near half pass in front of them.
import { drawOrbitStars } from './orbital-render.js';
import { BODIES, SYSTEM, bodyPosition, orbitRadius, bodyById } from './solar-config.js';
import { TAU, lunarOrbitAngle } from './celestial-clock.js';

const clamp = v => Math.max(0, Math.min(1, v));
function noise(n) { let v = Math.imul(n ^ (n >>> 16), 0x21f0aaad); v = Math.imul(v ^ (v >>> 15), 0x735a2d97); return ((v ^ (v >>> 15)) >>> 0) / 4294967296; }
function disc(ctx, x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = color; ctx.fill(); }
const KIND_LABEL = { home: '文明摇篮', moon: '月面家园', habitable: '可殖民', industrial: '工业', relay: '深空' };
export const bodyKindLabel = b => KIND_LABEL[b.kind];

function orbit(ctx, au, front, alpha = 1) {
  const r = orbitRadius(au);
  ctx.save(); ctx.strokeStyle = '#a9bca7'; ctx.lineWidth = .7; ctx.globalAlpha = (front ? .32 : .18) * alpha; ctx.setLineDash([1.5, 5]);
  ctx.beginPath(); ctx.ellipse(SYSTEM.cx, SYSTEM.cy, r, r * SYSTEM.tilt, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke(); ctx.restore();
}
function belt(ctx, time, front) {
  const b = bodyById('belt');
  for (let i = 0; i < 260; i++) {
    const a = noise(i + 11) * TAU + time / (900 * 2.7 ** 1.5) * TAU * (.9 + noise(i + 3) * .2), r = orbitRadius(2.2 + noise(i + 7) * 1.1);
    if ((Math.sin(a) >= 0) !== front) continue;
    ctx.globalAlpha = .25 + noise(i + 19) * .4; disc(ctx, SYSTEM.cx + Math.cos(a) * r, SYSTEM.cy + Math.sin(a) * r * SYSTEM.tilt, .6 + noise(i + 29) * .9, b.color);
  }
  ctx.globalAlpha = 1;
}
function sun(ctx, ambient) {
  const { cx, cy, sun: r } = SYSTEM;
  const corona = ctx.createRadialGradient(cx, cy, r * .4, cx, cy, r * 3.6);
  corona.addColorStop(0, '#f3dfa6aa'); corona.addColorStop(.3, '#e9c98a2e'); corona.addColorStop(1, '#e9c98a00'); disc(ctx, cx, cy, r * 3.6, corona);
  const core = ctx.createRadialGradient(cx - r * .25, cy - r * .3, 0, cx, cy, r);
  core.addColorStop(0, '#fff6dc'); core.addColorStop(.7, '#f2d596'); core.addColorStop(1, '#e2b772'); disc(ctx, cx, cy, r * (1 + Math.sin(ambient * .8) * .015), core);
}
// A planet lit from the sun: the gradient runs along the sun direction.
function planet(ctx, b, p, { time, o, highlight }) {
  const scale = 1 + p.depth * .12, r = b.size * scale, dx = SYSTEM.cx - p.x, dy = SYSTEM.cy - p.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  if (b.rings) { ctx.save(); ctx.strokeStyle = '#d9c9a0'; ctx.globalAlpha = .55; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 2.1, r * .6, -.25, Math.PI, TAU); ctx.stroke(); ctx.restore(); }
  const g = ctx.createLinearGradient(p.x + ux * r, p.y + uy * r, p.x - ux * r, p.y - uy * r);
  g.addColorStop(0, b.color); g.addColorStop(.55, b.color + 'cc'); g.addColorStop(1, '#0c1517'); disc(ctx, p.x, p.y, r, g);
  if (b.rings) { ctx.save(); ctx.strokeStyle = '#e3d4ab'; ctx.globalAlpha = .75; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 2.1, r * .6, -.25, 0, Math.PI); ctx.stroke(); ctx.restore(); }
  if (b.id === 'earth') {
    // Home keeps its ring and its moon, on the same lunar clock as every sky below.
    if (o.talents.recovery) { ctx.save(); ctx.strokeStyle = '#d9cf9d'; ctx.globalAlpha = .7; ctx.lineWidth = .8; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.7, r * .45, -.1, 0, TAU); ctx.stroke(); ctx.restore(); }
    const sunward = Math.atan2(uy, ux), m = sunward + lunarOrbitAngle(o.elapsed);
    disc(ctx, p.x + Math.cos(m) * r * 2.6, p.y + Math.sin(m) * r * 2.6 * .6, 1.8, '#c9cdbd');
    // Night-side lights: the civilizations of VI.
    const alive = o.civilizations.filter(c => c.alive).length;
    for (let i = 0; i < alive; i++) { const a = sunward + Math.PI + (noise(i + 41) - .5) * 1.8; ctx.globalAlpha = .8; disc(ctx, p.x + Math.cos(a) * r * .55, p.y + Math.sin(a) * r * .55, .7, '#e7cf8e'); }
    ctx.globalAlpha = 1;
  }
  if (highlight) { ctx.save(); ctx.strokeStyle = b.id === 'earth' ? '#e5c989' : '#bcd1b0'; ctx.globalAlpha = .8; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(r, 5) + 7, 0, TAU); ctx.stroke(); ctx.restore(); }
}
function label(ctx, b, p, { o, highlight }) {
  const r = b.size * (1 + p.depth * .12);
  ctx.font = `${highlight ? 12 : 11}px system-ui, sans-serif`; ctx.textAlign = 'center';
  ctx.fillStyle = b.id === 'earth' ? '#e5c989' : highlight ? '#dfe7d6' : '#8fa294';
  ctx.fillText(b.name, p.x, p.y + Math.max(r, 5) + 18);
  if (b.id === 'earth') {
    const alive = o.civilizations.filter(c => c.alive).length;
    ctx.font = '9px system-ui, sans-serif'; ctx.fillStyle = '#8fa294';
    ctx.fillText(o.phase === 'winter' ? '核冬天' : `${alive} 个文明 · ${o.wars.length} 场战争`, p.x, p.y + Math.max(r, 5) + 31);
  }
}
// intro ∈ [0, 1] draws the ark leaving Earth for open space.
export function drawSolarSystem(ctx, width, height, o, { ambientTime = o.elapsed, reducedMotion = false, hover = null, selected = null, intro = null } = {}) {
  ctx.save(); ctx.scale(width / 1000, height / 620); drawOrbitStars(ctx, 1000, 620, ambientTime, reducedMotion);
  const time = reducedMotion ? 0 : o.elapsed, planets = BODIES.filter(b => !b.belt).map(b => ({ b, p: bodyPosition(b, time) }));
  for (const b of BODIES) orbit(ctx, b.au, false, b.belt ? 0 : 1);
  belt(ctx, time, false);
  for (const { b, p } of planets.filter(x => x.p.depth < 0).sort((a, c) => a.p.depth - c.p.depth)) planet(ctx, b, p, { time, o, highlight: b.id === hover || b.id === selected });
  sun(ctx, reducedMotion ? 0 : ambientTime);
  for (const b of BODIES) orbit(ctx, b.au, true, b.belt ? 0 : 1);
  belt(ctx, time, true);
  for (const { b, p } of planets.filter(x => x.p.depth >= 0).sort((a, c) => a.p.depth - c.p.depth)) planet(ctx, b, p, { time, o, highlight: b.id === hover || b.id === selected });
  for (const { b, p } of planets) label(ctx, b, p, { o, highlight: b.id === hover || b.id === selected });
  if (intro !== null && intro > .25 && intro < 1) {
    // The ark: a bright point climbing away from Earth on a widening arc.
    const e = bodyPosition(bodyById('earth'), time), t = clamp((intro - .25) / .7), out = orbitRadius(1) + t * 120, a = e.angle + t * .5;
    const x = SYSTEM.cx + Math.cos(a) * out, y = SYSTEM.cy + Math.sin(a) * out * SYSTEM.tilt, tail = .12;
    for (let k = 0; k < 8; k++) { const u = t - k * tail / 8; if (u < 0) break; const oa = e.angle + u * .5, or = orbitRadius(1) + u * 120; ctx.globalAlpha = (1 - k / 8) * .6; disc(ctx, SYSTEM.cx + Math.cos(oa) * or, SYSTEM.cy + Math.sin(oa) * or * SYSTEM.tilt, 1.4, '#f3e7b8'); }
    ctx.globalAlpha = 1; disc(ctx, x, y, 2.2, '#fff4d0');
  }
  ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#81968b'; ctx.fillText('SOL  /  行星际观测', 38, 572);
  ctx.restore();
}
// Which body a point in the 1000×620 frame falls on, nearest first.
export function bodyAt(o, x, y, { reducedMotion = false } = {}) {
  const time = reducedMotion ? 0 : o.elapsed;
  let best = null, bestDistance = Infinity;
  for (const b of BODIES) {
    if (b.belt) { const r = Math.hypot((x - SYSTEM.cx) / 1, (y - SYSTEM.cy) / SYSTEM.tilt); if (r > orbitRadius(2.2) && r < orbitRadius(3.3) && bestDistance > 30) { best = b; bestDistance = 30; } continue; }
    const p = bodyPosition(b, time), d = Math.hypot(x - p.x, y - p.y);
    if (d < Math.max(b.size, 6) + 12 && d < bestDistance) { best = b; bestDistance = d; }
  }
  return best;
}
