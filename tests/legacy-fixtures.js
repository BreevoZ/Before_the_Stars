import { serializeSession, parseSession } from '../src/save.js';
import { getBonuses, getChallengeModifiers, UPGRADE_COSTS } from '../src/progression-config.js';
import { HISTORICAL_TALENTS, HISTORICAL_UPGRADE_COSTS } from '../src/save-history.js';
import { getTalentBonuses } from '../src/talents.js';

export const statMultiplier = (game, key, team = 'player') => (game.bonuses ?? [])
  .filter(effect => effect.target.stat === key && effect.target.team === team && effect.type === 'multiply')
  .reduce((value, effect) => value * effect.value, 1);

// Construct the historical format explicitly. Version-migration tests must not
// accidentally test a current schema with only its version number changed.
export function v5Record(session) {
  const old = JSON.parse(JSON.stringify(parseSession(serializeSession(session)))), game = old.game;
  old.version = 5;
  for (const state of [old.permanent, old.run]) {
    state.talents = Object.fromEntries(Object.keys(HISTORICAL_TALENTS[5]).map(key => [key, key === 'autobuyer' ? state.talents.spark : state.talents[key]]));
  }
  old.permanent.talentGrants = old.permanent.talentGrants.map(key => key === 'spark' ? 'autobuyer' : key);
  old.permanent.automation.unlocked = old.permanent.talents.autobuyer > 0;
  old.permanent.legacy = old.permanent.totalLegacy - Object.values(old.permanent.upgrades).reduce((sum,level)=>sum+HISTORICAL_UPGRADE_COSTS.slice(0,level).reduce((a,b)=>a+b,0),0) - Object.entries(HISTORICAL_TALENTS[5]).reduce((sum,[key,c])=>sum+(old.permanent.talentGrants.includes(key)?0:c.costs.slice(0,old.permanent.talents[key]).reduce((a,b)=>a+b,0)),0);
  delete old.permanent.purchaseCosts; delete old.permanent.settings; delete old.permanent.automationRetained; delete old.permanent.legacyMachine; delete old.run.legacyRules;

  game.modifiers = { ...getBonuses(old.run.upgrades), bounty: getTalentBonuses(old.run.talents).bounty };
  game.enemyModifiers = getChallengeModifiers(old.run.challengeLevel);
  delete game.bonuses;
  for (const shot of game.projectiles) {
    shot.damage /= shot.team === 'enemy' ? game.enemyModifiers.damage : 1;
    delete shot.field;
  }
  for (const field of game.fields) field.damage /= field.team === 'enemy' ? game.enemyModifiers.damage : 1;
  for (const team of ['player', 'enemy']) {
    for (const order of game.queues[team]) delete order.duration;
    for (const turret of game.turrets[team]) if (turret) delete turret.paid;
  }
  if (game.ability) delete game.ability.stats;
  return old;
}

// Object insertion order is not part of a persisted simulation contract.
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
