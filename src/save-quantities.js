import { STAT_DEFINITIONS } from './stats.js';
import { check, object } from './save-primitives.js';
const teams = ['player', 'enemy'];
// Explicit schema walk: numbers in coordinates, clocks and IDs are
// never revived as quantities. Unknown properties cannot smuggle Decimal data.
export function mapSessionQuantities(session, convert) {
  const { game: g, run, permanent: p } = session;
  check(object(g) && object(run) && object(p), '缺少游戏状态');
  const field = (object, key) => { object[key] = convert(object[key]); };
  mapBattleQuantities(g, convert, run.extraBonuses ?? [], session.version);
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
  if (session.version === 15 && session.orbital) {
    field(session.orbital, 'energy'); field(session.orbital, 'legacyEarned');
    if (session.orbital.project) { field(session.orbital.project, 'legacy'); field(session.orbital.project, 'energy'); }
  }
  if(session.version >= 16 && session.orbital) {
    const o=session.orbital;
    for(const key of ['legacyEarned','interventionSpent','lastReward'])field(o,key);
    for(const c of o.civilizations){field(c,'experience');field(c,'gold');}
    for(const costs of Object.values(o.payments))for(let i=0;i<costs.length;i++)field(costs,i);
    for(const war of o.wars)mapBattleQuantities(war.game,convert,[],session.version);
  }
  return session;
}

export function mapBattleQuantities(g,convert,extraBonuses=[],version=16) {
  const field=(object,key)=>{object[key]=convert(object[key]);};
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
  for (const effect of [...(g.bonuses ?? []), ...extraBonuses]) {
    if (STAT_DEFINITIONS[effect.target?.stat]?.quantity && (effect.target.stat !== 'legacy' || version >= 10)) field(effect, 'value');
  }
  return g;
}
