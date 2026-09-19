import { stat } from '../src/stats.js';
import { statMultiplier, v5Record } from './legacy-fixtures.js';
import { AGES, UNITS, RULES, createGame, recruit, evolve, updateGame, getIncomeRate, getExperienceReward, getUnitHealth, getBaseHealth, buildTurret } from '../src/game.js';
import { createProgression, resolveBattle, continueCivilization, rebuildCivilization, abandonCivilization, startChallenge, getNextChallengeLevel, purchaseUpgrade, updateProgression } from '../src/progression.js';
import { CHALLENGE, SAVE_VERSION, SURFACE, getChallengeModifiers } from '../src/progression-config.js';
import { TALENTS, purchaseTalent, getLegacyReward } from '../src/talents.js';
import { parseSession, serializeSession, createSaveStore, SAVE_KEY, BACKUP_KEY, DEBUG_SAVE_KEY } from '../src/save.js';
import { configureAutomation } from '../src/automation.js';
import { mountFixture } from './progression-cases.js';

function ageTo(game, age, team = 'enemy') {
  game.experience[team] = AGES[age].experienceRequired;
  while (game.ages[team] < age) evolve(game, team);
}
function finish(s, age = 5, status = 'won') {
  ageTo(s.game, age);
  s.game.status = status;
  s.game.bases.enemy.hp = ['won', 'draw'].includes(status) ? 0 : s.game.bases.enemy.maxHp;
  s.game.bases.player.hp = ['lost', 'draw'].includes(status) ? 0 : s.game.bases.player.maxHp;
  resolveBattle(s);
}
export function challengeSeed(unlock = true) {
  const s = createProgression();
  for (let i = 0; i < 8; i++) { if (i) rebuildCivilization(s, s.run.runId); finish(s); }
  purchaseTalent(s, 'spark'); purchaseTalent(s, 'conservation');
  if (unlock) purchaseTalent(s, 'challenge');
  return s;
}
function spawn(game, type, team) {
  if (!recruit(game, type, team)) throw Error('Recruitment failed');
  game.queues[team][0].remaining = 0;
  updateGame(game, RULES.fixedStep);
  return game.units.filter(unit => unit.team === team).at(-1);
}
function roundtrip(s) { return parseSession(serializeSession(s)); }

export function registerChallengeTests(test, assert, near) {
  test('Challenge: legacy subtree costs 2, requires conservation, unlocks next run after settlement without retroactive rewards', () => {
    const s = createProgression(); finish(s);
    assert(!purchaseTalent(s, 'challenge') && !startChallenge(s, s.run.runId));
    const seed = challengeSeed(false), legacy = seed.permanent.legacy, reward = seed.run.earnedLegacy;
    assert(TALENTS.challenge.requires.conservation === 1 && purchaseTalent(seed, 'challenge'));
    assert(seed.permanent.legacy === legacy - 2 && seed.run.earnedLegacy === reward && !seed.run.talents.challenge);
    assert(!purchaseTalent(seed, 'challenge') && getNextChallengeLevel(seed) === 1);
    const runId = seed.run.runId;
    assert(startChallenge(seed, runId) && !startChallenge(seed, runId));
    assert(seed.run.runId !== runId && seed.run.challengeLevel === 1 && seed.run.talents.challenge === 1);
    assert(seed.game.ages.player === 1 && seed.game.ages.enemy === 1 && seed.permanent.completedCycles === 8);
    assert(seed.game.gold.enemy === Math.floor(RULES.startingGold * 1.35));
    assert(seed.game.gold.player === RULES.startingGold && !seed.game.units.length && !seed.run.settled);
    roundtrip(seed);
  });
  test('Challenge: ordinary victories preserve difficulty/assets, refund once and cannot escalate or award Legacy', () => {
    const s = challengeSeed(); startChallenge(s, s.run.runId); s.game.ai.enabled = false;
    recruit(s.game, 'heavy'); const gold = s.game.gold.player, legacy = s.permanent.legacy, id = s.run.runId;
    finish(s, 1); assert(getNextChallengeLevel(s) === null && !startChallenge(s, id));
    const battle = s.run.battleId;
    assert(continueCivilization(s, battle) && !continueCivilization(s, battle));
    near(s.game.gold.player, gold + UNITS.heavy.cost);
    assert(s.run.runId === id && s.run.challengeLevel === 1 && s.game.ages.enemy === 2 && !s.game.queues.player.length);
    assert(s.game.gold.enemy === Math.floor(SURFACE.enemyStartingGold[2] * 1.35));
    assert(s.game.bases.enemy.maxHp === Math.round(AGES[2].baseHealth * 1.2));
    assert(s.permanent.legacy === legacy && !s.run.settled); roundtrip(s);
  });
  test('Challenge: rewards scale by completed difficulty, settle once and cap at challenge 10', () => {
    const s = challengeSeed();
    for (let level = 1; level <= CHALLENGE.maxLevel; level++) {
      const id = s.run.runId, cycles = s.permanent.completedCycles, legacy = s.permanent.legacy;
      assert(startChallenge(s, id)); ageTo(s.game, 5, 'player');
      assert(!resolveBattle(s) && s.run.phase === 'battle');
      finish(s); assert(s.run.challengeLevel === level && s.run.earnedLegacy === 2 * (level + 1));
      assert(s.permanent.completedCycles === cycles + 1 && s.permanent.legacy === legacy + s.run.earnedLegacy);
      assert(!resolveBattle(s) && !startChallenge(s, id)); roundtrip(s);
    }
    assert(getNextChallengeLevel(s) === null && !startChallenge(s, s.run.runId));
    assert(rebuildCivilization(s, s.run.runId) && s.run.challengeLevel === 0);
    assert(statMultiplier(s.game, 'damage', 'enemy') === 1 && s.game.bases.enemy.maxHp === AGES[1].baseHealth);
  });
  test('Challenge: loss/draw/abandon pay nothing, retry preserves level and normal rebuild clears it', () => {
    for (const status of ['lost', 'draw']) {
      const s = challengeSeed(); startChallenge(s, s.run.runId);
      const legacy = s.permanent.legacy, cycles = s.permanent.completedCycles;
      const abandoned = s.run.runId;
      assert(abandonCivilization(s, abandoned) && !abandonCivilization(s, abandoned));
      assert(s.run.challengeLevel === 1); finish(s, 1, status);
      assert(s.run.earnedLegacy === 0 && s.permanent.legacy === legacy && s.permanent.completedCycles === cycles);
      assert(getNextChallengeLevel(s) === 1 && startChallenge(s, s.run.runId));
      assert(s.run.challengeLevel === 1); finish(s, 1, status);
      assert(rebuildCivilization(s, s.run.runId) && s.run.challengeLevel === 0);
      assert(s.permanent.legacy === legacy); roundtrip(s);
    }
  });
  test('Challenge: player/archive/classic attributes stay isolated; trained enemies receive health, damage, income and XP boosts', () => {
    const s = challengeSeed(); purchaseUpgrade(s, 'production'); purchaseUpgrade(s, 'warfare'); startChallenge(s, s.run.runId);
    const g = s.game; g.ai.enabled = false;
    const enemy = spawn(g, 'melee', 'enemy'), player = spawn(g, 'melee', 'player');
    assert(enemy.hp === Math.round(70 * 1.25) && player.hp === 70 && UNITS.melee.health === 70);
    near(getIncomeRate(g), 7 * 1.5); near(getIncomeRate(g, 'enemy'), 7 * 1.35);
    assert(getExperienceReward(g, 28, 'enemy') === Math.floor(28 * 1.2));
    assert(getExperienceReward(g, 28) === Math.floor(28 * 1.25));
    player.x = 500; enemy.x = 528; player.attackCooldown = enemy.attackCooldown = 0;
    updateGame(g, RULES.fixedStep); near(player.hp, 70 - 12 * 1.25); near(enemy.hp, Math.round(70 * 1.25) - 12);
    const before = g.experience.enemy; enemy.hp = 0; updateGame(g, RULES.fixedStep);
    assert(g.experience.enemy - before === Math.floor(Math.floor(20 * RULES.casualtyExperienceRate) * 1.2));
    const classic = createGame({ enemyModifiers: getChallengeModifiers(10), modifiers: { income: 99 } });
    assert(JSON.stringify(classic) === JSON.stringify(createGame()));
    assert(getUnitHealth(classic, 'melee', 'enemy') === 70 && getBaseHealth(classic, 'enemy') === 600);
    roundtrip(s);
  });
  test('Challenge: projectile and field damage apply the enemy modifier once before armor', () => {
    const s = challengeSeed(); startChallenge(s, s.run.runId); const g = s.game; g.ai.enabled = false;
    ageTo(g, 4, 'player'); ageTo(g, 5);
    g.gold.player = g.gold.enemy = 1000; const target = spawn(g, 'tank', 'player'); target.x = 500; target.attackCooldown = 10;
    g.fields.push({ kind: 'fire', team: 'enemy', x: 500, radius: 50, remaining: 2, duration: 2, tickCooldown: 0, tickInterval: 0.4, damage: stat(g, { type: 'fireCatapult', team: 'enemy' }, 'tickDamage'), slow: 1 });
    const before = target.hp; updateGame(g, RULES.fixedStep); near(target.hp, before - 6 * 1.25);
    g.fields = [];
    const enemy = spawn(g, 'blaster', 'enemy'); enemy.x = 650; enemy.attackCooldown = 0;
    updateGame(g, RULES.fixedStep); assert(g.projectiles.some(shot => shot.team === 'enemy'));
    enemy.attackCooldown = 100;
    const reloaded = roundtrip(s), hp = reloaded.game.units.find(u => u.id === target.id).hp;
    for (let i = 0; i < 30; i++) { updateGame(g, RULES.fixedStep); updateGame(reloaded.game, RULES.fixedStep); }
    near(target.hp, hp - (85 * 1.25 - (14 - 8)));
    near(reloaded.game.units.find(u => u.id === target.id).hp, target.hp);
  });
  test('Challenge: enemy rail turret scales primary and penetrating hits exactly once', () => {
    const s = challengeSeed(); startChallenge(s, s.run.runId); const g = s.game; g.ai.enabled = false;
    ageTo(g, 4, 'player'); ageTo(g, 5); g.gold.player = g.gold.enemy = 5000;
    const front = spawn(g, 'tank', 'player'); front.x = 950; front.attackCooldown = 100;
    const rear = spawn(g, 'tank', 'player'); rear.x = 890; rear.attackCooldown = 100;
    assert(buildTurret(g, 'enemy', 'titanium', 0));
    for (let i = 0; i < 30; i++) {
      updateGame(g, RULES.fixedStep);
      if (g.projectiles.length) g.turrets.enemy[0].cooldown = 100;
    }
    near(front.hp, 720 - (100 * 1.25 - 4));
    near(rear.hp, 720 - (100 * .6 * 1.25 - 4));
    roundtrip(s);
  });
  test('Challenge: reward multiplies before one final floor, never rounding talent earnings early', () => {
    const talents = { ...challengeSeed().permanent.talents, conservation: 2, continuity: 1 };
    assert(getLegacyReward(talents) === 4 && getLegacyReward(talents, 2) === 13);
  });
  test('Challenge: an actual paid future army defeats enhanced AI and settles the larger reward', () => {
    const s = challengeSeed(); s.permanent.talents.superSoldierPlan = 1; s.permanent.talentGrants.push('superSoldierPlan'); startChallenge(s, s.run.runId);
    ageTo(s.game, 5, 'player'); ageTo(s.game, 5);
    s.game.gold.player = 12000; s.game.gold.enemy = Math.floor(SURFACE.enemyStartingGold[5] * 1.35);
    for (let i = 0; i < 4; i++) assert(recruit(s.game, 'superSoldier'));
    let sawEnemy = false, sawSoldier = false;
    for (let i = 0; i < 60 * 300 && s.run.phase === 'battle'; i++) {
      updateProgression(s, RULES.fixedStep);
      sawEnemy ||= s.game.units.some(u => u.team === 'enemy');
      sawSoldier ||= s.game.units.some(u => u.type === 'superSoldier');
    }
    assert(sawEnemy && sawSoldier && s.game.status === 'won' && s.run.phase === 'destruction');
    assert(s.run.earnedLegacy === 4 && s.permanent.completedCycles === 9);
    roundtrip(s);
  });
  test('Challenge: enemy evolution preserves damage taken and automation/pause follow normal simulation time', () => {
    const s = challengeSeed(); configureAutomation(s, { enabled: true }); startChallenge(s, s.run.runId);
    const g = s.game; g.ai.enabled = false; g.bases.enemy.hp -= 21;
    ageTo(g, 3); assert(g.bases.enemy.hp === getBaseHealth(g, 'enemy') - 21);
    const raw = serializeSession(s);
    for (let i = 0; i < 10; i++) updateProgression(s, .05, { paused: true });
    assert(serializeSession(s) === raw);
    for (let i = 0; i < 5; i++) updateProgression(s, .05);
    assert(g.queues.player.length === 1 && g.gold.player < RULES.startingGold);
    roundtrip(s);
  });
  test('Challenge: saved battle/victory/destruction/rebuild restore without duplicate settlement or multiplied stats', () => {
    let s = challengeSeed(); startChallenge(s, s.run.runId); s = roundtrip(s);
    finish(s, 1); s = roundtrip(s); continueCivilization(s, s.run.battleId); finish(s);
    const reward = s.run.earnedLegacy, total = s.permanent.totalLegacy;
    purchaseTalent(s, 'conservation');
    s = roundtrip(s); assert(!resolveBattle(s) && s.run.earnedLegacy === reward && s.permanent.totalLegacy === total);
    assert(startChallenge(s, s.run.runId)); const raw = serializeSession(s);
    assert(serializeSession(roundtrip(s)) === raw && s.run.challengeLevel === 2);
    assert(statMultiplier(s.game, 'health', 'enemy') === 1.25 ** 2 && getLegacyReward(s.run.talents, 2) === 9);
  });
  test('Save v5: all v4 phases migrate to normal challenge with no resource, reward, or upgrade changes; backup preserved', () => {
    for (const phase of ['battle', 'victory', 'destruction', 'defeat']) {
      const s = challengeSeed(false); if (phase !== 'destruction') rebuildCivilization(s, s.run.runId);
      if (phase === 'victory') finish(s, 1);
      if (phase === 'defeat') finish(s, 1, 'lost');
      const old = v5Record(s); old.version = 4;
      delete old.run.challengeLevel; delete old.run.talents.challenge; delete old.permanent.talents.challenge; delete old.game.enemyModifiers;
      const raw = JSON.stringify(old), entries = new Map([[SAVE_KEY, raw]]);
      const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
      const store = createSaveStore(() => storage), loaded = store.load(), migrated = loaded.session;
      assert(loaded.ok && loaded.migrated && migrated.version === SAVE_VERSION && migrated.run.challengeLevel === 0);
      assert(migrated.run.runId === old.run.runId && migrated.run.phase === phase && migrated.run.earnedLegacy === old.run.earnedLegacy);
      assert(migrated.permanent.legacy === old.permanent.legacy + (old.permanent.talents.autobuyer && !old.permanent.talentGrants.includes('autobuyer') ? 1 : 0) && migrated.game.gold.player === old.game.gold.player);
      assert(store.save(migrated).ok && entries.get(BACKUP_KEY) === raw);
    }
  });
  test('Challenge saves reject invalid difficulty, missing fields, inconsistent unlocks, enemy modifiers and health', () => {
    const s = challengeSeed(); startChallenge(s, s.run.runId);
    for (const mutate of [s => delete s.run.challengeLevel, s => s.run.challengeLevel = -1, s => s.run.challengeLevel = .5,
      s => s.run.challengeLevel = 11, s => s.run.talents.challenge = 0, s => s.game.bonuses = [],
      s => delete s.run.talents, s => s.game.bases.enemy.maxHp = "10", s => s.permanent.totalLegacy = -1,
      s => s.run.earnedLegacy = 4]) {
      const record = JSON.parse(serializeSession(s)); mutate(record);
      let rejected = false; try { parseSession(JSON.stringify(record)); } catch { rejected = true; }
      assert(rejected, 'Invalid challenge save must be rejected');
    }
  });
  test.browser('Challenge browser: purchase → preview → start → refresh → win → stronger civilization → defeat/retry → normal rebuild', async () => {
    const seed = challengeSeed(false); seed.debug = true; seed.debugSpeed = 1;
    let frame = await mountFixture(serializeSession(seed), false, 'debug');
    const el = id => frame.contentDocument.getElementById(id);
    const saved = () => parseSession(frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY));
    try {
      assert(el('result-challenge').hidden); el('archives').click(); el('node-challenge').click(); el('buy-challenge').click();
      assert(!el('archive-challenge').hidden && el('legacy-balance').textContent === '3');
      el('archive-challenge').click(); assert(el('challenge-dialog').open && !el('archives-dialog').open);
      assert(el('challenge-reward').textContent === '+4 Legacy' && el('challenge-power').textContent === '×1.25 / ×1.25');
      const previous = saved();
      frame.contentWindow.__testFrame(0); frame.contentWindow.__testFrame(60000);
      frame.contentDocument.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      assert(saved().run.runId === previous.run.runId && !el('pause-battle').getAttribute('aria-pressed').includes('true'));
      el('begin-challenge').click(); el('begin-challenge').click();
      let next = saved(); assert(next.run.challengeLevel === 1 && next.permanent.legacy === 3 && !el('challenge-dialog').open);
      frame.remove(); frame = await mountFixture(serializeSession(next), false, 'debug');
      assert(el('challenge-status').textContent.includes('纷争余烬') && el('challenge-status').textContent.includes('+4'));
      frame.contentDocument.querySelector('[data-debug-command="finale"]').click();
      next = saved(); assert(next.run.earnedLegacy === 4 && next.permanent.legacy === 7);
      frame.remove(); frame = await mountFixture(serializeSession(next), false, 'debug');
      assert(saved().permanent.legacy === 7); el('result-challenge').click();
      assert(el('challenge-reward').textContent === '+6 Legacy'); el('begin-challenge').click();
      assert(saved().run.challengeLevel === 2);
      frame.contentDocument.querySelector('[data-debug-command="defeat"]').click();
      assert(el('result-challenge').textContent.includes('重返铁旗时代') && saved().permanent.legacy === 7);
      el('result-challenge').click(); el('begin-challenge').click(); assert(saved().run.challengeLevel === 2);
      frame.contentDocument.querySelector('[data-debug-command="defeat"]').click(); el('play-again').click(); el('play-again').click();
      next = saved(); assert(next.run.challengeLevel === 0 && next.permanent.legacy === 7 && statMultiplier(next.game, 'health', 'enemy') === 1);
      assert(el('challenge-status').hidden && el('save-warning').hidden);
    } finally { frame.remove(); }
  });
  test.browser('Challenge browser: 320px result, legacy subtree and preview fit; modal keyboard cancel leaves settled save intact', async () => {
    const s = challengeSeed(); startChallenge(s, s.run.runId); finish(s);
    const frame = await mountFixture(serializeSession(s)), page = frame.contentDocument, el = id => page.getElementById(id);
    try {
      frame.style.width = '320px'; frame.style.height = '780px';
      const fits = () => assert(page.documentElement.scrollWidth <= frame.clientWidth, 'Horizontal overflow');
      fits(); const bounds = el('result').getBoundingClientRect(), button = el('result-challenge').getBoundingClientRect();
      assert(button.bottom <= bounds.bottom && button.top >= bounds.top, 'Challenge button must fit battlefield');
      el('archives').click(); const node = el('node-challenge');
      assert(node.closest('[data-parent="conservation"]') || node.closest('.talent-branch'), 'Challenge must live in the legacy subtree');
      fits(); el('archive-challenge').click(); fits();
      assert(el('challenge-dialog').scrollWidth <= el('challenge-dialog').clientWidth);
      el('challenge-dialog').dispatchEvent(new frame.contentWindow.Event('cancel', { cancelable: true }));
      el('close-challenge').click(); assert(!el('challenge-dialog').open);
      assert(parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY)).run.runId === s.run.runId);
    } finally { frame.remove(); }
  });
}
