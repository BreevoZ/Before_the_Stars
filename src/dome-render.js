// Mars domes in cross-section: one glass dome per built rank, two households
// each. Uplifted civilizations hold their place for good (warm towers), living
// residents grow with their age, a negotiation draws a ring, and a nuclear
// winter frosts everything except what has already crossed the filter.
import { SOLAR_TALENTS, COLONY_RULES } from './solar-colony.js';
const TAU = Math.PI * 2;
const disc = (c, x, y, r, fill) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); };
const noise = n => { n = Math.imul(n ^ (n >>> 16), 0x21f0aaad); n = Math.imul(n ^ (n >>> 15), 0x735a2d97); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };

// Who lives where: uplifted households first (they never move), then residents, then arks on their way.
export function domeHouseholds(o) {
  const world = o.solar.colonies.mars;
  return [...world.uplifted.map(civ => ({ civ, kind: 'uplifted' })), ...world.civs.map(civ => ({ civ, kind: 'resident' })),
    ...o.solar.transfers.filter(t => t.to === 'mars').map(t => ({ civ: t.civ, kind: 'incoming' }))];
}
function tower(c, x, ground, height, width, lit, warm) {
  c.fillStyle = warm ? '#6d5a3f' : '#3c4a48'; c.fillRect(x - width / 2, ground - height, width, height);
  c.fillStyle = warm ? '#f0cf8c' : lit ? '#d9d2a6' : '#58625f';
  for (let y = ground - height + 4; y < ground - 3; y += 6) c.fillRect(x - width / 2 + 2, y, Math.max(1, width - 4), 1.4);
}
export function drawDomes(c, w, h, o, { time = 0 } = {}) {
  const world = o.solar.colonies.mars, ranks = o.solar.talents.dome, slots = SOLAR_TALENTS.dome.costs.length, winter = world.phase === 'winter';
  c.clearRect(0, 0, w, h);
  const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, winter ? '#161c1f' : '#1b1715'); sky.addColorStop(1, winter ? '#2a3033' : '#3a2620');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) disc(c, noise(i + 3) * w, noise(i + 90) * h * .55, .5 + noise(i + 7) * .6, '#d6cdb455');
  const ground = h * .8;
  c.fillStyle = winter ? '#586062' : '#6b3f2d'; c.beginPath(); c.moveTo(0, ground);
  for (let x = 0; x <= w; x += 16) c.lineTo(x, ground - 4 * Math.sin(x * .03) - 3 * noise(x));
  c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
  const homes = domeHouseholds(o), span = w / slots, radius = Math.min(span * .42, h * .55);
  for (let d = 0; d < slots; d++) {
    const x = span * (d + .5), built = d < ranks;
    c.save(); c.beginPath(); c.arc(x, ground, radius, Math.PI, TAU);
    if (!built) { c.setLineDash([3, 5]); c.strokeStyle = '#8a7c6a55'; c.lineWidth = 1; c.stroke(); c.restore();
      c.fillStyle = '#8a7c6a88'; c.font = '9px system-ui,sans-serif'; c.textAlign = 'center'; c.fillText('未建', x, ground - radius * .45); continue; }
    c.fillStyle = winter ? '#aeb8b91c' : '#c9d6c90f'; c.fill(); c.clip();
    // Two households per dome, side by side.
    for (let k = 0; k < COLONY_RULES.domeCapacity; k++) {
      const home = homes[d * COLONY_RULES.domeCapacity + k], hx = x + (k ? 1 : -1) * radius * .38;
      if (!home) continue;
      const { civ, kind } = home, age = kind === 'uplifted' ? 5 : civ.age, lit = !winter || kind === 'uplifted';
      if (kind === 'incoming') { c.strokeStyle = '#e6d6a466'; c.setLineDash([2, 3]); c.strokeRect(hx - 6, ground - 10, 12, 10); c.setLineDash([]); continue; }
      for (let t = 0; t < age; t++) tower(c, hx + (t - (age - 1) / 2) * 5.5, ground, radius * (.18 + .1 * ((t * 7 + age) % 4)) * (kind === 'uplifted' ? 1.45 : 1), 4.5, lit, kind === 'uplifted');
      if (kind === 'uplifted') { const glow = c.createRadialGradient(hx, ground - radius * .3, 0, hx, ground - radius * .3, radius * .55); glow.addColorStop(0, '#f3d99a33'); glow.addColorStop(1, '#f3d99a00'); c.fillStyle = glow; c.fillRect(hx - radius, ground - radius, radius * 2, radius); }
      if (civ.accord !== null && civ.accord !== undefined) { const y = ground - radius * .62; c.lineWidth = 1.4; c.strokeStyle = '#e8d49a44'; c.beginPath(); c.arc(hx, y, 5, 0, TAU); c.stroke();
        c.strokeStyle = '#e8d49a'; c.beginPath(); c.arc(hx, y, 5, -Math.PI / 2, -Math.PI / 2 + TAU * civ.accord); c.stroke(); }
      if (civ.warId) disc(c, hx, ground - radius * .62, 2 + Math.sin(time * 5) * .6, '#ec805c');
    }
    c.restore();
    // Glass: rim, a highlight, and frost in a winter.
    c.strokeStyle = winter ? '#c3cdcd99' : '#cdd9c877'; c.lineWidth = 1.2; c.beginPath(); c.arc(x, ground, radius, Math.PI, TAU); c.stroke();
    c.strokeStyle = '#ffffff22'; c.lineWidth = 2; c.beginPath(); c.arc(x, ground, radius * .86, Math.PI * 1.15, Math.PI * 1.38); c.stroke();
    if (winter) for (let i = 0; i < 14; i++) disc(c, x + (noise(d * 31 + i) - .5) * radius * 1.8, ground - noise(d * 17 + i) * radius * .9, .8, '#e4ecec88');
    c.fillStyle = '#b9ab8e'; c.font = '8px ui-monospace,monospace'; c.textAlign = 'center'; c.fillText(`DOME ${String(d + 1).padStart(2, '0')}`, x, ground + 14);
  }
  // Residents at war: a thin red arc between the two households.
  for (const war of world.wars) {
    const at = war.sides.map(id => homes.findIndex(hm => hm.civ.id === id)).map(i => ({ x: span * (Math.floor(i / 2) + .5) + (i % 2 ? 1 : -1) * radius * .38, y: ground - radius * .62 }));
    if (at.some(p => !Number.isFinite(p.x))) continue;
    c.strokeStyle = war.seized ? '#e8d49a99' : '#ec805c88'; c.setLineDash([2, 4]); c.lineWidth = 1; c.beginPath(); c.moveTo(at[0].x, at[0].y);
    c.quadraticCurveTo((at[0].x + at[1].x) / 2, Math.min(at[0].y, at[1].y) - radius * .5, at[1].x, at[1].y); c.stroke(); c.setLineDash([]);
  }
  if (winter) { c.fillStyle = '#c9d2d2'; c.font = '10px ui-monospace,monospace'; c.textAlign = 'right'; c.fillText(`NUCLEAR WINTER ${Math.ceil(world.remaining)}s`, w - 14, 18); }
  c.fillStyle = '#9d8f78'; c.font = '8px ui-monospace,monospace'; c.textAlign = 'left'; c.fillText('MARS / DOME CROSS-SECTION', 14, 18);
}
