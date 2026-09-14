import { RULES, UNITS, AGES, ABILITIES, getTurretPosition, getAbilityRadius, getAbilityImpactX } from './game.js';

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
    } else if (turret.type === 'bombard') {
      ctx.fillStyle = '#819486'; ctx.fillRect(-15, -23, 40, 15);
      ctx.fillStyle = '#273c32'; ctx.fillRect(20, -24, 7, 17);
      for (const x of [-10, 12]) { ctx.fillStyle = '#bdc1a9'; ctx.beginPath(); ctx.arc(x, -4, 6, 0, Math.PI * 2); ctx.fill(); }
    } else if (turret.type === 'smallCannon') {
      line(ctx, [[-13, -14], [27, -19]], '#c4ac71', 10);
      line(ctx, [[23, -23], [24, -15]], '#493f32', 4);
      for (const x of [-10, 10]) { ctx.fillStyle = '#b29b6b'; ctx.beginPath(); ctx.arc(x, -5, 7, 0, Math.PI * 2); ctx.fill(); }
    } else if (turret.type === 'organGun') {
      polygon(ctx, [[-16, -6], [-12, -27], [19, -27], [23, -7]], '#715c40');
      for (let i = 0; i < 4; i++) line(ctx, [[-8, -8 - i * 6], [27, -10 - i * 6]], '#d0b17a', 3);
    } else if (turret.type === 'mortar') {
      line(ctx, [[-12, -2], [-8, -16], [12, -2]], '#b09c73', 4);
      line(ctx, [[-7, -10], [13, -32]], '#9da698', 14);
      line(ctx, [[7, -37], [19, -27]], '#3b4339', 4);
    } else if (turret.type === 'machineGun') {
      polygon(ctx, [[-13, -4], [-10, -22], [12, -22], [17, -4]], '#617b6c');
      line(ctx, [[4, -20], [30, -20]], '#bbc4af', 5);
      ctx.fillStyle = '#c2ad71'; ctx.fillRect(-14, -19, 7, 13);
      for (let x = 15; x < 27; x += 4) line(ctx, [[x, -23], [x, -18]], '#445b50', 2);
    } else if (turret.type === 'doubleCannon') {
      ctx.fillStyle = '#749188'; ctx.fillRect(-17, -23, 26, 18);
      for (const y of [-24, -12]) line(ctx, [[0, y], [31, y]], '#a5b7aa', 6);
    } else if (turret.type === 'rocket') {
      line(ctx, [[-9, -2], [2, -18]], '#70867d', 7);
      ctx.save(); ctx.translate(0, -22); ctx.rotate(-0.5);
      ctx.fillStyle = '#586e60'; ctx.fillRect(-15, -12, 37, 22);
      for (const y of [-7, 4]) {
        line(ctx, [[-11, y], [25, y]], '#c4c9aa', 5);
        polygon(ctx, [[25, y - 4], [32, y], [25, y + 4]], '#e7b274');
      }
      ctx.restore();
    } else if (turret.type === 'titanium') {
      polygon(ctx, [[-17, -2], [-12, -24], [10, -28], [18, -7]], '#8faeab');
      for (const y of [-23, -15]) line(ctx, [[0, y], [29, y]], '#b4ddce', 4);
      ctx.fillStyle = '#75e1d7'; ctx.fillRect(-7, -20, 6, 11);
    } else if (turret.type === 'laser') {
      polygon(ctx, [[-15, -4], [-10, -22], [9, -26], [17, -5]], '#688c93');
      line(ctx, [[-5, -21], [27, -21]], '#a5c4c0', 9);
      line(ctx, [[-1, -21], [29, -21]], '#b6fff1', 3);
      ctx.strokeStyle = '#76d8cf'; ctx.lineWidth = 2; ctx.strokeRect(10, -29, 8, 16);
    } else if (turret.type === 'ion') {
      polygon(ctx, [[-16, -3], [-18, -19], [-7, -33], [10, -32], [21, -18], [16, -3]], '#577a89');
      ctx.strokeStyle = '#a6d2cd'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(1, -20, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#a0ffe7'; ctx.beginPath(); ctx.arc(1, -20, 6, 0, Math.PI * 2); ctx.fill();
    }
    if (turret.flash > 0) polygon(ctx, [[25, -23], [40, -17], [25, -10]], '#ffdfa0');
    ctx.restore();
  }
}

function drawAdvancedUnit(ctx, unit, time, scale, reducedMotion) {
  const stats = UNITS[unit.type];
  const colors = PALETTES[unit.team];
  const future = stats.age === 5;
  const glow = unit.team === 'player' ? '#9ff8e4' : '#ffd094';
  const gait = !reducedMotion && unit.moving ? Math.sin(time * 12 + unit.id) : 0;
  const recoil = unit.attackAnimation > 0 ? Math.sin(unit.attackAnimation * Math.PI / 0.25) * 3 : 0;
  const heavy = stats.role === 'heavy';
  ctx.save(); ctx.translate(unit.x, stats.lane === 'back' ? -7 : 0); ctx.scale(scale, scale);
  ctx.fillStyle = '#101f1b80'; ctx.beginPath(); ctx.ellipse(0, 1, heavy ? 29 : 16, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.scale(unit.team === 'player' ? 1 : -1, 1);
  const metal = unit.hitFlash > 0 ? '#fff3ce' : future ? '#92b6b5' : colors.main;
  if (unit.type === 'cannoneer') {
    ctx.fillStyle = '#c3b394'; ctx.fillRect(-27, -36, 11, 22);
    ctx.fillStyle = colors.dark; ctx.fillRect(-29, -48, 16, 6);
    line(ctx, [[-25, -13], [-27 - gait * 3, 0]], '#a49d80', 4);
    line(ctx, [[-17, -13], [-14 + gait * 3, 0]], '#c7bc96', 4);
    line(ctx, [[-23, -27], [-6, -16]], '#d3bf98', 4);
    line(ctx, [[-10 - recoil, -18], [31 - recoil, -28]], '#b8a273', 13);
    line(ctx, [[27 - recoil, -35], [33 - recoil, -22]], '#504b3a', 3);
    for (const x of [-5, 16]) {
      ctx.fillStyle = '#826a44'; ctx.beginPath(); ctx.arc(x, -9, 10, 0, Math.PI * 2); ctx.fill();
      line(ctx, [[x - 7, -9], [x + 7, -9]], '#d2b882', 2); line(ctx, [[x, -16], [x, -2]], '#d2b882', 2);
    }
  } else if (unit.type === 'tank') {
    ctx.fillStyle = '#283d35'; ctx.fillRect(-28, -13, 55, 13);
    for (let x = -20; x <= 20; x += 10) { ctx.fillStyle = '#8c9a80'; ctx.beginPath(); ctx.arc(x, -6, 4, 0, Math.PI * 2); ctx.fill(); }
    polygon(ctx, [[-29, -15], [-20, -28], [16, -28], [30, -15]], metal);
    polygon(ctx, [[-14, -29], [-8, -41], [14, -41], [21, -29]], colors.dark);
    line(ctx, [[7 - recoil, -36], [43 - recoil, -36]], '#a4b39c', 7);
    ctx.fillStyle = colors.light; ctx.fillRect(-16, -22, 10, 5);
  } else if (unit.type === 'warMachine') {
    for (const side of [-1, 1]) {
      line(ctx, [[side * 10, -29], [side * 18 + gait * side * 3, -14], [side * 21, -3]], '#88aca9', 9);
      line(ctx, [[side * 14, -50], [side * 26, -33]], '#456b75', 10);
    }
    polygon(ctx, [[-21, -55], [-13, -67], [15, -65], [23, -46], [13, -27], [-13, -27]], metal);
    ctx.fillStyle = '#244c58'; ctx.fillRect(-12, -57, 25, 12);
    line(ctx, [[-8, -52], [11, -52]], glow, 4);
    line(ctx, [[-4 - recoil, -36], [35 - recoil, -36]], '#668b94', 13);
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(34 - recoil, -36, 5, 0, Math.PI * 2); ctx.fill();
  } else {
    for (const side of [-1, 1]) line(ctx, [[side * 5, -17], [side * 5 + side * gait * 5, 0]], stats.age === 3 ? '#b8ad88' : '#728f80', 5);
    ctx.fillStyle = metal; ctx.fillRect(-10, -37, 20, 23);
    ctx.fillStyle = colors.dark; ctx.fillRect(-10, -22, 20, 5);
    ctx.fillStyle = '#d1bc96'; ctx.fillRect(-7, -50, 15, 13);
    if (stats.age === 3) {
      polygon(ctx, [[-14, -49], [-8, -56], [0, -52], [9, -56], [15, -49]], colors.dark);
      polygon(ctx, [[-5, -54], [-11, -63], [-2, -59], [1, -54]], '#e1c392');
      line(ctx, [[-6, -35], [6, -17]], '#d2c39b', 2);
    } else {
      ctx.fillStyle = colors.dark; ctx.fillRect(-10, -55, 21, 10);
      ctx.fillStyle = future ? glow : '#b7c5a7'; ctx.fillRect(0, -49, 11, 4);
      if (future) { line(ctx, [[-7, -35], [-7, -24]], glow, 2); ctx.fillStyle = '#739aa4'; ctx.fillRect(-14, -39, 6, 9); }
    }
    const melee = stats.role === 'melee';
    line(ctx, [[4, -33], [15 - recoil, -27]], '#c9c09c', 5);
    if (melee) {
      ctx.save(); ctx.translate(15, -27); ctx.rotate(-0.2 + recoil * 0.25);
      line(ctx, [[-3, 5], [8, -29]], future ? glow : '#d5d9c1', future ? 5 : 3);
      line(ctx, [[-6, -1], [6, 3]], '#b89a66', 3); ctx.restore();
      if (stats.age === 4) { ctx.fillStyle = colors.dark; ctx.fillRect(-14, -32, 7, 22); }
    } else {
      line(ctx, [[-1 - recoil, -27], [34 - recoil, -27]], future ? '#89b8be' : '#b09e78', future ? 7 : 5);
      line(ctx, [[18 - recoil, -28], [38 - recoil, -28]], future ? glow : '#ced0b7', 2);
      if (stats.age === 4) { ctx.fillStyle = '#263d33'; ctx.fillRect(9, -26, 6, 10); }
    }
  }
  if (stats.projectile && unit.attackAnimation > 0 && !reducedMotion) {
    polygon(ctx, [[35, -35], [49, -28], [35, -22]], future ? '#b4fff0' : '#f5d697');
  }
  ctx.restore();
  if (unit.hp < stats.health) {
    const y = unit.type === 'warMachine' ? -77 : heavy ? -59 : -68;
    ctx.fillStyle = '#182920'; ctx.fillRect(-16, y, 32, 4);
    ctx.fillStyle = colors.light; ctx.fillRect(-16, y, 32 * unit.hp / stats.health, 4);
  }
  ctx.restore();
}

function drawUnit(ctx, unit, time, scale, reducedMotion) {
  if (UNITS[unit.type].age >= 3) { drawAdvancedUnit(ctx, unit, time, scale, reducedMotion); return; }
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
  const cannon = ['cannon', 'stone', 'firepot', 'shell', 'plasma-orb'].includes(shot.kind);
  const fromY = shot.fromY * scale;
  const y = fromY * (1 - progress) - 30 * scale * progress - Math.sin(progress * Math.PI) * (cannon ? 45 : 18);
  if (['plasma', 'plasma-orb', 'laser'].includes(shot.kind)) {
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
