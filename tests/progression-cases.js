import { buyUnitPath } from './trait-cases.js';
import { statMultiplier, v5Record } from './legacy-fixtures.js';
import { purchaseTalent } from '../src/talents.js';
import { RULES, AGES, UNITS, TURRETS, ABILITIES, createGame, getIncomeRate, getExperienceReward, recruit, evolve, buildTurret, expandTurretSlots, castAbility } from '../src/game.js';
import { SURFACE } from '../src/progression-config.js';
import { createProgression, resolveBattle, updateProgression, continueCivilization, rebuildCivilization, abandonCivilization, purchaseUpgrade, setAutomation } from '../src/progression.js';
import { serializeSession, parseSession, createSaveStore, SAVE_KEY, BACKUP_KEY, DEBUG_SAVE_KEY } from '../src/save.js';
import { getGameMode, createDebugProgression, supplyDebugRun, runDebugCommand, DEBUG_GOLD } from '../src/debug.js';

function ageTo(game, age, team = 'player') {
  game.experience[team] = AGES[age].experienceRequired;
  while (game.ages[team] < age) evolve(game, team);
}
function finish(session, status = 'won', age = 5) {
  ageTo(session.game, age, 'enemy');
  session.game.bases.enemy.hp = status === 'won' || status === 'draw' ? 0 : session.game.bases.enemy.maxHp;
  session.game.bases.player.hp = status === 'lost' || status === 'draw' ? 0 : session.game.bases.player.maxHp;
  session.game.status = status;
  resolveBattle(session);
}
function advance(session, seconds, options) {
  for (let i = 0; i < Math.round(seconds / RULES.fixedStep); i++) updateProgression(session, RULES.fixedStep, options);
}
function memoryStorage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}
export async function mountFixture(raw, unavailable = false, mode = 'incremental', { reducedMotion = false } = {}) {
  const frame = document.createElement('iframe'); frame.title = 'Incremental civilization integration test';
  frame.name = JSON.stringify({ raw, unavailable, reducedMotion }); frame.src = `./incremental-fixture.html${mode ? `?mode=${mode}` : ''}`;
  document.body.append(frame);
  await new Promise((resolve, reject) => {
    const start = performance.now();
    const poll = () => {
      if (frame.contentWindow?.__testFrame && frame.contentDocument?.getElementById('income-rate')) resolve();
      else if (performance.now() - start > 15000) reject(new Error('Incremental fixture did not load'));
      else setTimeout(poll, 25);
    }; poll();
  });
  return frame;
}

export function registerProgressionTests(test, assert, near) {
  const throws = action => { let threw = false; try { action(); } catch { threw = true; } assert(threw, 'Expected invalid save to be rejected'); };
  test('Modes: default and legacy incremental URLs use civilization; classic and debug require explicit URLs', () => {
    for (const search of ['', '?mode=incremental', '?mode=unknown']) assert(getGameMode(search) === 'incremental');
    assert(getGameMode('?mode=classic') === 'classic' && getGameMode('?mode=debug') === 'debug');
    assert(!createGame().mode, 'The simulation factory must still default to classic rules');
  });
  test('Debug: commands are gated, use normal one-time settlement, and retain upgrades across rebuild', () => {
    const formal = createProgression(), before = serializeSession(formal);
    assert(!supplyDebugRun(formal) && !runDebugCommand(formal, 'finale') && serializeSession(formal) === before);
    const s = createDebugProgression();
    assert(s.debug && s.debugSpeed === 10 && s.game.gold.player === RULES.startingGold + DEBUG_GOLD);
    assert(s.game.ages.player === 1 && s.game.experience.player === AGES[5].experienceRequired);
    assert(runDebugCommand(s, 'victory') && s.run.phase === 'victory' && !s.permanent.legacy);
    assert(!runDebugCommand(s, 'finale'));
    continueCivilization(s, s.run.battleId);
    assert(runDebugCommand(s, 'finale') && s.run.phase === 'destruction' && s.permanent.legacy === 1);
    assert(!runDebugCommand(s, 'finale') && s.permanent.completedCycles === 1);
    assert(purchaseTalent(s, 'spark')); rebuildCivilization(s, s.run.runId);
    assert(runDebugCommand(s, 'finale'));
    purchaseUpgrade(s, 'production'); rebuildCivilization(s, s.run.runId); supplyDebugRun(s);
    assert(s.debug && statMultiplier(s.game, 'income') === 1.5 && s.game.gold.player === RULES.startingGold + DEBUG_GOLD);
    assert(runDebugCommand(s, 'defeat') && s.run.phase === 'defeat' && s.permanent.completedCycles === 2);
    assert(serializeSession(parseSession(serializeSession(s))) === serializeSession(s));
  });
  test('Debug: save, backup, import and clear are isolated from production progress', () => {
    const storage = memoryStorage(), formal = createSaveStore(() => storage), debug = createSaveStore(() => storage, { debug: true });
    const normal = createProgression(), fast = createDebugProgression();
    formal.load(); debug.load(); assert(formal.save(normal).ok && formal.save(normal).ok);
    const raw = storage.getItem(SAVE_KEY), backup = storage.getItem(BACKUP_KEY);
    assert(debug.save(fast).ok && storage.getItem(DEBUG_SAVE_KEY));
    assert(!formal.replace(fast).ok && !debug.replace(normal).ok);
    assert(debug.clear(createDebugProgression()).ok);
    assert(storage.getItem(SAVE_KEY) === raw && storage.getItem(BACKUP_KEY) === backup);
    const restored = createSaveStore(() => storage, { debug: true }).load();
    assert(restored.ok && restored.session.debug && restored.session.debugSpeed === 10);
    fast.debugSpeed = 999; throws(() => serializeSession(fast));
  });
  test('M1: default classic game has no permanent modifiers and fresh civilizations have unique IDs', () => {
    const classic = createGame({ modifiers: { income: 9, experience: 9 } });
    assert(!classic.mode && !classic.modifiers);
    near(getIncomeRate(classic), 7); near(getExperienceReward(classic, 20), 20);
    const a = createProgression(), b = createProgression();
    assert(a.run.runId !== b.run.runId && a.run.battleId !== b.run.battleId);
    assert(a.permanent.completedCycles === 0 && a.permanent.legacy === 0 && !a.permanent.automation.unlocked);
    assert(serializeSession(parseSession(serializeSession(a))) === serializeSession(a));
  });
  test('M1: early victory transfers assets and refunds paid unfinished orders only once in the same run', () => {
    const s = createProgression(), g = s.game, runId = s.run.runId, battleId = s.run.battleId;
    g.gold.player = 1000; expandTurretSlots(g); buildTurret(g); recruit(g, 'heavy'); recruit(g, 'archer');
    g.queues.player[0].paid = 77; // Purchase-time price, independent of today's unit config.
    g.abilityCooldown = 17; ageTo(g, 3); g.bases.player.hp = 1;
    g.projectiles.push({ fixture: true }); g.fields.push({ fixture: true }); g.ability = { fixture: true };
    const gold = g.gold.player, towers = g.turrets.player.map(t => t?.type ?? null);
    finish(s, 'won', 2);
    assert(s.run.phase === 'victory' && !s.permanent.completedCycles && !s.permanent.legacy);
    assert(!resolveBattle(s) && continueCivilization(s, battleId));
    assert(s.run.runId === runId && s.run.battleId !== battleId && s.run.battleNumber === 2);
    assert(s.game.ages.player === 3 && s.game.ages.enemy === 3);
    near(s.game.gold.player, gold + 77 + UNITS.archer.cost);
    near(s.game.gold.enemy, SURFACE.enemyStartingGold[3]);
    assert(s.game.experience.player === g.experience.player && s.game.bases.player.hp === AGES[3].baseHealth);
    assert(JSON.stringify(s.game.turrets.player.map(t => t?.type ?? null)) === JSON.stringify(towers));
    assert(!s.game.units.length && !s.game.projectiles.length && !s.game.effects.length && !s.game.fields.length && !s.game.queues.player.length && !s.game.ability);
    assert(s.game.abilityCooldown === 17);
    const saved = serializeSession(s);
    assert(!continueCivilization(s, battleId) && serializeSession(s) === saved);
  });
  test('M1: player evolution to future is not completion; only defeating a future enemy settles once', () => {
    const s = createProgression(); ageTo(s.game, 5);
    advance(s, 1);
    assert(s.run.phase === 'battle' && !s.permanent.completedCycles);
    finish(s, 'won', 4); assert(s.run.phase === 'victory' && !s.permanent.legacy);
    continueCivilization(s, s.run.battleId);
    assert(s.game.ages.enemy === 5);
    s.game.bases.enemy.hp = 1; s.game.ai.enabled = false;
    castAbility(s.game, RULES.enemyBaseX); advance(s, 2);
    assert(s.run.phase === 'destruction' && s.run.settled && s.run.earnedLegacy === 1);
    assert(s.permanent.completedCycles === 1 && s.permanent.legacy === 1 && !s.permanent.automation.unlocked && !s.permanent.automation.enabled);
    const before = serializeSession(s);
    for (let i = 0; i < 20; i++) { resolveBattle(s); updateProgression(s, 0.05); }
    assert(serializeSession(s) === before);
  });
  test('M1: losses, simultaneous base destruction and abandoning an unfinished run grant no reward', () => {
    for (const status of ['lost', 'draw']) {
      const s = createProgression(); s.game.ai.enabled = false;
      s.game.bases.player.hp = 0; if (status === 'draw') s.game.bases.enemy.hp = 0;
      updateProgression(s, RULES.fixedStep);
      assert(s.game.status === status && s.run.phase === 'defeat' && !s.run.settled && !s.permanent.legacy && !s.permanent.completedCycles);
      const id = s.run.runId;
      assert(rebuildCivilization(s, id) && !rebuildCivilization(s, id));
      assert(s.game.ages.player === 1 && !s.permanent.legacy);
    }
    const s = createProgression(), id = s.run.runId;
    assert(abandonCivilization(s, id) && !abandonCivilization(s, id) && !s.permanent.completedCycles);
  });
  test('M1: upgrade costs, caps and between-run restriction; modifiers never touch shared data or enemies', () => {
    const s = createProgression(), base = JSON.stringify({ AGES, UNITS });
    assert(!purchaseUpgrade(s, 'production'));
    finish(s);
    s.permanent.totalLegacy = s.permanent.completedCycles = s.permanent.legacy = 63; s.permanent.automation.unlocked = true;
    assert(purchaseTalent(s, 'spark'));
    for (const key of ['production', 'warfare']) {
      for (const cost of [1, 2, 4, 8, 16]) {
        const balance = s.permanent.legacy;
        assert(purchaseUpgrade(s, key)); near(s.permanent.legacy, balance - cost);
      }
      assert(!purchaseUpgrade(s, key));
    }
    assert(s.permanent.legacy === 0 && !purchaseUpgrade(s, 'unknown'));
    assert(statMultiplier(s.game, 'income') === 1, 'Pending upgrades must not mutate the just-ended run');
    rebuildCivilization(s, s.run.runId);
    near(getIncomeRate(s.game), 7 * 1.5 ** 5); near(getIncomeRate(s.game, 'enemy'), 7);
    assert(getExperienceReward(s.game, 20) === Math.floor(20 * 1.25 ** 5));
    assert(getExperienceReward(s.game, 20, 'enemy') === 20 && getIncomeRate(createGame()) === 7);
    assert(JSON.stringify({ AGES, UNITS }) === base);
    const restored = parseSession(serializeSession(s));
    near(statMultiplier(restored.game, 'income'), 1.5 ** 5);
    restored.game.ai.enabled = false; const wallet = restored.game.gold.player;
    advance(restored, 1); near(restored.game.gold.player - wallet, getIncomeRate(restored.game));
  });
  test('M1: actual casualty payouts round base reward then multiplier, without multiplying kill gold', () => {
    for (const victimTeam of ['player', 'enemy']) {
      const s = createProgression(); finish(s); purchaseTalent(s, 'spark'); rebuildCivilization(s, s.run.runId); finish(s); purchaseUpgrade(s, 'warfare'); rebuildCivilization(s, s.run.runId);
      const g = s.game; g.ai.enabled = false;
      const winner = victimTeam === 'player' ? 'enemy' : 'player';
      g.units.push({ id: g.nextUnitId++, team: victimTeam, type: 'heavy', hp: 0, x: 640, moving: false, attackCooldown: 100, attackAnimation: 0, hitFlash: 0 });
      const gold = g.gold[winner]; updateProgression(s, RULES.fixedStep);
      const reward = victimTeam === 'player' ? Math.floor(45 * 0.75) : 45;
      assert(g.experience.player === Math.floor(reward * 1.25));
      assert(g.experience.enemy === (victimTeam === 'player' ? 45 : Math.floor(45 * 0.75)));
      near(g.gold[winner], gold + getIncomeRate(g, winner) * RULES.fixedStep + 25);
    }
  });
  test('M1: talent automation unlock is opt-in, pays normal prices, respects queue/army limits and changes era target', () => {
    const s = createProgression(); assert(!setAutomation(s, true, 'front'));
    finish(s); assert(!s.permanent.automation.unlocked && !s.permanent.automation.enabled); purchaseTalent(s, 'spark'); rebuildCivilization(s, s.run.runId); finish(s); setAutomation(s, true, 'heavy'); rebuildCivilization(s, s.run.runId);
    s.game.ai.enabled = false;
    advance(s, 0.25); assert(s.game.queues.player[0].type === 'heavy');
    near(s.game.gold.player, 180 + 7 * 0.25 - 85);
    s.game.gold.player = 0; const count = s.game.queues.player.length;
    advance(s, 0.25); assert(s.game.queues.player.length === count);
    s.game.gold.player = 10000; ageTo(s.game, 2); advance(s, 0.25);
    assert(s.game.queues.player.at(-1).type === 'knight');
    for (let i = 0; i < 5; i++) recruit(s.game, 'knight');
    const paid = s.game.gold.player; advance(s, 0.25);
    assert(s.game.queues.player.length === 5); near(s.game.gold.player, paid + 10 * 0.25);
    s.game.queues.player = [];
    s.game.units = Array.from({ length: 16 }, (_, i) => ({ id: s.game.nextUnitId++, type: 'knight', team: 'player', hp: 270, x: 150 + i * 50, moving: false, attackCooldown: 100, attackAnimation: 0, hitFlash: 0 }));
    advance(s, 0.25); assert(s.game.queues.player.length === 0);
  });
  test('M1: pause, hidden page, disabled automation and ended battle cannot recruit or bank attempts', () => {
    const s = createProgression(); finish(s); purchaseTalent(s, 'spark'); rebuildCivilization(s, s.run.runId); finish(s); setAutomation(s, true, 'ranged'); rebuildCivilization(s, s.run.runId);
    for (const options of [{ paused: true }, { hidden: true }]) {
      const before = serializeSession(s); advance(s, 20, options); assert(serializeSession(s) === before);
    }
    setAutomation(s, false, 'ranged'); s.game.ai.enabled = false; advance(s, 1); assert(!s.game.queues.player.length && s.run.autoElapsed === 0);
    setAutomation(s, true, 'ranged'); finish(s); const before = serializeSession(s); advance(s, 20); assert(serializeSession(s) === before);
  });
  test('M1: settlement, victory and rebuilt saves round-trip without repeating awards, refunds or multipliers', () => {
    let s = createProgression(); recruit(s.game, 'heavy'); finish(s, 'won', 1);
    s = parseSession(serializeSession(s)); const battleId = s.run.battleId;
    assert(continueCivilization(s, battleId) && !continueCivilization(s, battleId));
    finish(s); s = parseSession(serializeSession(s));
    assert(!resolveBattle(s) && s.permanent.legacy === 1);
    purchaseTalent(s, 'spark'); rebuildCivilization(s, s.run.runId); finish(s);
    purchaseUpgrade(s, 'production'); setAutomation(s, true, 'ranged');
    const old = s.run.runId; assert(rebuildCivilization(s, old) && !rebuildCivilization(s, old));
    for (let i = 0; i < 5; i++) s = parseSession(serializeSession(s));
    assert(s.permanent.completedCycles === 2 && s.permanent.legacy === 0 && statMultiplier(s.game, 'income') === 1.5);
    assert(s.permanent.automation.enabled && s.permanent.automation.target === 'ranged');
    assert(s.run.phase === 'battle' && !s.run.settled && !s.run.earnedLegacy);
  });
  test('M1: in-flight attacks, training and AI save exactly and resume deterministically without offline time', () => {
    const s = createProgression(); s.game.gold.player = 5000; ageTo(s.game, 4); ageTo(s.game, 4, 'enemy');
    recruit(s.game, 'rifleman'); recruit(s.game, 'tank'); buildTurret(s.game);
    let found = false;
    for (let i = 0; i < 5000 && s.game.status === 'playing'; i++) {
      updateProgression(s, RULES.fixedStep);
      if (s.game.projectiles.length) { found = true; break; }
    }
    assert(found, 'Fixture must contain real flying projectiles');
    const saved = serializeSession(s), restored = parseSession(saved);
    assert(serializeSession(restored) === saved);
    advance(s, 3); advance(restored, 3);
    assert(serializeSession(s) === serializeSession(restored));
  });
  test('M1 complete civilization: normal paid army and manual evolution can reach final victory and rebuild', () => {
    const s = createProgression(); buildTurret(s.game);
    const rotation = [2, 1, 0, 1, 0]; let order = 0;
    for (let i = 0; i < 60 * 1200 && !s.run.settled; i++) {
      if (s.run.phase === 'victory') continueCivilization(s, s.run.battleId);
      assert(s.run.phase === 'battle', `Civilization lost in conflict ${s.run.battleNumber}, ages ${s.game.ages.player}/${s.game.ages.enemy}, after ${s.run.elapsed.toFixed(1)}s`);
      const g = s.game;
      evolve(g);
      if (g.queues.player.length < 2 && recruit(g, AGES[g.ages.player].units[rotation[order % rotation.length]])) order++;
      const enemies = g.units.filter(unit => unit.team === 'enemy');
      if (enemies.length >= 2 && g.abilityCooldown === 0) {
        const target = enemies.reduce((best, unit) => {
          const count = enemies.filter(other => Math.abs(other.x - unit.x) <= (ABILITIES[AGES[g.ages.player].ability].radius ?? RULES.width)).length;
          return count > best.count ? { x: unit.x, count } : best;
        }, { x: 0, count: 0 });
        castAbility(g, target.x);
      }
      updateProgression(s, RULES.fixedStep);
      if (i % 600 === 0) parseSession(serializeSession(s));
    }
    assert(s.run.phase === 'destruction' && s.permanent.completedCycles === 1, `Expected final victory, got ${s.run.phase}`);
    assert(purchaseTalent(s, 'spark'));
    assert(rebuildCivilization(s, s.run.runId));
    assert(s.game.ages.player === 1 && s.run.talents.spark === 1 && !s.permanent.legacy);
  });
  test('M1: all turret attacks, charging, bursts, ground fields and five abilities survive repeated save/resume', () => {
    const seen = new Set();
    for (const [type, stats] of Object.entries(TURRETS)) {
      let s = createProgression(); ageTo(s.game, stats.age); ageTo(s.game, 5, 'enemy');
      s.game.ai.enabled = false; s.game.gold.player = 2000;
      buildTurret(s.game, 'player', type);
      s.game.units.push({ id: s.game.nextUnitId++, type: 'warMachine', team: 'enemy', hp: 1200, x: 240, moving: false, attackCooldown: 100, attackAnimation: 0, hitFlash: 0 });
      castAbility(s.game, 1000);
      for (let i = 0; i < 120; i++) {
        updateProgression(s, 0.05);
        s.game.fields.forEach(field => seen.add(field.kind));
        if (s.game.turrets.player[0].chargeRemaining > 0) seen.add('charge');
        if (s.game.turrets.player[0].burstRemaining > 0) seen.add('burst');
        if (s.game.ability) seen.add(s.game.ability.type);
        const restored = parseSession(serializeSession(s));
        updateProgression(s, 0.05); updateProgression(restored, 0.05);
        assert(serializeSession(s) === serializeSession(restored), `${type} changed after load`);
        s = restored;
      }
    }
    for (const value of ['oil', 'fire', 'charge', 'burst', ...Object.keys(ABILITIES)]) assert(seen.has(value), `Missing coverage: ${value}`);
  });
  test('M1: reject unsupported, malformed, incomplete, out-of-range and inconsistent imported saves', () => {
    const raw = serializeSession(createProgression());
    throws(() => parseSession('{')); throws(() => parseSession('null'));
    for (const mutate of [s => s.version++, s => delete s.game.queues, s => s.permanent.legacy = -1,
      s => s.permanent.completedCycles = '1', s => s.permanent.upgrades.production = 6,
      s => s.permanent.automation.target = 'dragon', s => s.run.phase = 'orbital', s => s.run.settled = true,
      s => s.game.bases.player.hp = 601, s => s.game.gold.player = 1e100, s => s.game.bonuses = [],
      s => s.game.units.push({}), s => s.game.fields.push({ kind: 'oil', tickInterval: 0 }), s => delete s.run.runId]) {
      const s = JSON.parse(raw); mutate(s); throws(() => parseSession(JSON.stringify(s)));
    }
  });
  test('M1: valid backup survives corrupt/unsupported records; writes require explicit recovery', () => {
    const storage = memoryStorage(), store = createSaveStore(() => storage), s = createProgression();
    assert(store.load().ok && store.save(s).ok);
    finish(s); assert(store.save(s).ok);
    const backup = storage.getItem(BACKUP_KEY); assert(parseSession(backup).run.phase === 'battle');
    storage.setItem(SAVE_KEY, '{broken');
    const reload = createSaveStore(() => storage), result = reload.load();
    assert(!result.ok && result.backupAvailable && !reload.save(createProgression()).ok);
    assert(storage.getItem(SAVE_KEY) === '{broken' && storage.getItem(BACKUP_KEY) === backup);
    assert(reload.recover().ok && parseSession(storage.getItem(SAVE_KEY)).run.phase === 'battle');
    const unsupported = JSON.stringify({ version: 999 }); storage.setItem(SAVE_KEY, unsupported);
    const future = createSaveStore(() => storage); future.load(); assert(!future.save(s).ok && storage.getItem(SAVE_KEY) === unsupported);
  });
  test('M1: unavailable/quota-limited storage and conflicting tabs return errors without crashing or losing last good save', () => {
    const denied = createSaveStore(() => { throw new Error('Storage denied'); });
    assert(!denied.load().ok && !denied.save(createProgression()).ok && !denied.recover().ok);
    const storage = memoryStorage(), a = createSaveStore(() => storage), b = createSaveStore(() => storage), s = createProgression();
    a.load(); assert(a.save(s).ok); b.load(); finish(s); assert(a.save(s).ok);
    const good = storage.getItem(SAVE_KEY); assert(!b.save(createProgression()).ok && storage.getItem(SAVE_KEY) === good);
    storage.setItem = () => { throw new Error('Quota exceeded'); };
    assert(!a.save(s).ok && storage.getItem(SAVE_KEY) === good);
  });
  test('M1: explicit import/reset replaces protected records; a missing main record never destroys its backup', () => {
    const storage = memoryStorage(), seed = createProgression();
    storage.setItem(BACKUP_KEY, serializeSession(seed));
    const store = createSaveStore(() => storage);
    assert(store.load().backupAvailable && !store.save(createProgression()).ok && storage.getItem(SAVE_KEY) === null);
    assert(store.recover().ok);
    finish(seed); assert(store.replace(seed).ok);
    const fresh = createProgression(); assert(store.clear(fresh).ok && storage.getItem(BACKUP_KEY) === null);
    assert(parseSession(storage.getItem(SAVE_KEY)).run.runId === fresh.run.runId);
    storage.removeItem(SAVE_KEY); storage.setItem(BACKUP_KEY, '{broken');
    const broken = createSaveStore(() => storage); assert(!broken.load().ok && !broken.save(fresh).ok);
    assert(storage.getItem(BACKUP_KEY) === '{broken');
  });

  test.browser('M1 browser: victory → next conflict → destruction → purchase → rebuild → refresh with real UI and isolated storage', async () => {
    const seed = createProgression(); seed.game.ai.enabled = false; seed.game.bases.enemy.hp = 1;
    const mount = mountFixture;
    let frame = await mount(serializeSession(seed));
    const page = () => frame.contentDocument, el = id => page().getElementById(id);
    let time = 0;
    const tick = seconds => { for (let i = 0; i < Math.ceil(seconds * 60); i++) frame.contentWindow.__testFrame(time += 1000 / 60); };
    frame.contentWindow.__testFrame(0);
    el('ability').click(); const canvas = el('battlefield'), bounds = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new frame.contentWindow.MouseEvent('click', { bubbles: true, clientX: bounds.x + bounds.width * RULES.enemyBaseX / RULES.width, clientY: bounds.y + bounds.height / 2 }));
    tick(1);
    assert(el('archives').hidden && el('result-title').textContent === '战役胜利' && el('play-again').textContent === '继续文明进程');
    let saved = parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
    assert(saved.run.phase === 'victory' && !saved.permanent.legacy);
    frame.remove(); frame = await mount(serializeSession(saved)); time = 0; frame.contentWindow.__testFrame(0);
    assert(el('result-title').textContent === '战役胜利');
    el('play-again').click(); saved = parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
    assert(saved.run.runId === seed.run.runId && saved.game.ages.enemy === 2 && saved.run.phase === 'battle');
    // A late-battle fixture exercises real final damage and production UI, without debug hooks.
    ageTo(saved.game, 5, 'enemy'); saved.game.bases.enemy.hp = 1; saved.game.abilityCooldown = 0;
    saved.game.ai.enabled = false;
    frame.remove(); frame = await mount(serializeSession(saved)); time = 0; frame.contentWindow.__testFrame(0);
    el('ability').click(); const field = el('battlefield'), rect = field.getBoundingClientRect();
    field.dispatchEvent(new frame.contentWindow.MouseEvent('click', { bubbles: true, clientX: rect.x + rect.width * RULES.enemyBaseX / RULES.width, clientY: rect.y + rect.height / 2 }));
    tick(1);
    assert(el('result-title').textContent === '文明未能幸存');
    saved = parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
    assert(saved.permanent.legacy === 1 && saved.run.settled);
    frame.remove(); frame = await mount(serializeSession(saved)); time = 0; frame.contentWindow.__testFrame(0);
    el('play-again').click(); assert(!el('archives').hidden && el('archives-dialog').open && el('legacy').textContent === '1');
    el('buy-spark').click(); el('buy-spark').click();
    assert(el('legacy').textContent === '0' && el('buy-spark').disabled && !el('auto-enabled').checked);
    el('close-archives').click(); el('autobuyer-menu').click();
    assert(el('automation-dialog').open && !el('archives-dialog').open);
    el('auto-enabled').click(); el('auto-target').value = 'ranged'; el('auto-target').dispatchEvent(new Event('change'));
    el('automation-to-talents').click();
    el('rebuild-civilization').click(); el('rebuild-civilization').click();
    saved = parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
    assert(saved.run.phase === 'battle' && saved.permanent.completedCycles === 1 && saved.run.talents.spark === 1 && statMultiplier(saved.game, 'income') === 1);
    frame.remove(); frame = await mount(serializeSession(saved)); time = 0; frame.contentWindow.__testFrame(0);
    assert(el('income-rate').textContent === '+7/s');
    el('pause-battle').click(); const gold = el('gold').textContent; tick(20);
    assert(el('gold').textContent === gold && el('queue-count').textContent === '0 / 5');
    el('pause-battle').click(); el('recruit').click(); tick(0.3); assert(el('queue-count').textContent === '1 / 5');
    el('archives').click(); const pausedGold = el('gold').textContent; tick(20); assert(el('gold').textContent === pausedGold);
    page().body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { code: 'Digit1', bubbles: true }));
    assert(el('queue-count').textContent === '1 / 5', 'Archive modal must block battle hotkeys');
    el('archive-save').click(); assert(el('save-dialog').open);
    el('manual-save').click(); assert(el('save-warning').hidden);
    const preserved = frame.contentWindow.__storage.getItem(SAVE_KEY);
    el('save-data').value = '{broken'; el('import-save').click(); assert(frame.contentWindow.__storage.getItem(SAVE_KEY) === preserved);
    el('clear-progress').click(); assert(frame.contentWindow.__storage.getItem(SAVE_KEY) === preserved, 'Destructive dialog defaults to cancel in fixture');
    assert(frame.contentWindow.__confirmMessages.at(-1).includes('清空全部'));
    assert(page().documentElement.scrollWidth <= frame.clientWidth);
    frame.style.width = '360px';
    assert(page().documentElement.scrollWidth <= frame.clientWidth, 'Incremental archive must fit narrow screens');
    el('close-save').click(); el('close-archives').click(); el('restart').click();
    assert(frame.contentWindow.__confirmMessages.at(-1).includes('放弃当前文明'));
    assert(frame.contentWindow.__storage.getItem(SAVE_KEY) === preserved, 'Cancel restart preserves the active save');
    el('archives').click(); el('archive-save').click(); el('save-data').value = serializeSession(seed);
    frame.contentWindow.__confirm = true; el('import-save').click();
    assert(el('legacy').textContent === '0' && el('income-rate').textContent === '+7/s');
    assert(el('archives').hidden && !el('archives-dialog').open && el('save-dialog').open, 'Importing an unfinished first run hides and closes archives');
    assert(parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY)).run.runId === seed.run.runId);
    frame.remove();
  });
  test.browser('Archives unlock only after a completed cycle, survive reload, and first defeat can restart without archives', async () => {
    for (const status of ['lost', 'draw']) {
      const seed = createProgression(); finish(seed, status);
      const frame = await mountFixture(serializeSession(seed)), page = frame.contentDocument;
      const el = id => page.getElementById(id);
      assert(el('archives').hidden && el('play-again').textContent === '从原始时代重试');
      el('archives').click(); assert(!el('archives-dialog').open);
      el('play-again').click(); el('play-again').click();
      const saved = parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
      assert(saved.run.phase === 'battle' && !saved.permanent.completedCycles && saved.run.runId !== seed.run.runId);
      assert(el('archives').hidden && !el('archives-dialog').open);
      frame.remove();
    }
    const seed = createProgression(); finish(seed);
    for (const rebuild of [false, true]) {
      if (rebuild) rebuildCivilization(seed, seed.run.runId);
      const frame = await mountFixture(serializeSession(seed));
      assert(!frame.contentDocument.getElementById('archives').hidden);
      frame.remove();
    }
  });
  test.browser('Space pauses every mode, ignores key repeat, and leaves native modal/input editing alone', async () => {
    for (const mode of ['classic', 'incremental', 'debug']) {
      const frame = await mountFixture(null, false, mode), page = frame.contentDocument;
      const el = id => page.getElementById(id);
      const key = (target, repeat = false) => {
        const event = new frame.contentWindow.KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true, repeat });
        target.dispatchEvent(event); return event;
      };
      let time = 0;
      const tick = () => { for (let i = 0; i < 120; i++) frame.contentWindow.__testFrame(time += 1000 / 60); };
      frame.contentWindow.__testFrame(0);
      assert(key(el('recruit')).defaultPrevented && el('pause-battle').getAttribute('aria-pressed') === 'true');
      key(page.body, true); const gold = el('gold').textContent; tick();
      assert(el('gold').textContent === gold && el('clock').textContent === '00:00' && el('queue-count').textContent === '0 / 5');
      key(el('pause-battle')); tick(); assert(Number(el('gold').textContent) > Number(gold));
      el('help').click(); assert(!key(el('close-help')).defaultPrevented);
      el('close-help').click();
      assert(el('pause-battle').getAttribute('aria-pressed') === 'false');
      if (mode !== 'classic') {
        el('save-menu').click();
        assert(!key(el('save-data')).defaultPrevented && !key(el('manual-save')).defaultPrevented);
        const frozen = el('gold').textContent; tick(); assert(el('gold').textContent === frozen);
        el('close-save').click();
      }
      frame.remove();
    }
  });
  test('Super soldier training and both attack poses survive full save round trips', () => {
    const seed = createProgression(); finish(seed); seed.permanent.totalLegacy = seed.permanent.completedCycles = seed.permanent.legacy = 100; seed.permanent.automation.unlocked = true; purchaseTalent(seed,'spark'); buyUnitPath(seed); rebuildCivilization(seed, seed.run.runId); seed.game.ai.enabled = false; ageTo(seed.game, 5);
    seed.game.gold.player = UNITS.superSoldier.cost;
    assert(recruit(seed.game, 'superSoldier'));
    let saved = parseSession(serializeSession(seed));
    assert(saved.game.queues.player[0].paid === UNITS.superSoldier.cost);
    advance(saved, UNITS.superSoldier.trainTime);
    for (const style of ['melee', 'ranged']) {
      saved.game.units[0].attackStyle = style;
      const restored = parseSession(serializeSession(saved));
      assert(restored.game.units[0].type === 'superSoldier' && restored.game.units[0].attackStyle === style);
    }
    saved.game.units[0].attackStyle = 'invalid'; throws(() => serializeSession(saved));
  });
  test.browser('M1 browser: corrupt saves stay protected and unavailable storage shows a warning without breaking play', async () => {
    for (const unavailable of [false, true]) {
      const frame = await mountFixture('{broken', unavailable), page = frame.contentDocument;
      const el = id => page.getElementById(id);
      assert(!el('save-warning').hidden && el('save-warning').textContent.includes('存档提示'));
      el('recruit').click(); assert(el('queue-count').textContent === '1 / 5');
      el('save-menu').click(); el('manual-save').click();
      assert(!el('save-warning').hidden && el('save-dialog').open);
      if (!unavailable) assert(frame.contentWindow.__storage.getItem(SAVE_KEY) === '{broken');
      frame.remove();
    }
  });
  test.browser('Modes browser: bare URL opens normal civilization and keeps secondary modes below the battlefield', async () => {
    const frame = await mountFixture(null, false, ''), page = frame.contentDocument;
    assert(page.body.dataset.mode === 'incremental' && page.getElementById('archives').hidden && !page.getElementById('save-menu').hidden);
    assert(page.getElementById('debug-tools').hidden && page.getElementById('gold').textContent === '180');
    assert(page.querySelector('.mode-links #mode-link').getAttribute('href') === '?mode=classic');
    assert(page.querySelector('.mode-links #debug-link').getAttribute('href') === '?mode=debug');
    assert(frame.contentWindow.__storage.getItem(SAVE_KEY) && !frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY));
    frame.remove();
  });
  test.browser('Debug browser: fast fixed-step simulation pauses; ending, upgrading, rebuilding and reloading work in isolation', async () => {
    let frame = await mountFixture(null, false, 'debug');
    const page = () => frame.contentDocument, el = id => page().getElementById(id);
    let time = 0;
    const tick = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) frame.contentWindow.__testFrame(time += 1000 / 60); };
    const command = name => page().querySelector(`[data-debug-command="${name}"]`).click();
    assert(page().body.dataset.mode === 'debug' && !el('debug-tools').hidden && el('debug-speed').value === '10');
    assert(el('gold').textContent === String(RULES.startingGold + DEBUG_GOLD));
    frame.contentWindow.__testFrame(0); tick(1);
    el('save-menu').click(); el('manual-save').click();
    let saved = parseSession(frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY));
    assert(Math.abs(saved.game.elapsed - 10) < 0.1, '10x speed must run 600 ordinary simulation steps per real second');
    const elapsed = saved.game.elapsed; tick(5); el('manual-save').click();
    saved = parseSession(frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY)); near(saved.game.elapsed, elapsed);
    el('close-save').click(); el('pause-battle').click(); tick(5);
    el('pause-battle').click(); el('debug-speed').value = '20'; el('debug-speed').dispatchEvent(new Event('change'));
    tick(0.5); el('save-menu').click(); el('manual-save').click();
    saved = parseSession(frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY));
    assert(saved.game.elapsed - elapsed > 9 && saved.game.elapsed - elapsed < 10.1);
    el('close-save').click(); command('victory');
    assert(el('result-title').textContent === '战役胜利'); el('play-again').click();
    assert(el('enemy-era').textContent === 'II');
    command('finale'); assert(el('result-title').textContent === '文明未能幸存');
    command('finale'); el('play-again').click();
    assert(el('cycles').textContent === '1' && el('legacy').textContent === '1');
    assert(el('buy-production').disabled); el('buy-spark').click(); el('rebuild-civilization').click();
    command('finale'); el('result-talents').click(); el('node-production').click();
    el('buy-production').click(); el('rebuild-civilization').click();
    assert(el('income-rate').textContent === '+10.5/s' && el('gold').textContent === String(RULES.startingGold + DEBUG_GOLD));
    saved = parseSession(frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY));
    assert(!frame.contentWindow.__storage.getItem(SAVE_KEY)); frame.remove();
    frame = await mountFixture(serializeSession(saved), false, 'debug');
    assert(el('debug-speed').value === '20' && el('gold').textContent === String(saved.game.gold.player), 'Reload must not grant resources twice');
    assert(el('income-rate').textContent === '+10.5/s');
    command('defeat'); el('play-again').click(); assert(el('cycles').textContent === '2' && el('legacy').textContent === '0');
    frame.style.width = '360px'; assert(page().documentElement.scrollWidth <= frame.clientWidth);
    frame.remove();
  });
}
