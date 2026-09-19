import { Q } from './quantity.js';
import { RULES, AGES, UNITS, TURRETS, ABILITIES, getBaseHealth, getUnitHealth } from './game.js';
import { SAVE_VERSION, SURFACE, UPGRADE_COSTS, AUTOMATION_TARGETS, AUTOMATION_INTERVAL, CHALLENGE, getChallengeModifiers, getBonuses, automationUnlocked, availableSpeeds } from './progression-config.js';
import { DEBUG_SPEEDS } from './debug.js';
import { TALENTS, getTalentBonuses, getLegacyReward, meetsTalentRequirements } from './talents.js';
import { stat, attributes, createBonusStack, legacyBonuses, STAT_DEFINITIONS } from './stats.js';
import { getRunBonuses, getV8RunBonuses } from './progression-bonuses.js';
import { validAutomation } from './automation.js';

import { check, object, num, int, bool, id, member, numbers, list, safeTree, limit } from './save-primitives.js';
import { HISTORICAL_TALENTS, HISTORICAL_UPGRADE_COSTS } from './save-history.js';
import { validateShape, SESSION_SHAPE, RUN_SHAPE, GAME_SHAPE, UNIT_SHAPE, ORDER_SHAPE, TURRET_SHAPE, SHOT_SHAPE, FIELD_SHAPE, EFFECT_SHAPE, IMPACT_SHAPE, ABILITY_SHAPE, AI_SHAPE } from './save-schema.js';
import { phaseMatchesResult } from './progression-machine.js';

import { TRAITS, validTraitState } from './traits.js';
const teams = ['player', 'enemy'];
function levels(value, costs) {
  check(object(value) && Object.keys(value).length === 2, '升级等级');
  for (const key of ['production', 'warfare']) check(int(value[key], 0, costs.length), key);
}
function talentLevels(value, upgrades, configs = TALENTS, grants = []) {
  check(object(value) && Object.keys(value).length === Object.keys(configs).length, '天赋等级');
  for (const [key, config] of Object.entries(configs)) {
    check(int(value[key], 0, config.costs.length), `天赋 ${key}`);
    if (configs === TALENTS && value[key] && !grants.includes(key)) check(meetsTalentRequirements({ ...value, ...upgrades }, config), '时代层前置条件');
    if (value[key] && !grants.includes(key)) for (const [parent, required] of Object.entries(config.requires)) {
      check((value[parent] ?? upgrades[parent]) >= required, '天赋前置条件');
    }
  }
}
export function validateRecord(session, version = SAVE_VERSION) {
  const oldVersion = version === 1, previousVersion = version < 3;
  const amount = (value, min = 0, max = version < 7 ? limit : undefined) => version < 7 ? num(value, min, max)
    : Q.valid(value) && Q.gte(value, min) && (max === undefined || Q.lte(value, max));
  const wholeAmount = value => amount(value) && Q.isInteger(value);
  const oldHealthCap = value => version < 7 ? Q.toNumber(Q.min(value, 1e9)) : value;
  const configs = HISTORICAL_TALENTS[version] ?? TALENTS;
  validateShape(session, SESSION_SHAPE, 'session');
  validateShape(session.run, RUN_SHAPE, 'run');
  validateShape(session.game, GAME_SHAPE, 'game');
  check(session.version === version, '不支持的存档版本');
  check(session.debug === undefined || session.debug === true, '调试标记');
  check(session.debug === true ? DEBUG_SPEEDS.includes(session.debugSpeed) : session.debugSpeed === undefined, '调试速度');
  safeTree(session);
  const { permanent: p, run, game: g } = session;
  check(object(p) && object(run) && object(g), '缺少永久、文明或战斗状态');
  check(int(p.completedCycles) && int(p.legacy), '遗产或循环数');
  const upgradeCosts = version < 8 ? HISTORICAL_UPGRADE_COSTS : UPGRADE_COSTS;
  levels(p.upgrades, upgradeCosts); levels(run.upgrades, upgradeCosts);
  if (!oldVersion) { talentLevels(p.talents, p.upgrades, configs, version >= 9 ? p.talentGrants : []); talentLevels(run.talents, run.upgrades, configs, version >= 9 ? p.talentGrants : []); }
  const challengeLevel = version >= 5 ? run.challengeLevel : 0;
  check(int(challengeLevel, 0, CHALLENGE.maxLevel), '挑战难度');
  check(!challengeLevel || (run.talents.challenge === 1 && p.completedCycles >= challengeLevel), '挑战未解锁');
  if (version >= 4) for (const state of [p, run]) {
    check(!Object.values(state.upgrades).some(level => level > 0) || state.talents[version < 9 ? 'autobuyer' : 'spark'] === 1, '档案需要根天赋');
  }
  if (version >= 6) {
    check(g.mode === 'incremental' && Array.isArray(g.bonuses) && !g.modifiers && !g.enemyModifiers, '属性管线');
    check(run.extraBonuses === undefined || Array.isArray(run.extraBonuses), '额外属性来源');
    createBonusStack(run.extraBonuses ?? []);
    if (version < 7) for (const effect of [...g.bonuses, ...(run.extraBonuses ?? [])]) {
      check(typeof effect.value === 'boolean' || num(effect.value, -1e9, 1e9), '旧版属性值');
    }
    check(JSON.stringify(createBonusStack(g.bonuses)) === JSON.stringify((version < 9 ? getV8RunBonuses : getRunBonuses)(run)), '属性栈与本轮来源不一致');
  }
  const combat = version >= 6 ? g : { ...g, bonuses: legacyBonuses(g.modifiers, g.enemyModifiers) };
  const totalLegacy = oldVersion ? p.completedCycles * SURFACE.legacyPerCycle : p.totalLegacy;
  // Past runs may have had different depth/milestone sources. Validate the
  // ledger and schema bounds, not the current run's possible reward ceiling.
  const maxReward = version >= 6 ? STAT_DEFINITIONS.legacy.max : oldVersion ? SURFACE.legacyPerCycle : getLegacyReward(Object.fromEntries(Object.entries(TALENTS).map(([key, config]) => [key, config.costs.length])), version >= 5 ? CHALLENGE.maxLevel : 0);
  check(int(totalLegacy, version >= 6 ? 0 : p.completedCycles * SURFACE.legacyPerCycle, Math.min(limit, p.completedCycles * maxReward)), '累计遗产');
  if (!previousVersion) {
    list(p.talentGrants, version < 9 ? 2 : 3, '旧版功能保留');
    check(new Set(p.talentGrants).size === p.talentGrants.length && p.talentGrants.every(key =>
      (version < 9 ? ['autobuyer', 'logistics'] : ['spark', 'logistics', 'superSoldierPlan']).includes(key) && p.talents[key] === 1 && p.completedCycles > 0), '旧版功能保留');
  }
  const spent = Object.values(p.upgrades).reduce((sum, level) => sum + upgradeCosts.slice(0, level).reduce((a, b) => a + b, 0), 0)
    + (oldVersion ? 0 : Object.entries(configs).reduce((sum, [key, config]) => sum +
      (!previousVersion && p.talentGrants.includes(key) ? 0 : config.costs.slice(0, p.talents[key]).reduce((a, b) => a + b, 0)), 0));
  check(p.legacy + spent === totalLegacy, '遗产收支不一致');
  const auto = p.automation;
  check(object(auto) && bool(auto.unlocked) && bool(auto.enabled) && AUTOMATION_TARGETS.includes(auto.target), '自动招募设置');
  check(auto.unlocked === (previousVersion ? p.completedCycles > 0 : version < 9 ? p.talents.autobuyer > 0 : automationUnlocked(p)) && (auto.unlocked || !auto.enabled), '自动招募解锁');
  if (!oldVersion) check(validAutomation(auto, p.talents, previousVersion), '自动购买设置或解锁条件');
  if (version >= 9) {
    check(object(p.settings) && availableSpeeds(p).includes(p.settings.speed), '游戏速度设置');
    check(bool(p.automationRetained) && (!p.automationRetained || p.talentGrants.includes('spark')), '自动招募保留标记');
  }
  if (version < 7) check(num(auto.reserve ?? 0, 0, 1e9), '旧版预留金币');
  check(id(run.runId) && int(run.battleNumber, 1, SURFACE.finalEnemyAge) && run.battleId === `${run.runId}:${run.battleNumber}`, '文明或战斗标识');
  check(run.processedBattleId === null || (id(run.processedBattleId) && run.processedBattleId.startsWith(`${run.runId}:`)), '胜利处理标记');
  check(['battle', 'victory', 'destruction', 'defeat'].includes(run.phase) && bool(run.settled), '流程阶段');
  const reward = version >= 6 ? stat(g, { kind: 'civilization' }, 'legacy') : oldVersion ? SURFACE.legacyPerCycle : getLegacyReward(run.talents, challengeLevel);
  check(int(run.earnedLegacy, 0, reward), '本轮遗产');
  check(run.autoElapsed < AUTOMATION_INTERVAL + 1e-8, '自动招募时钟');
  if (!oldVersion) check(['recruit', 'defense'].includes(run.autoTurn), '自动购买调度');
  check(run.settled === (run.phase === 'destruction') && run.earnedLegacy === (run.settled ? reward : 0), '重复结算保护标记');
  check(!run.settled || p.completedCycles > 0, '已结算循环数');
  check(run.earnedLegacy <= totalLegacy, '结算与累计遗产');
  for (const key of Object.keys(p.upgrades)) check(run.upgrades[key] <= p.upgrades[key], '本轮升级快照');
  if (run.phase === 'battle' || run.phase === 'victory') {
    check(run.upgrades.production === p.upgrades.production && run.upgrades.warfare === p.upgrades.warfare, '战斗中升级');
  }
  if (!oldVersion) for (const key of Object.keys(configs)) {
    check(run.talents[key] <= p.talents[key], '本轮天赋快照');
    if (['battle', 'victory'].includes(run.phase)) check(run.talents[key] === p.talents[key], '战斗中购买天赋');
  }
  if (version < 6) {
    check(g.mode === 'incremental' && object(g.modifiers), '战斗模式');
    const bonuses = getBonuses(run.upgrades);
    check(g.modifiers.income === bonuses.income && g.modifiers.experience === bonuses.experience, '本轮倍率');
    if (!oldVersion) check(g.modifiers.bounty === getTalentBonuses(run.talents).bounty, '本轮战利品倍率');
    if (version >= 5) {
      const expected = getChallengeModifiers(challengeLevel);
      check(object(g.enemyModifiers) && Object.keys(g.enemyModifiers).length === Object.keys(expected).length &&
        Object.entries(expected).every(([key, value]) => g.enemyModifiers[key] === value), '敌军挑战倍率');
    }
  }
  check(phaseMatchesResult(run.phase, g.status), '流程与战斗结果不一致');
  check(run.phase === 'battle' ? run.processedBattleId !== run.battleId : run.processedBattleId === run.battleId, '战斗处理标记');
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
  if (run.phase === 'destruction') check(g.ages.enemy === SURFACE.finalEnemyAge, '终局敌人');
  if (run.phase === 'victory') check(g.ages.enemy < SURFACE.finalEnemyAge, '普通战役终点');
  list(g.units, (version >= 6 ? STAT_DEFINITIONS.armyLimit.max : RULES.armyLimit) * 2, '部队');
  for (const unit of g.units) {
    validateShape(unit, UNIT_SHAPE, 'unit');
    check(member(unit.type, UNITS) && teams.includes(unit.team) && int(unit.id, 1, g.nextUnitId - 1) && !unitIds.has(unit.id), '部队实体');
    unitIds.add(unit.id);
    check(UNITS[unit.type].age <= g.ages[unit.team] && amount(unit.hp, 0, version >= 5 ? oldHealthCap(getUnitHealth(combat, unit.type, unit.team)) : UNITS[unit.type].health) && Q.gt(unit.hp, 0) && num(unit.x, 0, RULES.width) && bool(unit.moving), '部队属性');
    if (version >= 9) check(validTraitState(unit), '兵种特性状态');
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
  return session;
}

export const validateSession = session => validateRecord(session);
