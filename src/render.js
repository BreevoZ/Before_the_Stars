import { Q } from './quantity.js';
import { drawTurret } from './turrets.js';
import { RULES, UNITS, AGES, ABILITIES, getTurretPosition, getAbilityRadius, getAbilityImpactX, getUnitHealth, getUnitChargeTarget, attributes } from './game.js';
import { drawUnit } from './units.js';
import { drawBase } from './bases.js';
import { drawProjectile, drawImpact, drawFields, drawAbilityImpact, drawArrow, drawTraitEffect } from './combat-effects.js';

const PALETTES = {
  player: { light: '#b7d4b5', flag: '#bbd9b2' },
  enemy: { light: '#e1b58c', flag: '#dea579' },
};

// One full day follows match time, so pausing and restarting also affect the sky.
const DAY_NIGHT_CYCLE_SECONDS = 120;
// Hash each axis independently. A height-dependent modulo creates rows/diagonals
// at certain aspect ratios; normalized points keep the same sky through resizing.
function starNoise(seed) {
  let value = Math.imul(seed ^ (seed >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}
const STARS = [];
for (let seed = 0x51a7; STARS.length < 54; seed += 2) {
  const x = starNoise(seed), y = starNoise(seed + 1);
  // Keep a little breathing room without imposing a visible grid.
  if (STARS.every(star => Math.hypot(x - star.x, y - star.y) > 0.055)) STARS.push({ x, y });
}
const LANDSCAPE_COLORS = ['skyTop', 'skyMiddle', 'horizon', 'farMountain', 'middleMountain',
  'nearMountain', 'surface', 'soil', 'deepSoil', 'crust', 'grass'];
const LANDSCAPE_KEYFRAMES = [
  { phase: 0, stars: 0.3, colors: ['#455768', '#b58c83', '#efd09a', '#7b8070', '#586d58', '#3e5743', '#b9a477', '#424a36', '#29392d', '#74764f', '#a3a577'] },
  { phase: 0.18, stars: 0, colors: ['#689cad', '#a8c4b8', '#e4ddad', '#889c7d', '#607f60', '#405f46', '#c1b77d', '#50583b', '#344430', '#838755', '#aebc7b'] },
  { phase: 0.36, stars: 0, colors: ['#689cad', '#a8c4b8', '#e4ddad', '#889c7d', '#607f60', '#405f46', '#c1b77d', '#50583b', '#344430', '#838755', '#aebc7b'] },
  { phase: 0.5, stars: 0.3, colors: ['#4a4d65', '#b57570', '#e9ad70', '#796e64', '#585e50', '#3e4c3d', '#b29262', '#424232', '#2a332b', '#6d6547', '#a09465'] },
  { phase: 0.64, stars: 1, colors: ['#131e2b', '#263c44', '#63776a', '#3d5350', '#2b443d', '#20392f', '#718465', '#2b382f', '#1c2926', '#465840', '#6e8b6a'] },
  { phase: 0.86, stars: 1, colors: ['#131e2b', '#263c44', '#63776a', '#3d5350', '#2b443d', '#20392f', '#718465', '#2b382f', '#1c2926', '#465840', '#6e8b6a'] },
];
LANDSCAPE_KEYFRAMES.push({ ...LANDSCAPE_KEYFRAMES[0], phase: 1 });
for (const frame of LANDSCAPE_KEYFRAMES) {
  frame.colors = frame.colors.map(hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
}

function landscapeLight(phase) {
  const nextIndex = LANDSCAPE_KEYFRAMES.findIndex(frame => frame.phase > phase);
  const from = LANDSCAPE_KEYFRAMES[nextIndex - 1];
  const to = LANDSCAPE_KEYFRAMES[nextIndex];
  const progress = (phase - from.phase) / (to.phase - from.phase);
  const blend = progress * progress * (3 - 2 * progress);
  const light = { stars: from.stars + (to.stars - from.stars) * blend };
  LANDSCAPE_COLORS.forEach((name, index) => {
    light[name] = `rgb(${from.colors[index].map((value, channel) =>
      Math.round(value + (to.colors[index][channel] - value) * blend)).join(',')})`;
  });
  return light;
}

function polygon(ctx, points, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fill();
}

function line(ctx, points, color, width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
}

function drawCelestialBody(ctx, ground, angle, moon) {
  const elevation = Math.sin(angle);
  if (elevation < -0.15) return;
  const x = RULES.width / 2 - Math.cos(angle) * RULES.width * 0.39;
  const y = ground * (1 - elevation * 0.78);
  const radius = moon ? 27 : 32;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, (elevation + 0.15) / 0.3));
  const glow = ctx.createRadialGradient(x, y, radius * 0.6, x, y, radius * 3.5);
  glow.addColorStop(0, moon ? '#dce5bf30' : '#ffe3a555');
  glow.addColorStop(1, moon ? '#dce5bf00' : '#ffe3a500');
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius * 3.5, y - radius * 3.5, radius * 7, radius * 7);
  ctx.fillStyle = moon ? '#d9dfba' : '#ffe3a5';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  if (moon) {
    ctx.fillStyle = '#9aaa9530';
    for (const [dx, dy, size] of [[-9, -6, 7], [9, 7, 5], [-5, 13, 3]]) {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, size, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

export function drawLandscape(ctx, height, ground, time) {
  const phase = (time % DAY_NIGHT_CYCLE_SECONDS) / DAY_NIGHT_CYCLE_SECONDS;
  const light = landscapeLight(phase);
  const sky = ctx.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, light.skyTop);
  sky.addColorStop(0.6, light.skyMiddle);
  sky.addColorStop(1, light.horizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, RULES.width, height);

  ctx.save();
  for (let i = 0; i < STARS.length; i++) {
    const x = (0.02 + STARS[i].x * 0.96) * RULES.width;
    const y = (0.04 + STARS[i].y * 0.58) * ground;
    // Each star pulses every 2.4–5 seconds; whole cycles keep the day boundary seamless.
    const cycles = 24 + (i * 7) % 27;
    const pulse = (1 + Math.sin(phase * Math.PI * 2 * cycles + i * 2.3)) / 2;
    const twinkle = 0.12 + pulse * pulse * 0.88;
    const bright = i % 3 === 0;
    const size = (bright ? 2.4 : 1.6) * (0.8 + pulse * 0.4);
    ctx.globalAlpha = light.stars * twinkle * (bright ? 1 : 0.7);
    ctx.fillStyle = '#f2f1d8';
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    if (bright) {
      const glint = pulse ** 6;
      ctx.globalAlpha = light.stars * glint * 0.45;
      const reach = 2 + glint * 3;
      line(ctx, [[x - reach, y], [x + reach, y]], '#e2e6c8', 0.8);
      line(ctx, [[x, y - reach], [x, y + reach]], '#e2e6c8', 0.8);
    }
  }
  ctx.restore();
  drawCelestialBody(ctx, ground, phase * Math.PI * 2, false);
  drawCelestialBody(ctx, ground, phase * Math.PI * 2 + Math.PI, true);

  polygon(ctx, [[0, ground], [0, ground - 115], [95, ground - 149], [171, ground - 114],
    [284, ground - 195], [361, ground - 121], [425, ground - 155], [568, ground - 83],
    [672, ground - 170], [789, ground - 131], [869, ground - 209], [947, ground - 125],
    [1052, ground - 163], [1190, ground - 107], [1280, ground - 155], [1280, ground]], light.farMountain);
  polygon(ctx, [[0, ground], [0, ground - 70], [114, ground - 105], [266, ground - 68],
    [381, ground - 105], [504, ground - 40], [632, ground - 101], [770, ground - 62],
    [902, ground - 110], [1040, ground - 55], [1199, ground - 96], [1280, ground - 79], [1280, ground]], light.middleMountain);
  polygon(ctx, [[0, ground], [0, ground - 34], [192, ground - 45], [338, ground - 21],
    [552, ground - 48], [714, ground - 22], [921, ground - 40], [1097, ground - 20],
    [1280, ground - 40], [1280, ground]], light.nearMountain);

  ctx.fillStyle = light.surface;
  ctx.fillRect(0, ground, 1280, 4);
  ctx.fillStyle = light.soil;
  ctx.fillRect(0, ground + 4, 1280, height - ground);
  ctx.fillStyle = light.deepSoil;
  ctx.fillRect(0, ground + 22, 1280, height - ground - 22);
  polygon(ctx, [[0, ground + 4], [1280, ground + 4], [1280, ground + 11], [1076, ground + 14],
    [859, ground + 9], [697, ground + 18], [456, ground + 11], [289, ground + 17], [0, ground + 13]], light.crust);
  for (let i = 0; i < 66; i++) {
    const x = (i * 137 + 28) % 1280;
    const y = ground + 32 + (i * 29) % Math.max(1, height - ground - 55);
    ctx.fillStyle = i % 2 ? '#4c564036' : '#73806325';
    ctx.fillRect(x, y, 3 + i % 5, 2);
  }
  for (const x of [226, 317, 481, 802, 952, 1040]) {
    line(ctx, [[x - 3, ground], [x - 5, ground - 9], [x, ground - 3], [x + 4, ground - 14]], light.grass, 2);
  }
}

function drawDefenses(ctx, game, team, scale, reducedMotion) {
  if (Q.lte(game.bases[team].hp, 0)) return;
  for (let slot = 0; slot < game.turrets[team].length; slot++) {
    const turret = game.turrets[team][slot];
    if (!turret) continue;
    const { x, y } = getTurretPosition(game, team, slot, scale);
    ctx.save(); ctx.translate(x, y);
    drawTurret(ctx, turret, game.elapsed, scale, reducedMotion, true);
    ctx.restore();
  }
}

function drawTarget(ctx, x, radius, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#dfa16122';
  ctx.fillRect(x - radius, -85, radius * 2, 88);
  ctx.strokeStyle = '#edb46d';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(x - radius, -85, radius * 2, 88);
  ctx.setLineDash([]);
  line(ctx, [[x - 12, -32], [x + 12, -32]], '#f2d3a1');
  line(ctx, [[x, -44], [x, -20]], '#f2d3a1');
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 Canvas 2D。');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let sceneHeight = RULES.height;
  let entityScale = 1;
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * pixelRatio);
    canvas.height = Math.round(bounds.height * pixelRatio);
    sceneHeight = bounds.height / bounds.width * RULES.width;
    entityScale = bounds.width < 560 ? 1.35 : 1;
    const scale = canvas.width / RULES.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  return function render(game, { targeting = false, targetX = RULES.width / 2 } = {}) {
    drawBattleScene(ctx, game, { height: sceneHeight, entityScale, time: reducedMotion.matches ? 0 : game.elapsed,
      reducedMotion: reducedMotion.matches, targeting, targetX });
  };
}

// One painter for live combat and its final frame in the destruction sequence.
// Presentation callers supply their camera/clock; this never advances combat.
export function drawBattleScene(ctx, game, { height = RULES.height, ground = height * .738,
  time = game.elapsed, entityScale = 1, reducedMotion = false, targeting = false, targetX = RULES.width / 2 } = {}) {
  drawLandscape(ctx, height, ground, time);
  ctx.save();
  ctx.translate(0, ground);
  drawBase(ctx, game.bases.player, game.ages.player, time, entityScale, game.turrets.player.length);
  drawBase(ctx, game.bases.enemy, game.ages.enemy, time, entityScale, game.turrets.enemy.length);
  drawDefenses(ctx, game, 'player', entityScale, reducedMotion);
  drawDefenses(ctx, game, 'enemy', entityScale, reducedMotion);
  drawFields(ctx, game, time, entityScale, reducedMotion);
  // Draw the ranged rank behind the frontline, including when allies pass each other.
  for (const lane of ['back', 'front']) {
    for (const unit of game.units) if (UNITS[unit.type].lane === lane) drawUnit(ctx, unit, game.elapsed, entityScale, reducedMotion, getUnitHealth(game, unit.type, unit.team), attributes(game, unit));
  }
  for (const shot of game.projectiles) drawProjectile(ctx, shot, entityScale, reducedMotion);
  if (targeting) drawTarget(ctx, targetX, getAbilityRadius(AGES[game.ages.player].ability, game));
  drawBattleEffects(ctx, game, entityScale, reducedMotion, ground);
  ctx.restore();
}

// Shared by the battlefield and the frame-by-frame animation workshop.
export function drawUnitTargeting(ctx, game, scale = 1, reducedMotion = false) {
  for (const unit of game.units ?? []) {
    if (!(unit.chargeRemaining > 0)) continue;
    const target = getUnitChargeTarget(game, unit);
    if (!target || Q.lte(target.hp, 0)) continue;
    const stats = attributes(game, unit), direction = unit.team === 'player' ? 1 : -1;
    const p = reducedMotion ? .5 : 1 - unit.chargeRemaining / unit.chargeDuration;
    const fromX = unit.x + direction * Math.min(stats.muzzleX ?? 0, Math.abs(target.x - unit.x) * .5) * scale;
    const x = target.x - (target.type ? 0 : direction * RULES.baseHalfWidth * scale);
    const y = (target.type ? -UNITS[target.type].height * .52 : -45) * scale;
    const color = unit.team === 'player' ? '#b0d5bd' : '#ddbd94', r = (12 - p * 5) * scale;
    ctx.save(); ctx.globalAlpha = .4 + p * .4;
    ctx.setLineDash([3 * scale, 5 * scale]);
    line(ctx, [[fromX, (stats.muzzleY ?? -43) * scale], [x, y]], color, scale);
    ctx.setLineDash([]); ctx.globalAlpha = .85;
    for (const sx of [-1, 1]) for (const sy of [-1, 1])
      line(ctx, [[x+sx*r,y+sy*(r-4*scale)],[x+sx*r,y+sy*r],[x+sx*(r-4*scale),y+sy*r]], color, 1.3 * scale);
    ctx.restore();
  }
}
export function drawBattleEffects(ctx, game, entityScale = 1, reducedMotion = false, ground = 260) {
  ctx.save();
  drawUnitTargeting(ctx, game, entityScale, reducedMotion);
  if (game.ability) {
    const ability = game.ability;
    const stats = ability.stats ?? ABILITIES[ability.type];
    if (stats.targeting === 'allies') {
      for (const unit of game.units.filter(unit => unit.team === 'player')) {
        ctx.strokeStyle = '#a8e4a0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(unit.x, -4, 22 * entityScale, 7, 0, 0, Math.PI * 2); ctx.stroke();
        const lift = reducedMotion ? 0 : (game.elapsed * 15 + unit.id * 7) % 20;
        line(ctx, [[unit.x - 5, -75 - lift], [unit.x + 5, -75 - lift]], '#b5efac', 3);
        line(ctx, [[unit.x, -80 - lift], [unit.x, -70 - lift]], '#b5efac', 3);
      }
    } else {
      drawTarget(ctx, ability.x, (stats.radius ?? 0) + (stats.sweep ?? 0) * (stats.waves - 1 || 0) / 2, 0.5);
      const impactX = getAbilityImpactX(ability);
      if (stats.sweep) drawTarget(ctx, impactX, stats.radius, 0.8);
      const interval = ability.wavesLeft === stats.waves ? stats.delay : stats.waveInterval;
      const progress = Math.max(0, Math.min(1, 1 - ability.remaining / interval));
      const y = -ground * (1 - progress * progress);
      if (!reducedMotion && ability.type === 'meteor') {
        const x = impactX - 140 * (1 - progress);
        polygon(ctx, [[x - 45, y - 85], [x + 15, y], [x - 14, y + 9]], '#e59b5899');
        ctx.fillStyle = '#ffe0a0'; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      } else if (!reducedMotion && ability.type === 'volley') {
        for (let i = 0; i < 13; i++) {
          const arrowX = impactX - stats.radius + i * stats.radius / 6;
          ctx.save(); ctx.translate(arrowX - 60 * (1 - progress), y);
          ctx.rotate(Math.atan2(ground * 2 * progress, 60)); ctx.scale(entityScale, entityScale);
          drawArrow(ctx); ctx.restore();
        }
      } else if (!reducedMotion && ability.type === 'airstrike') {
        // All three bombs share one fall time and inherit the aircraft's
        // horizontal motion; later bombs are already falling before the first hits.
        const elapsed = stats.delay + (stats.waves - 1) * stats.waveInterval -
          (ability.remaining + (ability.wavesLeft - 1) * stats.waveInterval);
        const speed = stats.sweep / stats.waveInterval;
        const planeStart = ability.x - stats.sweep - speed * stats.delay;
        const planeX = planeStart + elapsed * speed;
        ctx.save(); ctx.translate(planeX, -ground * 0.78);
        polygon(ctx, [[-37, 0], [-12, -7], [-19, -30], [-7, -30], [10, -6], [34, -3], [42, 1], [10, 5], [-8, 25], [-20, 25], [-12, 5], [-35, 7]], '#a5b5a0');
        line(ctx, [[-48, 1], [-38, 1]], '#d5b68b', 2); ctx.restore();
        for (let i = 0; i < stats.waves; i++) {
          const t = (elapsed - i * stats.waveInterval) / stats.delay;
          if (t < 0 || t >= 1) continue;
          const destination = Math.max(0, Math.min(RULES.width, ability.x + stats.sweep * (i - 1)));
          const releaseX = planeStart + i * stats.sweep;
          const bombX = releaseX + (destination - releaseX) * t;
          const bombY = -ground * 0.78 * (1 - t * t);
          ctx.save(); ctx.translate(bombX, bombY);
          ctx.rotate(Math.atan2(ground * 1.56 * t, destination - releaseX));
          polygon(ctx, [[-10, -5], [-5, -3], [5, -3], [9, 0], [5, 3], [-5, 3], [-10, 5]], '#a6b09c');
          line(ctx, [[1, -3], [1, 3]], '#c4b281', 2); ctx.restore();
        }
      } else if (ability.type === 'orbital') {
        const radius = stats.radius * (1 - progress * 0.8);
        ctx.strokeStyle = '#99efdf'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(impactX, -20, radius, radius * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
        line(ctx, [[impactX, -ground], [impactX, -20]], '#96ffe155', 2 + progress * 8);
        if (!reducedMotion) {
          line(ctx, [[impactX - 26, -ground + 22], [impactX + 26, -ground + 22]], '#bdeee0', 5);
          polygon(ctx, [[impactX - 9, -ground + 12], [impactX + 9, -ground + 12], [impactX + 6, -ground + 33], [impactX - 6, -ground + 33]], '#87b9b7');
        }
      }
    }
  }
  for (const effect of game.effects) if (effect.kind === 'trait') drawTraitEffect(ctx, effect, entityScale, reducedMotion);
  if (!reducedMotion) {
    for (const effect of game.effects) {
      ctx.globalAlpha = effect.life / effect.duration;
      if (effect.kind === 'pierce') {
        line(ctx, [[effect.x, effect.y * entityScale], [effect.toX, effect.y * entityScale]], PALETTES[effect.team].light, effect.weapon === 'ion' ? 2.5 : 1.2);
        continue;
      }
      if (effect.kind === 'evolve') {
        const radius = 70 + (1 - effect.life / effect.duration) * 60;
        ctx.strokeStyle = PALETTES[effect.team].flag;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(effect.x, -10, radius, radius * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
        continue;
      }
      if (effect.kind === 'impact') {
        const target = effect.followTargetId == null ? null : game.units.find(unit => unit.id === effect.followTargetId);
        drawImpact(ctx, effect, entityScale, target?.x ?? effect.x);
      } else if (['meteor', 'volley', 'airstrike', 'orbital'].includes(effect.kind)) {
        drawAbilityImpact(ctx, effect, entityScale, ground);
      }
    }
  }
  ctx.restore();
}
