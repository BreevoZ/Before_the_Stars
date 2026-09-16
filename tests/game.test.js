import { RULES, UNITS, AGES, TURRETS, ABILITIES, createGame, getRecruitState, recruit, cancelTraining, getEvolutionState, evolve, getTurretState, buildTurret, getExpansionState, expandTurretSlots, sellTurret, getTurretPosition, getTurretMuzzle, getAbilityRadius, getAbilityImpactX, castAbility, updateGame } from '../src/game.js';
import { createRenderer } from '../src/render.js';
import { drawUnit } from '../src/units.js';
import { drawTurret } from '../src/turrets.js';
import { drawBase } from '../src/bases.js';
import { getProjectilePose, getProjectileProfile, createProjectileImpact } from '../src/projectiles.js';
import { drawProjectile, drawImpact, drawFields, drawAbilityImpact } from '../src/combat-effects.js';
import { registerAnimationTests } from './animation-cases.js';

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

test('Slingers shoot from range, with damage applied only when the stone arrives', () => {
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
  assert(game.experience.player === UNITS.melee.experience && game.experience.enemy === Math.floor(UNITS.melee.experience * RULES.casualtyExperienceRate));
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
    near(game.gold[team], RULES.startingGold - TURRETS.rockSling.cost);
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
  assert(getTurretState(game, 'player', 'rockSling', 1) === 'slot-locked');
  assert(!buildTurret(game, 'player', 'rockSling', 1));
  for (const type of AGES[2].turrets) assert(getTurretState(game, 'player', type) === 'locked' && !buildTurret(game, 'player', type));
  for (const slot of [-1, 0.5, 4, NaN]) assert(!buildTurret(game, 'player', 'rockSling', slot));
  assert(!buildTurret(game, 'player', 'toString') && !buildTurret(game, 'unknown'));
  assert(game.gold.player === RULES.startingGold);
  assert(expandTurretSlots(game));
  assert(getTurretState(game, 'player', 'egg', 1) === 'gold' && !buildTurret(game, 'player', 'egg', 1));
  game.gold.player = TURRETS.egg.cost;
  assert(buildTurret(game, 'player', 'egg', 1) && game.gold.player === 0);
  assert(game.turrets.player[0] === null && game.turrets.player[1].type === 'egg');
  game.gold.player = 500;
  const before = JSON.stringify(game);
  assert(getTurretState(game, 'player', 'rockSling', 1) === 'occupied' && !buildTurret(game, 'player', 'rockSling', 1));
  assert(JSON.stringify(game) === before);
});

test('All fifteen towers emit their own projectile and apply documented direct damage and armor rules', () => {
  for (const [type, stats] of Object.entries(TURRETS)) {
    const target = soldier('enemy', 260, 'knight', 5000);
    target.attackCooldown = 1000;
    const game = isolatedGame([target]); evolveTo(game, stats.age); game.gold.player = stats.cost;
    assert(buildTurret(game, 'player', type) && game.gold.player === 0, type);
    for (let i = 0; i < 60 && !game.projectiles.length; i++) { target.x = 260; updateGame(game, RULES.fixedStep); }
    assert(game.projectiles.length === 1 && game.projectiles[0].kind === stats.projectile, type);
    assert(target.hp === 5000, `${type} must wait for impact`);
    const flight = game.projectiles[0].remaining;
    game.turrets.player[0].cooldown = 1000; game.turrets.player[0].burstRemaining = 0;
    advance(game, flight + RULES.fixedStep, () => { target.x = 260; });
    const armor = stats.ignoreArmor ? 0 : Math.max(0, UNITS.knight.armor - (stats.armorPierce ?? 0));
    near(target.hp, 5000 - Math.max(1, stats.damage - armor), type);
  }
});

test('All era sockets mirror across teams, stay fixed through expansion and preserve sold extensions', () => {
  for (let age = 1; age <= 5; age++) {
    const game = isolatedGame();
    for (const team of ['player', 'enemy']) { evolveTo(game, age, team); game.gold[team] = 10000; }
    for (let slot = 0; slot < RULES.maxTurretSlots; slot++) {
      const player = getTurretPosition(game, 'player', slot), enemy = getTurretPosition(game, 'enemy', slot);
      near(player.x + enemy.x, RULES.width); near(player.y, enemy.y);
      if (slot > 0) {
        const before = getTurretPosition(game, 'player', 0);
        for (const team of ['player', 'enemy']) assert(expandTurretSlots(game, team));
        near(getTurretPosition(game, 'player', 0).x, before.x); near(getTurretPosition(game, 'player', 0).y, before.y);
      }
      assert(buildTurret(game, 'player', AGES[age].turrets[0], slot));
      assert(sellTurret(game, slot));
      assert(game.turrets.player.length === slot + 1 && game.turrets.player[slot] === null);
      near(getTurretPosition(game, 'player', slot).y, player.y);
    }
  }
});

test('Every era fires from its architectural sockets, including mirrored mobile muzzle origins', () => {
  for (let age = 1; age <= 5; age++) for (const team of ['player', 'enemy']) {
    const game = isolatedGame(); evolveTo(game, age, team); game.gold[team] = 10000;
    const direction = team === 'player' ? 1 : -1, baseX = game.bases[team].x;
    const target = soldier(team === 'player' ? 'enemy' : 'player', baseX + direction * 160, 'tank', 10000);
    target.attackCooldown = 1000; game.units.push(target);
    for (let i = 0; i < 3; i++) assert(expandTurretSlots(game, team));
    for (let slot = 0; slot < 4; slot++) assert(buildTurret(game, team, AGES[age].turrets[0], slot));
    updateGame(game, RULES.fixedStep); assert(game.projectiles.length === 4);
    game.projectiles.forEach((shot, slot) => {
      const turret = game.turrets[team][slot], muzzle = getTurretMuzzle(turret);
      near(shot.fromBaseX, baseX);
      for (const scale of [1, 1.35]) {
        const socket = getTurretPosition(game, team, slot, scale);
        near(baseX + (shot.fromX - baseX) * scale, socket.x + muzzle.x * direction * scale);
        near(shot.fromY * scale, socket.y + muzzle.y * scale);
      }
    });
  }
});

test('Every purchased socket has continuous building support at desktop and mobile scales', () => {
  const canvas = document.createElement('canvas'); canvas.width = 500; canvas.height = 420;
  const ctx = canvas.getContext('2d'), silhouettes = new Set();
  for (let age = 1; age <= 5; age++) for (let slots = 1; slots <= 4; slots++) {
    const game = isolatedGame();
    for (const team of ['player', 'enemy']) for (const scale of [1, 1.35]) {
      game.ages[team] = age; game.bases[team].x = 250;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(0, 390); drawBase(ctx, game.bases[team], age, 0, scale, slots);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      // Follow opaque structure from the foundation. Curved braces and arches
      // may carry a socket without a solid vertical column directly beneath it.
      const connected = new Uint8Array(canvas.width * canvas.height), queue = [];
      const visit = index => {
        if (index >= 0 && index < connected.length && !connected[index] && pixels[index * 4 + 3] > 240) {
          connected[index] = 1; queue.push(index);
        }
      };
      for (let x = 0; x < canvas.width; x++) visit(389 * canvas.width + x);
      for (let i = 0; i < queue.length; i++) {
        const index = queue[i], x = index % canvas.width;
        if (x > 0) visit(index - 1);
        if (x < canvas.width - 1) visit(index + 1);
        visit(index - canvas.width); visit(index + canvas.width);
      }
      for (let slot = 0; slot < slots; slot++) {
        const mount = getTurretPosition(game, team, slot, scale);
        const pixel = Math.ceil(390 + mount.y + 2) * canvas.width + Math.round(mount.x);
        assert(connected[pixel], `Age ${age}, ${team}, ${slots} sockets, scale ${scale}: socket ${slot} must connect to the foundation`);
      }
      if (team === 'player' && scale === 1) {
        let silhouette = ''; for (let i = 3; i < pixels.length; i += 4) silhouette += pixels[i] > 127 ? '1' : '0';
        silhouettes.add(silhouette);
      }
    }
  }
  assert(silhouettes.size === 20, 'Every era and purchased expansion needs a distinct building silhouette');
});

test('Base eras remain distinguishable as flat silhouettes before and after full expansion', () => {
  const canvas = document.createElement('canvas'); canvas.width = 220; canvas.height = 260;
  const ctx = canvas.getContext('2d');
  for (const slots of [1, 4]) {
    const masks = [];
    for (let age = 1; age <= 5; age++) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 220, 260); ctx.translate(110, 240);
      drawBase(ctx, { x: 0, team: 'player', hp: 600, maxHp: 600 }, age, 0, 1, slots);
      const data = ctx.getImageData(0, 0, 220, 260).data;
      masks.push(Uint8Array.from({ length: 220 * 260 }, (_, i) => data[i * 4 + 3] > 240 ? 1 : 0));
    }
    for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) {
      let union = 0, overlap = 0;
      for (let i = 0; i < masks[a].length; i++) { union += masks[a][i] | masks[b][i]; overlap += masks[a][i] & masks[b][i]; }
      assert(overlap / union < 0.8, `Eras ${a + 1}/${b + 1}, ${slots} sockets: ${(overlap / union * 100).toFixed(1)}% silhouette overlap; color alone must not distinguish eras`);
    }
  }
});

test('Four towers fire independently from their actual positions and retain distinct cooldowns', () => {
  const game = isolatedGame([soldier('enemy', 240, 'knight', 10000)]);
  game.gold.player = 1500;
  for (let i = 0; i < 3; i++) expandTurretSlots(game);
  ['rockSling', 'egg', 'primitiveCatapult', 'egg'].forEach((type, slot) => assert(buildTurret(game, 'player', type, slot)));
  updateGame(game, RULES.fixedStep);
  assert(game.projectiles.length === 4);
  game.projectiles.forEach((shot, slot) => {
    const origin = getTurretPosition(game, 'player', slot);
    const muzzle = getTurretMuzzle(game.turrets.player[slot]);
    near(shot.fromX, origin.x + muzzle.x); near(shot.fromY, origin.y + muzzle.y);
  });
  advance(game, 0.4);
  assert(game.turrets.player[1].shotSerial === 2 && game.turrets.player[3].shotSerial === 2);
  assert(game.turrets.player[0].shotSerial === 1 && game.turrets.player[2].shotSerial === 1);
  assert(game.turrets.player[2].cooldown > game.turrets.player[0].cooldown);
});

test('Area tower shots hit nearby enemies after the original target dies, without friendly fire', () => {
  for (const type of ['primitiveCatapult', 'catapult']) {
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
  buildTurret(game, 'player', 'primitiveCatapult', 2);
  updateGame(game, RULES.fixedStep);
  const turret = game.turrets.player[2];
  const shot = game.projectiles[0];
  const opponent = JSON.stringify(game.turrets.enemy);
  game.experience.player = AGES[2].experienceRequired;
  evolve(game);
  assert(game.turrets.player.length === 3 && game.turrets.player[2] === turret && turret.type === 'primitiveCatapult');
  assert(JSON.stringify(game.turrets.enemy) === opponent && game.ages.enemy === 1);
  for (const type of AGES[1].turrets) assert(getTurretState(game, 'player', type) === 'outdated' && !buildTurret(game, 'player', type));
  assert(buildTurret(game, 'player', 'catapult', 0));
  const gold = game.gold.player;
  assert(sellTurret(game, 2));
  near(game.gold.player, gold + TURRETS.primitiveCatapult.cost / 2);
  assert(game.turrets.player[2] === null && game.turrets.player.length === 3 && game.projectiles[0] === shot);
  const before = JSON.stringify(game);
  for (const slot of [2, -1, 4, 0.5]) assert(!sellTurret(game, slot));
  assert(!sellTurret(game, 0, 'unknown') && JSON.stringify(game) === before);
  assert(buildTurret(game, 'player', 'fireCatapult', 2));
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
    const type = ['primitiveCatapult', 'fireCatapult', 'explosiveCannon', 'rocket', 'ion'][age - 1];
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
  assert(hp === UNITS.heavy.health - TURRETS.rockSling.damage + UNITS.heavy.armor);
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
  pressured.gold.enemy = TURRETS.primitiveCatapult.cost;
  pressured.ai.cooldown = 0;
  pressured.units = [800, 840, 880].map(x => soldier('player', x));
  updateGame(pressured, RULES.fixedStep);
  assert(pressured.turrets.enemy[0].type === 'primitiveCatapult');
  near(pressured.gold.enemy, RULES.goldPerSecond * RULES.fixedStep);
});

test('The computer saves for paid siege waves against towers and trains the heavy unit first', () => {
  const game = createGame();
  buildTurret(game);
  const cost = UNITS.heavy.cost + UNITS.archer.cost + UNITS.melee.cost;
  game.gold.enemy = cost - 1;
  game.ai.cooldown = 0;
  updateGame(game, RULES.fixedStep);
  assert(game.ai.strategy === 'siege' && !game.queues.enemy.length && !game.units.length);
  near(game.gold.enemy, cost - 1 + AGES[1].income * RULES.fixedStep);
  game.gold.enemy = cost; game.ai.cooldown = 0;
  updateGame(game, RULES.fixedStep);
  assert(game.queues.enemy.map(order => order.type).join() === 'heavy,archer,melee');
  near(game.gold.enemy, AGES[1].income * RULES.fixedStep);
  assert(game.ai.orders === 3 && game.ai.waves === 1 && !game.units.length);
  advance(game, UNITS.heavy.trainTime);
  assert(game.units[0].type === 'heavy' && game.units[0].team === 'enemy');
});

test('Later-age siege waves favor two siege units, obey army capacity and use their own age', () => {
  for (const age of [3, 4, 5]) {
    const game = createGame();
    game.gold.player = 1000; expandTurretSlots(game); buildTurret(game); buildTurret(game);
    evolveTo(game, age, 'enemy');
    const [, archer, heavy] = AGES[age].units;
    const cost = 2 * UNITS[heavy].cost + UNITS[archer].cost;
    game.gold.enemy = cost;
    game.units = Array.from({ length: RULES.armyLimit - 2 }, (_, i) => soldier('enemy', 700 + i * 30));
    game.ai.cooldown = 0;
    updateGame(game, RULES.fixedStep);
    assert(!game.queues.enemy.length && game.ai.waves === 0, 'Do not partially buy an over-capacity wave');
    game.units.pop(); game.ai.cooldown = 0;
    updateGame(game, RULES.fixedStep);
    assert(game.queues.enemy.map(order => order.type).join() === [heavy, heavy, archer].join());
    near(game.gold.enemy, AGES[age].income * RULES.fixedStep * 2);
    assert(game.ages.player === 1);
  }
});

test('Computer abandons siege saving when player troops threaten its base', () => {
  const game = createGame();
  buildTurret(game);
  game.gold.enemy = UNITS.melee.cost;
  game.ai.cooldown = 0;
  updateGame(game, RULES.fixedStep);
  assert(game.ai.strategy === 'siege' && !game.queues.enemy.length);
  game.units.push(soldier('player', 1000));
  game.ai.cooldown = 0;
  updateGame(game, RULES.fixedStep);
  assert(game.ai.strategy === 'balanced' && game.queues.enemy[0].type === 'melee');
  assert(game.ai.waves === 0 && game.gold.enemy >= 0);
});

test('Siege AI does not inspect the player wallet or hidden training queue', () => {
  const first = createGame();
  const second = createGame();
  buildTurret(first); buildTurret(second);
  second.gold.player = 2000;
  for (let i = 0; i < RULES.queueLimit; i++) recruit(second, 'heavy');
  for (const game of [first, second]) { game.ai.cooldown = 0; updateGame(game, RULES.fixedStep); }
  const orders = game => game.queues.enemy.map(({ type, remaining }) => ({ type, remaining }));
  assert(first.ai.strategy === second.ai.strategy && JSON.stringify(orders(first)) === JSON.stringify(orders(second)));
  near(first.gold.enemy, second.gold.enemy);
});

test('Computer recruits interceptors instead of buying out-ranged towers under siege', () => {
  for (const type of ['cannoneer', 'tank', 'warMachine']) {
    const game = createGame();
    buildTurret(game);
    game.elapsed = 20; game.ai.cooldown = 0;
    game.bases.enemy.hp = 300;
    const attacker = soldier('player', RULES.enemyBaseX - RULES.baseHalfWidth - UNITS[type].baseRange, type);
    game.units.push(attacker);
    updateGame(game, RULES.fixedStep);
    assert(game.ai.strategy === 'balanced' && game.turrets.enemy[0] === null);
    assert(game.queues.enemy[0].type === 'melee');
    near(game.gold.enemy, RULES.startingGold - UNITS.melee.cost + AGES[1].income * RULES.fixedStep);
  }
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
  advance(game, 600, state => {
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
  assert(fresh.ai.strategy === 'balanced' && fresh.ai.waves === 0);
  assert(fresh.queues !== old.queues && fresh.gold !== old.gold);
});

test('Complete match: tower-only camping cannot freeze the computer and is broken by siege units', () => {
  const game = createGame();
  buildTurret(game);
  advance(game, 360, state => {
    evolve(state);
    const age = AGES[state.ages.player];
    const type = age.turrets[2];
    const oldSlot = state.turrets.player.findIndex(tower => tower && TURRETS[tower.type].age < state.ages.player);
    if (oldSlot >= 0 && state.gold.player >= TURRETS[type].cost) { sellTurret(state, oldSlot); buildTurret(state, 'player', type, oldSlot); }
    const expansionCost = RULES.turretExpansionCosts[state.turrets.player.length - 1] ?? Infinity;
    if (!state.turrets.player.includes(null) && state.gold.player >= expansionCost + TURRETS[type].cost) expandTurretSlots(state);
    buildTurret(state, 'player', type);
    const enemies = state.units.filter(unit => unit.team === 'enemy');
    if (age.ability !== 'renewal' && enemies.length >= 2 && state.abilityCooldown === 0) castAbility(state, enemies[0].x);
    assert(state.gold.player >= 0 && state.gold.enemy >= 0);
    assert(!state.units.some(unit => unit.team === 'player') && !state.queues.player.length);
  });
  assert(game.ages.enemy >= 3 && game.experience.enemy >= AGES[3].experienceRequired, 'Computer must evolve from losses without killing any player troops');
  assert(game.status === 'lost' && game.ai.waves > 0, `Siege must threaten unattended towers; ${game.status} after ${game.elapsed.toFixed(1)}s`);
});

test('Combat experience cannot be farmed by waiting, recruitment or cancellation', () => {
  const game = isolatedGame();
  recruit(game); cancelTraining(game, game.queues.player[0].id);
  advance(game, 30);
  assert(game.experience.player === 0 && game.experience.enemy === 0);
  assert(getEvolutionState(game) === 'experience' && !evolve(game));
});

test('Simultaneous casualties award experience independently to both sides', () => {
  const game = isolatedGame([soldier('player', 500, 'melee', 1), soldier('enemy', 532, 'melee', 1)]);
  updateGame(game, RULES.fixedStep);
  assert(game.experience.player === UNITS.melee.experience + Math.floor(UNITS.melee.experience * RULES.casualtyExperienceRate));
  assert(game.experience.enemy === game.experience.player);
});

test('Every casualty grants its own side 75 percent experience once, with gold only for the killer', () => {
  for (const victim of ['player', 'enemy']) {
    for (const [type, stats] of Object.entries(UNITS)) {
      const winner = victim === 'player' ? 'enemy' : 'player';
      const casualty = soldier(victim, 532, type, 1);
      casualty.attackCooldown = 1000;
      const game = isolatedGame([soldier(winner, 500), casualty]);
      updateGame(game, RULES.fixedStep);
      assert(!game.units.includes(casualty));
      assert(game.experience[victim] === Math.floor(stats.experience * RULES.casualtyExperienceRate));
      assert(game.experience[winner] === stats.experience);
      near(game.gold[victim], RULES.startingGold + AGES[1].income * RULES.fixedStep);
      near(game.gold[winner], RULES.startingGold + stats.bounty + AGES[1].income * RULES.fixedStep);
      advance(game, 1);
      assert(game.experience[victim] === Math.floor(stats.experience * RULES.casualtyExperienceRate));
      assert(game.experience[winner] === stats.experience);
    }
  }
});

test('Losing troops to a tower unlocks computer evolution while player evolution remains manual', () => {
  const game = createGame();
  game.units = Array.from({ length: 8 }, (_, i) => soldier('enemy', 240 + i * 2, 'archer', 1));
  game.units.forEach(unit => unit.attackCooldown = 1000);
  game.gold.player = TURRETS.primitiveCatapult.cost;
  assert(buildTurret(game, 'player', 'primitiveCatapult'));
  advance(game, 0.8);
  assert(!game.units.length && game.experience.enemy === 168 && game.experience.player === 224);
  assert(game.ages.player === 1 && game.ages.enemy === 1);
  game.ai.cooldown = 0;
  updateGame(game, RULES.fixedStep);
  assert(game.ages.enemy === 2 && game.ages.player === 1 && getEvolutionState(game) === 'ready');
  advance(game, 8);
  assert(game.queues.enemy[0].type === 'knight');
});

test('Siege units can bombard bases beyond same-age towers, but keep their shorter anti-unit range', () => {
  for (const type of ['cannoneer', 'tank', 'warMachine']) {
    for (const team of ['player', 'enemy']) {
      const victim = team === 'player' ? 'enemy' : 'player';
      const stats = UNITS[type];
      const game = isolatedGame();
      evolveTo(game, stats.age, victim);
      game.gold[victim] = 10000;
      for (let i = 0; i < 3; i++) expandTurretSlots(game, victim);
      AGES[stats.age].turrets.forEach((type, slot) => buildTurret(game, victim, type, slot));
      const direction = team === 'player' ? -1 : 1;
      const x = game.bases[victim].x + direction * (RULES.baseHalfWidth + stats.baseRange);
      const unit = soldier(team, x, type);
      game.units.push(unit);
      advance(game, 2);
      assert(game.bases[victim].hp < game.bases[victim].maxHp && unit.hp === stats.health, type);
      near(unit.x, x);
      const defender = soldier(victim, x + direction * (stats.range + 35), 'heavy');
      defender.attackCooldown = 1000;
      game.units.push(defender);
      unit.attackCooldown = 0;
      updateGame(game, RULES.fixedStep);
      assert(game.projectiles.at(-1).targetBase === victim, 'Extended base range must not also extend anti-unit range');
      defender.x = x + direction * 30;
      unit.attackCooldown = 0;
      updateGame(game, RULES.fixedStep);
      assert(game.projectiles.at(-1).targetId === defender.id, 'Nearby troops must intercept siege fire');
    }
  }
});

test('Tower and meteor kills also award the owning side experience', () => {
  for (const team of ['player', 'enemy']) {
    const victim = team === 'player' ? 'enemy' : 'player';
    const game = isolatedGame([soldier(victim, team === 'player' ? 240 : 1040, 'archer', 1)]);
    buildTurret(game, team);
    advance(game, 1);
    assert(game.experience[team] === UNITS.archer.experience && game.experience[victim] === Math.floor(UNITS.archer.experience * RULES.casualtyExperienceRate));
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

test('Longbow arrows use medieval range, damage and impact timing against old troops', () => {
  const target = soldier('enemy', 710, 'heavy');
  const game = isolatedGame([soldier('player', 500, 'crossbow'), target]);
  updateGame(game, RULES.fixedStep);
  assert(game.projectiles[0].kind === 'arrow' && target.hp === UNITS.heavy.health);
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
  expandTurretSlots(game); buildTurret(game, 'player', 'egg', 1);
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
  near(game.gold.player, gold + UNITS.heavy.cost + TURRETS.egg.cost / 2);
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
    advance(game, 0.65);
    const stats = UNITS[type];
    const armor = stats.ignoreArmor ? 0 : Math.max(0, UNITS.tank.armor - (stats.armorPierce ?? 0));
    near(target.hp, UNITS.tank.health - (stats.damage - armor) * (stats.burst ?? 1), type);
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
  assert(el('turret-slots').textContent.includes(TURRETS.rockSling.name), 'Old tower remains visible after evolution');
  for (let i = 0; i < 200 && el('recruit').disabled && el('result').hidden; i++) tick();
  assert(!el('recruit').disabled, 'Second-age recruits must become affordable');
  key('Digit1');
  assert([...page.querySelectorAll('.queue-name')].some(element => element.textContent === UNITS.swordsman.name));
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
  assert(el('ability-name').textContent === ABILITIES.meteor.name && el('build-turret').dataset.turret === 'rockSling');
  assert(el('turret-capacity').textContent === '0 / 1');
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
  assert(el('gold').textContent === '80' && el('turret-capacity').textContent === '0 / 2');
  assert(slots[1].getAttribute('aria-pressed') === 'true' && slots[2].disabled && towers.every(tower => tower.disabled));
  tick(11);
  towers[1].click();
  assert(slots[1].textContent.includes(TURRETS.egg.name) && slots[0].getAttribute('aria-pressed') === 'true');
  slots[1].click();
  assert(towers.every(tower => tower.disabled) && !el('sell-turret').hidden && el('sell-turret').textContent.includes(String(TURRETS.egg.cost / 2)));
  const gold = Number(el('gold').textContent);
  el('sell-turret').click();
  assert(Number(el('gold').textContent) === gold + TURRETS.egg.cost / 2 && el('turret-capacity').textContent === '0 / 2');
  el('sell-turret').click();
  assert(Number(el('gold').textContent) === gold + TURRETS.egg.cost / 2 && el('sell-turret').hidden);
  tick(22);
  assert(!towers[2].disabled);
  towers[2].click();
  assert(slots[1].textContent.includes(TURRETS.primitiveCatapult.name) && el('turret-capacity').textContent === '1 / 2');
  el('restart').click();
  assert(el('gold').textContent === '180' && el('turret-capacity').textContent === '0 / 1');
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
    assert(el('enemy-age').textContent.includes(AGES[1].name) && el('income-rate').textContent === `+${config.income}/s`);
    assert(page.querySelectorAll('#era-track li').length === 5 && page.querySelector('#era-track [aria-current]').textContent.includes(config.shortName));
    assert([...page.querySelectorAll('[data-unit]')].map(card => card.dataset.unit).join() === config.units.join());
    assert([...page.querySelectorAll('[data-turret]')].map(card => card.dataset.turret).join() === config.turrets.join());
    assert(el('ability-name').textContent === ABILITIES[config.ability].name);
    assert(el('player-era').textContent === config.numeral);
    const roster = [...config.units.map(type => UNITS[type]), ...config.turrets.map(type => TURRETS[type])];
    assert([...page.querySelectorAll('[data-unit], [data-turret]')].every((card, index) =>
      card.querySelector('svg') && card.getAttribute('aria-label').includes(roster[index].name) && card.title.includes(roster[index].name)),
      'Icon actions must keep accessible names and inspectable descriptions in every age');
    assert(roster.every(stats => el('help-roster').textContent.includes(stats.name)), 'The manual must follow the current age');
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


test('Browser UI: help exposes icon details, pauses training/income/cooldowns, blocks shortcuts and resumes', async () => {
  const html = await (await fetch('../index.html')).text();
  const frame = document.createElement('iframe');
  frame.title = 'Minimal interface and help integration test';
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  const clock = '<script>window.requestAnimationFrame = callback => (window.__testFrame = callback, 1);</script>';
  frame.srcdoc = html.replace('<head>', `<head><base href="${new URL('../', location.href).href}">${clock}`);
  document.body.append(frame);
  await loaded;
  const page = frame.contentDocument;
  const el = id => page.getElementById(id);
  const key = code => page.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
  let time = 0;
  const tick = count => { for (let i = 0; i < count; i++) frame.contentWindow.__testFrame(time += 100); };
  frame.contentWindow.__testFrame(0);
  el('recruit').click();
  key('KeyQ'); key('Enter');
  const snapshot = () => ['gold', 'queue-count', 'player-count', 'clock', 'ability-state'].map(id => el(id).textContent).join('|');
  const before = snapshot();
  el('help').click();
  assert(el('help-dialog').open && el('phase').textContent === '已暂停');
  assert(el('help-roster').querySelectorAll('.help-unit').length === 6 && el('help-roster').textContent.includes('70 生命'));
  assert(el('recruit').querySelector('.unit-icon svg') && el('recruit').title.includes(UNITS.melee.name) && el('recruit').querySelector('.unit-icon canvas'));
  assert(el('expand-turrets').getAttribute('aria-label').includes('100 金币'));
  key('Digit1'); key('KeyE'); key('KeyQ'); key('KeyT'); key('Space');
  tick(150);
  assert(snapshot() === before, 'Reading help must not change resources, training, battle time or ability cooldown');
  key('Escape');
  assert(!el('help-dialog').open && el('phase').textContent === '交战中');
  tick(22);
  assert(el('player-count').textContent === '1' && Number(el('gold').textContent) > 150, 'Closing help must resume the same battle without a time jump');
  assert(el('clock').textContent === '00:02' && el('ability-timer').textContent === '38s');
  page.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { code: 'Slash', shiftKey: true, bubbles: true, cancelable: true }));
  assert(el('help-dialog').open, 'The help shortcut must be reachable from the keyboard');
  el('close-help').click();
  assert(!el('help-dialog').open);
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

// Unit identities have mechanical differences, in addition to their silhouettes.
test('Dinosaur bite cleaves one nearby enemy, never a third target or a friendly unit', () => {
  for (const team of ['player', 'enemy']) {
    const other = team === 'player' ? 'enemy' : 'player', direction = team === 'player' ? 1 : -1;
    const dino = soldier(team, 640, 'heavy');
    const victims = [60, 85, 110].map(offset => soldier(other, 640 + direction * offset, 'melee', 200));
    const ally = soldier(team, 640 + direction * 80, 'archer');
    const game = isolatedGame([dino, ...victims, ally]);
    game.units.forEach(unit => unit.attackCooldown = 1000); dino.attackCooldown = 0;
    updateGame(game, RULES.fixedStep);
    near(victims[0].hp, 174); near(victims[1].hp, 188.3);
    near(victims[2].hp, 200); near(ally.hp, UNITS.archer.health);
  }
});

test('Mounted knight earns one charge from actual movement and consumes it on the first hit', () => {
  const knight = soldier('player', 300, 'knight');
  const target = soldier('enemy', 700, 'melee', 1000); target.attackCooldown = 1000;
  const game = isolatedGame([knight, target]);
  for (let i = 0; i < 360 && target.hp === 1000; i++) { target.x = 700; updateGame(game, RULES.fixedStep); }
  near(target.hp, 926, 'First hit includes the 32-point charge');
  assert(knight.lastAttackCharged && knight.distanceTravelled >= 80 && knight.chargeTravel === 0);
  knight.attackCooldown = 0; updateGame(game, RULES.fixedStep);
  near(target.hp, 884, 'A stationary second hit has no charge bonus');
  assert(!knight.lastAttackCharged);
});

test('Large mounts need their full footprint at the spawn point and in the friendly queue', () => {
  const knight = soldier('player', 210, 'knight');
  const blocker = soldier('enemy', 300, 'heavy', 10000);
  const game = isolatedGame([knight, blocker]);
  game.units.forEach(unit => unit.attackCooldown = 1000); evolveTo(game, 2);
  assert(recruit(game, 'knight')); advance(game, 5);
  assert(game.queues.player.length === 1 && game.queues.player[0].remaining === 0);
  knight.x = 230; updateGame(game, RULES.fixedStep);
  assert(game.queues.player.length === 0);
  const newcomer = game.units.find(unit => unit.team === 'player' && unit !== knight);
  assert(knight.x - newcomer.x >= UNITS.knight.footprint * 2);
});

test('Shield stops ordinary direct projectiles; armor-piercing musket and area cannon bypass it', () => {
  for (const [type, expected] of [['archer', 9.1], ['musketeer', 60], ['cannoneer', 94]]) {
    const attacker = soldier('player', 500, type), defender = soldier('enemy', 660, 'swordsman', 500);
    defender.attackCooldown = 1000;
    const game = isolatedGame([attacker, defender]);
    updateGame(game, RULES.fixedStep); attacker.attackCooldown = 1000;
    for (let i = 0; i < 100 && defender.hp === 500; i++) updateGame(game, RULES.fixedStep);
    near(defender.hp, 500 - expected, type);
    if (type === 'archer') assert(defender.guardFlash > 0);
    else assert(!defender.guardFlash);
  }
});

test('Rapier and plasma penetrate different armor amounts while the light blade ignores all armor', () => {
  for (const [type, expected] of [['duelist', 18], ['blaster', 79], ['blade', 90]]) {
    const attacker = soldier('player', 500, type), target = soldier('enemy', 545, 'tank');
    target.attackCooldown = 1000;
    const game = isolatedGame([attacker, target]);
    updateGame(game, RULES.fixedStep); attacker.attackCooldown = 1000;
    advance(game, 0.3);
    near(target.hp, UNITS.tank.health - expected, type);
  }
});

test('Rifleman fires three timed bullets, preserves an in-progress burst through evolution and then reloads', () => {
  const gunner = soldier('player', 500, 'rifleman'), target = soldier('enemy', 760, 'tank');
  target.attackCooldown = 1000;
  const game = isolatedGame([gunner, target]); evolveTo(game, 4);
  updateGame(game, RULES.fixedStep);
  assert(game.projectiles.length === 1 && gunner.burstRemaining === 2 && target.hp === UNITS.tank.health);
  advance(game, 0.13);
  assert(game.projectiles.length === 2 && gunner.burstRemaining === 1);
  evolveTo(game, 5); advance(game, 0.65);
  near(target.hp, UNITS.tank.health - 48);
  assert(gunner.type === 'rifleman' && gunner.burstRemaining === 0 && game.projectiles.length === 0 && gunner.attackCooldown > 0);
});

test('A burst cancels when its target dies or leaves range without transferring its remaining bullets', () => {
  for (const remove of [true, false]) {
    const gunner = soldier('player', 500, 'rifleman'), target = soldier('enemy', 750, 'tank');
    target.attackCooldown = 1000;
    const game = isolatedGame([gunner, target]); updateGame(game, RULES.fixedStep);
    if (remove) game.units = [gunner]; else target.x = 1100;
    const newcomer = soldier('enemy', 700, 'tank'); newcomer.attackCooldown = 1000; game.units.push(newcomer);
    advance(game, 0.6);
    assert(gunner.burstRemaining === 0 && newcomer.hp === UNITS.tank.health);
    assert(game.projectiles.length === 0);
  }
});

test('All fifteen articulated models render distinctly, animate, and respect reduced motion', () => {
  const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 230;
  const ctx = canvas.getContext('2d'), silhouettes = new Set();
  for (const type of Object.keys(UNITS)) {
    const unit = soldier('player', 210, type);
    const paint = (time, reduced = false) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 480, 230); ctx.translate(0, 210);
      drawUnit(ctx, unit, time, 1.4, reduced); return canvas.toDataURL();
    };
    const idle = paint(0); silhouettes.add(idle);
    unit.moving = true;
    const walking = paint(0.4); assert(walking !== paint(0.55), `${type}: movement must animate`);
    assert(paint(0.4, true) === paint(0.55, true), `${type}: reduced motion must be static`);
    unit.moving = false; unit.attackAnimation = UNITS[type].attackDuration;
    assert(paint(0) !== idle, `${type}: attack must have its own pose`);
  }
  assert(silhouettes.size === 15, 'Each unit needs its own silhouette');
});

function towerFixture(type, team = 'player') {
  const stats = TURRETS[type], game = isolatedGame();
  evolveTo(game, stats.age, team); game.gold[team] = stats.cost;
  assert(buildTurret(game, team, type));
  const origin = getTurretPosition(game, team, 0);
  const x = origin.x + (team === 'player' ? 1 : -1) * Math.min(200, stats.range * 0.7);
  const target = soldier(team === 'player' ? 'enemy' : 'player', x, 'tank', 10000);
  target.attackCooldown = 1000; game.units = [target];
  return { game, target, tower: game.turrets[team][0], x };
}

test('Fire and oil fields finish six armor-piercing ticks, spare allies, and survive the original target', () => {
  for (const type of ['fireCatapult', 'oil']) for (const team of ['player', 'enemy']) {
    const { game, target, tower, x } = towerFixture(type, team), stats = TURRETS[type];
    updateGame(game, RULES.fixedStep); assert(game.projectiles.length === 1);
    tower.cooldown = 1000;
    const victim = soldier(target.team, x + (team === 'player' ? 20 : -20), 'tank', 10000);
    const ally = soldier(team, victim.x, 'tank', 10000);
    game.units = [victim, ally];
    const hold = () => { victim.x = x; ally.x = x; victim.attackCooldown = ally.attackCooldown = 1000; };
    while (!game.fields.length) { hold(); updateGame(game, RULES.fixedStep); }
    assert(game.fields[0].kind === stats.field && game.fields[0].x === x, type);
    const hpAfterImpact = victim.hp;
    advance(game, 0.35, hold); near(victim.hp, hpAfterImpact, 'No early field damage');
    advance(game, 2.05, hold);
    near(victim.hp, hpAfterImpact - stats.tickDamage * 6, type);
    assert(game.fields.length === 0 && ally.hp === 10000);
    const hp = victim.hp; advance(game, 0.5, hold); near(victim.hp, hp, 'Expired fields must stop dealing damage');
  }
});

test('Oil slows only enemies inside its area and normal movement returns on exit', () => {
  const { game, target, tower, x } = towerFixture('oil');
  updateGame(game, RULES.fixedStep); tower.cooldown = 1000;
  while (!game.fields.length) { target.x = x; updateGame(game, RULES.fixedStep); }
  target.type = 'melee'; target.x = x; const start = target.x;
  updateGame(game, 0.05);
  near(start - target.x, UNITS.melee.speed * 0.55 * 0.05);
  target.x = x + TURRETS.oil.fieldRadius + 20; const outside = target.x;
  updateGame(game, 0.05);
  near(outside - target.x, UNITS.melee.speed * 0.05);
});

test('Double turrets alternate barrels at 0.16 seconds, preserve bursts across evolution and cancel on lost targets', () => {
  const { game, tower } = towerFixture('doubleTurret');
  updateGame(game, RULES.fixedStep); assert(tower.shotSerial === 1 && tower.lastBarrel === 0 && tower.burstRemaining === 1);
  advance(game, 0.13); assert(tower.shotSerial === 1);
  evolveTo(game, 5); advance(game, 0.04);
  assert(tower.shotSerial === 2 && tower.lastBarrel === 1 && tower.burstRemaining === 0);
  advance(game, 0.4); assert(tower.shotSerial === 2);
  for (const mode of ['death', 'range', 'sale']) {
    const f = towerFixture('doubleTurret'); updateGame(f.game, RULES.fixedStep);
    if (mode === 'death') f.game.units = [];
    if (mode === 'range') f.target.x = 1100;
    if (mode === 'sale') sellTurret(f.game, 0);
    const newcomer = soldier('enemy', 300, 'tank', 10000); newcomer.attackCooldown = 1000;
    f.game.units.push(newcomer); advance(f.game, 0.4);
    assert(f.tower.shotSerial === 1, mode);
    if (mode !== 'sale') assert(f.tower.burstRemaining === 0, mode);
    near(newcomer.hp, 10000, 'Remaining burst cannot retarget');
  }
});

test('Ion turrets visibly charge before firing and cancel a charge when its target disappears', () => {
  const { game, tower } = towerFixture('ion');
  updateGame(game, RULES.fixedStep);
  assert(tower.chargeRemaining === 0.65 && game.projectiles.length === 0);
  advance(game, 0.6); assert(game.projectiles.length === 0 && tower.chargeRemaining > 0);
  advance(game, 0.06); assert(tower.shotSerial === 1 && game.projectiles[0].kind === 'ion');
  const cancelled = towerFixture('ion'); updateGame(cancelled.game, RULES.fixedStep);
  cancelled.game.units = []; advance(cancelled.game, 0.7);
  assert(cancelled.tower.chargeRemaining === 0 && cancelled.tower.shotSerial === 0 && !cancelled.game.projectiles.length);
});

test('Rail and ion shots pierce only the stated number of enemies behind impact, within tower range', () => {
  for (const type of ['titanium', 'ion']) for (const team of ['player', 'enemy']) {
    const { game, target, tower, x } = towerFixture(type, team), stats = TURRETS[type];
    const direction = team === 'player' ? 1 : -1;
    const extras = [30, 60, 85, 150].map(offset => soldier(target.team, x + direction * offset, 'tank', 10000));
    const friendly = soldier(team, x + direction * 20, 'tank', 10000);
    game.units.push(...extras, friendly);
    const hold = () => { game.units.forEach(unit => unit.attackCooldown = 1000); target.x = x; extras.forEach((unit, i) => unit.x = x + direction * [30, 60, 85, 150][i]); friendly.x = x + direction * 20; };
    for (let i = 0; i < 60 && !game.projectiles.length; i++) { hold(); updateGame(game, RULES.fixedStep); }
    tower.cooldown = 1000; const flight = game.projectiles[0].remaining;
    advance(game, flight + RULES.fixedStep, hold);
    const armor = stats.ignoreArmor ? 0 : Math.max(0, UNITS.tank.armor - (stats.armorPierce ?? 0));
    near(target.hp, 10000 - stats.damage + armor);
    extras.forEach((unit, i) => near(unit.hp, i < stats.pierce ? 10000 - stats.damage * stats.pierceFactor + armor : 10000));
    assert(friendly.hp === 10000 && game.bases.player.hp === game.bases.player.maxHp && game.bases.enemy.hp === game.bases.enemy.maxHp);
  }
  const { game, target, tower } = towerFixture('ion');
  target.x = getTurretPosition(game, 'player', 0).x + TURRETS.ion.range - 10;
  const outside = soldier('enemy', target.x + 25, 'tank', 10000); outside.attackCooldown = 1000; game.units.push(outside);
  const fixed = target.x;
  for (let i = 0; i < 60 && !game.projectiles.length; i++) { target.x = fixed; outside.x = fixed + 25; updateGame(game, RULES.fixedStep); }
  tower.cooldown = 1000;
  advance(game, 0.2, () => { target.x = fixed; outside.x = fixed + 25; });
  near(outside.hp, 10000, 'Piercing cannot extend turret range');
});

test('Selling and evolving preserve launched fire fields; match end freezes them and restart clears them', () => {
  const { game, target, tower, x } = towerFixture('fireCatapult');
  updateGame(game, RULES.fixedStep); assert(sellTurret(game, 0)); evolveTo(game, 3);
  while (!game.fields.length) { target.x = x; updateGame(game, RULES.fixedStep); }
  assert(tower.shotSerial === 1 && game.fields[0].kind === 'fire');
  const frozen = JSON.stringify(game.fields); game.status = 'won'; updateGame(game, 0.05);
  assert(JSON.stringify(game.fields) === frozen && createGame().fields.length === 0);
});

test('Fifteen turret silhouettes have firing poses, mirrored teams and deterministic reduced-motion rendering', () => {
  const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 180;
  const ctx = canvas.getContext('2d'), silhouettes = new Set();
  for (const type of Object.keys(TURRETS)) {
    const turret = { type, team: 'player', cooldown: 0, flash: 0, aim: 0.15 };
    const paint = (time, reduced = false) => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 300, 180); ctx.translate(150, 155); drawTurret(ctx, turret, time, 2.5, reduced); return canvas.toDataURL(); };
    const idle = paint(0); silhouettes.add(idle);
    turret.flash = turret.flashDuration = 0.3; turret.cooldown = TURRETS[type].interval;
    assert(paint(0) !== idle, `${type}: a shot must move the weapon or expose its discharge`);
    assert(paint(0.3, true) === paint(0.8, true), `${type}: reduced motion`);
    const player = paint(0.2); turret.team = 'enemy'; assert(paint(0.2) !== player, `${type}: team and direction`);
  }
  assert(silhouettes.size === 15);
});

test('Browser UI: turret gallery exposes fifteen matching models, controls and navigation', async () => {
  const frame = document.createElement('iframe'); frame.title = 'Turret gallery integration test';
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  frame.src = '../turrets.html'; document.body.append(frame); await loaded;
  const page = frame.contentDocument;
  assert(page.querySelectorAll('.unit canvas').length === 15);
  assert(page.querySelector('a[href="./units.html"]') && page.querySelector('a[href="./index.html"]'));
  for (const stats of Object.values(TURRETS)) assert(page.body.textContent.includes(stats.name) && page.body.textContent.includes(stats.description));
  const pause = page.querySelector('#pause'); const wasPaused = pause.getAttribute('aria-pressed') === 'true';
  pause.click(); assert(pause.getAttribute('aria-pressed') === String(!wasPaused));
  const team = page.querySelector('#team'); team.value = 'enemy'; team.dispatchEvent(new Event('change'));
  const action = page.querySelector('#action'); action.value = 'idle'; action.dispatchEvent(new Event('change'));
  assert(team.value === 'enemy' && action.value === 'idle'); frame.remove();
});

test('Direct weapons stay on the muzzle-to-target line; gravity rotates arrows and accelerates falling oil', () => {
  const shot = { kind: 'bullet', team: 'player', fromX: 150, fromY: -100, toX: 350, toY: -30, duration: 1, remaining: 1 };
  for (const kind of ['bullet', 'cannon', 'shell', 'plasma', 'plasma-orb', 'rail', 'laser', 'ion']) {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const pose = getProjectilePose({ ...shot, kind }, 1, t);
      near(pose.x, 150 + 200 * t); near(pose.y, -100 + 70 * t, kind);
    }
  }
  const arrow = { ...shot, kind: 'arrow', fromY: -30 };
  assert(getProjectilePose(arrow, 1, 0).angle < 0 && getProjectilePose(arrow, 1, 1).angle > 0);
  near(getProjectilePose(arrow, 1, 0.5).y, -40);
  const mortar = { ...shot, kind: 'shell', arc: 65 };
  assert(getProjectilePose(mortar, 1, 0.5).y < getProjectilePose(shot, 1, 0.5).y - 50);
  for (const kind of ['boulder', 'rocket']) {
    assert(getProjectilePose({ ...shot, kind, fromY: -180, toX: 180 }, 1, 0).angle < 0,
      `${kind}: a close target below a high emplacement still needs an upward launch`);
  }
  const oil = { ...shot, kind: 'oil' };
  near(getProjectilePose(oil, 1, 1).y, -3);
  assert(getProjectilePose(oil, 1, 0.5).y - shot.fromY < (getProjectilePose(oil, 1, 1).y - shot.fromY) * 0.3);
  const rocket = { ...shot, kind: 'rocket' };
  assert(getProjectilePose(rocket, 1, 0.5).x < 250, 'A powered rocket should accelerate instead of moving like a thrown rock');
});

test('All projectile paths preserve mirrored, scaled muzzle endpoints and hit base surfaces', () => {
  const kinds = [...new Set([...Object.values(UNITS), ...Object.values(TURRETS)].map(stats => stats.projectile).filter(Boolean))];
  for (const kind of kinds) for (const scale of [1, 1.35]) {
    const left = { kind, team: 'player', fromBaseX: 108, fromX: 169, fromY: -137, toX: 1172, toOffsetX: -54, toY: -45, duration: 1, remaining: 1 };
    const right = { ...left, team: 'enemy', fromBaseX: 1172, fromX: 1111, toX: 108, toOffsetX: 54 };
    for (const t of [0, 0.25, 0.5, 1]) {
      const a = getProjectilePose(left, scale, t), b = getProjectilePose(right, scale, t);
      near(a.x + b.x, 1280); near(a.y, b.y); assert(Number.isFinite(a.angle) && Number.isFinite(b.angle));
    }
    near(getProjectilePose(left, scale, 0).x, 108 + 61 * scale);
    near(getProjectilePose(left, scale, 0).y, -137 * scale);
    near(getProjectilePose(left, scale, 1).x, 1172 - 54 * scale);
    near(getProjectilePose(left, scale, 1).y, (getProjectileProfile(left).ground ? -3 : -45) * scale);
  }
});

test('Real shots produce one material-specific impact instead of generic blasts or duplicate hit stars', () => {
  for (const [type, style] of [['egg', 'egg'], ['primitiveCatapult', 'rubble'], ['fireCatapult', 'fire'], ['oil', 'oil'],
    ['smallCannon', 'solid'], ['explosiveCannon', 'explosion'], ['singleTurret', 'bullet'], ['rocket', 'explosion'], ['laser', 'laser']]) {
    const { game, target, tower, x } = towerFixture(type);
    updateGame(game, RULES.fixedStep); const shot = game.projectiles[0];
    assert(shot && !game.effects.some(effect => effect.kind === 'impact'), 'Impacts cannot precede damage');
    tower.cooldown = 1000;
    advance(game, shot.duration + RULES.fixedStep, () => { target.x = x; target.attackCooldown = 1000; });
    const impacts = game.effects.filter(effect => effect.kind === 'impact');
    assert(impacts.length === 1 && impacts[0].style === style, `${type}: correct impact identity`);
    assert(!game.effects.some(effect => ['hit', 'blast'].includes(effect.kind)));
    near(impacts[0].y, getProjectilePose(shot, 1, 1).y);
    if (type === 'oil' || type === 'fireCatapult') {
      assert(impacts[0].y === -3 && game.fields.length === 1);
      const effectCount = game.effects.length;
      advance(game, 0.4, () => { target.x = x; target.attackCooldown = 1000; });
      assert(game.effects.length <= effectCount, 'Field ticks must not emit generic sparks');
    }
  }
});

test('Weapon impacts and abilities render distinctly, animate, and restore canvas state', () => {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
  const ctx = canvas.getContext('2d'), images = new Set();
  const paint = draw => {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 320, 240); ctx.translate(0, 190);
    ctx.globalAlpha = 0.8; draw(); near(ctx.globalAlpha, 0.8); near(ctx.getTransform().f, 190);
    return canvas.toDataURL();
  };
  for (const kind of ['arrow', 'boulder', 'egg', 'oil', 'fireball', 'bullet', 'shell', 'plasma', 'rail', 'laser', 'ion']) {
    const shot = { kind, team: 'player', fromX: 20, toX: 160, fromY: -120, toY: -35, duration: 1, remaining: 0.5, splash: kind === 'shell' ? 55 : 0 };
    const effect = createProjectileImpact(shot, 'metal'); effect.life = effect.duration * 0.85;
    const early = paint(() => drawImpact(ctx, effect, 1.5)); images.add(early);
    effect.life = effect.duration * 0.5;
    assert(early !== paint(() => drawImpact(ctx, effect, 1.5)), `${kind}: impact must progress`);
    paint(() => drawProjectile(ctx, shot, 1.35));
  }
  assert(images.size === 11);
  const abilities = new Set();
  for (const kind of ['volley', 'meteor', 'airstrike', 'orbital']) {
    abilities.add(paint(() => drawAbilityImpact(ctx, { kind, x: 160, radius: 90, life: 0.65, duration: 0.75 }, 1, 190)));
  }
  assert(abilities.size === 4);
  const game = { fields: [{ kind: 'oil', x: 160, radius: 45, remaining: 1 }] };
  const oil = paint(() => drawFields(ctx, game, 0, 1, true));
  assert(oil === paint(() => drawFields(ctx, game, 0.7, 1, true)), 'Reduced-motion oil must be static');
  game.fields[0].kind = 'fire';
  assert(oil !== paint(() => drawFields(ctx, game, 0, 1, true)), 'Boiling oil must not look like burning ground');
});

registerAnimationTests(test, assert, near);
let failures = 0;
for (const { name, run } of tests) {
  const item = document.createElement('li');
  try {
    await run(); item.className = 'pass'; item.textContent = `PASS — ${name}`;
  } catch (error) {
    failures++; item.dataset.stack = error.stack; item.className = 'fail'; item.textContent = `FAIL — ${name}: ${error.message}`;
  }
  document.getElementById('results').append(item);
}
document.getElementById('summary').textContent = `${tests.length - failures}/${tests.length} passed; ${failures} failed`;
document.body.dataset.testStatus = failures ? 'failed' : 'passed';
