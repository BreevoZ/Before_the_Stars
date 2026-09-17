import { RULES, AGES, UNITS, TURRETS, ABILITIES, getBaseHealth, getUnitHealth, projectileField } from './game.js';
import { SAVE_VERSION, SURFACE, UPGRADE_COSTS, AUTOMATION_TARGETS, AUTOMATION_INTERVAL, CHALLENGE, getChallengeModifiers, getBonuses } from './progression-config.js';
import { DEBUG_SPEEDS } from './debug.js';
import { TALENTS, emptyTalents, getTalentBonuses, getTalentSpending, getLegacyReward } from './talents.js';
import { stat, attributes, createBonusStack, legacyBonuses, STAT_DEFINITIONS } from './stats.js';
import { getRunBonuses } from './progression-bonuses.js';
import { createAutomation, validAutomation } from './automation.js';

// Keep the original storage keys so existing players are migrated in place.
export const SAVE_KEY = 'before-the-stars.incremental.v1';
export const BACKUP_KEY = `${SAVE_KEY}.backup`;
export const DEBUG_SAVE_KEY = 'before-the-stars.debug.v1';
export const MAX_SAVE_BYTES = 2_000_000;
const teams = ['player', 'enemy'];
const limit = 1e12;
const fail = message => { throw new Error(`存档无效：${message}`); };
const check = (condition, name) => { if (!condition) fail(name); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const num = (value, min = 0, max = limit) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const int = (value, min = 0, max = limit) => num(value, min, max) && Number.isInteger(value);
const bool = value => typeof value === 'boolean';
const id = value => typeof value === 'string' && /^[a-zA-Z0-9:-]{1,120}$/.test(value);
const member = (value, config) => typeof value === 'string' && Object.hasOwn(config, value);
function numbers(value, required, optional = [], min = 0, max = limit) {
  for (const key of required) check(num(value[key], min, max), key);
  for (const key of optional) if (value[key] !== undefined) check(num(value[key], min, max), key);
}
function list(value, max, name) { check(Array.isArray(value) && value.length <= max, name); }
function levels(value) {
  check(object(value) && Object.keys(value).length === 2, '升级等级');
  for (const key of ['production', 'warfare']) check(int(value[key], 0, UPGRADE_COSTS.length), key);
}
const V4_TALENTS = Object.fromEntries(Object.entries(TALENTS).filter(([key]) => key !== 'challenge'));
const V3_TALENTS = { ...V4_TALENTS, conservation: { ...TALENTS.conservation, requires: {} } };
const V2_TALENTS = Object.fromEntries(Object.entries(V3_TALENTS).filter(([key]) => !['autobuyer', 'logistics'].includes(key)).map(([key, config]) => [key, key === 'formation' ? { ...config, requires: {} } : config]));
function talentLevels(value, upgrades, configs = TALENTS) {
  check(object(value) && Object.keys(value).length === Object.keys(configs).length, '天赋等级');
  for (const [key, config] of Object.entries(configs)) {
    check(int(value[key], 0, config.costs.length), `天赋 ${key}`);
    if (value[key]) for (const [parent, required] of Object.entries(config.requires)) {
      check((value[parent] ?? upgrades[parent]) >= required, '天赋前置条件');
    }
  }
}
function safeTree(value, depth = 0, key = '') {
  check(depth <= 12, '嵌套过深');
  if (value === Infinity && key === 'maxRange') return;
  if (typeof value === 'number') check(num(value, -limit), '数值超出范围');
  else if (typeof value === 'string') check(value.length <= 200, '文字过长');
  else if (Array.isArray(value)) {
    check(value.length <= 2048, '数组过长');
    value.forEach(item => safeTree(item, depth + 1));
  } else if (object(value)) {
    check(Object.keys(value).length <= 60, '字段过多');
    for (const [name, item] of Object.entries(value)) {
      check(!['__proto__', 'constructor', 'prototype'].includes(name), '非法字段');
      // Undefined optional fields are omitted by JSON.stringify.
      if (item !== undefined) safeTree(item, depth + 1, name);
    }
  } else check(value === null || bool(value), '数据类型');
}

function validateRecord(session, version = SAVE_VERSION) {
  const oldVersion = version === 1, previousVersion = version < 3;
  const configs = version === 2 ? V2_TALENTS : version === 3 ? V3_TALENTS : version === 4 ? V4_TALENTS : TALENTS;
  check(object(session), '根记录');
  check(session.version === version, '不支持的存档版本');
  check(session.debug === undefined || session.debug === true, '调试标记');
  check(session.debug === true ? DEBUG_SPEEDS.includes(session.debugSpeed) : session.debugSpeed === undefined, '调试速度');
  safeTree(session);
  const { permanent: p, run, game: g } = session;
  check(object(p) && object(run) && object(g), '缺少永久、文明或战斗状态');
  check(int(p.completedCycles) && int(p.legacy), '遗产或循环数');
  levels(p.upgrades); levels(run.upgrades);
  if (!oldVersion) { talentLevels(p.talents, p.upgrades, configs); talentLevels(run.talents, run.upgrades, configs); }
  const challengeLevel = version >= 5 ? run.challengeLevel : 0;
  check(int(challengeLevel, 0, CHALLENGE.maxLevel), '挑战难度');
  check(!challengeLevel || (run.talents.challenge === 1 && p.completedCycles >= challengeLevel), '挑战未解锁');
  if (version >= 4) for (const state of [p, run]) {
    check(!Object.values(state.upgrades).some(level => level > 0) || state.talents.autobuyer === 1, '档案需要根天赋');
  }
  if (version >= 6) {
    check(g.mode === 'incremental' && Array.isArray(g.bonuses) && !g.modifiers && !g.enemyModifiers, '属性管线');
    check(run.extraBonuses === undefined || Array.isArray(run.extraBonuses), '额外属性来源');
    createBonusStack(run.extraBonuses ?? []);
    check(JSON.stringify(createBonusStack(g.bonuses)) === JSON.stringify(getRunBonuses(run)), '属性栈与本轮来源不一致');
  }
  const combat = version >= 6 ? g : { ...g, bonuses: legacyBonuses(g.modifiers, g.enemyModifiers) };
  const totalLegacy = oldVersion ? p.completedCycles * SURFACE.legacyPerCycle : p.totalLegacy;
  // Past runs may have had different depth/milestone sources. Validate the
  // ledger and schema bounds, not the current run's possible reward ceiling.
  const maxReward = version >= 6 ? STAT_DEFINITIONS.legacy.max : oldVersion ? SURFACE.legacyPerCycle : getLegacyReward(Object.fromEntries(Object.entries(TALENTS).map(([key, config]) => [key, config.costs.length])), version >= 5 ? CHALLENGE.maxLevel : 0);
  check(int(totalLegacy, version >= 6 ? 0 : p.completedCycles * SURFACE.legacyPerCycle, Math.min(limit, p.completedCycles * maxReward)), '累计遗产');
  if (!previousVersion) {
    list(p.talentGrants, 2, '旧版功能保留');
    check(new Set(p.talentGrants).size === p.talentGrants.length && p.talentGrants.every(key =>
      ['autobuyer', 'logistics'].includes(key) && p.talents[key] === 1 && p.completedCycles > 0), '旧版功能保留');
  }
  const spent = Object.values(p.upgrades).reduce((sum, level) => sum + UPGRADE_COSTS.slice(0, level).reduce((a, b) => a + b, 0), 0)
    + (oldVersion ? 0 : getTalentSpending({ ...emptyTalents(), ...p.talents }, previousVersion ? [] : p.talentGrants));
  check(p.legacy + spent === totalLegacy, '遗产收支不一致');
  const auto = p.automation;
  check(object(auto) && bool(auto.unlocked) && bool(auto.enabled) && AUTOMATION_TARGETS.includes(auto.target), '自动招募设置');
  check(auto.unlocked === (previousVersion ? p.completedCycles > 0 : p.talents.autobuyer > 0) && (auto.unlocked || !auto.enabled), '自动招募解锁');
  if (!oldVersion) check(validAutomation(auto, p.talents, previousVersion), '自动购买设置或解锁条件');
  check(id(run.runId) && int(run.battleNumber, 1, SURFACE.finalEnemyAge) && run.battleId === `${run.runId}:${run.battleNumber}`, '文明或战斗标识');
  check(run.processedBattleId === null || (id(run.processedBattleId) && run.processedBattleId.startsWith(`${run.runId}:`)), '胜利处理标记');
  check(['battle', 'victory', 'destruction', 'defeat'].includes(run.phase) && bool(run.settled), '流程阶段');
  const reward = version >= 6 ? stat(g, { kind: 'civilization' }, 'legacy') : oldVersion ? SURFACE.legacyPerCycle : getLegacyReward(run.talents, challengeLevel);
  check(int(run.earnedLegacy, 0, reward), '本轮遗产');
  numbers(run, ['elapsed', 'autoElapsed']);
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
  check(['playing', 'won', 'lost', 'draw'].includes(g.status), '战斗状态');
  check((run.phase === 'battle' && g.status === 'playing') ||
    (['victory', 'destruction'].includes(run.phase) && g.status === 'won') ||
    (run.phase === 'defeat' && ['lost', 'draw'].includes(g.status)), '流程与战斗结果不一致');
  check(run.phase === 'battle' ? run.processedBattleId !== run.battleId : run.processedBattleId === run.battleId, '战斗处理标记');
  numbers(g, ['elapsed', 'abilityCooldown']);
  check(int(g.nextUnitId, 1) && int(g.nextOrderId, 1), '实体序号');
  for (const key of ['ages', 'experience', 'gold', 'bases', 'queues', 'turrets']) check(object(g[key]), key);
  const orderIds = new Set(), unitIds = new Set();
  for (const team of teams) {
    check(int(g.ages[team], 1, SURFACE.finalEnemyAge) && num(g.gold[team]) && int(g.experience[team]), '时代或资源');
    const base = g.bases[team];
    check(object(base) && base.team === team && base.x === (team === 'player' ? RULES.playerBaseX : RULES.enemyBaseX), '基地');
    check(base.maxHp === (version >= 5 ? getBaseHealth(combat, team) : AGES[g.ages[team]].baseHealth) && num(base.hp, 0, base.maxHp) && num(base.hitFlash), '基地生命');
    list(g.queues[team], version >= 6 ? STAT_DEFINITIONS.queueLimit.max : RULES.queueLimit, '训练队列');
    for (const order of g.queues[team]) {
      check(object(order) && member(order.type, UNITS) && int(order.id, 1, g.nextOrderId - 1) && !orderIds.has(order.id), '训练订单');
      orderIds.add(order.id);
      if (version >= 6) check(num(order.duration, RULES.fixedStep, 3600), '训练订单快照');
      check(UNITS[order.type].age <= g.ages[team] && num(order.remaining, 0, version >= 6 ? order.duration : UNITS[order.type].trainTime) && num(order.paid, 0, version >= 6 ? 1e9 : 10000), '订单进度或支付价格');
    }
    list(g.turrets[team], RULES.maxTurretSlots, '炮位');
    if (version < 6) check(g.turrets[team].length >= 1, '缺少初始炮位');
    g.turrets[team].forEach((turret, slot) => {
      if (turret === null) return;
      check(object(turret) && member(turret.type, TURRETS) && turret.team === team && turret.slot === slot && TURRETS[turret.type].age <= g.ages[team], '炮塔');
      if (version >= 6) check(num(turret.paid, 0, 1e9), '炮塔支付快照');
      numbers(turret, ['cooldown', 'flash', 'shotSerial', 'aim', 'burstRemaining', 'chargeRemaining'], ['burstCooldown', 'flashDuration', 'lastBarrel'], -1, limit);
      for (const key of ['chargeTargetId', 'burstTargetId']) if (turret[key] != null) check(int(turret[key], 1, g.nextUnitId - 1), '炮塔目标');
    });
  }
  const lost = g.bases.player.hp === 0, won = g.bases.enemy.hp === 0;
  check(g.status === (lost && won ? 'draw' : lost ? 'lost' : won ? 'won' : 'playing'), '基地与胜负不一致');
  if (run.phase === 'destruction') check(g.ages.enemy === SURFACE.finalEnemyAge, '终局敌人');
  if (run.phase === 'victory') check(g.ages.enemy < SURFACE.finalEnemyAge, '普通战役终点');
  list(g.units, (version >= 6 ? STAT_DEFINITIONS.armyLimit.max : RULES.armyLimit) * 2, '部队');
  for (const unit of g.units) {
    check(object(unit) && member(unit.type, UNITS) && teams.includes(unit.team) && int(unit.id, 1, g.nextUnitId - 1) && !unitIds.has(unit.id), '部队实体');
    unitIds.add(unit.id);
    check(UNITS[unit.type].age <= g.ages[unit.team] && num(unit.hp, Number.MIN_VALUE, version >= 5 ? getUnitHealth(combat, unit.type, unit.team) : UNITS[unit.type].health) && num(unit.x, 0, RULES.width) && bool(unit.moving), '部队属性');
    numbers(unit, ['attackCooldown', 'attackAnimation', 'hitFlash'], ['distanceTravelled', 'chargeTravel', 'guardFlash', 'attackApproach', 'moveMultiplier', 'burstRemaining', 'burstCooldown'], -1);
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
    check(object(shot) && teams.includes(shot.team) && ['sling','stone','boulder','arrow','bolt','egg','fireball','oil','bullet','cannon','shell','rocket','plasma','plasma-orb','rail','laser','ion'].includes(shot.kind), '弹药类型');
    numbers(shot, ['fromX', 'toX', 'fromY', 'toY', 'toOffsetX', 'originX'], ['fromUnitX', 'fromTurretX', 'fromBaseX', 'arc'], -RULES.width, RULES.width * 2);
    numbers(shot, ['damage', 'duration', 'remaining', 'splash', 'armorPierce', 'pierce'], ['pierceFactor', 'pierceDistance']);
    check(shot.duration > 0 && shot.remaining > 0 && shot.remaining <= shot.duration && bool(shot.ignoreArmor), '弹药进度');
    check((shot.targetId === null || int(shot.targetId, 1, g.nextUnitId - 1)) && (shot.targetBase === null || teams.includes(shot.targetBase)), '弹药目标');
    check(shot.maxRange === Infinity || num(shot.maxRange), '弹药射程');
    if (version >= 6 && shot.field != null) {
      const field = shot.field;
      check(object(field) && ['fire', 'oil'].includes(field.kind), '弹药地面效果');
      numbers(field, ['radius', 'remaining', 'duration', 'tickCooldown', 'tickInterval', 'damage', 'slow']);
      check(num(field.tickInterval, RULES.fixedStep, 10) && num(field.duration, RULES.fixedStep, 60) && field.remaining <= field.duration && field.slow > 0 && field.slow <= 1, '弹药地面效果进度');
    }
    if (shot.turretType !== undefined) check(member(shot.turretType, TURRETS), '弹药来源');
  }
  list(g.fields, 128, '地面效果');
  for (const field of g.fields) {
    check(object(field) && ['fire', 'oil'].includes(field.kind) && teams.includes(field.team), '地面效果类型');
    numbers(field, ['x', 'radius', 'remaining', 'duration', 'tickCooldown', 'tickInterval', 'damage', 'slow']);
    check(num(field.tickInterval, RULES.fixedStep, 10) && num(field.duration, RULES.fixedStep, 60) && field.remaining <= field.duration && field.slow > 0 && field.slow <= 1, '地面效果进度');
  }
  list(g.effects, 2048, '视觉效果');
  for (const effect of g.effects) {
    check(object(effect) && ['impact','evolve','pierce','meteor','volley','airstrike','orbital'].includes(effect.kind), '视觉效果类型');
    numbers(effect, ['x', 'life', 'duration']);
    check(effect.duration > 0 && effect.life <= effect.duration, '视觉效果时长');
    if (['impact', 'evolve', 'pierce'].includes(effect.kind)) check(teams.includes(effect.team), '效果阵营');
    if (effect.kind === 'impact') {
      numbers(effect, ['y', 'angle'], ['anchorX'], -RULES.width, RULES.width * 2);
      numbers(effect, [], ['radius']);
      if (effect.followTargetId != null) check(int(effect.followTargetId, 1, g.nextUnitId - 1), '命中跟踪目标');
      check(['stone','rubble','arrow','egg','fire','oil','bullet','solid','explosion','plasma','rail','laser','ion','blunt','bite','slash','thrust','knife','blade'].includes(effect.style), '命中效果');
      check(['stone','metal','soft'].includes(effect.surface), '命中材质');
    } else if (effect.kind === 'pierce') numbers(effect, ['toX', 'y'], [], -RULES.width, RULES.width * 2);
    else if (effect.kind !== 'evolve') numbers(effect, ['radius']);
  }
  check(g.ability === null || object(g.ability), '技能');
  if (g.ability) {
    check(member(g.ability.type, ABILITIES), '技能类型');
    if (version >= 6) {
      const expected = attributes(g, { kind: 'ability', type: g.ability.type, team: 'player' });
      const snapshot = g.ability.stats;
      check(object(snapshot) && Object.keys(snapshot).length === Object.keys(expected).length, '技能属性快照');
      for (const [key, base] of Object.entries(expected)) {
        const definition = STAT_DEFINITIONS[key];
        check(definition ? definition.boolean ? bool(snapshot[key]) : num(snapshot[key], definition.min, definition.max) : snapshot[key] === base, '技能快照属性');
      }
    }
    numbers(g.ability, ['remaining', 'wavesLeft', 'x']);
    check(g.ability.x <= RULES.width && int(g.ability.wavesLeft, 0, 4), '技能进度');
  }
  check(object(g.ai) && bool(g.ai.enabled) && ['balanced', 'siege'].includes(g.ai.strategy), '电脑状态');
  numbers(g.ai, ['cooldown', 'orders', 'waves']);
  return session;
}

export function validateSession(session) { return validateRecord(session); }

export function serializeSession(session) {
  validateSession(session);
  return JSON.stringify(session, (key, value) => key === 'maxRange' && value === Infinity ? 'unbounded' : value);
}
export function parseSession(text) {
  check(typeof text === 'string' && text.length <= MAX_SAVE_BYTES, '文件大小');
  const session = JSON.parse(text, (key, value) => key === 'maxRange' && value === 'unbounded' ? Infinity : value);
  if (session?.version === 1) {
    // Validate the complete old record before introducing any defaults. Never
    // rerun settlement or starting-resource grants while upgrading a save.
    validateRecord(session, 1);
    const auto = session.permanent.automation;
    session.permanent.automation = { ...createAutomation(), unlocked: auto.unlocked, enabled: auto.enabled, target: auto.target };
    session.permanent.totalLegacy = session.permanent.completedCycles * SURFACE.legacyPerCycle;
    session.permanent.talents = Object.fromEntries(Object.keys(V2_TALENTS).map(key => [key, 0]));
    session.run.talents = { ...session.permanent.talents };
    session.run.autoTurn = 'recruit'; session.game.modifiers.bounty = 1;
    session.version = 2;
  }
  if (session?.version === 2) {
    validateRecord(session, 2);
    const p = session.permanent;
    // Preserve formerly free recruitment and budget controls without inventing
    // earned currency or retroactively charging the player's balance.
    p.talentGrants = p.automation.unlocked ? ['autobuyer', 'logistics'] : [];
    const retained = { autobuyer: Number(p.automation.unlocked), logistics: Number(p.automation.unlocked) };
    p.talents = { ...retained, ...p.talents };
    session.run.talents = { ...retained, ...session.run.talents };
    session.version = 3;
  }
  if (session?.version === 3) {
    validateRecord(session, 3);
    const p = session.permanent;
    // Old players could buy growth/legacy talents without Autobuyer. Preserve
    // these purchases and their balance by granting the newly required root.
    if (!p.talents.autobuyer && (Object.values(p.upgrades).some(level => level > 0) || Object.values(p.talents).some(level => level > 0))) {
      p.talents.autobuyer = session.run.talents.autobuyer = 1;
      p.talentGrants.push('autobuyer');
      p.automation.unlocked = true; // Remains off unless the player enables it.
    }
    session.version = 4;
  }
  if (session?.version === 4) {
    validateRecord(session, 4);
    session.permanent.talents.challenge = session.run.talents.challenge = 0;
    session.run.challengeLevel = 0;
    session.game.enemyModifiers = getChallengeModifiers(0);
    session.version = 5;
  }
  if (session?.version === 5) {
    validateRecord(session, 5);
    const g = session.game;
    g.bonuses = getRunBonuses(session.run);
    // v5 stored raw outgoing damage and multiplied it on impact. v6 snapshots
    // the resolved attack at launch; convert in-flight payloads exactly once.
    for (const shot of g.projectiles) {
      shot.damage *= shot.team === 'enemy' ? g.enemyModifiers.damage : 1;
      if (shot.turretType) shot.field = projectileField(attributes(g, { type: shot.turretType, team: shot.team }));
    }
    for (const field of g.fields) field.damage *= field.team === 'enemy' ? g.enemyModifiers.damage : 1;
    for (const team of teams) {
      for (const order of g.queues[team]) order.duration = UNITS[order.type].trainTime;
      for (const turret of g.turrets[team]) if (turret) turret.paid = TURRETS[turret.type].cost;
    }
    if (g.ability) g.ability.stats = { ...attributes(g, { kind: 'ability', type: g.ability.type, team: 'player' }) };
    delete g.modifiers; delete g.enemyModifiers;
    session.version = SAVE_VERSION;
  }
  validateSession(session);
  session.game.bonuses = createBonusStack(session.game.bonuses);
  if (session.run.extraBonuses) session.run.extraBonuses = createBonusStack(session.run.extraBonuses);
  return session;
}

// Both permanent rewards and the settlement marker are committed in ONE record.
// A corrupt/unknown record blocks automatic writes until explicit recovery/import/reset.
export function createSaveStore(getStorage = () => globalThis.localStorage, { debug = false } = {}) {
  const saveKey = debug ? DEBUG_SAVE_KEY : SAVE_KEY, backupKey = `${saveKey}.backup`;
  let blocked = false, observed = null;
  function checkMode(session) {
    check((session.debug === true) === debug, '正式存档与调试存档不能互相导入');
    return session;
  }
  const parse = raw => checkMode(parseSession(raw));
  const valid = raw => { try { return raw ? parse(raw) : null; } catch { return null; } };
  const errorResult = error => ({ ok: false, error: error.message || '本地存储不可用，请导出存档。' });
  function load() {
    try {
      const storage = getStorage();
      observed = storage.getItem(saveKey);
      const backupRaw = storage.getItem(backupKey), backup = valid(backupRaw);
      if (observed === null && backupRaw === null) return { session: null, ok: true };
      try { return { session: parse(observed), ok: true, migrated: JSON.parse(observed).version !== SAVE_VERSION }; }
      catch (error) { blocked = true; return { ...errorResult(error), session: null, backupAvailable: Boolean(backup), blocked: true }; }
    } catch (error) { return { ...errorResult(error), session: null }; }
  }
  function write(session, replace = false) {
    try {
      if (blocked && !replace) throw new Error('原存档已受保护：请恢复备份、导入有效存档或明确清空后再保存。');
      const raw = serializeSession(checkMode(session)), storage = getStorage();
      const previous = storage.getItem(saveKey);
      if (!replace && previous !== observed) {
        blocked = true;
        throw new Error('另一页面已更新存档。请刷新读取最新进度；当前进度可先导出。');
      }
      if (valid(previous)) storage.setItem(backupKey, previous);
      storage.setItem(saveKey, raw);
      observed = raw; blocked = false;
      return { ok: true };
    } catch (error) { return errorResult(error); }
  }
  return {
    load, save: session => write(session), replace: session => write(session, true),
    recover() {
      try {
        const session = parse(getStorage().getItem(backupKey));
        const result = write(session, true);
        return { ...result, session: result.ok ? session : null };
      } catch (error) { return errorResult(error); }
    },
    clear(session) {
      try {
        const raw = serializeSession(checkMode(session)), storage = getStorage();
        // Do not report a failed reset after having already replaced the main record.
        storage.removeItem(backupKey);
        storage.setItem(saveKey, raw);
        observed = raw; blocked = false;
        return { ok: true };
      } catch (error) { return errorResult(error); }
    },
  };
}
