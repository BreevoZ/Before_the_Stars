import { getProjectilePose, getProjectileProfile } from './projectiles.js';

const C = { stone: '#a9ae94', dust: '#aaa183', smoke: '#798074', dark: '#4e5a4c',
  fire: '#d7a363', hot: '#edcf8c', shell: '#d1c6a5', oil: '#77653f', steam: '#bec4ae' };
const energy = team => team === 'player' ? '#b0d5bd' : '#ddbd94';
function line(ctx, points, color, width = 1.5) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function polygon(ctx, points, color) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
function oval(ctx, x, y, rx, ry, color) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}
export function drawArrow(ctx) {
  line(ctx, [[-17, 0], [2, 0]], '#aa9875', 1.4);
  polygon(ctx, [[5, 0], [0, -2.5], [0, 2.5]], '#c8c9b1');
  line(ctx, [[-15, -3], [-11, 0], [-15, 3]], '#bec7ae', 1.2);
}
function trail(ctx, shot, scale, t, length, color, width, alpha = 1) {
  const points = [];
  for (let i = 0; i <= 7; i++) {
    const pose = getProjectilePose(shot, scale, Math.max(0, t - length * (1 - i / 7)));
    points.push([pose.x, pose.y]);
  }
  ctx.save(); ctx.globalAlpha *= alpha; line(ctx, points, color, width * scale); ctx.restore();
}

export function drawProjectile(ctx, shot, scale = 1, reducedMotion = false) {
  const pose = getProjectilePose(shot, scale), { x, y, angle, progress: p } = pose;
  const profile = getProjectileProfile(shot), tint = energy(shot.team);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (profile.motion === 'beam') {
    const fade = reducedMotion ? 0.7 : 1 - p * 0.65;
    ctx.globalAlpha = fade;
    if (shot.kind === 'ion') {
      ctx.globalAlpha *= 0.18;
      line(ctx, [[pose.fromX, pose.fromY], [pose.toX, pose.toY]], tint, 9 * scale);
      ctx.globalAlpha = fade;
    }
    line(ctx, [[pose.fromX, pose.fromY], [pose.toX, pose.toY]], tint, (shot.kind === 'ion' ? 2.8 : 1.2) * scale);
    oval(ctx, pose.toX, pose.toY, 2.5 * scale, 2 * scale, '#e2e4c9');
    ctx.restore(); return;
  }
  if (shot.kind === 'oil') {
    // A short, stretching stream breaks into heavy drops as it falls.
    trail(ctx, shot, scale, p, 0.18, C.oil, 3.4);
    for (let i = 0; i < 4; i++) {
      const drop = getProjectilePose(shot, scale, Math.max(0, p - 0.035 * i));
      oval(ctx, drop.x + Math.sin(i * 3) * p * 3 * scale, drop.y, (2.5 - i * 0.3) * scale, (3 + p * 2) * scale, i % 2 ? '#a28a52' : C.oil);
    }
    ctx.restore(); return;
  }
  if (!reducedMotion) {
    if (shot.kind === 'rocket') {
      trail(ctx, shot, scale, p, 0.2, C.smoke, 3, 0.28);
    } else if (shot.kind === 'fireball') {
      trail(ctx, shot, scale, p, 0.13, C.smoke, 5, 0.2);
      trail(ctx, shot, scale, p, 0.065, C.fire, 3, 0.7);
    } else if (['plasma', 'plasma-orb'].includes(shot.kind)) {
      trail(ctx, shot, scale, p, 0.08, tint, shot.kind === 'plasma' ? 2 : 4, 0.3);
    }
  }
  ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  switch (shot.kind) {
    case 'javelin':
      line(ctx, [[-32, 0], [8, 0]], '#a99d81', 1.8);
      polygon(ctx, [[14, 0], [5, -3], [5, 3]], C.shell); break;
    case 'grenade': oval(ctx, 0, 0, 4, 3, '#788977'); line(ctx, [[-2, -3], [1, -4], [3, -1]], C.shell, 1); break;
    case 'canister':
      for (const offset of [-1, 0, 1]) { line(ctx, [[-12, offset * (4 + p * 5)], [1, offset * (5 + p * 7)]], C.shell, 1.1); } break;
    case 'arrow': case 'bolt': drawArrow(ctx);
      if (shot.trait === 'fireArrow') oval(ctx, 3, 0, 3, 2, C.fire); break;
    case 'bullet': line(ctx, [[-9, 0], [1, 0]], '#ddca94', 1.5); break;
    case 'rail':
      line(ctx, [[-24, 0], [2, 0]], tint, 1.5);
      line(ctx, [[-6, 0], [2, 0]], '#e0e4cd', 2); break;
    case 'rocket':
      if (!reducedMotion) polygon(ctx, [[-13, -2], [-22 - p * 4, 0], [-13, 2]], C.fire);
      polygon(ctx, [[-14, -4], [-10, -2], [4, -2], [9, 0], [4, 2], [-10, 2], [-14, 4]], '#b5bdab');
      line(ctx, [[-7, -1], [3, -1]], C.shell, 1.5); break;
    case 'plasma': case 'plasma-orb': {
      const size = shot.kind === 'plasma' ? 2.5 : 5;
      oval(ctx, 0, 0, size * 1.6, size, tint);
      line(ctx, [[-size, 0], [size * 0.6, 0]], '#e1e5d0', 1.5); break;
    }
    case 'cannon':
      oval(ctx, 0, 0, 3.5, 3.5, C.dark); oval(ctx, 0.5, -1, 1.4, 1.2, C.stone); break;
    case 'shell':
      polygon(ctx, [[-6, -2.5], [2, -2.5], [6, 0], [2, 2.5], [-6, 2.5]], '#9eac96');
      line(ctx, [[-3, -2], [-3, 2]], '#b4a575', 1); break;
    case 'egg':
      ctx.rotate(reducedMotion ? 0 : p * 5);
      oval(ctx, 0, 0, 3, 4.5, C.shell); break;
    case 'fireball':
      polygon(ctx, [[3, -4], [-6, -5], [-13, -1], [-7, 1], [-10, 5], [2, 5]], C.fire);
      oval(ctx, 0, 0, 4.5, 4.5, '#82745a'); oval(ctx, 2, -1, 2, 2, C.hot); break;
    default: {
      const size = shot.kind === 'boulder' ? 7 : shot.kind === 'stone' ? 4 : 2.6;
      ctx.rotate(reducedMotion ? 0 : p * 3.5);
      polygon(ctx, [[-size, -size * 0.3], [-size * 0.35, -size], [size * 0.6, -size * 0.7], [size, size * 0.2], [size * 0.3, size], [-size * 0.8, size * 0.6]], C.stone);
      polygon(ctx, [[-size, -size * 0.3], [-size * 0.35, -size], [size * 0.6, -size * 0.7], [0, 0]], '#c0c4a9');
    }
  }
  ctx.restore();
}

function dust(ctx, p, radius, color = C.dust, lift = 8) {
  ctx.save(); ctx.globalAlpha *= (1 - p) * 0.24;
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * radius * (0.18 + p * 0.4);
    const r = 3 + p * radius * (0.16 + (i % 2) * 0.07);
    oval(ctx, x, -p * lift - (i % 2) * 3, r * 1.4, r, color);
  }
  ctx.restore();
}
function sparks(ctx, p, angle, color, count = 4, reach = 24) {
  if (p > 0.7) return;
  ctx.save(); ctx.globalAlpha *= 1 - p / 0.7;
  for (let i = 0; i < count; i++) {
    const a = angle + (i - (count - 1) / 2) * 0.5;
    const d = 2 + p * reach * (0.7 + (i % 3) * 0.2);
    line(ctx, [[Math.cos(a) * d, Math.sin(a) * d], [Math.cos(a) * (d + 4), Math.sin(a) * (d + 4)]], color, 1.2);
  }
  ctx.restore();
}
function chips(ctx, p, count, radius, floor, color = C.stone) {
  for (let i = 0; i < count; i++) {
    const vx = Math.sin(i * 7 + 1) * radius;
    const lift = (24 + (i % 3) * 18) * (1 + radius / 120);
    const x = vx * p, y = Math.min(floor, -lift * p + (70 + radius * 0.7) * p * p);
    const r = 1.3 + (i % 3) * 0.7;
    ctx.save(); ctx.translate(x, y); ctx.rotate(i + p * (i % 2 ? 5 : -4));
    polygon(ctx, [[-r, -r], [r, -r * 0.5], [r * 0.3, r]], color); ctx.restore();
  }
}
function explosion(ctx, p, size, floor) {
  // Brief hot gas, then drifting smoke and falling fragments; no radius ring.
  if (p < 0.28) {
    const s = size * (0.5 + Math.sqrt(p) * 1.7);
    ctx.save(); ctx.globalAlpha *= 1 - p / 0.28;
    polygon(ctx, [[-s, 2], [-s * 0.5, -s * 0.6], [-s * 0.2, -s * 1.3], [s * 0.15, -s * 0.65], [s * 0.75, -s], [s * 0.6, -s * 0.1], [s, s * 0.4], [0, s * 0.5]], C.fire);
    oval(ctx, 0, 0, s * 0.35, s * 0.5, C.hot);
    ctx.restore();
  }
  dust(ctx, p, size, C.smoke, size * 0.65);
  chips(ctx, p, 6, size, floor, C.dark);
  sparks(ctx, p, -Math.PI / 2, C.hot, 4, size);
}

export function drawImpact(ctx, effect, scale = 1, targetX = effect.x) {
  const p = Math.max(0, Math.min(1, 1 - effect.life / effect.duration));
  const x = effect.anchorX === undefined ? targetX : effect.anchorX + (effect.x - effect.anchorX) * scale;
  const color = energy(effect.team), size = Math.max(12, Math.min(38, (effect.radius || 25) * 0.4));
  ctx.save(); ctx.translate(x, effect.y * scale); ctx.scale(scale, scale);
  ctx.lineCap = 'round'; ctx.globalAlpha = Math.min(1, (1 - p) * 3);
  const floor = -effect.y;
  switch (effect.style) {
    case 'arrow':
      ctx.save(); ctx.rotate(effect.angle); ctx.translate(-3, 0); drawArrow(ctx); ctx.restore();
      if (effect.surface === 'metal') sparks(ctx, p, effect.angle + Math.PI, C.shell, 3, 12);
      break;
    case 'stone': case 'rubble':
      chips(ctx, p, effect.style === 'rubble' ? 7 : 3, effect.style === 'rubble' ? 32 : 14, floor);
      dust(ctx, p, effect.style === 'rubble' ? 35 : 12, C.dust, 6); break;
    case 'egg':
      ctx.save(); ctx.globalAlpha *= (1 - p) * 0.75;
      oval(ctx, 0, 3 + p * 10, 6 + p * 7, 2 + p * 2, '#c4ac6e'); ctx.restore();
      chips(ctx, p, 5, 22, floor, C.shell); break;
    case 'oil':
      for (let i = 0; i < 7; i++) {
        const spread = (i - 3) * 9 * Math.sqrt(p);
        const y = Math.min(floor, -(Math.sin(i * 3 + 1) ** 2) * 24 * p + 35 * p * p);
        oval(ctx, spread, y, 2.5, 1.5 + p * 2, i % 2 ? C.oil : '#a18a54');
      }
      break;
    case 'fire':
      for (let i = 0; i < 7; i++) {
        const x = (i - 3) * 7 * (0.4 + p), h = (13 + (i % 3) * 6) * (1 - p);
        polygon(ctx, [[x - 4, 2], [x - 2, -h], [x + 2, -h * 0.4], [x + 4, 1]], i % 2 ? C.fire : C.hot);
      }
      dust(ctx, p, 30, C.smoke, 20); break;
    case 'explosion': explosion(ctx, p, size, floor); break;
    case 'bullet': case 'solid':
      if (effect.surface === 'metal') sparks(ctx, p, effect.angle + Math.PI, C.hot, effect.style === 'solid' ? 5 : 3);
      else dust(ctx, p, effect.style === 'solid' ? 22 : 9, C.dust, 4);
      if (effect.style === 'solid' || effect.surface === 'stone') chips(ctx, p, 3, 15, floor, C.stone);
      break;
    case 'plasma':
      ctx.save(); ctx.rotate(effect.angle);
      for (let i = 0; i < 5; i++) {
        const spread = (i - 2) * (2 + p * size * 0.4);
        line(ctx, [[-6 * p, spread], [8 * (1 - p), spread * 1.2]], color, (1 - p) * 2 + 0.5);
      }
      ctx.restore(); break;
    case 'laser':
      line(ctx, [[0, -4 * (1 - p)], [0, 4 * (1 - p)]], color, 2);
      sparks(ctx, p, -Math.PI / 2, C.shell, 2, 12); break;
    case 'rail':
      sparks(ctx, p, effect.angle, C.shell, 4, 36);
      line(ctx, [[-2, -4], [2, 4]], C.dark, 1.5); break;
    case 'ion':
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 5 * (0.3 + p);
        line(ctx, [[x, -10 + p * 4], [x + 2, -3], [x - 1, 5], [x + 1, 11 - p * 4]], color, 1.2);
      }
      break;
    case 'slash': case 'blade':
      ctx.save(); ctx.rotate(effect.angle - 0.7);
      polygon(ctx, [[-13 * p, -2], [13, 0], [-10 * p, 2]], effect.style === 'blade' ? color : C.shell); ctx.restore(); break;
    case 'knife':
      ctx.save(); ctx.rotate(effect.angle);
      line(ctx, [[-5 * p, 2], [6 * (1 - p), -1]], C.shell, 1.2);
      if (effect.surface === 'metal') sparks(ctx, p, 0, C.shell, 2, 6);
      ctx.restore(); break;
    case 'thrust':
      sparks(ctx, p, effect.angle, C.shell, 2, 12); break;
    case 'bite':
      for (const y of [-5, 5]) line(ctx, [[-5, y], [0, y * (1 - p)], [5, y]], C.dust, 1.4); break;
    default: dust(ctx, p, 12, C.dust, 3);
  }
  ctx.restore();
}

export function drawFields(ctx, game, time, scale, reducedMotion) {
  for (const field of game.fields ?? []) {
    const fade = Math.min(1, field.remaining / 0.5);
    ctx.save(); ctx.translate(field.x, 0); ctx.globalAlpha = fade;
    if (field.kind === 'oil') {
      // A dark, glossy pool with steam. Hot oil is not automatically on fire.
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * field.radius * 0.29;
        oval(ctx, x, -1, field.radius * 0.3, (2 + i % 2) * scale, '#5f573c');
        line(ctx, [[x - 7, -2 * scale], [x + 4, -2 * scale]], '#a18b58', 1);
      }
      if (!reducedMotion) for (let i = 0; i < 3; i++) {
        const rise = (time * 0.65 + i * 0.33) % 1, x = (i - 1) * field.radius * 0.5;
        ctx.globalAlpha = fade * (1 - rise) * 0.17;
        line(ctx, [[x, -4 * scale], [x - 3, -(7 + rise * 7) * scale], [x + 2, -(13 + rise * 10) * scale]], C.steam, 1.3);
      }
    } else {
      oval(ctx, 0, -1, field.radius, 2 * scale, '#5a573e');
      for (let i = 0; i < 9; i++) {
        const x = (i / 8 - 0.5) * field.radius * 1.8;
        const pulse = reducedMotion ? 0.5 : (1 + Math.sin(time * 8 + i * 2.3)) / 2;
        const h = (6 + pulse * 8 + i % 3) * scale;
        polygon(ctx, [[x - 3 * scale, -1], [x - 2 * scale, -h], [x + scale, -h * 0.45], [x + 3 * scale, -1]], C.fire);
        polygon(ctx, [[x - scale, -1], [x, -h * 0.5], [x + scale, -1]], C.hot);
      }
    }
    ctx.restore();
  }
}

export function drawAbilityImpact(ctx, effect, scale, ground) {
  const p = Math.max(0, Math.min(1, 1 - effect.life / effect.duration));
  ctx.save(); ctx.translate(effect.x, -3 * scale); ctx.scale(scale, scale);
  ctx.globalAlpha = Math.min(1, (1 - p) * 3);
  if (effect.kind === 'volley') {
    for (let i = 0; i < 13; i++) {
      const x = (i / 12 - 0.5) * effect.radius * 2 / scale;
      ctx.save(); ctx.translate(x, 2 - i % 3); ctx.rotate(Math.atan2(ground * 2, 60)); drawArrow(ctx); ctx.restore();
      ctx.save(); ctx.translate(x, 0); dust(ctx, p, 5, C.dust, 2); ctx.restore();
    }
  } else if (effect.kind === 'orbital') {
    const width = 9 * (1 - p) ** 2;
    ctx.globalAlpha *= 0.25;
    line(ctx, [[0, -ground / scale], [0, -1]], energy('player'), width * 4 + 2);
    ctx.globalAlpha *= 3;
    line(ctx, [[0, -ground / scale], [0, -1]], '#dde7cf', width);
    line(ctx, [[-25 * (1 - p), 0], [25 * (1 - p), 0]], '#b0d5bd', 2);
    sparks(ctx, p, -Math.PI / 2, '#b0d5bd', 7, 50);
  } else if (effect.kind === 'meteor') {
    polygon(ctx, [[-27, 2], [-17, -4], [8, -6], [26, 1], [13, 4], [-15, 4]], C.dark);
    if (p < 0.45) {
      const spread = 25 + Math.sqrt(p) * 100, lift = 45 * (1 - p);
      ctx.save(); ctx.globalAlpha *= (1 - p / 0.45) * 0.45;
      polygon(ctx, [[-spread, 0], [-spread * 0.7, -lift * 0.4], [-spread * 0.35, -lift * 0.7],
        [-8, -lift], [spread * 0.3, -lift * 0.55], [spread * 0.8, -lift * 0.3], [spread, 0]], C.dust);
      ctx.restore();
    }
    if (p < 0.25) line(ctx, [[-14, -2], [-3, -5], [13, -3]], C.fire, 3 * (1 - p / 0.25));
    chips(ctx, p, 12, Math.min(100, effect.radius * 0.7), 2, C.stone);
    dust(ctx, p, 80, C.dust, 18);
  } else if (effect.kind === 'airstrike') {
    explosion(ctx, p, 50, 2);
    ctx.save(); ctx.translate(0, -16 * p); dust(ctx, p, 42, C.smoke, 48); ctx.restore();
  }
  ctx.restore();
}

// Small, material-like accents rather than a shared circular explosion.
export function drawTraitEffect(ctx, effect, scale = 1, reduced = false) {
  const p = reduced ? .4 : 1 - effect.life / effect.duration, tint = energy(effect.team);
  ctx.save(); ctx.translate(effect.x, 0); ctx.scale(scale, scale);
  ctx.globalAlpha = reduced ? .35 : (1 - p) * .7;
  if (effect.style === 'blink') {
    if (!reduced) for (let i = 0; i < 3; i++) polygon(ctx, [[-8-i*9,-52],[2-i*9,-52],[8-i*9,-10],[-6-i*9,-10]], tint);
    const end = ((effect.toX ?? effect.x) - effect.x) / scale;
    line(ctx, [[end-8,-50],[end-10,-22],[end-6,-10]], tint, 1.5);
  } else if (['shield', 'field', 'fieldBreak'].includes(effect.style)) {
    const reach = effect.toX === undefined ? 0 : (effect.toX - effect.x) / scale;
    if (reach) line(ctx, [[0,-48],[reach,-38]], tint, 1);
    polygon(ctx, [[reach+17,-60],[reach+27,-48],[reach+24,-18],[reach+15,-10],[reach+18,-37]], tint);
  } else if (effect.style === 'heal') {
    for (let i=0;i<3;i++) { const x = i*9-9, y = -24-i*8-p*12;
      polygon(ctx, [[x,y],[x+4,y-5],[x+6,y],[x+3,y+4]], tint); }
  } else if (effect.style === 'parry') {
    polygon(ctx, [[14,-47],[25,-40],[35,-43],[25,-36],[25,-28],[20,-36],[10,-34],[20,-40]], C.shell);
  } else if (effect.style === 'suppression') {
    for (let i=0;i<3;i++) line(ctx, [[i*6-6,-9],[i*6-9,-4]], C.shell, 1);
  } else if (effect.style === 'overload') {
    polygon(ctx, [[18,-47],[30,-43],[21,-39],[25,-43]], tint);
  } else if (effect.style === 'ricochet') {
    line(ctx, [[-5,-37],[0,-31],[8,-36]], C.stone, 1.5);
  } else if (effect.style === 'volley') {
    for (let i=0;i<3;i++) polygon(ctx, [[i*5-5,-74],[i*5-3,-77],[i*5-1,-74]], C.shell);
  } else if (effect.style === 'coaxial' || effect.style === 'canister') {
    polygon(ctx, [[20,-43],[35,-48],[30,-42],[38,-39],[20,-39]], C.hot);
  }
  ctx.restore();
}
