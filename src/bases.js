import { BASE_MOUNTS } from './base-layouts.js';

// Broad, unoutlined material planes belong to the same landscape as the troops.
const MATERIALS = {
  player: { stone: '#929f89', light: '#b4bca0', shade: '#687d68', dark: '#465d4e',
    wall: '#aeb7a0', concrete: '#8d9e90', metal: '#9daf9f', cloth: '#87aa86', energy: '#b0d5bd' },
  enemy: { stone: '#a69c81', light: '#c7bb9a', shade: '#84795f', dark: '#665d49',
    wall: '#beb298', concrete: '#a99f8b', metal: '#b8ad96', cloth: '#bd9977', energy: '#ddbd94' },
};
const INK = '#293e35';
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
function banner(ctx, x, y, m, time, length = 27) {
  const sway = Math.sin(time * 1.7) * 1.2;
  polygon(ctx, [[x, y], [x + 13, y], [x + 13 + sway, y + length - 5], [x + 7 + sway, y + length], [x + sway, y + length - 5]], m.cloth);
  polygon(ctx, [[x, y], [x + 3, y], [x + 3 + sway, y + length - 3], [x + sway, y + length - 5]], m.shade);
  line(ctx, [[x - 2, y - 1], [x + 15, y - 1]], m.light, 2);
}

function rock(ctx, x, top, bottom, m, narrow = false) {
  const w = narrow ? 23 : 27;
  polygon(ctx, [[x - w - 8, bottom], [x - w - 2, top + 31], [x - w + 5, top + 5],
    [x - 18, top], [x + 18, top], [x + w, top + 12], [x + w + 6, bottom]], m.stone);
  polygon(ctx, [[x + 8, top + 9], [x + 18, top], [x + w, top + 12], [x + w + 6, bottom], [x + 1, bottom]], m.shade);
  polygon(ctx, [[x - w + 5, top + 5], [x - 18, top], [x + 18, top], [x + 8, top + 9], [x - 12, top + 12]], m.light);
  polygon(ctx, [[x - w - 2, top + 31], [x - 12, top + 12], [x - 18, bottom], [x - w - 8, bottom]], m.dark);
  line(ctx, [[x + 6, top + 25], [x - 1, top + 37], [x + 3, top + 44]], m.dark, 1.2);
}
function tribal(ctx, mounts, m, time) {
  // The cave and every extra ledge are carved from one outcrop.
  rock(ctx, -19, -96, 0, m);
  for (let i = mounts.length - 1; i >= 0; i--) {
    const { x, y } = mounts[i]; rock(ctx, x, y, i > 1 ? -54 : 0, m, i > 1);
  }
  polygon(ctx, [[-60, 0], [-52, -44], [-25, -69], [12, -57], [23, 0]], m.stone);
  polygon(ctx, [[-24, 0], [-23, -33], [-11, -49], [9, -43], [20, -24], [22, 0]], m.dark);
  polygon(ctx, [[-17, 0], [-16, -31], [-7, -40], [7, -35], [13, -22], [15, 0]], INK);
  // An ochre hide at the entrance, held by two simple bone uprights.
  polygon(ctx, [[-29, -43], [-9, -62], [15, -43], [4, -45], [-7, -52], [-17, -43]], '#b3a078');
  polygon(ctx, [[-28, 0], [-29, -26], [-23, -40], [-24, -21], [-23, 0]], m.light);
  polygon(ctx, [[21, 0], [21, -23], [16, -37], [24, -26], [27, 0]], m.light);
  banner(ctx, -48, -61, m, time, 22);
  polygon(ctx, [[-70, 1], [-63, -12], [-46, -7], [-39, 1]], m.shade);
  polygon(ctx, [[39, 1], [46, -11], [63, -7], [70, 1]], m.dark);
}

function castleTower(ctx, x, top, bottom, m) {
  polygon(ctx, [[x - 25, bottom], [x - 25, top + 8], [x - 18, top], [x + 19, top], [x + 26, top + 8], [x + 26, bottom]], m.wall);
  polygon(ctx, [[x + 13, top + 7], [x + 26, top + 8], [x + 26, bottom], [x + 13, bottom]], m.shade);
  polygon(ctx, [[x - 25, top + 8], [x - 18, top], [x + 19, top], [x + 26, top + 8], [x + 13, top + 11], [x - 18, top + 11]], m.light);
  // Corner merlons frame the socket; there is no beam spanning between towers.
  for (const dx of [-25, 19]) {
    ctx.fillStyle = m.wall; ctx.fillRect(x + dx, top - 7, 7, 15);
    ctx.fillStyle = m.light; ctx.fillRect(x + dx, top - 7, 7, 2);
  }
  ctx.fillStyle = INK; ctx.fillRect(x - 5, top + 25, 4, 15);
  line(ctx, [[x - 15, top + 50], [x + 5, top + 50], [x + 5, top + 62]], m.shade, 1);
  polygon(ctx, [[x - 28, bottom], [x - 23, bottom - 27], [x - 16, bottom - 27], [x - 16, bottom]], m.stone);
}
function medieval(ctx, mounts, m, time) {
  // Curtain wall and a quiet pitched keep behind the gatehouse.
  polygon(ctx, [[-55, 0], [-55, -90], [-19, -111], [24, -88], [56, -62], [61, 0]], m.shade);
  polygon(ctx, [[-47, -85], [-24, -121], [-2, -87]], m.dark);
  polygon(ctx, [[-24, -121], [4, -86], [-2, -87]], m.stone);
  for (let i = mounts.length - 1; i >= 0; i--) {
    const { x, y } = mounts[i]; castleTower(ctx, x, y, i > 1 ? -57 : 0, m);
  }
  polygon(ctx, [[-26, 0], [-26, -74], [-19, -82], [15, -82], [23, -74], [23, 0]], m.stone);
  for (const x of [-27, -7, 13]) { ctx.fillStyle = m.wall; ctx.fillRect(x, -89, 10, 15); }
  polygon(ctx, [[-18, 0], [-18, -36], [-4, -55], [11, -36], [11, 0]], m.light);
  polygon(ctx, [[-13, 0], [-13, -35], [-4, -47], [6, -35], [6, 0]], INK);
  for (const x of [-9, -3, 3]) line(ctx, [[x, -32], [x, 0]], m.shade, 1.5);
  line(ctx, [[-13, -24], [6, -24]], m.shade, 2);
  banner(ctx, 8, -67, m, time, 23);
  polygon(ctx, [[-66, 1], [-62, -17], [-51, -17], [-45, 1]], m.shade);
  polygon(ctx, [[44, 1], [52, -17], [62, -17], [69, 1]], m.shade);
}

function bastion(ctx, x, top, bottom, m) {
  polygon(ctx, [[x - 32, bottom], [x - 24, top + 8], [x - 16, top], [x + 17, top], [x + 25, top + 8], [x + 32, bottom]], m.wall);
  polygon(ctx, [[x + 7, top + 12], [x + 25, top + 8], [x + 32, bottom], [x + 10, bottom]], m.shade);
  polygon(ctx, [[x - 24, top + 8], [x - 16, top], [x + 17, top], [x + 25, top + 8], [x + 7, top + 12], [x - 16, top + 10]], m.light);
  polygon(ctx, [[x - 25, top + 17], [x + 8, top + 21], [x + 26, top + 17], [x + 26, top + 21], [x + 8, top + 25], [x - 25, top + 21]], m.stone);
  ctx.fillStyle = m.dark; ctx.fillRect(x - 10, top + 34, 13, 5);
  line(ctx, [[x - 21, top + 54], [x + 7, top + 57]], m.stone, 1);
}
function renaissance(ctx, mounts, m, time) {
  polygon(ctx, [[-67, 0], [-57, -78], [-27, -93], [41, -72], [69, 0]], m.shade);
  // A plaster gatehouse and terracotta roof sit between sloping artillery bastions.
  polygon(ctx, [[-31, 0], [-31, -112], [8, -112], [21, -90], [21, 0]], m.wall);
  polygon(ctx, [[-40, -111], [-20, -135], [-3, -135], [23, -109]], '#967b5b');
  polygon(ctx, [[-20, -135], [-3, -135], [23, -109], [0, -112]], '#756c51');
  for (let i = mounts.length - 1; i >= 0; i--) {
    const { x, y } = mounts[i]; bastion(ctx, x, y, i > 1 ? -56 : 0, m);
  }
  polygon(ctx, [[-30, 0], [-28, -68], [9, -68], [19, 0]], m.stone);
  ctx.fillStyle = m.light; ctx.fillRect(-20, -34, 25, 34);
  ctx.beginPath(); ctx.arc(-7.5, -34, 12.5, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK; ctx.fillRect(-15, -32, 15, 32);
  ctx.beginPath(); ctx.arc(-7.5, -32, 7.5, Math.PI, Math.PI * 2); ctx.fill();
  line(ctx, [[-7, -35], [-7, 0]], m.shade, 1.5);
  banner(ctx, -23, -96, m, time, 21);
  polygon(ctx, [[-70, 1], [-63, -18], [-41, -12], [-34, 1]], m.dark);
  polygon(ctx, [[36, 1], [47, -13], [65, -15], [72, 1]], m.dark);
}

function bunkerShoulder(ctx, x, top, bottom, m) {
  polygon(ctx, [[x - 31, bottom], [x - 25, top + 13], [x - 17, top], [x + 17, top], [x + 26, top + 13], [x + 31, bottom]], m.concrete);
  polygon(ctx, [[x + 9, top + 11], [x + 17, top], [x + 26, top + 13], [x + 31, bottom], [x + 10, bottom]], m.shade);
  polygon(ctx, [[x - 25, top + 13], [x - 17, top], [x + 17, top], [x + 9, top + 11]], m.light);
  polygon(ctx, [[x - 23, top + 26], [x + 9, top + 26], [x + 9, top + 33], [x - 24, top + 33]], m.dark);
  line(ctx, [[x - 17, top + 29], [x, top + 29]], INK, 2);
  for (let i = 0; i < 3; i++) line(ctx, [[x + 16, top + 40 + i * 5], [x + 22, top + 39 + i * 5]], m.dark, 1.5);
}
function modern(ctx, mounts, m, time) {
  polygon(ctx, [[-71, 0], [-62, -59], [-43, -82], [34, -73], [62, -50], [72, 0]], m.shade);
  polygon(ctx, [[-62, -59], [-43, -82], [34, -73], [49, -59]], m.concrete);
  for (let i = mounts.length - 1; i >= 0; i--) {
    const { x, y } = mounts[i]; bunkerShoulder(ctx, x, y, i > 1 ? -45 : 0, m);
  }
  polygon(ctx, [[-35, 0], [-32, -49], [-18, -62], [16, -58], [25, -46], [28, 0]], m.concrete);
  polygon(ctx, [[-28, 0], [-27, -43], [-20, -50], [13, -50], [20, -43], [22, 0]], m.dark);
  ctx.fillStyle = INK; ctx.fillRect(-22, -42, 36, 42);
  for (let y = -35; y < 0; y += 9) line(ctx, [[-21, y], [13, y]], m.shade, 2);
  ctx.fillStyle = '#b3a67b'; ctx.fillRect(-28, -15, 3, 15); ctx.fillRect(18, -15, 3, 15);
  ctx.fillStyle = m.cloth; ctx.fillRect(-16, -58, 23, 3);
  // A small aerial and one slow beacon replace the oversized rooftop dish.
  line(ctx, [[-63, -40], [-63, -114]], m.dark, 2);
  line(ctx, [[-66, -101], [-57, -101]], m.light, 1.5);
  oval(ctx, -63, -115, 2, 2, m.light);
  ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(time * 1.8) * 0.15;
  ctx.fillStyle = m.energy; ctx.fillRect(-11, -46, 12, 2); ctx.restore();
  polygon(ctx, [[-72, 1], [-64, -19], [-46, -19], [-38, 1]], m.dark);
  polygon(ctx, [[35, 1], [43, -17], [64, -17], [73, 1]], m.dark);
}

function armoredPod(ctx, x, top, bottom, m, time) {
  polygon(ctx, [[x - 29, bottom], [x - 23, top + 12], [x - 16, top], [x + 17, top], [x + 24, top + 12], [x + 28, bottom]], m.shade);
  polygon(ctx, [[x - 23, top + 12], [x - 16, top], [x + 17, top], [x + 11, top + 12], [x + 10, bottom - 8], [x - 8, bottom]], m.metal);
  polygon(ctx, [[x - 16, top], [x + 17, top], [x + 11, top + 7], [x - 19, top + 7]], m.light);
  polygon(ctx, [[x + 15, top + 23], [x + 20, top + 20], [x + 22, bottom - 12], [x + 17, bottom - 8]], m.dark);
  ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(time * 1.4) * 0.1;
  line(ctx, [[x + 16, top + 25], [x + 19, Math.min(bottom - 18, top + 52)]], m.energy, 1.5); ctx.restore();
  polygon(ctx, [[x - 18, top + 19], [x + 1, top + 19], [x - 2, top + 24], [x - 19, top + 24]], m.dark);
}
function future(ctx, mounts, m, time) {
  polygon(ctx, [[-68, 0], [-58, -86], [-28, -115], [22, -104], [53, -76], [68, 0]], m.dark);
  polygon(ctx, [[-58, -86], [-28, -115], [-15, -107], [-31, -14], [-62, 0]], m.metal);
  for (let i = mounts.length - 1; i >= 0; i--) {
    const { x, y } = mounts[i]; armoredPod(ctx, x, y, i > 1 ? -43 : 0, m, time);
  }
  // Recessed power core, split carapace and a narrow hangar opening.
  polygon(ctx, [[-33, 0], [-25, -78], [-9, -93], [9, -78], [22, 0]], m.dark);
  polygon(ctx, [[-27, -75], [-9, -93], [-14, -48], [-24, -11], [-34, 0]], m.metal);
  polygon(ctx, [[-9, -93], [9, -78], [20, 0], [11, -9], [0, -48]], m.shade);
  polygon(ctx, [[-10, -73], [-4, -78], [2, -69], [-1, -46], [-7, -41], [-12, -49]], INK);
  ctx.save(); ctx.globalAlpha = 0.65 + Math.sin(time * 1.6) * 0.12;
  polygon(ctx, [[-6, -70], [-3, -66], [-5, -49], [-8, -51]], m.energy); ctx.restore();
  polygon(ctx, [[-18, 0], [-15, -28], [-6, -37], [4, -28], [8, 0]], INK);
  line(ctx, [[-15, -25], [-7, -32], [1, -25]], m.energy, 1.5);
  polygon(ctx, [[-70, 1], [-60, -20], [-36, -12], [-28, 1]], m.shade);
  polygon(ctx, [[27, 1], [36, -14], [59, -21], [70, 1]], m.shade);
}

const MODELS = [null, tribal, medieval, renaissance, modern, future];

export function drawBase(ctx, base, age, time = 0, scale = 1, slots = 1) {
  const material = MATERIALS[base.team];
  const m = base.hitFlash > 0 ? { ...material, stone: '#d4d6b7', wall: '#d4d6b7', concrete: '#d4d6b7', metal: '#d4d6b7' } : material;
  const mounts = BASE_MOUNTS[age].slice(0, slots);
  ctx.save(); ctx.translate(base.x, 0); ctx.scale(scale * (base.team === 'player' ? 1 : -1), scale);
  ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel';
  oval(ctx, 0, 1, 72, 6, '#14231e55');
  if (base.hp > 0) {
    MODELS[age](ctx, mounts, m, time);
    // Empty sockets stay subtle: the architecture itself indicates capacity.
    for (const { x, y } of mounts) oval(ctx, x, y + 1, 13, 1.4, m.dark);
    if (base.hp < base.maxHp * 0.5) {
      line(ctx, [[33, -61], [26, -48], [34, -39], [29, -28]], m.dark, 1.8);
      line(ctx, [[-45, -41], [-39, -30], [-44, -17]], m.dark, 1.5);
    }
  } else {
    polygon(ctx, [[-69, 0], [-53, -24], [-34, -13], [-20, -39], [1, -18], [18, -29], [41, -9], [57, -20], [70, 0]], m.shade);
    polygon(ctx, [[-53, -24], [-35, -20], [-29, -6], [-58, 0]], m.stone);
    polygon(ctx, [[-20, -39], [-3, -32], [1, -18], [-11, -6]], m.wall);
    polygon(ctx, [[18, -29], [36, -19], [41, -9], [15, -8]], m.light);
  }
  ctx.restore();
}
