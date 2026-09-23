import { RULES, UNITS, createGame } from './game.js';
import { drawBattleScene } from './render.js';
import { drawUnit } from './units.js';
import { drawOrbitalScene } from './orbital-scene.js';

export const DESTRUCTION_SECONDS = 22;
const ruinsCache = new WeakMap();
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a + (b - a) * t;
const windowOpacity = (time, start, end) => ease((time - start) / .8) * (1 - ease((time - end + .8) / .8));
const CAPTIONS = [
  { start: .3, end: 3.8, text: '最后一座敌方基地，已经陷落。' },
  { start: 4, end: 7, text: '废墟中，最后的超级士兵出动。核武库随之启动。' },
  { start: 7.3, end: 11.8, text: '导弹越过战线。战争再也没有胜利者。' },
  { start: 12.4, end: 16.8, text: '你赢得了战争，却没能保住文明。' },
  { start: 17, end: 21.4, text: '但知识没有消失。余烬之上，文明留下了星图。' },
];

// This timeline is independent of game speed, simulation and reward settlement.
export function destructionFrame(seconds, reducedMotion = false) {
  const time = reducedMotion ? DESTRUCTION_SECONDS : Math.max(0, Math.min(DESTRUCTION_SECONDS, seconds));
  const caption = CAPTIONS.find(item => time >= item.start && time < item.end);
  return { time, expansion: ease(time / 2.6), ruins: ease((time - 10.5) / 4.5),
    treeOpacity: ease((time - 17.5) / 4.5), actionsOpacity: ease(time - 21), skipOpacity: 1 - ease((time - 20) / .7), complete: time >= DESTRUCTION_SECONDS,
    caption: caption?.text ?? '', captionOpacity: caption ? windowOpacity(time, caption.start, caption.end) : 0 };
}

export const LAST_ARSENAL = Object.freeze(Array.from({ length: 18 }, (_, i) => Object.freeze({
  delay: 2.8 + (i % 6) * .3 + Math.floor(i / 6) * .52,
  duration: 3.4 + (i % 4) * .2, target: .08 + (i * .173) % .84,
  altitude: .43 + (i % 5) * .07, offset: (i % 6) * 8,
})));
export function missilePose(missile, time, startX, ground, width) {
  const p = clamp((time - missile.delay) / missile.duration);
  const launchX = startX + missile.offset, targetX = width * missile.target;
  // A raised, slightly rightward control point makes a vertical launch turn
  // over into a descending arc. The nose follows the actual curve tangent.
  const controlX = launchX + width * .07, controlY = ground * (1 - missile.altitude * 2);
  const x = (1-p)**2 * launchX + 2*(1-p)*p*controlX + p*p*targetX;
  const y = (1-p)**2 * (ground - 18) + 2*(1-p)*p*controlY + p*p*ground;
  const dx = 2*(1-p)*(controlX-launchX) + 2*p*(targetX-controlX);
  const dy = 2*(1-p)*(controlY-ground+18) + 2*p*(ground-controlY);
  return { x, y, angle: Math.atan2(dy, dx), progress: p, active: time >= missile.delay && p < 1,
    impactAge: time - missile.delay - missile.duration };
}

function reinforcements(ctx, game, time, ground, scale) {
  const sourceX = game.bases.enemy.x;
  ctx.save(); ctx.translate(0, ground);
  for (let i = 0; i < 18; i++) {
    const rank = Math.floor(i / 6);
    const age = time - .8 - (i % 6) * .4 - rank * .18;
    if (age <= 0) continue;
    const distance = age * 90;
    ctx.save(); ctx.translate(0, -(2-rank) * 5);
    ctx.globalAlpha = (.5 + rank * .25) * ease(age / .4) * (1 - ease((time - 7.5) / 3));
    drawUnit(ctx, { id: 700 + i, team: 'enemy', type: 'superSoldier', x: sourceX + 12 - distance,
      hp: UNITS.superSoldier.health, moving: true, distanceTravelled: distance, attackAnimation: 0 },
    time, scale, false, UNITS.superSoldier.health, { ...UNITS.superSoldier, canRanged: false });
    ctx.restore();
  }
  ctx.restore();
}
function arsenal(ctx, time, origin, ground) {
  for (const missile of LAST_ARSENAL) {
    const pose = missilePose(missile, time, origin, ground, RULES.width);
    if (!pose.active) continue;
    ctx.save();
    // Persistent tapered vapor, rather than a single bright sweeping line.
    for (let j = 10; j > 0; j--) {
      const a = missilePose(missile, time - j * .065, origin, ground, RULES.width);
      const b = missilePose(missile, time - (j-1) * .065, origin, ground, RULES.width);
      ctx.strokeStyle = `rgba(184,174,139,${(1-j/11)*.34})`; ctx.lineWidth = 1 + j * .45;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.translate(pose.x, pose.y); ctx.rotate(pose.angle);
    ctx.fillStyle = '#b6bbaa'; ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(3,-3); ctx.lineTo(-9,-3); ctx.lineTo(-12,-5);
    ctx.lineTo(-11,5); ctx.lineTo(-9,3); ctx.lineTo(3,3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c4aa78'; ctx.beginPath(); ctx.moveTo(-10,-2); ctx.lineTo(-22,0); ctx.lineTo(-10,2); ctx.fill();
    ctx.restore();
  }
}
function fallout(ctx, width, height, time, ground) {
  // Slow overlapping fireballs and rising dust, with no hard white flash,
  // screen shake, or rapidly alternating luminance.
  for (const [i, missile] of LAST_ARSENAL.entries()) {
    const age = time - missile.delay - missile.duration;
    if (age < 0) continue;
    const grow = ease(age / 2.4), fade = 1 - ease((age - 2) / 4);
    if (!fade) continue;
    const x = width * missile.target, radius = (width * .11 + height * .07) * (.12 + grow);
    const y = ground - grow * height * (.14 + (i % 3) * .025);
    ctx.save(); ctx.globalAlpha = fade * .42;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.4);
    glow.addColorStop(0, '#e4d1a1'); glow.addColorStop(.2, '#bca27a'); glow.addColorStop(.55, '#796d54aa'); glow.addColorStop(1, '#796d5400');
    ctx.fillStyle = glow; ctx.fillRect(x-radius*2.4,y-radius*2.4,radius*4.8,radius*4.8);
    ctx.globalAlpha *= .72; ctx.fillStyle = '#9b927b';
    // A narrow rising stem and irregular cap read as distant nuclear clouds.
    ctx.beginPath(); ctx.moveTo(x-radius*.17, ground); ctx.lineTo(x-radius*.12, y);
    ctx.lineTo(x+radius*.15, y); ctx.lineTo(x+radius*.25,ground); ctx.fill();
    for (let j = 0; j < 5; j++) {
      ctx.beginPath(); ctx.ellipse(x+(j-2)*radius*.27,y+Math.abs(j-2)*radius*.06,radius*(.37+((i+j)%3)*.025),radius*.22,0,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
}

export function createDestructionPreview() {
  const game = createGame(); game.ages.player = 5; game.ages.enemy = 5;
  game.bases.enemy.hp = 0; game.elapsed = 75; game.status = 'won';
  return game;
}

function ruinImage(ctx, width, height) {
  const ratio = Math.min(2, Math.abs(ctx.getTransform().a)), w = Math.round(width * ratio), h = Math.round(height * ratio);
  let image = ruinsCache.get(ctx);
  if (!image || image.width !== w || image.height !== h) {
    image = ctx.canvas.ownerDocument.createElement('canvas'); image.width = w; image.height = h;
    const ink = image.getContext('2d'); ink.scale(ratio, ratio); drawOrbitalScene(ink, width, height, 0);
    ruinsCache.set(ctx, image);
  }
  return image;
}

// origin is the battle canvas's normalized viewport rectangle. Expanding that
// very same battle avoids cutting from a victory overlay to an unrelated sky.
// At 15 seconds the pixels are exactly the home's existing ruin scene.
export function drawDestructionScene(ctx, width, height, seconds, { game, origin = { x: 0, y: 0, width: 1, height: 1 }, reducedMotion = false } = {}) {
  const frame = destructionFrame(seconds, reducedMotion), { time } = frame;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return frame;
  // A first-frame layout/visibility change can yield an empty battlefield.
  // Never divide by that width or feed Infinity into Canvas gradients.
  if (!origin || !['x','y','width','height'].every(key => Number.isFinite(origin[key])) || origin.width <= 0 || origin.height <= 0)
    origin = { x: 0, y: 0, width: 1, height: 1 };
  ctx.save(); ctx.clearRect(0, 0, width, height);
  if (frame.ruins < 1 && game) {
    ctx.globalAlpha = frame.expansion; ctx.fillStyle = '#0c1519'; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1;
    const x = origin.x * width * (1 - frame.expansion), y = origin.y * height * (1 - frame.expansion);
    const w = mix(origin.width * width, width, frame.expansion), h = mix(origin.height * height, height, frame.expansion);
    const scale = w / RULES.width, ground = h * mix(.738, .87, ease((time-8)/6));
    ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip(); ctx.translate(x,y); ctx.scale(scale,scale);
    drawBattleScene(ctx, game, { height: h/scale, ground: ground/scale, entityScale: origin.width * width < 560 ? 1.35 : 1 });
    // Darken the living landscape before the last arsenal lights the horizon.
    ctx.fillStyle = '#0e1a20'; ctx.globalAlpha = ease((time-1.2)/6)*.58; ctx.fillRect(0,0,RULES.width,h/scale); ctx.globalAlpha = 1;
    reinforcements(ctx, game, time, ground/scale, origin.width * width < 560 ? 1.35 : 1);
    arsenal(ctx, time, game.bases.enemy.x, ground/scale);
    ctx.restore();
    fallout(ctx, width, height, time, y+ground);
  }
  if (frame.ruins === 1 || !game) drawOrbitalScene(ctx, width, height, 0);
  else if (frame.ruins > 0) {
    ctx.globalAlpha = game ? frame.ruins : 1;
    // Composite the complete scene as one layer. Individual stars and ruin
    // materials use their own opacity and must not interrupt the dissolve.
    ctx.drawImage(ruinImage(ctx, width, height), 0, 0, width, height);
  }
  ctx.restore(); return frame;
}
