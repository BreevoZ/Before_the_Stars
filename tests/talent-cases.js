import { buyUnitPath, buyAllTalents } from './trait-cases.js';
import { canonical } from './legacy-fixtures.js';
import { statMultiplier, v5Record } from './legacy-fixtures.js';
import { AGES, UNITS, TURRETS, RULES, createGame, evolve, getIncomeRate, getBountyReward, recruit } from '../src/game.js';
import { createProgression, resolveBattle, rebuildCivilization, continueCivilization, abandonCivilization, updateProgression, purchaseUpgrade, getUpgradeState } from '../src/progression.js';
import { TALENTS, TALENT_TREE, layerTalents, purchaseTalent, getTalentState, getLegacyReward, getTalentSpending } from '../src/talents.js';
import { configureAutomation, getAutomationPlan, updateAutomation } from '../src/automation.js';
import { parseSession, serializeSession, createSaveStore, SAVE_KEY, BACKUP_KEY } from '../src/save.js';
import { SAVE_VERSION } from '../src/progression-config.js';
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
function v1(session, settings = {}) {
  const old = JSON.parse(v2(session)), auto = old.permanent.automation;
  delete old.permanent.talentGrants;
  old.version = 1; delete old.permanent.totalLegacy; delete old.permanent.talents; delete old.run.talents; delete old.run.autoTurn; delete old.game.modifiers.bounty;
  old.permanent.automation = { unlocked: session.permanent.completedCycles > 0, enabled: auto.enabled, target: auto.target, ...settings };
  return JSON.stringify(old);
}

function stripChallenge(old) {
  old.permanent.legacy += old.permanent.talents.challenge * TALENTS.challenge.costs[0];
  delete old.permanent.talents.challenge; delete old.run.talents.challenge;
  delete old.run.challengeLevel; delete old.game.enemyModifiers;
}
function v2(session) {
  const old = v5Record(session), p = old.permanent;
  old.version = 2; stripChallenge(old);
  for (const key of ['autobuyer', 'logistics']) {
    if (!p.talentGrants.includes(key)) p.legacy += p.talents[key];
    delete p.talents[key]; delete old.run.talents[key];
  }
  delete p.talentGrants;
  p.automation.unlocked = p.completedCycles > 0;
  return JSON.stringify(old);
}

function v3(session, removeRoot = false) {
  const old = v5Record(session), p = old.permanent;
  old.version = 3; stripChallenge(old);
  if (removeRoot) {
    if (!p.talentGrants.includes('autobuyer')) p.legacy += p.talents.autobuyer;
    p.talentGrants = p.talentGrants.filter(key => key !== 'autobuyer');
    p.talents.autobuyer = old.run.talents.autobuyer = 0;
    p.automation.unlocked = p.automation.enabled = false;
  }
  return JSON.stringify(old);
}

export function registerTalentTests(test, assert, near) {
  const rejects = action => { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected, 'Invalid save must be rejected'); };
  test('Talents: first completion unlocks the tree, dependencies/costs/caps are enforced and features remain opt-in', () => {
    const s = createProgression(); finish(s, 1, 'lost');
    for (const key of Object.keys(TALENTS)) assert(getTalentState(s, key) === (TALENTS[key].placeholder ? 'planned' : 'locked') && !purchaseTalent(s, key));
    assert(!purchaseUpgrade(s, 'production') && !configureAutomation(s, { enabled: true }));
    start(s); finish(s);
    assert(getTalentState(s, 'evolution') === 'prerequisite');
    assert(!s.permanent.automation.unlocked && !configureAutomation(s, { enabled: true }));
    assert(getTalentState(s, 'formation') === 'prerequisite');
    assert(purchaseTalent(s, 'spark') && s.permanent.legacy === 0 && !purchaseTalent(s, 'spark'));
    assert(!s.permanent.automation.enabled && s.permanent.automation.mode === 'single');
    assert(!configureAutomation(s, { mode: 'balanced' }) && !configureAutomation(s, { reserve: 1 }) && !configureAutomation(s, { queueLimit: 1 }) && !configureAutomation(s, { recruitEnabled: false }));
    assert(!configureAutomation(s, { enabled: true, target: 'heavy' }));
    start(s); finish(s); assert(configureAutomation(s, { enabled: true, target: 'heavy' })); assert(purchaseTalent(s, 'formation'));
    assert(configureAutomation(s, { mode: 'balanced' }) && !configureAutomation(s, { evolve: true }));
    assert(!s.run.talents.formation); start(s); assert(s.run.talents.formation === 1);
    assert(getTalentState(s, 'defense') === 'during-run');
  });
  test('Talents: all costs and prerequisite paths can be purchased, capped and saved without sharing configuration', () => {
    const s = funded(400), original = JSON.stringify({ AGES, UNITS, TURRETS });
    assert(purchaseTalent(s, 'spark'));
    for (const key of ['production', 'warfare']) for (let i = 0; i < 5; i++) assert(purchaseUpgrade(s, key));
    buyAllTalents(s);
    for (const key of Object.keys(TALENTS)) assert(!purchaseTalent(s, key));
    assert(s.permanent.legacy + 62 + getTalentSpending(s.permanent.talents) === s.permanent.totalLegacy);
    assert(!purchaseTalent(s, 'constructor'));
    start(s); const restored = parseSession(serializeSession(s));
    near(restored.game.gold.player, 180 + 450); near(getIncomeRate(restored.game, 'enemy'), 7);
    assert(getBountyReward(restored.game, 10) === 17 && getBountyReward(restored.game, 10, 'enemy') === 10);
    assert(getBountyReward(createGame({ modifiers: { bounty: 100 } }), 10) === 10);
    assert(JSON.stringify({ AGES, UNITS, TURRETS }) === original);
  });
  test('Talents: starting resources apply once per rebuild, not per conflict, purchase or reload', () => {
    const s = funded(4); purchaseTalent(s, 'spark'); purchaseUpgrade(s, 'production'); purchaseTalent(s, 'supply');
    assert(s.game.gold.player === 180); start(s); assert(s.game.gold.player === 330);
    s.game.gold.player = 200; recruit(s.game, 'melee'); finish(s, 1);
    continueCivilization(s, s.run.battleId); assert(s.game.gold.player === 200, 'Only refund the pending order');
    for (let i = 0; i < 3; i++) assert(parseSession(serializeSession(s)).game.gold.player === 200);
    const id = s.run.runId; assert(abandonCivilization(s, id) && !abandonCivilization(s, id));
    assert(s.game.gold.player === 330);
  });
  test('Talents: salvage changes only player kill gold with one final rounding; actual casualty payouts use it', () => {
    for (const victim of ['player', 'enemy']) {
      const s = funded(4); purchaseTalent(s, 'spark'); purchaseUpgrade(s, 'warfare'); purchaseTalent(s, 'salvage'); start(s);
      const g = s.game, winner = victim === 'player' ? 'enemy' : 'player';
      g.units.push({ id: g.nextUnitId++, type: 'melee', team: victim, x: 640, hp: 0, moving: false, attackCooldown: 0, attackAnimation: 0, hitFlash: 0 });
      const before = g.gold[winner]; updateProgression(s, RULES.fixedStep);
      near(g.gold[winner] - before, getIncomeRate(g, winner) * RULES.fixedStep + (winner === 'player' ? 12 : 10));
      assert(statMultiplier(parseSession(serializeSession(s)).game, 'bounty') === 1.25);
    }
  });
  test('Talents: legacy scales from run snapshots, rounds once and settles exactly once across refresh/purchase/rebuild', () => {
    let s = funded(30); purchaseTalent(s, 'spark'); purchaseTalent(s, 'conservation'); purchaseTalent(s, 'conservation'); purchaseTalent(s, 'continuity');
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
    const s = funded(2); purchaseTalent(s, 'spark'); purchaseTalent(s, 'logistics'); start(s); configureAutomation(s, { enabled: true, target: 'heavy', reserve: 150, queueLimit: 1 });
    attempt(s); assert(!s.game.queues.player.length && getAutomationPlan(s).action.state === 'budget');
    s.game.gold.player = 235; attempt(s); assert(s.game.gold.player === 150 && s.game.queues.player[0].paid === 85);
    s.game.gold.player = 10000; attempt(s); assert(s.game.queues.player.length === 1);
    assert(recruit(s.game, 'melee'), 'Manual recruitment is not restricted by the automation queue cap');
    s.game.queues.player = [];
    s.game.units = Array.from({ length: 16 }, () => ({ id: s.game.nextUnitId++, type: 'melee', team: 'player', hp: 70, x: 100, moving: false, attackCooldown: 0, attackAnimation: 0, hitFlash: 0 }));
    attempt(s); assert(!s.game.queues.player.length);
    const raw = serializeSession(s);
    for (const patch of [{ reserve: -1 }, { reserve: NaN }, { queueLimit: 65 }, { weights: [0, 0, 0] }, { mode: 'balanced' }, { priority: 'unknown' }, { unlocked: true }]) assert(!configureAutomation(s, patch));
    assert(serializeSession(s) === raw);
  });
  test('Autobuyer: balanced recruitment counts pending and old-era troops and waits for the chosen expensive role', () => {
    const s = funded(); purchaseTalent(s, 'spark'); purchaseTalent(s, 'logistics'); purchaseTalent(s, 'formation'); start(s); s.game.gold.player = 10000;
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
    const s = funded(); purchaseTalent(s, 'spark'); purchaseTalent(s, 'logistics'); purchaseTalent(s, 'formation'); purchaseTalent(s, 'evolution'); start(s);
    configureAutomation(s, { enabled: true, evolve: true, target: 'heavy' }); s.game.gold.player = 10000;
    attempt(s); assert(s.game.ages.player === 1);
    s.game.experience.player = AGES[5].experienceRequired;
    for (let i = 0; i < 4; i++) attempt(s);
    assert(s.game.ages.player === 5 && s.game.queues.player.at(-1).type === 'warMachine');
    assert(s.game.ages.enemy === 1 && !s.run.settled && s.run.phase === 'battle');
    attempt(s); assert(s.game.ages.player === 5);
  });
  test('Autobuyer: defense funds complete expansion/replacement transactions, preserving old towers until affordable', () => {
    const s = funded(); purchaseTalent(s, 'spark'); purchaseTalent(s, 'logistics'); purchaseTalent(s, 'formation'); purchaseTalent(s, 'defense'); purchaseTalent(s, 'defense'); start(s);
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
    const s = funded(); purchaseTalent(s, 'spark'); purchaseTalent(s, 'logistics'); purchaseTalent(s, 'formation'); purchaseTalent(s, 'defense'); start(s);
    configureAutomation(s, { enabled: true, defense: true }); s.game.gold.player = 250;
    attempt(s); assert(s.game.queues.player.length === 1 && !s.game.turrets.player[0]);
    const resumed = parseSession(serializeSession(s)); attempt(resumed);
    assert(resumed.game.turrets.player[0].type === 'rockSling' && resumed.game.gold.player === 100);
    configureAutomation(s, { priority: 'defense', turretTarget: 2 }); s.game.gold.player = 100; attempt(s);
    assert(s.game.gold.player === 100 && s.game.queues.player.length === 1);
  });
  test('Autobuyer: elite recruitment is unlocked, future-only, fully paid and counts queued soldiers toward its target', () => {
    const s = funded(80); for (const key of ['spark', 'formation', 'evolution']) purchaseTalent(s, key); buyUnitPath(s); purchaseTalent(s,'elite'); start(s);
    configureAutomation(s, { enabled: true, elite: true, eliteLimit: 2 }); s.game.gold.player = 10000; attempt(s);
    assert(s.game.queues.player[0].type === 'melee'); s.game.queues.player = []; ageTo(s.game, 5);
    s.game.gold.player = 6000; attempt(s); attempt(s);
    assert(s.game.queues.player.length === 2 && s.game.queues.player.every(order => order.type === 'superSoldier' && order.paid === 3000));
    s.game.gold.player = 220; attempt(s); assert(s.game.queues.player.at(-1).type === 'blade');
    parseSession(serializeSession(s));
  });
  test('Autobuyer: every action stops during pause, hidden pages, disabled master control and civilization settlement', () => {
    const s = funded(); for (const key of ['spark', 'formation', 'evolution', 'defense']) purchaseTalent(s, key); start(s);
    configureAutomation(s, { enabled: true, evolve: true, defense: true }); s.game.gold.player = 10000; s.game.experience.player = 2200;
    for (const options of [{ paused: true }, { hidden: true }]) { const before = serializeSession(s); attempt(s, options); assert(serializeSession(s) === before); }
    configureAutomation(s, { enabled: false }); const before = serializeSession(s); attempt(s); assert(serializeSession(s) === before);
    configureAutomation(s, { enabled: true }); finish(s); const ended = serializeSession(s); attempt(s); assert(serializeSession(s) === ended);
  });
  test('Autobuyer full civilization: purchased talents, normal paid armies and defense reach the finale without manual combat commands', () => {
    const s = funded(400);
    assert(purchaseTalent(s, 'spark'));
    for (const key of ['production', 'warfare']) for (let i = 0; i < 5; i++) purchaseUpgrade(s, key);
    buyAllTalents(s);
    rebuildCivilization(s, s.run.runId); // Keep the normal enemy AI enabled.
    configureAutomation(s, { enabled: true, mode: 'balanced', weights: [2, 2, 1], queueLimit: 2, reserve: 50,
      evolve: true, defense: true, expand: true, replace: true, maxTurrets: 3, elite: true, eliteLimit: 1 });
    for (let i = 0; i < 60 * 900 && !s.run.settled; i++) {
      if (s.run.phase === 'victory') continueCivilization(s, s.run.battleId); // The player's continue button.
      assert(s.run.phase === 'battle', `Automation lost after ${s.run.elapsed}s`);
      updateProgression(s, RULES.fixedStep);
      if (i % 600 === 0) parseSession(serializeSession(s));
    }
    assert(s.run.phase === 'destruction' && s.run.earnedLegacy === 8 && s.permanent.completedCycles === 401);
  });
  test('Save v4: valid v1 battle, victory, settlement and rebuilt progress migrate without awards, resource grants or setting loss', () => {
    for (const phase of ['battle', 'victory', 'destruction', 'rebuilt']) {
      const s = phase === 'battle' ? createProgression() : funded(3);
      if (phase === 'victory') { start(s); finish(s, 1); }
      if (phase === 'rebuilt') { purchaseTalent(s, 'spark'); purchaseUpgrade(s, 'production'); start(s); }
      const restored = parseSession(v1(s, phase === 'rebuilt' ? { enabled: true, target: 'heavy' } : {}));
      assert(restored.version === SAVE_VERSION && restored.run.runId === s.run.runId && restored.run.phase === s.run.phase);
      assert(restored.permanent.legacy === JSON.parse(v1(s)).permanent.legacy && restored.permanent.totalLegacy === s.permanent.completedCycles);
      assert(restored.game.gold.player === s.game.gold.player && restored.run.earnedLegacy === s.run.earnedLegacy);
      assert(restored.permanent.upgrades.production === s.permanent.upgrades.production);
      assert(restored.permanent.automation.enabled === (phase === 'rebuilt') && restored.permanent.automation.target === (phase === 'rebuilt' ? 'heavy' : 'front'));
      assert(!restored.permanent.automation.evolve && statMultiplier(restored.game, 'bounty') === 1);
      assert(serializeSession(parseSession(serializeSession(restored))) === serializeSession(restored));
    }
  });
  test('Save v4: validates talent dependencies, ledger, settings and reward snapshots; migration retains a valid v1 backup', () => {
    const s = funded(); purchaseTalent(s, 'spark'); purchaseTalent(s, 'logistics'); purchaseTalent(s, 'formation');
    for (const mutate of [x => x.permanent.totalLegacy = -1, x => x.permanent.talents.formation = 2,
      x => x.permanent.automation.evolve = true, x => x.permanent.automation.weights = [0, 0, 0],
      x => x.run.earnedLegacy++, x => x.run.autoTurn = 'unknown', x => x.game.bonuses = [],
      x => { x.permanent.talents.supply = 1; x.permanent.legacy--; }]) {
      const data = JSON.parse(serializeSession(s)); mutate(data); rejects(() => parseSession(JSON.stringify(data)));
    }
    const corruptOld = JSON.parse(v1(funded(2))); corruptOld.permanent.legacy++; rejects(() => parseSession(JSON.stringify(corruptOld)));
    const entries = new Map([[SAVE_KEY, v1(funded(2))]]), old = entries.get(SAVE_KEY);
    const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
    const store = createSaveStore(() => storage), loaded = store.load();
    assert(loaded.ok && loaded.migrated && store.save(loaded.session).ok && entries.get(BACKUP_KEY) === old);
    assert(JSON.parse(entries.get(SAVE_KEY)).version === SAVE_VERSION);
  });
  test.browser('Talents browser: purchase prerequisites, configure spark, rebuild, reload and fit the full tree on a phone', async () => {
    let frame = await mountFixture(serializeSession(funded(30)));
    const page = () => frame.contentDocument, el = id => page().getElementById(id);
    el('archives').click(); assert(el('archives-dialog').open && !el('talents-panel').hidden);
    assert(el('buy-evolution').disabled); el('buy-spark').click(); el('node-logistics').click(); el('buy-logistics').click();
    el('node-formation').click(); el('buy-formation').click(); el('buy-formation').click();
    assert(el('legacy').textContent === '27' && !el('buy-evolution').disabled);
    el('node-evolution').click(); el('buy-evolution').click(); el('node-defense').click(); el('buy-defense').click();
    el('node-conservation').click(); el('buy-conservation').click();
    assert(el('talent-legacy-preview').textContent.includes('本轮终局 +1 · 常规重建终局 +2'));
    el('close-archives').click(); el('autobuyer-menu').click(); assert(el('automation-dialog').open && !el('archives-dialog').open);
    el('auto-enabled').click(); el('auto-evolve').click(); el('auto-defense').click();
    const setting = (id, value) => { el(id).value = value; el(id).dispatchEvent(new frame.contentWindow.Event('change')); };
    setting('auto-mode', 'balanced'); setting('auto-reserve', '100'); setting('auto-queue', '2');
    setting('auto-weight-front', '3'); assert(!el('auto-weights').hidden);
    setting('auto-reserve', '-1'); assert(el('auto-reserve').value === '100' && el('automation-error').textContent.includes('未保存'));
    el('automation-to-talents').click(); el('rebuild-civilization').click();
    const saved = parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
    assert(saved.run.talents.formation && saved.run.talents.conservation && saved.permanent.automation.reserve === 100);
    assert(saved.permanent.automation.mode === 'balanced' && saved.permanent.automation.evolve && saved.permanent.automation.defense);
    frame.remove(); frame = await mountFixture(serializeSession(saved));
    el('archives').click(); assert(el('auto-evolve').checked && el('auto-weight-front').value === '3' && el('buy-conservation').disabled);
    frame.style.width = '320px'; assert(page().documentElement.scrollWidth <= frame.clientWidth, 'Talent tree must fit a phone');
    assert(el('archives-dialog').scrollWidth <= el('archives-dialog').clientWidth, 'Tree must not overflow inside its dialog');
    el('close-archives').click(); el('autobuyer-menu').click();
    assert(page().documentElement.scrollWidth <= frame.clientWidth, 'Automation controls must fit a phone');
    assert(el('automation-dialog').scrollWidth <= el('automation-dialog').clientWidth, 'Automation must not overflow inside its dialog');
    frame.remove();
  });
  test.browser('Talents browser: an existing v1 settlement migrates once, keeps its original backup and exposes the new tree', async () => {
    const seed = funded(3); purchaseTalent(seed, 'spark'); purchaseUpgrade(seed, 'production');
    const raw = v1(seed, { enabled: true, target: 'ranged' }), frame = await mountFixture(raw), page = frame.contentDocument;
    const storage = frame.contentWindow.__storage, restored = parseSession(storage.getItem(SAVE_KEY));
    assert(JSON.parse(storage.getItem(SAVE_KEY)).version === SAVE_VERSION && storage.getItem(BACKUP_KEY) === raw);
    assert(restored.permanent.legacy === 2 && restored.run.earnedLegacy === 1 && restored.permanent.upgrades.production === 1);
    assert(page.getElementById('save-status').textContent.includes('旧存档已升级'));
    page.getElementById('archives').click();
    assert(page.getElementById('archives-dialog').open && page.getElementById('auto-enabled').checked);
    assert(page.getElementById('auto-target').value === 'ranged' && !page.getElementById('buy-formation').disabled);
    frame.remove();
  });
  test('Save v4: v2 saves retain former free features, purchased paths, exact wallets and active settings across every phase', () => {
    for (const phase of ['fresh', 'first-settlement', 'battle', 'victory', 'destruction', 'defeat']) {
      const s = phase === 'fresh' ? createProgression() : funded(phase === 'first-settlement' ? 1 : 80);
      if (!['fresh', 'first-settlement'].includes(phase)) {
        for (const key of ['spark', 'logistics', 'formation', 'evolution', 'defense', 'defense']) assert(purchaseTalent(s, key)); buyUnitPath(s); assert(purchaseTalent(s,'elite'));
        assert(configureAutomation(s, { enabled: true, mode: 'balanced', weights: [1, 2, 3], reserve: 100, queueLimit: 2,
          recruitEnabled: false, priority: 'defense', evolve: true, defense: true, expand: true, replace: true, elite: true }));
        start(s);
        if (phase !== 'battle') finish(s, phase === 'victory' ? 1 : 5, phase === 'defeat' ? 'lost' : 'won');
      }
      const raw = v2(s), old = JSON.parse(raw), restored = parseSession(raw), p = restored.permanent;
      assert(restored.version === SAVE_VERSION && p.legacy === old.permanent.legacy && p.totalLegacy === old.permanent.totalLegacy);
      assert(JSON.stringify(canonical(p.automation)) === JSON.stringify(canonical(old.permanent.automation)));
      assert([...p.talentGrants].sort().join(',') === (phase === 'fresh' ? '' : phase === 'first-settlement' ? 'logistics,spark' : 'logistics,spark,superSoldierPlan'));
      assert(restored.run.phase === s.run.phase && restored.run.runId === s.run.runId && restored.run.earnedLegacy === s.run.earnedLegacy);
      assert(restored.game.gold.player === s.game.gold.player && !resolveBattle(restored));
      const saved = serializeSession(restored); assert(serializeSession(parseSession(saved)) === saved);
    }
  });
  test('Save v4: malformed grants, missing new talents, inconsistent unlocks and unpurchased budget settings are rejected', () => {
    const s = funded(3); assert(purchaseTalent(s, 'spark'));
    for (const mutate of [x => x.permanent.automation.unlocked = false,
      x => x.permanent.talentGrants = ['spark', 'spark'], x => x.permanent.talentGrants = ['formation'],
      x => delete x.permanent.talents.logistics, x => x.permanent.automation.reserve = 20,
      x => x.permanent.automation.queueLimit = 1, x => x.permanent.automation.priority = 'defense',
      x => x.permanent.talentGrants = ['logistics']]) {
      const record = JSON.parse(serializeSession(s)); mutate(record); rejects(() => parseSession(JSON.stringify(record)));
    }
    const broken = JSON.parse(v2(funded(3))); broken.permanent.talents.formation = 1;
    rejects(() => parseSession(JSON.stringify(broken)));
    const unsupported = JSON.parse(serializeSession(s)); unsupported.version = 999;
    rejects(() => parseSession(JSON.stringify(unsupported)));
  });
  test.browser('Progressive automation browser: first legacy unlocks speed; second completion unlocks basic recruitment', async () => {
    let frame = await mountFixture(serializeSession(funded(1)));
    const page = () => frame.contentDocument, el = id => page().getElementById(id);
    assert(!el('civilization-bar').hidden && el('legacy-balance').textContent === '1');
    assert(el('play-again').textContent === '查看遗产与天赋' && el('result-talents').hidden);
    el('autobuyer-menu').click(); assert(el('automation-dialog').open && el('automation-settings').hidden);
    assert(!el('auto-enabled').checked && el('auto-enabled').disabled);
    el('automation-to-talents').click(); assert(!el('automation-dialog').open && el('archives-dialog').open);
    assert(!el('buy-spark').disabled && el('buy-formation').disabled);
    el('buy-spark').click(); assert(el('legacy-balance').textContent === '0');
    el('close-archives').click(); el('autobuyer-menu').click();
    assert(el('automation-settings').hidden && el('auto-enabled').disabled);
    let first = parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
    start(first); finish(first); start(first);
    frame.remove(); frame = await mountFixture(serializeSession(first));
    el('autobuyer-menu').click(); assert(!el('automation-settings').hidden && !el('auto-target-field').hidden && el('auto-mode').disabled);
    for (const group of page().querySelectorAll('[data-auto-talent]')) assert(group.hidden, `${group.dataset.autoTalent} must stay hidden`);
    el('auto-enabled').click(); el('auto-target').value = 'heavy'; el('auto-target').dispatchEvent(new frame.contentWindow.Event('change'));
    el('close-automation').click();
    let saved = parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
    assert(saved.run.talents.spark === 1 && saved.permanent.automation.enabled && !saved.permanent.talents.logistics);
    frame.remove(); frame = await mountFixture(serializeSession(saved));
    assert(el('legacy-balance').textContent === '1' && !el('civilization-bar').hidden);
    let time = 0; frame.contentWindow.__testFrame(0);
    const tick = () => { for (let i = 0; i < 60; i++) frame.contentWindow.__testFrame(time += 1000 / 60); };
    el('autobuyer-menu').click(); const gold = el('gold').textContent; tick();
    page().body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { code: 'Digit1', bubbles: true }));
    assert(el('gold').textContent === gold && el('queue-count').textContent === '0 / 5', 'Independent automation modal pauses simulation and shortcuts');
    el('close-automation').click(); tick(); assert(el('queue-count').textContent !== '0 / 5');
    frame.remove();
  });
  test.browser('Rebuild browser: later finales rebuild directly, repeated clicks cannot award or restart again, optional talents stay accessible', async () => {
    let frame = await mountFixture(serializeSession(funded(2)));
    const page = () => frame.contentDocument, el = id => page().getElementById(id);
    assert(el('play-again').textContent === '重建文明' && !el('result-talents').hidden);
    el('result-talents').click(); assert(el('archives-dialog').open); el('close-archives').click();
    const before = parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
    el('play-again').click(); el('play-again').click();
    const after = parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
    assert(!el('archives-dialog').open && !el('automation-dialog').open && after.run.phase === 'battle');
    assert(after.run.runId !== before.run.runId && after.permanent.legacy === 2 && after.permanent.completedCycles === 2);
    assert(!after.run.settled && !after.run.earnedLegacy && after.permanent.automation.unlocked);
    frame.remove(); frame = await mountFixture(serializeSession(after));
    assert(el('legacy-balance').textContent === '2' && !el('civilization-bar').hidden && el('result').hidden);
    frame.remove();
  });
  test.browser('Talent tree browser: real parent branches carry required ranks and selecting a node shows only its detail', async () => {
    const frame = await mountFixture(serializeSession(funded(1))), page = frame.contentDocument;
    const el = id => page.getElementById(id); el('archives').click();
    for (const [key, config] of Object.entries(TALENT_TREE).filter(([,c])=>!c.unit && !c.requiresLayer)) for (const [parent, rank] of Object.entries(config.requires)) {
      const item = page.querySelector(`[data-talent="${key}"]`);
      assert(item.dataset.parent === parent && Number(item.dataset.requiredLevel) === rank);
      const link = el(`link-${key}`);
      assert(link instanceof frame.contentWindow.SVGPathElement && link.dataset.parent === parent && link.dataset.child === key, `${key} must connect to its actual parent through SVG`);
    }
    assert(el('root-caption').textContent.includes('1 Legacy'));
    for (const key of ['production', 'warfare', 'conservation']) assert(el(`buy-${key}`).disabled);
    el('node-evolution').click();
    assert(!el('talent-evolution').hidden && el('talent-spark').hidden && el('node-evolution').getAttribute('aria-pressed') === 'true');
    el('node-conservation').click();
    assert(!el('branch-legacy').hidden && !el('branch-automation').hidden && !el('branch-growth').hidden && !el('talent-conservation').hidden);
    assert(!page.querySelector('[data-talent-branch]'), 'All three routes belong to one tree, with no branch tabs');
    el('node-continuity').click(); assert(el('talent-continuity').textContent.includes('遗产保存 2 级'));
    frame.style.width = '320px';
    assert(page.documentElement.scrollWidth <= frame.clientWidth && el('archives-dialog').scrollWidth <= el('archives-dialog').clientWidth);
    const rootRect = el('node-spark').getBoundingClientRect();
    const branches = ['automation', 'growth', 'legacy'].map(branch => el(`branch-${branch}`).getBoundingClientRect());
    assert(branches[0].left < branches[1].left && branches[1].left < branches[2].left);
    assert(['formation', 'production', 'conservation'].every(key => el(`node-${key}`).getBoundingClientRect().top < rootRect.top), 'Three constellations radiate upwards from the root');
    for (const button of page.querySelectorAll('.talent-node')) {
      const rect = button.getBoundingClientRect(); assert(rect.width >= 56 && rect.height >= 56, 'Tree touch targets remain usable on 320px screens');
    }
    frame.remove();
  });

  test('Single root: all three routes require the one-Legacy Autobuyer root and every node has one path back to it', () => {
    const s = funded(30);
    assert(Object.keys(TALENT_TREE).filter(key => !Object.keys(TALENT_TREE[key].requires).length && !TALENT_TREE[key].requiresLayer).join(',') === 'spark');
    for (const key of Object.keys(TALENT_TREE)) {
      const visited = new Set(); let current = key;
      while (current !== 'spark') {
        assert(!visited.has(current), 'Prerequisite graph must be acyclic'); visited.add(current);
        const config = TALENT_TREE[current], parents = config.requiresLayer ? [layerTalents(config.requiresLayer)[0]] : Object.keys(config.requires);
        assert(parents.length === 1 && TALENT_TREE[parents[0]], `${key} needs one connected parent`);
        current = parents[0];
      }
      if (key === 'spark' || TALENT_TREE[key].placeholder) continue;
      const upgrade = ['production', 'warfare'].includes(key);
      assert((upgrade ? getUpgradeState : getTalentState)(s, key) === 'prerequisite');
      assert(!(upgrade ? purchaseUpgrade : purchaseTalent)(s, key));
    }
    const before = s.permanent.legacy;
    assert(purchaseTalent(s, 'spark') && !purchaseTalent(s, 'spark') && s.permanent.legacy === before - 1);
    assert(!s.permanent.automation.enabled);
    for (const key of ['formation', 'logistics', 'conservation']) assert(getTalentState(s, key) === 'ready');
    for (const key of ['production', 'warfare']) assert(getUpgradeState(s, key) === 'ready');
    assert(purchaseUpgrade(s, 'production') && getTalentState(s, 'supply') === 'ready');
    assert(!purchaseTalent(s, 'continuity')); purchaseTalent(s, 'conservation');
    assert(!purchaseTalent(s, 'continuity')); purchaseTalent(s, 'conservation'); assert(purchaseTalent(s, 'continuity'));
  });
  test('Save v4: v3 growth or legacy owners receive the required root without losing currency, replaying rewards or changing battle bonuses', () => {
    for (const phase of ['fresh', 'no-upgrades', 'battle', 'victory', 'destruction', 'defeat']) {
      const s = phase === 'fresh' ? createProgression() : funded(20);
      const needsRoot = !['fresh', 'no-upgrades'].includes(phase);
      if (needsRoot) {
        purchaseTalent(s, 'spark'); purchaseUpgrade(s, 'production'); purchaseTalent(s, 'conservation'); start(s);
        if (phase !== 'battle') finish(s, phase === 'victory' ? 1 : 5, phase === 'defeat' ? 'lost' : 'won');
      }
      const raw = v3(s, needsRoot), old = JSON.parse(raw), restored = parseSession(raw);
      assert(restored.version === SAVE_VERSION && restored.permanent.legacy === old.permanent.legacy && restored.permanent.totalLegacy === old.permanent.totalLegacy);
      assert(restored.permanent.talents.spark === Number(needsRoot) && restored.permanent.automation.unlocked === (needsRoot || restored.permanent.completedCycles >= 2));
      assert(!restored.permanent.automation.enabled && !restored.permanent.talents.logistics);
      assert(restored.permanent.talentGrants.join(',') === (needsRoot ? 'spark' : ''));
      assert(restored.run.runId === old.run.runId && restored.run.phase === phase.replace('no-upgrades', 'destruction').replace('fresh', 'battle'));
      assert(restored.run.earnedLegacy === old.run.earnedLegacy && JSON.stringify(canonical(restored.game)) === JSON.stringify(canonical(s.game)));
      assert(!resolveBattle(restored) && serializeSession(parseSession(serializeSession(restored))) === serializeSession(restored));
      if (needsRoot) {
        old.version = 4; rejects(() => parseSession(JSON.stringify(old)));
        const entries = new Map([[SAVE_KEY, raw]]);
        const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
        const store = createSaveStore(() => storage), loaded = store.load();
        assert(loaded.migrated && store.save(loaded.session).ok && entries.get(BACKUP_KEY) === raw);
      }
    }
  });

}
