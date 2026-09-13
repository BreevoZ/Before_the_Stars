import { RULES, UNITS } from './game.js';

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

function drawBase(ctx, base, turret, time, scale) {
  const colors = PALETTES[base.team];
  ctx.save();
  ctx.translate(base.x, 0);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#14231e88';
  ctx.beginPath();
  ctx.ellipse(0, 1, 69, 8, 0, 0, Math.PI * 2);
  ctx.fill();
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
  line(ctx, [[-9, -97], [-9, -163]], '#c4bf98', 3);
  const flutter = Math.sin(time * 2.5) * 3;
  polygon(ctx, [[-8, -162], [30, -158 + flutter], [21, -145 + flutter], [-8, -146]], colors.flag);
  ctx.fillStyle = '#f0ddb0';
  ctx.fillRect(-11, -166, 4, 4);
  if (turret) {
    const direction = base.team === 'player' ? 1 : -1;
    ctx.save();
    ctx.translate(18, -103);
    ctx.scale(direction, 1);
    ctx.fillStyle = '#303e33';
    ctx.fillRect(-16, -9, 34, 16);
    ctx.fillStyle = '#aebaa2';
    ctx.fillRect(-12, -20, 35, 13);
    ctx.fillStyle = '#697967';
    ctx.fillRect(12, -20, 25, 10);
    ctx.fillStyle = '#23362c';
    ctx.fillRect(34, -20, 4, 10);
    if (turret.flash > 0) polygon(ctx, [[39, -23], [58, -16], [39, -7]], '#ffe1a0');
    ctx.restore();
  }
  if (base.hp < RULES.baseHealth * 0.5) {
    line(ctx, [[-29, -92], [-22, -70], [-34, -55], [-25, -38]], '#25362c', 3);
    line(ctx, [[35, -77], [22, -55], [29, -34]], '#25362c', 3);
  }
  if (base.hp === 0) {
    polygon(ctx, [[-58, 0], [-44, -28], [-23, -12], [1, -29], [22, -8], [45, -21], [60, 0]], '#9c9273');
  }
  ctx.restore();
}

function drawUnit(ctx, unit, time, scale, reducedMotion) {
  const colors = PALETTES[unit.team];
  const stats = UNITS[unit.type];
  const heavy = unit.type === 'heavy';
  const archer = unit.type === 'archer';
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
  ctx.fillStyle = unit.hitFlash > 0 ? '#f5edd5' : colors.main;
  ctx.fillRect(-10, -36, 19, 21);
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-10, -19, 20, 5);
  ctx.fillStyle = '#d5bf94';
  ctx.fillRect(-7, -49, 15, 14);
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-9, -51, 20, 7);
  ctx.fillStyle = colors.light;
  ctx.fillRect(-9, -53, 17, 4);
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
    line(ctx, [[17, -49], [25, -38], [27, -28], [25, -18], [17, -9]], '#c2a577', 3);
    line(ctx, [[17, -49], [11 - swing * 7, -28], [17, -9]], '#e1d9b2', 1);
    line(ctx, [[8, -28], [32, -28]], '#e8d9ac', 2);
    ctx.fillStyle = colors.dark;
    ctx.fillRect(-13, -40, 6, 26);
    line(ctx, [[-11, -40], [-16, -53]], '#bba77d', 2);
  } else {
    ctx.save();
    ctx.translate(14 + swing * 8, -28 - swing * 8);
    ctx.rotate(-0.5 + swing * 1.7);
    ctx.fillStyle = '#aa8c63';
    ctx.fillRect(-2, -24, 4, 33);
    polygon(ctx, [[0, -24], [12, -23], [15, -15], [0, -14]], '#c3c6ad');
    ctx.restore();
    ctx.fillStyle = colors.dark;
    ctx.fillRect(-14, -34, heavy ? 19 : 13, heavy ? 30 : 21);
    ctx.strokeStyle = colors.light;
    ctx.lineWidth = 2;
    ctx.strokeRect(-14, -34, heavy ? 19 : 13, heavy ? 30 : 21);
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

function drawTarget(ctx, x, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#dfa16122';
  ctx.fillRect(x - RULES.meteorRadius, -85, RULES.meteorRadius * 2, 88);
  ctx.strokeStyle = '#edb46d';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(x - RULES.meteorRadius, -85, RULES.meteorRadius * 2, 88);
  ctx.setLineDash([]);
  line(ctx, [[x - 12, -32], [x + 12, -32]], '#f2d3a1');
  line(ctx, [[x, -44], [x, -20]], '#f2d3a1');
  ctx.restore();
}

function drawProjectile(ctx, shot, scale) {
  const progress = Math.max(0, Math.min(1, 1 - shot.remaining / shot.duration));
  const x = shot.fromX + (shot.toX - shot.fromX) * progress;
  const cannon = shot.kind === 'cannon';
  const fromY = (cannon ? -118 : -36) * scale;
  const y = fromY * (1 - progress) - 30 * scale * progress - Math.sin(progress * Math.PI) * (cannon ? 45 : 18);
  if (cannon) {
    ctx.fillStyle = '#e8c783';
    ctx.beginPath(); ctx.arc(x, y, 5 * scale, 0, Math.PI * 2); ctx.fill();
  } else {
    const facing = shot.toX > shot.fromX ? 1 : -1;
    line(ctx, [[x - 13 * facing, y], [x + 4 * facing, y]], PALETTES[shot.team].light, 2);
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
    drawBase(ctx, game.bases.player, game.turrets.player, time, entityScale);
    drawBase(ctx, game.bases.enemy, game.turrets.enemy, time, entityScale);
    // Draw the ranged rank behind the frontline, including when allies pass each other.
    for (const lane of ['back', 'front']) {
      for (const unit of game.units) if (UNITS[unit.type].lane === lane) drawUnit(ctx, unit, game.elapsed, entityScale, reducedMotion.matches);
    }
    for (const shot of game.projectiles) drawProjectile(ctx, shot, entityScale);
    if (targeting) drawTarget(ctx, targetX);
    if (game.meteor) {
      drawTarget(ctx, game.meteor.x, 0.8);
      const progress = 1 - game.meteor.remaining / RULES.meteorDelay;
      const x = game.meteor.x - 140 * (1 - progress);
      const y = -ground * (1 - progress);
      if (!reducedMotion.matches) {
        polygon(ctx, [[x - 45, y - 85], [x + 15, y], [x - 14, y + 9]], '#e59b5899');
        ctx.fillStyle = '#ffe0a0';
        ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (!reducedMotion.matches) {
      for (const effect of game.effects) {
        ctx.globalAlpha = effect.life / effect.duration;
        if (effect.kind === 'meteor') {
          const radius = RULES.meteorRadius * (1 - effect.life / effect.duration);
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
