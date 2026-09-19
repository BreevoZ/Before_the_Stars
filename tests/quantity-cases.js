import { Q, MAX_EXPONENT } from '../src/quantity.js';
import { stat, createBonusStack } from '../src/stats.js';
import { RULES, AGES, createGame, recruit, cancelTraining, buildTurret, sellTurret, evolve, castAbility, updateGame } from '../src/game.js';
import { createProgression, createCivilizationRun, resolveBattle, continueCivilization } from '../src/progression.js';
import { configureAutomation, getAutomationPlan, updateAutomation } from '../src/automation.js';
import { purchaseTalent } from '../src/talents.js';
import { serializeSession, parseSession, createSaveStore, SAVE_KEY, BACKUP_KEY } from '../src/save.js';
import { simulateRun } from '../sim/simulate.js';
import { resultsToCSV } from '../sim/grid.js';
import { record as v6 } from './fixtures/v6-battle.js';
import { challengeSeed } from './challenge-cases.js';
import { mountFixture } from './progression-cases.js';

const bonus = (stat, value = '1e400', target = {}, type = 'multiply') => ({ target: { stat, ...target }, type, value,
  source: { id: `quantity:${stat}`, kind: 'depth', label: '大数回归' } });
const growth = ['startingGold', 'cost', 'health', 'baseHealth', 'damage', 'income', 'armor', 'armorPierce', 'experience', 'bounty', 'healing'];
function session(effects = growth.map(key => bonus(key))) {
  const s = createProgression(); Object.assign(s, createCivilizationRun(s.permanent, 0, effects));
  s.game.ai.enabled = false; return s;
}
const advance = (g, seconds) => { for (let i = 0; i < Math.round(seconds / RULES.fixedStep); i++) updateGame(g, RULES.fixedStep); };
function ageTo(g, age, team = 'player') {
  g.experience[team] = AGES[age].experienceRequired;
  while (g.ages[team] < age) evolve(g, team);
}

export function registerQuantityTests(test, assert, near) {
  const rejects = fn => { let failed = false; try { fn(); } catch { failed = true; } assert(failed, 'Expected rejection'); };
  const equal = (a, b) => assert(Q.eq(a, b), `${String(a)} != ${String(b)}`);
  test('Quantity: arithmetic beyond Number range, tiny values, bounds, formatting and coercion guards', () => {
    equal(Q.add('1e400', '2e400'), '3e400'); equal(Q.sub('3e400', '1e400'), '2e400');
    equal(Q.mul('1e400', '1e400'), '1e800'); equal(Q.div('1e800', '1e400'), '1e400');
    equal(Q.pow(10, 400), '1e400'); equal(Q.mul('1e-400', '1e-400'), '1e-800');
    equal(Q.mul('1e400', 0), 0); assert(Q.gt('1e400', '9e399'));
    near(Q.ratio('1e400', '4e400'), 0.25); assert(Q.ratio(1, '1e400') === 0 && Q.ratio('1e400', 1) === 1);
    assert(Q.format('1e400') === '1e+400' && Q.format('1e-400') === '1e-400');
    for (const value of ['', 'Infinity', 'NaN', '0x10', '1e', {}, null, true, Infinity, NaN, `1e${MAX_EXPONENT + 1}`]) rejects(() => Q.of(value));
    rejects(() => Q.toNumber('1e400')); rejects(() => Q.of('1e400') * 2); rejects(() => Q.div(1, 0));
    rejects(() => Q.mul(`1e${MAX_EXPONENT}`, 10));
    for (const value of [0, 0.1, 1 / 3, 7.59375, 180.11666666666667, 999999999999.1]) {
      assert(Q.decode(Q.encode(value)) === value, 'Small decimal strings must preserve the exact original double');
    }
    rejects(() => Q.decode('01')); rejects(() => Q.decode(1));
  });

  test('Quantity: attributes have no prototype growth ceiling while bounded stats and classic remain native', () => {
    const g = session([bonus('damage'), bonus('health'), bonus('income'), bonus('queueLimit', 999, {}, 'add')]).game;
    equal(stat(g, { type: 'melee' }, 'damage'), '1.2e401'); equal(stat(g, { type: 'melee' }, 'health'), '7e401');
    equal(stat(g, 'player', 'income'), '7e400'); assert(stat(g, 'player', 'queueLimit') === 64);
    assert(typeof stat(g, { type: 'melee' }, 'speed') === 'number');
    assert(stat(createGame({ bonuses: g.bonuses }), { type: 'melee' }, 'damage') === 12);
    g.bonuses = createBonusStack(bonus('damage', '1e400'), bonus('damage', 0)); equal(stat(g, { type: 'melee' }, 'damage'), 0);
  });

  test('Quantity: large paid recruitment, cancellation, towers, sale refunds and affordability remain economic', () => {
    const s = session(), g = s.game, wallet = g.gold.player;
    assert(recruit(g)); equal(g.gold.player, Q.sub(wallet, '3e401'));
    assert(cancelTraining(g, g.queues.player[0].id)); equal(g.gold.player, wallet);
    assert(buildTurret(g)); equal(g.turrets.player[0].paid, '1.2e402');
    assert(sellTurret(g, 0)); equal(g.gold.player, Q.sub(wallet, '6e401'));
    g.gold.player = Q.of('2e401'); assert(!recruit(g)); equal(g.gold.player, '2e401');
    const raw = serializeSession(s); assert(serializeSession(parseSession(raw)) === raw);
  });

  test('Quantity: huge attacks subtract armor, award kill/death rewards and settle a base defeat', () => {
    const s = session([bonus('damage'), bonus('health'), bonus('armor', '3e400', { team: 'enemy' }, 'override'),
      bonus('bounty', '1e400', { kind: 'reward' }), bonus('experience', '1e400', { kind: 'reward' })]);
    const g = s.game; recruit(g); recruit(g, 'melee', 'enemy'); advance(g, 1.6);
    const [player, enemy] = ['player', 'enemy'].map(team => g.units.find(unit => unit.team === team));
    player.x = 600; enemy.x = 620; enemy.attackCooldown = 1000;
    updateGame(g, RULES.fixedStep); equal(enemy.hp, '6.1e401');
    enemy.hp = 0; updateGame(g, RULES.fixedStep);
    equal(g.experience.player, '2e401'); equal(g.experience.enemy, '1.5e401');
    assert(Q.gt(g.gold.player, '9e400'));
    player.x = g.bases.enemy.x - RULES.baseHalfWidth - 10; player.attackCooldown = 0;
    updateGame(g, RULES.fixedStep); assert(g.status === 'won' && Q.eq(g.bases.enemy.hp, 0));
  });

  test('Quantity: every era tower, ground payload and ability can fight through repeated large save/resume', () => {
    for (let age = 1; age <= 5; age++) for (const tower of AGES[age].turrets) {
      let s = session(); ageTo(s.game, age); ageTo(s.game, age, 'enemy');
      s.game.gold.player = s.game.gold.enemy = Q.of('1e406');
      assert(buildTurret(s.game, 'player', tower));
      assert(recruit(s.game, AGES[age].units[0], 'enemy'));
      s.game.queues.enemy[0].remaining = 0; updateGame(s.game, RULES.fixedStep);
      s.game.units[0].x = 230; s.game.units[0].attackCooldown = 1000;
      assert(castAbility(s.game, 240));
      for (let i = 0; i < 4; i++) {
        advance(s.game, 0.4); const raw = serializeSession(s); s = parseSession(raw);
        assert(serializeSession(s) === raw);
      }
    }
  });

  test('Quantity: reserves above 1e308 constrain Autobuyer and persist without numeric coercion', () => {
    const s = challengeSeed(false); assert(purchaseTalent(s, 'logistics'));
    Object.assign(s, createCivilizationRun(s.permanent, 0, [bonus('cost'), bonus('startingGold')]));
    assert(configureAutomation(s, { enabled: true, reserve: '1.6e402' }));
    assert(getAutomationPlan(s).action.state === 'budget'); updateAutomation(s, 0.25); assert(!s.game.queues.player.length);
    assert(configureAutomation(s, { reserve: '1.5e402' }));
    assert(getAutomationPlan(s).action.state === 'ready');
    for (let i = 0; i < 5; i++) updateAutomation(s, 0.05);
    assert(s.game.queues.player.length === 1); equal(s.game.gold.player, '1.5e402');
    const restored = parseSession(serializeSession(s)); equal(restored.permanent.automation.reserve, '1.5e402');
    assert(!configureAutomation(s, { reserve: 'Infinity' }) && !configureAutomation(s, { reserve: '-1e400' }));
  });

  test('Quantity: v7 validates strings by field; v6 capped HP migrates once and keeps an original backup', () => {
    const old = JSON.stringify(v6), entries = new Map([[SAVE_KEY, old]]);
    const store = createSaveStore(() => ({ getItem: k => entries.get(k) ?? null, setItem: (k, v) => entries.set(k, v) }));
    const loaded = store.load(); assert(loaded.ok && loaded.migrated); const s = loaded.session;
    equal(s.game.bases.player.maxHp, 6e10); equal(s.game.bases.player.hp, 6e10 - 25);
    const raw = serializeSession(s); assert(serializeSession(parseSession(raw)) === raw);
    assert(store.save(s).ok && entries.get(BACKUP_KEY) === old);
    const large = serializeSession(session());
    for (const mutate of [r => r.game.gold.player = 'Infinity', r => r.game.gold.player = '1e99999999999999999',
      r => r.game.gold.player = 180, r => r.game.bases.player.hp = '1e999', r => r.game.elapsed = '1e400',
      r => r.permanent.legacy = '1e400', r => r.run.extraBonuses[0].value = { mantissa: 1, exponent: 400 }]) {
      const record = JSON.parse(large); mutate(record); rejects(() => parseSession(JSON.stringify(record)));
    }
  });

  test('Quantity: conflict transfer retains huge assets/refunds once and Legacy remains exact native currency', () => {
    const s = session(); recruit(s.game); const wallet = Q.add(s.game.gold.player, s.game.queues.player[0].paid);
    s.game.bases.enemy.hp = 0; s.game.status = 'won'; resolveBattle(s);
    const id = s.run.battleId; assert(continueCivilization(s, id) && !continueCivilization(s, id)); equal(s.game.gold.player, wallet);
    ageTo(s.game, 5, 'enemy'); s.game.bases.enemy.hp = 0; s.game.status = 'won'; resolveBattle(s);
    assert(s.permanent.legacy === 1 && s.permanent.completedCycles === 1 && !resolveBattle(s));
    const raw = serializeSession(s); assert(serializeSession(parseSession(raw)) === raw);
  });

  test('Quantity: simulator JSON/CSV preserves huge metrics as text and deterministic finite timings', () => {
    const options = { completedCycles: 2, maxSeconds: 20, talents: { spark: 1 }, automation: { enabled: true }, bonuses: growth.map(key => bonus(key)) };
    const a = simulateRun(options), b = simulateRun(options);
    assert(JSON.stringify(a) === JSON.stringify(b) && typeof a.peakGold === 'string');
    assert(Q.gt(a.peakGold, '1e400') && Number.isFinite(a.duration));
    const csv = resultsToCSV([{ options, result: a }], ['bonuses']);
    assert(csv.includes(a.peakGold) && !csv.includes('Infinity') && !csv.includes('[object Object]'));
  });

  test.browser('Quantity UI: huge prices, income, HP bars, paid queue and refresh show finite readable values', async () => {
    const s = session(), frame = await mountFixture(serializeSession(s));
    const page = frame.contentDocument, el = id => page.getElementById(id);
    try {
      assert(el('gold').textContent.includes('e+402') && el('income-rate').textContent.includes('e+400'));
      assert(el('recruit').querySelector('[data-cost]').textContent === '3e+401');
      assert(el('player-health-bar').max === 1 && el('player-health-bar').value === 1);
      assert(el('player-health').textContent.includes('e+402'));
      el('recruit').click(); assert(el('queue-count').textContent === '1 / 5');
      assert(el('training-queue').children[0].getAttribute('aria-label').includes('3e+401'));
      el('training-queue').children[0].click(); assert(el('queue-count').textContent === '0 / 5');
      assert(!/NaN|Infinity|\[object Object\]/.test(page.body.textContent));
    } finally { frame.remove(); }
  });
}
