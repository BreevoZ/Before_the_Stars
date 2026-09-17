import { getBonuses, getChallengeModifiers } from './progression-config.js';
import { getTalentBonuses, getLegacyBonuses } from './talents.js';
import { createBonusStack } from './stats.js';

const contribution = (kind, id, label, target, type, value) => ({ target, type, value, source: { kind, id, label } });

// All permanent/challenge contributions enter here. New depth/milestone effects
// use the same data contract via extraBonuses, without editing combat/transfer.
export function getRunBonuses(run) {
  const growth = getTalentBonuses(run.talents), archives = getBonuses(run.upgrades);
  return createBonusStack([
    contribution('doctrine', 'production', '生产档案', { stat: 'income', team: 'player' }, 'multiply', archives.income),
    contribution('doctrine', 'warfare', '战争档案', { stat: 'experience', kind: 'reward', team: 'player' }, 'multiply', archives.experience),
    contribution('doctrine', 'supply', '重建储备', { stat: 'startingGold', team: 'player' }, 'add', growth.startingGold),
    contribution('doctrine', 'salvage', '战利品回收', { stat: 'bounty', kind: 'reward', team: 'player' }, 'multiply', growth.bounty),
    ...Object.entries(getChallengeModifiers(run.challengeLevel)).map(([key, value]) => contribution('challenge',
      `challenge:${run.challengeLevel}`, `挑战 ${run.challengeLevel}`, { stat: key === 'gold' ? 'startingGold' : key, team: 'enemy',
        ...(key === 'experience' ? { kind: 'reward' } : {}) }, 'multiply', value)),
  ], getLegacyBonuses(run.talents, run.challengeLevel), run.extraBonuses ?? []);
}
