import { isLargeQuantity } from './quantity.js';
import { RULES } from './game-config.js';
import { SAVE_VERSION, UPGRADE_COSTS } from './progression-config.js';
import { getTalentSpending } from './talents.js';
import { createBonusStack, stat } from './stats.js';
import { getRunBonuses } from './progression-bonuses.js';
import { check, object, int } from './save-primitives.js';
import { validateShape, SESSION_SHAPE, RUN_SHAPE, GAME_SHAPE } from './save-schema.js';

export function cloneRecord(value) {
  if (isLargeQuantity(value) || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneRecord);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneRecord(item)]));
}
export function spentLegacy(permanent) {
  return Object.values(permanent.upgrades).reduce((sum, level) =>
    sum + UPGRADE_COSTS.slice(0, level).reduce((a, b) => a + b, 0), 0)
    + getTalentSpending(permanent.talents, permanent.talentGrants);
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
export function fromSaveRecord(input) {
  validateShape(input, SESSION_SHAPE, 'session');
  validateShape(input.run, RUN_SHAPE, 'run');
  validateShape(input.game, GAME_SHAPE, 'game');
  check(input.version === SAVE_VERSION, '不支持的存档版本');
  const s = cloneRecord(input), p = s.permanent, g = s.game;
  check(object(p.upgrades) && object(p.talents) && object(p.automation) && int(p.totalLegacy), '永久输入');
  check(!Object.hasOwn(p, 'legacy') && !Object.hasOwn(p.automation, 'unlocked') && !Object.hasOwn(s.run, 'battleId') &&
    !Object.hasOwn(g, 'mode') && !Object.hasOwn(g, 'bonuses'), '存档包含派生字段');
  p.legacy = p.totalLegacy - spentLegacy(p);
  p.automation.unlocked = p.talents.autobuyer > 0;
  s.run.battleId = `${s.run.runId}:${s.run.battleNumber}`;
  if (s.run.extraBonuses) s.run.extraBonuses = createBonusStack(s.run.extraBonuses);
  g.mode = 'incremental';
  g.bonuses = getRunBonuses(s.run);
  for (const team of ['player', 'enemy']) {
    const base = g.bases[team];
    check(object(base) && !['maxHp', 'x', 'team'].some(key => Object.hasOwn(base, key)), '基地输入');
    Object.assign(base, { team, x: team === 'player' ? RULES.playerBaseX : RULES.enemyBaseX, maxHp: stat(g, team, 'baseHealth') });
  }
  return s;
}

export const toSaveRecord = toV8Record;
