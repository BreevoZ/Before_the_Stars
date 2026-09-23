import { oldOrbitalSpent } from './orbital-history.js';
import { warBonuses } from './orbital-war.js';
import { orbitalLegacySpent } from './orbital-game.js';
import { Q, isLargeQuantity } from './quantity.js';
import { RULES } from './game-config.js';
import { SAVE_VERSION, automationUnlocked } from './progression-config.js';
import { HISTORICAL_TALENTS, HISTORICAL_UPGRADE_COSTS } from './save-history.js';
import { paidLegacy } from './legacy-ledger.js';
import { createBonusStack, stat } from './stats.js';
import { getRunBonuses, getV8RunBonuses, getV9RunBonuses } from './progression-bonuses.js';
import { check, object, int } from './save-primitives.js';
import { validateShape, SESSION_SHAPE, RUN_SHAPE, GAME_SHAPE } from './save-schema.js';

export function cloneRecord(value) {
  if (isLargeQuantity(value) || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneRecord);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneRecord(item)]));
}
export function spentLegacy(permanent, version = SAVE_VERSION) {
  if (version >= 11) {
    check(object(permanent.purchaseCosts) && Object.values(permanent.purchaseCosts).every(costs => Array.isArray(costs) && costs.every(cost => Q.valid(cost) && Q.gte(cost, 0))), '购买账本');
    return paidLegacy(permanent);
  }
  return Object.values(permanent.upgrades).reduce((sum, level) =>
    sum + HISTORICAL_UPGRADE_COSTS.slice(0, level).reduce((a, b) => a + b, 0), 0)
    + Object.entries(HISTORICAL_TALENTS[version < 8 ? 8 : version]).reduce((sum, [key, config]) => sum + (permanent.talentGrants.includes(key) ? 0 : config.costs.slice(0, permanent.talents[key]).reduce((a, b) => a + b, 0)), 0);
}

// Persist purchases, earned currency, preferences and the active simulation.
// Never persist a second copy of attributes that can be rebuilt from run inputs.
export function toV8Record(session) {
  const record = cloneRecord(session);
  record.version = 8;
  delete record.permanent.legacy;
  delete record.permanent.automation.unlocked;
  delete record.run.battleId;
  delete record.game.mode;
  delete record.game.bonuses;
  for (const base of Object.values(record.game.bases)) {
    delete base.maxHp; delete base.x; delete base.team;
  }
  return record;
}
function hydrateRecord(input, version) {
  validateShape(input, SESSION_SHAPE, 'session');
  validateShape(input.run, RUN_SHAPE, 'run');
  validateShape(input.game, GAME_SHAPE, 'game');
  check(input.version === version, '不支持的存档版本');
  const s = cloneRecord(input), p = s.permanent, g = s.game;
  check(object(p.upgrades) && object(p.talents) && object(p.automation) && (version < 10 ? int(p.totalLegacy) : Q.valid(p.totalLegacy) && Q.gte(p.totalLegacy, 0) && Q.isInteger(p.totalLegacy)), '永久输入');
  check(!Object.hasOwn(p, 'legacy') && !Object.hasOwn(p.automation, 'unlocked') && !Object.hasOwn(s.run, 'battleId') &&
    !Object.hasOwn(g, 'mode') && !Object.hasOwn(g, 'bonuses'), '存档包含派生字段');
  p.legacy = Q.sub(Q.add(p.totalLegacy, version >= 14 ? p.debugLegacyAdjustment ?? 0 : 0), Q.add(spentLegacy(p, version), version === 15 ? oldOrbitalSpent(s.orbital) : version >= 16 ? orbitalLegacySpent(s.orbital) : 0));
  p.automation.unlocked = version < 9 ? p.talents.autobuyer > 0 : automationUnlocked(p);
  s.run.battleId = `${s.run.runId}:${s.run.battleNumber}`;
  if (s.run.extraBonuses) s.run.extraBonuses = createBonusStack(s.run.extraBonuses);
  g.mode = 'incremental';
  g.bonuses = (version < 9 ? getV8RunBonuses : version === 9 ? getV9RunBonuses : getRunBonuses)(s.run);
  for (const team of ['player', 'enemy']) {
    const base = g.bases[team];
    check(object(base) && !['maxHp', 'x', 'team'].some(key => Object.hasOwn(base, key)), '基地输入');
    Object.assign(base, { team, x: team === 'player' ? RULES.playerBaseX : RULES.enemyBaseX, maxHp: stat(g, team, 'baseHealth') });
  }
  if (version >= 16 && s.orbital) for (const war of s.orbital.wars) {
    const battle = war.game;
    check(!Object.hasOwn(battle,'mode') && !Object.hasOwn(battle,'bonuses'),'战争派生字段');
    battle.mode='incremental';battle.bonuses=warBonuses(war.participants.map(id=>s.orbital.civilizations.find(c=>c.id===id)));
    for (const team of ['player','enemy']) {
      const base=battle.bases[team];check(object(base)&&!['maxHp','x','team'].some(k=>Object.hasOwn(base,k)),'战争基地输入');
      Object.assign(base,{team,x:team==='player'?RULES.playerBaseX:RULES.enemyBaseX,maxHp:stat(battle,team,'baseHealth')});
    }
  }
  return s;
}

export const fromV8Record = input => hydrateRecord(input, 8);
export const fromV9Record = input => hydrateRecord(input, 9);
export const fromV10Record = input => hydrateRecord(input, 10);
export const fromV11Record = input => hydrateRecord(input, 11);
export const fromV12Record = input => hydrateRecord(input, 12);
export const fromV13Record = input => hydrateRecord(input, 13);
export const fromV14Record = input => hydrateRecord(input, 14);
export const fromV15Record = input => hydrateRecord(input, 15);
export const fromV16Record = input => hydrateRecord(input, 16);
export const fromV17Record = input => hydrateRecord(input, 17);
export const fromSaveRecord = input => hydrateRecord(input, SAVE_VERSION);
export function toSaveRecord(session) { const record = toV8Record(session); record.version = SAVE_VERSION;
  if (record.orbital) for (const war of record.orbital.wars) {
    delete war.game.mode;delete war.game.bonuses;
    for (const base of Object.values(war.game.bases)) {delete base.maxHp;delete base.x;delete base.team;}
  }
  return record; }
