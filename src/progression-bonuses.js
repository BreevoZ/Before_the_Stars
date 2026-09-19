import { TRAITS } from './traits.js';
import { getBonuses, getChallengeModifiers, challengeName } from './progression-config.js';
import { getTalentBonuses, getLegacyBonuses } from './talents.js';
import { createBonusStack } from './stats.js';

const contribution = (kind, id, label, target, type, value) => ({ target, type, value, source: { kind, id, label } });

// All permanent/challenge contributions enter here. New depth/milestone effects
// use the same data contract via extraBonuses, without editing combat/transfer.
export function getV8RunBonuses(run) {
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

export function getRunBonuses(run) {
  const talents = run.talents;
  const base = getV8RunBonuses({ ...run, extraBonuses: [] }).map(effect => effect.source.kind === 'challenge'
    ? { ...effect, source: { ...effect.source, label: challengeName(run.challengeLevel) } } : effect);
  return createBonusStack(base,
    contribution('doctrine', 'superSoldierPlan', '超级士兵计划', { stat: 'enabled', type: 'superSoldier', team: 'player' }, 'override', Boolean(talents.superSoldierPlan)),
    contribution('doctrine', 'superRanged', '光束投射', { stat: 'canRanged', type: 'superSoldier', team: 'player' }, 'override', Boolean(talents.superRanged)),
    !talents.superRanged ? ['range', 'baseRange'].map(key => contribution('doctrine', 'superRanged', '激光短匕首', { stat: key, type: 'superSoldier', team: 'player' }, 'override', 60)) : [],
    Object.values(TRAITS).filter(trait => talents[trait.id]).map(trait => contribution('doctrine', trait.id, trait.name,
      { stat: trait.stat, type: trait.units[0], team: 'player' }, 'override', true)),
    run.extraBonuses ?? []);
}
