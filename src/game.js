// Pure simulation. Timings are seconds; positions are in battlefield coordinates.
export const UNITS = Object.freeze({
  melee: Object.freeze({ name: '棍棒人', age: 1, role: 'melee', cost: 30, trainTime: 1.6, health: 70, damage: 12, armor: 0, speed: 62, range: 32, attackInterval: 0.8, bounty: 10, experience: 20, lane: 'front', description: '廉价前排 · 重棍挥击', attackDuration: 0.42, height: 61 }),
  archer: Object.freeze({ name: '弹弓手', age: 1, role: 'archer', projectile: 'sling', cost: 45, trainTime: 2.4, health: 42, damage: 14, armor: 0, speed: 54, range: 190, attackInterval: 1.2, bounty: 15, experience: 28, lane: 'back', description: '脆弱后排 · 弧线石弹', attackDuration: 0.38, muzzleX: 25, muzzleY: -43, height: 57 }),
  heavy: Object.freeze({ name: '恐龙骑兵', age: 1, role: 'heavy', cost: 85, trainTime: 4, health: 170, damage: 26, armor: 3, speed: 36, range: 60, attackInterval: 1.3, bounty: 25, experience: 45, lane: 'front', description: '巨兽前排 · 咬击两人，副目标 45% 伤害', cleaveRadius: 60, cleaveFactor: 0.45, footprint: 42, attackDuration: 0.6, height: 89 }),
  swordsman: Object.freeze({ name: '盾剑士', age: 2, role: 'melee', cost: 50, trainTime: 2, health: 115, damage: 20, armor: 1, speed: 66, range: 34, attackInterval: 0.85, bounty: 17, experience: 30, lane: 'front', description: '盾牌防线 · 单体弹药减伤 30%，完全穿甲除外', rangedReduction: 0.3, attackDuration: 0.4, height: 70 }),
  crossbow: Object.freeze({ name: '长弓手', age: 2, role: 'archer', projectile: 'arrow', cost: 75, trainTime: 3, health: 65, damage: 30, armor: 0, speed: 50, range: 230, attackInterval: 1.5, bounty: 24, experience: 42, lane: 'back', description: '长弓压制 · 射程长，需前排保护', attackDuration: 0.4, muzzleX: 29, muzzleY: -42, height: 66 }),
  knight: Object.freeze({ name: '重甲骑士', age: 2, role: 'heavy', cost: 130, trainTime: 4.8, health: 270, damage: 42, armor: 5, speed: 68, range: 72, attackInterval: 1.4, bounty: 40, experience: 65, lane: 'front', description: '骑马冲锋 · 连续前进 80 距离后首击 +32', chargeDistance: 80, chargeDamage: 32, footprint: 44, attackDuration: 0.5, height: 105 }),
  duelist: Object.freeze({ name: '决斗士', age: 3, role: 'melee', cost: 80, trainTime: 2.2, health: 205, damage: 29, armor: 3, speed: 72, range: 46, attackInterval: 0.65, bounty: 28, experience: 46, lane: 'front', description: '迅捷刺击 · 忽略 3 点护甲', armorPierce: 3, attackDuration: 0.3, height: 72 }),
  musketeer: Object.freeze({ name: '火枪手', age: 3, role: 'archer', projectile: 'bullet', cost: 115, trainTime: 3.2, health: 110, damage: 60, armor: 1, speed: 48, range: 255, attackInterval: 1.7, bounty: 40, experience: 65, lane: 'back', description: '火绳枪 · 单发穿甲，克制重装与盾牌', ignoreArmor: true, attackDuration: 0.48, muzzleX: 50, muzzleY: -46, height: 71 }),
  cannoneer: Object.freeze({ name: '野战炮组', age: 3, role: 'heavy', projectile: 'cannon', splash: 55, cost: 210, trainTime: 5.2, health: 380, damage: 95, armor: 7, speed: 30, range: 185, baseRange: 360, attackInterval: 2.1, bounty: 70, experience: 110, lane: 'front', description: '轮式火炮 · 远距攻城 / 55 范围爆炸', footprint: 38, attackDuration: 0.65, muzzleX: 51, muzzleY: -35, height: 61 }),
  commando: Object.freeze({ name: '刺刀突击兵', age: 4, role: 'melee', cost: 130, trainTime: 2.4, health: 340, damage: 56, armor: 6, speed: 76, range: 58, attackInterval: 0.65, bounty: 45, experience: 80, lane: 'front', description: '刺刀突击 · 快速接敌，近距连续刺杀', attackDuration: 0.34, height: 65 }),
  rifleman: Object.freeze({ name: '自动步枪兵', age: 4, role: 'archer', projectile: 'bullet', cost: 190, trainTime: 3.4, health: 185, damage: 30, armor: 3, speed: 54, range: 270, attackInterval: 1.1, bounty: 65, experience: 110, lane: 'back', description: '三连点射 · 每轮 3 发，每发 30 伤害', burst: 3, burstInterval: 0.12, attackDuration: 0.16, muzzleX: 45, muzzleY: -34, height: 61 }),
  tank: Object.freeze({ name: '主战坦克', age: 4, role: 'heavy', projectile: 'shell', splash: 70, cost: 350, trainTime: 5.6, health: 720, damage: 145, armor: 14, speed: 26, range: 200, baseRange: 420, attackInterval: 1.9, bounty: 120, experience: 180, lane: 'front', description: '履带装甲 · 远距攻城 / 70 范围炮击', footprint: 47, attackDuration: 0.6, muzzleX: 67, muzzleY: -44, height: 63 }),
  blade: Object.freeze({ name: '光刃战士', age: 5, role: 'melee', ignoreArmor: true, cost: 220, trainTime: 2.6, health: 550, damage: 90, armor: 10, speed: 82, range: 40, attackInterval: 0.6, bounty: 70, experience: 140, lane: 'front', description: '光刃突进 · 近战完全无视护甲', attackDuration: 0.3, height: 73 }),
  blaster: Object.freeze({ name: '等离子射手', age: 5, role: 'archer', projectile: 'plasma', cost: 300, trainTime: 3.6, health: 300, damage: 85, armor: 5, speed: 56, range: 300, attackInterval: 0.65, bounty: 100, experience: 180, lane: 'back', description: '能量火力 · 300 射程 / 忽略 8 点护甲', armorPierce: 8, attackDuration: 0.38, muzzleX: 44, muzzleY: -43, height: 74 }),
  warMachine: Object.freeze({ name: '悬浮战争机器', age: 5, role: 'heavy', projectile: 'plasma-orb', splash: 90, cost: 580, trainTime: 6, health: 1200, damage: 235, armor: 22, speed: 23, range: 220, baseRange: 500, attackInterval: 1.8, bounty: 200, experience: 300, lane: 'front', description: '悬浮重炮 · 远距攻城 / 90 范围能量爆破', footprint: 48, attackDuration: 0.6, muzzleX: 55, muzzleY: -46, height: 74 }),
});

export const RULES = Object.freeze({
  width: 1280, height: 480,
  baseHealth: 600, baseHalfWidth: 54, playerBaseX: 108, enemyBaseX: 1172,
  startingGold: 180, goldPerSecond: 7,
  unitSpacing: 30, armyLimit: 16, queueLimit: 5,
  aiFirstDecision: 2.4, aiDecisionInterval: 1.8,
  casualtyExperienceRate: 0.75,
  turretExpansionCosts: Object.freeze([100, 160, 240]), maxTurretSlots: 4,
  fixedStep: 1 / 60,
});

export const TURRETS = Object.freeze({
  stone: Object.freeze({ name: '投石塔', age: 1, cost: 120, damage: 24, interval: 1.5, range: 290, projectile: 'stone', splash: 0, description: '单发重击' }),
  bone: Object.freeze({ name: '骨矛塔', age: 1, cost: 100, damage: 12, interval: 0.65, range: 245, projectile: 'bone', splash: 0, description: '近程速射' }),
  firepot: Object.freeze({ name: '火陶塔', age: 1, cost: 160, damage: 22, interval: 2.4, range: 260, projectile: 'firepot', splash: 65, description: '范围爆炸' }),
  ballista: Object.freeze({ name: '重弩塔', age: 2, cost: 190, damage: 48, interval: 1.6, range: 350, projectile: 'ballista', splash: 0, ignoreArmor: true, description: '远程穿甲' }),
  repeater: Object.freeze({ name: '连弩塔', age: 2, cost: 170, damage: 18, interval: 0.55, range: 290, projectile: 'bolt', splash: 0, description: '密集速射' }),
  bombard: Object.freeze({ name: '轰击炮塔', age: 2, cost: 240, damage: 55, interval: 2.6, range: 325, projectile: 'cannon', splash: 90, description: '重型范围炮击' }),
  smallCannon: Object.freeze({ name: '轻型加农炮', age: 3, cost: 260, damage: 70, interval: 1.2, range: 350, projectile: 'cannon', splash: 0, description: '精准直射' }),
  organGun: Object.freeze({ name: '风琴炮', age: 3, cost: 300, damage: 30, interval: 0.38, range: 310, projectile: 'bullet', splash: 0, description: '多管速射' }),
  mortar: Object.freeze({ name: '爆破迫击炮', age: 3, cost: 380, damage: 110, interval: 2.5, range: 370, projectile: 'shell', splash: 100, description: '大范围爆破' }),
  machineGun: Object.freeze({ name: '重机枪塔', age: 4, cost: 420, damage: 38, interval: 0.25, range: 340, projectile: 'bullet', splash: 0, description: '持续火力' }),
  doubleCannon: Object.freeze({ name: '双联炮塔', age: 4, cost: 520, damage: 130, interval: 1.1, range: 390, projectile: 'shell', splash: 0, ignoreArmor: true, description: '重型穿甲' }),
  rocket: Object.freeze({ name: '火箭发射塔', age: 4, cost: 640, damage: 180, interval: 2.3, range: 400, projectile: 'rocket', splash: 110, description: '范围轰炸' }),
  titanium: Object.freeze({ name: '钛金速射塔', age: 5, cost: 720, damage: 65, interval: 0.22, range: 370, projectile: 'plasma', splash: 0, description: '高速能量弹' }),
  laser: Object.freeze({ name: '激光炮塔', age: 5, cost: 900, damage: 170, interval: 0.85, range: 430, projectile: 'laser', splash: 0, ignoreArmor: true, description: '远程穿甲光束' }),
  ion: Object.freeze({ name: '离子炮塔', age: 5, cost: 1200, damage: 310, interval: 2.2, range: 450, projectile: 'plasma-orb', splash: 130, description: '离子范围爆发' }),
});

export const ABILITIES = Object.freeze({
  meteor: Object.freeze({ name: '陨星天降', cooldown: 40, delay: 0.8, radius: 140, damage: 110, baseDamage: 40, waves: 1, waveInterval: 0, ignoreArmor: true, description: '单次范围轰击 · 无视护甲' }),
  volley: Object.freeze({ name: '箭雨齐射', cooldown: 45, delay: 0.45, radius: 210, damage: 32, baseDamage: 12, waves: 4, waveInterval: 0.35, ignoreArmor: false, description: '四波箭雨 · 大范围压制' }),
  renewal: Object.freeze({ name: '复苏之光', icon: '✚', targeting: 'allies', cooldown: 50, duration: 8, healing: 18, description: '全场友军持续回血' }),
  airstrike: Object.freeze({ name: '轰炸空袭', icon: '✈', cooldown: 50, delay: 0.85, radius: 95, sweep: 140, damage: 150, baseDamage: 45, waves: 3, waveInterval: 0.4, ignoreArmor: false, description: '三枚炸弹 · 从左向右轰炸' }),
  orbital: Object.freeze({ name: '轨道打击', icon: '⊕', cooldown: 55, delay: 1.25, radius: 180, damage: 450, baseDamage: 140, waves: 1, waveInterval: 0, ignoreArmor: true, description: '轨道光束 · 无视护甲' }),
});

export const AGES = Object.freeze({
  1: Object.freeze({ name: '原始时代', shortName: '原始', numeral: 'I', units: Object.freeze(['melee', 'archer', 'heavy']), turrets: Object.freeze(['stone', 'bone', 'firepot']), ability: 'meteor', experienceRequired: 0, baseHealth: RULES.baseHealth, income: 7, turretY: -100, unitIcons: Object.freeze(['⚔', '➶', '⬟']), turretIcons: Object.freeze(['◈', '➶', '♨']) }),
  2: Object.freeze({ name: '中世纪', shortName: '中世纪', numeral: 'II', units: Object.freeze(['swordsman', 'crossbow', 'knight']), turrets: Object.freeze(['ballista', 'repeater', 'bombard']), ability: 'volley', experienceRequired: 160, baseHealth: 900, income: 10, turretY: -128, unitIcons: Object.freeze(['⚔', '⌁', '♜']), turretIcons: Object.freeze(['⌖', '⋙', '●']) }),
  3: Object.freeze({ name: '文艺复兴时代', shortName: '文艺复兴', numeral: 'III', units: Object.freeze(['duelist', 'musketeer', 'cannoneer']), turrets: Object.freeze(['smallCannon', 'organGun', 'mortar']), ability: 'renewal', experienceRequired: 480, baseHealth: 1500, income: 16, turretY: -116, unitIcons: Object.freeze(['⚔', '⌐', '◉']), turretIcons: Object.freeze(['●', '⋙', '◒']) }),
  4: Object.freeze({ name: '现代时代', shortName: '现代', numeral: 'IV', units: Object.freeze(['commando', 'rifleman', 'tank']), turrets: Object.freeze(['machineGun', 'doubleCannon', 'rocket']), ability: 'airstrike', experienceRequired: 1100, baseHealth: 2400, income: 24, turretY: -106, unitIcons: Object.freeze(['⚔', '⌁', '▰']), turretIcons: Object.freeze(['⋙', '═', '➚']) }),
  5: Object.freeze({ name: '未来时代', shortName: '未来', numeral: 'V', units: Object.freeze(['blade', 'blaster', 'warMachine']), turrets: Object.freeze(['titanium', 'laser', 'ion']), ability: 'orbital', experienceRequired: 2200, baseHealth: 3800, income: 36, turretY: -130, unitIcons: Object.freeze(['ϟ', '⊙', '♜']), turretIcons: Object.freeze(['⊙', 'ϟ', '⊕']) }),
});

const TEAMS = ['player', 'enemy'];
const EPSILON = 0.000001;
const otherTeam = team => team === 'player' ? 'enemy' : 'player';
const validTeam = team => TEAMS.includes(team);
const validType = type => Object.hasOwn(UNITS, type);
const canAfford = (gold, cost) => gold + EPSILON >= cost;

export function createGame() {
  return {
    status: 'playing', elapsed: 0,
    bases: {
      player: { team: 'player', x: RULES.playerBaseX, hp: RULES.baseHealth, maxHp: RULES.baseHealth, hitFlash: 0 },
      enemy: { team: 'enemy', x: RULES.enemyBaseX, hp: RULES.baseHealth, maxHp: RULES.baseHealth, hitFlash: 0 },
    },
    ages: { player: 1, enemy: 1 },
    experience: { player: 0, enemy: 0 },
    gold: { player: RULES.startingGold, enemy: RULES.startingGold },
    queues: { player: [], enemy: [] },
    turrets: { player: [null], enemy: [null] },
    units: [], projectiles: [], effects: [],
    ability: null, abilityCooldown: 0,
    nextUnitId: 1, nextOrderId: 1,
    ai: { enabled: true, cooldown: RULES.aiFirstDecision, orders: 0, strategy: 'balanced', waves: 0 },
  };
}

export function getEvolutionState(game, team = 'player') {
  if (!validTeam(team)) return 'invalid';
  if (game.status !== 'playing') return 'finished';
  const nextAge = AGES[game.ages[team] + 1];
  if (!nextAge) return 'max-age';
  return game.experience[team] >= nextAge.experienceRequired ? 'ready' : 'experience';
}

export function evolve(game, team = 'player') {
  if (getEvolutionState(game, team) !== 'ready') return false;
  const nextAge = AGES[game.ages[team] + 1];
  const base = game.bases[team];
  // Keep damage already taken. Evolution adds capacity, not a full heal.
  base.hp += nextAge.baseHealth - base.maxHp;
  base.maxHp = nextAge.baseHealth;
  game.ages[team]++;
  game.effects.push({ kind: 'evolve', x: base.x, team, life: 1.2, duration: 1.2 });
  return true;
}

export function getRecruitState(game, type = 'melee', team = 'player') {
  if (!validTeam(team) || !validType(type)) return 'invalid';
  if (game.status !== 'playing') return 'finished';
  if (UNITS[type].age > game.ages[team]) return 'locked';
  if (UNITS[type].age < game.ages[team]) return 'outdated';
  if (game.queues[team].length >= RULES.queueLimit) return 'queue-full';
  const reserved = game.units.filter(unit => unit.team === team).length + game.queues[team].length;
  if (reserved >= RULES.armyLimit) return 'army-full';
  if (!canAfford(game.gold[team], UNITS[type].cost)) return 'gold';
  return 'ready';
}

export function recruit(game, type = 'melee', team = 'player') {
  if (getRecruitState(game, type, team) !== 'ready') return false;
  const stats = UNITS[type];
  game.gold[team] = Math.max(0, game.gold[team] - stats.cost);
  game.queues[team].push({ id: game.nextOrderId++, type, remaining: stats.trainTime });
  return true;
}

export function cancelTraining(game, orderId, team = 'player') {
  if (game.status !== 'playing' || !validTeam(team)) return false;
  const index = game.queues[team].findIndex(order => order.id === orderId);
  if (index < 0) return false;
  const [order] = game.queues[team].splice(index, 1);
  game.gold[team] += UNITS[order.type].cost;
  return true;
}

export function getTurretState(game, team = 'player', type = null, slot = null) {
  if (!validTeam(team)) return 'invalid';
  type ??= AGES[game.ages[team]].turrets[0];
  if (!Object.hasOwn(TURRETS, type)) return 'invalid';
  if (game.status !== 'playing') return 'finished';
  if (TURRETS[type].age > game.ages[team]) return 'locked';
  if (TURRETS[type].age < game.ages[team]) return 'outdated';
  if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot >= RULES.maxTurretSlots)) return 'invalid';
  if (slot === null) slot = game.turrets[team].indexOf(null);
  if (slot === -1) return 'full';
  if (slot >= game.turrets[team].length) return 'slot-locked';
  if (game.turrets[team][slot]) return 'occupied';
  return canAfford(game.gold[team], TURRETS[type].cost) ? 'ready' : 'gold';
}

export function buildTurret(game, team = 'player', type = null, slot = null) {
  if (getTurretState(game, team, type, slot) !== 'ready') return false;
  type ??= AGES[game.ages[team]].turrets[0];
  slot ??= game.turrets[team].indexOf(null);
  game.gold[team] = Math.max(0, game.gold[team] - TURRETS[type].cost);
  game.turrets[team][slot] = { team, type, slot, cooldown: 0, flash: 0 };
  return true;
}

export function getExpansionState(game, team = 'player') {
  if (!validTeam(team)) return 'invalid';
  if (game.status !== 'playing') return 'finished';
  const capacity = game.turrets[team].length;
  if (capacity >= RULES.maxTurretSlots) return 'max-slots';
  return canAfford(game.gold[team], RULES.turretExpansionCosts[capacity - 1]) ? 'ready' : 'gold';
}

export function expandTurretSlots(game, team = 'player') {
  if (getExpansionState(game, team) !== 'ready') return false;
  const cost = RULES.turretExpansionCosts[game.turrets[team].length - 1];
  game.gold[team] = Math.max(0, game.gold[team] - cost);
  game.turrets[team].push(null);
  return true;
}

export function sellTurret(game, slot, team = 'player') {
  if (game.status !== 'playing' || !validTeam(team) || !Number.isInteger(slot)) return false;
  const turret = game.turrets[team][slot];
  if (!turret) return false;
  game.gold[team] += Math.floor(TURRETS[turret.type].cost / 2);
  game.turrets[team][slot] = null;
  return true;
}

export function getTurretPosition(game, team, slot) {
  const direction = team === 'player' ? 1 : -1;
  return { x: game.bases[team].x + (slot % 2 === 0 ? 30 : -30) * direction,
    y: AGES[game.ages[team]].turretY - Math.floor(slot / 2) * 48 };
}

export function getAbilityRadius(type) {
  const stats = ABILITIES[type];
  return (stats.radius ?? 0) + (stats.sweep ?? 0) * (stats.waves - 1 || 0) / 2;
}

export function getAbilityImpactX(ability) {
  const stats = ABILITIES[ability.type];
  return Math.max(0, Math.min(RULES.width, ability.x + (stats.sweep ?? 0) * ((stats.waves - 1) / 2 - ability.wavesLeft + 1)));
}

export function castAbility(game, x = RULES.width / 2) {
  if (game.status !== 'playing' || !Number.isFinite(x) || game.abilityCooldown > 0) return false;
  const type = AGES[game.ages.player].ability;
  const stats = ABILITIES[type];
  game.ability = { type, x: Math.max(0, Math.min(RULES.width, x)), remaining: stats.duration ?? stats.delay, wavesLeft: stats.waves ?? 0 };
  game.abilityCooldown = stats.cooldown;
  return true;
}

function gameBaseX(team) {
  return team === 'player' ? RULES.playerBaseX : RULES.enemyBaseX;
}

function spawnX(team) {
  return gameBaseX(team) + (team === 'player' ? 30 : -30);
}

function unitSpacing(firstType, secondType) {
  return (UNITS[firstType].footprint ?? RULES.unitSpacing / 2) + (UNITS[secondType].footprint ?? RULES.unitSpacing / 2);
}

function attackRange(stats, target) {
  return stats.range + (!stats.projectile && target?.type ? Math.max(0, (UNITS[target.type].footprint ?? 15) - 15) : 0);
}

function updateTraining(game, team, dt) {
  const order = game.queues[team][0];
  if (!order) return;
  order.remaining = Math.max(0, order.remaining - dt);
  const stats = UNITS[order.type];
  const allies = game.units.filter(unit => unit.team === team);
  const blocked = allies.some(unit => UNITS[unit.type].lane === stats.lane && Math.abs(unit.x - spawnX(team)) < unitSpacing(order.type, unit.type));
  if (order.remaining > EPSILON || allies.length >= RULES.armyLimit || blocked) return;
  game.units.push({
    id: game.nextUnitId++, team, type: order.type, x: spawnX(team), hp: stats.health,
    attackCooldown: 0, attackAnimation: 0, hitFlash: 0, moving: false, distanceTravelled: 0, chargeTravel: 0,
  });
  game.queues[team].shift();
}

function updateAI(game, dt) {
  if (!game.ai.enabled) return;
  game.ai.cooldown = Math.max(0, game.ai.cooldown - dt);
  if (game.ai.cooldown > 0) return;
  game.ai.cooldown = RULES.aiDecisionInterval;
  evolve(game, 'enemy');
  const playerArmy = game.units.filter(unit => unit.team === 'player');
  const invaders = playerArmy.filter(unit => unit.x > RULES.enemyBaseX - 420 ||
    (UNITS[unit.type].baseRange && Math.abs(unit.x - RULES.enemyBaseX) - RULES.baseHalfWidth <= UNITS[unit.type].baseRange + 0.01));
  const playerTowers = game.turrets.player.filter(Boolean).length;
  const siegeThreat = invaders.some(unit => UNITS[unit.type].baseRange);
  game.ai.strategy = !invaders.length && playerTowers > 0 && playerArmy.length <= 2 ? 'siege' : 'balanced';
  // Save for a defensive tower when pressured; it uses the same wallet as training.
  const towers = game.turrets.enemy;
  const owned = towers.filter(Boolean).length;
  if (!siegeThreat && game.elapsed > 18 && (invaders.length >= 3 || game.bases.enemy.hp < game.bases.enemy.maxHp * 0.65)) {
    const choices = AGES[game.ages.enemy].turrets;
    const type = invaders.length >= 3 ? choices[2] : invaders.some(unit => UNITS[unit.type].armor > 0)
      ? choices.find(type => TURRETS[type].ignoreArmor) ?? choices[0]
      : choices.reduce((fastest, type) => TURRETS[type].interval < TURRETS[fastest].interval ? type : fastest);
    if (towers.includes(null) && buildTurret(game, 'enemy', type)) return;
    const reserve = TURRETS[type].cost + UNITS[AGES[game.ages.enemy].units[0]].cost;
    if (owned === towers.length && game.gold.enemy >= reserve + (RULES.turretExpansionCosts[towers.length - 1] ?? Infinity)) {
      expandTurretSlots(game, 'enemy');
      return;
    }
    if (towers.includes(null) && game.gold.enemy >= 70) return;
  }
  const [melee, archer, heavy] = AGES[game.ages.enemy].units;
  if (game.ai.strategy === 'siege') {
    // Save for a complete paid wave. Heavy troops lead, with ranged support behind.
    // Use visible defenses, not the player's wallet or pending orders, to pick a plan.
    if (game.queues.enemy.length) return;
    const wave = playerTowers >= 2 && UNITS[heavy].baseRange ? [heavy, heavy, archer]
      : [heavy, archer, game.ai.waves % 2 === 0 ? melee : archer];
    const cost = wave.reduce((sum, type) => sum + UNITS[type].cost, 0);
    const armySize = game.units.filter(unit => unit.team === 'enemy').length;
    if (armySize + wave.length > RULES.armyLimit || !canAfford(game.gold.enemy, cost)) return;
    for (const type of wave) {
      if (recruit(game, type, 'enemy')) game.ai.orders++;
    }
    game.ai.waves++;
    return;
  }
  if (game.queues.enemy.length >= 2) return;
  const army = [
    ...game.units.filter(unit => unit.team === 'enemy').map(unit => unit.type),
    ...game.queues.enemy.map(order => order.type),
  ];
  const frontline = army.filter(type => UNITS[type].role !== 'archer').length;
  const archers = army.filter(type => UNITS[type].role === 'archer').length;
  let type = melee;
  if (frontline > 0 && archers < Math.ceil(frontline / 2)) type = archer;
  else if (game.ai.orders > 1 && !army.some(type => UNITS[type].role === 'heavy')) type = heavy;
  // Under immediate pressure, buy an affordable defender instead of waiting for armor.
  if (invaders.length && !canAfford(game.gold.enemy, UNITS[type].cost)) type = melee;
  if (recruit(game, type, 'enemy')) game.ai.orders++;
}

function addProjectile(game, team, kind, x, target, damage, options = {}) {
  const speed = { sling: 460, arrow: 500, bullet: 900, laser: 1400, plasma: 700, 'plasma-orb': 480, rocket: 500 }[kind] ?? 420;
  const duration = Math.max(0.12, Math.abs(target.x - x) / speed);
  game.projectiles.push({
    team, kind, fromX: x, toX: target.x,
    fromY: options.fromY ?? -36, fromUnitX: options.fromUnitX,
    toY: target.type ? -(UNITS[target.type].height ?? 60) * 0.52 - (UNITS[target.type].lane === 'back' ? 7 : 0) : -45,
    targetId: target.id ?? null, targetBase: target.id == null ? target.team : null,
    damage, duration, remaining: duration, splash: options.splash ?? 0, ignoreArmor: options.ignoreArmor ?? false, armorPierce: options.armorPierce ?? 0,
  });
}

function updateProjectiles(game, dt, hits) {
  for (const shot of game.projectiles) {
    shot.remaining -= dt;
    const target = shot.targetBase ? game.bases[shot.targetBase] : game.units.find(unit => unit.id === shot.targetId);
    if (target) shot.toX = target.x;
    if (shot.remaining <= 0) {
      if (shot.splash > 0) {
        // Area shots detonate at their last tracked position even if the target has died.
        for (const victim of game.units) {
          if (victim.team !== shot.team && Math.abs(victim.x - shot.toX) <= shot.splash) {
            hits.push({ target: victim, damage: shot.damage, team: shot.team, ignoreArmor: shot.ignoreArmor });
          }
        }
        // Siege units can hit a base directly; blast radius never adds extra base damage.
        if (shot.targetBase && target?.hp > 0) hits.push({ target, damage: shot.damage, team: shot.team });
        game.effects.push({ kind: 'blast', x: shot.toX, radius: shot.splash, life: 0.4, duration: 0.4 });
      } else if (target?.hp > 0) hits.push({ target, damage: shot.damage, team: shot.team, ignoreArmor: shot.ignoreArmor, armorPierce: shot.armorPierce, ranged: true });
    }
  }
  game.projectiles = game.projectiles.filter(shot => shot.remaining > 0);
}

function updateAbility(game, dt, hits) {
  game.abilityCooldown = Math.max(0, game.abilityCooldown - dt);
  if (!game.ability) return;
  const ability = game.ability;
  const stats = ABILITIES[ability.type];
  if (stats.targeting === 'allies') {
    const healing = stats.healing * Math.min(dt, ability.remaining);
    for (const unit of game.units) {
      if (unit.team === 'player' && unit.hp > 0) unit.hp = Math.min(UNITS[unit.type].health, unit.hp + healing);
    }
    ability.remaining -= dt;
    if (ability.remaining <= EPSILON) game.ability = null;
    return;
  }
  ability.remaining -= dt;
  if (ability.remaining > 0) return;
  const x = getAbilityImpactX(ability);
  for (const target of game.units) {
    if (target.team === 'enemy' && Math.abs(target.x - x) <= stats.radius) {
      hits.push({ target, damage: stats.damage, team: 'player', ignoreArmor: stats.ignoreArmor });
    }
  }
  if (Math.abs(game.bases.enemy.x - x) <= stats.radius + RULES.baseHalfWidth) {
    hits.push({ target: game.bases.enemy, damage: stats.baseDamage, team: 'player', ignoreArmor: true });
  }
  game.effects.push({ kind: ability.type, x, radius: stats.radius, life: 0.75, duration: 0.75 });
  ability.wavesLeft--;
  if (ability.wavesLeft > 0) ability.remaining += stats.waveInterval;
  else game.ability = null;
}

function updateUnits(game, dt, hits) {
  const positions = new Map(game.units.map(unit => [unit.id, unit.x]));
  for (const unit of game.units) {
    const stats = UNITS[unit.type];
    unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
    unit.attackAnimation = Math.max(0, unit.attackAnimation - dt);
    unit.hitFlash = Math.max(0, unit.hitFlash - dt);
    unit.guardFlash = Math.max(0, (unit.guardFlash ?? 0) - dt);
    unit.moving = false;
    const direction = unit.team === 'player' ? 1 : -1;
    const origin = positions.get(unit.id);
    const base = game.bases[otherTeam(unit.team)];
    let closestEnemy = null;
    let enemyDistance = Infinity;
    let allySpace = Infinity;
    for (const other of game.units) {
      if (other.id === unit.id) continue;
      const distance = positions.get(other.id) - origin;
      if (other.team !== unit.team && Math.abs(distance) < enemyDistance) {
        closestEnemy = other;
        enemyDistance = Math.abs(distance);
      } else if (other.team === unit.team && UNITS[other.type].lane === stats.lane && distance * direction > 0) {
        // Frontline troops can pass friendly archers, who occupy a separate rank.
        allySpace = Math.min(allySpace, distance * direction - unitSpacing(unit.type, other.type));
      }
    }
    const baseDistance = Math.abs(base.x - origin) - RULES.baseHalfWidth;
    const baseRange = stats.baseRange ?? stats.range;
    const reach = attackRange(stats, closestEnemy);
    const target = enemyDistance <= reach + 0.01 ? closestEnemy : baseDistance <= baseRange + 0.01 ? base : null;
    const fire = victim => {
      const muzzle = Math.min(stats.muzzleX ?? 0, Math.abs(victim.x - unit.x) * 0.5);
      addProjectile(game, unit.team, stats.projectile, unit.x + direction * muzzle, victim, stats.damage,
        { fromUnitX: unit.x, fromY: stats.muzzleY + (stats.lane === 'back' ? -7 : 0), splash: stats.splash, ignoreArmor: stats.ignoreArmor, armorPierce: stats.armorPierce });
      unit.attackAnimation = stats.attackDuration;
    };
    if (unit.burstRemaining > 0) {
      const victim = unit.burstTargetBase ? game.bases[unit.burstTargetBase] : game.units.find(other => other.id === unit.burstTargetId);
      const distance = victim ? Math.abs(victim.x - origin) - (victim.type ? 0 : RULES.baseHalfWidth) : Infinity;
      if (!victim || victim.hp <= 0 || distance > (victim.type ? stats.range : baseRange) + 0.01) unit.burstRemaining = 0;
      else {
        unit.burstCooldown -= dt;
        if (unit.burstCooldown <= EPSILON) {
          fire(victim);
          unit.burstRemaining--;
          unit.burstCooldown += stats.burstInterval;
        }
        continue;
      }
    }
    if (target) {
      if (unit.attackCooldown === 0) {
        if (stats.projectile) {
          fire(target);
          if (stats.burst) {
            unit.burstRemaining = stats.burst - 1;
            unit.burstCooldown = stats.burstInterval;
            unit.burstTargetId = target.id ?? null;
            unit.burstTargetBase = target.type ? null : target.team;
          }
        } else {
          unit.lastAttackCharged = Boolean(stats.chargeDamage && (unit.chargeTravel ?? 0) >= stats.chargeDistance);
          hits.push({ target, damage: stats.damage + (unit.lastAttackCharged ? stats.chargeDamage : 0), team: unit.team, ignoreArmor: stats.ignoreArmor, armorPierce: stats.armorPierce });
          if (stats.cleaveRadius && target.type) {
            const secondary = game.units.filter(other => other !== target && other.team !== unit.team &&
              (positions.get(other.id) - origin) * direction >= 0 && Math.abs(positions.get(other.id) - positions.get(target.id)) <= stats.cleaveRadius)
              .sort((a, b) => Math.abs(positions.get(a.id) - origin) - Math.abs(positions.get(b.id) - origin))[0];
            if (secondary) hits.push({ target: secondary, damage: stats.damage * stats.cleaveFactor, team: unit.team });
          }
        }
        unit.chargeTravel = 0;
        unit.attackCooldown = stats.attackInterval;
        unit.attackAnimation = stats.attackDuration;
      }
    } else {
      const step = Math.max(0, Math.min(stats.speed * dt, allySpace,
        (enemyDistance - reach) / 2, baseDistance - baseRange));
      unit.x += direction * step;
      unit.moving = step > 0.001;
      unit.distanceTravelled = (unit.distanceTravelled ?? 0) + step;
      unit.chargeTravel = unit.moving ? (unit.chargeTravel ?? 0) + step : 0;
    }
  }
}

function updateTurrets(game, dt) {
  for (const team of TEAMS) {
    for (const turret of game.turrets[team]) {
      if (!turret) continue;
      const stats = TURRETS[turret.type];
      turret.cooldown = Math.max(0, turret.cooldown - dt);
      turret.flash = Math.max(0, turret.flash - dt);
      if (turret.cooldown > 0) continue;
      const { x, y } = getTurretPosition(game, team, turret.slot);
      const targets = game.units.filter(unit => unit.team !== team && Math.abs(unit.x - x) <= stats.range);
      targets.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
      if (!targets.length) continue;
      addProjectile(game, team, stats.projectile, x, targets[0], stats.damage, { fromY: y - 14, splash: stats.splash, ignoreArmor: stats.ignoreArmor });
      turret.cooldown = stats.interval;
      turret.flash = 0.16;
    }
  }
}

function resolveHits(game, hits) {
  // Resolve all damage before removing casualties; rewards are paid once per death.
  for (const hit of hits) {
    const stats = hit.target.type ? UNITS[hit.target.type] : null;
    const armor = stats && !hit.ignoreArmor ? Math.max(0, stats.armor - (hit.armorPierce ?? 0)) : 0;
    const guard = hit.ranged && !hit.ignoreArmor ? stats?.rangedReduction ?? 0 : 0;
    hit.target.hp = Math.max(0, hit.target.hp - Math.max(1, (hit.damage - armor) * (1 - guard)));
    if (guard) hit.target.guardFlash = 0.18;
    hit.target.hitFlash = 0.14;
    game.effects.push({ kind: 'hit', x: hit.target.x, life: 0.22, duration: 0.22 });
  }
  for (const unit of game.units) {
    if (unit.hp <= 0) {
      const winner = otherTeam(unit.team);
      game.gold[winner] += UNITS[unit.type].bounty;
      game.experience[winner] += UNITS[unit.type].experience;
      // Losses teach the attacking side too, so a tower-only defense cannot freeze its age.
      game.experience[unit.team] += Math.floor(UNITS[unit.type].experience * RULES.casualtyExperienceRate);
    }
  }
  game.units = game.units.filter(unit => unit.hp > 0);
  const playerLost = game.bases.player.hp === 0;
  const enemyLost = game.bases.enemy.hp === 0;
  if (playerLost || enemyLost) game.status = playerLost && enemyLost ? 'draw' : playerLost ? 'lost' : 'won';
}

export function updateGame(game, dt) {
  if (game.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.05);
  game.elapsed += dt;
  for (const team of TEAMS) {
    game.gold[team] += AGES[game.ages[team]].income * dt;
    game.bases[team].hitFlash = Math.max(0, game.bases[team].hitFlash - dt);
  }
  for (const effect of game.effects) effect.life -= dt;
  game.effects = game.effects.filter(effect => effect.life > 0);
  updateAI(game, dt);
  for (const team of TEAMS) updateTraining(game, team, dt);
  const hits = [];
  updateProjectiles(game, dt, hits);
  updateAbility(game, dt, hits);
  updateUnits(game, dt, hits);
  updateTurrets(game, dt);
  resolveHits(game, hits);
}
