import { Q } from './quantity.js';
import { runTraitHook, unitTraits } from './traits.js';
import { BASE_MOUNTS } from './base-layouts.js';
import { createProjectileImpact } from './projectiles.js';

import { RULES, UNITS, AGES, TURRETS, ABILITIES } from './game-config.js';
import { stat, attributes, createBonusStack, legacyBonuses } from './stats.js';
export { RULES, UNITS, AGES, TURRETS, ABILITIES } from './game-config.js';
export { stat, attributes, explainStat } from './stats.js';

// Keep the three automation/AI positions stable; special units are manual choices.
export function getAgeUnits(age) { return [...AGES[age].units, ...(AGES[age].specialUnits ?? [])]; }

const TEAMS = ['player', 'enemy'];
const EPSILON = 0.000001;
const otherTeam = team => team === 'player' ? 'enemy' : 'player';
const validTeam = team => TEAMS.includes(team);
const validType = type => Object.hasOwn(UNITS, type);
const canAfford = Q.canAfford;

export function createGame(options = {}) {
  const game = {
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
    units: [], projectiles: [], effects: [], fields: [],
    ability: null, abilityCooldown: 0,
    nextUnitId: 1, nextOrderId: 1,
    ai: { enabled: true, cooldown: RULES.aiFirstDecision, orders: 0, strategy: 'balanced', waves: 0 },
  };
  if (options.mode === 'incremental') {
    game.mode = 'incremental';
    game.bonuses = createBonusStack(options.bonuses ?? legacyBonuses(options.modifiers, options.enemyModifiers));
    if (options.ages) for (const team of TEAMS) {
      if (!Number.isInteger(options.ages[team]) || !Object.hasOwn(AGES, options.ages[team])) throw new RangeError('Invalid starting age');
      game.ages[team] = options.ages[team];
      game.experience[team] = AGES[game.ages[team]].experienceRequired;
    }
    for (const team of TEAMS) {
      game.gold[team] = stat(game, team, 'startingGold');
      game.bases[team].hp = game.bases[team].maxHp = stat(game, team, 'baseHealth');
      game.turrets[team] = Array(Math.min(stat(game, team, 'initialTurretSlots'), stat(game, team, 'maxTurretSlots'))).fill(null);
    }
  }
  return game;
}

// Compatibility exports; the pipeline owns all values and rounding.
export const getBaseHealth = (game, team, age = game.ages[team]) => stat(game, { kind: 'team', team, age }, 'baseHealth');
export const getUnitHealth = (game, type, team) => stat(game, { type, team }, 'health');
export const getIncomeRate = (game, team = 'player') => stat(game, team, 'income');
export const getExperienceReward = (game, base, team = 'player') => stat(game, { kind: 'reward', team }, 'experience', base);
export const getBountyReward = (game, base, team = 'player') => stat(game, { kind: 'reward', team }, 'bounty', base);
export const getExpansionCost = (game, team = 'player') => stat(game, { kind: 'team', team, slot: game.turrets[team].length - 1 }, 'expansionCost');
export const getTurretRefund = (game, turret) => Q.floor(Q.div(turret.paid ?? stat(game, turret, 'cost'), 2));

export function getEvolutionState(game, team = 'player') {
  if (!validTeam(team)) return 'invalid';
  if (game.status !== 'playing') return 'finished';
  if (!stat(game, team, 'canEvolve')) return 'disabled';
  const nextAge = AGES[game.ages[team] + 1];
  if (!nextAge) return 'max-age';
  return Q.gte(game.experience[team], nextAge.experienceRequired) ? 'ready' : 'experience';
}

export function evolve(game, team = 'player') {
  if (getEvolutionState(game, team) !== 'ready') return false;
  const base = game.bases[team];
  // Keep damage already taken. Evolution adds capacity, not a full heal.
  const health = getBaseHealth(game, team, game.ages[team] + 1);
  base.hp = Q.max(1, Q.sub(Q.add(base.hp, health), base.maxHp));
  base.maxHp = health;
  game.ages[team]++;
  game.effects.push({ kind: 'evolve', x: base.x, team, life: 1.2, duration: 1.2 });
  return true;
}

export function getRecruitState(game, type = 'melee', team = 'player') {
  if (!validTeam(team) || !validType(type)) return 'invalid';
  if (game.status !== 'playing') return 'finished';
  if (!stat(game, team, 'canRecruit') || !stat(game, { type, team }, 'enabled')) return 'disabled';
  if (UNITS[type].playerOnly && team !== 'player') return 'player-only';
  if (UNITS[type].age > game.ages[team]) return 'locked';
  if (UNITS[type].age < game.ages[team]) return 'outdated';
  if (game.queues[team].length >= stat(game, team, 'queueLimit')) return 'queue-full';
  const reserved = game.units.filter(unit => unit.team === team).length + game.queues[team].length;
  if (reserved >= stat(game, team, 'armyLimit')) return 'army-full';
  if (!canAfford(game.gold[team], stat(game, { type, team }, 'cost'))) return 'gold';
  return 'ready';
}

export function recruit(game, type = 'melee', team = 'player') {
  if (getRecruitState(game, type, team) !== 'ready') return false;
  const stats = attributes(game, { type, team });
  game.gold[team] = Q.max(0, Q.sub(game.gold[team], stats.cost));
  game.queues[team].push({ id: game.nextOrderId++, type, remaining: stats.trainTime, duration: stats.trainTime, paid: stats.cost });
  return true;
}

export function cancelTraining(game, orderId, team = 'player') {
  if (game.status !== 'playing' || !validTeam(team)) return false;
  const index = game.queues[team].findIndex(order => order.id === orderId);
  if (index < 0) return false;
  const [order] = game.queues[team].splice(index, 1);
  game.gold[team] = Q.add(game.gold[team], order.paid ?? UNITS[order.type].cost);
  return true;
}

export function getTurretState(game, team = 'player', type = null, slot = null) {
  if (!validTeam(team)) return 'invalid';
  type ??= AGES[game.ages[team]].turrets[0];
  if (!Object.hasOwn(TURRETS, type)) return 'invalid';
  if (game.status !== 'playing') return 'finished';
  if (!stat(game, team, 'canBuild') || !stat(game, { type, team }, 'enabled')) return 'disabled';
  if (TURRETS[type].age > game.ages[team]) return 'locked';
  if (TURRETS[type].age < game.ages[team]) return 'outdated';
  if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot >= stat(game, team, 'maxTurretSlots'))) return 'invalid';
  if (slot === null) slot = game.turrets[team].findIndex((tower, index) => tower === null && index < stat(game, team, 'maxTurretSlots'));
  if (slot === -1) return 'full';
  if (slot >= game.turrets[team].length) return 'slot-locked';
  if (game.turrets[team][slot]) return 'occupied';
  return canAfford(game.gold[team], stat(game, { type, team }, 'cost')) ? 'ready' : 'gold';
}

export function buildTurret(game, team = 'player', type = null, slot = null) {
  if (getTurretState(game, team, type, slot) !== 'ready') return false;
  type ??= AGES[game.ages[team]].turrets[0];
  slot ??= game.turrets[team].indexOf(null);
  const paid = stat(game, { type, team }, 'cost');
  game.gold[team] = Q.max(0, Q.sub(game.gold[team], paid));
  game.turrets[team][slot] = { team, type, slot, paid, cooldown: 0, flash: 0, shotSerial: 0, aim: 0, burstRemaining: 0, chargeRemaining: 0 };
  return true;
}

export function getExpansionState(game, team = 'player') {
  if (!validTeam(team)) return 'invalid';
  if (game.status !== 'playing') return 'finished';
  if (!stat(game, team, 'canBuild') || !stat(game, team, 'canExpand')) return 'disabled';
  const capacity = game.turrets[team].length;
  if (capacity >= stat(game, team, 'maxTurretSlots')) return 'max-slots';
  return canAfford(game.gold[team], getExpansionCost(game, team)) ? 'ready' : 'gold';
}

export function expandTurretSlots(game, team = 'player') {
  if (getExpansionState(game, team) !== 'ready') return false;
  const cost = getExpansionCost(game, team);
  game.gold[team] = Q.max(0, Q.sub(game.gold[team], cost));
  game.turrets[team].push(null);
  return true;
}

export function sellTurret(game, slot, team = 'player') {
  if (game.status !== 'playing' || !validTeam(team) || !Number.isInteger(slot)) return false;
  const turret = game.turrets[team][slot];
  if (!turret) return false;
  game.gold[team] = Q.add(game.gold[team], getTurretRefund(game, turret));
  game.turrets[team][slot] = null;
  return true;
}

export function getTurretPosition(game, team, slot, scale = 1) {
  const direction = team === 'player' ? 1 : -1;
  const mount = BASE_MOUNTS[game.ages[team]][slot];
  return { x: game.bases[team].x + mount.x * direction * scale, y: mount.y * scale };
}

// Shared by the simulation, turret models and portrait previews.
export function getTurretMuzzle(turret, barrel = 0) {
  const stats = TURRETS[turret.type];
  const angle = stats.aimable ? turret.aim ?? 0 : 0;
  const x = stats.muzzleX, y = stats.muzzleY + (barrel ? stats.barrelGap ?? 0 : 0);
  return { x: x * Math.cos(angle) - (y + 18) * Math.sin(angle),
    y: -18 + x * Math.sin(angle) + (y + 18) * Math.cos(angle) };
}

export function getAbilityRadius(type, game) {
  const stats = game ? attributes(game, { kind: 'ability', type, team: 'player' }) : ABILITIES[type];
  return (stats.radius ?? 0) + (stats.sweep ?? 0) * (stats.waves - 1 || 0) / 2;
}

export function getAbilityImpactX(ability) {
  const stats = ability.stats ?? ABILITIES[ability.type];
  return Math.max(0, Math.min(RULES.width, ability.x + (stats.sweep ?? 0) * ((stats.waves - 1) / 2 - ability.wavesLeft + 1)));
}

export function castAbility(game, x = RULES.width / 2) {
  if (game.status !== 'playing' || !Number.isFinite(x) || game.abilityCooldown > 0) return false;
  const type = AGES[game.ages.player].ability;
  const stats = attributes(game, { kind: 'ability', type, team: 'player' });
  if (!stat(game, 'player', 'canCast') || !stats.enabled) return false;
  game.ability = { type, x: Math.max(0, Math.min(RULES.width, x)), remaining: stats.duration ?? stats.delay, wavesLeft: stats.waves ?? 0, stats: { ...stats } };
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
  if (order.remaining > EPSILON || allies.length >= stat(game, team, 'armyLimit') || blocked) return;
  game.units.push({
    id: game.nextUnitId++, team, type: order.type, x: spawnX(team), hp: stat(game, { type: order.type, team }, 'health'),
    attackCooldown: 0, attackAnimation: 0, hitFlash: 0, moving: false, distanceTravelled: 0, chargeTravel: 0,
  });
  game.queues[team].shift();
}

export function updateCommander(game, dt, team = 'enemy', ai = game.ai) {
  const opponent = otherTeam(team);
  if (!ai.enabled) return;
  ai.cooldown = Math.max(0, ai.cooldown - dt);
  if (ai.cooldown > 0) return;
  ai.cooldown = RULES.aiDecisionInterval;
  evolve(game, team);
  const opponentArmy = game.units.filter(unit => unit.team === opponent);
  const invaders = opponentArmy.filter(unit => (team === 'enemy' ? unit.x > gameBaseX(team) - 420 : unit.x < gameBaseX(team) + 420) ||
    (attributes(game, unit).baseRange && Math.abs(unit.x - gameBaseX(team)) - RULES.baseHalfWidth <= attributes(game, unit).baseRange + 0.01));
  const opponentTowers = game.turrets[opponent].filter(Boolean).length;
  const siegeThreat = invaders.some(unit => attributes(game, unit).baseRange);
  ai.strategy = !invaders.length && opponentTowers > 0 && opponentArmy.length <= 2 ? 'siege' : 'balanced';
  // Save for a defensive tower when pressured; it uses the same wallet as training.
  const towers = game.turrets[team];
  const owned = towers.filter(Boolean).length;
  if (stat(game, team, 'canBuild') && AGES[game.ages[team]].turrets.some(type => stat(game, { type, team }, 'enabled')) && !siegeThreat && game.elapsed > 18 && (invaders.length >= 3 || Q.lt(game.bases[team].hp, Q.mul(game.bases[team].maxHp, 0.65)))) {
    const choices = AGES[game.ages[team]].turrets.filter(type => stat(game, { type, team }, 'enabled'));
    const towerStats = type => attributes(game, { type, team });
    const coverage = type => { const stats = towerStats(type); return (stats.splash ?? 0) + (stats.fieldRadius ?? 0) + (stats.pierce ?? 0) * 40; };
    const type = invaders.length >= 3 ? choices.reduce((best, type) =>
      coverage(type) > coverage(best) ? type : best)
      : invaders.some(unit => Q.gt(stat(game, unit, 'armor'), 0))
      ? choices.find(type => towerStats(type).ignoreArmor) ?? choices[0]
      : choices.reduce((fastest, type) => towerStats(type).attackInterval < towerStats(fastest).attackInterval ? type : fastest);
    if (towers.includes(null) && buildTurret(game, team, type)) return;
    const reserve = Q.add(stat(game, { type, team }, 'cost'), stat(game, { type: AGES[game.ages[team]].units[0], team }, 'cost'));
    if (owned === towers.length && getExpansionState(game, team) !== 'max-slots' && Q.gte(game.gold[team], Q.add(reserve, getExpansionCost(game, team)))) {
      expandTurretSlots(game, team);
      return;
    }
    if (towers.includes(null) && Q.gte(game.gold[team], 70)) return;
  }
  const [melee, archer, heavy] = AGES[game.ages[team]].units;
  if (ai.strategy === 'siege') {
    // Save for a complete paid wave. Heavy troops lead, with ranged support behind.
    // Use visible defenses, not the player's wallet or pending orders, to pick a plan.
    if (game.queues[team].length) return;
    const desiredWave = opponentTowers >= 2 && attributes(game, { type: heavy, team }).baseRange ? [heavy, heavy, archer]
      : [heavy, archer, ai.waves % 2 === 0 ? melee : archer];
    const wave = desiredWave.filter(type => stat(game, { type, team }, 'enabled'));
    if (!wave.length || !stat(game, team, 'canRecruit')) return;
    const cost = Q.sum(wave.map(type => stat(game, { type, team }, 'cost')));
    const armySize = game.units.filter(unit => unit.team === team).length;
    if (armySize + wave.length > stat(game, team, 'armyLimit') || !canAfford(game.gold[team], cost)) return;
    for (const type of wave) {
      if (recruit(game, type, team)) ai.orders++;
    }
    ai.waves++;
    return;
  }
  if (game.queues[team].length >= 2) return;
  const army = [
    ...game.units.filter(unit => unit.team === team).map(unit => unit.type),
    ...game.queues[team].map(order => order.type),
  ];
  const frontline = army.filter(type => UNITS[type].role !== 'archer').length;
  const archers = army.filter(type => UNITS[type].role === 'archer').length;
  let type = melee;
  if (frontline > 0 && archers < Math.ceil(frontline / 2)) type = archer;
  else if (ai.orders > 1 && !army.some(type => UNITS[type].role === 'heavy')) type = heavy;
  // Under immediate pressure, buy an affordable defender instead of waiting for armor.
  if (invaders.length && !canAfford(game.gold[team], stat(game, { type, team }, 'cost'))) type = melee;
  if (!stat(game, { type, team }, 'enabled')) type = AGES[game.ages[team]].units.find(candidate => stat(game, { type: candidate, team }, 'enabled'));
  if (type && recruit(game, type, team)) ai.orders++;
}

// All trait attacks enter the same hit/projectile paths as normal attacks.
function traitEffect(game, id, style, x, team, toX) {
  game.traitActivations ??= {};
  game.traitActivations[id] = (game.traitActivations[id] ?? 0) + 1;
  game.effects.push({ kind: 'trait', trait: id, style, x, team, ...(toX === undefined ? {} : { toX }), life: .38, duration: .38 });
}
function traitContext(game, unit, hits, extra = {}) {
  return { unit, stats: attributes(game, unit), time: game.elapsed,
    get allies() { return game.units.filter(other => other.team === unit.team); },
    get enemies() { return game.units.filter(other => other.team !== unit.team); },
    launch(target, kind, damage, options = {}) { addProjectile(game, unit.team, kind, unit.x, target, damage, { sourceId: unit.id, ...options }); },
    strike(target, damage, options = {}) { hits.push({ target, damage, team: unit.team, attacker: unit.type, sourceId: unit.id, melee: true, ...options }); },
    heal(target, amount) { target.hp = Q.min(stat(game, target, 'health'), Q.add(target.hp, amount)); },
    effect(id, style, x, team, toX) {
      traitEffect(game, id, style, x, team, toX);
      if (style === 'throw') unit.traitAnimation = .38;
    }, ...extra };
}
function traitHook(game, unit, hook, hits, extra = {}) {
  if (unit.team !== 'player') return;
  const applicable = unitTraits(unit).some(trait => trait.hooks[hook] && stat(game, unit, trait.stat));
  if (applicable) runTraitHook(hook, traitContext(game, unit, hits, extra));
}

function addProjectile(game, team, kind, x, target, damage, options = {}) {
  const speed = { sling: 460, arrow: 500, bullet: 900, rail: 1150, egg: 650, plasma: 700, 'plasma-orb': 480, rocket: 500, javelin: 620, grenade: 420, canister: 850 }[kind] ?? 420;
  const duration = kind === 'laser' ? 0.1 : ['ion', 'sniper'].includes(kind) ? 0.16 : Math.max(0.12, Math.abs(target.x - x) / speed);
  game.projectiles.push({
    team, kind, fromX: x, toX: target.x,
    fromY: options.fromY ?? -36, fromUnitX: options.fromUnitX, fromTurretX: options.fromTurretX, fromBaseX: options.fromBaseX,
    toY: target.type ? -(UNITS[target.type].height ?? 60) * 0.52 : -45,
    toOffsetX: target.type ? 0 : (team === 'player' ? -1 : 1) * RULES.baseHalfWidth,
    targetId: target.id ?? null, targetBase: target.id == null ? target.team : null,
    damage, duration, remaining: duration, splash: options.splash ?? 0, ignoreArmor: options.ignoreArmor ?? false, armorPierce: options.armorPierce ?? 0,
    arc: options.arc, turretType: options.turretType, field: options.fieldStats,
    pierce: options.pierce ?? 0, pierceFactor: options.pierceFactor, pierceDistance: options.pierceDistance,
    originX: options.originX ?? x, maxRange: options.maxRange ?? Infinity,
    ...Object.fromEntries(['sourceId', 'trait', 'ricochet', 'slow', 'slowDuration', 'secondary', 'ranged'].filter(key => options[key] !== undefined).map(key => [key, options[key]])),
  });
}

export function projectileField(stats) {
  return stats.field ? { kind: stats.field, radius: stats.fieldRadius,
    remaining: stats.fieldDuration, duration: stats.fieldDuration, tickCooldown: stats.tickInterval,
    tickInterval: stats.tickInterval, damage: stats.tickDamage, slow: stats.slow ?? 1 } : null;
}

function updateProjectiles(game, dt, hits) {
  for (const shot of [...game.projectiles]) {
    shot.remaining -= dt;
    const target = shot.targetBase ? game.bases[shot.targetBase] : game.units.find(unit => unit.id === shot.targetId);
    if (target) shot.toX = target.x;
    if (shot.remaining <= 0) {
      const payload = { sourceId: shot.sourceId, slow: shot.slow, slowDuration: shot.slowDuration, trait: shot.trait, secondary: shot.secondary };
      if (shot.splash > 0) {
        // Area shots detonate at their last tracked position even if the target has died.
        for (const victim of game.units) {
          if (victim.team !== shot.team && Math.abs(victim.x - shot.toX) <= shot.splash) {
            hits.push({ ...payload, target: victim, damage: shot.damage, team: shot.team, ignoreArmor: shot.ignoreArmor, armorPierce: shot.armorPierce, visual: false });
          }
        }
        // Siege units can hit a base directly; blast radius never adds extra base damage.
        if (shot.targetBase && (target && Q.gt(target.hp, 0))) hits.push({ ...payload, target, damage: shot.damage, team: shot.team, visual: false });
      } else if ((target && Q.gt(target.hp, 0))) hits.push({ ...payload, target, damage: shot.damage, team: shot.team, ignoreArmor: shot.ignoreArmor, armorPierce: shot.armorPierce, ranged: shot.ranged !== false, visual: false });
      if (shot.splash > 0 || (target && Q.gt(target.hp, 0))) game.effects.push(createProjectileImpact(shot, impactSurface(game, target)));
      if (shot.pierce) {
        const direction = shot.team === 'player' ? 1 : -1;
        const victims = game.units.filter(unit => unit.team !== shot.team && unit.id !== shot.targetId && Q.gt(unit.hp, 0)
          && (unit.x - shot.toX) * direction > 0 && (unit.x - shot.toX) * direction <= shot.pierceDistance
          && Math.abs(unit.x - shot.originX) <= shot.maxRange)
          .sort((a, b) => (a.x - b.x) * direction).slice(0, shot.pierce);
        for (const victim of victims) hits.push({ ...payload, target: victim, damage: Q.mul(shot.damage, shot.pierceFactor), team: shot.team,
          ignoreArmor: shot.ignoreArmor, armorPierce: shot.armorPierce, ranged: shot.ranged !== false, visual: false });
        if (victims.length) game.effects.push({ kind: 'pierce', weapon: shot.kind, x: shot.toX, toX: victims.at(-1).x, y: shot.toY, team: shot.team, life: 0.16, duration: 0.16 });
        for (const victim of victims) game.effects.push(createProjectileImpact({ ...shot, toX: victim.x, targetId: victim.id }, impactSurface(game, victim)));
      }
      if (shot.field) {
        game.fields.push({ ...shot.field, team: shot.team, x: shot.toX, ...(shot.sourceId ? { sourceId: shot.sourceId, trait: shot.trait } : {}) });
        if (shot.trait) traitEffect(game, shot.trait, 'fire', shot.toX, shot.team);
      }
      if (shot.ricochet && target?.type && Q.gt(target.hp, 0)) {
        const direction = shot.team === 'player' ? 1 : -1;
        const next = game.units.filter(unit => unit.team !== shot.team && Q.gt(unit.hp, 0) && (unit.x - target.x) * direction > 0 && Math.abs(unit.x - target.x) <= 110)
          .sort((a, b) => (a.x - b.x) * direction || a.id - b.id)[0];
        if (next) {
          addProjectile(game, shot.team, shot.kind, target.x, next, Q.mul(shot.damage, shot.ricochet), { sourceId: shot.sourceId, fromY: shot.toY, arc: 20, secondary: true, ignoreArmor: shot.ignoreArmor, armorPierce: shot.armorPierce });
          traitEffect(game, shot.trait, 'ricochet', target.x, shot.team, next.x);
        }
      }
    }
  }
  game.projectiles = game.projectiles.filter(shot => shot.remaining > 0);
}

function updateFields(game, dt, hits) {
  for (const unit of game.units) unit.moveMultiplier = (unit.suppressedUntil ?? 0) > game.elapsed ? unit.suppressionMultiplier : 1;
  for (const field of game.fields) {
    const active = Math.min(dt, field.remaining);
    const victims = game.units.filter(unit => unit.team !== field.team && Math.abs(unit.x - field.x) <= field.radius);
    for (const unit of victims) unit.moveMultiplier = Math.min(unit.moveMultiplier, field.slow);
    field.remaining = Math.max(0, field.remaining - active);
    field.tickCooldown -= active;
    while (field.tickCooldown <= EPSILON) {
      for (const unit of victims) hits.push({ sourceId: field.sourceId, target: unit, damage: field.damage, team: field.team, ignoreArmor: true, visual: false });
      field.tickCooldown += field.tickInterval;
    }
  }
  game.fields = game.fields.filter(field => field.remaining > EPSILON);
}

function updateAbility(game, dt, hits) {
  game.abilityCooldown = Math.max(0, game.abilityCooldown - dt);
  if (!game.ability) return;
  const ability = game.ability;
  const stats = ability.stats ?? attributes(game, { kind: 'ability', type: ability.type, team: 'player' });
  if (stats.targeting === 'allies') {
    const healing = Q.mul(stats.healing, Math.min(dt, ability.remaining));
    for (const unit of game.units) {
      if (unit.team === 'player' && Q.gt(unit.hp, 0)) unit.hp = Q.min(stat(game, unit, 'health'), Q.add(unit.hp, healing));
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
      hits.push({ target, damage: stats.damage, team: 'player', ignoreArmor: stats.ignoreArmor, visual: false });
    }
  }
  if (Math.abs(game.bases.enemy.x - x) <= stats.radius + RULES.baseHalfWidth) {
    hits.push({ target: game.bases.enemy, damage: stats.baseDamage, team: 'player', ignoreArmor: true, visual: false });
  }
  game.effects.push({ kind: ability.type, x, radius: stats.radius, life: 0.75, duration: 0.75 });
  ability.wavesLeft--;
  if (ability.wavesLeft > 0) ability.remaining += stats.waveInterval;
  else game.ability = null;
}

export function getUnitChargeTarget(game, unit) {
  return unit.chargeTargetBase ? game.bases[unit.chargeTargetBase]
    : game.units.find(other => other.id === unit.chargeTargetId);
}
function clearUnitCharge(unit) {
  for (const key of ['chargeRemaining', 'chargeDuration', 'chargeTargetId', 'chargeTargetBase']) delete unit[key];
}
function updateUnits(game, dt, hits) {
  const positions = new Map(game.units.map(unit => [unit.id, unit.x]));
  for (const unit of game.units) {
    const stats = attributes(game, unit);
    unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
    unit.attackAnimation = Math.max(0, unit.attackAnimation - dt);
    unit.hitFlash = Math.max(0, unit.hitFlash - dt);
    unit.guardFlash = Math.max(0, (unit.guardFlash ?? 0) - dt);
    if (unit.traitAnimation !== undefined) unit.traitAnimation = Math.max(0, unit.traitAnimation - dt);
    unit.moving = false;
    unit.attackApproach = 0;
    const direction = unit.team === 'player' ? 1 : -1;
    let origin = positions.get(unit.id);
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
    traitHook(game, unit, 'onEngage', hits, { target: closestEnemy, distance: enemyDistance,
      moveToTarget(victim, range) {
        const distance = Math.abs(victim.x - unit.x);
        const step = Math.max(0, Math.min(distance - range, allySpace));
        unit.x += direction * step; unit.distanceTravelled = (unit.distanceTravelled ?? 0) + step;
      } });
    if (unit.x !== origin) { origin = unit.x; positions.set(unit.id, origin); enemyDistance = Math.abs(closestEnemy.x - origin); }
    const baseDistance = Math.abs(base.x - origin) - RULES.baseHalfWidth;
    // An enemy inside the switch band is too close for the rifle: the soldier
    // draws the dagger, walks the remaining gap and keeps its melee cadence.
    const pointBlank = Boolean(stats.canRanged && stats.meleeRange &&
      enemyDistance <= (stats.meleeSwitch ?? stats.meleeRange) + 0.01);
    const baseRange = pointBlank ? stats.meleeRange : stats.baseRange ?? stats.range;
    const reach = pointBlank ? stats.meleeRange : attackRange(stats, closestEnemy);
    const target = enemyDistance <= reach + 0.01 ? closestEnemy : baseDistance <= baseRange + 0.01 ? base : null;
    const prepareAttack = (victim, damage, projectile) => {
      const attack = { damage, projectile, splash: stats.splash, ignoreArmor: stats.ignoreArmor, armorPierce: stats.armorPierce };
      traitHook(game, unit, 'beforeAttack', hits, { target: victim, attack });
      return attack;
    };
    const fire = victim => {
      const attack = prepareAttack(victim, stats.damage, stats.projectile);
      const muzzle = Math.min(stats.muzzleX ?? 0, Math.abs(victim.x - unit.x) * 0.5);
      addProjectile(game, unit.team, stats.sniperRifle ? 'sniper' : attack.projectile, unit.x + direction * muzzle, victim, attack.damage,
        { ...attack, sourceId: unit.id, fromUnitX: unit.x, fromY: stats.muzzleY });
      unit.attackAnimation = stats.attackDuration;
    };
    if (unit.chargeRemaining > 0) {
      const locked = getUnitChargeTarget(game, unit);
      const interrupted = !stats.canRanged || !stats.chargeTime || pointBlank;
      const inRange = locked && Q.gt(locked.hp, 0) && locked.team !== unit.team &&
        (locked.type ? Math.abs(locked.x - unit.x) <= attackRange(stats, locked) + .01
          : Math.abs(locked.x - unit.x) - RULES.baseHalfWidth <= baseRange + .01);
      if (interrupted || !inRange) {
        clearUnitCharge(unit);
        // A replacement target needs a fresh lock. An adjacent enemy can be
        // stabbed immediately; the unfinished beam never deals any damage.
        if (!interrupted) continue;
      } else {
        unit.attackStyle = 'ranged';
        unit.chargeRemaining = Math.max(0, unit.chargeRemaining - dt);
        if (unit.chargeRemaining <= EPSILON) {
          fire(locked); unit.attackCooldown = stats.attackInterval; clearUnitCharge(unit);
        }
        continue;
      }
    }
    if (unit.burstRemaining > 0) {
      const victim = unit.burstTargetBase ? game.bases[unit.burstTargetBase] : game.units.find(other => other.id === unit.burstTargetId);
      const distance = victim ? Math.abs(victim.x - origin) - (victim.type ? 0 : RULES.baseHalfWidth) : Infinity;
      if (!victim || Q.lte(victim.hp, 0) || distance > (victim.type ? stats.range : baseRange) + 0.01) unit.burstRemaining = 0;
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
        const closeCombat = !stats.canRanged || pointBlank ||
          stats.meleeRange && Math.abs(target.x - origin) - (target.type ? 0 : RULES.baseHalfWidth) <= stats.meleeRange;
        if (stats.meleeRange) unit.attackStyle = closeCombat ? 'melee' : 'ranged';
        if (stats.projectile && !closeCombat) {
          if (stats.chargeTime > 0) {
            unit.chargeDuration = unit.chargeRemaining = stats.chargeTime;
            unit.chargeTargetId = target.id ?? null;
            unit.chargeTargetBase = target.type ? null : target.team;
            continue;
          }
          fire(target);
          if (stats.burst) {
            unit.burstRemaining = stats.burst - 1;
            unit.burstCooldown = stats.burstInterval;
            unit.burstTargetId = target.id ?? null;
            unit.burstTargetBase = target.type ? null : target.team;
          }
        } else {
          unit.lastAttackCharged = Boolean(stats.chargeDamage && (unit.chargeTravel ?? 0) >= stats.chargeDistance);
          const attack = prepareAttack(target, Q.add(closeCombat ? stats.meleeDamage ?? stats.damage : stats.damage, unit.lastAttackCharged ? stats.chargeDamage : 0), null);
          hits.push({ ...attack, target, team: unit.team, attacker: unit.type, sourceId: unit.id, melee: true });
          if (stats.cleaveRadius && target.type) {
            const secondary = game.units.filter(other => other !== target && other.team !== unit.team &&
              (positions.get(other.id) - origin) * direction >= 0 && Math.abs(positions.get(other.id) - positions.get(target.id)) <= stats.cleaveRadius)
              .sort((a, b) => Math.abs(positions.get(a.id) - origin) - Math.abs(positions.get(b.id) - origin))[0];
            if (secondary) hits.push({ sourceId: unit.id, secondary: true, melee: true, target: secondary, damage: Q.mul(stats.damage, stats.cleaveFactor), team: unit.team, attacker: unit.type });
          }
        }
        unit.chargeTravel = 0;
        unit.attackCooldown = closeCombat ? stats.meleeInterval ?? stats.attackInterval : stats.attackInterval;
        unit.attackAnimation = stats.attackDuration;
      }
    } else {
      const step = Math.max(0, Math.min(stats.speed * dt, allySpace,
        (enemyDistance - reach) / 2, baseDistance - baseRange));
      unit.x += direction * step;
      unit.moving = step > 0.001;
      unit.distanceTravelled = (unit.distanceTravelled ?? 0) + step;
      unit.chargeTravel = unit.moving ? (unit.chargeTravel ?? 0) + step : 0;
      // Visual anticipation for a ready melee weapon's first approach. Combat
      // still resolves at the existing range and cooldown, without a new delay.
      if ((!stats.projectile || !stats.canRanged) && unit.moving && unit.attackCooldown === 0 && !unit.attackAnimation) {
        const gap = Math.min(enemyDistance - reach, baseDistance - baseRange) - step;
        unit.attackApproach = Math.max(0, Math.min(1, 1 - gap / (stats.speed * 0.22)));
      }
    }
  }
}

function updateTurrets(game, dt) {
  for (const team of TEAMS) {
    for (const turret of game.turrets[team]) {
      if (!turret) continue;
      const stats = attributes(game, turret);
      turret.aim ??= 0; turret.shotSerial ??= 0;
      turret.cooldown = Math.max(0, turret.cooldown - dt);
      turret.flash = Math.max(0, turret.flash - dt);
      const { x, y } = getTurretPosition(game, team, turret.slot);
      const valid = unit => unit && Q.gt(unit.hp, 0) && unit.team !== team && Math.abs(unit.x - x) <= stats.range;
      const lockedId = turret.chargeRemaining > 0 ? turret.chargeTargetId : turret.burstRemaining > 0 ? turret.burstTargetId : null;
      const target = lockedId !== null ? game.units.find(unit => unit.id === lockedId)
        : game.units.filter(valid).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
      if (!valid(target)) {
        turret.burstRemaining = 0; turret.chargeRemaining = 0; turret.chargeTargetId = null;
        continue;
      }
      if (stats.aimable) {
        const toY = -UNITS[target.type].height * 0.52;
        const aim = Math.max(-0.2, Math.min(0.55, Math.atan2(toY - y + 18, Math.abs(target.x - x))));
        turret.aim += (aim - turret.aim) * Math.min(1, dt * 12);
      }
      const fire = () => {
        const barrel = stats.burst ? turret.shotSerial % stats.burst : 0;
        const muzzle = getTurretMuzzle(turret, barrel);
        const direction = team === 'player' ? 1 : -1;
        addProjectile(game, team, stats.projectile, x + muzzle.x * direction, target, stats.damage,
          { ...stats, fromY: y + muzzle.y, fromTurretX: x, fromBaseX: game.bases[team].x, turretType: turret.type, fieldStats: projectileField(stats), originX: x, maxRange: stats.range });
        turret.shotSerial++; turret.lastBarrel = barrel;
        turret.flashDuration = Math.min(0.45, stats.interval * 0.65);
        turret.flash = turret.flashDuration;
      };
      if (turret.burstRemaining > 0) {
        turret.burstCooldown -= dt;
        if (turret.burstCooldown <= EPSILON) {
          fire(); turret.burstRemaining--; turret.burstCooldown += stats.burstInterval;
        }
        continue;
      }
      if (turret.chargeRemaining > 0) {
        turret.chargeRemaining = Math.max(0, turret.chargeRemaining - dt);
        if (turret.chargeRemaining <= EPSILON) { turret.chargeRemaining = 0; fire(); turret.cooldown = stats.interval; }
        continue;
      }
      if (turret.cooldown > EPSILON) continue;
      if (stats.chargeTime) { turret.chargeRemaining = stats.chargeTime; turret.chargeTargetId = target.id; continue; }
      fire(); turret.cooldown = stats.interval;
      turret.burstRemaining = (stats.burst ?? 1) - 1;
      turret.burstTargetId = target.id; turret.burstCooldown = stats.burstInterval ?? 0;
    }
  }
}

function impactSurface(game, target) {
  if (!target) return 'stone';
  if (!target.type) return game.ages[target.team] === 5 ? 'metal' : 'stone';
  const stats = UNITS[target.type];
  return stats.age >= 2 && stats.armor > 0 ? 'metal' : 'soft';
}

function resolveHits(game, hits) {
  // Hooks and secondary hits run in insertion order. Resolve all casualties
  // before removal; kill/death hooks and the existing rewards run once per unit.
  const killers = new Map();
  for (const hit of hits) {
    const stats = hit.target.type ? attributes(game, hit.target) : null;
    const armor = stats && !hit.ignoreArmor ? Q.max(0, Q.sub(stats.armor, hit.armorPierce ?? 0)) : 0;
    hit.guard = hit.ranged && !hit.ignoreArmor ? stats?.rangedReduction ?? 0 : 0;
    const attacker = game.units.find(unit => unit.id === hit.sourceId);
    if (attacker) traitHook(game, attacker, 'onHit', hits, { hit, role: 'attacker', target: hit.target });
    if (stats && Q.gt(hit.target.hp, 0)) traitHook(game, hit.target, 'onHit', hits, { hit, role: 'defender', attacker });
    if (hit.cancelled) continue;
    hit.resolvedDamage = Q.gt(hit.damage, 0) ? Q.max(1, Q.mul(Q.sub(hit.damage, armor), 1 - hit.guard)) : 0;
    if (stats && Q.gt(hit.target.hp, 0) && hit.target.team === 'player' && !hit.secondary) {
      const protector = game.units.filter(unit => unit !== hit.target && unit.team === 'player' && Q.gt(unit.hp, 0)
        && unitTraits(unit).some(trait => trait.protectionRadius && Math.abs(unit.x - hit.target.x) <= trait.protectionRadius && stat(game, unit, trait.stat)))
        .sort((a, b) => Math.abs(a.x - hit.target.x) - Math.abs(b.x - hit.target.x) || a.id - b.id)[0];
      if (protector) traitHook(game, protector, 'onHit', hits, { hit, role: 'protector', absorb(damage) {
        const alive = Q.gt(protector.hp, 0); protector.hp = Q.max(0, Q.sub(protector.hp, damage));
        if (alive && Q.eq(protector.hp, 0)) killers.set(protector.id, attacker);
      } });
    }
    const alive = Q.gt(hit.target.hp, 0);
    hit.target.hp = Q.max(0, Q.sub(hit.target.hp, hit.resolvedDamage));
    if (stats && alive && Q.eq(hit.target.hp, 0)) killers.set(hit.target.id, attacker);
    if (stats && hit.slow && hit.slowDuration) {
      hit.target.suppressedUntil = Math.max(hit.target.suppressedUntil ?? 0, game.elapsed + hit.slowDuration);
      hit.target.suppressionMultiplier = hit.slow;
      traitEffect(game, hit.trait, 'suppression', hit.target.x, hit.team);
    }
    if (hit.guard) hit.target.guardFlash = 0.18;
    hit.target.hitFlash = 0.14;
    if (hit.visual !== false) {
      const direction = hit.team === 'player' ? 1 : -1;
      const style = { melee: 'blunt', heavy: 'bite', swordsman: 'slash', knight: 'thrust', duelist: 'thrust', commando: 'knife', blade: 'blade', superSoldier: 'blade' }[hit.attacker] ?? 'blunt';
      game.effects.push({ kind: 'impact', style, x: hit.target.x - (stats ? 0 : direction * RULES.baseHalfWidth),
        anchorX: stats ? undefined : hit.target.x, y: stats ? -stats.height * 0.52 : -45,
        angle: direction > 0 ? 0 : Math.PI, team: hit.team, surface: impactSurface(game, hit.target), life: 0.22, duration: 0.22 });
    }
  }
  for (const unit of game.units) {
    if (Q.lte(unit.hp, 0)) {
      const killer = killers.get(unit.id);
      if (killer) traitHook(game, killer, 'onKill', hits, { target: unit });
      traitHook(game, unit, 'onDeath', hits, { attacker: killer });
      const winner = otherTeam(unit.team);
      game.gold[winner] = Q.add(game.gold[winner], getBountyReward(game, stat(game, unit, 'bounty'), winner));
      game.experience[winner] = Q.add(game.experience[winner], getExperienceReward(game, stat(game, unit, 'experience'), winner));
      // Losses teach the attacking side too, so a tower-only defense cannot freeze its age.
      game.experience[unit.team] = Q.add(game.experience[unit.team], getExperienceReward(game, Q.floor(Q.mul(stat(game, unit, 'experience'), RULES.casualtyExperienceRate)), unit.team));
    }
  }
  game.units = game.units.filter(unit => Q.gt(unit.hp, 0));
  const playerLost = Q.eq(game.bases.player.hp, 0);
  const enemyLost = Q.eq(game.bases.enemy.hp, 0);
  if (playerLost || enemyLost) game.status = playerLost && enemyLost ? 'draw' : playerLost ? 'lost' : 'won';
}

export function updateGame(game, dt) {
  if (game.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.05);
  game.elapsed += dt;
  for (const team of TEAMS) {
    game.gold[team] = Q.add(game.gold[team], Q.mul(stat(game, team, 'income'), dt));
    game.bases[team].hitFlash = Math.max(0, game.bases[team].hitFlash - dt);
  }
  for (const effect of game.effects) effect.life -= dt;
  game.effects = game.effects.filter(effect => effect.life > 0);
  updateCommander(game, dt);
  for (const team of TEAMS) updateTraining(game, team, dt);
  const hits = [];
  updateFields(game, dt, hits);
  updateProjectiles(game, dt, hits);
  updateAbility(game, dt, hits);
  updateUnits(game, dt, hits);
  updateTurrets(game, dt);
  resolveHits(game, hits);
}
