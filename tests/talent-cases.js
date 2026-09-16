import { AGES, UNITS, TURRETS, RULES, createGame, evolve, getIncomeRate, getBountyReward, recruit } from '../src/game.js';
import { createProgression, resolveBattle, rebuildCivilization, continueCivilization, abandonCivilization, updateProgression, purchaseUpgrade } from '../src/progression.js';
import { TALENTS, purchaseTalent, getTalentState, getLegacyReward, getTalentSpending } from '../src/talents.js';
import { configureAutomation, getAutomationPlan, updateAutomation } from '../src/automation.js';
import { parseSession, serializeSession, createSaveStore, SAVE_KEY, BACKUP_KEY } from '../src/save.js';
import { mountFixture } from './progression-cases.js';

function finish(session, age = 5, status = 'won') {
  session.game.experience.enemy = AGES[age].experienceRequired;
  while (session.game.ages.enemy < age) evolve(session.game, 'enemy');
  session.game.status = status;
  session.game.bases.enemy.hp = status === 'won' || status === 'draw' ? 0 : session.game.bases.enemy.maxHp;
  session.game.bases.player.hp = status === 'lost' || status === 'draw' ? 0 : session.game.bases.player.maxHp;
  resolveBattle(session);
}
function funded(cycles = 40) {
  const session = createProgression();
  for (let i = 0; i < cycles; i++) {
    if (i) rebuildCivilization(session, session.run.runId);
    finish(session);
  }
  return session;
}
function start(session) { rebuildCivilization(session, session.run.runId); session.game.ai.enabled = false; return session; }
function attempt(session, options) { for (let i = 0; i < 5; i++) updateAutomation(session, 0.05, options); }
function ageTo(game, age) { game.experience.player = AGES[age].experienceRequired; while (game.ages.player < age) evolve(game); }
function v1(session) {
  const old = JSON.parse(serializeSession(session)), auto = old.permanent.automation;
  old.version = 1; delete old.permanent.totalLegacy; delete old.permanent.talents; delete old.run.talents; delete old.run.autoTurn; delete old.game.modifiers.bounty;
  old.permanent.automation = { unlocked: auto.unlocked, enabled: auto.enabled, target: auto.target };
  return JSON.stringify(old);
}

export function registerTalentTests(test, assert, near) {
  const rejects = action => { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected, 'Invalid save must be rejected'); };
  test('Talents: first completion unlocks the tree, dependencies/costs/caps are enforced and features remain opt-in', () => {
    const s = createProgression(); finish(s, 1, 'lost');
    for (const key of Object.keys(TALENTS)) assert(getTalentState(s, key) === 'locked' && !purchaseTalent(s, key));
    assert(!purchaseUpgrade(s, 'production') && !configureAutomation(s, { enabled: true }));
    start(s); finish(s);
    assert(getTalentState(s, 'evolution') === 'prerequisite');
    assert(purchaseTalent(s, 'formation') && s.permanent.legacy === 0 && !purchaseTalent(s, 'formation'));
    assert(!s.permanent.automation.enabled && s.permanent.automation.mode === 'single');
    assert(configureAutomation(s, { mode: 'balanced' }) && !configureAutomation(s, { evolve: true }));
    assert(!s.run.talents.formation); start(s); assert(s.run.talents.formation === 1);
    assert(getTalentState(s, 'defense') === 'during-run');
  });
  test('Talents: all costs and prerequisite paths can be purchased, capped and saved without sharing configuration', () => {
    const s = funded(200), original = JSON.stringify({ AGES, UNITS, TURRETS });
    for (const key of ['production', 'warfare']) for (let i = 0; i < 5; i++) assert(purchaseUpgrade(s, key));
    for (const [key, config] of Object.entries(TALENTS)) {
      for (const cost of config.costs) {
        const before = s.permanent.legacy; assert(purchaseTalent(s, key)); near(s.permanent.legacy, before - cost);
      }
      assert(!purchaseTalent(s, key));
    }
    assert(s.permanent.legacy + 62 + getTalentSpending(s.permanent.talents) === s.permanent.totalLegacy);
    assert(!purchaseTalent(s, 'constructor'));
    start(s); const restored = parseSession(serializeSession(s));
    near(restored.game.gold.player, 180 + 450); near(getIncomeRate(restored.game, 'enemy'), 7);
    assert(getBountyReward(restored.game, 10) === 17 && getBountyReward(restored.game, 10, 'enemy') === 10);
    assert(getBountyReward(createGame({ modifiers: { bounty: 100 } }), 10) === 10);
    assert(JSON.stringify({ AGES, UNITS, TURRETS }) === original);
  });
  test('Talents: starting resources apply once per rebuild, not per conflict, purchase or reload', () => {
    const s = funded(4); purchaseUpgrade(s, 'production'); purchaseTalent(s, 'supply');
    assert(s.game.gold.player === 180); start(s); assert(s.game.gold.player === 330);
    s.game.gold.player = 200; recruit(s.game, 'melee'); finish(s, 1);
    continueCivilization(s, s.run.battleId); assert(s.game.gold.player === 200, 'Only refund the pending order');
    for (let i = 0; i < 3; i++) assert(parseSession(serializeSession(s)).game.gold.player === 200);
    const id = s.run.runId; assert(abandonCivilization(s, id) && !abandonCivilization(s, id));
    assert(s.game.gold.player === 330);
  });
  test('Talents: salvage changes only player kill gold with one final rounding; actual casualty payouts use it', () => {
    for (const victim of ['player', 'enemy']) {
      const s = funded(4); purchaseUpgrade(s, 'warfare'); purchaseTalent(s, 'salvage'); start(s);
      const g = s.game, winner = victim === 'player' ? 'enemy' : 'player';
      g.units.push({ id: g.nextUnitId++, type: 'melee', team: victim, x: 640, hp: 0, moving: false, attackCooldown: 0, attackAnimation: 0, hitFlash: 0 });
      const before = g.gold[winner]; updateProgression(s, RULES.fixedStep);
      near(g.gold[winner] - before, getIncomeRate(g, winner) * RULES.fixedStep + (winner === 'player' ? 12 : 10));
      assert(parseSession(serializeSession(s)).game.modifiers.bounty === 1.25);
    }
  });
  test('Talents: legacy scales from run snapshots, rounds once and settles exactly once across refresh/purchase/rebuild', () => {
    let s = funded(30); purchaseTalent(s, 'conservation'); purchaseTalent(s, 'conservation'); purchaseTalent(s, 'continuity');
    assert(s.run.earnedLegacy === 1 && getLegacyReward(s.permanent.talents) === 4);
    const before = s.permanent.totalLegacy; start(s); finish(s);
    assert(s.run.earnedLegacy === 4 && s.permanent.totalLegacy === before + 4);
    s = parseSession(serializeSession(s)); const balance = s.permanent.legacy;
    for (let i = 0; i < 10; i++) { resolveBattle(s); updateProgression(s, 0.05); }
    assert(s.permanent.legacy === balance);
    purchaseTalent(s, 'continuity'); assert(s.run.earnedLegacy === 4 && parseSession(serializeSession(s)).run.earnedLegacy === 4);
    start(s); finish(s, 5, 'draw'); assert(s.run.earnedLegacy === 0 && s.permanent.totalLegacy === before + 4);
    start(s); finish(s); assert(s.run.earnedLegacy === 6);
  });
  test('Autobuyer: reserve, custom queue limit, army cap and manual override all use normal payment', () => {
    const s = start(funded(1)); configureAutomation(s, { enabled: true, target: 'heavy', reserve: 150, queueLimit: 1 });
    attempt(s); assert(!s.game.queues.player.length && getAutomationPlan(s).action.state === 'budget');
    s.game.gold.player = 235; attempt(s); assert(s.game.gold.player === 150 && s.game.queues.player[0].paid === 85);
    s.game.gold.player = 10000; attempt(s); assert(s.game.queues.player.length === 1);
    assert(recruit(s.game, 'melee'), 'Manual recruitment is not restricted by the automation queue cap');
    s.game.queues.player = [];
    s.game.units = Array.from({ length: 16 }, () => ({ id: s.game.nextUnitId++, type: 'melee', team: 'player', hp: 70, x: 100, moving: false, attackCooldown: 0, attackAnimation: 0, hitFlash: 0 }));
    attempt(s); assert(!s.game.queues.player.length);
    const raw = serializeSession(s);
    for (const patch of [{ reserve: -1 }, { reserve: NaN }, { queueLimit: 6 }, { weights: [0, 0, 0] }, { mode: 'balanced' }, { priority: 'unknown' }, { unlocked: true }]) assert(!configureAutomation(s, patch));
    assert(serializeSession(s) === raw);
  });
  test('Autobuyer: balanced recruitment counts pending and old-era troops and waits for the chosen expensive role', () => {
    const s = funded(); purchaseTalent(s, 'formation'); start(s); s.game.gold.player = 10000;
    configureAutomation(s, { enabled: true, mode: 'balanced', weights: [2, 2, 1] });
    for (let i = 0; i < 5; i++) attempt(s);
    assert(JSON.stringify(s.game.queues.player.map(order => order.type)) === JSON.stringify(['melee', 'archer', 'heavy', 'melee', 'archer']));
    s.game.queues.player.splice(1, 1); ageTo(s.game, 2); attempt(s);
    assert(s.game.queues.player.at(-1).type === 'crossbow');
    s.game.queues.player = []; configureAutomation(s, { weights: [0, 0, 1] });
    s.game.gold.player = 129; attempt(s); assert(!s.game.queues.player.length && s.game.gold.player === 129);
    s.game.gold.player = 130; attempt(s); assert(s.game.queues.player[0].type === 'knight' && s.game.gold.player === 0);
  });
  test('Autobuyer: evolution follows experience, resolves new-era targets and stops at the surface endpoint', () => {
    const s = funded(); purchaseTalent(s, 'formation'); purchaseTalent(s, 'evolution'); start(s);
    configureAutomation(s, { enabled: true, evolve: true, target: 'heavy' }); s.game.gold.player = 10000;
    attempt(s); assert(s.game.ages.player === 1);
    s.game.experience.player = AGES[5].experienceRequired;
    for (let i = 0; i < 4; i++) attempt(s);
    assert(s.game.ages.player === 5 && s.game.queues.player.at(-1).type === 'warMachine');
    assert(s.game.ages.enemy === 1 && !s.run.settled && s.run.phase === 'battle');
    attempt(s); assert(s.game.ages.player === 5);
  });
  test('Autobuyer: defense funds complete expansion/replacement transactions, preserving old towers until affordable', () => {
    const s = funded(); purchaseTalent(s, 'formation'); purchaseTalent(s, 'defense'); purchaseTalent(s, 'defense'); start(s);
    configureAutomation(s, { enabled: true, recruitEnabled: false, defense: true, expand: true, maxTurrets: 2, reserve: 100 });
    s.game.gold.player = 440; attempt(s); assert(s.game.gold.player === 320 && s.game.turrets.player[0].type === 'rockSling');
    s.game.gold.player = 319; attempt(s); assert(s.game.turrets.player.length === 1);
    s.game.gold.player = 320; attempt(s); assert(s.game.turrets.player.length === 2 && s.game.gold.player === 100);
    ageTo(s.game, 2); attempt(s); assert(s.game.turrets.player.every(tower => tower.type === 'rockSling'));
    configureAutomation(s, { replace: true, maxTurrets: 1 }); s.game.gold.player = 279; attempt(s);
    assert(s.game.turrets.player[0].type === 'rockSling' && s.game.gold.player === 279);
    s.game.gold.player = 280; attempt(s); assert(s.game.turrets.player[0].type === 'catapult' && s.game.gold.player === 100);
    configureAutomation(s, { turretTarget: 1 }); s.game.gold.player = 10000; attempt(s);
    assert(s.game.turrets.player[0].type === 'catapult', 'Never churn same-era towers');
    assert(s.game.turrets.enemy.length === 1 && s.game.turrets.enemy[0] === null);
    parseSession(serializeSession(s));
  });
  test('Autobuyer: fair scheduling gives defense a turn; a saving target cannot be starved by cheaper purchases', () => {
    const s = funded(); purchaseTalent(s, 'formation'); purchaseTalent(s, 'defense'); start(s);
    configureAutomation(s, { enabled: true, defense: true }); s.game.gold.player = 250;
    attempt(s); assert(s.game.queues.player.length === 1 && !s.game.turrets.player[0]);
    const resumed = parseSession(serializeSession(s)); attempt(resumed);
    assert(resumed.game.turrets.player[0].type === 'rockSling' && resumed.game.gold.player === 100);
    configureAutomation(s, { priority: 'defense', turretTarget: 2 }); s.game.gold.player = 100; attempt(s);
    assert(s.game.gold.player === 100 && s.game.queues.player.length === 1);
  });
  test('Autobuyer: elite recruitment is unlocked, future-only, fully paid and counts queued soldiers toward its target', () => {
    const s = funded(); for (const key of ['formation', 'evolution', 'elite']) purchaseTalent(s, key); start(s);
    configureAutomation(s, { enabled: true, elite: true, eliteLimit: 2 }); s.game.gold.player = 10000; attempt(s);
    assert(s.game.queues.player[0].type === 'melee'); s.game.queues.player = []; ageTo(s.game, 5);
    s.game.gold.player = 6000; attempt(s); attempt(s);
    assert(s.game.queues.player.length === 2 && s.game.queues.player.every(order => order.type === 'superSoldier' && order.paid === 3000));
    s.game.gold.player = 220; attempt(s); assert(s.game.queues.player.at(-1).type === 'blade');
    parseSession(serializeSession(s));
  });
  test('Autobuyer: every action stops during pause, hidden pages, disabled master control and civilization settlement', () => {
    const s = funded(); for (const key of ['formation', 'evolution', 'defense']) purchaseTalent(s, key); start(s);
    configureAutomation(s, { enabled: true, evolve: true, defense: true }); s.game.gold.player = 10000; s.game.experience.player = 2200;
    for (const options of [{ paused: true }, { hidden: true }]) { const before = serializeSession(s); attempt(s, options); assert(serializeSession(s) === before); }
    configureAutomation(s, { enabled: false }); const before = serializeSession(s); attempt(s); assert(serializeSession(s) === before);
    configureAutomation(s, { enabled: true }); finish(s); const ended = serializeSession(s); attempt(s); assert(serializeSession(s) === ended);
  });
  test('Autobuyer full civilization: purchased talents, normal paid armies and defense reach the finale without manual combat commands', () => {
    const s = funded(200);
    for (const key of ['production', 'warfare']) for (let i = 0; i < 5; i++) purchaseUpgrade(s, key);
    for (const [key, config] of Object.entries(TALENTS)) for (const cost of config.costs) purchaseTalent(s, key);
    rebuildCivilization(s, s.run.runId); // Keep the normal enemy AI enabled.
    configureAutomation(s, { enabled: true, mode: 'balanced', weights: [2, 2, 1], queueLimit: 2, reserve: 50,
      evolve: true, defense: true, expand: true, replace: true, maxTurrets: 3, elite: true, eliteLimit: 1 });
    for (let i = 0; i < 60 * 900 && !s.run.settled; i++) {
      if (s.run.phase === 'victory') continueCivilization(s, s.run.battleId); // The player's continue button.
      assert(s.run.phase === 'battle', `Automation lost after ${s.run.elapsed}s`);
      updateProgression(s, RULES.fixedStep);
      if (i % 600 === 0) parseSession(serializeSession(s));
    }
    assert(s.run.phase === 'destruction' && s.run.earnedLegacy === 8 && s.permanent.completedCycles === 201);
  });
  test('Save v2: valid v1 battle, victory, settlement and rebuilt progress migrate without awards, resource grants or setting loss', () => {
    for (const phase of ['battle', 'victory', 'destruction', 'rebuilt']) {
      const s = phase === 'battle' ? createProgression() : funded(3);
      if (phase === 'victory') { start(s); finish(s, 1); }
      if (phase === 'rebuilt') { purchaseUpgrade(s, 'production'); configureAutomation(s, { enabled: true, target: 'heavy' }); start(s); }
      const restored = parseSession(v1(s));
      assert(restored.version === 2 && restored.run.runId === s.run.runId && restored.run.phase === s.run.phase);
      assert(restored.permanent.legacy === s.permanent.legacy && restored.permanent.totalLegacy === s.permanent.completedCycles);
      assert(restored.game.gold.player === s.game.gold.player && restored.run.earnedLegacy === s.run.earnedLegacy);
      assert(restored.permanent.upgrades.production === s.permanent.upgrades.production);
      assert(restored.permanent.automation.enabled === s.permanent.automation.enabled && restored.permanent.automation.target === s.permanent.automation.target);
      assert(!restored.permanent.automation.evolve && restored.game.modifiers.bounty === 1);
      assert(serializeSession(parseSession(serializeSession(restored))) === serializeSession(restored));
    }
  });
  test('Save v2: validates talent dependencies, ledger, settings and reward snapshots; migration retains a valid v1 backup', () => {
    const s = funded(); purchaseTalent(s, 'formation');
    for (const mutate of [x => x.permanent.totalLegacy++, x => x.permanent.talents.formation = 2,
      x => x.permanent.automation.evolve = true, x => x.permanent.automation.weights = [0, 0, 0],
      x => x.run.earnedLegacy++, x => x.run.autoTurn = 'unknown', x => x.game.modifiers.bounty = 2,
      x => { x.permanent.talents.supply = 1; x.permanent.legacy--; }]) {
      const data = JSON.parse(serializeSession(s)); mutate(data); rejects(() => parseSession(JSON.stringify(data)));
    }
    const corruptOld = JSON.parse(v1(funded(2))); corruptOld.permanent.legacy++; rejects(() => parseSession(JSON.stringify(corruptOld)));
    const entries = new Map([[SAVE_KEY, v1(funded(2))]]), old = entries.get(SAVE_KEY);
    const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
    const store = createSaveStore(() => storage), loaded = store.load();
    assert(loaded.ok && loaded.migrated && store.save(loaded.session).ok && entries.get(BACKUP_KEY) === old);
    assert(JSON.parse(entries.get(SAVE_KEY)).version === 2);
  });
  test('Talents browser: purchase prerequisites, configure autobuyer, rebuild, reload and fit the full tree on a phone', async () => {
    let frame = await mountFixture(serializeSession(funded(30)));
    const page = () => frame.contentDocument, el = id => page().getElementById(id);
    el('archives').click(); assert(el('archives-dialog').open && !el('talents-panel').hidden);
    assert(el('buy-evolution').disabled); el('buy-formation').click(); el('buy-formation').click();
    assert(el('legacy').textContent === '29' && !el('buy-evolution').disabled);
    el('buy-evolution').click(); el('buy-defense').click(); el('buy-conservation').click();
    assert(el('talent-legacy-preview').textContent.includes('本轮终局 +1 · 下轮终局 +2'));
    page().querySelector('[data-archive-page="automation"]').click(); assert(!el('automation-panel').hidden);
    el('auto-enabled').click(); el('auto-evolve').click(); el('auto-defense').click();
    const setting = (id, value) => { el(id).value = value; el(id).dispatchEvent(new frame.contentWindow.Event('change')); };
    setting('auto-mode', 'balanced'); setting('auto-reserve', '100'); setting('auto-queue', '2');
    setting('auto-weight-front', '3'); assert(!el('auto-weights').hidden);
    setting('auto-reserve', '-1'); assert(el('auto-reserve').value === '100' && el('automation-error').textContent.includes('未保存'));
    el('rebuild-civilization').click();
    const saved = parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
    assert(saved.run.talents.formation && saved.run.talents.conservation && saved.permanent.automation.reserve === 100);
    assert(saved.permanent.automation.mode === 'balanced' && saved.permanent.automation.evolve && saved.permanent.automation.defense);
    frame.remove(); frame = await mountFixture(serializeSession(saved));
    el('archives').click(); assert(el('auto-evolve').checked && el('auto-weight-front').value === '3' && el('buy-conservation').disabled);
    frame.style.width = '320px'; assert(page().documentElement.scrollWidth <= frame.clientWidth, 'Talent tree must fit a phone');
    assert(el('archives-dialog').scrollWidth <= el('archives-dialog').clientWidth, 'Tree must not overflow inside its dialog');
    page().querySelector('[data-archive-page="automation"]').click();
    assert(page().documentElement.scrollWidth <= frame.clientWidth, 'Automation controls must fit a phone');
    assert(el('archives-dialog').scrollWidth <= el('archives-dialog').clientWidth, 'Automation must not overflow inside its dialog');
    frame.remove();
  });
  test('Talents browser: an existing v1 settlement migrates once, keeps its original backup and exposes the new tree', async () => {
    const seed = funded(3); purchaseUpgrade(seed, 'production'); configureAutomation(seed, { enabled: true, target: 'ranged' });
    const raw = v1(seed), frame = await mountFixture(raw), page = frame.contentDocument;
    const storage = frame.contentWindow.__storage, restored = parseSession(storage.getItem(SAVE_KEY));
    assert(JSON.parse(storage.getItem(SAVE_KEY)).version === 2 && storage.getItem(BACKUP_KEY) === raw);
    assert(restored.permanent.legacy === 2 && restored.run.earnedLegacy === 1 && restored.permanent.upgrades.production === 1);
    assert(page.getElementById('save-status').textContent.includes('旧存档已升级'));
    page.getElementById('play-again').click();
    assert(page.getElementById('archives-dialog').open && page.getElementById('auto-enabled').checked);
    assert(page.getElementById('auto-target').value === 'ranged' && !page.getElementById('buy-formation').disabled);
    frame.remove();
  });
}
