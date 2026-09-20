import { STAT_DEFINITIONS } from './stats.js';
import { check, object } from './save-primitives.js';
const teams = ['player', 'enemy'];
// Explicit schema walk: numbers in coordinates, clocks and IDs are
// never revived as quantities. Unknown properties cannot smuggle Decimal data.
export function mapSessionQuantities(session, convert) {
  const { game: g, run, permanent: p } = session;
  check(object(g) && object(run) && object(p), '缺少游戏状态');
  const field = (object, key) => { object[key] = convert(object[key]); };
  for (const team of teams) {
    field(g.gold, team); field(g.experience, team);
    field(g.bases[team], 'hp'); if (g.bases[team].maxHp !== undefined) field(g.bases[team], 'maxHp');
    for (const order of g.queues[team]) field(order, 'paid');
    for (const tower of g.turrets[team]) if (tower) field(tower, 'paid');
  }
  for (const unit of g.units) field(unit, 'hp');
  for (const shot of g.projectiles) {
    field(shot, 'damage'); field(shot, 'armorPierce');
    if (shot.field) field(shot.field, 'damage');
  }
  for (const area of g.fields) field(area, 'damage');
  if (g.ability) for (const key of Object.keys(g.ability.stats)) {
    if (STAT_DEFINITIONS[key]?.quantity) field(g.ability.stats, key);
  }
  for (const effect of [...(g.bonuses ?? []), ...(run.extraBonuses ?? [])]) {
    if (STAT_DEFINITIONS[effect.target?.stat]?.quantity && (effect.target.stat !== 'legacy' || session.version >= 10)) field(effect, 'value');
  }
  field(p.automation, 'reserve');
  if (p.debugLegacyAdjustment !== undefined) field(p, 'debugLegacyAdjustment');
  if (session.version >= 11) {
    check(object(p.purchaseCosts), '缺少购买账本');
    for (const costs of Object.values(p.purchaseCosts)) {
      check(Array.isArray(costs), '购买账本格式');
      for (let rank = 0; rank < costs.length; rank++) field(costs, rank);
    }
  }
  if (session.version >= 10) {
    field(p, 'totalLegacy'); if (p.legacy !== undefined) field(p, 'legacy');
    field(run, 'earnedLegacy');
    if (session.version >= 12) field(run, 'machineLegacy');
    if (p.legacyMachine) field(p.legacyMachine, 'produced');
  }
  return session;
}
