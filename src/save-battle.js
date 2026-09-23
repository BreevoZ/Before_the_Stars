import { Q } from './quantity.js';
import { RULES, AGES, UNITS, TURRETS, getBaseHealth, getUnitHealth } from './game.js';
import { SURFACE, SAVE_VERSION } from './progression-config.js';
import { stat, attributes, STAT_DEFINITIONS } from './stats.js';
import { check, object, num, int, bool, member, numbers, list, limit } from './save-primitives.js';
import { validateShape, GAME_SHAPE, UNIT_SHAPE, ORDER_SHAPE, TURRET_SHAPE, SHOT_SHAPE, FIELD_SHAPE, EFFECT_SHAPE, IMPACT_SHAPE, ABILITY_SHAPE, AI_SHAPE } from './save-schema.js';
import { TRAITS, validTraitState } from './traits.js';
const teams = ['player','enemy'];
export function validateBattle(g, version = SAVE_VERSION, combat = g) {
  validateShape(g, GAME_SHAPE, 'game');
  const amount = (value, min = 0, max = version < 7 ? limit : undefined) => version < 7 ? num(value, min, max) : Q.valid(value) && Q.gte(value,min) && (max === undefined || Q.lte(value,max));
  const wholeAmount = value => amount(value) && Q.isInteger(value);
  const oldHealthCap = value => version < 7 ? Q.toNumber(Q.min(value, 1e9)) : value;
  for (const key of ['ages', 'experience', 'gold', 'bases', 'queues', 'turrets']) check(object(g[key]), key);
  const orderIds = new Set(), unitIds = new Set();
  for (const team of teams) {
    check(int(g.ages[team], 1, SURFACE.finalEnemyAge) && amount(g.gold[team]) && wholeAmount(g.experience[team]), '时代或资源');
    const base = g.bases[team];
    check(object(base) && base.team === team && base.x === (team === 'player' ? RULES.playerBaseX : RULES.enemyBaseX), '基地');
    check(amount(base.maxHp, 1) && Q.eq(base.maxHp, version >= 5 ? oldHealthCap(getBaseHealth(combat, team)) : AGES[g.ages[team]].baseHealth) && amount(base.hp, 0, base.maxHp) && num(base.hitFlash), '基地生命');
    list(g.queues[team], version >= 6 ? STAT_DEFINITIONS.queueLimit.max : RULES.queueLimit, '训练队列');
    for (const order of g.queues[team]) {
      validateShape(order, ORDER_SHAPE, 'order');
      check(member(order.type, UNITS) && int(order.id, 1, g.nextOrderId - 1) && !orderIds.has(order.id), '训练订单');
      orderIds.add(order.id);
      if (version >= 6) check(num(order.duration, RULES.fixedStep, 3600), '训练订单快照');
      check(UNITS[order.type].age <= g.ages[team] && num(order.remaining, 0, version >= 6 ? order.duration : UNITS[order.type].trainTime) && amount(order.paid, 0, version >= 7 ? undefined : version >= 6 ? 1e9 : 10000), '订单进度或支付价格');
    }
    list(g.turrets[team], RULES.maxTurretSlots, '炮位');
    if (version < 6) check(g.turrets[team].length >= 1, '缺少初始炮位');
    g.turrets[team].forEach((turret, slot) => {
      if (turret === null) return;
      check(object(turret) && member(turret.type, TURRETS) && turret.team === team && turret.slot === slot && TURRETS[turret.type].age <= g.ages[team], '炮塔');
      if (version >= 6) check(amount(turret.paid, 0, version >= 7 ? undefined : 1e9), '炮塔支付快照');
      validateShape(turret, TURRET_SHAPE, 'turret');
      for (const key of ['chargeTargetId', 'burstTargetId']) if (turret[key] != null) check(int(turret[key], 1, g.nextUnitId - 1), '炮塔目标');
    });
  }
  const lost = Q.eq(g.bases.player.hp, 0), won = Q.eq(g.bases.enemy.hp, 0);
  check(g.status === (lost && won ? 'draw' : lost ? 'lost' : won ? 'won' : 'playing'), '基地与胜负不一致');
  list(g.units, (version >= 6 ? STAT_DEFINITIONS.armyLimit.max : RULES.armyLimit) * 2, '部队');
  for (const unit of g.units) {
    validateShape(unit, UNIT_SHAPE, 'unit');
    check(member(unit.type, UNITS) && teams.includes(unit.team) && int(unit.id, 1, g.nextUnitId - 1) && !unitIds.has(unit.id), '部队实体');
    unitIds.add(unit.id);
    check(UNITS[unit.type].age <= g.ages[unit.team] && amount(unit.hp, 0, version >= 5 ? oldHealthCap(getUnitHealth(combat, unit.type, unit.team)) : UNITS[unit.type].health) && Q.gt(unit.hp, 0) && num(unit.x, 0, RULES.width) && bool(unit.moving), '部队属性');
    if (version >= 9) check(validTraitState(unit), '兵种特性状态');
    if (['chargeRemaining','chargeDuration','chargeTargetId','chargeTargetBase'].some(key => unit[key] !== undefined)) {
      check(num(unit.chargeDuration, RULES.fixedStep) && num(unit.chargeRemaining, Number.EPSILON, unit.chargeDuration), '单位引导时钟');
      check(stat(combat, unit, 'canRanged') && (attributes(combat, unit).chargeTime ?? 0) > 0, '单位引导能力');
      check((int(unit.chargeTargetId, 1, g.nextUnitId - 1) && unit.chargeTargetBase === null) ||
        (unit.chargeTargetId === null && teams.includes(unit.chargeTargetBase) && unit.chargeTargetBase !== unit.team), '单位锁定目标');
    }
    if (unit.attackStyle !== undefined) check(['melee', 'ranged'].includes(unit.attackStyle), '攻击姿态');
    if (unit.lastAttackCharged !== undefined) check(bool(unit.lastAttackCharged), '冲锋');
    if (unit.burstTargetId != null) check(int(unit.burstTargetId, 1, g.nextUnitId - 1), '连发目标');
    if (unit.burstTargetBase != null) check(teams.includes(unit.burstTargetBase), '连发基地');
  }
  for (const team of teams) {
    const alive = g.units.filter(unit => unit.team === team).length;
    check(version >= 6 ? alive <= STAT_DEFINITIONS.armyLimit.max : alive + g.queues[team].length <= RULES.armyLimit, '兵力上限');
  }
  list(g.projectiles, 512, '弹药');
  for (const shot of g.projectiles) {
    validateShape(shot, SHOT_SHAPE, 'projectile');
    check(amount(shot.damage) && amount(shot.armorPierce), '弹药伤害');
    check(shot.duration > 0 && shot.remaining > 0 && shot.remaining <= shot.duration && bool(shot.ignoreArmor), '弹药进度');
    check((shot.targetId === null || int(shot.targetId, 1, g.nextUnitId - 1)) && (shot.targetBase === null || teams.includes(shot.targetBase)), '弹药目标');
    if (version >= 6 && shot.field != null) {
      const field = shot.field;
      validateShape(field, FIELD_SHAPE, 'projectile.field');
      check(amount(field.damage), '地面伤害');
      check(num(field.tickInterval, RULES.fixedStep, 10) && num(field.duration, RULES.fixedStep, 60) && field.remaining <= field.duration && field.slow > 0 && field.slow <= 1, '弹药地面效果进度');
    }
    if (shot.sourceId !== undefined) check(int(shot.sourceId, 1, g.nextUnitId - 1), '弹药士兵来源');
    if (shot.trait !== undefined) check(member(shot.trait, TRAITS), '弹药特性');
    if (shot.turretType !== undefined) check(member(shot.turretType, TURRETS), '弹药来源');
  }
  list(g.fields, 128, '地面效果');
  for (const field of g.fields) {
    validateShape(field, FIELD_SHAPE, 'field');
    if (field.sourceId !== undefined) check(int(field.sourceId, 1, g.nextUnitId - 1) && member(field.trait, TRAITS), '火场来源');
    check(teams.includes(field.team) && num(field.x), '地面效果位置');
    check(amount(field.damage), '地面伤害');
    check(num(field.tickInterval, RULES.fixedStep, 10) && num(field.duration, RULES.fixedStep, 60) && field.remaining <= field.duration && field.slow > 0 && field.slow <= 1, '地面效果进度');
  }
  list(g.effects, 2048, '视觉效果');
  for (const effect of g.effects) {
    validateShape(effect, EFFECT_SHAPE, 'effect');
    check(effect.duration > 0 && effect.life <= effect.duration, '视觉效果时长');
    if (['impact', 'evolve', 'pierce', 'trait'].includes(effect.kind)) check(teams.includes(effect.team), '效果阵营');
    if (effect.kind === 'impact') {
      validateShape(effect, IMPACT_SHAPE, 'impact');
      if (effect.followTargetId != null) check(int(effect.followTargetId, 1, g.nextUnitId - 1), '命中跟踪目标');
    } else if (effect.kind === 'trait') {
      check(member(effect.trait, TRAITS) && ['throw','heal','shield','parry','volley','canister','coaxial','blink','overload','field','fieldBreak','fire','ricochet','suppression'].includes(effect.style), '特性表现');
      if (effect.toX !== undefined) check(num(effect.toX, 0, RULES.width), '特性目标位置');
    } else if (effect.kind === 'pierce') numbers(effect, ['toX', 'y'], [], -RULES.width, RULES.width * 2);
    else if (effect.kind !== 'evolve') numbers(effect, ['radius']);
  }
  check(g.ability === null || object(g.ability), '技能');
  if (g.ability) {
    validateShape(g.ability, ABILITY_SHAPE, 'ability');
    if (version >= 6) {
      const expected = attributes(g, { kind: 'ability', type: g.ability.type, team: 'player' });
      const snapshot = g.ability.stats;
      check(object(snapshot) && Object.keys(snapshot).length === Object.keys(expected).length, '技能属性快照');
      for (const [key, base] of Object.entries(expected)) {
        const definition = STAT_DEFINITIONS[key];
        check(definition ? definition.boolean ? bool(snapshot[key]) : definition.quantity ? amount(snapshot[key], definition.min, version < 7 ? 1e9 : undefined) : num(snapshot[key], definition.min, definition.max) : snapshot[key] === base, '技能快照属性');
      }
    }
    check(g.ability.x <= RULES.width && int(g.ability.wavesLeft, 0, 4), '技能进度');
  }
  if (g.traitActivations !== undefined) check(object(g.traitActivations) && Object.entries(g.traitActivations).every(([key, count]) => member(key, TRAITS) && int(count)), '特性触发计数');
  validateShape(g.ai, AI_SHAPE, 'ai');
  return g;
}
