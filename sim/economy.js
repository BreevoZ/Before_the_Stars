import { pathToFileURL } from 'node:url';
import { TALENT_TREE, emptyTalents, getLegacyReward } from '../src/talents.js';
import { getLegacyProduction } from '../src/legacy-machine.js';

// Price pacing audit, independent of battle duration or optional expeditions.
export function economyReport() {
  const prices = Object.entries(TALENT_TREE).filter(([key]) => key !== 'bypasser').flatMap(([key, c]) =>
    c.costs.map((cost, rank) => ({ key, rank: rank + 1, tier: Math.log2(cost), cost })));
  const milestones = Array.from({ length: 17 }, (_, tier) => {
    const talents = { ...emptyTalents(), conservation: Math.min(tier, 8), continuity: Math.max(0, tier - 8) };
    return { tier, reward: getLegacyReward(talents), affordableTier: prices.filter(p => p.tier === tier) };
  });
  const all = Object.fromEntries(Object.entries(TALENT_TREE).map(([key, c]) => [key, c.costs.length]));
  const surfaceTotal = prices.reduce((sum, p) => sum + p.cost, 0), bypasserCost = TALENT_TREE.bypasser.costs[0];
  const maximumReward = milestones.at(-1).reward, production = getLegacyProduction(all).perMinute;
  return { milestones, surfaceTotal, bypasserCost, bypasserToSurface: bypasserCost / surfaceTotal,
    maximumReward, maximumProductionPerMinute: production, finaleOnlyCycles: bypasserCost / maximumReward,
    machineOnlyMinutes: bypasserCost / production };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(economyReport(), null, 2));
