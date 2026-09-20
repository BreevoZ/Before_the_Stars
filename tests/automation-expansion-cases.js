import { Q } from '../src/quantity.js';
import { RULES, AGES, recruit, evolve, updateGame } from '../src/game.js';
import { stat, createBonusStack } from '../src/stats.js';
import { getRunBonuses } from '../src/progression-bonuses.js';
import { getVictorySupplies, SAVE_VERSION } from '../src/progression-config.js';
import { TALENTS, purchaseTalent, getLegacyReward } from '../src/talents.js';
import { createProgression, resolveBattle, rebuildCivilization, updateProgression, continueCivilization, startChallenge } from '../src/progression.js';
import { getChallengeLevels, canStartChallenge } from '../src/progression-machine.js';
import { configureAutomation, updateAutomation, getAutomaticAbilityTarget } from '../src/automation.js';
import { createDebugProgression, runDebugCommand, setDebugLegacy } from '../src/debug.js';
import { parseSession, serializeSession, SAVE_KEY, DEBUG_SAVE_KEY } from '../src/save.js';
import { buildChallengeViewModel } from '../src/civilization-view-model.js';
import { mountFixture } from './progression-cases.js';
import { challengeSeed } from './challenge-cases.js';

const roundtrip = s => parseSession(serializeSession(s));
function ageTo(game, age, team = 'enemy') {
  game.experience[team] = AGES[age].experienceRequired;
  while (game.ages[team] < age) evolve(game, team);
}
function finish(s, age = 5, status = 'won') {
  ageTo(s.game, age); s.game.status = status;
  s.game.bases.enemy.hp = ['won', 'draw'].includes(status) ? 0 : s.game.bases.enemy.maxHp;
  s.game.bases.player.hp = ['lost', 'draw'].includes(status) ? 0 : s.game.bases.player.maxHp;
  return resolveBattle(s);
}
export function automationSeed({ early = false, active = false } = {}) {
  const s = challengeSeed();
  s.permanent.legacy += 300; s.permanent.totalLegacy += 300;
  for (const key of ['logistics', 'formation', 'evolution', 'fireControl', 'campaign', ...(early ? ['extermination'] : [])]) {
    if (!purchaseTalent(s, key)) throw Error(`Seed purchase failed: ${key}`);
  }
  if (active) { rebuildCivilization(s, s.run.runId); s.game.ai.enabled = false; }
  return s;
}
function tickAuto(s, options) { for (let i = 0; i < 5; i++) updateAutomation(s, .05, options); }
function spawn(s, team = 'enemy', type = 'melee', x = 500) {
  s.game.gold[team] = 10000;
  if (!recruit(s.game, type, team)) throw Error('Recruit failed');
  s.game.queues[team][0].remaining = 0; updateGame(s.game, RULES.fixedStep);
  const unit = s.game.units.filter(unit => unit.team === team).at(-1);
  unit.x = x; return unit;
}
export function registerAutomationExpansionTests(test, assert, near) {
  const throws = action => { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected); };
  test('Automation expansion: gated purchases, default-off preferences and new-run snapshots', () => {
    const s = challengeSeed();
    assert(!configureAutomation(s, { ability: true }) && !configureAutomation(s, { campaign: true }));
    assert(!purchaseTalent(s, 'fireControl') && !purchaseTalent(s, 'campaign') && !purchaseTalent(s, 'extermination'));
    const seed = automationSeed({ early: true });
    assert(TALENTS.extermination.requires.campaign === 1 && !seed.permanent.automation.ability && !seed.permanent.automation.campaign);
    assert(!seed.run.talents.extermination && !stat(seed.game, { kind: 'civilization' }, 'earlyFinale'));
    assert(configureAutomation(seed, { ability: true, campaign: true }));
    rebuildCivilization(seed, seed.run.runId);
    assert(stat(seed.game, { kind: 'civilization' }, 'earlyFinale') && !stat(seed.game, { kind: 'civilization', team: 'enemy' }, 'earlyFinale'));
    assert(roundtrip(seed).permanent.automation.campaign && !purchaseTalent(seed, 'defense'));
  });
  test('Automatic abilities: fixed simulation cadence, cooldown and targeting match actual manual casts', () => {
    const s = automationSeed({ active: true });
    configureAutomation(s, { enabled: true, recruitEnabled: false, ability: true });
    assert(getAutomaticAbilityTarget(s.game) === null); tickAuto(s); assert(!s.game.ability);
    for (const x of [200, 500, 550, 620]) spawn(s, 'enemy', 'melee', x);
    const target = getAutomaticAbilityTarget(s.game);
    assert(target >= 480 && target <= 640, `Wrong cluster: ${target}`);
    for (let i = 0; i < 4; i++) updateAutomation(s, .05);
    assert(!s.game.ability); updateAutomation(s, .05);
    const ability = s.game.ability;
    assert(ability.type === 'meteor' && ability.x === target && s.game.abilityCooldown === ability.stats.cooldown);
    assert(ability.stats.damage === stat(s.game, { kind: 'ability', type: 'meteor' }, 'damage'));
    tickAuto(s); assert(s.game.ability === ability, 'Must not re-cast during cooldown');
    const copy = roundtrip(s); assert(copy.game.ability.x === target && copy.permanent.automation.ability);
  });
  test('Automatic abilities: each age, wounded-only healing, restrictions, pause and end guards', () => {
    for (let age = 1; age <= 5; age++) {
      const s = automationSeed({ active: true }); ageTo(s.game, age, 'player');
      configureAutomation(s, { enabled: true, recruitEnabled: false, ability: true });
      const target = spawn(s, age === 3 ? 'player' : 'enemy', age === 3 ? 'duelist' : 'melee');
      if (age === 3) { tickAuto(s); assert(!s.game.ability); target.hp = Q.sub(target.hp, 10); }
      for (const options of [{ paused: true }, { hidden: true }]) { tickAuto(s, options); assert(!s.game.ability); }
      for (const dt of [0, -1, NaN, Infinity]) updateAutomation(s, dt);
      assert(!s.game.ability); tickAuto(s); assert(s.game.ability.type === AGES[age].ability);
    }
    for (const restriction of [ { stat: 'canCast', team: 'player' }, { stat: 'enabled', type: 'meteor', team: 'player' } ]) {
      const s = automationSeed({ active: true }); configureAutomation(s, { enabled: true, ability: true }); spawn(s);
      s.game.bonuses = createBonusStack(s.game.bonuses, [{ target: restriction, type: 'override', value: false, source: { kind: 'challenge', id: 'test', label: '禁用大招' } }]);
      tickAuto(s); assert(!s.game.ability);
    }
    const s = automationSeed({ active: true }); configureAutomation(s, { enabled: true, ability: true }); spawn(s);
    finish(s, 1); tickAuto(s); assert(!s.game.ability);
    assert(configureAutomation(s, { enabled: false })); tickAuto(s); assert(!s.game.ability);
  });
  test('Automatic campaign: a saved victory advances once, preserves assets and pays supplies/refunds once', () => {
    let s = automationSeed({ active: true }); configureAutomation(s, { enabled: true, campaign: true, recruitEnabled: false });
    recruit(s.game, 'melee'); const id = s.run.runId, battle = s.run.battleId, gold = s.game.gold.player;
    const refund = s.game.queues.player[0].paid, legacy = s.permanent.legacy;
    finish(s, 1); const supplies = getVictorySupplies(s.game); s = roundtrip(s);
    for (const options of [{ paused: true }, { hidden: true }]) assert(!updateProgression(s, .05, options));
    assert(s.run.phase === 'victory'); assert(updateProgression(s, .05));
    assert(s.run.runId === id && s.run.battleNumber === 2 && s.run.phase === 'battle');
    near(s.game.gold.player, gold + refund + supplies.gold);
    assert(!s.game.queues.player.length && s.game.ages.enemy === 2 && s.permanent.legacy === legacy);
    assert(s.game.bases.player.hp === s.game.bases.player.maxHp && !continueCivilization(s, battle));
    const second = s.run.battleId; updateProgression(s, .05); assert(s.run.battleId === second);
    finish(s); const ended = serializeSession(s); assert(!updateProgression(s, .05) && serializeSession(s) === ended);
    assert(roundtrip(s).run.settled);
  });
  test('Extermination: any enemy era completes once, persists settlement and never rewards loss/draw', () => {
    for (let age = 1; age <= 5; age++) {
      const s = automationSeed({ early: true, active: true }), cycles = s.permanent.completedCycles, balance = s.permanent.legacy;
      ageTo(s.game, 5, 'player'); assert(!resolveBattle(s));
      assert(finish(s, age) && s.run.phase === 'destruction');
      assert(s.permanent.completedCycles === cycles + 1 && s.permanent.legacy === balance + s.run.earnedLegacy);
      assert(!resolveBattle(s) && !continueCivilization(s, s.run.battleId));
      const restored = roundtrip(s); assert(!resolveBattle(restored) && restored.run.phase === 'destruction');
      assert(rebuildCivilization(restored, restored.run.runId) && roundtrip(restored).run.talents.extermination === 1);
    }
    for (const result of ['lost', 'draw']) {
      const s = automationSeed({ early: true, active: true }), before = s.permanent.legacy;
      finish(s, 1, result); assert(s.run.phase === 'defeat' && s.permanent.legacy === before && s.run.earnedLegacy === 0); roundtrip(s);
    }
    const s = automationSeed({ early: true, active: true });
    s.run.extraBonuses = [{ target: { stat: 'earlyFinale', kind: 'civilization', team: 'player' }, type: 'override', value: false, source: { kind: 'challenge', id: 'no-early', label: '必须抵达未来' } }];
    s.game.bonuses = getRunBonuses(s.run); finish(s, 1); assert(s.run.phase === 'victory'); roundtrip(s);
  });
  test('Challenge selection: ten choices, retained unlocks, safe tokens, repeat rewards and failed-level retry', () => {
    let s = challengeSeed();
    assert(getChallengeLevels(s).length === 10 && getChallengeLevels(s).filter(x => x.unlocked).length === 1);
    for (const level of [0, -1, 1.5, '1', 11, NaN, 4]) assert(!startChallenge(s, s.run.runId, level));
    for (let level = 1; level <= 4; level++) { assert(startChallenge(s, s.run.runId, level)); finish(s); }
    assert(getChallengeLevels(s).filter(x => x.unlocked).length === 5);
    const stale = s.run.runId; assert(startChallenge(s, stale, 4) && !startChallenge(s, stale, 2)); finish(s, 1, 'lost');
    s = roundtrip(s); assert(s.permanent.deepestChallenge === 4 && canStartChallenge(s, 5) && !canStartChallenge(s, 6));
    assert(buildChallengeViewModel(s, 4).bindings['#challenge-reward'].includes('首次抵达') === false);
    assert(buildChallengeViewModel(s, 5).bindings['#challenge-reward'].includes('首次抵达'));
    assert(startChallenge(s, s.run.runId, 2) && !s.run.firstClear); finish(s);
    assert(s.run.earnedLegacy === getLegacyReward(s.run.talents, 2) && s.permanent.deepestChallenge === 4);
    assert(startChallenge(s, s.run.runId, 5) && s.run.firstClear); roundtrip(s);
  });
  test('Debug wallet: exact nonnegative input, scientific notation, separate ledger and production saves reject credits', () => {
    let s = createDebugProgression();
    assert(!setDebugLegacy(createProgression(), 128));
    for (const value of [-1, '.5', '', 'oops', 'Infinity', '1e-2']) assert(!setDebugLegacy(s, value));
    assert(setDebugLegacy(s, '1e6')); s = roundtrip(s);
    assert(s.permanent.legacy === 1000000 && s.permanent.totalLegacy === 0 && s.permanent.completedCycles === 0);
    assert(runDebugCommand(s, 'finale') && purchaseTalent(s, 'spark'));
    const spent = JSON.stringify(s.permanent.purchaseCosts), earned = s.permanent.totalLegacy;
    assert(setDebugLegacy(s, 0)); s = roundtrip(s);
    assert(s.permanent.legacy === 0 && s.permanent.totalLegacy === earned && JSON.stringify(s.permanent.purchaseCosts) === spent);
    assert(setDebugLegacy(s, '1e400') && Q.eq(roundtrip(s).permanent.legacy, Q.of('1e400')));
    assert(setDebugLegacy(s, 128)); const raw = JSON.parse(serializeSession(s));
    delete raw.debug; delete raw.debugSpeed; throws(() => parseSession(JSON.stringify(raw)));
    const broken = JSON.parse(serializeSession(s)); broken.permanent.debugLegacyAdjustment = '-999999';
    throws(() => parseSession(JSON.stringify(broken)));
  });
  test('Save v14: new talent payments cannot borrow cheaper historical upgrade prices', () => {
    const raw = JSON.parse(serializeSession(automationSeed()));
    raw.permanent.purchaseCosts.fireControl = ['1'];
    throws(() => parseSession(JSON.stringify(raw)));
  });
  test('Save v14: v13 victories/settings/purchases migrate without rewards or enabling new automation', () => {
    for (const phase of ['battle', 'victory', 'destruction', 'defeat']) {
      const s = challengeSeed(); if (phase !== 'destruction') rebuildCivilization(s, s.run.runId);
      if (phase === 'victory') finish(s, 1); if (phase === 'defeat') finish(s, 1, 'lost');
      configureAutomation(s, { enabled: true, target: 'heavy' });
      const old = JSON.parse(serializeSession(s)); old.version = 13;
      delete old.permanent.automation.ability; delete old.permanent.automation.campaign;
      for (const state of [old.permanent, old.run]) for (const key of ['fireControl', 'campaign', 'extermination']) delete state.talents[key];
      const restored = parseSession(JSON.stringify(old));
      assert(restored.version === SAVE_VERSION && restored.run.phase === phase && restored.run.runId === s.run.runId);
      assert(restored.permanent.legacy === s.permanent.legacy && restored.permanent.totalLegacy === s.permanent.totalLegacy);
      assert(restored.permanent.automation.enabled && restored.permanent.automation.target === 'heavy');
      assert(!restored.permanent.automation.ability && !restored.permanent.automation.campaign && !restored.permanent.talents.extermination);
      assert(!resolveBattle(restored) && serializeSession(roundtrip(restored)) === serializeSession(restored));
    }
  });
  test.browser('Automation expansion UI: new switches persist, victory resumes once and dialogs pause continuation', async () => {
    const seed = automationSeed({ active: true });
    seed.debug = true; seed.debugSpeed = 1;
    configureAutomation(seed, { enabled: true, campaign: true, ability: true }); finish(seed, 1);
    const frame = await mountFixture(serializeSession(seed), false, 'debug'), el = id => frame.contentDocument.getElementById(id);
    const saved = () => parseSession(frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY));
    try {
      el('autobuyer-menu').click(); assert(el('auto-ability').checked && el('auto-campaign').checked);
      frame.contentWindow.__testFrame(0); frame.contentWindow.__testFrame(1000);
      assert(saved().run.phase === 'victory' && saved().run.battleNumber === 1);
      el('close-automation').click(); frame.contentWindow.__testFrame(1100); frame.contentWindow.__testFrame(1200);
      assert(saved().run.phase === 'battle' && saved().run.battleNumber === 2 && el('result').hidden);
      // A debug victory while manually paused must remain resumable with Space.
      el('pause-battle').click(); frame.contentDocument.querySelector('[data-debug-command="victory"]').click();
      assert(!el('pause-battle').disabled && el('pause-battle').getAttribute('aria-pressed') === 'true');
      frame.contentWindow.__testFrame(1300); frame.contentWindow.__testFrame(1400); assert(saved().run.phase === 'victory');
      frame.contentDocument.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      frame.contentWindow.__testFrame(1500); frame.contentWindow.__testFrame(1600); assert(saved().run.battleNumber === 3);
      el('autobuyer-menu').click(); el('auto-ability').click();
      assert(!saved().permanent.automation.ability && saved().permanent.automation.campaign && el('save-warning').hidden);
    } finally { frame.remove(); }
  });
  test.browser('Debug wallet UI: keyboard form applies exact balance, rejects bad values and round-trips', async () => {
    let frame = await mountFixture(serializeSession(createDebugProgression()), false, 'debug');
    const el = id => frame.contentDocument.getElementById(id);
    const saved = () => parseSession(frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY));
    try {
      el('debug-balance').click(); assert(el('debug-legacy-dialog').open);
      el('debug-legacy-amount').value = '1e6'; el('debug-legacy-form').requestSubmit();
      assert(saved().permanent.legacy === 1000000 && saved().permanent.completedCycles === 0 && el('save-warning').hidden);
      el('debug-legacy-amount').value = '-2'; el('debug-legacy-form').requestSubmit();
      assert(saved().permanent.legacy === 1000000 && el('debug-legacy-status').textContent.includes('非负整数'));
      const snapshot = serializeSession(saved()); frame.remove(); frame = await mountFixture(snapshot, false, 'debug');
      el('debug-balance').click(); assert(el('debug-legacy-amount').value === '1000000');
      el('debug-legacy-amount').value = '0'; el('debug-legacy-form').requestSubmit(); assert(saved().permanent.legacy === 0);
      el('close-debug-legacy').click(); assert(!el('debug-legacy-dialog').open);
    } finally { frame.remove(); }
  });
  test.browser('Challenge picker UI: ten levels, replay preview, saved selection, failure retry and phone layout', async () => {
    const seed = challengeSeed(); seed.debug = true; seed.debugSpeed = 1;
    for (let i = 1; i <= 3; i++) { startChallenge(seed, seed.run.runId, i); finish(seed); }
    const frame = await mountFixture(serializeSession(seed), false, 'debug'), el = id => frame.contentDocument.getElementById(id);
    const saved = () => parseSession(frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY));
    try {
      el('archive-challenge').click(); assert(el('challenge-dialog').open);
      assert(el('challenge-levels').children.length === 10 && el('challenge-level-5').disabled && !el('challenge-level-4').disabled);
      el('challenge-level-2').click(); assert(el('challenge-level-2').getAttribute('aria-pressed') === 'true' && !el('challenge-reward').textContent.includes('首次抵达'));
      for (const width of [320, 390]) {
        frame.style.width = `${width}px`; frame.style.height = '844px'; await new Promise(resolve => setTimeout(resolve, 40));
        assert(el('challenge-dialog').scrollWidth <= el('challenge-dialog').clientWidth);
        assert(frame.contentDocument.documentElement.scrollWidth <= frame.clientWidth);
        const buttons = [...el('challenge-levels').children]; assert(buttons.every(button => button.getBoundingClientRect().height >= 44));
      }
      el('begin-challenge').click(); assert(saved().run.challengeLevel === 2 && !saved().run.firstClear);
      frame.contentDocument.querySelector('[data-debug-command="defeat"]').click();
      assert(el('play-again').textContent.includes('重试')); el('play-again').click();
      assert(saved().run.challengeLevel === 2 && saved().permanent.deepestChallenge === 3);
    } finally { frame.remove(); }
  });
  test.browser('Talent double-click: single click only inspects, double click buys one rank and preserves normal guards', async () => {
    const s = challengeSeed(); s.permanent.legacy += 100; s.permanent.totalLegacy += 100;
    const frame = await mountFixture(serializeSession(s)), el = id => frame.contentDocument.getElementById(id);
    const saved = () => parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
    const double = key => el(`node-${key}`).dispatchEvent(new frame.contentWindow.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    try {
      const before = saved().permanent.legacy;
      el('node-conservation').click(); assert(saved().permanent.legacy === before);
      double('conservation'); assert(saved().permanent.talents.conservation === 2 && saved().permanent.legacy === before - TALENTS.conservation.costs[1]);
      double('formation'); double('formation'); assert(saved().permanent.talents.formation === 1 && saved().permanent.purchaseCosts.formation.length === 1);
      const stable = serializeSession(saved()); double('extermination'); assert(serializeSession(saved()) === stable);
      assert(el('talent-feedback').textContent.includes('编队协议') && el('link-formation').dataset.state === 'owned' && el('save-warning').hidden);
    } finally { frame.remove(); }
  });
}
