import { serializeSession, parseSession } from '../src/save.js';
import { getBonuses, getChallengeModifiers } from '../src/progression-config.js';
import { getTalentBonuses } from '../src/talents.js';

export const statMultiplier = (game, key, team = 'player') => (game.bonuses ?? [])
  .filter(effect => effect.target.stat === key && effect.target.team === team && effect.type === 'multiply')
  .reduce((value, effect) => value * effect.value, 1);

// Construct the historical format explicitly. Version-migration tests must not
// accidentally test a current schema with only its version number changed.
export function v5Record(session) {
  const old = JSON.parse(JSON.stringify(parseSession(serializeSession(session)))), game = old.game;
  old.version = 5;
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
