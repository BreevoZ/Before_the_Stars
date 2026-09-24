import { launchReady } from './orbital-cases.js';
import { Q } from '../src/quantity.js';
import { buildViewModel } from '../src/view-model.js';
import { buildCivilizationViewModel } from '../src/civilization-view-model.js';
import { buildAutomationViewModel } from '../src/automation-view-model.js';
import { TALENTS } from '../src/talents.js';
import { buildTalentViewModel } from '../src/talent-view-model.js';
import { createBindings } from '../src/dom-bindings.js';
import { PHASE, TRANSITIONS, getTransition, phaseMatchesResult } from '../src/progression-machine.js';
import { createProgression, createCivilizationRun, resolveBattle, transitionCivilization, rebuildCivilization } from '../src/progression.js';
import { purchaseTalent } from '../src/talents.js';
import { createGame, recruit, evolve, getIncomeRate, AGES } from '../src/game.js';
import { serializeSession, parseSession, createSaveStore, SAVE_KEY, BACKUP_KEY } from '../src/save.js';
import { MIGRATIONS } from '../src/save-migrations.js';
import { cloneRecord, fromSaveRecord, fromV8Record, fromV9Record, fromV10Record, fromV11Record, fromV12Record, fromV13Record, fromV14Record, fromV15Record, fromV16Record, fromV17Record, fromV18Record, fromV19Record, fromV20Record, fromV21Record, fromV22Record, fromV23Record, fromV24Record, fromV25Record, fromV26Record, fromV27Record, fromV28Record, fromV29Record } from '../src/save-record.js';
import { validateRecord } from '../src/save-validation.js';
import { SAVE_VERSION } from '../src/progression-config.js';
import { record as capturedV7 } from './fixtures/v7-save.js';
import { canonical, v5Record } from './legacy-fixtures.js';
import { mountFixture } from './progression-cases.js';

const json = value => JSON.stringify(canonical(value));
function finish(s, age = 5, status = 'won') {
  s.game.experience.enemy = AGES[age].experienceRequired;
  while (s.game.ages.enemy < age) evolve(s.game, 'enemy');
  s.game.status = status;
  if (['won', 'draw'].includes(status)) s.game.bases.enemy.hp = 0;
  if (['lost', 'draw'].includes(status)) s.game.bases.player.hp = 0;
  resolveBattle(s);
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export function registerArchitectureTests(test, assert) {
  const rejects = action => { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected, 'Invalid record must reject'); };
  test('View models: all four projections are deterministic, DOM-free and leave frozen simulation inputs unchanged', () => {
    const s = freeze(createProgression()), before = json(s);
    for (const build of [buildViewModel, buildCivilizationViewModel, buildAutomationViewModel, buildTalentViewModel]) {
      assert(json(build(s)) === json(build(s)));
    }
    assert(json(s) === before);
    const vm = buildViewModel(s, { selectedSlot: 99, manualPaused: true, targeting: true });
    assert(vm.selectedSlot === 0 && vm.targeting && vm.bindings['#phase'] === '已暂停');
    assert(vm.bindings['#gold'] === '180' && vm.bindings['#income-rate'] === '+7/s');
    assert(vm.bindings['#evolve@disabled'] && vm.bindings['#ability@disabled'] === false);
    assert(buildCivilizationViewModel(s)['#archives@hidden']);
  });
  test('View models: resolved large quantities, disabled items, queue shrink and classic independence agree with combat', () => {
    const s = createProgression();
    const bonus = (stat, type, value) => ({ target: { stat, team: 'player' }, type, value, source: { id: stat, kind: 'depth', label: '测试' } });
    Object.assign(s, createCivilizationRun(s.permanent, 0, [bonus('income', 'multiply', '1e400'), bonus('cost', 'multiply', 2), bonus('canCast', 'override', false), bonus('queueLimit', 'override', 2)]));
    const vm = buildViewModel(s, { queueSlots: 5 });
    assert(vm.bindings['#income-rate'] === `+${Q.format(getIncomeRate(s.game), null)}/s`);
    assert(vm.bindings['[data-unit-slot="0"] [data-cost]'] === '60');
    assert(vm.bindings['#ability@disabled'] && vm.bindings['#training-queue button:nth-child(5)@hidden']);
    assert(vm.queueCount === 2 && vm.bindings['#income-rate@title'].includes('测试'));
    assert(buildViewModel({ game: createGame() }).bindings['#income-rate'] === '+7/s');
  });
  test('View models: settlement, root purchase, rebuild and automation unlocks share authoritative progression', () => {
    const s = createProgression(); finish(s);
    let vm = buildCivilizationViewModel(s);
    assert(vm['#result-title'] === '文明未能幸存' && vm['#legacy-balance'] === '1' && !vm['#rebuild-civilization@hidden']);
    assert(buildTalentViewModel(s)['#node-spark@data-state'] === 'ready');
    assert(buildAutomationViewModel(s)['#automation-settings@hidden']);
    assert(purchaseTalent(s, 'spark'));
    assert(buildTalentViewModel(s)['#level-spark'] === '●' && buildTalentViewModel(s)['#node-spark@data-state'] === 'max');
    assert(buildTalentViewModel(s)['#link-formation@data-state'] === 'available');
    assert(buildAutomationViewModel(s)['#automation-settings@hidden']);
    rebuildCivilization(s, s.run.runId);
    vm = buildCivilizationViewModel(s);
    assert(!vm['#civilization-bar@hidden'] && vm['#rebuild-civilization@hidden']);
    assert(buildTalentViewModel(s)['#buy-production@disabled']);
  });
  test('Talent view: capped nodes never show an undefined price after rebuilding or during victory', () => {
    const s = createProgression(); finish(s); purchaseTalent(s, 'spark');
    s.permanent.upgrades.production = 5;
    for (const phase of ['destruction', 'battle', 'victory', 'defeat']) {
      s.run.phase = phase;
      const vm = buildTalentViewModel(s);
      for (const key of ['spark', 'production']) {
        assert(vm[`#buy-${key}`] === '已满级' && vm[`#cost-${key}`] === '');
        assert(vm[`#buy-${key}@disabled`] && !vm[`#node-${key}@aria-label`].includes('下一级'));
      }
      assert(!JSON.stringify(vm).includes('undefined'));
      assert(vm['#buy-bypasser'].includes(String(TALENTS.bypasser.costs[0])));
    }
  });
  test('State machine: every phase/event pair has an explicit transition and all stale tokens are rejected', () => {
    const expected = { battle: ['abandon'], victory: ['continue', 'abandon'], destruction: ['rebuild'], defeat: ['rebuild'], orbital: [] };
    for (const phase of Object.values(PHASE)) {
      const s = phase === PHASE.ORBITAL ? launchReady() : createProgression();
      if (phase === PHASE.ORBITAL) purchaseTalent(s, 'bypasser');
      else if (phase !== PHASE.BATTLE) finish(s, phase === PHASE.VICTORY ? 1 : 5, phase === PHASE.DEFEAT ? 'lost' : 'won');
      for (const event of ['resolve', 'continue', 'rebuild', 'challenge', 'abandon', 'launch', 'unknown']) {
        const token = ['resolve', 'continue'].includes(event) ? s.run.battleId : s.run.runId;
        assert(Boolean(getTransition(s, event, token)) === expected[phase].includes(event), `${phase}/${event}`);
        const before = serializeSession(s);
        assert(!transitionCivilization(s, event, 'stale'));
        assert(serializeSession(s) === before);
      }
    }
    assert(Object.isFrozen(TRANSITIONS) && TRANSITIONS.every(Object.isFrozen));
    assert(phaseMatchesResult('defeat', 'draw') && !phaseMatchesResult('battle', 'won') && !phaseMatchesResult('unknown', 'won'));
  });
  test('State machine: resolution chooses enemy terminal age, settles synchronously once and invalidates old rebuild tokens', () => {
    const s = createProgression();
    s.game.experience.player = AGES[5].experienceRequired;
    while (s.game.ages.player < 5) evolve(s.game);
    assert(!transitionCivilization(s, 'resolve', s.run.battleId));
    s.game.status = 'won'; s.game.bases.enemy.hp = 0;
    assert(transitionCivilization(s, 'resolve', s.run.battleId));
    assert(s.run.phase === 'victory' && s.permanent.totalLegacy === 0);
    const battle = s.run.battleId;
    assert(transitionCivilization(s, 'continue', battle));
    assert(!transitionCivilization(s, 'continue', battle));
    finish(s);
    const run = s.run.runId;
    assert(s.permanent.totalLegacy === 1 && !resolveBattle(s));
    assert(transitionCivilization(s, 'rebuild', run) && !transitionCivilization(s, 'rebuild', run));
    assert(s.permanent.totalLegacy === 1);
  });
  test('Save schema: each V1–V7 migration is deterministic and does not mutate or share mutable source data', () => {
    let old = v5Record(createProgression()); old.version = 1;
    delete old.permanent.totalLegacy; delete old.permanent.talents; delete old.permanent.talentGrants;
    old.permanent.automation = { unlocked: false, enabled: false, target: 'front' };
    delete old.run.talents; delete old.run.challengeLevel; delete old.run.autoTurn;
    delete old.game.modifiers.bounty; delete old.game.enemyModifiers;
    for (let version = 1; version < SAVE_VERSION; version++) {
      const hydrate = { 8: fromV8Record, 9: fromV9Record, 10: fromV10Record, 11: fromV11Record, 12: fromV12Record, 13: fromV13Record, 14: fromV14Record, 15: fromV15Record, 16: fromV16Record, 17: fromV17Record, 18: fromV18Record, 19: fromV19Record, 20: fromV20Record, 21: fromV21Record, 22: fromV22Record, 23: fromV23Record, 24: fromV24Record, 25: fromV25Record, 26: fromV26Record, 27: fromV27Record, 28: fromV28Record, 29: fromV29Record }[version];
      validateRecord(hydrate ? hydrate(old) : old, version);
      const source = freeze(old), before = json(source), next = MIGRATIONS[version](source);
      assert(next.version === version + 1 && next !== source && next.game !== source.game);
      assert(json(MIGRATIONS[version](source)) === json(next));
      assert(json(source) === before);
      old = next;
    }
    assert(fromSaveRecord(old).permanent.completedCycles === 0);
  });
  test('Save v8: captured V7 migrates with an original backup and derived values are absent from the wire format', () => {
    const raw = JSON.stringify(capturedV7), s = parseSession(raw), next = JSON.parse(serializeSession(s));
    assert(next.version === SAVE_VERSION && next.game.gold.player === capturedV7.game.gold.player);
    assert(!('legacy' in next.permanent) && !('unlocked' in next.permanent.automation));
    assert(!('bonuses' in next.game) && !('mode' in next.game) && !('maxHp' in next.game.bases.player));
    assert(!('battleId' in next.run) && 'processedBattleId' in next.run && 'settled' in next.run);
    const entries = new Map([[SAVE_KEY, raw]]);
    const store = createSaveStore(() => ({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }));
    const loaded = store.load(); assert(loaded.migrated && store.save(loaded.session).ok && entries.get(BACKUP_KEY) === raw);
    assert(serializeSession(parseSession(serializeSession(s))) === serializeSession(s));
  });
  test('Save v8: pending orders, settled purchases and rebuilt attributes round-trip without refunds or repeat rewards', () => {
    let s = createProgression(); recruit(s.game, 'melee'); const paid = s.game.queues.player[0].paid;
    s = parseSession(serializeSession(s)); assert(s.game.queues.player[0].paid === paid && s.game.gold.player === 150);
    finish(s); purchaseTalent(s, 'spark');
    s = parseSession(serializeSession(s)); assert(s.permanent.legacy === 0 && !resolveBattle(s));
    const id = s.run.runId; assert(rebuildCivilization(s, id));
    const income = getIncomeRate(s.game), gold = s.game.gold.player;
    s = parseSession(serializeSession(s));
    assert(Q.eq(getIncomeRate(s.game), income) && Q.eq(s.game.gold.player, gold));
    assert(s.permanent.completedCycles === 1 && !s.permanent.automation.unlocked && !s.permanent.automation.enabled);
  });
  test('Save v8: schema rejects wrong types, missing inputs, redundant attributes and invalid purchase budgets', () => {
    const raw = serializeSession(createProgression());
    for (const mutate of [r => r.run.phase = 'orbital', r => r.game.ai.orders = '3', r => r.game.bases.player.maxHp = '600',
      r => r.permanent.legacy = 100, r => r.game.bonuses = [], r => r.permanent.automation.unlocked = true,
      r => delete r.run.upgrades, r => r.permanent.totalLegacy = -1, r => r.permanent.talents.spark = 1]) {
      const r = JSON.parse(raw); mutate(r); rejects(() => parseSession(JSON.stringify(r)));
    }
    const old = cloneRecord(capturedV7); old.game.bonuses[0].value = '999';
    rejects(() => parseSession(JSON.stringify(old)));
  });
  test.browser('DOM bindings: unchanged models perform no writes; groups, attributes and rejected input restoration share one diff', () => {
    const root = document.createElement('section');
    root.innerHTML = '<span id="value"></span><input id="input"><button class="group"></button><button class="group"></button>';
    const bind = createBindings(root, { '#value': vm => vm.text, '#input@value': vm => vm.input,
      '.group@disabled': vm => vm.disabled, '#value@aria-label': vm => vm.label, '#value@class:ready': vm => vm.ready });
    const vm = { text: '金币', input: '2', disabled: true, label: '说明', ready: true };
    assert(bind(vm) === 5 && bind({ ...vm }) === 0);
    assert([...root.querySelectorAll('button')].every(button => button.disabled));
    const input = root.querySelector('input'); input.value = 'unfinished'; assert(bind(vm) === 0 && input.value === 'unfinished');
    bind.invalidate(); assert(bind(vm) === 5 && input.value === '2');
    assert(bind({ ...vm, label: null }) === 1 && !root.querySelector('span').hasAttribute('aria-label'));
    assert(root.querySelector('span').classList.contains('ready'));
  });
  test.browser('UI binding regression: unchanged paused frames preserve portraits, typed input, focus and event counts', async () => {
    const s = createProgression(); finish(s); purchaseTalent(s, 'spark');
    // Enough earned balance for the logistics prerequisite while keeping ledger valid.
    s.permanent.completedCycles = 3; s.permanent.automation.unlocked = true; s.permanent.totalLegacy = 3; s.permanent.legacy = 2;
    purchaseTalent(s, 'logistics'); rebuildCivilization(s, s.run.runId);
    const frame = await mountFixture(serializeSession(s));
    try {
      const page = frame.contentDocument, win = frame.contentWindow, el = id => page.getElementById(id);
      const portrait = el('recruit').querySelector('canvas'); el('autobuyer-menu').click();
      const input = el('auto-reserve'); input.focus(); input.value = 'editing';
      for (let i = 0; i < 20; i++) win.__testFrame(i * 16);
      assert(input.value === 'editing' && page.activeElement === input && el('recruit').querySelector('canvas') === portrait);
      input.dispatchEvent(new win.Event('change', { bubbles: true }));
      assert(input.value === '0' && el('automation-error').textContent.includes('未保存'));
      input.value = '120'; input.dispatchEvent(new win.Event('change', { bubbles: true }));
      assert(input.value === '120' && el('automation-error').textContent.includes('已保存'));
      el('close-automation').click(); el('recruit').click();
      assert(el('queue-count').textContent === '1 / 5', 'One click must enqueue exactly once after repeated synchronization');
    } finally { frame.remove(); }
  });
}
