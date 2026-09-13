import { RULES, UNITS, AGES, ABILITIES, getTurretPosition } from './game.js';

const PALETTES = {
  player: { light: '#b7d4b5', main: '#7faa91', dark: '#435e50', flag: '#bbd9b2' },
  enemy: { light: '#e1b58c', main: '#c28b67', dark: '#795744', flag: '#dea579' },
};

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

function drawLandscape(ctx, height, ground) {
  const sky = ctx.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, '#192321');
  sky.addColorStop(0.6, '#35483b');
  sky.addColorStop(1, '#7c8058');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, RULES.width, height);

  ctx.fillStyle = '#d2bf82';
  ctx.beginPath();
  ctx.arc(714, ground * 0.33, 36, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 30; i++) {
    const x = (i * 173 + 51) % 1280;
    const y = (i * 47 + 18) % (ground * 0.35);
    ctx.fillStyle = i % 3 === 0 ? '#a4ac8b80' : '#a4ac8b35';
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  polygon(ctx, [[0, ground], [0, ground - 115], [95, ground - 149], [171, ground - 114],
    [284, ground - 195], [361, ground - 121], [425, ground - 155], [568, ground - 83],
    [672, ground - 170], [789, ground - 131], [869, ground - 209], [947, ground - 125],
    [1052, ground - 163], [1190, ground - 107], [1280, ground - 155], [1280, ground]], '#4a5d48');
  polygon(ctx, [[0, ground], [0, ground - 70], [114, ground - 105], [266, ground - 68],
    [381, ground - 105], [504, ground - 40], [632, ground - 101], [770, ground - 62],
    [902, ground - 110], [1040, ground - 55], [1199, ground - 96], [1280, ground - 79], [1280, ground]], '#344b3e');
  polygon(ctx, [[0, ground], [0, ground - 34], [192, ground - 45], [338, ground - 21],
    [552, ground - 48], [714, ground - 22], [921, ground - 40], [1097, ground - 20],
    [1280, ground - 40], [1280, ground]], '#293e33');

  ctx.fillStyle = '#8c8861';
  ctx.fillRect(0, ground, 1280, 4);
  ctx.fillStyle = '#303c30';
  ctx.fillRect(0, ground + 4, 1280, height - ground);
  ctx.fillStyle = '#202d27';
  ctx.fillRect(0, ground + 22, 1280, height - ground - 22);
  polygon(ctx, [[0, ground + 4], [1280, ground + 4], [1280, ground + 11], [1076, ground + 14],
    [859, ground + 9], [697, ground + 18], [456, ground + 11], [289, ground + 17], [0, ground + 13]], '#586046');
  for (let i = 0; i < 66; i++) {
    const x = (i * 137 + 28) % 1280;
    const y = ground + 32 + (i * 29) % Math.max(1, height - ground - 55);
    ctx.fillStyle = i % 2 ? '#4c564036' : '#73806325';
    ctx.fillRect(x, y, 3 + i % 5, 2);
  }
  for (const x of [226, 317, 481, 802, 952, 1040]) {
    line(ctx, [[x - 3, ground], [x - 5, ground - 9], [x, ground - 3], [x + 4, ground - 14]], '#82906a', 2);
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
  if (age === 2) {
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
  line(ctx, [[-9, -97], [-9, -163]], '#c4bf98', 3);
  const flutter = Math.sin(time * 2.5) * 3;
  polygon(ctx, [[-8, -162], [30, -158 + flutter], [21, -145 + flutter], [-8, -146]], colors.flag);
  ctx.fillStyle = '#f0ddb0';
  ctx.fillRect(-11, -166, 4, 4);
  if (base.hp < base.maxHp * 0.5) {
    line(ctx, [[-29, -92], [-22, -70], [-34, -55], [-25, -38]], '#25362c', 3);
    line(ctx, [[35, -77], [22, -55], [29, -34]], '#25362c', 3);
  }
  if (base.hp === 0) {
    polygon(ctx, [[-58, 0], [-44, -28], [-23, -12], [1, -29], [22, -8], [45, -21], [60, 0]], '#9c9273');
  }
  ctx.restore();
}

function drawDefenses(ctx, game, team, scale) {
  const colors = PALETTES[team];
  const direction = team === 'player' ? 1 : -1;
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
    ctx.scale(direction, 1);
    ctx.fillStyle = '#66543a'; ctx.fillRect(-10, -10, 20, 9);
    if (turret.type === 'stone') {
      line(ctx, [[-11, -2], [-4, -27], [10, -2]], '#b29870', 4);
      line(ctx, [[-4, -18], [15, -23]], '#d4c09a', 4);
      ctx.fillStyle = '#b6baa5'; ctx.beginPath(); ctx.arc(14, -24, 6, 0, Math.PI * 2); ctx.fill();
    } else if (turret.type === 'bone') {
      for (let i = 0; i < 3; i++) {
        line(ctx, [[-10, -9 - i * 5], [20, -14 - i * 5]], '#d9c9a2', 3);
        polygon(ctx, [[20, -17 - i * 5], [27, -15 - i * 5], [20, -12 - i * 5]], '#eee3bb');
      }
    } else if (turret.type === 'firepot') {
      polygon(ctx, [[-14, -24], [12, -24], [17, -10], [10, -3], [-10, -3], [-17, -10]], '#b67747');
      ctx.fillStyle = '#e9b35f'; ctx.fillRect(-10, -27, 19, 5);
      polygon(ctx, [[-7, -26], [-4, -38], [0, -31], [7, -37], [9, -25]], '#f1cf83');
    } else if (turret.type === 'ballista') {
      line(ctx, [[-15, -16], [26, -16]], '#c5b084', 5);
      line(ctx, [[6, -31], [19, -16], [6, -2]], colors.light, 4);
      line(ctx, [[6, -31], [-6, -16], [6, -2]], '#ece0b5', 1);
      line(ctx, [[-10, -17], [32, -17]], '#e1c794', 2);
    } else if (turret.type === 'repeater') {
      ctx.fillStyle = '#768b7f'; ctx.fillRect(-14, -24, 27, 19);
      for (let i = 0; i < 3; i++) line(ctx, [[-2, -22 + i * 6], [26, -22 + i * 6]], '#cbd3bc', 3);
      ctx.fillStyle = '#b59969'; ctx.fillRect(-8, -30, 13, 6);
    } else {
      ctx.fillStyle = '#819486'; ctx.fillRect(-15, -23, 40, 15);
      ctx.fillStyle = '#273c32'; ctx.fillRect(20, -24, 7, 17);
      for (const x of [-10, 12]) { ctx.fillStyle = '#bdc1a9'; ctx.beginPath(); ctx.arc(x, -4, 6, 0, Math.PI * 2); ctx.fill(); }
    }
    if (turret.flash > 0) polygon(ctx, [[25, -23], [40, -17], [25, -10]], '#ffdfa0');
    ctx.restore();
  }
}

function drawUnit(ctx, unit, time, scale, reducedMotion) {
  const colors = PALETTES[unit.team];
  const stats = UNITS[unit.type];
  const heavy = stats.role === 'heavy';
  const archer = stats.role === 'archer';
  const advanced = stats.age === 2;
  const facing = unit.team === 'player' ? 1 : -1;
  const gait = !reducedMotion && unit.moving ? Math.sin(time * 12 + unit.id) : 0;
  const swing = unit.attackAnimation > 0 ? Math.sin(unit.attackAnimation / 0.25 * Math.PI) : 0;
  ctx.save();
  ctx.translate(unit.x, (archer ? -7 : 0) - Math.abs(gait) * 1.2);
  ctx.scale(scale * (heavy ? 1.22 : 1), scale * (heavy ? 1.12 : 1));
  ctx.fillStyle = '#101f1b80';
  ctx.beginPath();
  ctx.ellipse(0, 1, 16, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.scale(facing, 1);
  line(ctx, [[-5, -18], [-6 - gait * 4, -8], [-5 - gait * 5, 0]], '#b0ae8b', 5);
  line(ctx, [[5, -18], [5 + gait * 4, -9], [6 + gait * 5, 0]], '#d2c3a0', 5);
  if (advanced && !archer) polygon(ctx, [[-8, -38], [-23, -9], [-8, -13]], colors.dark);
  ctx.fillStyle = unit.hitFlash > 0 ? '#f5edd5' : advanced ? '#afbbb3' : colors.main;
  ctx.fillRect(-10, -36, 19, 21);
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-10, -19, 20, 5);
  ctx.fillStyle = '#d5bf94';
  ctx.fillRect(-7, -49, 15, 14);
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-9, -51, 20, 7);
  ctx.fillStyle = colors.light;
  ctx.fillRect(-9, -53, 17, 4);
  if (advanced) {
    ctx.fillStyle = '#bac6ba';
    ctx.fillRect(-9, -54, 19, 10);
    polygon(ctx, [[-9, -54], [0, -59], [10, -54]], '#d0d5c1');
    ctx.fillStyle = colors.main;
    ctx.fillRect(-5, -35, 10, 19);
    if (heavy) polygon(ctx, [[-5, -57], [0, -67], [14, -63], [7, -57]], colors.flag);
  }
  if (heavy) {
    ctx.fillStyle = colors.light;
    ctx.fillRect(-14, -38, 28, 7);
    ctx.fillRect(-10, -50, 20, 12);
    ctx.fillStyle = '#293c32';
    ctx.fillRect(1, -46, 9, 3);
  }
  ctx.fillStyle = '#27362c';
  ctx.fillRect(5, -42, 3, 3);
  line(ctx, [[5, -32], [13 + swing * 8, -28 - swing * 8]], '#d5bf94', 5);
  if (archer) {
    if (advanced) {
      line(ctx, [[8, -26], [31, -26]], '#b4936b', 5);
      line(ctx, [[19, -40], [29, -28], [19, -16]], '#c3cbb3', 3);
      line(ctx, [[19, -40], [15 - swing * 4, -27], [19, -16]], '#e5d8ad', 1);
      line(ctx, [[10, -28], [38, -28]], '#e3c892', 2);
    } else {
      line(ctx, [[17, -49], [25, -38], [27, -28], [25, -18], [17, -9]], '#c2a577', 3);
      line(ctx, [[17, -49], [11 - swing * 7, -28], [17, -9]], '#e1d9b2', 1);
      line(ctx, [[8, -28], [32, -28]], '#e8d9ac', 2);
      ctx.fillStyle = colors.dark;
      ctx.fillRect(-13, -40, 6, 26);
      line(ctx, [[-11, -40], [-16, -53]], '#bba77d', 2);
    }
  } else {
    ctx.save();
    ctx.translate(14 + swing * 8, -28 - swing * 8);
    ctx.rotate(-0.5 + swing * 1.7);
    ctx.fillStyle = '#aa8c63';
    ctx.fillRect(-2, -24, 4, 33);
    if (advanced) {
      polygon(ctx, [[-3, -4], [-3, -31], [1, -40], [5, -31], [5, -4]], '#dae0ce');
      ctx.fillStyle = '#c5aa77';
      ctx.fillRect(-7, -5, 17, 3);
    } else polygon(ctx, [[0, -24], [12, -23], [15, -15], [0, -14]], '#c3c6ad');
    ctx.restore();
    ctx.fillStyle = colors.dark;
    ctx.fillRect(-14, -34, heavy ? 19 : 13, heavy ? 30 : 21);
    ctx.strokeStyle = colors.light;
    ctx.lineWidth = 2;
    ctx.strokeRect(-14, -34, heavy ? 19 : 13, heavy ? 30 : 21);
    if (advanced) {
      const width = heavy ? 18 : 12;
      polygon(ctx, [[-15, -35], [-15 + width, -35], [-15 + width, -17], [-15 + width / 2, -9], [-15, -17]], colors.light);
      line(ctx, [[-15 + width / 2, -32], [-15 + width / 2, -15]], colors.dark, 2);
      line(ctx, [[-12, -26], [-18 + width, -26]], colors.dark, 2);
    }
  }
  ctx.restore();
  if (unit.hp < stats.health) {
    ctx.fillStyle = '#182920';
    ctx.fillRect(-14, -65, 28, 4);
    ctx.fillStyle = colors.light;
    ctx.fillRect(-14, -65, 28 * unit.hp / stats.health, 4);
  }
  ctx.restore();
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

function drawProjectile(ctx, shot, scale) {
  const progress = Math.max(0, Math.min(1, 1 - shot.remaining / shot.duration));
  const x = shot.fromX + (shot.toX - shot.fromX) * progress;
  const cannon = ['cannon', 'stone', 'firepot'].includes(shot.kind);
  const fromY = shot.fromY * scale;
  const y = fromY * (1 - progress) - 30 * scale * progress - Math.sin(progress * Math.PI) * (cannon ? 45 : 18);
  if (cannon) {
    ctx.fillStyle = shot.kind === 'firepot' ? '#eea353' : shot.kind === 'stone' ? '#b9bea7' : '#e8c783';
    ctx.beginPath(); ctx.arc(x, y, 5 * scale, 0, Math.PI * 2); ctx.fill();
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
    drawLandscape(ctx, sceneHeight, ground);
    ctx.save();
    ctx.translate(0, ground);
    const time = reducedMotion.matches ? 0 : game.elapsed;
    drawBase(ctx, game.bases.player, game.ages.player, time, entityScale);
    drawBase(ctx, game.bases.enemy, game.ages.enemy, time, entityScale);
    drawDefenses(ctx, game, 'player', entityScale);
    drawDefenses(ctx, game, 'enemy', entityScale);
    // Draw the ranged rank behind the frontline, including when allies pass each other.
    for (const lane of ['back', 'front']) {
      for (const unit of game.units) if (UNITS[unit.type].lane === lane) drawUnit(ctx, unit, game.elapsed, entityScale, reducedMotion.matches);
    }
    for (const shot of game.projectiles) drawProjectile(ctx, shot, entityScale);
    if (targeting) drawTarget(ctx, targetX, ABILITIES[AGES[game.ages.player].ability].radius);
    if (game.ability) {
      const stats = ABILITIES[game.ability.type];
      drawTarget(ctx, game.ability.x, stats.radius, 0.8);
      const interval = game.ability.wavesLeft === stats.waves ? stats.delay : stats.waveInterval;
      const progress = Math.max(0, Math.min(1, 1 - game.ability.remaining / interval));
      const x = game.ability.x - 140 * (1 - progress);
      const y = -ground * (1 - progress);
      if (!reducedMotion.matches && game.ability.type === 'meteor') {
        polygon(ctx, [[x - 45, y - 85], [x + 15, y], [x - 14, y + 9]], '#e59b5899');
        ctx.fillStyle = '#ffe0a0';
        ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      } else if (!reducedMotion.matches) {
        for (let i = 0; i < 13; i++) {
          const arrowX = game.ability.x - stats.radius + i * stats.radius / 6;
          line(ctx, [[arrowX - 14, y - 26], [arrowX, y]], '#e0d9a8', 2);
          polygon(ctx, [[arrowX, y + 6], [arrowX - 5, y - 2], [arrowX + 2, y - 4]], '#f0d393');
        }
      }
    }
    if (!reducedMotion.matches) {
      for (const effect of game.effects) {
        ctx.globalAlpha = effect.life / effect.duration;
        if (effect.kind === 'evolve') {
          const radius = 70 + (1 - effect.life / effect.duration) * 60;
          ctx.strokeStyle = PALETTES[effect.team].flag;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(effect.x, -10, radius, radius * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
          continue;
        }
        if (['meteor', 'blast', 'volley'].includes(effect.kind)) {
          const radius = effect.radius * (1 - effect.life / effect.duration);
          ctx.strokeStyle = '#edb46d'; ctx.lineWidth = 5;
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
