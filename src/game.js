// Pure simulation. Timings are seconds; positions are in battlefield coordinates.
export const UNITS = Object.freeze({
  melee: Object.freeze({ name: '近战兵', age: 1, role: 'melee', cost: 30, trainTime: 1.6, health: 70, damage: 12, armor: 0, speed: 62, range: 32, attackInterval: 0.8, bounty: 10, experience: 20, lane: 'front' }),
  archer: Object.freeze({ name: '弓箭手', age: 1, role: 'archer', projectile: 'arrow', cost: 45, trainTime: 2.4, health: 42, damage: 14, armor: 0, speed: 54, range: 190, attackInterval: 1.2, bounty: 15, experience: 28, lane: 'back' }),
  heavy: Object.freeze({ name: '重装兵', age: 1, role: 'heavy', cost: 85, trainTime: 4, health: 170, damage: 26, armor: 3, speed: 36, range: 36, attackInterval: 1.3, bounty: 25, experience: 45, lane: 'front' }),
  swordsman: Object.freeze({ name: '剑士', age: 2, role: 'melee', cost: 50, trainTime: 2, health: 115, damage: 20, armor: 1, speed: 66, range: 34, attackInterval: 0.85, bounty: 17, experience: 30, lane: 'front' }),
  crossbow: Object.freeze({ name: '弩手', age: 2, role: 'archer', projectile: 'bolt', cost: 75, trainTime: 3, health: 65, damage: 30, armor: 0, speed: 50, range: 230, attackInterval: 1.5, bounty: 24, experience: 42, lane: 'back' }),
  knight: Object.freeze({ name: '重甲骑士', age: 2, role: 'heavy', cost: 130, trainTime: 4.8, health: 270, damage: 42, armor: 5, speed: 44, range: 40, attackInterval: 1.4, bounty: 40, experience: 65, lane: 'front' }),
});

export const RULES = Object.freeze({
  width: 1280, height: 480,
  baseHealth: 600, baseHalfWidth: 54, playerBaseX: 108, enemyBaseX: 1172,
  startingGold: 180, goldPerSecond: 7,
  unitSpacing: 30, armyLimit: 16, queueLimit: 5,
  aiFirstDecision: 2.4, aiDecisionInterval: 1.8,
  turretCost: 120, turretRange: 290, turretDamage: 24, turretInterval: 1.5,
  meteorCooldown: 40, meteorDelay: 0.8, meteorRadius: 140, meteorDamage: 110, meteorBaseDamage: 40,
  fixedStep: 1 / 60,
});

export const AGES = Object.freeze({
  1: Object.freeze({ name: '部落时代', numeral: 'I', units: Object.freeze(['melee', 'archer', 'heavy']), experienceRequired: 0, baseHealth: RULES.baseHealth }),
  2: Object.freeze({ name: '城堡时代', numeral: 'II', units: Object.freeze(['swordsman', 'crossbow', 'knight']), experienceRequired: 160, baseHealth: 900 }),
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
    turrets: { player: null, enemy: null },
    units: [], projectiles: [], effects: [],
    meteor: null, meteorCooldown: 0,
    nextUnitId: 1, nextOrderId: 1,
    ai: { enabled: true, cooldown: RULES.aiFirstDecision, orders: 0 },
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

export function getTurretState(game, team = 'player') {
  if (!validTeam(team)) return 'invalid';
  if (game.status !== 'playing') return 'finished';
  if (game.turrets[team]) return 'built';
  return canAfford(game.gold[team], RULES.turretCost) ? 'ready' : 'gold';
}

export function buildTurret(game, team = 'player') {
  if (getTurretState(game, team) !== 'ready') return false;
  game.gold[team] = Math.max(0, game.gold[team] - RULES.turretCost);
  game.turrets[team] = { team, cooldown: 0, flash: 0 };
  return true;
}

export function castMeteor(game, x) {
  if (game.status !== 'playing' || !Number.isFinite(x) || game.meteorCooldown > 0) return false;
  game.meteor = { x: Math.max(0, Math.min(RULES.width, x)), remaining: RULES.meteorDelay };
  game.meteorCooldown = RULES.meteorCooldown;
  return true;
}

function gameBaseX(team) {
  return team === 'player' ? RULES.playerBaseX : RULES.enemyBaseX;
}

function spawnX(team) {
  return gameBaseX(team) + (team === 'player' ? 30 : -30);
}

function updateTraining(game, team, dt) {
  const order = game.queues[team][0];
  if (!order) return;
  order.remaining = Math.max(0, order.remaining - dt);
  const stats = UNITS[order.type];
  const allies = game.units.filter(unit => unit.team === team);
  const blocked = allies.some(unit => UNITS[unit.type].lane === stats.lane && Math.abs(unit.x - spawnX(team)) < RULES.unitSpacing);
  if (order.remaining > EPSILON || allies.length >= RULES.armyLimit || blocked) return;
  game.units.push({
    id: game.nextUnitId++, team, type: order.type, x: spawnX(team), hp: stats.health,
    attackCooldown: 0, attackAnimation: 0, hitFlash: 0, moving: false,
  });
  game.queues[team].shift();
}

function updateAI(game, dt) {
  if (!game.ai.enabled) return;
  game.ai.cooldown = Math.max(0, game.ai.cooldown - dt);
  if (game.ai.cooldown > 0) return;
  game.ai.cooldown = RULES.aiDecisionInterval;
  evolve(game, 'enemy');
  const invaders = game.units.filter(unit => unit.team === 'player' && unit.x > RULES.enemyBaseX - 420);
  // Save for a defensive tower when pressured; it uses the same wallet as training.
  if (!game.turrets.enemy && game.elapsed > 18 &&
      (invaders.length >= 3 || game.bases.enemy.hp < game.bases.enemy.maxHp * 0.65)) {
    if (buildTurret(game, 'enemy')) return;
    if (game.gold.enemy >= 70) return;
  }
  if (game.queues.enemy.length >= 2) return;
  const army = [
    ...game.units.filter(unit => unit.team === 'enemy').map(unit => unit.type),
    ...game.queues.enemy.map(order => order.type),
  ];
  const frontline = army.filter(type => UNITS[type].role !== 'archer').length;
  const archers = army.filter(type => UNITS[type].role === 'archer').length;
  const [melee, archer, heavy] = AGES[game.ages.enemy].units;
  let type = melee;
  if (frontline > 0 && archers < Math.ceil(frontline / 2)) type = archer;
  else if (game.ai.orders > 1 && !army.some(type => UNITS[type].role === 'heavy')) type = heavy;
  // Under immediate pressure, buy an affordable defender instead of waiting for armor.
  if (invaders.length && !canAfford(game.gold.enemy, UNITS[type].cost)) type = melee;
  if (recruit(game, type, 'enemy')) game.ai.orders++;
}

function addProjectile(game, team, kind, x, target, damage) {
  const duration = Math.max(0.12, Math.abs(target.x - x) / (kind === 'arrow' ? 500 : 420));
  game.projectiles.push({
    team, kind, fromX: x, toX: target.x,
    fromY: kind === 'cannon' ? (game.ages[team] === 2 ? -141 : -118) : -36,
    targetId: target.id ?? null, targetBase: target.id == null ? target.team : null,
    damage, duration, remaining: duration,
  });
}

function updateProjectiles(game, dt, hits) {
  for (const shot of game.projectiles) {
    shot.remaining -= dt;
    const target = shot.targetBase ? game.bases[shot.targetBase] : game.units.find(unit => unit.id === shot.targetId);
    if (target) shot.toX = target.x;
    if (shot.remaining <= 0 && target?.hp > 0) hits.push({ target, damage: shot.damage, team: shot.team });
  }
  game.projectiles = game.projectiles.filter(shot => shot.remaining > 0);
}

function updateMeteor(game, dt, hits) {
  game.meteorCooldown = Math.max(0, game.meteorCooldown - dt);
  if (!game.meteor) return;
  game.meteor.remaining -= dt;
  if (game.meteor.remaining > 0) return;
  const x = game.meteor.x;
  for (const target of game.units) {
    if (target.team === 'enemy' && Math.abs(target.x - x) <= RULES.meteorRadius) {
      hits.push({ target, damage: RULES.meteorDamage, team: 'player', ignoreArmor: true });
    }
  }
  if (Math.abs(game.bases.enemy.x - x) <= RULES.meteorRadius + RULES.baseHalfWidth) {
    hits.push({ target: game.bases.enemy, damage: RULES.meteorBaseDamage, team: 'player', ignoreArmor: true });
  }
  game.effects.push({ kind: 'meteor', x, life: 0.75, duration: 0.75 });
  game.meteor = null;
}

function updateUnits(game, dt, hits) {
  const positions = new Map(game.units.map(unit => [unit.id, unit.x]));
  for (const unit of game.units) {
    const stats = UNITS[unit.type];
    unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
    unit.attackAnimation = Math.max(0, unit.attackAnimation - dt);
    unit.hitFlash = Math.max(0, unit.hitFlash - dt);
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
        allySpace = Math.min(allySpace, distance * direction - RULES.unitSpacing);
      }
    }
    const baseDistance = Math.abs(base.x - origin) - RULES.baseHalfWidth;
    const target = enemyDistance <= stats.range + 0.01 ? closestEnemy : baseDistance <= stats.range + 0.01 ? base : null;
    if (target) {
      if (unit.attackCooldown === 0) {
        if (stats.projectile) addProjectile(game, unit.team, stats.projectile, unit.x, target, stats.damage);
        else hits.push({ target, damage: stats.damage, team: unit.team });
        unit.attackCooldown = stats.attackInterval;
        unit.attackAnimation = 0.25;
      }
    } else {
      const step = Math.max(0, Math.min(stats.speed * dt, allySpace,
        (enemyDistance - stats.range) / 2, baseDistance - stats.range));
      unit.x += direction * step;
      unit.moving = step > 0.001;
    }
  }
}

function updateTurrets(game, dt) {
  for (const team of TEAMS) {
    const turret = game.turrets[team];
    if (!turret) continue;
    turret.cooldown = Math.max(0, turret.cooldown - dt);
    turret.flash = Math.max(0, turret.flash - dt);
    if (turret.cooldown > 0) continue;
    const x = game.bases[team].x;
    const targets = game.units.filter(unit => unit.team !== team && Math.abs(unit.x - x) <= RULES.turretRange);
    targets.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
    if (!targets.length) continue;
    addProjectile(game, team, 'cannon', x, targets[0], RULES.turretDamage);
    turret.cooldown = RULES.turretInterval;
    turret.flash = 0.16;
  }
}

function resolveHits(game, hits) {
  // Resolve all damage before removing casualties; rewards are paid once per death.
  for (const hit of hits) {
    const armor = hit.target.type && !hit.ignoreArmor ? UNITS[hit.target.type].armor : 0;
    hit.target.hp = Math.max(0, hit.target.hp - Math.max(1, hit.damage - armor));
    hit.target.hitFlash = 0.14;
    game.effects.push({ kind: 'hit', x: hit.target.x, life: 0.22, duration: 0.22 });
  }
  for (const unit of game.units) {
    if (unit.hp <= 0) {
      const winner = otherTeam(unit.team);
      game.gold[winner] += UNITS[unit.type].bounty;
      game.experience[winner] += UNITS[unit.type].experience;
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
    game.gold[team] += RULES.goldPerSecond * dt;
    game.bases[team].hitFlash = Math.max(0, game.bases[team].hitFlash - dt);
  }
  for (const effect of game.effects) effect.life -= dt;
  game.effects = game.effects.filter(effect => effect.life > 0);
  updateAI(game, dt);
  for (const team of TEAMS) updateTraining(game, team, dt);
  const hits = [];
  updateProjectiles(game, dt, hits);
  updateMeteor(game, dt, hits);
  updateUnits(game, dt, hits);
  updateTurrets(game, dt);
  resolveHits(game, hits);
}
