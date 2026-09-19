import { Q } from '../src/quantity.js';
import { TALENT_TREE, TALENTS, emptyTalents, purchaseTalent, getLegacyReward } from '../src/talents.js';
import { rebuildCivilization } from '../src/progression.js';
import { SAVE_VERSION } from '../src/progression-config.js';
import { records, wallet } from './fixtures/v10-save.js';
import { parseSession, serializeSession } from '../src/save.js';
import { buildTalentViewModel } from '../src/talent-view-model.js';

export function registerEconomyPacingTests(test, assert) {
  test('Economy tiers: every surface cost is a power of two, ranks double, and each reward doubling affords exactly the next price tier', () => {
    for (const [key, c] of Object.entries(TALENT_TREE)) {
      for (const [rank, cost] of c.costs.entries()) {
        const tier = Math.log2(cost); assert(Number.isInteger(tier));
        if (rank) assert(cost === c.costs[rank - 1] * 2);
        if (key === 'bypasser') continue;
        const levels = { ...emptyTalents(), conservation: Math.min(tier, 8), continuity: Math.max(0, tier - 8) };
        assert(getLegacyReward(levels) === cost, `${key} rank ${rank + 1}`);
        if (tier) {
          const previous = { ...emptyTalents(), conservation: Math.min(tier - 1, 8), continuity: Math.max(0, tier - 9) };
          assert(getLegacyReward(previous) * 2 === cost);
        }
      }
    }
    const others = Object.entries(TALENT_TREE).filter(([key]) => key !== 'bypasser').flatMap(([,c])=>c.costs);
    assert(TALENTS.bypasser.costs[0] > 7 * others.reduce((a,b)=>a+b,0));
    assert(TALENTS.bypasser.costs[0] === 16 * getLegacyReward({ conservation:8,continuity:8 }));
  });
  test('V11: captured v10 wallet, payments, active battle and settlement survive repricing and subsequent purchases', () => {
    for (const [phase, record] of Object.entries(records)) {
      let s = parseSession(JSON.stringify(record));
      assert(s.version === SAVE_VERSION && s.permanent.legacy === wallet && s.run.phase === phase);
      assert(s.permanent.purchaseCosts.superSoldierPlan[0] === 15 && s.permanent.purchaseCosts.continuity[0] === 6);
      assert(s.permanent.purchaseCosts.production[0] === 1);
      const raw = serializeSession(s); s = parseSession(raw); assert(serializeSession(s) === raw);
      if (phase === 'destruction') {
        assert(purchaseTalent(s,'continuity') && s.permanent.legacy === wallet - 1024);
        assert(s.permanent.purchaseCosts.continuity.join(',') === '6,1024');
        assert(s.run.earnedLegacy === Q.of(record.run.earnedLegacy));
        rebuildCivilization(s,s.run.runId);
        assert(serializeSession(parseSession(serializeSession(s))) === serializeSession(s));
      }
    }
  });
  test('V11: payment ledger rejects missing, negative, extra, unpriced and duplicate payments', () => {
    const raw = serializeSession(parseSession(JSON.stringify(records.battle)));
    for (const edit of [r=>delete r.permanent.purchaseCosts, r=>r.permanent.purchaseCosts.spark=[],
      r=>r.permanent.purchaseCosts.spark.push('1'), r=>r.permanent.purchaseCosts.spark=['-1'],
      r=>r.permanent.purchaseCosts.continuity=['7'], r=>r.permanent.purchaseCosts.unknown=['0']]) {
      const bad = JSON.parse(raw); edit(bad); let rejected=false;
      try { parseSession(JSON.stringify(bad)); } catch { rejected=true; }
      assert(rejected);
    }
  });
  test('Scientific notation: quantity formatting and talent prices agree, without changing actual costs', () => {
    assert(Q.format(999999)==='999999' && Q.format(1000000)==='1e+6');
    assert(Q.format(Q.of('1e400'))==='1e+400');
    const s=parseSession(JSON.stringify(records.destruction)), view=buildTalentViewModel(s);
    assert(view['#buy-bypasser'] === '1.048576e+6 Legacy · 启航');
    assert(TALENTS.bypasser.costs[0]===1048576);
  });
}
