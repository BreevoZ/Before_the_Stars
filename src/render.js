import { drawTurret } from './turrets.js';
import { RULES, UNITS, AGES, ABILITIES, getTurretPosition, getAbilityRadius, getAbilityImpactX } from './game.js';
import { drawUnit } from './units.js';

const PALETTES = {
  player: { light: '#b7d4b5', main: '#7faa91', dark: '#435e50', flag: '#bbd9b2' },
  enemy: { light: '#e1b58c', main: '#c28b67', dark: '#795744', flag: '#dea579' },
};

// One full day follows match time, so pausing and restarting also affect the sky.
const DAY_NIGHT_CYCLE_SECONDS = 120;
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

function drawLandscape(ctx, height, ground, time) {
  const phase = (time % DAY_NIGHT_CYCLE_SECONDS) / DAY_NIGHT_CYCLE_SECONDS;
  const light = landscapeLight(phase);
  const sky = ctx.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, light.skyTop);
  sky.addColorStop(0.6, light.skyMiddle);
  sky.addColorStop(1, light.horizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, RULES.width, height);

  ctx.save();
  for (let i = 0; i < 54; i++) {
    const x = (i * 173 + 51) % 1280;
    const y = (i * 47 + 18) % (ground * 0.62);
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

function drawBase(ctx, base, age, time, scale) {
  const colors = PALETTES[base.team];
  ctx.save();
  ctx.translate(base.x, 0);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#14231e88';
  ctx.beginPath();
  ctx.ellipse(0, 1, 69, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  if (age === 3) {
    polygon(ctx, [[-64, 0], [-59, -84], [-36, -116], [35, -116], [61, -84], [65, 0]], colors.dark);
    ctx.fillStyle = base.hitFlash > 0 ? '#f2e6c4' : '#ae9e7a';
    ctx.fillRect(-43, -104, 86, 104);
    for (let y = -88; y < 0; y += 18) line(ctx, [[-43, y], [43, y]], '#82765d', 2);
    polygon(ctx, [[-51, -105], [-31, -130], [29, -130], [52, -105]], '#98714c');
    ctx.fillStyle = colors.main;
    ctx.fillRect(-60, -116, 23, 116); ctx.fillRect(38, -116, 23, 116);
    for (const x of [-50, 48]) {
      ctx.fillStyle = '#e0c89b'; ctx.fillRect(x - 8, -91, 16, 29);
      ctx.fillStyle = '#2c372d'; ctx.fillRect(x - 5, -86, 10, 22);
    }
    ctx.fillStyle = '#344033'; ctx.fillRect(-15, -45, 30, 45);
    ctx.beginPath(); ctx.arc(0, -45, 15, Math.PI, Math.PI * 2); ctx.fill();
    line(ctx, [[-20, -3], [-20, -45], [-14, -60], [14, -60], [20, -45], [20, -3]], '#dfcfa7', 4);
  } else if (age === 4) {
    polygon(ctx, [[-65, 0], [-62, -83], [-45, -106], [44, -106], [64, -82], [68, 0]], base.hitFlash > 0 ? '#e5e0cd' : '#7c8980');
    ctx.fillStyle = '#435b50'; ctx.fillRect(-56, -84, 111, 24);
    for (const x of [-46, 20]) { ctx.fillStyle = '#182b28'; ctx.fillRect(x, -77, 26, 9); }
    ctx.fillStyle = '#263d34'; ctx.fillRect(-28, -46, 56, 46);
    for (let y = -41; y < 0; y += 9) line(ctx, [[-27, y], [27, y]], '#778a78', 2);
    for (const x of [-37, 34]) {
      ctx.fillStyle = '#d5be75'; ctx.fillRect(x, -45, 5, 45);
      for (let y = -42; y < 0; y += 12) line(ctx, [[x, y], [x + 5, y + 5]], '#435447', 3);
    }
    line(ctx, [[0, -107], [0, -137]], '#abb7a6', 4);
    ctx.save(); ctx.translate(0, -141); ctx.rotate(-0.45 + Math.sin(time) * 0.15);
    ctx.fillStyle = '#a7b6a8'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI); ctx.fill();
    line(ctx, [[0, 3], [0, -15]], '#d8d7b4', 2); ctx.restore();
    ctx.fillStyle = colors.flag; ctx.fillRect(-54, -52, 15, 5);
  } else if (age === 5) {
    const glow = base.team === 'player' ? '#89eee2' : '#ffc188';
    polygon(ctx, [[-66, 0], [-55, -111], [-32, -130], [32, -130], [55, -111], [66, 0]], base.hitFlash > 0 ? '#e3f4e8' : '#435c64');
    polygon(ctx, [[-55, -111], [-34, -127], [-27, -14], [-57, -3]], '#99b4b1');
    polygon(ctx, [[34, -127], [55, -111], [57, -3], [27, -14]], '#78938e');
    polygon(ctx, [[-20, -103], [0, -118], [20, -103], [20, -59], [0, -44], [-20, -59]], '#213a42');
    ctx.fillStyle = glow; ctx.globalAlpha = 0.65 + Math.sin(time * 2) * 0.2;
    ctx.beginPath(); ctx.ellipse(0, -81, 11, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    for (const x of [-44, 42]) line(ctx, [[x, -103], [x * 1.15, -15]], glow, 3);
    polygon(ctx, [[-19, 0], [-19, -29], [0, -40], [19, -29], [19, 0]], '#142e33');
    line(ctx, [[-19, 0], [-19, -29], [0, -40], [19, -29], [19, 0]], glow, 2);
    ctx.fillStyle = colors.main; ctx.fillRect(-37, -136, 74, 8);
  } else if (age === 2) {
    // A crenellated keep replaces the low tribal fort; team banners remain distinct.
    const stone = base.team === 'player' ? '#9eafa3' : '#b5a38c';
    const shadow = base.team === 'player' ? '#536b60' : '#736653';
    ctx.fillStyle = base.hitFlash > 0 ? '#f2e6c4' : shadow;
    ctx.fillRect(-58, -98, 118, 98);
    ctx.fillStyle = base.hitFlash > 0 ? '#f2e6c4' : stone;
    ctx.fillRect(-59, -121, 33, 121);
    ctx.fillRect(27, -121, 33, 121);
    for (const x of [-61, -47, -33, 25, 39, 53]) ctx.fillRect(x, -134, 10, 15);
    ctx.fillStyle = colors.main;
    ctx.fillRect(-26, -97, 53, 97);
    for (let y = -106; y < 0; y += 22) {
      line(ctx, [[-59, y], [-26, y]], shadow, 2);
      line(ctx, [[27, y], [60, y]], shadow, 2);
      line(ctx, [[-43 + (y % 3) * 3, y], [-43 + (y % 3) * 3, y + 21]], shadow, 1);
    }
    ctx.fillStyle = '#25362c';
    ctx.fillRect(-46, -94, 8, 20);
    ctx.fillRect(39, -94, 8, 20);
    ctx.fillRect(-13, -41, 28, 41);
    polygon(ctx, [[-13, -41], [1, -55], [15, -41]], '#25362c');
    ctx.fillStyle = '#98a88c';
    for (const x of [-8, 0, 8]) ctx.fillRect(x, -40, 2, 40);
    polygon(ctx, [[-12, -93], [13, -93], [13, -66], [1, -57], [-12, -66]], colors.flag);
    polygon(ctx, [[0, -86], [6, -78], [0, -70], [-6, -78]], '#e5cd8d');
  } else {
    // A low stone fort, its team banner visible above the troops.
    polygon(ctx, [[-58, 0], [-52, -75], [-35, -97], [32, -101], [55, -77], [60, 0]], base.hitFlash > 0 ? '#efdfba' : colors.dark);
    polygon(ctx, [[-52, -75], [-35, -97], [32, -101], [45, -83], [5, -72]], colors.light);
    polygon(ctx, [[-52, -75], [5, -72], [9, 0], [-58, 0]], colors.main);
    polygon(ctx, [[5, -72], [45, -83], [55, -77], [60, 0], [9, 0]], colors.dark);
    ctx.fillStyle = '#25362c';
    ctx.fillRect(-12, -43, 28, 43);
    polygon(ctx, [[-12, -43], [1, -53], [16, -43]], '#25362c');
    line(ctx, [[-49, -49], [-15, -48]], '#24372e66');
    line(ctx, [[-52, -25], [-19, -23]], '#24372e66');
    line(ctx, [[-30, -70], [-29, -49]], '#24372e66');
    line(ctx, [[29, -49], [50, -53]], '#182b2466');
    line(ctx, [[29, -25], [54, -29]], '#182b2466');
  }
  if (age <= 3) {
  line(ctx, [[-9, -97], [-9, -163]], '#c4bf98', 3);
  const flutter = Math.sin(time * 2.5) * 3;
  polygon(ctx, [[-8, -162], [30, -158 + flutter], [21, -145 + flutter], [-8, -146]], colors.flag);
  ctx.fillStyle = '#f0ddb0';
  ctx.fillRect(-11, -166, 4, 4);
  }
  if (base.hp < base.maxHp * 0.5) {
    line(ctx, [[-29, -92], [-22, -70], [-34, -55], [-25, -38]], '#25362c', 3);
    line(ctx, [[35, -77], [22, -55], [29, -34]], '#25362c', 3);
  }
  if (base.hp === 0) {
    polygon(ctx, [[-58, 0], [-44, -28], [-23, -12], [1, -29], [22, -8], [45, -21], [60, 0]], '#9c9273');
  }
  ctx.restore();
}

function drawDefenses(ctx, game, team, scale, reducedMotion) {
  const colors = PALETTES[team];
  // Put the expanded platform supports behind every weapon, including the lower row.
  for (let slot = 2; slot < game.turrets[team].length; slot++) {
    const { x, y } = getTurretPosition(game, team, slot);
    for (const offset of [-19, 19]) line(ctx, [[x + offset * scale, y * scale], [x + offset * scale, (y + 51) * scale]], colors.dark, 4 * scale);
    line(ctx, [[x - 19 * scale, y * scale], [x + 19 * scale, (y + 48) * scale]], colors.main, 2 * scale);
  }
  for (let slot = 0; slot < game.turrets[team].length; slot++) {
    const turret = game.turrets[team][slot];
    const { x, y } = getTurretPosition(game, team, slot);
    ctx.save(); ctx.translate(x, y * scale); ctx.scale(scale, scale);
    ctx.fillStyle = colors.dark; ctx.fillRect(-21, -1, 42, 6);
    ctx.fillStyle = colors.light; ctx.fillRect(-21, -3, 42, 3);
    if (!turret) {
      line(ctx, [[-5, -11], [5, -11]], colors.light, 1.5);
      line(ctx, [[0, -16], [0, -6]], colors.light, 1.5);
      ctx.restore();
      continue;
    }
    drawTurret(ctx, turret, game.elapsed, 1, reducedMotion);
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

function drawFields(ctx, game, time, scale, reducedMotion) {
  for (const field of game.fields ?? []) {
    ctx.save(); ctx.translate(field.x, 0);
    ctx.globalAlpha = Math.min(0.7, field.remaining / 0.5);
    ctx.fillStyle = field.kind === 'oil' ? '#766345' : '#997144';
    ctx.beginPath(); ctx.ellipse(0, -2, field.radius, 3 * scale, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 7; i++) {
      const x = (i / 6 - 0.5) * field.radius * 1.7;
      const lift = reducedMotion ? 7 : 6 + Math.sin(time * 6 + i * 2) * 3;
      polygon(ctx, [[x - 3, -3], [x + 1, -lift * scale], [x + 3, -3]], field.kind === 'oil' ? '#b49a65' : '#d2b379');
    }
    ctx.restore();
  }
}

function drawProjectile(ctx, shot, scale) {
  const progress = Math.max(0, Math.min(1, 1 - shot.remaining / shot.duration));
  const origin = shot.fromUnitX ?? shot.fromTurretX;
  const fromX = origin === undefined ? shot.fromX : origin + (shot.fromX - origin) * scale;
  const x = fromX + (shot.toX - fromX) * progress;
  const cannon = ['sling', 'cannon', 'stone', 'boulder', 'fireball', 'egg', 'oil', 'shell', 'plasma-orb'].includes(shot.kind);
  const fromY = shot.fromY * scale;
  const y = fromY * (1 - progress) + (shot.toY ?? -30) * scale * progress - Math.sin(progress * Math.PI) * (shot.arc ?? (shot.kind === 'sling' ? 65 : cannon ? 45 : shot.kind === 'bullet' ? 0 : 18));
  if (['laser', 'ion'].includes(shot.kind)) {
    ctx.save(); ctx.globalAlpha = 0.4 + (1 - progress) * 0.5;
    line(ctx, [[fromX, fromY], [shot.toX, (shot.toY ?? -30) * scale]], shot.team === 'player' ? '#b0d5bd' : '#ddbd94', shot.kind === 'ion' ? 4 : 1.5);
    ctx.restore();
  } else if (shot.kind === 'rail') {
    const facing = shot.toX > fromX ? 1 : -1;
    line(ctx, [[x - 19 * facing, y], [x + 4 * facing, y]], '#becbb4', 2);
  } else if (['plasma', 'plasma-orb'].includes(shot.kind)) {
    const color = shot.team === 'player' ? '#a2fff0' : '#ffd0a1';
    const facing = shot.toX > shot.fromX ? 1 : -1;
    line(ctx, [[x - (shot.kind === 'laser' ? 34 : 15) * facing, y], [x, y]], color, shot.kind === 'plasma-orb' ? 9 : 3);
    ctx.fillStyle = '#effff1'; ctx.beginPath(); ctx.arc(x, y, shot.kind === 'plasma-orb' ? 6 : 3, 0, Math.PI * 2); ctx.fill();
  } else if (shot.kind === 'rocket') {
    const facing = shot.toX > shot.fromX ? 1 : -1;
    polygon(ctx, [[x - 19 * facing, y - 4], [x - 34 * facing, y], [x - 19 * facing, y + 4]], '#e6a465');
    line(ctx, [[x - 17 * facing, y], [x, y]], '#cdd6bd', 6);
    polygon(ctx, [[x, y - 5], [x + 7 * facing, y], [x, y + 5]], '#e7b274');
  } else if (shot.kind === 'bullet') {
    const facing = shot.toX > shot.fromX ? 1 : -1;
    line(ctx, [[x - 9 * facing, y], [x + 3 * facing, y]], '#f1d9a1', 2);
  } else if (cannon) {
    ctx.fillStyle = ['fireball', 'oil'].includes(shot.kind) ? '#d1aa68' : ['sling', 'stone', 'boulder'].includes(shot.kind) ? '#aeb59f' : shot.kind === 'egg' ? '#d0c5a7' : '#b29f78';
    ctx.beginPath(); ctx.ellipse(x, y, (['sling', 'egg', 'oil'].includes(shot.kind) ? 3 : 5) * scale, (shot.kind === 'egg' ? 4 : shot.kind === 'oil' ? 6 : 5) * scale, 0, 0, Math.PI * 2); ctx.fill();
    if (shot.kind === 'fireball') polygon(ctx, [[x - 4, y], [x - 10, y - 13], [x + 3, y - 4]], '#dabb79');
  } else {
    const facing = shot.toX > shot.fromX ? 1 : -1;
    line(ctx, [[x - (shot.kind === 'bolt' ? 9 : 13) * facing, y], [x + 4 * facing, y]], shot.kind === 'bolt' ? '#e5cb91' : PALETTES[shot.team].light, shot.kind === 'bolt' ? 3 : 2);
    polygon(ctx, [[x + 6 * facing, y], [x, y - 3], [x, y + 3]], '#e2d8b3');
  }
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
    const ground = sceneHeight * 0.738;
    const time = reducedMotion.matches ? 0 : game.elapsed;
    drawLandscape(ctx, sceneHeight, ground, time);
    ctx.save();
    ctx.translate(0, ground);
    drawBase(ctx, game.bases.player, game.ages.player, time, entityScale);
    drawBase(ctx, game.bases.enemy, game.ages.enemy, time, entityScale);
    drawDefenses(ctx, game, 'player', entityScale, reducedMotion.matches);
    drawDefenses(ctx, game, 'enemy', entityScale, reducedMotion.matches);
    drawFields(ctx, game, time, entityScale, reducedMotion.matches);
    // Draw the ranged rank behind the frontline, including when allies pass each other.
    for (const lane of ['back', 'front']) {
      for (const unit of game.units) if (UNITS[unit.type].lane === lane) drawUnit(ctx, unit, game.elapsed, entityScale, reducedMotion.matches);
    }
    for (const shot of game.projectiles) drawProjectile(ctx, shot, entityScale);
    if (targeting) drawTarget(ctx, targetX, getAbilityRadius(AGES[game.ages.player].ability));
    if (game.ability) {
      const ability = game.ability;
      const stats = ABILITIES[ability.type];
      if (stats.targeting === 'allies') {
        for (const unit of game.units.filter(unit => unit.team === 'player')) {
          ctx.strokeStyle = '#a8e4a0'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(unit.x, -4, 22 * entityScale, 7, 0, 0, Math.PI * 2); ctx.stroke();
          const lift = reducedMotion.matches ? 0 : (game.elapsed * 15 + unit.id * 7) % 20;
          line(ctx, [[unit.x - 5, -75 - lift], [unit.x + 5, -75 - lift]], '#b5efac', 3);
          line(ctx, [[unit.x, -80 - lift], [unit.x, -70 - lift]], '#b5efac', 3);
        }
      } else {
        drawTarget(ctx, ability.x, getAbilityRadius(ability.type), 0.5);
        const impactX = getAbilityImpactX(ability);
        if (stats.sweep) drawTarget(ctx, impactX, stats.radius, 0.8);
        const interval = ability.wavesLeft === stats.waves ? stats.delay : stats.waveInterval;
        const progress = Math.max(0, Math.min(1, 1 - ability.remaining / interval));
        const y = -ground * (1 - progress);
        if (!reducedMotion.matches && ability.type === 'meteor') {
          const x = impactX - 140 * (1 - progress);
          polygon(ctx, [[x - 45, y - 85], [x + 15, y], [x - 14, y + 9]], '#e59b5899');
          ctx.fillStyle = '#ffe0a0'; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
        } else if (!reducedMotion.matches && ability.type === 'volley') {
          for (let i = 0; i < 13; i++) {
            const arrowX = impactX - stats.radius + i * stats.radius / 6;
            line(ctx, [[arrowX - 14, y - 26], [arrowX, y]], '#e0d9a8', 2);
            polygon(ctx, [[arrowX, y + 6], [arrowX - 5, y - 2], [arrowX + 2, y - 4]], '#f0d393');
          }
        } else if (!reducedMotion.matches && ability.type === 'airstrike') {
          const flight = 1 - (ability.remaining + (ability.wavesLeft - 1) * stats.waveInterval) / (stats.delay + (stats.waves - 1) * stats.waveInterval);
          const planeX = ability.x - 350 + flight * 700;
          ctx.save(); ctx.translate(planeX, -ground * 0.78);
          polygon(ctx, [[-37, 0], [-12, -7], [-19, -30], [-7, -30], [10, -6], [34, -3], [42, 1], [10, 5], [-8, 25], [-20, 25], [-12, 5], [-35, 7]], '#b5c1ac');
          line(ctx, [[-48, 1], [-38, 1]], '#d5b68b', 3); ctx.restore();
          ctx.fillStyle = '#e6c58d'; ctx.beginPath(); ctx.ellipse(impactX, y, 6, 13, -0.2, 0, Math.PI * 2); ctx.fill();
          polygon(ctx, [[impactX - 7, y - 13], [impactX, y - 7], [impactX + 7, y - 13]], '#bc985e');
        } else if (ability.type === 'orbital') {
          const radius = stats.radius * (1 - progress * 0.8);
          ctx.strokeStyle = '#99efdf'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(impactX, -20, radius, radius * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
          line(ctx, [[impactX, -ground], [impactX, -20]], '#96ffe155', 2 + progress * 8);
          if (!reducedMotion.matches) {
            line(ctx, [[impactX - 26, -ground + 22], [impactX + 26, -ground + 22]], '#bdeee0', 5);
            polygon(ctx, [[impactX - 9, -ground + 12], [impactX + 9, -ground + 12], [impactX + 6, -ground + 33], [impactX - 6, -ground + 33]], '#87b9b7');
          }
        }
      }
    }
    if (!reducedMotion.matches) {
      for (const effect of game.effects) {
        ctx.globalAlpha = effect.life / effect.duration;
        if (effect.kind === 'pierce') {
          line(ctx, [[effect.x, effect.y * entityScale], [effect.toX, effect.y * entityScale]], PALETTES[effect.team].light, 2);
          continue;
        }
        if (effect.kind === 'evolve') {
          const radius = 70 + (1 - effect.life / effect.duration) * 60;
          ctx.strokeStyle = PALETTES[effect.team].flag;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(effect.x, -10, radius, radius * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
          continue;
        }
        if (['meteor', 'blast', 'volley', 'airstrike', 'orbital'].includes(effect.kind)) {
          const radius = effect.radius * (1 - effect.life / effect.duration);
          ctx.strokeStyle = effect.kind === 'orbital' ? '#a5ffee' : '#edb46d'; ctx.lineWidth = 5;
          if (effect.kind === 'orbital') {
            ctx.fillStyle = '#acffdf77'; ctx.fillRect(effect.x - 26, -ground, 52, ground);
            ctx.fillStyle = '#effff0'; ctx.fillRect(effect.x - 5, -ground, 10, ground);
          }
          ctx.beginPath(); ctx.ellipse(effect.x, -12, radius, radius * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
          continue;
        }
        const radius = 4 + (1 - effect.life / 0.22) * 12;
        for (let i = 0; i < 5; i++) {
          const angle = i * Math.PI * 2 / 5;
          line(ctx, [[effect.x + Math.cos(angle) * radius, -30 + Math.sin(angle) * radius],
            [effect.x + Math.cos(angle) * (radius + 4), -30 + Math.sin(angle) * (radius + 4)]], '#f0dbab');
        }
      }
    }
    ctx.restore();
  };
}
