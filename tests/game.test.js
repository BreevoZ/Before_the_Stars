import { RULES, UNITS, AGES, TURRETS, ABILITIES, createGame, getRecruitState, recruit, cancelTraining, getEvolutionState, evolve, getTurretState, buildTurret, getExpansionState, expandTurretSlots, sellTurret, getTurretPosition, getAbilityRadius, getAbilityImpactX, castAbility, updateGame } from '../src/game.js';
import { createRenderer } from '../src/render.js';

const tests = [];
const test = (name, run) => tests.push({ name, run });
function assert(condition, message = 'Assertion failed') { if (!condition) throw new Error(message); }
function near(actual, expected, message = '') { assert(Math.abs(actual - expected) < 0.001, `${message} Expected ${expected}, got ${actual}`); }
function advance(game, seconds, action = () => {}) {
  for (let i = 0; i < Math.ceil(seconds / RULES.fixedStep) && game.status === 'playing'; i++) {
    action(game);
    updateGame(game, RULES.fixedStep);
  }
}
let fixtureId = 1000;
function soldier(team, x, type = 'melee', hp = UNITS[type].health) {
  return { id: fixtureId++, team, type, x, hp, attackCooldown: 0, attackAnimation: 0, hitFlash: 0, moving: false };
}
function isolatedGame(units = []) {
  const game = createGame();
  game.ai.enabled = false;
  game.units = units;
  return game;
}
function evolveTo(game, age, team = 'player') {
  game.experience[team] = AGES[age].experienceRequired;
  while (game.ages[team] < age) assert(evolve(game, team));
}

test('Fresh match has full bases, equal starting gold, empty queues and a ready ultimate', () => {
  const game = createGame();
  assert(game.status === 'playing' && game.elapsed === 0 && game.units.length === 0);
  assert(Object.values(game.bases).every(base => base.hp === RULES.baseHealth));
  assert(Object.values(game.gold).every(gold => gold === RULES.startingGold));
  assert(game.queues.player.length === 0 && game.queues.enemy.length === 0);
  assert(game.abilityCooldown === 0 && !game.ability && game.turrets.player.every(tower => tower === null));
  assert(game.ages.player === 1 && game.ages.enemy === 1 && game.experience.player === 0 && game.experience.enemy === 0);
});

test('Both teams receive passive gold at the documented rate', () => {
  const game = isolatedGame();
  advance(game, 10);
  near(game.gold.player, RULES.startingGold + RULES.goldPerSecond * 10);
  near(game.gold.enemy, game.gold.player);
});

test('Three troop choices pay distinct prices and enter a FIFO training queue', () => {
  const game = isolatedGame();
  for (const type of AGES[1].units) assert(recruit(game, type));
  assert(game.units.length === 0, 'Recruiting should not spawn instantly');
  near(game.gold.player, RULES.startingGold - 160);
  advance(game, UNITS.melee.trainTime);
  assert(game.units.length === 1 && game.units[0].type === 'melee');
  near(game.queues.player[0].remaining, UNITS.archer.trainTime, 'Second order must not train in parallel');
  advance(game, UNITS.archer.trainTime);
  assert(game.units[1].type === 'archer');
  advance(game, UNITS.heavy.trainTime);
  assert(game.units[2].type === 'heavy' && game.queues.player.length === 0);
  assert(game.units[2].hp === UNITS.heavy.health);
});

test('Insufficient gold and invalid commands leave the wallet and queue unchanged', () => {
  const game = isolatedGame();
  game.gold.player = 29;
  const before = JSON.stringify(game);
  assert(getRecruitState(game, 'melee') === 'gold');
  assert(!recruit(game) && !recruit(game, 'dragon') && !recruit(game, 'toString') && !recruit(game, 'melee', 'unknown'));
  assert(!buildTurret(game) && !castAbility(game, NaN));
  assert(JSON.stringify(game) === before);
});

test('Queue limit and combined live/reserved army limit prevent over-purchasing', () => {
  const game = isolatedGame();
  for (let i = 0; i < RULES.queueLimit; i++) assert(recruit(game));
  assert(getRecruitState(game) === 'queue-full' && !recruit(game));
  game.queues.player = [];
  game.gold.player = 100;
  game.units = Array.from({ length: RULES.armyLimit - 1 }, (_, i) => soldier('player', 300 + i * 35));
  assert(recruit(game));
  assert(getRecruitState(game) === 'army-full' && !recruit(game));
});

test('Canceling active or waiting training refunds once and preserves the other orders', () => {
  const game = isolatedGame();
  recruit(game, 'heavy'); recruit(game, 'archer'); recruit(game, 'melee');
  const [heavy, archer, melee] = game.queues.player;
  advance(game, 1);
  const before = game.gold.player;
  assert(cancelTraining(game, archer.id));
  near(game.gold.player, before + UNITS.archer.cost);
  assert(!cancelTraining(game, archer.id));
  assert(game.queues.player.map(order => order.id).join() === [heavy.id, melee.id].join());
  assert(cancelTraining(game, heavy.id));
  near(game.queues.player[0].remaining, UNITS.melee.trainTime);
});

test('Completed training waits at a blocked exit without losing the paid order', () => {
  const game = isolatedGame([soldier('player', 138), soldier('enemy', 165, 'heavy', 10000)]);
  game.units.forEach(unit => unit.attackCooldown = 1000);
  recruit(game);
  advance(game, 2);
  assert(game.queues.player.length === 1 && game.queues.player[0].remaining === 0);
  game.units = [];
  updateGame(game, RULES.fixedStep);
  assert(game.units.length === 1 && game.queues.player.length === 0);
});

test('Both armies advance and heavy armor moves more slowly', () => {
  const game = isolatedGame([soldier('player', 200), soldier('enemy', 900, 'heavy')]);
  advance(game, 1);
  near(game.units[0].x, 200 + UNITS.melee.speed);
  near(game.units[1].x, 900 - UNITS.heavy.speed);
});

test('Melee opponents stop at range and do not cross', () => {
  const game = isolatedGame([soldier('player', 500), soldier('enemy', 540)]);
  advance(game, 1);
  assert(game.units[0].x < game.units[1].x);
  assert(game.units.every(unit => unit.hp < UNITS.melee.health));
  near(game.units[1].x - game.units[0].x, UNITS.melee.range);
});

test('Melee damage respects attack intervals and simultaneous deaths remain fair', () => {
  const game = isolatedGame([soldier('player', 500), soldier('enemy', 532)]);
  updateGame(game, RULES.fixedStep);
  assert(game.units.every(unit => unit.hp === UNITS.melee.health - UNITS.melee.damage));
  advance(game, 0.4);
  assert(game.units.every(unit => unit.hp === UNITS.melee.health - UNITS.melee.damage));
  advance(game, 4);
  assert(game.units.length === 0);
});

test('Frontline allies keep spacing while melee troops can pass friendly archers', () => {
  const queued = isolatedGame([soldier('player', 400), soldier('player', 370), soldier('enemy', 432, 'heavy')]);
  advance(queued, 1);
  assert(queued.units[0].x - queued.units[1].x >= RULES.unitSpacing - 0.01);
  const mixed = isolatedGame([soldier('player', 400, 'archer'), soldier('player', 370), soldier('enemy', 570, 'heavy', 10000)]);
  advance(mixed, 2);
  assert(mixed.units.find(unit => unit.type === 'melee').x > mixed.units[0].x, 'Archer must not block the frontline');
});

test('Archers shoot from range, with damage applied only when the arrow arrives', () => {
  const target = soldier('enemy', 660, 'heavy');
  const game = isolatedGame([soldier('player', 500, 'archer'), target]);
  updateGame(game, RULES.fixedStep);
  assert(game.projectiles.length === 1 && target.hp === UNITS.heavy.health);
  advance(game, 0.4);
  assert(target.hp === UNITS.heavy.health - (UNITS.archer.damage - UNITS.heavy.armor));
  assert(game.units[0].hp === UNITS.archer.health);
});

test('Arrows do not transfer damage to a new unit when their original target dies', () => {
  const game = isolatedGame([soldier('player', 500, 'archer'), soldier('enemy', 650)]);
  updateGame(game, RULES.fixedStep);
  const replacement = soldier('enemy', 650);
  game.units[1] = replacement;
  advance(game, 0.5);
  assert(replacement.hp === UNITS.melee.health);
});

test('Heavy armor reduces incoming physical damage', () => {
  const heavy = soldier('enemy', 532, 'heavy');
  const game = isolatedGame([soldier('player', 500), heavy]);
  updateGame(game, RULES.fixedStep);
  assert(heavy.hp === UNITS.heavy.health - UNITS.melee.damage + UNITS.heavy.armor);
});

test('Multiple killing blows pay the casualty bounty only once', () => {
  const game = isolatedGame([soldier('player', 500), soldier('player', 501), soldier('enemy', 530, 'melee', 1)]);
  const gold = game.gold.player;
  updateGame(game, RULES.fixedStep);
  near(game.gold.player, gold + RULES.goldPerSecond * RULES.fixedStep + UNITS.melee.bounty);
  assert(game.experience.player === UNITS.melee.experience && game.experience.enemy === 0);
  advance(game, 0.2);
  near(game.gold.player, gold + RULES.goldPerSecond * game.elapsed + UNITS.melee.bounty);
  assert(game.experience.player === UNITS.melee.experience, 'A casualty must award experience only once');
});

test('Base attacks stop at the wall and nearby defenders take priority', () => {
  const x = RULES.enemyBaseX - RULES.baseHalfWidth - UNITS.melee.range;
  const game = isolatedGame([soldier('player', x)]);
  advance(game, 1);
  assert(game.bases.enemy.hp < RULES.baseHealth && game.units[0].x === x);
  const defended = isolatedGame([soldier('player', x), soldier('enemy', x + 25)]);
  updateGame(defended, RULES.fixedStep);
  assert(defended.bases.enemy.hp === RULES.baseHealth);
});

test('Tower purchase costs gold, starts with one slot per base, and supports either team', () => {
  const game = isolatedGame();
  for (const team of ['player', 'enemy']) {
    assert(buildTurret(game, team));
    near(game.gold[team], RULES.startingGold - TURRETS.stone.cost);
    assert(getTurretState(game, team) === 'full' && !buildTurret(game, team));
  }
});

test('Expansion buys one empty slot at escalating prices, independently, up to four', () => {
  const game = isolatedGame();
  game.gold.player = 500;
  for (const [index, cost] of RULES.turretExpansionCosts.entries()) {
    const gold = game.gold.player;
    assert(expandTurretSlots(game));
    near(game.gold.player, gold - cost);
    assert(game.turrets.player.length === index + 2 && game.turrets.player.every(tower => tower === null));
    assert(game.turrets.enemy.length === 1 && game.gold.enemy === RULES.startingGold);
  }
  assert(game.gold.player === 0 && getExpansionState(game) === 'max-slots');
  const before = JSON.stringify(game);
  assert(!expandTurretSlots(game) && !expandTurretSlots(game, 'unknown') && JSON.stringify(game) === before);
  game.gold.enemy = 99;
  assert(getExpansionState(game, 'enemy') === 'gold' && !expandTurretSlots(game, 'enemy'));
  assert(game.gold.enemy === 99 && game.turrets.enemy.length === 1);
});

test('Building validates age, funds, purchased slots and occupancy without overwriting towers', () => {
  const game = isolatedGame();
  assert(getTurretState(game, 'player', 'stone', 1) === 'slot-locked');
  assert(!buildTurret(game, 'player', 'stone', 1));
  for (const type of AGES[2].turrets) assert(getTurretState(game, 'player', type) === 'locked' && !buildTurret(game, 'player', type));
  for (const slot of [-1, 0.5, 4, NaN]) assert(!buildTurret(game, 'player', 'stone', slot));
  assert(!buildTurret(game, 'player', 'toString') && !buildTurret(game, 'unknown'));
  assert(game.gold.player === RULES.startingGold);
  assert(expandTurretSlots(game));
  assert(getTurretState(game, 'player', 'bone', 1) === 'gold' && !buildTurret(game, 'player', 'bone', 1));
  game.gold.player = 100;
  assert(buildTurret(game, 'player', 'bone', 1) && game.gold.player === 0);
  assert(game.turrets.player[0] === null && game.turrets.player[1].type === 'bone');
  game.gold.player = 500;
  const before = JSON.stringify(game);
  assert(getTurretState(game, 'player', 'stone', 1) === 'occupied' && !buildTurret(game, 'player', 'stone', 1));
  assert(JSON.stringify(game) === before);
});

test('All fifteen tower types launch their own projectile and apply their documented damage and armor rule', () => {
  for (const [type, stats] of Object.entries(TURRETS)) {
    const target = soldier('enemy', 260, 'knight', 5000);
    target.attackCooldown = 1000;
    const game = isolatedGame([target]);
    game.experience.player = AGES[2].experienceRequired;
    evolveTo(game, stats.age);
    game.gold.player = stats.cost;
    assert(buildTurret(game, 'player', type) && game.gold.player === 0, type);
    updateGame(game, RULES.fixedStep);
    assert(game.projectiles.length === 1 && game.projectiles[0].kind === stats.projectile, type);
    assert(target.hp === 5000, `${type} must wait for impact`);
    game.turrets.player[0].cooldown = 1000;
    advance(game, 0.4);
    near(target.hp, 5000 - stats.damage + (stats.ignoreArmor ? 0 : UNITS.knight.armor), type);
  }
});

test('Four towers fire independently from their actual positions and retain distinct cooldowns', () => {
  const game = isolatedGame([soldier('enemy', 240, 'knight', 10000)]);
  game.gold.player = 1500;
  for (let i = 0; i < 3; i++) expandTurretSlots(game);
  ['stone', 'bone', 'firepot', 'bone'].forEach((type, slot) => assert(buildTurret(game, 'player', type, slot)));
  updateGame(game, RULES.fixedStep);
  assert(game.projectiles.length === 4);
  game.projectiles.forEach((shot, slot) => {
    const origin = getTurretPosition(game, 'player', slot);
    assert(shot.fromX === origin.x && shot.fromY === origin.y - 14);
  });
  advance(game, 0.7);
  assert(game.projectiles.length === 2 && game.projectiles.every(shot => shot.kind === 'bone'));
  assert(game.turrets.player[2].cooldown > game.turrets.player[0].cooldown);
});

test('Area tower shots hit nearby enemies after the original target dies, without friendly fire', () => {
  for (const type of ['firepot', 'bombard']) {
    const stats = TURRETS[type];
    const target = soldier('enemy', 260);
    const inside = soldier('enemy', 290, 'knight');
    const outside = soldier('enemy', 260 + stats.splash + 40, 'archer');
    const friendly = soldier('player', 270, 'archer');
    const game = isolatedGame([target, inside, outside, friendly]);
    game.units.forEach(unit => unit.attackCooldown = 1000);
    if (stats.age === 2) { game.experience.player = AGES[2].experienceRequired; evolve(game); }
    game.gold.player = stats.cost;
    buildTurret(game, 'player', type);
    updateGame(game, RULES.fixedStep);
    assert(game.projectiles[0].targetId === target.id);
    game.units = game.units.filter(unit => unit !== target);
    game.turrets.player[0].cooldown = 1000;
    advance(game, 0.4);
    assert(inside.hp === UNITS.knight.health - stats.damage + UNITS.knight.armor, type);
    assert(outside.hp === UNITS.archer.health && friendly.hp === UNITS.archer.health, type);
    assert(game.bases.enemy.hp === RULES.baseHealth && game.bases.player.hp === game.bases.player.maxHp);
  }
});

test('Evolution retains expanded slots and old towers; selling refunds the original price only once', () => {
  const game = isolatedGame([soldier('enemy', 260, 'knight')]);
  game.gold.player = 1000;
  expandTurretSlots(game); expandTurretSlots(game);
  buildTurret(game, 'player', 'firepot', 2);
  updateGame(game, RULES.fixedStep);
  const turret = game.turrets.player[2];
  const shot = game.projectiles[0];
  const opponent = JSON.stringify(game.turrets.enemy);
  game.experience.player = AGES[2].experienceRequired;
  evolve(game);
  assert(game.turrets.player.length === 3 && game.turrets.player[2] === turret && turret.type === 'firepot');
  assert(JSON.stringify(game.turrets.enemy) === opponent && game.ages.enemy === 1);
  for (const type of AGES[1].turrets) assert(getTurretState(game, 'player', type) === 'outdated' && !buildTurret(game, 'player', type));
  assert(buildTurret(game, 'player', 'ballista', 0));
  const gold = game.gold.player;
  assert(sellTurret(game, 2));
  near(game.gold.player, gold + TURRETS.firepot.cost / 2);
  assert(game.turrets.player[2] === null && game.turrets.player.length === 3 && game.projectiles[0] === shot);
  const before = JSON.stringify(game);
  for (const slot of [2, -1, 4, 0.5]) assert(!sellTurret(game, slot));
  assert(!sellTurret(game, 0, 'unknown') && JSON.stringify(game) === before);
  assert(buildTurret(game, 'player', 'repeater', 2));
  advance(game, 0.4);
  assert(game.units[0].hp < UNITS.knight.health, 'Selling must not cancel already fired shots');
});

test('Computer expands a full defense under pressure, reserves training funds, and uses its own age', () => {
  for (const age of [1, 2, 3, 4, 5]) {
    const game = createGame();
    game.elapsed = 20;
    game.gold.enemy = 5000;
    evolveTo(game, age, 'enemy');
    buildTurret(game, 'enemy');
    game.units = [800, 840, 880].map(x => soldier('player', x));
    game.ai.cooldown = 0;
    const gold = game.gold.enemy;
    updateGame(game, RULES.fixedStep);
    assert(game.turrets.enemy.length === 2 && game.turrets.enemy[1] === null);
    near(game.gold.enemy, gold - RULES.turretExpansionCosts[0] + AGES[age].income * RULES.fixedStep);
    game.ai.cooldown = 0;
    updateGame(game, RULES.fixedStep);
    const type = AGES[age].turrets[2];
    assert(game.turrets.enemy[1].type === type);
    near(game.gold.enemy, gold - RULES.turretExpansionCosts[0] - TURRETS[type].cost + AGES[age].income * 2 * RULES.fixedStep);
    assert(game.turrets.player.length === 1 && game.turrets.player[0] === null && game.ages.player === 1);
    near(game.gold.player, RULES.startingGold + RULES.goldPerSecond * 2 * RULES.fixedStep);
  }
});

test('Tower waits for enemies in range, then fires a projectile on cooldown', () => {
  const enemy = soldier('enemy', 700, 'heavy');
  const game = isolatedGame([enemy]);
  buildTurret(game);
  updateGame(game, RULES.fixedStep);
  assert(game.projectiles.length === 0);
  enemy.x = 240;
  updateGame(game, RULES.fixedStep);
  assert(game.projectiles.some(shot => shot.kind === 'stone'));
  assert(enemy.hp === UNITS.heavy.health);
  advance(game, 0.4);
  const hp = enemy.hp;
  assert(hp === UNITS.heavy.health - TURRETS.stone.damage + UNITS.heavy.armor);
  advance(game, 0.4);
  assert(enemy.hp === hp);
});

test('AI pays for training, waits for it to finish, and cannot recruit without funds', () => {
  const game = createGame();
  advance(game, RULES.aiFirstDecision + 0.02);
  assert(game.units.length === 0 && game.queues.enemy.length === 1);
  near(game.gold.enemy, RULES.startingGold + RULES.goldPerSecond * game.elapsed - UNITS.melee.cost);
  advance(game, UNITS.melee.trainTime);
  assert(game.units.some(unit => unit.team === 'enemy'));
  const poor = createGame();
  poor.gold.enemy = 0;
  advance(poor, 3);
  assert(poor.queues.enemy.length === 0 && poor.units.length === 0 && poor.gold.enemy >= 0);
});

test('AI fields all three troop types and buys a defensive tower under pressure', () => {
  const game = createGame();
  const types = new Set();
  advance(game, 35, state => state.units.filter(unit => unit.team === 'enemy').forEach(unit => types.add(unit.type)));
  assert(types.size === 3, `AI used ${[...types].join(', ')}`);
  const pressured = createGame();
  pressured.elapsed = 20;
  pressured.ai.cooldown = 0;
  pressured.units = [800, 840, 880].map(x => soldier('player', x));
  updateGame(pressured, RULES.fixedStep);
  assert(pressured.turrets.enemy[0].type === 'firepot');
  near(pressured.gold.enemy, RULES.startingGold - TURRETS.firepot.cost + RULES.goldPerSecond * RULES.fixedStep);
});

test('Meteor waits for impact, hits enemies in the radius, bypasses armor, and spares allies', () => {
  const friendly = soldier('player', 550, 'archer');
  const heavy = soldier('enemy', 600, 'heavy');
  const outside = soldier('enemy', 950, 'archer');
  const game = isolatedGame([friendly, soldier('enemy', 500, 'archer'), heavy, outside]);
  game.units.forEach(unit => unit.attackCooldown = 1000);
  assert(castAbility(game, 600));
  assert(!castAbility(game, 800));
  advance(game, 0.5);
  assert(heavy.hp === UNITS.heavy.health);
  advance(game, 0.35);
  assert(heavy.hp === UNITS.heavy.health - ABILITIES.meteor.damage);
  assert(friendly.hp === UNITS.archer.health && outside.hp === UNITS.archer.health);
  assert(game.units.length === 3 && game.ability === null);
});

test('Meteor damages the enemy base, respects cooldown, and can finish the match', () => {
  const game = isolatedGame();
  assert(castAbility(game, RULES.enemyBaseX));
  advance(game, 1);
  assert(game.bases.enemy.hp === RULES.baseHealth - ABILITIES.meteor.baseDamage);
  assert(game.bases.player.hp === RULES.baseHealth && !castAbility(game, 0));
  advance(game, ABILITIES.meteor.cooldown);
  assert(castAbility(game, RULES.enemyBaseX));
  game.bases.enemy.hp = ABILITIES.meteor.baseDamage;
  advance(game, 1);
  assert(game.status === 'won');
});

test('Evolving during a falling meteor preserves its impact and cooldown, then unlocks arrow rain', () => {
  const game = isolatedGame();
  castAbility(game, RULES.enemyBaseX);
  advance(game, 0.3);
  const cooldown = game.abilityCooldown;
  game.experience.player = AGES[2].experienceRequired;
  evolve(game);
  assert(game.ability.type === 'meteor' && game.abilityCooldown === cooldown && !castAbility(game, 600));
  advance(game, 0.6);
  assert(game.bases.enemy.hp === RULES.baseHealth - ABILITIES.meteor.baseDamage && !game.ability);
  advance(game, ABILITIES.meteor.cooldown);
  assert(castAbility(game, RULES.enemyBaseX));
  assert(game.ability.type === 'volley' && game.abilityCooldown === ABILITIES.volley.cooldown);
  assert(!castAbility(game, 600));
  advance(game, 0.5);
  assert(game.bases.enemy.hp === RULES.baseHealth - 40 - 12 && game.ability.wavesLeft === 3);
  advance(game, 1.1);
  assert(game.bases.enemy.hp === RULES.baseHealth - 40 - 4 * 12 && !game.ability);
});

test('Arrow rain resolves four physical waves at current positions and spares allies', () => {
  const heavy = soldier('enemy', 600, 'knight');
  const leaving = soldier('enemy', 720, 'knight');
  const entering = soldier('enemy', 1000, 'knight');
  const outside = soldier('enemy', 1000, 'archer');
  const friendly = soldier('player', 600, 'archer');
  const game = isolatedGame([heavy, leaving, entering, outside, friendly]);
  game.units.forEach(unit => unit.attackCooldown = 1000);
  game.experience.player = AGES[2].experienceRequired;
  evolve(game);
  assert(castAbility(game, 600));
  advance(game, 0.4);
  assert(heavy.hp === UNITS.knight.health && game.ability.wavesLeft === 4);
  advance(game, 0.1);
  const damage = ABILITIES.volley.damage - UNITS.knight.armor;
  assert(heavy.hp === UNITS.knight.health - damage && leaving.hp === heavy.hp && entering.hp === UNITS.knight.health);
  leaving.x = 1000;
  entering.x = 720;
  advance(game, 1.1);
  assert(heavy.hp === UNITS.knight.health - damage * 4 && game.ability === null);
  assert(leaving.hp === UNITS.knight.health - damage && entering.hp === UNITS.knight.health - damage * 3);
  assert(outside.hp === UNITS.archer.health && friendly.hp === UNITS.archer.health);
  assert(!castAbility(game, 600) && game.abilityCooldown > 43);
});

test('Arrow rain awards each kill once across overlapping waves', () => {
  const game = isolatedGame([soldier('enemy', 550, 'archer'), soldier('enemy', 650, 'archer')]);
  game.units.forEach(unit => unit.attackCooldown = 1000);
  game.experience.player = AGES[2].experienceRequired;
  evolve(game);
  castAbility(game, 600);
  advance(game, 1.6);
  assert(game.units.length === 0 && game.experience.player === AGES[2].experienceRequired + 2 * UNITS.archer.experience);
  near(game.gold.player, RULES.startingGold + AGES[2].income * game.elapsed + 2 * UNITS.archer.bounty);
});

test('Win/loss freezes economy, training, attacks, support actions, and all timers', () => {
  for (const team of ['player', 'enemy']) {
    const victim = team === 'player' ? 'enemy' : 'player';
    const game = isolatedGame([soldier(team, victim === 'enemy' ? 1086 : 194)]);
    recruit(game);
    game.bases[victim].hp = UNITS.melee.damage;
    updateGame(game, RULES.fixedStep);
    assert(game.status === (team === 'player' ? 'won' : 'lost'));
    const before = JSON.stringify(game);
    updateGame(game, RULES.fixedStep);
    assert(!recruit(game) && !buildTurret(game) && !castAbility(game, 600));
    assert(!expandTurretSlots(game) && !sellTurret(game, 0));
    assert(!evolve(game) && !evolve(game, 'enemy'));
    assert(!cancelTraining(game, game.queues.player[0].id));
    assert(JSON.stringify(game) === before);
  }
});

test('Simultaneous base destruction remains a draw independent of unit order', () => {
  for (const reverse of [false, true]) {
    const units = [soldier('player', 1086), soldier('enemy', 194)];
    const game = isolatedGame(reverse ? units.reverse() : units);
    game.bases.player.hp = UNITS.melee.damage;
    game.bases.enemy.hp = UNITS.melee.damage;
    updateGame(game, RULES.fixedStep);
    assert(game.status === 'draw');
  }
});

test('Complete match: taking no action loses against the computer', () => {
  const game = createGame();
  advance(game, 180);
  assert(game.status === 'lost', `Got ${game.status} after ${game.elapsed.toFixed(1)}s`);
});

test('Complete match: combined troops, a tower, and age-specific abilities can win without free gold', () => {
  const game = createGame();
  assert(buildTurret(game));
  const rotation = [2, 1, 0, 1, 0];
  let order = 0;
  advance(game, 300, state => {
    evolve(state);
    const roster = AGES[state.ages.player].units;
    if (state.queues.player.length < 2 && recruit(state, roster[rotation[order % rotation.length]])) order++;
    const enemies = state.units.filter(unit => unit.team === 'enemy');
    if (enemies.length >= 2 && state.abilityCooldown === 0) {
      const target = enemies.reduce((best, unit) => {
        const count = enemies.filter(other => Math.abs(other.x - unit.x) <= ABILITIES[AGES[state.ages.player].ability].radius).length;
        return count > best.count ? { x: unit.x, count } : best;
      }, { x: 0, count: 0 });
      castAbility(state, target.x);
    }
    assert(state.gold.player >= 0 && state.gold.enemy >= 0, 'Neither team may spend unearned gold');
  });
  assert(game.status === 'won', `Got ${game.status} after ${game.elapsed.toFixed(1)}s; bases ${game.bases.player.hp}/${game.bases.enemy.hp}`);
  assert(game.ages.player >= 2, 'A full match must earn enough experience to evolve');
});

test('New match resets both economies, queues, AI, tower, ultimate and flying projectiles', () => {
  const old = createGame();
  recruit(old, 'archer'); buildTurret(old); castAbility(old, 600);
  advance(old, 10);
  const fresh = createGame();
  assert(fresh.gold.player === RULES.startingGold && fresh.queues.player.length === 0 && fresh.queues.enemy.length === 0);
  assert(fresh.turrets.player.every(tower => tower === null) && fresh.turrets.enemy.every(tower => tower === null) && !fresh.ability && fresh.abilityCooldown === 0);
  assert(fresh.turrets.player.length === 1 && fresh.turrets.enemy.length === 1 && fresh.turrets.player !== old.turrets.player);
  assert(fresh.projectiles.length === 0 && fresh.effects.length === 0 && fresh.units.length === 0);
  assert(fresh.ai.orders === 0 && fresh.ai.cooldown === RULES.aiFirstDecision && fresh.elapsed === 0);
  assert(fresh.queues !== old.queues && fresh.gold !== old.gold);
});

test('Complete match: defend, earn all five ages without free resources, then win with a future army', () => {
  const game = createGame();
  buildTurret(game);
  const reached = new Set([1]);
  let order = 0;
  advance(game, 1000, state => {
    evolve(state);
    const age = AGES[state.ages.player];
    reached.add(state.ages.player);
    if (state.ages.player < 5) {
      const type = age.turrets[2];
      const oldSlot = state.turrets.player.findIndex(tower => tower && TURRETS[tower.type].age < state.ages.player);
      if (oldSlot >= 0 && state.gold.player >= TURRETS[type].cost) { sellTurret(state, oldSlot); buildTurret(state, 'player', type, oldSlot); }
      const expansionCost = RULES.turretExpansionCosts[state.turrets.player.length - 1] ?? Infinity;
      if (!state.turrets.player.includes(null) && state.gold.player >= expansionCost + TURRETS[type].cost) expandTurretSlots(state);
      buildTurret(state, 'player', type);
    } else if (state.queues.player.length < 2 && recruit(state, age.units[[2, 1, 0][order % 3]])) order++;
    const enemies = state.units.filter(unit => unit.team === 'enemy');
    if (age.ability !== 'renewal' && enemies.length >= 2 && state.abilityCooldown === 0) castAbility(state, enemies[0].x);
    assert(state.gold.player >= 0 && state.gold.enemy >= 0);
  });
  assert(reached.size === 5, `Reached ${[...reached]} at ${game.elapsed.toFixed(1)}s; result ${game.status}`);
  assert(game.status === 'won' && order > 0, `Future army must finish the match; result ${game.status}`);
});

test('Experience comes from kills, not waiting, recruitment or cancellation', () => {
  const game = isolatedGame();
  recruit(game); cancelTraining(game, game.queues.player[0].id);
  advance(game, 30);
  assert(game.experience.player === 0 && game.experience.enemy === 0);
  assert(getEvolutionState(game) === 'experience' && !evolve(game));
});

test('Simultaneous casualties award experience independently to both sides', () => {
  const game = isolatedGame([soldier('player', 500, 'melee', 1), soldier('enemy', 532, 'melee', 1)]);
  updateGame(game, RULES.fixedStep);
  assert(game.experience.player === UNITS.melee.experience && game.experience.enemy === UNITS.melee.experience);
});

test('Tower and meteor kills also award the owning side experience', () => {
  for (const team of ['player', 'enemy']) {
    const victim = team === 'player' ? 'enemy' : 'player';
    const game = isolatedGame([soldier(victim, team === 'player' ? 240 : 1040, 'archer', 1)]);
    buildTurret(game, team);
    advance(game, 1);
    assert(game.experience[team] === UNITS.archer.experience && game.experience[victim] === 0);
  }
  const game = isolatedGame(AGES[1].units.map((type, i) => soldier('enemy', 550 + i * 30, type, 1)));
  castAbility(game, 600);
  advance(game, 1);
  assert(game.experience.player === AGES[1].units.reduce((total, type) => total + UNITS[type].experience, 0));
});

test('Evolution requires each exact threshold, charges no gold, and ends at the fifth age', () => {
  const game = isolatedGame();
  for (let age = 2; age <= 5; age++) {
    game.experience.player = AGES[age].experienceRequired - 1;
    const before = JSON.stringify(game);
    assert(!evolve(game) && !evolve(game, 'unknown') && JSON.stringify(game) === before);
    game.experience.player++;
    assert(getEvolutionState(game) === 'ready' && evolve(game));
    assert(game.ages.player === age && game.gold.player === RULES.startingGold);
    assert(game.experience.player === AGES[age].experienceRequired, 'Experience is cumulative, not spent');
    assert(game.bases.player.maxHp === AGES[age].baseHealth && game.ages.enemy === 1);
  }
  assert(getEvolutionState(game) === 'max-age');
  const evolved = JSON.stringify(game);
  assert(!evolve(game) && JSON.stringify(game) === evolved);
});

test('Upgrading one side leaves the opposing age, experience and damaged base unchanged', () => {
  for (const team of ['player', 'enemy']) {
    const other = team === 'player' ? 'enemy' : 'player';
    const game = isolatedGame();
    game.bases[team].hp = 220;
    game.bases[other].hp = 350;
    game.experience[team] = AGES[2].experienceRequired;
    const opponent = JSON.stringify({ base: game.bases[other], xp: game.experience[other] });
    assert(evolve(game, team));
    assert(game.bases[team].hp === 520 && game.bases[team].maxHp === 900);
    assert(game.ages[other] === 1 && JSON.stringify({ base: game.bases[other], xp: game.experience[other] }) === opponent);
  }
});

test('New recruits use only their own current age, including three distinct second-age units', () => {
  const game = isolatedGame();
  for (const type of AGES[2].units) assert(getRecruitState(game, type) === 'locked' && !recruit(game, type));
  game.experience.player = AGES[2].experienceRequired;
  evolve(game);
  assert(getRecruitState(game, 'melee') === 'outdated' && !recruit(game, 'melee'));
  assert(getRecruitState(game, 'swordsman', 'enemy') === 'locked');
  advance(game, 12);
  for (const type of AGES[2].units) assert(recruit(game, type));
  advance(game, 10);
  assert(game.units.map(unit => unit.type).join() === AGES[2].units.join());
  assert(game.units.every(unit => unit.hp === UNITS[unit.type].health));
});

test('Existing troops, old training times, orders and refunds survive evolution', () => {
  const oldSoldier = soldier('player', 400, 'melee', 23);
  const game = isolatedGame([oldSoldier]);
  recruit(game, 'archer'); recruit(game, 'heavy');
  advance(game, 1);
  const queue = JSON.stringify(game.queues.player);
  const unit = JSON.stringify(oldSoldier);
  const refundId = game.queues.player[1].id;
  game.experience.player = AGES[2].experienceRequired;
  assert(evolve(game));
  assert(JSON.stringify(game.queues.player) === queue && JSON.stringify(oldSoldier) === unit);
  const before = game.gold.player;
  assert(cancelTraining(game, refundId));
  near(game.gold.player, before + UNITS.heavy.cost);
  assert(recruit(game, 'crossbow'));
  advance(game, 1.4);
  assert(game.units.some(unit => unit.type === 'archer' && unit.hp === UNITS.archer.health));
  near(game.queues.player[0].remaining, UNITS.crossbow.trainTime);
  advance(game, UNITS.crossbow.trainTime);
  assert(game.units.some(unit => unit.type === 'crossbow' && unit.hp === UNITS.crossbow.health));
});

test('Evolution preserves the existing turret, meteor cooldown and flying projectiles', () => {
  const game = isolatedGame([soldier('player', 500, 'archer'), soldier('enemy', 650)]);
  buildTurret(game); castAbility(game, 1000);
  updateGame(game, RULES.fixedStep);
  const state = JSON.stringify({ turret: game.turrets.player, meteor: game.ability, cooldown: game.abilityCooldown, shots: game.projectiles });
  game.experience.player = AGES[2].experienceRequired;
  evolve(game);
  assert(JSON.stringify({ turret: game.turrets.player, meteor: game.ability, cooldown: game.abilityCooldown, shots: game.projectiles }) === state);
});

test('Crossbow bolts use the new range, damage and impact timing against old troops', () => {
  const target = soldier('enemy', 710, 'heavy');
  const game = isolatedGame([soldier('player', 500, 'crossbow'), target]);
  updateGame(game, RULES.fixedStep);
  assert(game.projectiles[0].kind === 'bolt' && target.hp === UNITS.heavy.health);
  advance(game, 0.55);
  assert(target.hp === UNITS.heavy.health - UNITS.crossbow.damage + UNITS.heavy.armor);
  assert(game.units[0].hp === UNITS.crossbow.health);
});

test('Computer evolves using its own experience and trains the newly unlocked roster', () => {
  const game = createGame();
  game.experience.player = AGES[2].experienceRequired;
  game.experience.enemy = AGES[2].experienceRequired - 1;
  game.ai.cooldown = 0;
  updateGame(game, RULES.fixedStep);
  assert(game.ages.player === 1 && game.ages.enemy === 1, 'Player evolution must remain manual');
  game.experience.enemy++;
  game.ai.cooldown = 0;
  updateGame(game, RULES.fixedStep);
  assert(game.ages.enemy === 2 && game.ages.player === 1);
  assert(game.bases.enemy.maxHp === 900 && game.bases.player.maxHp === 600);
  assert(game.queues.enemy.some(order => UNITS[order.type].age === 2));
  advance(game, 8);
  assert(game.units.some(unit => unit.team === 'enemy' && UNITS[unit.type].age === 2));
});

test('A new match clears both ages and experience, including upgraded base health', () => {
  const old = isolatedGame();
  for (const team of ['player', 'enemy']) { old.experience[team] = 500; evolve(old, team); }
  const fresh = createGame();
  for (const team of ['player', 'enemy']) {
    assert(fresh.ages[team] === 1 && fresh.experience[team] === 0);
    assert(fresh.bases[team].hp === 600 && fresh.bases[team].maxHp === 600);
  }
  assert(fresh.ages !== old.ages && fresh.experience !== old.experience);
});

test('Each side earns its own era income and preserves damage at every evolution', () => {
  const game = isolatedGame();
  game.bases.player.hp -= 123;
  for (let age = 2; age <= 5; age++) {
    evolveTo(game, age);
    near(game.bases.player.hp, AGES[age].baseHealth - 123);
    const playerGold = game.gold.player;
    const enemyGold = game.gold.enemy;
    advance(game, 1);
    near(game.gold.player, playerGold + AGES[age].income);
    near(game.gold.enemy, enemyGold + AGES[1].income);
    assert(game.ages.enemy === 1 && game.bases.enemy.maxHp === AGES[1].baseHealth);
  }
});

test('All nine new units train with their own costs and times; other-era purchases are rejected', () => {
  for (let age = 3; age <= 5; age++) {
    const game = isolatedGame();
    evolveTo(game, age);
    game.gold.player = 3000;
    for (const [type, stats] of Object.entries(UNITS)) {
      if (stats.age !== age) assert(!recruit(game, type));
    }
    for (const type of AGES[age].units) assert(recruit(game, type));
    near(game.gold.player, 3000 - AGES[age].units.reduce((cost, type) => cost + UNITS[type].cost, 0));
    for (const [index, type] of AGES[age].units.entries()) {
      advance(game, UNITS[type].trainTime);
      assert(game.units[index].type === type && game.units[index].hp === UNITS[type].health);
    }
    assert(!game.queues.player.length && !game.queues.enemy.length);
  }
});

test('Paid orders, damaged old troops, expanded platforms and tower refunds survive all four evolutions', () => {
  const oldUnit = soldier('player', 400, 'melee', 20);
  const game = isolatedGame([oldUnit]);
  game.gold.player = 3000;
  expandTurretSlots(game); buildTurret(game, 'player', 'bone', 1);
  recruit(game, 'heavy');
  advance(game, 0.7);
  const order = JSON.stringify(game.queues.player[0]);
  const turret = game.turrets.player[1];
  evolveTo(game, 5);
  assert(game.units[0] === oldUnit && oldUnit.hp === 20);
  assert(JSON.stringify(game.queues.player[0]) === order && game.turrets.player[1] === turret && game.turrets.player.length === 2);
  const gold = game.gold.player;
  cancelTraining(game, game.queues.player[0].id);
  sellTurret(game, 1);
  near(game.gold.player, gold + UNITS.heavy.cost + TURRETS.bone.cost / 2);
  assert(buildTurret(game, 'player', 'ion', 1));
});

test('Cannon, tank and mech shells damage a base directly and splash nearby enemy defenders', () => {
  for (const type of ['cannoneer', 'tank', 'warMachine']) {
    const stats = UNITS[type];
    const unit = soldier('player', RULES.enemyBaseX - RULES.baseHalfWidth - stats.range, type);
    const game = isolatedGame([unit]);
    updateGame(game, RULES.fixedStep);
    assert(game.projectiles.length === 1 && game.projectiles[0].targetBase === 'enemy');
    unit.attackCooldown = 1000;
    const defender = soldier('enemy', RULES.enemyBaseX, 'knight', 1000);
    const friendly = soldier('player', RULES.enemyBaseX, 'archer');
    defender.attackCooldown = 1000; friendly.attackCooldown = 1000;
    game.units.push(defender, friendly);
    advance(game, 0.7);
    near(game.bases.enemy.hp, RULES.baseHealth - stats.damage, type);
    near(defender.hp, 1000 - stats.damage + UNITS.knight.armor, type);
    assert(friendly.hp === UNITS.archer.health, type);
  }
});

test('The futuristic blade pierces armor while gunfire waits for bullet impact', () => {
  const target = soldier('enemy', 536, 'tank');
  const game = isolatedGame([soldier('player', 500, 'blade'), target]);
  updateGame(game, RULES.fixedStep);
  near(target.hp, UNITS.tank.health - UNITS.blade.damage);
  for (const type of ['musketeer', 'rifleman', 'blaster']) {
    const target = soldier('enemy', 700, 'tank');
    target.attackCooldown = 1000;
    const unit = soldier('player', 500, type);
    const game = isolatedGame([unit, target]);
    updateGame(game, RULES.fixedStep);
    assert(game.projectiles[0].kind === UNITS[type].projectile && target.hp === UNITS.tank.health);
    unit.attackCooldown = 1000;
    advance(game, 0.4);
    near(target.hp, UNITS.tank.health - UNITS[type].damage + UNITS.tank.armor);
  }
});

test('Renaissance healing restores living allies over eight seconds, caps health and does not heal bases or enemies', () => {
  const hurt = soldier('player', 400, 'cannoneer', 100);
  const almostFull = soldier('player', 600, 'duelist', UNITS.duelist.health - 2);
  const dead = soldier('player', 500, 'melee', 0);
  const enemy = soldier('enemy', 1000, 'knight', 100);
  const game = isolatedGame([hurt, almostFull, dead, enemy]);
  game.units.forEach(unit => unit.attackCooldown = 1000);
  evolveTo(game, 3);
  game.bases.player.hp -= 100;
  const hp = game.bases.player.hp;
  assert(castAbility(game) && game.ability.type === 'renewal' && !castAbility(game));
  advance(game, 1);
  near(hurt.hp, 118); near(almostFull.hp, UNITS.duelist.health);
  assert(enemy.hp === 100 && game.bases.player.hp === hp && !game.units.includes(dead));
  const newcomer = soldier('player', 200, 'heavy', 10);
  newcomer.attackCooldown = 1000; game.units.push(newcomer);
  evolveTo(game, 4);
  assert(game.ability.type === 'renewal' && !castAbility(game, 600));
  advance(game, 7);
  near(hurt.hp, 244); near(newcomer.hp, 136);
  assert(game.ability === null && game.abilityCooldown > 41);
  advance(game, 0.5);
  near(hurt.hp, 244);
});

test('Modern airstrike sweeps three distinct impact points and only hits units inside each blast', () => {
  const enemies = [460, 600, 740, 940].map(x => soldier('enemy', x, 'knight', 1000));
  const friendly = soldier('player', 600, 'archer');
  const game = isolatedGame([...enemies, friendly]);
  game.units.forEach(unit => unit.attackCooldown = 1000);
  evolveTo(game, 4);
  castAbility(game, 600);
  assert(getAbilityRadius('airstrike') === 235 && getAbilityImpactX(game.ability) === 460);
  const hold = () => enemies.forEach((unit, i) => unit.x = [460, 600, 740, 940][i]);
  advance(game, 0.8, hold);
  assert(enemies.every(unit => unit.hp === 1000));
  advance(game, 0.1, hold);
  near(enemies[0].hp, 1000 - ABILITIES.airstrike.damage + UNITS.knight.armor);
  assert(enemies[1].hp === 1000 && getAbilityImpactX(game.ability) === 600);
  advance(game, 0.4, hold);
  assert(enemies[1].hp === enemies[0].hp && enemies[2].hp === 1000);
  advance(game, 0.4, hold);
  assert(enemies[2].hp === enemies[0].hp && enemies[3].hp === 1000 && friendly.hp === UNITS.archer.health);
  assert(!game.ability && !castAbility(game, 600));
});

test('Orbital strike charges before impact, bypasses armor and damages only the enemy base in range', () => {
  const enemy = soldier('enemy', 1000, 'tank', 1000);
  const outside = soldier('enemy', 700, 'tank', 1000);
  const game = isolatedGame([enemy, outside]);
  game.units.forEach(unit => unit.attackCooldown = 1000);
  evolveTo(game, 5);
  assert(castAbility(game, 1000));
  advance(game, 1);
  assert(enemy.hp === 1000 && game.bases.enemy.hp === RULES.baseHealth);
  advance(game, 0.3);
  near(enemy.hp, 1000 - ABILITIES.orbital.damage);
  assert(outside.hp === 1000 && game.bases.enemy.hp === RULES.baseHealth - ABILITIES.orbital.baseDamage);
  assert(game.bases.player.hp === AGES[5].baseHealth && !game.ability);
});

test('Computer reaches every new age from its own experience and recruits the matching army', () => {
  for (const age of [3, 4, 5]) {
    const game = createGame();
    evolveTo(game, age - 1, 'enemy');
    game.experience.enemy = AGES[age].experienceRequired;
    game.gold.enemy = 1500; game.ai.cooldown = 0;
    updateGame(game, RULES.fixedStep);
    assert(game.ages.enemy === age && game.ages.player === 1);
    assert(game.queues.enemy[0].type === AGES[age].units[0] && game.experience.player === 0);
    advance(game, 18);
    assert(game.units.filter(unit => unit.team === 'enemy').some(unit => unit.type === AGES[age].units[2]));
  }
});

test('Restart clears futuristic defenses, healing and progression without shared match state', () => {
  const old = isolatedGame();
  evolveTo(old, 5); evolveTo(old, 5, 'enemy');
  old.gold.player = 5000; expandTurretSlots(old); buildTurret(old, 'player', 'ion'); castAbility(old, 640);
  const fresh = createGame();
  assert(fresh.ages.player === 1 && fresh.ages.enemy === 1 && fresh.experience.player === 0 && fresh.experience.enemy === 0);
  assert(fresh.bases.player.hp === RULES.baseHealth && fresh.turrets.player.length === 1 && !fresh.turrets.player[0]);
  assert(!fresh.ability && fresh.abilityCooldown === 0 && fresh.gold.player === RULES.startingGold);
});

test('Invalid time deltas cannot corrupt state', () => {
  const game = createGame();
  const before = JSON.stringify(game);
  for (const dt of [0, -1, Infinity, NaN]) updateGame(game, dt);
  assert(JSON.stringify(game) === before);
});

test('Browser UI: purchase, queue/refund, tower, meteor targeting, keyboard, training and reset', async () => {
  const frame = document.createElement('iframe');
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  frame.src = '../'; frame.title = 'Game integration test';
  document.body.append(frame);
  await loaded;
  const page = frame.contentDocument;
  const el = id => page.getElementById(id);
  const key = (code, repeat = false) => page.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { code, repeat, bubbles: true, cancelable: true }));
  el('recruit').click(); el('recruit-archer').click(); el('recruit-heavy').click();
  assert(el('queue-count').textContent === '3 / 5' && el('gold').textContent === '20');
  assert(el('player-count').textContent === '0' && el('recruit').disabled);
  page.querySelectorAll('.queue-slot')[1].click();
  assert(el('queue-count').textContent === '2 / 5' && el('gold').textContent === '65');
  el('restart').click();
  el('build-turret').click();
  assert(el('build-turret').disabled && el('gold').textContent === '60');
  el('ability').click();
  assert(el('ability').getAttribute('aria-pressed') === 'true' && !el('target-banner').hidden);
  const cancelSpace = new frame.contentWindow.KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
  el('cancel-target').dispatchEvent(cancelSpace);
  assert(!cancelSpace.defaultPrevented && !el('ability').disabled, 'Space on the cancel button must retain native activation, not cast the spell');
  key('Escape');
  assert(el('target-banner').hidden && !el('ability').disabled);
  key('KeyQ'); key('ArrowRight'); key('Enter');
  assert(el('ability').disabled && el('target-banner').hidden && el('ability-state').textContent.includes('冷却'));
  el('restart').click();
  assert(el('queue-count').textContent === '0 / 5' && el('gold').textContent === '180' && !el('build-turret').disabled && !el('ability').disabled);
  el('ability').click();
  const bounds = el('battlefield').getBoundingClientRect();
  el('battlefield').dispatchEvent(new frame.contentWindow.MouseEvent('click', { bubbles: true, clientX: bounds.x + bounds.width * 0.7, clientY: bounds.y + bounds.height / 2 }));
  assert(el('ability').disabled && el('target-banner').hidden);
  el('restart').click();
  key('Space'); key('Digit2'); key('Digit3', true);
  assert(el('queue-count').textContent === '2 / 5');
  await new Promise(resolve => setTimeout(resolve, 1850));
  assert(el('player-count').textContent === '1', 'A real browser frame loop must finish training');
  el('restart').click();
  assert(el('player-count').textContent === '0' && el('enemy-count').textContent === '0' && el('clock').textContent === '00:00');
  const canvas = el('battlefield');
  assert(canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3] === 255);
  assert(page.documentElement.scrollWidth <= frame.clientWidth);
});

test('Browser UI: earn experience, evolve independently, replace cards and shortcuts, then reset', async () => {
  const html = await (await fetch('../index.html')).text();
  const frame = document.createElement('iframe');
  frame.title = 'Evolution integration test';
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  // Control only the frame clock; all gold, experience and progression come from normal play.
  const clock = '<script>window.requestAnimationFrame = callback => (window.__testFrame = callback, 1);</script>';
  frame.srcdoc = html.replace('<head>', `<head><base href="${new URL('../', location.href).href}">${clock}`);
  document.body.append(frame);
  await loaded;
  const page = frame.contentDocument;
  const el = id => page.getElementById(id);
  const key = code => page.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
  let time = 0;
  const tick = () => frame.contentWindow.__testFrame(time += 100);
  frame.contentWindow.__testFrame(0);
  el('build-turret').click();
  const rotation = [2, 1, 0, 1, 0];
  let order = 0;
  for (let i = 0; i < 3000 && el('evolve').disabled && el('result').hidden; i++) {
    const card = page.querySelectorAll('[data-unit]')[rotation[order % rotation.length]];
    if (parseInt(el('queue-count').textContent, 10) < 2 && !card.disabled) { card.click(); order++; }
    if (time > 14000 && Number(el('enemy-count').textContent) >= 2 && !el('ability').disabled) {
      key('KeyQ'); key('Enter');
    }
    tick();
  }
  assert(!el('evolve').disabled, `Normal play must unlock evolution; ${el('experience-total').textContent}, ${el('result-title').textContent}`);
  const enemyAge = el('enemy-age').textContent;
  const queue = [...page.querySelectorAll('.queue-name')].map(element => element.textContent).join();
  const gold = el('gold').textContent;
  const abilityState = el('ability-state').textContent;
  key('KeyE');
  assert(el('player-age').textContent.includes('中世纪') && el('enemy-age').textContent === enemyAge);
  assert(el('player-health-bar').max === AGES[2].baseHealth && el('evolve').disabled);
  assert(el('gold').textContent === gold && [...page.querySelectorAll('.queue-name')].map(element => element.textContent).join() === queue);
  assert([...page.querySelectorAll('[data-unit]')].map(card => card.dataset.unit).join() === AGES[2].units.join());
  assert(el('recruit-heavy').querySelector('strong').textContent === '重甲骑士');
  assert([...page.querySelectorAll('[data-turret]')].map(card => card.dataset.turret).join() === AGES[2].turrets.join());
  assert(el('ability-name').textContent === ABILITIES.volley.name && el('ability').dataset.ability === 'volley');
  assert(el('ability-state').textContent === abilityState, 'Evolution must retain the cooldown shown in the UI');
  assert(el('turret-slots').textContent.includes(TURRETS.stone.name), 'Old tower remains visible after evolution');
  for (let i = 0; i < 200 && el('recruit').disabled && el('result').hidden; i++) tick();
  assert(!el('recruit').disabled, 'Second-age recruits must become affordable');
  key('Digit1');
  assert([...page.querySelectorAll('.queue-name')].some(element => element.textContent === '剑士'));
  const preview = document.createElement('img');
  preview.id = 'evolution-preview';
  preview.alt = 'Evolved player castle and independently progressing enemy base';
  preview.style.width = '100%';
  preview.src = el('battlefield').toDataURL('image/png');
  document.body.append(preview);
  el('restart').click();
  assert(el('player-age').textContent.includes('原始时代') && el('enemy-age').textContent.includes('原始时代'));
  assert(el('experience-total').textContent === `0 / ${AGES[2].experienceRequired} 经验`);
  assert(el('recruit').dataset.unit === 'melee' && el('evolve').disabled && el('player-health-bar').max === RULES.baseHealth);
  assert(el('ability-name').textContent === ABILITIES.meteor.name && el('build-turret').dataset.turret === 'stone');
  assert(el('turret-capacity').textContent === '0 / 1 炮位');
});

test('Browser UI: expand, select a slot, build different towers, sell once, and reset capacity', async () => {
  const html = await (await fetch('../index.html')).text();
  const frame = document.createElement('iframe');
  frame.title = 'Defense integration test';
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  const clock = '<script>window.requestAnimationFrame = callback => (window.__testFrame = callback, 1);</script>';
  frame.srcdoc = html.replace('<head>', `<head><base href="${new URL('../', location.href).href}">${clock}`);
  document.body.append(frame);
  await loaded;
  const page = frame.contentDocument;
  const el = id => page.getElementById(id);
  const slots = [...page.querySelectorAll('.turret-slot')];
  const towers = [...page.querySelectorAll('[data-turret]')];
  let time = 0;
  const tick = seconds => { for (let i = 0; i < seconds * 10; i++) frame.contentWindow.__testFrame(time += 100); };
  frame.contentWindow.__testFrame(0);
  assert(slots.length === 4 && slots.slice(1).every(slot => slot.disabled));
  el('expand-turrets').click();
  assert(el('gold').textContent === '80' && el('turret-capacity').textContent === '0 / 2 炮位');
  assert(slots[1].getAttribute('aria-pressed') === 'true' && slots[2].disabled && towers.every(tower => tower.disabled));
  tick(3);
  towers[1].click();
  assert(slots[1].textContent.includes('骨矛塔') && slots[0].getAttribute('aria-pressed') === 'true');
  slots[1].click();
  assert(towers.every(tower => tower.disabled) && !el('sell-turret').hidden && el('sell-turret').textContent.includes('50'));
  const gold = Number(el('gold').textContent);
  el('sell-turret').click();
  assert(Number(el('gold').textContent) === gold + 50 && el('turret-capacity').textContent === '0 / 2 炮位');
  el('sell-turret').click();
  assert(Number(el('gold').textContent) === gold + 50 && el('sell-turret').hidden);
  tick(16);
  assert(!towers[2].disabled);
  towers[2].click();
  assert(slots[1].textContent.includes('火陶塔') && el('turret-capacity').textContent === '1 / 2 炮位');
  el('restart').click();
  assert(el('gold').textContent === '180' && el('turret-capacity').textContent === '0 / 1 炮位');
  assert(slots[0].getAttribute('aria-pressed') === 'true' && slots.slice(1).every(slot => slot.disabled));
});

test('Browser UI: all five rosters, era progress, income, support targeting and future-age cap', async () => {
  const html = await (await fetch('../index.html')).text();
  const frame = document.createElement('iframe');
  frame.title = 'Five-age interface integration test';
  const root = new URL('../', location.href).href;
  // A test-only module substitutes initial resources. Production code has no debug API.
  const source = `${root}src/game.js?ui-fixture`;
  const fixture = URL.createObjectURL(new Blob([`export * from '${source}';
    import { createGame as original } from '${source}';
    export function createGame() { const game = original(); game.gold.player = 10000;
      game.experience.player = 2200; game.ai.enabled = false; return game; }`], { type: 'text/javascript' }));
  const map = JSON.stringify({ imports: { [`${root}src/game.js`]: fixture } });
  const setup = `<base href="${root}"><script type="importmap">${map}</script><script>window.requestAnimationFrame = callback => (window.__testFrame = callback, 1);</script>`;
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  frame.srcdoc = html.replace('<head>', `<head>${setup}`);
  document.body.append(frame);
  await loaded;
  const page = frame.contentDocument;
  const el = id => page.getElementById(id);
  const key = code => page.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
  let time = 0;
  frame.contentWindow.__testFrame(0);
  for (let age = 1; age <= 5; age++) {
    if (age > 1) key('KeyE');
    const config = AGES[age];
    assert(page.body.dataset.age === String(age) && el('player-age').textContent.includes(config.name));
    assert(el('enemy-age').textContent.includes(AGES[1].name) && el('income-rate').textContent === `+${config.income} / 秒`);
    assert(page.querySelectorAll('#era-track li').length === 5 && page.querySelector('#era-track [aria-current]').textContent.includes(config.shortName));
    assert([...page.querySelectorAll('[data-unit]')].map(card => card.dataset.unit).join() === config.units.join());
    assert([...page.querySelectorAll('[data-turret]')].map(card => card.dataset.turret).join() === config.turrets.join());
    assert(el('ability-name').textContent === ABILITIES[config.ability].name);
    for (const code of ['Digit1', 'Digit2', 'Digit3']) key(code);
    assert([...page.querySelectorAll('.queue-name')].slice(0, 3).map(name => name.textContent).join() === config.units.map(type => UNITS[type].name).join());
    page.querySelectorAll('.queue-slot').forEach(() => page.querySelector('.queue-slot').click());
    if (age > 1) el('sell-turret').click();
    key('KeyT');
    assert(el('turret-slots').textContent.includes(TURRETS[config.turrets[0]].name));
    key('KeyQ');
    if (age === 3) {
      assert(el('target-banner').hidden && el('ability-state').textContent.includes('治疗中'));
    } else {
      assert(!el('target-banner').hidden);
      key('Enter');
      assert(el('target-banner').hidden && el('ability-state').textContent.includes('冷却'));
    }
    for (let i = 0; i < 570; i++) frame.contentWindow.__testFrame(time += 100);
    assert(!el('ability').disabled && el('result').hidden);
    if (age < 5) assert(el('evolve-label').textContent.includes(AGES[age + 1].name));
  }
  assert(el('evolve').disabled && el('evolution-hint').textContent.includes('五个时代已全部解锁'));
  assert(el('experience-bar').value === AGES[5].experienceRequired && el('player-health-bar').max === AGES[5].baseHealth);
  URL.revokeObjectURL(fixture);
});

test('Renderer supports six original tower appearances, expanded platforms and both early abilities', () => {
  const game = isolatedGame();
  game.experience.enemy = AGES[2].experienceRequired;
  evolve(game, 'enemy');
  for (const team of ['player', 'enemy']) {
    game.gold[team] = 1500;
    for (let i = 0; i < 3; i++) expandTurretSlots(game, team);
    AGES[game.ages[team]].turrets.forEach((type, slot) => buildTurret(game, team, type, slot));
  }
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;aspect-ratio:8 / 3;display:block';
  document.body.append(canvas);
  const render = createRenderer(canvas);
  function preview(id, alt) {
    render(game);
    assert(canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3] === 255);
    const image = document.createElement('img');
    image.id = id; image.alt = alt; image.style.width = '100%'; image.src = canvas.toDataURL('image/png');
    document.body.append(image);
  }
  castAbility(game, 640);
  advance(game, 0.4);
  preview('defense-preview', 'Three tribal towers, three castle towers, four platforms on each base and a falling meteor');
  advance(game, ABILITIES.meteor.cooldown);
  game.experience.player = AGES[2].experienceRequired;
  evolve(game);
  castAbility(game, 640);
  advance(game, 0.25);
  preview('volley-preview', 'Arrow rain and preserved tribal towers on an evolved castle');
  canvas.remove();
});

test('Renderer supports the three new bases, nine units, nine turrets and three different abilities', () => {
  for (const age of [3, 4, 5]) {
    const game = isolatedGame();
    for (const team of ['player', 'enemy']) {
      evolveTo(game, age, team);
      game.gold[team] = 10000;
      for (let i = 0; i < 3; i++) expandTurretSlots(game, team);
      AGES[age].turrets.forEach((type, slot) => buildTurret(game, team, type, slot));
      AGES[age].units.forEach((type, index) => {
        const unit = soldier(team, team === 'player' ? 310 + index * 100 : 970 - index * 100, type, UNITS[type].health * 0.7);
        unit.attackCooldown = 1000; game.units.push(unit);
      });
    }
    castAbility(game, 680);
    advance(game, 0.25);
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;aspect-ratio:4 / 1;display:block';
    document.body.append(canvas);
    const render = createRenderer(canvas);
    render(game);
    const preview = document.createElement('img');
    preview.id = `age-${age}-preview`; preview.alt = `${AGES[age].name}：基地、三种部队、三种炮塔及${ABILITIES[AGES[age].ability].name}`;
    preview.src = canvas.toDataURL('image/png'); preview.style.width = '100%';
    document.body.append(preview);
    assert(canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3] === 255);
    canvas.remove();
  }
});

let failures = 0;
for (const { name, run } of tests) {
  const item = document.createElement('li');
  try {
    await run(); item.className = 'pass'; item.textContent = `PASS — ${name}`;
  } catch (error) {
    failures++; item.className = 'fail'; item.textContent = `FAIL — ${name}: ${error.message}`;
  }
  document.getElementById('results').append(item);
}
document.getElementById('summary').textContent = `${tests.length - failures}/${tests.length} passed; ${failures} failed`;
document.body.dataset.testStatus = failures ? 'failed' : 'passed';
