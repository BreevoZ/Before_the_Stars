import { Q } from './quantity.js';
import { check, object, num, int, bool } from './save-primitives.js';
import { BODIES, ORBITAL_STRUCTURES as S, ORBITAL_RULES as R, POLICIES, INTERVENTIONS } from './orbital-config.js';
import { orbitalRates, createOrbitalState } from './orbital-game.js';

function keys(value, expected, name) {
  check(object(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)), name);
}
const amount = value => Q.valid(value) && Q.gte(value, 0);
export function validateOrbital(session, version) {
  const o = session.orbital;
  if (version < 15 || session.run.phase !== 'orbital') { check(o === undefined, '轨道阶段状态'); return; }
  keys(o, Object.keys(createOrbitalState()), '轨道字段');
  check(o.version === R.version && bool(o.started) && num(o.elapsed), '轨道时钟');
  keys(o.structures, Object.keys(S), '轨道建筑');
  for (const [key, spec] of Object.entries(S)) {
    check(int(o.structures[key], 0, spec.legacy.length), '建筑等级');
    if (o.structures[key]) check(Object.entries(spec.requires).every(([id, rank]) => o.structures[id] >= rank), '建筑前置');
  }
  check(amount(o.energy) && Q.lte(o.energy, orbitalRates(o).capacity), '储能容量');
  if (o.project !== null) {
    const p = o.project;
    keys(p, ['key','rank','remaining','duration','legacy','energy'], '建造订单');
    check(Object.hasOwn(S, p.key), '建造类型');
    const spec = S[p.key], rank = o.structures[p.key];
    check(p.rank === rank + 1 && rank < spec.legacy.length && p.duration === spec.seconds[rank] && num(p.remaining, 0, p.duration), '建造进度');
    check(Q.eq(p.legacy, spec.legacy[rank]) && Q.eq(p.energy, spec.energy[rank]), '建造支付凭据');
    check(Object.entries(spec.requires).every(([id, level]) => o.structures[id] >= level), '建造前置');
  }
  check(amount(o.legacyEarned) && Q.isInteger(o.legacyEarned) && Q.lte(o.legacyEarned, session.permanent.totalLegacy), '轨道遗产');
  check(num(o.legacyFraction, 0, 1) && o.legacyFraction < 1 && bool(o.autoStabilize) && (!o.autoStabilize || o.structures.relay > 0), '轨道治理设置');
  check(Object.hasOwn(BODIES, o.selectedBody) && (o.selectedBody !== 'moon' || o.structures.survey > 0), '观测天体');
  check(BODIES.earth.civilizations.some(c => c.id === o.selectedCivilization), '观测文明');
  keys(o.bodies, Object.keys(BODIES), '天体状态');
  for (const [bodyId, definition] of Object.entries(BODIES)) {
    const body = o.bodies[bodyId]; keys(body, ['civilizations'], '天体字段');
    check(Array.isArray(body.civilizations) && body.civilizations.length === definition.civilizations.length, '天体文明数量');
    for (const [index, c] of body.civilizations.entries()) {
      keys(c, ['id','born','population','progress','influence','unrest','policy','eventIndex','cooldowns','signal'], '文明字段');
      const spec = definition.civilizations[index];
      check(c.id === spec.id && bool(c.born) && c.born === (o.elapsed >= spec.birth), '文明诞生');
      check(num(c.population, c.born ? 12 : 0, c.born ? R.maxPopulation : 0) && num(c.progress, 0, c.born ? R.maxProgress : 0), '文明成长');
      check(num(c.influence, 10, 100) && num(c.unrest, 0, 100) && Object.hasOwn(POLICIES, c.policy) && (c.policy === 'balance' || o.structures.observer > 0), '文明政策');
      check(int(c.eventIndex, 0, Math.max(0, Math.floor((o.elapsed - spec.birth) / R.eventInterval))), '文明事件');
      keys(c.cooldowns, Object.keys(INTERVENTIONS), '干预冷却');
      for (const [key, action] of Object.entries(INTERVENTIONS)) check(num(c.cooldowns[key], 0, action.cooldown) && (o.structures.observer || c.cooldowns[key] === 0), '干预时间');
      if (c.signal !== null) { keys(c.signal, ['kind','remaining'], '干预信号'); check(Object.hasOwn(INTERVENTIONS, c.signal.kind) && num(c.signal.remaining, 0, 2) && o.structures.observer > 0, '干预画面'); }
    }
  }
  if (o.structures.survey || o.project?.key === 'survey') check(o.bodies.earth.civilizations.some(c => c.progress >= 160), '月面测绘文明条件');
  check(o.structures.shipyard ? num(o.completionAt, 0, o.elapsed) : o.completionAt === null, '轨道完成凭据');
  check(Array.isArray(o.log) && o.log.length <= R.historyLimit && o.log.every(e => object(e) && Object.keys(e).length === 2 && num(e.time, 0, o.elapsed) && typeof e.text === 'string' && e.text.length <= 140), '轨道日志');
  if (!o.started) check(o.elapsed === 0 && Q.eq(o.energy, R.startingEnergy) && !Object.values(o.structures).some(Boolean) && o.project === null && Q.eq(o.legacyEarned, 0) && o.legacyFraction === 0, '启航前轨道推进');
}
