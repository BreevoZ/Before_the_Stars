import { RULES, AGES, UNITS, TURRETS, createGame, recruit, cancelTraining, getRecruitState,
  buildTurret, sellTurret, getTurretState, expandTurretSlots, getExpansionState, castAbility, evolve, updateGame } from '../src/game.js';
import { stat, attributes, explainStat, createBonusStack, STAT_DEFINITIONS } from '../src/stats.js';
import { describeStat } from '../src/stat-text.js';
import { createProgression, createCivilizationRun, resolveBattle, continueCivilization, updateProgression, abandonCivilization, rebuildCivilization } from '../src/progression.js';
import { configureAutomation, getAutomationPlan } from '../src/automation.js';
import { serializeSession, parseSession } from '../src/save.js';
import { record, afterTwoSeconds } from './fixtures/v5-battle.js';
import { challengeSeed } from './challenge-cases.js';
import { mountFixture } from './progression-cases.js';
import { SAVE_VERSION } from '../src/progression-config.js';

const effect = (key, type, value, target = {}, source = 'doctrine') => ({
  target: { stat: key, ...target }, type, value, source: { kind: source, id: `${source}:${key}`, label: `${source} ${key}` },
});
const battle = bonuses => { const game = createGame({ mode: 'incremental', bonuses }); game.ai.enabled = false; return game; };
const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds / RULES.fixedStep); i++) updateGame(game, RULES.fixedStep); };
const target = (game, type, team, x, hp = UNITS[type].health) => ({ id: game.nextUnitId++, type, team, x, hp, moving: false, attackCooldown: 0, attackAnimation: 0, hitFlash: 0 });
const sessionWith = bonuses => {
  const session = createProgression(); Object.assign(session, createCivilizationRun(session.permanent, 0, bonuses));
  session.game.ai.enabled = false; return session;
};

export function registerStatTests(test, assert, near) {
  const rejects = fn => { let failed = false; try { fn(); } catch { failed = true; } assert(failed, 'Expected rejection'); };
  test('Stats: all sources use override → additive sum → multiplier product → final rounding with readable provenance', () => {
    const bonuses = [effect('damage', 'multiply', 2, {}, 'depth'), effect('damage', 'add', 3),
      effect('damage', 'override', 20, {}, 'challenge'), effect('damage', 'add', 2, {}, 'milestone'),
      effect('damage', 'override', 30, {}, 'age')];
    const game = battle(bonuses), unit = { type: 'melee', team: 'player' };
    assert(stat(game, unit, 'damage') === 70);
    assert(explainStat(game, unit, 'damage').base === 12);
    assert(explainStat(game, unit, 'damage').effects.length === 5);
    assert(describeStat(game, unit, 'damage').includes('milestone damage'));
    assert(UNITS.melee.damage === 12 && Object.isFrozen(game.bonuses[0].target));
    bonuses[0].value = 100;
    assert(stat(game, unit, 'damage') === 70, 'Never retain mutable input references');
    assert(stat(createGame({ bonuses }), unit, 'damage') === 12, 'Classic ignores permanent stacks');
  });

  test('Stats: team, role, type and era selectors stay isolated and era overrides refresh after evolution', () => {
    const game = battle([effect('damage', 'add', 5, { team: 'player', kind: 'unit', role: 'archer', age: 1 }),
      effect('health', 'multiply', 2, { team: 'enemy', type: 'heavy' })]);
    assert(stat(game, { type: 'archer', team: 'player' }, 'damage') === 19);
    assert(stat(game, { type: 'archer', team: 'enemy' }, 'damage') === 14);
    assert(stat(game, { type: 'crossbow', team: 'player' }, 'damage') === 30);
    assert(stat(game, { type: 'heavy', team: 'enemy' }, 'health') === 340);
    game.experience.player = AGES[2].experienceRequired; assert(evolve(game));
    assert(stat(game, 'player', 'income') === 10 && stat(game, 'player', 'baseHealth') === 900);
    assert(explainStat(game, 'player', 'income').effects.some(item => item.source.id === 'age:2'));
    assert(stat(game, { type: 'archer', team: 'player' }, 'damage') === 19, 'An existing unit retains its model era');
  });

  test('Stats: paid recruitment, health, armor, movement, range, attack speed and damage use resolved values', () => {
    const bonuses = Object.entries({ cost: 15, trainTime: 0.05, health: 140, armor: 5, speed: 100, range: 90, damage: 24, attackSpeed: 2 })
      .map(([key, value]) => effect(key, 'override', value, { kind: 'unit', team: 'player' }));
    const game = battle(bonuses), before = game.gold.player;
    assert(recruit(game)); assert(game.gold.player === before - 15 && game.queues.player[0].duration === 0.05);
    advance(game, 0.05); const unit = game.units[0]; assert(unit.hp === 140);
    const x = unit.x; advance(game, RULES.fixedStep); near(unit.x - x, 100 * RULES.fixedStep);
    const enemy = target(game, 'melee', 'enemy', unit.x + 80, 1000); game.units.push(enemy);
    updateGame(game, RULES.fixedStep); assert(enemy.hp === 976); near(unit.attackCooldown, 0.4);
    enemy.x = unit.x + 30; enemy.attackCooldown = 0;
    updateGame(game, RULES.fixedStep); assert(unit.hp === 133, 'Armor is resolved on the defending side');
    unit.moveMultiplier = 0.5; near(stat(game, unit, 'speed'), 50);
    assert(explainStat(game, unit, 'speed').effects.at(-1).source.kind === 'status');
  });

  test('Stats: queue, army and emplacement limits bind normal commands; paid prices survive later changes', () => {
    const game = battle([effect('queueLimit', 'override', 2), effect('armyLimit', 'override', 2),
      effect('maxTurretSlots', 'override', 2), effect('initialTurretSlots', 'override', 2),
      effect('cost', 'multiply', 0.5, { team: 'player' })]);
    game.gold.player = 500;
    assert(recruit(game) && recruit(game)); assert(getRecruitState(game) === 'queue-full');
    const order = game.queues.player[0];
    assert(buildTurret(game)); const tower = game.turrets.player[0];
    assert(tower.paid === 60 && game.turrets.player.length === 2 && getExpansionState(game) === 'max-slots');
    game.bonuses = createBonusStack(effect('cost', 'multiply', 3, { team: 'player' }));
    const wallet = game.gold.player;
    assert(cancelTraining(game, order.id) && sellTurret(game, 0)); near(game.gold.player, wallet + 15 + 30);
    assert(!cancelTraining(game, order.id) && !sellTurret(game, 0));
    const empty = battle([effect('armyLimit', 'override', 0), effect('maxTurretSlots', 'override', 0)]);
    assert(getRecruitState(empty) === 'army-full' && !buildTurret(empty) && !expandTurretSlots(empty));
    const army = battle([effect('armyLimit', 'override', 1)]); assert(recruit(army)); assert(getRecruitState(army) === 'army-full');
    const lowered = battle([]); lowered.gold.player = 1000;
    lowered.bonuses = createBonusStack(effect('maxTurretSlots', 'override', 0));
    assert(!buildTurret(lowered), 'Implicit slot selection also respects a lowered capacity');
  });

  test('Stats: income, victim bounty and recipient rewards share the pipeline and preserve casualty rounding', () => {
    const game = battle([effect('startingGold', 'add', 100, { team: 'player' }), effect('income', 'multiply', 2, { team: 'player' }),
      effect('bounty', 'override', 13, { kind: 'unit', type: 'heavy' }),
      effect('bounty', 'multiply', 1.5, { kind: 'reward', team: 'player' }),
      effect('experience', 'multiply', 1.25, { kind: 'reward', team: 'player' }),
      effect('experience', 'multiply', 1.2, { kind: 'reward', team: 'enemy' })]);
    assert(game.gold.player === 280); advance(game, 1); near(game.gold.player, 294);
    game.units.push(target(game, 'heavy', 'enemy', 600, 0));
    updateGame(game, RULES.fixedStep);
    near(game.gold.player, 294 + 14 * RULES.fixedStep + Math.floor(13 * 1.5));
    assert(game.experience.player === Math.floor(45 * 1.25));
    assert(game.experience.enemy === Math.floor(Math.floor(45 * 0.75) * 1.2));
  });

  test('Stats: ability cooldown, damage and healing cap use resolved stats; active attacks keep their launch snapshot', () => {
    const game = battle([effect('cooldown', 'multiply', 0.5, { kind: 'ability' }), effect('damage', 'multiply', 2, { team: 'player' })]);
    assert(castAbility(game, game.bases.enemy.x)); assert(game.abilityCooldown === 20);
    game.bonuses = createBonusStack(effect('damage', 'multiply', 9));
    advance(game, 0.85); assert(game.bases.enemy.hp === 600 - 80, 'An in-flight meteor must not be multiplied again');
    const heal = battle([effect('health', 'multiply', 2, { kind: 'unit', team: 'player' })]);
    heal.experience.player = 480; evolve(heal); evolve(heal);
    const unit = target(heal, 'duelist', 'player', 200, 400); heal.units.push(unit);
    assert(castAbility(heal)); advance(heal, 2); assert(unit.hp === 410, 'Heal to modified maximum health');
  });

  test('Stats: prohibitions apply to manual commands, balanced automation and enemy AI without free units or towers', () => {
    const bonuses = [effect('canBuild', 'override', false, {}, 'challenge'), effect('canCast', 'override', false, {}, 'challenge'),
      effect('enabled', 'override', false, { kind: 'unit', role: 'archer' }, 'challenge'),
      effect('enabled', 'override', false, { kind: 'unit', role: 'heavy' }, 'challenge')];
    const s = challengeSeed(); Object.assign(s, createCivilizationRun(s.permanent, 0, bonuses));
    // The seeded permanent state owns root/conservation/challenge; a legal
    // simulation loadout can additionally supply the formation unlock.
    s.permanent.talents.formation = 1; s.run.talents.formation = 1;
    assert(configureAutomation(s, { enabled: true, mode: 'balanced' }));
    assert(getTurretState(s.game) === 'disabled' && !buildTurret(s.game) && !expandTurretSlots(s.game));
    assert(!castAbility(s.game) && getRecruitState(s.game, 'archer') === 'disabled');
    assert(!recruit(s.game, 'heavy') && getAutomationPlan(s).action.type === 'melee');
    for (let i = 0; i < 30 / RULES.fixedStep && s.run.phase === 'battle'; i++) updateProgression(s, RULES.fixedStep);
    assert(s.game.units.length > 0 && s.game.units.every(unit => UNITS[unit.type].role === 'melee'));
    assert(Object.values(s.game.turrets).flat().every(tower => tower === null));
    const locked = battle([effect('canRecruit', 'override', false), effect('canEvolve', 'override', false)]);
    locked.experience.player = 9999; assert(!recruit(locked) && !evolve(locked));
  });

  test('Stats: launched fire retains resolved direct and tick damage after the source tower or stack changes', () => {
    const game = battle([effect('damage', 'multiply', 3, { kind: 'turret', team: 'player' })]);
    game.experience.player = 160; evolve(game); game.gold.player = 1000;
    assert(buildTurret(game, 'player', 'fireCatapult'));
    const victim = target(game, 'tank', 'enemy', 350); victim.attackCooldown = 1000; game.units.push(victim);
    updateGame(game, RULES.fixedStep); const shot = game.projectiles[0];
    assert(shot.damage === 84 && shot.field.damage === 18);
    sellTurret(game, 0); game.bonuses = createBonusStack();
    advance(game, shot.duration + RULES.fixedStep);
    assert(game.fields[0].damage === 18); near(victim.hp, 650);
    advance(game, 0.4); near(victim.hp, 632);
  });

  test('Stats: abandoning preserves the current restrictions; historical Legacy remains valid after a different rebuild', () => {
    const s = sessionWith([effect('canBuild', 'override', false, {}, 'challenge'), effect('legacy', 'override', 0, {}, 'depth')]);
    const id = s.run.runId; assert(abandonCivilization(s, id) && getTurretState(s.game) === 'disabled');
    s.game.experience.enemy = 2200; while (s.game.ages.enemy < 5) evolve(s.game, 'enemy');
    s.game.bases.enemy.hp = 0; s.game.status = 'won'; resolveBattle(s);
    assert(s.permanent.completedCycles === 1 && s.permanent.legacy === 0);
    parseSession(serializeSession(s)); assert(rebuildCivilization(s, s.run.runId));
    assert(stat(s.game, 'player', 'canBuild') && !s.run.extraBonuses);
    parseSession(serializeSession(s));
  });

  test('Stats: a new conflict uses the same source stack, retains assets and refunds discounted orders only once', () => {
    const s = sessionWith([effect('startingGold', 'add', 100, { team: 'player' }),
      effect('baseHealth', 'multiply', 2, { team: 'player' }), effect('cost', 'multiply', 0.5, { team: 'player' }),
      effect('income', 'multiply', 2, { team: 'player' }, 'milestone')]);
    const g = s.game; assert(recruit(g)); const paid = g.queues.player[0].paid, wallet = g.gold.player;
    g.bases.enemy.hp = 0; g.status = 'won'; resolveBattle(s);
    const id = s.run.battleId; assert(continueCivilization(s, id)); assert(!continueCivilization(s, id));
    near(s.game.gold.player, wallet + paid); assert(s.game.bases.player.hp === 1200 && s.game.gold.enemy === 300);
    assert(stat(s.game, 'player', 'income') === 14 && s.permanent.legacy === 0);
    assert(serializeSession(parseSession(serializeSession(s))) === serializeSession(s));
  });

  test('Stats save v6: modified orders, towers, caps and attack payloads round-trip without multiplying again', () => {
    const s = sessionWith([effect('trainTime', 'multiply', 2), effect('cost', 'multiply', 0.5),
      effect('queueLimit', 'override', 7), effect('armyLimit', 'override', 24), effect('damage', 'multiply', 2)]);
    s.game.gold.player = 1000; for (let i = 0; i < 7; i++) assert(recruit(s.game)); assert(buildTurret(s.game));
    assert(castAbility(s.game, 600)); const raw = serializeSession(s), restored = parseSession(raw);
    assert(restored.version === SAVE_VERSION && !restored.game.modifiers && !restored.game.enemyModifiers);
    assert(restored.game.queues.player[0].duration === 3.2 && restored.game.turrets.player[0].paid === 60);
    for (let i = 0; i < 120; i++) { updateGame(s.game, RULES.fixedStep); updateGame(restored.game, RULES.fixedStep); }
    assert(serializeSession(restored) === serializeSession(s));
    for (const mutate of [record => record.game.bonuses[0].value++, record => record.game.queues.player[0].duration = -1,
      record => record.run.extraBonuses[0].source.kind = 'unknown', record => record.game.ability.stats.damage = 900]) {
      const corrupt = JSON.parse(raw); mutate(corrupt); rejects(() => parseSession(JSON.stringify(corrupt)));
    }
  });

  test('Stats save v5: captured old in-flight attacks continue identically after migration and repeated reloads', () => {
    const session = parseSession(JSON.stringify(record));
    assert(session.version === SAVE_VERSION && !session.game.enemyModifiers);
    advance(session.game, 2);
    const { game } = session;
    const actual = { gold: game.gold, experience: game.experience, units: game.units.map(({ team, hp, x }) => ({ team, hp, x })), bases: game.bases };
    assert(JSON.stringify(actual) === JSON.stringify(afterTwoSeconds));
    const raw = serializeSession(session); assert(serializeSession(parseSession(raw)) === raw);
  });

  test('Stats: malformed operations, sources and selectors are rejected and bounds prevent invalid gameplay values', () => {
    for (const item of [effect('typo', 'add', 1), effect('damage', 'add', NaN), effect('damage', 'multiply', -1),
      effect('damage', 'divide', 2), effect('enabled', 'add', 1), effect('enabled', 'override', 0),
      effect('damage', 'add', 1, { role: 'unknown' }), effect('damage', 'add', 1, { age: '1' }),
      effect('damage', 'add', 1, {}, 'unknown')]) rejects(() => createBonusStack(item));
    const game = battle([effect('queueLimit', 'add', 1000), effect('cost', 'add', -1000), effect('armor', 'add', -100), effect('attackSpeed', 'override', 0)]);
    assert(stat(game, 'player', 'queueLimit') === STAT_DEFINITIONS.queueLimit.max);
    assert(stat(game, { type: 'melee' }, 'cost') === 0 && stat(game, { type: 'melee' }, 'armor') === 0);
    assert(Number.isFinite(stat(game, { type: 'melee' }, 'attackInterval')));
    const enormous = Array.from({ length: 40 }, () => effect('damage', 'multiply', 1e9));
    const zero = battle([...enormous, effect('damage', 'multiply', 0)]);
    assert(stat(zero, { type: 'melee' }, 'damage') === 0, 'Overflow followed by zero must stay finite');
    const attacker = target(zero, 'melee', 'player', 600), defender = target(zero, 'melee', 'enemy', 610);
    zero.units.push(attacker, defender); updateGame(zero, RULES.fixedStep);
    assert(defender.hp === 70, 'A zero-damage rule does not leak minimum chip damage');
  });

  test.browser('Stats UI: cards, income provenance, queue slots, ability restrictions and refunds show actual modified values', async () => {
    const s = sessionWith([effect('cost', 'multiply', 0.5, { team: 'player' }), effect('trainTime', 'multiply', 2),
      effect('queueLimit', 'override', 7), effect('income', 'multiply', 2, { team: 'player' }, 'milestone'),
      effect('canBuild', 'override', false), effect('canCast', 'override', false)]);
    const frame = await mountFixture(serializeSession(s)), page = frame.contentDocument, el = id => page.getElementById(id);
    try {
      assert(el('recruit').querySelector('[data-cost]').textContent === '15');
      assert(el('recruit').querySelector('[data-training]').textContent === '3.2s');
      assert(el('income-rate').textContent === '+14/s' && el('income-rate').title.includes('milestone income'));
      assert(el('training-queue').children.length === 7 && el('queue-count').textContent === '0 / 7');
      assert(el('build-turret').disabled && el('ability').disabled);
      el('recruit').click(); assert(el('queue-count').textContent === '1 / 7');
      assert(el('training-queue').children[0].getAttribute('aria-label').includes('15'));
      el('training-queue').children[0].click(); assert(el('queue-count').textContent === '0 / 7');
    } finally { frame.remove(); }
  });
}
