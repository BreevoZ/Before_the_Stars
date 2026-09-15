import { UNITS } from './game.js';

// The landscape's sage, stone and ochre palette carries into every era.
// Silhouettes and a few material planes describe equipment; no enclosing ink outlines.
const INK = '#36483f';
const MATERIAL = Object.freeze({
  skin: '#c3ae8c', hair: '#535345', leather: '#67634f',
  wood: '#938060', woodLight: '#b19d76', woodDark: '#71664f',
  hide: '#a39470', hideDark: '#857b5e',
  steel: '#a2b1a5', steelLight: '#c2c9b6', steelDark: '#7c9286',
  olive: '#889575', oliveDark: '#65745c',
  bronze: '#aa9a71', bronzeLight: '#c3b388',
  armor: '#a8bab0', armorDark: '#788f87', inset: '#465e57',
});
const shade = hex => `#${[1, 3, 5].map(offset => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * 0.82).toString(16).padStart(2, '0')).join('')}`;
function shape(ctx, points, fill, outline = null, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = width; ctx.stroke(); }
}
function stroke(ctx, points, color, width = 2) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function limb(ctx, points, color, width = 5) {
  ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel';
  stroke(ctx, points, color, width); ctx.restore();
}
function oval(ctx, x, y, rx, ry, color, outline = null) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1.2; ctx.stroke(); }
}
function face(ctx, x, y, c, hair = true) {
  shape(ctx, [[x - 5, y - 6], [x + 3, y - 7], [x + 5, y - 3], [x + 7, y],
    [x + 5, y + 1], [x + 4, y + 6], [x - 2, y + 7], [x - 5, y + 2]], c.skin);
  // A single shadow plane replaces eyes and cartoon facial features at battle scale.
  shape(ctx, [[x - 5, y - 4], [x - 2, y - 3], [x - 1, y + 6], [x - 4, y + 3]], shade(c.skin));
  if (hair) shape(ctx, [[x - 5, y + 1], [x - 7, y - 5], [x - 3, y - 9],
    [x + 4, y - 8], [x + 6, y - 4], [x - 1, y - 5], [x - 3, y]], MATERIAL.hair);
}
function legs(ctx, m, color, boot = MATERIAL.leather, crouch = 0) {
  for (const side of [-1, 1]) {
    const gait = m.gait * side;
    const hip = side * 5;
    const foot = side * 6 + gait * 6.5;
    const lift = m.moving ? Math.max(0, gait) * 3.5 : 0;
    limb(ctx, [[hip, -24 + crouch], [hip + gait * 4 - crouch * 0.4, -12], [foot, -3 - lift]], side < 0 ? shade(color) : color, 5);
    limb(ctx, [[foot - 2, -3 - lift], [foot + 5, -2 - lift]], boot, 4);
  }
}
function feather(ctx, x, y, c, flutter) {
  shape(ctx, [[x, y], [x - 7, y - 14 + flutter], [x, y - 10], [x + 2, y - 4]], c);
}
function muzzle(ctx, x, y, m, energy = false, smoke = false) {
  if (m.reduced || m.remaining <= 0) return;
  if (m.age < 0.1) {
    shape(ctx, [[x, y - 2], [x + 12, y], [x, y + 2]], energy ? '#c5dfc9' : '#ddc48c');
  }
  if (smoke) {
    ctx.save(); ctx.globalAlpha = (1 - m.progress) * 0.2;
    for (let i = 0; i < 3; i++) oval(ctx, x + 5 + m.age * (25 + i * 18), y - m.age * (15 + i * 14), 3 + m.age * 12, 3 + m.age * 9, '#d8d4be', null);
    ctx.restore();
  }
}
function wheel(ctx, x, y, radius, angle, rim = MATERIAL.bronze) {
  oval(ctx, x, y, radius, radius, MATERIAL.woodDark);
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    stroke(ctx, [[0, 0], [Math.cos(a) * (radius - 2), Math.sin(a) * (radius - 2)]], rim, 2);
  }
  ctx.restore(); oval(ctx, x, y, 2, 2, rim);
}
function cavePerson(ctx, c, m, slinger) {
  legs(ctx, m, c.skin, MATERIAL.wood, slinger ? 3 : 0);
  ctx.save(); ctx.translate(m.strike * (slinger ? -2 : 4), -Math.abs(m.gait) * 0.6);
  shape(ctx, [[-8, -43], [2, -46], [9, -37], [8, -22], [2, -19], [-1, -22], [-9, -19], [-11, -24]], MATERIAL.hide);
  shape(ctx, [[-8, -43], [-2, -46], [7, -28], [3, -23]], c.cloth);
  shape(ctx, [[-8, -33], [-4, -28], [-5, -22], [-9, -20]], MATERIAL.hideDark);
  face(ctx, 0, -52, c);
  shape(ctx, [[-6, -53], [-7, -60], [-2, -64], [1, -61], [6, -61], [5, -56]], MATERIAL.hair);
  stroke(ctx, [[-5, -57], [4, -57]], c.cloth, 1.5);
  if (slinger) {
    const pull = m.windup * 9 + (m.remaining > 0 ? (1 - m.kick) * 4 : 3);
    limb(ctx, [[-4, -39], [6, -33], [24, -41]], c.skin, 4);
    limb(ctx, [[4, -39], [11 - pull, -37], [17 - pull, -44]], c.skin, 4);
    limb(ctx, [[25, -34], [25, -44], [20, -53]], MATERIAL.wood, 3);
    limb(ctx, [[25, -44], [31, -53]], MATERIAL.wood, 3);
    stroke(ctx, [[20, -53], [17 - pull, -44], [31, -53]], MATERIAL.bronzeLight, 1.2);
    if (m.remaining === 0 || m.windup) oval(ctx, 17 - pull, -44, 2.7, 2.4, MATERIAL.steelDark);
    oval(ctx, -11, -26, 5, 6, MATERIAL.woodDark);
  } else {
    limb(ctx, [[-6, -39], [-13, -30], [-11, -23]], shade(c.skin), 4.5);
    const armX = 20 + m.strike * 8;
    limb(ctx, [[4, -41], [13, -33], [armX, -38 + m.strike * 6]], c.skin, 5);
    ctx.save(); ctx.translate(armX, -38 + m.strike * 6); ctx.rotate(0.16 + m.strike * 1.25 - m.windup * 0.5);
    shape(ctx, [[-2, 5], [-3, -12], [-5, -24], [-3, -31], [2, -32], [5, -26], [4, -13], [2, 5]], MATERIAL.wood);
    shape(ctx, [[-3, -24], [-2, -30], [1, -31], [2, -15]], MATERIAL.woodLight);
    ctx.restore();
  }
  ctx.restore();
}
function mountLegs(ctx, m, horse) {
  for (const back of [true, false]) for (const side of [-1, 1]) {
    const x = side * 22 + (back ? -5 : 2);
    const gait = Math.sin(m.stride + (side < 0 ? Math.PI : 0) + (back ? 1.8 : 0)) * Number(m.moving);
    limb(ctx, [[x, -24], [x - gait * 5, -13], [x + gait * 9, -3 - Math.max(0, gait) * 4]], back ? MATERIAL.oliveDark : horse ? MATERIAL.wood : MATERIAL.olive, horse ? 5 : 7);
    stroke(ctx, [[x + gait * 9 - 2, -2 - Math.max(0, gait) * 4], [x + gait * 9 + 4, -2 - Math.max(0, gait) * 4]], horse ? MATERIAL.leather : MATERIAL.hide, 2.5);
  }
}
function dinosaur(ctx, c, m) {
  mountLegs(ctx, m, false);
  ctx.save(); ctx.translate(m.strike * 4, -Math.abs(m.gait) * 0.8);
  shape(ctx, [[-18, -38], [-38, -34], [-67, -38 + m.gait * 2], [-47, -25], [-22, -19]], MATERIAL.oliveDark);
  shape(ctx, [[-36, -34], [-22, -47], [7, -46], [24, -34], [23, -21], [7, -14], [-20, -16], [-32, -23]], MATERIAL.olive);
  shape(ctx, [[-32, -26], [-16, -21], [13, -21], [23, -28], [23, -21], [7, -14], [-20, -16]], MATERIAL.oliveDark);
  shape(ctx, [[17, -30], [21, -49], [31, -62], [44, -63], [43, -44], [30, -24]], MATERIAL.olive);
  for (const [x, y] of [[-30, -41], [8, -44], [19, -49]]) shape(ctx, [[x - 4, y + 2], [x, y - 4], [x + 5, y + 1]], MATERIAL.hide);
  shape(ctx, [[31, -61], [45, -62], [61, -55], [65, -47], [42, -45], [31, -49]], MATERIAL.olive);
  const jaw = m.strike * 4;
  shape(ctx, [[38, -45], [64, -46], [59, -40 + jaw], [39, -40 + jaw]], MATERIAL.hide);
  if (m.strike > 0.2) for (const x of [49, 58]) shape(ctx, [[x, -45], [x + 3, -45], [x + 1, -42]], MATERIAL.steelLight);
  stroke(ctx, [[44, -55], [47, -55]], INK, 1.4);
  stroke(ctx, [[37, -48], [24, -36], [-7, -48]], MATERIAL.woodLight, 1.5);
  shape(ctx, [[-22, -45], [3, -47], [14, -29], [-18, -22]], c.cloth);
  shape(ctx, [[-21, -44], [-17, -44], [-10, -24], [-14, -23]], c.trim);
  limb(ctx, [[-6, -58], [7, -44], [0, -29]], c.skin, 5);
  shape(ctx, [[-16, -69], [-4, -71], [2, -52], [-15, -50]], MATERIAL.hide);
  face(ctx, -9, -79, c);
  limb(ctx, [[-6, -65], [7, -61], [20, -67]], c.skin, 4);
  stroke(ctx, [[-12, -66], [57, -76]], MATERIAL.woodLight, 3);
  shape(ctx, [[57, -79], [70, -78], [59, -73]], MATERIAL.steelLight);
  ctx.restore();
}
function medievalHelmet(ctx, x, y, c, closed = false) {
  shape(ctx, [[x - 7, y + 1], [x - 7, y - 6], [x, y - 13], [x + 7, y - 6], [x + 8, y + 1]], c.metal);
  shape(ctx, [[x, y - 13], [x + 7, y - 6], [x + 8, y + 1], [x + 1, y]], MATERIAL.steelLight);
  if (closed) { shape(ctx, [[x - 5, y - 2], [x + 8, y - 2], [x + 5, y + 8], [x - 4, y + 6]], MATERIAL.steel); stroke(ctx, [[x, y], [x + 7, y]], INK, 1.3); }
  else stroke(ctx, [[x + 5, y - 3], [x + 5, y + 5]], c.metal, 2);
}
function swordAndBow(ctx, c, m, bow, unit) {
  legs(ctx, m, bow ? MATERIAL.hide : MATERIAL.steel, MATERIAL.leather);
  ctx.save(); ctx.translate(m.strike * (bow ? -1 : 3), -Math.abs(m.gait));
  shape(ctx, [[-11, -46], [7, -46], [12, -23], [5, -18], [-2, -21], [-12, -19]], bow ? MATERIAL.oliveDark : MATERIAL.steel);
  shape(ctx, [[-5, -44], [7, -44], [9, -23], [-5, -21]], c.cloth);
  face(ctx, 0, -55, c, false);
  if (bow) {
    shape(ctx, [[-8, -48], [-10, -58], [-5, -65], [3, -66], [9, -61], [3, -61], [-3, -56], [-2, -48]], MATERIAL.oliveDark);
    limb(ctx, [[-11, -44], [-18, -32]], MATERIAL.woodDark, 7);
    for (let i = 0; i < 3; i++) stroke(ctx, [[-17 + i * 3, -34], [-21 + i * 3, -56]], MATERIAL.bronzeLight, 1);
    const pull = 4 + m.windup * 10 + (m.remaining > 0 ? (1 - m.kick) * 6 : 0);
    limb(ctx, [[2, -42], [17, -40], [27, -42]], c.skin, 4);
    limb(ctx, [[-5, -42], [4 - pull, -40], [17 - pull, -42]], c.skin, 4);
    ctx.beginPath(); ctx.moveTo(26, -69); ctx.quadraticCurveTo(49, -43, 26, -16); ctx.strokeStyle = MATERIAL.woodLight; ctx.lineWidth = 3; ctx.stroke();
    stroke(ctx, [[26, -69], [17 - pull, -42], [26, -16]], MATERIAL.bronzeLight, 1);
    if (!m.remaining || m.windup) { stroke(ctx, [[14 - pull, -42], [43, -42]], MATERIAL.bronzeLight, 1.4); shape(ctx, [[43, -45], [50, -42], [43, -39]], MATERIAL.steelLight, null); }
  } else {
    medievalHelmet(ctx, 0, -57, c);
    limb(ctx, [[6, -42], [14 + m.strike * 7, -33], [20 + m.strike * 11, -37]], c.metal, 5);
    ctx.save(); ctx.translate(21 + m.strike * 10, -37); ctx.rotate(-0.35 + m.strike * 1.4 - m.windup * 0.5);
    shape(ctx, [[-1.5, 4], [-2, -31], [0, -39], [2, -31], [1.5, 4]], MATERIAL.steelLight); stroke(ctx, [[-6, 0], [6, 0]], MATERIAL.bronze, 2); ctx.restore();
    const shieldColor = unit.guardFlash > 0 ? MATERIAL.steelLight : c.cloth;
    shape(ctx, [[-17, -45], [-1, -46], [3, -34], [-6, -16], [-17, -27]], shade(shieldColor));
    shape(ctx, [[-15, -43], [-2, -44], [1, -34], [-6, -19], [-15, -28]], shieldColor);
    stroke(ctx, [[-8, -42], [-6, -24]], c.trim, 1.5); stroke(ctx, [[-13, -36], [-2, -37]], c.trim, 1.5);
  }
  ctx.restore();
}
function cavalry(ctx, c, m, unit) {
  mountLegs(ctx, m, true);
  ctx.save(); ctx.translate(m.strike * 4, -Math.abs(m.gait) * 0.8);
  shape(ctx, [[-26, -39], [-37, -33], [-42, -16 + m.gait * 2], [-36, -21], [-30, -33]], MATERIAL.hair);
  shape(ctx, [[-32, -35], [-24, -45], [12, -46], [26, -35], [23, -23], [-22, -19], [-31, -25]], MATERIAL.wood);
  shape(ctx, [[17, -32], [20, -50], [26, -64], [35, -57], [43, -45], [36, -36], [29, -25]], MATERIAL.woodLight);
  shape(ctx, [[23, -56], [23, -68], [29, -61], [33, -67], [37, -56]], MATERIAL.woodLight);
  shape(ctx, [[28, -57], [41, -51], [47, -43], [43, -39], [30, -42], [22, -49]], MATERIAL.steel);
  stroke(ctx, [[33, -52], [35, -52]], INK, 1);
  shape(ctx, [[-29, -40], [18, -43], [22, -17], [5, -12], [-10, -18], [-26, -13]], c.cloth);
  shape(ctx, [[-22, -39], [-17, -40], [-13, -19], [-18, -16]], c.trim);
  shape(ctx, [[-16, -66], [-4, -70], [10, -62], [6, -47], [-16, -47]], c.metal);
  limb(ctx, [[-5, -48], [8, -35], [2, -20]], MATERIAL.steelLight, 6);
  medievalHelmet(ctx, -7, -79, c, true);
  feather(ctx, -9, -91, c.cloth, m.gait * 1.5);
  shape(ctx, [[-17, -66], [-23, -46], [-35, -49 + m.gait * 3]], c.cloth);
  limb(ctx, [[4, -64], [16, -58], [28, -60]], c.metal, 5);
  const charge = unit.lastAttackCharged && m.remaining > 0;
  const lanceY = -63 + (m.moving || charge ? 5 : 0);
  stroke(ctx, [[-17, lanceY + 6], [73 + m.strike * 7, lanceY]], MATERIAL.woodLight, 3);
  shape(ctx, [[72 + m.strike * 7, lanceY - 4], [87 + m.strike * 7, lanceY], [72 + m.strike * 7, lanceY + 3]], MATERIAL.steelLight);
  shape(ctx, [[23, lanceY], [43, lanceY + 4 + m.gait * 2], [23, lanceY + 11]], c.cloth, null);
  shape(ctx, [[-18, -65], [-3, -64], [-2, -49], [-11, -40], [-20, -48]], shade(c.cloth));
  shape(ctx, [[-16, -63], [-5, -62], [-4, -50], [-11, -43], [-18, -49]], c.cloth);
  if (charge && !m.reduced) { ctx.save(); ctx.globalAlpha = m.kick * 0.5; stroke(ctx, [[-48, -34], [-29, -34]], '#e8cd8f', 2); ctx.restore(); }
  ctx.restore();
}
function renaissance(ctx, c, m, gun) {
  legs(ctx, m, MATERIAL.hide, MATERIAL.leather);
  ctx.save(); ctx.translate(m.strike * (gun ? -2 : 7), -Math.abs(m.gait));
  shape(ctx, [[-10, -47], [7, -47], [12, -24], [5, -13], [-2, -22], [-13, -13], [-12, -30]], shade(c.cloth));
  shape(ctx, [[-8, -43], [4, -46], [8, -27], [-5, -24]], c.cloth);
  stroke(ctx, [[-7, -44], [7, -25]], MATERIAL.hide, 2);
  shape(ctx, [[-10, -46], [-15, -42], [-14, -36], [-8, -35], [-6, -42]], shade(c.cloth));
  shape(ctx, [[7, -46], [12, -42], [12, -36], [7, -35], [5, -42]], c.cloth);
  face(ctx, 0, -56, c);
  shape(ctx, [[-14, -61], [-8, -64], [-6, -70], [4, -71], [7, -64], [14, -61]], MATERIAL.hair);
  stroke(ctx, [[-7, -64], [7, -64]], c.cloth, 1.5);
  feather(ctx, -6, -67, MATERIAL.hide, m.gait + m.breathe * 0.4);
  if (gun) {
    const r = m.kick * 4;
    limb(ctx, [[-6, -41], [5, -33], [18 - r, -42]], c.skin, 4);
    limb(ctx, [[8, -42], [21, -39], [31 - r, -43]], c.skin, 4);
    shape(ctx, [[-2 - r, -44], [12 - r, -44], [23 - r, -47], [44 - r, -46], [44 - r, -41], [15 - r, -40], [2 - r, -35]], MATERIAL.wood);
    stroke(ctx, [[12 - r, -46], [50 - r, -46]], MATERIAL.steel, 3);
    stroke(ctx, [[13 - r, -45], [11 - r, -50]], MATERIAL.woodLight, 2);
    muzzle(ctx, 50 - r, -46, m, false, true);
  } else {
    limb(ctx, [[-7, -42], [-20, -34], [-23, -43]], c.skin, 4);
    const reach = m.strike * 14;
    limb(ctx, [[7, -42], [17 + reach, -40], [26 + reach, -42]], c.skin, 4);
    oval(ctx, 28 + reach, -42, 4, 6, MATERIAL.bronze);
    stroke(ctx, [[25 + reach, -42], [61 + reach, -43]], MATERIAL.steelLight, 1.7);
    stroke(ctx, [[8, -22], [-12, -9]], MATERIAL.bronze, 2);
  }
  ctx.restore();
}
function fieldCannon(ctx, c, m) {
  ctx.save(); ctx.translate(-30, -3); ctx.scale(0.79, 0.79);
  legs(ctx, m, MATERIAL.hide, MATERIAL.leather);
  shape(ctx, [[-12, -46], [6, -46], [10, -20], [-11, -20]], c.cloth);
  stroke(ctx, [[-8, -42], [8, -24]], MATERIAL.hide, 2); face(ctx, -1, -55, c);
  shape(ctx, [[-15, -62], [-7, -70], [6, -70], [10, -62], [17, -60]], MATERIAL.hair);
  limb(ctx, [[5, -40], [17, -28], [27, -30]], c.skin, 4); ctx.restore();
  shape(ctx, [[-22, -17], [-10, -28], [28, -28], [37, -14], [-30, -8]], MATERIAL.wood);
  stroke(ctx, [[-11, -22], [34, -18]], MATERIAL.woodLight, 4);
  const r = m.kick * 8;
  shape(ctx, [[-11 - r, -39], [39 - r, -44], [50 - r, -40], [50 - r, -30], [-9 - r, -25], [-17 - r, -30]], MATERIAL.bronze);
  stroke(ctx, [[-7 - r, -36], [43 - r, -39]], MATERIAL.bronzeLight, 3);
  stroke(ctx, [[40 - r, -42], [41 - r, -30]], MATERIAL.woodDark, 3);
  oval(ctx, 49 - r, -35, 3, 6, MATERIAL.inset);
  wheel(ctx, -9, -13, 13, m.distance / 13); wheel(ctx, 27, -13, 13, m.distance / 13);
  shape(ctx, [[-1, -24], [12, -24], [12, -17], [-1, -17]], c.cloth);
  muzzle(ctx, 51 - r, -35, m, false, true);
}
function modernInfantry(ctx, c, m, rifle) {
  const crouch = rifle && !m.moving ? 7 : 0;
  legs(ctx, m, MATERIAL.olive, MATERIAL.leather, crouch);
  ctx.save(); ctx.translate(m.strike * (rifle ? -1 : 7), crouch - Math.abs(m.gait));
  shape(ctx, [[-12, -44], [7, -46], [12, -25], [5, -20], [-13, -22]], MATERIAL.olive);
  shape(ctx, [[-16, -43], [-9, -45], [-10, -25], [-18, -27]], MATERIAL.oliveDark);
  stroke(ctx, [[-7, -43], [-6, -26]], MATERIAL.hide, 2);
  shape(ctx, [[-8, -43], [6, -45], [9, -31], [-5, -29]], c.cloth);
  shape(ctx, [[-10, -32], [-2, -32], [-2, -26], [-10, -26]], MATERIAL.oliveDark);
  face(ctx, 0, -54, c, false);
  shape(ctx, [[-8, -54], [-8, -60], [-4, -65], [3, -65], [7, -61], [8, -56], [10, -54]], MATERIAL.oliveDark);
  shape(ctx, [[-4, -64], [3, -64], [7, -60], [7, -57], [1, -58]], MATERIAL.olive);
  stroke(ctx, [[-8, -54], [-3, -46], [6, -50]], MATERIAL.leather, 1);
  const reach = rifle ? -m.kick * 3 : m.strike * 11;
  limb(ctx, [[2, -41], [11, -31], [23 + reach, -38]], c.skin, 4);
  limb(ctx, [[-5, -39], [3, -31], [11 + reach, -36]], MATERIAL.olive, 5);
  shape(ctx, [[-1 + reach, -39], [31 + reach, -41], [31 + reach, -35], [10 + reach, -34], [1 + reach, -30]], rifle ? MATERIAL.inset : MATERIAL.wood);
  stroke(ctx, [[23 + reach, -41], [44 + reach, -41]], MATERIAL.steel, 3);
  if (rifle) {
    shape(ctx, [[17 + reach, -35], [24 + reach, -35], [22 + reach, -24], [17 + reach, -25]], MATERIAL.inset);
    stroke(ctx, [[12 + reach, -43], [18 + reach, -43]], MATERIAL.steelDark, 2);
    muzzle(ctx, 45 + reach, -41, m);
  } else {
    shape(ctx, [[43 + reach, -43], [63 + reach, -42], [44 + reach, -38]], MATERIAL.steelLight);
    stroke(ctx, [[-11, -23], [-11, -15]], MATERIAL.bronze, 4);
  }
  ctx.restore();
}
function tank(ctx, c, m) {
  shape(ctx, [[-44, -20], [40, -20], [49, -13], [47, -4], [38, 1], [-38, 1], [-48, -7]], MATERIAL.inset);
  for (let x = -34; x <= 35; x += 14) oval(ctx, x, -9, 6, 6, MATERIAL.oliveDark);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12 * Math.PI * 2) + m.distance / 47;
    const x = Math.cos(a) * 45, y = -9 + Math.sin(a) * 10;
    stroke(ctx, [[x - 2, y], [x + 2, y]], MATERIAL.oliveDark, 1.5);
  }
  shape(ctx, [[-45, -22], [-30, -36], [26, -36], [44, -23], [42, -18], [-41, -18]], MATERIAL.olive);
  shape(ctx, [[-15, -38], [-10, -51], [19, -51], [29, -38]], MATERIAL.olive);
  shape(ctx, [[-10, -50], [18, -50], [25, -40], [3, -43]], MATERIAL.steelDark);
  stroke(ctx, [[-19, -39], [-24, -67 + m.gait]], MATERIAL.steelDark, 1);
  oval(ctx, 1, -52, 10, 3, MATERIAL.oliveDark);
  const r = m.kick * 8;
  limb(ctx, [[14 - r, -44], [61 - r, -44]], MATERIAL.steelDark, 7);
  shape(ctx, [[56 - r, -49], [66 - r, -49], [66 - r, -40], [57 - r, -40]], MATERIAL.oliveDark);
  shape(ctx, [[-30, -33], [-16, -33], [-11, -20], [-25, -20]], c.cloth);
  stroke(ctx, [[-25, -30], [-22, -23]], c.trim, 2);
  muzzle(ctx, 67 - r, -44, m, false, true);
}
function futureInfantry(ctx, c, m, blaster) {
  legs(ctx, m, MATERIAL.armor, MATERIAL.armorDark);
  ctx.save(); ctx.translate(m.strike * (blaster ? -1 : 6), -Math.abs(m.gait) * 0.6 + m.breathe * 0.2);
  shape(ctx, [[-12, -47], [8, -47], [13, -31], [6, -22], [-7, -22], [-14, -35]], blaster ? MATERIAL.armorDark : MATERIAL.armor);
  shape(ctx, [[-7, -42], [6, -42], [8, -30], [-4, -29]], MATERIAL.inset);
  stroke(ctx, [[-4, -39], [4, -39]], c.energy, 1.5);
  shape(ctx, [[-10, -47], [blaster ? -19 : -15, -44], [-15, -37], [-8, -37], [-6, -43]], c.cloth);
  shape(ctx, [[8, -46], [blaster ? 17 : 14, -42], [13, -36], [7, -37]], c.cloth);
  shape(ctx, [[-7, -63], [-2, -69], [7, -65], [10, -56], [5, -50], [-6, -51]], MATERIAL.armor);
  shape(ctx, [[-7, -63], [-2, -69], [-1, -53], [-6, -51]], MATERIAL.armorDark);
  shape(ctx, [[-1, -62], [9, -61], [8, -57], [0, -57]], MATERIAL.inset);
  stroke(ctx, [[2, -60], [8, -59]], c.energy, 1.2);
  if (blaster) {
    shape(ctx, [[-18, -53], [-13, -55], [-13, -38], [-20, -36]], MATERIAL.armorDark);
    stroke(ctx, [[-17, -53], [-17, -60]], MATERIAL.armorDark, 1.5);
    const r = m.kick * 4;
    limb(ctx, [[7, -41], [18, -33], [23 - r, -42]], MATERIAL.armor, 6);
    shape(ctx, [[8 - r, -47], [33 - r, -49], [43 - r, -43], [39 - r, -36], [9 - r, -36]], MATERIAL.armorDark);
    shape(ctx, [[18 - r, -44], [25 - r, -44], [25 - r, -40], [18 - r, -40]], c.energy);
    stroke(ctx, [[29 - r, -44], [43 - r, -44]], MATERIAL.armor, 2);
    if (!m.reduced && m.windup) { ctx.save(); ctx.globalAlpha = m.windup * 0.35; oval(ctx, 43, -44, 2 + m.windup * 2, 2 + m.windup * 2, c.energy); ctx.restore(); }
    muzzle(ctx, 44 - r, -43, m, true);
  } else {
    limb(ctx, [[-8, -42], [-20, -32], [-18, -23]], MATERIAL.armor, 5);
    limb(ctx, [[7, -41], [18 + m.strike * 6, -31], [24 + m.strike * 6, -37]], MATERIAL.armor, 5);
    ctx.save(); ctx.translate(25 + m.strike * 6, -37); ctx.rotate(-0.4 + m.strike * 1.6 - m.windup * 0.4);
    if (m.remaining && !m.reduced) {
      ctx.save(); ctx.globalAlpha = m.kick * 0.12;
      shape(ctx, [[0, 0], [-22, -28], [-7, -48], [2, -42]], c.energy, null); ctx.restore();
    }
    stroke(ctx, [[0, 6], [0, -2]], MATERIAL.steelDark, 4);
    shape(ctx, [[-1.5, -5], [-1.5, -38], [0, -43], [1.5, -38], [1.5, -5]], c.energy);
    ctx.restore();
  }
  ctx.restore();
}
function hoverMachine(ctx, c, m) {
  ctx.save(); ctx.translate(0, m.reduced ? 0 : Math.sin(m.clock * 2) * 1.1);
  for (const x of [-27, 26]) {
    ctx.save();
    const exhaust = ctx.createLinearGradient(0, -21, 0, -4);
    exhaust.addColorStop(0, c.energy); exhaust.addColorStop(1, `${c.energy}00`);
    ctx.globalAlpha = 0.18;
    shape(ctx, [[x - 6, -21], [x + 6, -21], [x + 9, -4], [x - 9, -4]], exhaust);
    ctx.globalAlpha = 0.6; stroke(ctx, [[x - 5, -21], [x + 5, -21]], c.energy, 2); ctx.restore();
  }
  shape(ctx, [[-48, -34], [-32, -51], [25, -51], [49, -36], [34, -22], [-30, -22]], MATERIAL.armorDark);
  shape(ctx, [[-44, -36], [-24, -43], [24, -42], [45, -35], [25, -29], [-25, -29]], MATERIAL.armor);
  shape(ctx, [[-24, -51], [-14, -68], [14, -68], [25, -52]], MATERIAL.armorDark);
  shape(ctx, [[-14, -62], [12, -62], [17, -52], [-18, -52]], MATERIAL.inset);
  stroke(ctx, [[-12, -57], [11, -57]], c.energy, 1.5);
  for (const y of [-49, -35]) {
    const r = m.kick * 6;
    limb(ctx, [[13 - r, y], [52 - r, y]], MATERIAL.armorDark, 6);
    stroke(ctx, [[52 - r, y - 2], [52 - r, y + 2]], c.energy, 2);
    muzzle(ctx, 56 - r, y, m, true);
  }
  shape(ctx, [[-30, -42], [-16, -44], [-12, -32], [-26, -32]], c.cloth);
  stroke(ctx, [[-23, -39], [-21, -34]], c.trim, 2);
  ctx.restore();
}

export function drawUnit(ctx, unit, time, scale = 1, reducedMotion = false) {
  const stats = UNITS[unit.type];
  const remaining = Math.max(0, unit.attackAnimation ?? 0);
  const duration = stats.attackDuration;
  const progress = remaining > 0 ? Math.max(0, 1 - remaining / duration) : 1;
  const moving = !reducedMotion && unit.moving;
  const distance = unit.distanceTravelled ?? (unit.moving ? time * stats.speed : 0);
  const stride = distance / (stats.footprint ? 13 : 6) + unit.id * 1.7;
  const m = { moving, distance: reducedMotion ? 0 : distance, stride, gait: moving ? Math.sin(stride) : 0,
    clock: reducedMotion ? 0 : time, breathe: reducedMotion ? 0 : Math.sin(time * 2 + unit.id), reduced: reducedMotion,
    remaining, progress, age: progress * duration, kick: reducedMotion ? 0 : (1 - progress) ** 2,
    strike: reducedMotion || !remaining ? 0 : Math.max(0, Math.sin(Math.PI * Math.min(1, progress * 1.3 + 0.15))),
    windup: !reducedMotion && !moving && unit.attackCooldown > 0 && unit.attackCooldown < 0.18 ? 1 - unit.attackCooldown / 0.18 : 0 };
  const player = unit.team === 'player';
  const c = { cloth: player ? '#7faa91' : '#b48d70', trim: player ? '#b7c9a5' : '#d1bb90',
    skin: unit.hitFlash > 0 ? '#ded0ac' : MATERIAL.skin, metal: unit.hitFlash > 0 ? '#ded0ac' : MATERIAL.steel,
    energy: player ? '#b0d5bd' : '#ddbd94' };
  ctx.save(); ctx.translate(unit.x, stats.lane === 'back' ? -7 * scale : 0); ctx.scale(scale, scale);
  ctx.lineJoin = 'bevel'; ctx.lineCap = 'round';
  oval(ctx, 0, 1, stats.footprint ?? 13, stats.footprint ? 3 : 2, '#1d302a38');
  ctx.save(); ctx.scale(player ? 1 : -1, 1);
  switch (unit.type) {
    case 'melee': cavePerson(ctx, c, m, false); break;
    case 'archer': cavePerson(ctx, c, m, true); break;
    case 'heavy': dinosaur(ctx, c, m); break;
    case 'swordsman': swordAndBow(ctx, c, m, false, unit); break;
    case 'crossbow': swordAndBow(ctx, c, m, true, unit); break;
    case 'knight': cavalry(ctx, c, m, unit); break;
    case 'duelist': renaissance(ctx, c, m, false); break;
    case 'musketeer': renaissance(ctx, c, m, true); break;
    case 'cannoneer': fieldCannon(ctx, c, m); break;
    case 'commando': modernInfantry(ctx, c, m, false); break;
    case 'rifleman': modernInfantry(ctx, c, m, true); break;
    case 'tank': tank(ctx, c, m); break;
    case 'blade': futureInfantry(ctx, c, m, false); break;
    case 'blaster': futureInfantry(ctx, c, m, true); break;
    case 'warMachine': hoverMachine(ctx, c, m); break;
  }
  ctx.restore();
  if (unit.hp < stats.health) {
    const width = stats.footprint ? 44 : 28, y = -stats.height - 12;
    ctx.fillStyle = '#142627'; ctx.fillRect(-width / 2, y, width, 4);
    ctx.fillStyle = c.trim; ctx.fillRect(-width / 2, y, width * Math.max(0, unit.hp) / stats.health, 4);
  }
  ctx.restore();
}
