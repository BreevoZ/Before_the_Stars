import { Q } from '../src/quantity.js';
import { TALENT_TREE, TALENTS, emptyTalents, purchaseTalent, getLegacyReward } from '../src/talents.js';
import { rebuildCivilization } from '../src/progression.js';
import { SAVE_VERSION, LEGACY_ECONOMY as ECONOMY, CHALLENGE } from '../src/progression-config.js';
import { records, wallet } from './fixtures/v10-save.js';
import { parseSession, serializeSession } from '../src/save.js';
import { buildTalentViewModel } from '../src/talent-view-model.js';

// v12 refunds the retired branch through the ledger itself: the captured save
// owns one rank of the old 文明传承, bought for 6 Legacy.
const v12Wallet = wallet + 6;

export function registerEconomyPacingTests(test, assert) {
  test('Economy pacing: prices outgrow their effect, so every extra rank of a reward talent takes longer to repay', () => {
    const ranks = TALENTS.conservation.costs;
    let previousPayback = 0;
    for (const [rank, cost] of ranks.entries()) {
      const owned = { ...emptyTalents(), conservation: rank }, next = { ...emptyTalents(), conservation: rank + 1 };
      const gain = getLegacyReward(next, ECONOMY.bypasserChallenge) - getLegacyReward(owned, ECONOMY.bypasserChallenge);
      const payback = cost / gain;
      assert(gain > 0 && payback > previousPayback, `Rank ${rank + 1} must repay more slowly than the one before`);
      previousPayback = payback;
      if (rank) assert(cost === ranks[rank - 1] * 4, 'Reward ranks cost four times the previous rank');
    }
    // Depth, not purchases, is the exponential term of the surface economy.
    assert(getLegacyReward(emptyTalents(), 0) === 1 && getLegacyReward(emptyTalents(), 3) === ECONOMY.challengeBase ** 3);
    assert(getLegacyReward(emptyTalents(), CHALLENGE.maxLevel) === ECONOMY.challengeBase ** CHALLENGE.maxLevel);
    // Buying every rank is still worth less than the embers it cannot reach.
    const maxedMultipliers = getLegacyReward({ ...emptyTalents(), conservation: ranks.length }, 0);
    assert(maxedMultipliers === ECONOMY.conservationEffect ** ranks.length);
    assert(getLegacyReward(emptyTalents(), ECONOMY.bypasserChallenge) > maxedMultipliers);
    // The opening is fixed: clear once for speed, again to double, then expedition.
    assert(TALENTS.spark.costs[0] === 1 && TALENTS.conservation.costs[0] === 1 && TALENTS.challenge.costs[0] === 2);
  });
  test('Economy pacing: the finale price is an expedition milestone, not an amount the multipliers alone can reach', () => {
    const deepest = getLegacyReward({ ...emptyTalents(), conservation: TALENTS.conservation.costs.length }, ECONOMY.bypasserChallenge);
    assert(TALENTS.bypasser.costs[0] === ECONOMY.bypasserCost && ECONOMY.bypasserChallenge <= CHALLENGE.maxLevel);
    // Several deepest runs: reachable by playing, never by one lucky run.
    assert(TALENTS.bypasser.costs[0] > deepest * 4 && TALENTS.bypasser.costs[0] < deepest * 40);
    const combat = Object.entries(TALENT_TREE).filter(([key, config]) => config.branch === 'units' || key === 'production' || key === 'warfare')
      .flatMap(([, config]) => config.costs).reduce((sum, cost) => sum + cost, 0);
    // The whole combat spine costs about as much as the finale: the campaign is
    // spent buying power, not hoarding for one purchase.
    assert(combat > deepest && combat < TALENTS.bypasser.costs[0] * 1.5, 'Unit talents must stay in scale with the finale');
    // The deepest ember alone cannot buy the protocol; several runs must.
    assert(deepest < TALENTS.bypasser.costs[0]);
  });
  test('V12: the retired reward branches are refunded through the ledger, and captured v10 saves keep their battles', () => {
    for (const [phase, record] of Object.entries(records)) {
      let s = parseSession(JSON.stringify(record));
      assert(s.version === SAVE_VERSION && s.run.phase === phase);
      assert(s.permanent.legacy === v12Wallet, 'Retired ranks refund exactly what was paid for them');
      assert(s.permanent.talents.conservation === 2 && s.permanent.talents.continuity === undefined);
      assert(s.permanent.purchaseCosts.superSoldierPlan[0] === 15 && s.permanent.purchaseCosts.continuity === undefined);
      assert(s.permanent.purchaseCosts.production[0] === 1);
      // The active run keeps the contract it started under, retired ranks included.
      assert(s.run.legacyRules === 10 && Q.eq(s.run.earnedLegacy, Q.of(record.run.earnedLegacy)));
      const raw = serializeSession(s); s = parseSession(raw); assert(serializeSession(s) === raw);
      if (phase === 'destruction') {
        let wallet = v12Wallet;
        while (s.permanent.talents.conservation < TALENTS.conservation.costs.length) {
          wallet -= TALENTS.conservation.costs[s.permanent.talents.conservation];
          assert(purchaseTalent(s, 'conservation') && s.permanent.legacy === wallet);
        }
        assert(!purchaseTalent(s, 'conservation'), 'A maxed talent cannot be bought again');
        rebuildCivilization(s, s.run.runId);
        assert(s.run.legacyRules === ECONOMY.rules && s.run.machineLegacy === 0);
        assert(serializeSession(parseSession(serializeSession(s))) === serializeSession(s));
      }
    }
  });
  test('V12: payment ledger rejects missing, negative, extra, unpriced and duplicate payments', () => {
    const raw = serializeSession(parseSession(JSON.stringify(records.battle)));
    for (const edit of [r=>delete r.permanent.purchaseCosts, r=>r.permanent.purchaseCosts.spark=[],
      r=>r.permanent.purchaseCosts.spark.push('1'), r=>r.permanent.purchaseCosts.spark=['-1'],
      r=>r.permanent.purchaseCosts.conservation=['7'], r=>r.permanent.purchaseCosts.unknown=['0']]) {
      const bad = JSON.parse(raw); edit(bad); let rejected=false;
      try { parseSession(JSON.stringify(bad)); } catch { rejected=true; }
      assert(rejected);
    }
  });
  test('Scientific notation: quantity formatting and talent prices agree, without changing actual costs', () => {
    assert(Q.format(999999)==='999999' && Q.format(1000000)==='1e+6');
    assert(Q.format(Q.of('1e400'))==='1e+400');
    const s=parseSession(JSON.stringify(records.destruction)), view=buildTalentViewModel(s);
    assert(view['#buy-bypasser'] === `注入全部 ${ECONOMY.bypasserCost} Legacy · 启航`);
    assert(TALENTS.bypasser.costs[0]===ECONOMY.bypasserCost);
  });
}
