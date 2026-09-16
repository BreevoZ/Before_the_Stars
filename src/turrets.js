import { TURRETS } from './game.js';

// Small, unoutlined material planes match the landscape and troop silhouettes.
const M = { wood: '#958163', lightWood: '#b09d79', darkWood: '#6b654f', stone: '#aeb59f',
  steel: '#97ab9b', lightSteel: '#bdc8b2', darkSteel: '#667f70', bronze: '#af9b6e',
  dark: '#3e554b', ceramic: '#c2b591', fire: '#dfba76' };
function polygon(ctx, points, color) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
function line(ctx, points, color, width = 2) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function oval(ctx, x, y, rx, ry, color) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}
function flash(ctx, x, y, m, mode = 'automatic') {
  if (!m.firing) return;
  ctx.save();
  if (mode === 'powder') {
    ctx.globalAlpha = m.kick * 0.2;
    for (let i = 0; i < 3; i++) {
      const age = m.flashAge;
      oval(ctx, x + 3 + age * (18 + i * 16), y - age * (10 + i * 12), 2 + age * 10, 2 + age * 8, '#c2c4ad');
    }
  }
  ctx.globalAlpha = m.kick * 0.85;
  if (['rail', 'laser', 'ion'].includes(mode)) {
    if (m.flashAge < 0.1) {
      oval(ctx, x, y, mode === 'ion' ? 3 : 1.7, 2, m.energy);
      if (mode === 'rail') line(ctx, [[x - 6, y], [x + 8, y]], m.energy, 1.2);
    }
  } else if (m.flashAge < 0.065) {
    polygon(ctx, [[x, y - 2], [x + 5, y - 1], [x + 11, y], [x + 4, y + 2], [x, y + 1]], M.fire);
  }
  ctx.restore();
}
function wheel(ctx, x, y, radius) {
  oval(ctx, x, y, radius, radius, M.darkWood);
  line(ctx, [[x - radius + 1, y], [x + radius - 1, y]], M.lightWood, 1.5);
  line(ctx, [[x, y - radius + 1], [x, y + radius - 1]], M.lightWood, 1.5);
}
function sling(ctx, m) {
  polygon(ctx, [[-13, -3], [-8, -16], [2, -16], [9, -3]], M.darkWood);
  line(ctx, [[-3, -7], [-3, -23], [-10, -34]], M.lightWood, 4);
  line(ctx, [[-3, -23], [12, -34]], M.wood, 4);
  const pull = m.firing ? 8 * (1 - m.kick) : 8;
  line(ctx, [[-10, -34], [10 - pull, -28], [12, -34]], M.ceramic, 1);
  if (m.loaded) oval(ctx, 10 - pull, -28, 4, 3.5, M.stone);
  polygon(ctx, [[-9, -13], [-3, -13], [-3, -8], [-9, -8]], m.cloth);
}
function eggTower(ctx, m) {
  polygon(ctx, [[-18, -4], [-13, -15], [11, -15], [17, -4]], M.wood);
  line(ctx, [[-18, -5], [20, -5]], M.lightWood, 3);
  ctx.save(); ctx.translate(-m.kick * 2, 0);
  // A hen-shaped hopper and open chute retain the original egg weapon's identity.
  polygon(ctx, [[-19, -22], [-12, -34], [-6, -29], [6, -29], [14, -22], [5, -13], [-12, -14]], M.ceramic);
  polygon(ctx, [[-20, -23], [-22, -32], [-14, -28], [-10, -22]], M.darkWood);
  polygon(ctx, [[8, -24], [8, -34], [14, -38], [21, -35], [21, -25]], M.ceramic);
  polygon(ctx, [[20, -32], [27, -29], [20, -27]], M.bronze);
  polygon(ctx, [[11, -37], [13, -41], [17, -39], [20, -37]], m.cloth);
  polygon(ctx, [[-8, -26], [4, -24], [-3, -18], [-12, -21]], M.lightWood);
  line(ctx, [[4, -18], [22, -25]], M.darkWood, 3);
  if (m.loaded) oval(ctx, 18, -24, 3, 4, M.lightSteel);
  ctx.restore();
}
function catapult(ctx, m, primitive, fire) {
  line(ctx, [[-18, -5], [17, -5]], M.darkWood, 5);
  polygon(ctx, [[-15, -5], [-5, -29], [1, -29], [13, -5], [7, -5], [-2, -23], [-9, -5]], M.wood);
  if (!primitive) {
    wheel(ctx, -13, -4, 4); wheel(ctx, 11, -4, 4);
    line(ctx, [[-12, -14], [8, -14]], M.lightWood, 2);
  }
  if (fire) {
    polygon(ctx, [[8, -20], [21, -20], [18, -12], [11, -12]], M.bronze);
    polygon(ctx, [[11, -20], [12, -27 - m.pulse], [15, -23], [18, -26], [19, -20]], M.fire);
  }
  const release = m.firing ? m.kick : 0;
  const x = -19 + release * 30, y = (primitive ? -31 : -33) - release * 6;
  line(ctx, [[-4 - (x + 4) * 0.45, -8], [-4, -22], [x, y]], M.lightWood, primitive ? 3 : 4);
  polygon(ctx, [[x - 7, y - 2], [x + 6, y - 2], [x + 4, y + 3], [x - 5, y + 3]], M.darkWood);
  if (!primitive) polygon(ctx, [[-8 - (x + 4) * 0.45, -12], [1 - (x + 4) * 0.45, -12], [1 - (x + 4) * 0.45, -4], [-8 - (x + 4) * 0.45, -4]], M.stone);
  if (m.loaded) {
    polygon(ctx, [[x - 5, y - 3], [x - 4, y - 9], [x + 2, y - 11], [x + 6, y - 6], [x + 3, y - 1]], fire ? M.bronze : M.stone);
    if (fire) polygon(ctx, [[x - 4, y - 7], [x - 3, y - 11 - m.pulse], [x + 1, y - 8], [x + 4, y - 10], [x + 5, y - 7]], M.fire);
  }
  polygon(ctx, [[-7, -17], [-2, -17], [0, -8], [-5, -8]], m.cloth);
}
function oilPot(ctx, m) {
  line(ctx, [[-16, -2], [-16, -29], [14, -29], [14, -2]], M.darkWood, 3);
  ctx.save(); ctx.translate(0, -21); ctx.rotate(m.kick * 0.65);
  polygon(ctx, [[-13, -3], [13, -3], [10, 12], [4, 16], [-7, 14], [-12, 7]], M.darkSteel);
  polygon(ctx, [[-10, -1], [10, -1], [8, 9], [-7, 10]], M.bronze);
  line(ctx, [[-13, -3], [14, -3]], M.lightWood, 2);
  line(ctx, [[-7, -4], [-5, -11], [6, -11], [9, -4]], M.steel, 1.5);
  if (m.firing) line(ctx, [[13, -2], [21, 2], [21, 8 + (1 - m.kick) * 8]], M.fire, 3);
  ctx.restore();
  polygon(ctx, [[-17, -12], [-13, -12], [-13, -5], [-17, -5]], m.cloth);
}
function cannon(ctx, m, type) {
  const heavy = type === 'largeCannon', explosive = type === 'explosiveCannon';
  polygon(ctx, [[-17, -3], [-12, -16], [9, -16], [17, -4]], M.darkWood);
  ctx.save(); ctx.translate(0, -18); ctx.rotate(explosive ? -0.46 : m.aim);
  const length = heavy ? 33 : explosive ? 27 : 30, radius = heavy ? 6 : explosive ? 8 : 4;
  const r = m.kick * (heavy ? 5 : 3);
  polygon(ctx, [[-14 - r, -radius], [length - r, -radius + 1], [length - r, radius - 1], [-14 - r, radius], [-18 - r, 0]], explosive ? M.steel : M.bronze);
  polygon(ctx, [[-13 - r, -radius], [length - r, -radius + 1], [length - r, -1], [-13 - r, -2]], explosive ? M.lightSteel : M.lightWood);
  line(ctx, [[length - r, -radius], [length - r, radius]], M.dark, 3);
  if (heavy) for (const x of [2, 21]) line(ctx, [[x - r, -radius], [x - r, radius]], M.darkWood, 2);
  flash(ctx, length - r + 2, 0, m, 'powder'); ctx.restore();
  wheel(ctx, -11, -5, heavy ? 7 : 6); wheel(ctx, 11, -5, heavy ? 7 : 6);
  polygon(ctx, [[-5, -12], [3, -12], [3, -6], [-5, -6]], m.cloth);
}
function gun(ctx, m, twin) {
  polygon(ctx, [[-17, -2], [-10, -10], [10, -10], [17, -2]], M.darkSteel);
  polygon(ctx, [[-6, -5], [-6, -19], [6, -19], [6, -5]], M.steel);
  ctx.save(); ctx.translate(0, -18); ctx.rotate(m.aim);
  polygon(ctx, [[-17, 2], [-12, -12], [8, -12], [15, -3], [11, 6], [-11, 7]], M.steel);
  polygon(ctx, [[-12, -12], [7, -12], [12, -6], [-13, -6]], M.lightSteel);
  for (let i = 0; i < (twin ? 2 : 1); i++) {
    const y = -4 + i * 7, r = m.barrel === i ? m.kick * 4 : 0;
    line(ctx, [[3 - r, y], [(twin ? 32 : 31) - r, y]], M.darkSteel, 5);
    line(ctx, [[8 - r, y - 1], [28 - r, y - 1]], M.lightSteel, 2);
    if (m.barrel === i) flash(ctx, 33 - r, y, m);
  }
  polygon(ctx, [[-14, -3], [-7, -3], [-7, 4], [-14, 4]], m.cloth);
  if (m.firing && m.flashAge < 0.3) {
    const t = m.flashAge;
    ctx.save(); ctx.translate(-15 - t * 32, -8 - t * 30 + t * t * 150); ctx.rotate(t * 12);
    line(ctx, [[-2, 0], [2, 0]], M.bronze, 1.5); ctx.restore();
  }
  ctx.restore();
}
function rocket(ctx, m) {
  polygon(ctx, [[-14, -2], [-8, -17], [4, -17], [13, -2]], M.darkSteel);
  ctx.save(); ctx.translate(0, -22); ctx.rotate(-0.4);
  polygon(ctx, [[-19, -12], [22, -12], [25, 8], [-19, 8]], M.steel);
  polygon(ctx, [[-19, -12], [22, -12], [19, -7], [-19, -7]], M.lightSteel);
  for (const y of [-4, 4]) {
    line(ctx, [[-15, y], [24, y]], M.dark, 4);
    if (m.loaded || y === 4) {
      line(ctx, [[-10, y], [17, y]], M.ceramic, 2.5);
      polygon(ctx, [[17, y - 2], [22, y], [17, y + 2]], M.bronze);
    }
  }
  if (m.firing) polygon(ctx, [[-20, -7], [-28 - m.kick * 7, -4], [-20, -1]], M.fire);
  polygon(ctx, [[-14, -13], [-5, -13], [-5, -9], [-14, -9]], m.cloth);
  ctx.restore();
}
function future(ctx, m, type) {
  polygon(ctx, [[-18, -2], [-10, -12], [9, -12], [18, -2]], M.darkSteel);
  polygon(ctx, [[-9, -7], [-5, -24], [6, -24], [10, -7]], M.steel);
  ctx.save(); ctx.translate(0, -18); ctx.rotate(m.aim);
  if (type === 'titanium') {
    polygon(ctx, [[-17, -7], [-9, -14], [12, -10], [18, 4], [-13, 5]], M.steel);
    for (const y of [-7, -1]) line(ctx, [[-2, y], [32 - m.kick * 3, y]], M.lightSteel, 3);
    line(ctx, [[7, -4], [32, -4]], m.energy, 1.5);
    for (const x of [1, 9, 17]) line(ctx, [[x, -10], [x + 3, 2]], M.darkSteel, 2);
    flash(ctx, 33, -4, m, 'rail');
  } else if (type === 'laser') {
    polygon(ctx, [[-18, -8], [-9, -15], [20, -12], [28, -5], [20, 4], [-9, 5]], M.darkSteel);
    polygon(ctx, [[-9, -15], [20, -12], [24, -8], [-11, -9]], M.lightSteel);
    line(ctx, [[-6, -5], [31, -5]], m.energy, 2);
    for (const x of [11, 22]) polygon(ctx, [[x, -13], [x + 3, -12], [x + 3, 3], [x, 4]], M.steel);
    flash(ctx, 31, -5, m, 'laser');
  } else {
    const open = m.charge * 4;
    polygon(ctx, [[-18, -6], [-10, -18 - open], [11, -17 - open], [25, -9 - open], [10, -11], [-5, -10], [-8, 1]], M.steel);
    polygon(ctx, [[-18, -4], [-10, 9 + open], [11, 8 + open], [25, -1 + open], [10, 2], [-5, 1], [-8, -10]], M.darkSteel);
    oval(ctx, -2, -5, 6, 6, M.dark);
    oval(ctx, -2, -5, 2 + m.charge * 4, 2 + m.charge * 4, m.energy);
    if (m.charge > 0) { ctx.save(); ctx.globalAlpha = m.charge * 0.2; oval(ctx, 5, -5, 13, 9, m.energy); ctx.restore(); }
    flash(ctx, 25, -5, m, 'ion');
  }
  polygon(ctx, [[-16, -5], [-10, -5], [-9, 1], [-15, 1]], m.cloth);
  ctx.restore();
}

export function drawTurret(ctx, turret, time = 0, scale = 1, reducedMotion = false, mounted = false) {
  const stats = TURRETS[turret.type];
  const kick = reducedMotion ? 0 : Math.max(0, (turret.flash ?? 0) / (turret.flashDuration || 0.45));
  const m = { kick, firing: kick > 0, loaded: !turret.cooldown || turret.cooldown < stats.interval * 0.55,
    flashAge: (turret.flashDuration || 0.45) - (turret.flash ?? 0),
    aim: turret.aim ?? 0, barrel: turret.lastBarrel ?? 0,
    charge: !reducedMotion && turret.chargeRemaining > 0 ? 1 - turret.chargeRemaining / stats.chargeTime : 0,
    pulse: reducedMotion ? 0 : Math.sin(time * 5) * 1.2,
    cloth: turret.team === 'player' ? '#7faa91' : '#b48d70', energy: turret.team === 'player' ? '#b0d5bd' : '#ddbd94' };
  ctx.save(); ctx.scale(scale * (turret.team === 'player' ? 1 : -1), scale);
  ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel';
  if (!mounted) polygon(ctx, [[-18, -3], [18, -3], [18, 0], [-18, 0]], M.darkSteel);
  switch (turret.type) {
    case 'rockSling': sling(ctx, m); break;
    case 'egg': eggTower(ctx, m); break;
    case 'primitiveCatapult': catapult(ctx, m, true, false); break;
    case 'catapult': catapult(ctx, m, false, false); break;
    case 'fireCatapult': catapult(ctx, m, false, true); break;
    case 'oil': oilPot(ctx, m); break;
    case 'smallCannon': case 'largeCannon': case 'explosiveCannon': cannon(ctx, m, turret.type); break;
    case 'singleTurret': gun(ctx, m, false); break;
    case 'doubleTurret': gun(ctx, m, true); break;
    case 'rocket': rocket(ctx, m); break;
    default: future(ctx, m, turret.type);
  }
  ctx.restore();
}
