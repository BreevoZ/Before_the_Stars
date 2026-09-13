import { RULES, UNITS, AGES, createGame, getRecruitState, recruit, cancelTraining, getEvolutionState, evolve, getTurretState, buildTurret, castMeteor, updateGame } from '../src/game.js';

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

test('Fresh match has full bases, equal starting gold, empty queues and a ready ultimate', () => {
  const game = createGame();
  assert(game.status === 'playing' && game.elapsed === 0 && game.units.length === 0);
  assert(Object.values(game.bases).every(base => base.hp === RULES.baseHealth));
  assert(Object.values(game.gold).every(gold => gold === RULES.startingGold));
  assert(game.queues.player.length === 0 && game.queues.enemy.length === 0);
  assert(game.meteorCooldown === 0 && !game.meteor && !game.turrets.player);
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
  assert(!buildTurret(game) && !castMeteor(game, NaN));
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

test('Tower purchase costs gold, has one slot per base, and supports either team', () => {
  const game = isolatedGame();
  for (const team of ['player', 'enemy']) {
    assert(buildTurret(game, team));
    near(game.gold[team], RULES.startingGold - RULES.turretCost);
    assert(getTurretState(game, team) === 'built' && !buildTurret(game, team));
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
  assert(game.projectiles.some(shot => shot.kind === 'cannon'));
  assert(enemy.hp === UNITS.heavy.health);
  advance(game, 0.4);
  const hp = enemy.hp;
  assert(hp === UNITS.heavy.health - RULES.turretDamage + UNITS.heavy.armor);
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
  assert(pressured.turrets.enemy);
  near(pressured.gold.enemy, RULES.startingGold - RULES.turretCost + RULES.goldPerSecond * RULES.fixedStep);
});

test('Meteor waits for impact, hits enemies in the radius, bypasses armor, and spares allies', () => {
  const friendly = soldier('player', 550, 'archer');
  const heavy = soldier('enemy', 600, 'heavy');
  const outside = soldier('enemy', 950, 'archer');
  const game = isolatedGame([friendly, soldier('enemy', 500, 'archer'), heavy, outside]);
  game.units.forEach(unit => unit.attackCooldown = 1000);
  assert(castMeteor(game, 600));
  assert(!castMeteor(game, 800));
  advance(game, 0.5);
  assert(heavy.hp === UNITS.heavy.health);
  advance(game, 0.35);
  assert(heavy.hp === UNITS.heavy.health - RULES.meteorDamage);
  assert(friendly.hp === UNITS.archer.health && outside.hp === UNITS.archer.health);
  assert(game.units.length === 3 && game.meteor === null);
});

test('Meteor damages the enemy base, respects cooldown, and can finish the match', () => {
  const game = isolatedGame();
  assert(castMeteor(game, RULES.enemyBaseX));
  advance(game, 1);
  assert(game.bases.enemy.hp === RULES.baseHealth - RULES.meteorBaseDamage);
  assert(game.bases.player.hp === RULES.baseHealth && !castMeteor(game, 0));
  advance(game, RULES.meteorCooldown);
  assert(castMeteor(game, RULES.enemyBaseX));
  game.bases.enemy.hp = RULES.meteorBaseDamage;
  advance(game, 1);
  assert(game.status === 'won');
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
    assert(!recruit(game) && !buildTurret(game) && !castMeteor(game, 600));
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

test('Complete match: combined troops, a tower, and aimed meteors can win without free gold', () => {
  const game = createGame();
  assert(buildTurret(game));
  const rotation = [2, 1, 0, 1, 0];
  let order = 0;
  advance(game, 300, state => {
    evolve(state);
    const roster = AGES[state.ages.player].units;
    if (state.queues.player.length < 2 && recruit(state, roster[rotation[order % rotation.length]])) order++;
    const enemies = state.units.filter(unit => unit.team === 'enemy');
    if (enemies.length >= 2 && state.meteorCooldown === 0) {
      const target = enemies.reduce((best, unit) => {
        const count = enemies.filter(other => Math.abs(other.x - unit.x) <= RULES.meteorRadius).length;
        return count > best.count ? { x: unit.x, count } : best;
      }, { x: 0, count: 0 });
      castMeteor(state, target.x);
    }
    assert(state.gold.player >= 0 && state.gold.enemy >= 0, 'Neither team may spend unearned gold');
  });
  assert(game.status === 'won', `Got ${game.status} after ${game.elapsed.toFixed(1)}s; bases ${game.bases.player.hp}/${game.bases.enemy.hp}`);
  assert(game.ages.player === 2, 'A full match must earn enough experience to evolve');
});

test('New match resets both economies, queues, AI, tower, ultimate and flying projectiles', () => {
  const old = createGame();
  recruit(old, 'archer'); buildTurret(old); castMeteor(old, 600);
  advance(old, 10);
  const fresh = createGame();
  assert(fresh.gold.player === RULES.startingGold && fresh.queues.player.length === 0 && fresh.queues.enemy.length === 0);
  assert(!fresh.turrets.player && !fresh.turrets.enemy && !fresh.meteor && fresh.meteorCooldown === 0);
  assert(fresh.projectiles.length === 0 && fresh.effects.length === 0 && fresh.units.length === 0);
  assert(fresh.ai.orders === 0 && fresh.ai.cooldown === RULES.aiFirstDecision && fresh.elapsed === 0);
  assert(fresh.queues !== old.queues && fresh.gold !== old.gold);
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
  castMeteor(game, 600);
  advance(game, 1);
  assert(game.experience.player === AGES[1].units.reduce((total, type) => total + UNITS[type].experience, 0));
});

test('Evolution requires the exact threshold, charges no gold, and ends at age two', () => {
  const game = isolatedGame();
  game.experience.player = AGES[2].experienceRequired - 1;
  const before = JSON.stringify(game);
  assert(!evolve(game) && !evolve(game, 'unknown') && JSON.stringify(game) === before);
  game.experience.player++;
  assert(getEvolutionState(game) === 'ready' && evolve(game));
  assert(game.ages.player === 2 && game.gold.player === RULES.startingGold);
  assert(game.experience.player === AGES[2].experienceRequired, 'Experience is cumulative, not spent');
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
  buildTurret(game); castMeteor(game, 1000);
  updateGame(game, RULES.fixedStep);
  const state = JSON.stringify({ turret: game.turrets.player, meteor: game.meteor, cooldown: game.meteorCooldown, shots: game.projectiles });
  game.experience.player = AGES[2].experienceRequired;
  evolve(game);
  assert(JSON.stringify({ turret: game.turrets.player, meteor: game.meteor, cooldown: game.meteorCooldown, shots: game.projectiles }) === state);
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
  el('meteor').click();
  assert(el('meteor').getAttribute('aria-pressed') === 'true' && !el('target-banner').hidden);
  const cancelSpace = new frame.contentWindow.KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
  el('cancel-target').dispatchEvent(cancelSpace);
  assert(!cancelSpace.defaultPrevented && !el('meteor').disabled, 'Space on the cancel button must retain native activation, not cast the spell');
  key('Escape');
  assert(el('target-banner').hidden && !el('meteor').disabled);
  key('KeyQ'); key('ArrowRight'); key('Enter');
  assert(el('meteor').disabled && el('target-banner').hidden && el('meteor-state').textContent.includes('冷却'));
  el('restart').click();
  assert(el('queue-count').textContent === '0 / 5' && el('gold').textContent === '180' && !el('build-turret').disabled && !el('meteor').disabled);
  el('meteor').click();
  const bounds = el('battlefield').getBoundingClientRect();
  el('battlefield').dispatchEvent(new frame.contentWindow.MouseEvent('click', { bubbles: true, clientX: bounds.x + bounds.width * 0.7, clientY: bounds.y + bounds.height / 2 }));
  assert(el('meteor').disabled && el('target-banner').hidden);
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
    if (time > 14000 && Number(el('enemy-count').textContent) >= 2 && !el('meteor').disabled) {
      key('KeyQ'); key('Enter');
    }
    tick();
  }
  assert(!el('evolve').disabled, `Normal play must unlock evolution; ${el('experience-total').textContent}, ${el('result-title').textContent}`);
  const enemyAge = el('enemy-age').textContent;
  const queue = [...page.querySelectorAll('.queue-name')].map(element => element.textContent).join();
  const gold = el('gold').textContent;
  key('KeyE');
  assert(el('player-age').textContent.includes('城堡时代') && el('enemy-age').textContent === enemyAge);
  assert(el('player-health-bar').max === AGES[2].baseHealth && el('evolve').disabled);
  assert(el('gold').textContent === gold && [...page.querySelectorAll('.queue-name')].map(element => element.textContent).join() === queue);
  assert([...page.querySelectorAll('[data-unit]')].map(card => card.dataset.unit).join() === AGES[2].units.join());
  assert(el('recruit-heavy').querySelector('strong').textContent === '重甲骑士');
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
  assert(el('player-age').textContent.includes('部落时代') && el('enemy-age').textContent.includes('部落时代'));
  assert(el('experience-total').textContent === `0 / ${AGES[2].experienceRequired} 经验`);
  assert(el('recruit').dataset.unit === 'melee' && el('evolve').disabled && el('player-health-bar').max === RULES.baseHealth);
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
