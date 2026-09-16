import { BASE_MOUNTS } from './base-layouts.js';

// Keep the landscape's quiet palette, but give each era its own massing,
// materials and load-bearing structure. Team color lives in small accents.
const INK = '#293e35';
const ERA_MATERIALS = [null,
  { body: '#8c9276', light: '#b0ae8b', shade: '#626f51', dark: '#47583f', roof: '#b09a70' },
  { body: '#9eac9b', light: '#c0c7ad', shade: '#728774', dark: '#4e685d', roof: '#526c64' },
  { body: '#b2ac8b', light: '#d1c5a0', shade: '#8a8968', dark: '#606a50', roof: '#a17c60' },
  { body: '#829589', light: '#a5b1a0', shade: '#60776b', dark: '#3d564e', roof: '#6c8271' },
  { body: '#a2b8ac', light: '#d0d8bd', shade: '#6d9384', dark: '#38574f', roof: '#526f64' },
];
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
function banner(ctx, x, y, m, time, length = 30) {
  const sway = Math.sin(time * 1.7) * 1.2;
  polygon(ctx, [[x, y], [x + 12, y], [x + 12 + sway, y + length - 6], [x + 6 + sway, y + length], [x + sway, y + length - 6]], m.cloth);
  line(ctx, [[x - 2, y], [x + 14, y]], m.light, 2);
}

function tribal(ctx, mounts, m, time) {
  // Broad, irregular geology instead of a row of stone towers.
  polygon(ctx, [[-74, 0], [-69, -43], [-55, -69], [-42, -91], [-17, -95], [-3, -73], [24, -74], [55, -45], [72, 0]], m.body);
  polygon(ctx, [[-69, -43], [-42, -91], [-17, -95], [-34, -63], [-27, -16], [-46, 0], [-74, 0]], m.shade);
  polygon(ctx, [[-42, -91], [-17, -95], [-3, -73], [-22, -79]], m.light);
  for (let i = mounts.length - 1; i >= 0; i--) {
    const { x, y } = mounts[i], root = x * 0.6;
    polygon(ctx, [[root - 29, 0], [x - 23, y + 31], [x - 18, y], [x + 17, y], [x + 24, y + 20], [root + 34, 0]], m.body);
    polygon(ctx, [[x + 7, y + 9], [x + 17, y], [x + 24, y + 20], [root + 34, 0], [root + 13, -9]], m.shade);
    polygon(ctx, [[x - 18, y], [x + 17, y], [x + 7, y + 9], [x - 20, y + 12]], m.light);
    line(ctx, [[x + 5, y + 21], [x - 3, y + 35], [x + 3, y + 47]], m.dark, 1.2);
  }
  // A low cave mouth, with paired tusks and a separate hide lean-to.
  polygon(ctx, [[-8, 0], [-10, -26], [-1, -45], [19, -50], [35, -35], [39, 0]], m.dark);
  polygon(ctx, [[-1, 0], [0, -25], [9, -38], [22, -39], [30, -25], [32, 0]], INK);
  polygon(ctx, [[-16, 0], [-16, -22], [-10, -44], [2, -57], [10, -58], [-2, -44], [-8, -22], [-7, 0]], m.light);
  polygon(ctx, [[39, 0], [37, -24], [29, -45], [20, -55], [28, -51], [39, -37], [47, -14], [48, 0]], m.light);
  polygon(ctx, [[-69, 0], [-46, -47], [-17, -6], [-34, 0]], m.roof);
  polygon(ctx, [[-46, -47], [-32, -10], [-17, -6], [-34, -30]], '#867651');
  polygon(ctx, [[-53, 0], [-45, -29], [-37, 0]], m.dark);
  line(ctx, [[-50, -51], [-45, -42], [-39, -49]], m.light, 2);
  for (const [x, y] of [[-59, -4], [57, -2]]) polygon(ctx, [[x - 9, y], [x - 4, y - 8], [x + 6, y - 6], [x + 10, y]], m.shade);
  banner(ctx, -65, -38, m, time, 19);
}

function castleTower(ctx, x, y, bottom, m, wide = 20) {
  polygon(ctx, [[x - wide, bottom], [x - wide, y + 8], [x - wide + 6, y], [x + wide - 5, y], [x + wide, y + 8], [x + wide, bottom]], m.body);
  polygon(ctx, [[x + wide - 10, y + 8], [x + wide, y + 8], [x + wide, bottom], [x + wide - 10, bottom]], m.shade);
  for (const dx of [-wide, wide - 7]) {
    ctx.fillStyle = m.light; ctx.fillRect(x + dx, y - 7, 7, 15);
  }
  line(ctx, [[x - wide, y + 8], [x + wide, y + 8]], m.light, 2);
  ctx.fillStyle = INK; ctx.fillRect(x - 2, y + 25, 4, 16);
  line(ctx, [[x - wide + 3, y + 52], [x + 5, y + 52]], m.shade, 1.2);
  polygon(ctx, [[x - wide - 4, bottom], [x - wide, bottom - 26], [x - wide + 6, bottom - 26], [x - wide + 6, bottom]], m.shade);
}
function medieval(ctx, mounts, m, time) {
  // A narrow, steep-roofed keep dominates the one-slot silhouette.
  ctx.fillStyle = m.shade; ctx.fillRect(-69, -133, 24, 133);
  ctx.fillStyle = m.body; ctx.fillRect(-66, -138, 16, 138);
  polygon(ctx, [[-77, -134], [-60, -178], [-41, -134]], m.roof);
  polygon(ctx, [[-60, -178], [-41, -134], [-57, -134]], m.dark);
  line(ctx, [[-60, -179], [-60, -193]], m.dark, 2);
  polygon(ctx, [[-59, -192], [-42, -187 + Math.sin(time * 1.7)], [-59, -182]], m.cloth);
  ctx.fillStyle = INK; ctx.fillRect(-61, -122, 4, 16);
  polygon(ctx, [[-61, 0], [-60, -63], [54, -63], [65, 0]], m.shade);
  for (let i = mounts.length - 1; i >= 0; i--) {
    const { x, y } = mounts[i]; castleTower(ctx, x, y, i > 1 ? -49 : 0, m, i > 1 ? 18 : 20);
  }
  // Small gate and tall hanging pennant keep the façade vertically proportioned.
  ctx.fillStyle = m.body; ctx.fillRect(-20, -75, 37, 75);
  for (const x of [-21, -6, 9]) { ctx.fillStyle = m.light; ctx.fillRect(x, -83, 8, 14); }
  polygon(ctx, [[-14, 0], [-14, -34], [-2, -53], [11, -34], [11, 0]], m.light);
  polygon(ctx, [[-10, 0], [-10, -34], [-2, -46], [7, -34], [7, 0]], INK);
  for (const x of [-6, 0, 5]) line(ctx, [[x, -32], [x, 0]], m.shade, 1.4);
  line(ctx, [[-10, -24], [7, -24]], m.shade, 2);
  banner(ctx, -43, -97, m, time, 42);
  polygon(ctx, [[-16, 0], [12, 0], [22, 4], [-21, 4]], m.shade);
}

function artilleryBastion(ctx, x, y, m, rear) {
  const foot = rear ? x * 0.65 : x;
  polygon(ctx, [[foot - 29, 0], [x - 19, y + 5], [x - 12, y], [x + 16, y], [x + 23, y + 8], [foot + 27, 0]], m.body);
  polygon(ctx, [[x + 9, y + 8], [x + 23, y + 8], [foot + 27, 0], [foot + 7, 0]], m.shade);
  polygon(ctx, [[x - 19, y + 5], [x - 12, y], [x + 16, y], [x + 23, y + 8], [x + 9, y + 13]], m.light);
  line(ctx, [[x - 17, y + 15], [x + 8, y + 22], [x + 22, y + 17]], m.light, 2.5);
  ctx.fillStyle = m.dark; ctx.fillRect(x - 5, y + 28, 11, 4);
}
function renaissance(ctx, mounts, m, time) {
  // A horizontal star-fort plan: projecting spear-shaped bastions and battered walls.
  polygon(ctx, [[-77, 0], [-68, -40], [-45, -63], [-17, -52], [29, -57], [66, -35], [78, 0]], m.shade);
  polygon(ctx, [[-68, -40], [-45, -63], [-17, -52], [-34, -33], [-59, -24]], m.light);
  polygon(ctx, [[29, -57], [66, -35], [53, -23], [10, -37]], m.light);
  // Broad terracotta hip roof, pale plaster and cornice distinguish gunpowder architecture.
  ctx.fillStyle = m.body; ctx.fillRect(-40, -89, 56, 68);
  polygon(ctx, [[-49, -87], [-28, -117], [3, -117], [27, -87]], m.roof);
  polygon(ctx, [[-28, -117], [3, -117], [27, -87], [-13, -89]], '#866b54');
  line(ctx, [[-49, -87], [27, -87]], m.light, 3);
  for (const x of [-30, -10, 10]) line(ctx, [[x, -86], [x, -49]], m.light, 3);
  for (let i = mounts.length - 1; i >= 0; i--) artilleryBastion(ctx, mounts[i].x, mounts[i].y, m, i > 1);
  polygon(ctx, [[-70, 0], [-58, -37], [-31, -30], [-10, -39], [19, -35], [49, -43], [76, 0], [39, -8], [0, -3], [-40, -8]], m.body);
  polygon(ctx, [[-70, 0], [-58, -37], [-31, -30], [-40, -8]], m.shade);
  polygon(ctx, [[49, -43], [76, 0], [39, -8], [19, -35]], m.shade);
  line(ctx, [[-58, -37], [-31, -30], [-10, -39], [19, -35], [49, -43]], m.light, 3);
  // Pediment and paired pilasters, rather than the castle's pointed portcullis.
  polygon(ctx, [[-23, -41], [-5, -57], [14, -41]], m.light);
  polygon(ctx, [[-17, -43], [-5, -51], [7, -43]], m.roof);
  ctx.fillStyle = m.light; ctx.fillRect(-19, -40, 5, 40); ctx.fillRect(5, -40, 5, 40);
  ctx.fillStyle = m.dark; ctx.fillRect(-14, -38, 19, 38);
  ctx.fillStyle = '#71694f'; ctx.fillRect(-11, -32, 13, 32);
  line(ctx, [[-5, -30], [-5, 0]], m.light, 1);
  banner(ctx, 13, -72, m, time, 20);
}

function commandPod(ctx, x, y, m) {
  // A windowed command cabin rests on steel legs integrated into the hangar roof.
  polygon(ctx, [[x - 21, y + 40], [x - 22, y + 12], [x - 15, y], [x + 18, y], [x + 23, y + 11], [x + 17, y + 40]], m.shade);
  polygon(ctx, [[x - 22, y + 12], [x - 15, y], [x + 18, y], [x + 23, y + 11]], m.light);
  ctx.fillStyle = m.body; ctx.fillRect(x - 20, y + 13, 32, 27);
  ctx.fillStyle = m.dark; ctx.fillRect(x - 17, y + 20, 31, 9);
  line(ctx, [[x - 7, y + 21], [x - 7, y + 28]], m.body, 2);
  polygon(ctx, [[x - 23, -38], [x - 20, y + 38], [x - 14, y + 38], [x - 15, -38]], m.body);
  polygon(ctx, [[x + 11, -38], [x + 10, y + 38], [x + 16, y + 38], [x + 21, -38]], m.shade);
  line(ctx, [[x - 16, y + 40], [x + 16, -40]], m.shade, 2.5);
}
function modern(ctx, mounts, m, time) {
  // Wide hangar, horizontal slab roof, corner blast walls and scanning radar.
  polygon(ctx, [[-73, 0], [-67, -39], [-54, -53], [52, -53], [69, -38], [76, 0]], m.shade);
  ctx.fillStyle = m.body; ctx.fillRect(-60, -46, 118, 46);
  for (let i = mounts.length - 1; i >= 0; i--) {
    const { x, y } = mounts[i];
    if (i > 1) commandPod(ctx, x, y, m);
    else {
      polygon(ctx, [[x - 20, 0], [x - 20, y + 6], [x - 13, y], [x + 16, y], [x + 20, y + 7], [x + 24, 0]], m.body);
      polygon(ctx, [[x - 20, y + 6], [x - 13, y], [x + 16, y], [x + 20, y + 7]], m.light);
      ctx.fillStyle = m.dark; ctx.fillRect(x - 10, y + 17, 23, 5);
    }
  }
  polygon(ctx, [[-65, -42], [-54, -51], [47, -51], [61, -41], [58, -36], [-63, -36]], m.roof);
  line(ctx, [[-63, -36], [58, -36]], m.light, 2);
  ctx.fillStyle = m.dark; ctx.fillRect(-37, -36, 69, 36);
  ctx.fillStyle = '#3c5148'; ctx.fillRect(-31, -32, 57, 32);
  for (let y = -31; y < -1; y += 7) line(ctx, [[-30, y], [25, y]], m.shade, 2);
  polygon(ctx, [[-76, 0], [-65, -29], [-46, -29], [-39, 0]], m.shade);
  polygon(ctx, [[36, 0], [43, -29], [62, -29], [76, 0]], m.shade);
  for (const x of [-40, 33]) {
    ctx.fillStyle = '#b4a57a'; ctx.fillRect(x, -15, 4, 15);
    line(ctx, [[x, -5], [x + 4, -9]], m.dark, 3);
  }
  ctx.fillStyle = m.cloth; ctx.fillRect(-13, -44, 22, 3);
  // The thin mast leaves air around it; a solid tower would erase this era's low profile.
  line(ctx, [[-9, -52], [-9, -85]], m.dark, 3);
  line(ctx, [[-22, -51], [-9, -79], [3, -51]], m.shade, 2);
  ctx.save(); ctx.translate(-9, -87); ctx.rotate(-0.3 + Math.sin(time * 0.8) * 0.16);
  ctx.beginPath(); ctx.moveTo(-17, -10); ctx.quadraticCurveTo(-11, 17, 17, -1); ctx.closePath(); ctx.fillStyle = m.light; ctx.fill();
  line(ctx, [[-17, -10], [17, -1]], m.shade, 2);
  line(ctx, [[0, 2], [7, -13], [-6, -7]], m.body, 1.5); ctx.restore();
  line(ctx, [[-61, -41], [-61, -101]], m.dark, 1.5);
  oval(ctx, -61, -102, 1.8, 1.8, m.cloth);
}

function reactorArm(ctx, mount, index, m) {
  const { x, y } = mount, side = x < 0 ? -1 : 1;
  const root = side * (index === 3 ? 49 : 56);
  ctx.beginPath(); ctx.moveTo(root - 12, 0);
  ctx.bezierCurveTo(root + side * 13 - 12, y * 0.3, side * 73 - 12, y * 0.68, x - 15, y);
  ctx.lineTo(x + 15, y);
  ctx.bezierCurveTo(side * 73 + 12, y * 0.68, root + side * 13 + 12, y * 0.3, root + 12, 0);
  ctx.closePath(); ctx.fillStyle = m.body; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 7, y + 8); ctx.lineTo(x + 15, y);
  ctx.bezierCurveTo(side * 73 + 12, y * 0.68, root + side * 13 + 12, y * 0.3, root + 12, 0);
  ctx.lineTo(root + 4, 0);
  ctx.bezierCurveTo(root + side * 13 + 4, y * 0.3, side * 73 + 4, y * 0.68, x + 7, y + 8);
  ctx.closePath(); ctx.fillStyle = m.shade; ctx.fill();
  polygon(ctx, [[x - 15, y], [x + 15, y], [x + 10, y + 6], [x - 16, y + 6]], m.light);
  line(ctx, [[x - 9, y + 16], [x - 8, y + 31]], m.energy, 1.5);
}
function future(ctx, mounts, m, time) {
  // Open space, curved wings and a suspended core replace a walled gatehouse.
  polygon(ctx, [[-76, 0], [-63, -22], [-43, -29], [-28, 0]], m.dark);
  polygon(ctx, [[28, 0], [42, -29], [63, -22], [76, 0]], m.dark);
  for (let i = mounts.length - 1; i >= 0; i--) reactorArm(ctx, mounts[i], i, m);
  polygon(ctx, [[-48, 0], [-31, -44], [-20, -49], [-9, -32], [17, -37], [39, -17], [49, 0]], m.shade);
  // The reactor frame has a true aperture: even its monochrome silhouette is unique.
  ctx.beginPath(); ctx.ellipse(-10, -89, 34, 43, -0.12, 0, Math.PI * 2);
  ctx.ellipse(-10, -89, 25, 33, -0.12, 0, Math.PI * 2);
  ctx.fillStyle = m.body; ctx.fill('evenodd');
  ctx.beginPath(); ctx.ellipse(-10, -89, 31, 40, -0.12, -2.7, -0.8);
  ctx.strokeStyle = m.light; ctx.lineWidth = 3; ctx.stroke();
  // Two struts meet the frame without filling its central negative space.
  polygon(ctx, [[-49, 0], [-37, -45], [-32, -61], [-23, -53], [-27, -31], [-31, 0]], m.body);
  polygon(ctx, [[16, -56], [24, -61], [38, -30], [49, 0], [32, 0], [24, -31]], m.body);
  const lift = Math.sin(time * 1.5) * 1.7, pulse = 0.6 + Math.sin(time * 1.8) * 0.15;
  ctx.save(); ctx.translate(-10, -89 + lift);
  polygon(ctx, [[0, -22], [12, -5], [8, 15], [0, 22], [-11, 5], [-8, -15]], m.dark);
  ctx.globalAlpha = m.damaged ? pulse * 0.55 : pulse;
  polygon(ctx, [[0, -18], [7, -4], [0, 17], [-7, 3]], m.energy);
  polygon(ctx, [[0, -18], [0, 17], [-7, 3]], m.light); ctx.restore();
  ctx.save(); ctx.globalAlpha = pulse;
  for (const angle of [time * 0.22, time * 0.22 + Math.PI]) {
    ctx.beginPath(); ctx.ellipse(-10, -89, 28, 36, -0.12, angle, angle + 0.65);
    ctx.strokeStyle = m.energy; ctx.lineWidth = 1.4; ctx.stroke();
  }
  ctx.restore();
  polygon(ctx, [[-22, 0], [-14, -23], [11, -23], [26, 0]], m.dark);
  polygon(ctx, [[-13, -20], [-4, -20], [-8, -4], [-19, 0]], m.body);
  polygon(ctx, [[1, -20], [9, -20], [21, 0], [6, -4]], m.body);
  line(ctx, [[-2, -18], [-2, -3]], m.energy, 1.4);
}

function damage(ctx, age, m) {
  if (age <= 3) {
    line(ctx, [[34, -41], [26, -30], [31, -22], [22, -10]], m.dark, 1.8);
    if (age === 2) line(ctx, [[-41, -120], [-35, -110], [-41, -96]], m.dark, 1.5);
    if (age === 3) polygon(ctx, [[-35, -91], [-29, -102], [-20, -92]], m.dark);
    polygon(ctx, [[39, 0], [44, -9], [52, -7], [56, 0]], m.shade);
  } else if (age === 4) {
    polygon(ctx, [[-23, -34], [-10, -26], [-13, -10], [-26, -6]], INK);
    line(ctx, [[-56, -40], [-47, -32], [-51, -19]], m.dark, 2);
  } else {
    line(ctx, [[38, -43], [43, -34], [36, -29]], m.dark, 2);
    polygon(ctx, [[-21, 0], [-13, -7], [-6, -1]], m.light);
  }
}
function ruins(ctx, age, m) {
  if (age === 1) {
    polygon(ctx, [[-74, 0], [-60, -20], [-37, -11], [-14, -34], [14, -20], [28, -27], [68, 0]], m.shade);
    polygon(ctx, [[-67, 0], [-46, -21], [-22, -4]], m.roof);
    polygon(ctx, [[18, 0], [22, -21], [33, -33], [28, -17], [27, 0]], m.light);
  } else if (age === 2) {
    polygon(ctx, [[-60, 0], [-56, -53], [-44, -53], [-44, -43], [-33, -43], [-29, -27], [-39, 0]], m.body);
    polygon(ctx, [[-32, 0], [-21, -21], [6, -12], [19, -33], [34, -25], [60, 0]], m.shade);
    polygon(ctx, [[-18, -8], [3, -30], [25, -10]], m.roof);
  } else if (age === 3) {
    polygon(ctx, [[-76, 0], [-58, -27], [-29, -16], [-10, -26], [21, -12], [48, -28], [75, 0]], m.body);
    polygon(ctx, [[-39, -15], [-17, -35], [9, -25], [19, -7]], m.roof);
    line(ctx, [[-55, -23], [-30, -11]], m.light, 4);
  } else if (age === 4) {
    polygon(ctx, [[-74, 0], [-64, -24], [-29, -17], [18, -21], [66, -16], [75, 0]], m.shade);
    polygon(ctx, [[-58, -22], [-49, -34], [50, -13], [59, -2]], m.body);
    line(ctx, [[-41, -31], [-32, -48], [-20, -35]], m.dark, 2);
  } else {
    polygon(ctx, [[-72, 0], [-56, -18], [-35, -5], [19, -13], [53, -20], [75, 0]], m.dark);
    ctx.beginPath(); ctx.ellipse(-9, -8, 31, 22, -0.3, Math.PI, Math.PI * 1.83); ctx.strokeStyle = m.body; ctx.lineWidth = 8; ctx.stroke();
    polygon(ctx, [[25, 0], [37, -31], [44, -24], [42, -3]], m.shade);
    polygon(ctx, [[-5, -1], [2, -12], [12, -3]], m.light);
  }
}
const MODELS = [null, tribal, medieval, renaissance, modern, future];
export function drawBase(ctx, base, age, time = 0, scale = 1, slots = 1) {
  const palette = ERA_MATERIALS[age], enemy = base.team === 'enemy';
  const m = { ...palette, cloth: enemy ? '#bc9675' : '#7fa68b', energy: enemy ? '#dec291' : '#b0d5bd', damaged: base.hp < base.maxHp * 0.5 };
  if (base.hitFlash > 0) { m.body = '#d4d6b7'; m.light = '#e1dfbd'; }
  const mounts = BASE_MOUNTS[age].slice(0, slots);
  ctx.save(); ctx.translate(base.x, 0); ctx.scale(scale * (enemy ? -1 : 1), scale);
  ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel';
  oval(ctx, 0, 1, 74, 5, '#14231e55');
  if (base.hp > 0) {
    MODELS[age](ctx, mounts, m, time);
    for (const { x, y } of mounts) oval(ctx, x, y + 1, 12, 1.3, m.dark);
    if (m.damaged) damage(ctx, age, m);
  } else ruins(ctx, age, m);
  ctx.restore();
}
