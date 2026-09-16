import { RULES, AGES, UNITS, TURRETS, ABILITIES } from './game.js';
import { SAVE_VERSION, SURFACE, UPGRADE_COSTS, AUTOMATION_TARGETS, AUTOMATION_INTERVAL, getBonuses } from './progression-config.js';
import { DEBUG_SPEEDS } from './debug.js';

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

export function validateSession(session) {
  check(object(session), '根记录');
  check(session.version === SAVE_VERSION, '不支持的存档版本');
  check(session.debug === undefined || session.debug === true, '调试标记');
  check(session.debug === true ? DEBUG_SPEEDS.includes(session.debugSpeed) : session.debugSpeed === undefined, '调试速度');
  safeTree(session);
  const { permanent: p, run, game: g } = session;
  check(object(p) && object(run) && object(g), '缺少永久、文明或战斗状态');
  check(int(p.completedCycles) && int(p.legacy) && p.legacy <= p.completedCycles * SURFACE.legacyPerCycle, '遗产或循环数');
  levels(p.upgrades); levels(run.upgrades);
  const spent = Object.values(p.upgrades).reduce((sum, level) => sum + UPGRADE_COSTS.slice(0, level).reduce((a, b) => a + b, 0), 0);
  check(p.legacy + spent === p.completedCycles * SURFACE.legacyPerCycle, '遗产收支不一致');
  const auto = p.automation;
  check(object(auto) && bool(auto.unlocked) && bool(auto.enabled) && AUTOMATION_TARGETS.includes(auto.target), '自动招募设置');
  check(auto.unlocked === (p.completedCycles > 0) && (auto.unlocked || !auto.enabled), '自动招募解锁');
  check(id(run.runId) && int(run.battleNumber, 1, SURFACE.finalEnemyAge) && run.battleId === `${run.runId}:${run.battleNumber}`, '文明或战斗标识');
  check(run.processedBattleId === null || (id(run.processedBattleId) && run.processedBattleId.startsWith(`${run.runId}:`)), '胜利处理标记');
  check(['battle', 'victory', 'destruction', 'defeat'].includes(run.phase) && bool(run.settled), '流程阶段');
  check(int(run.earnedLegacy, 0, SURFACE.legacyPerCycle), '本轮遗产');
  numbers(run, ['elapsed', 'autoElapsed']);
  check(run.autoElapsed < AUTOMATION_INTERVAL + 1e-8, '自动招募时钟');
  check(run.settled === (run.phase === 'destruction') && run.earnedLegacy === (run.settled ? SURFACE.legacyPerCycle : 0), '重复结算保护标记');
  check(!run.settled || p.completedCycles > 0, '已结算循环数');
  for (const key of Object.keys(p.upgrades)) check(run.upgrades[key] <= p.upgrades[key], '本轮升级快照');
  if (run.phase === 'battle' || run.phase === 'victory') {
    check(run.upgrades.production === p.upgrades.production && run.upgrades.warfare === p.upgrades.warfare, '战斗中升级');
  }
  check(g.mode === 'incremental' && object(g.modifiers), '战斗模式');
  const bonuses = getBonuses(run.upgrades);
  check(g.modifiers.income === bonuses.income && g.modifiers.experience === bonuses.experience, '本轮倍率');
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
    check(base.maxHp === AGES[g.ages[team]].baseHealth && num(base.hp, 0, base.maxHp) && num(base.hitFlash), '基地生命');
    list(g.queues[team], RULES.queueLimit, '训练队列');
    for (const order of g.queues[team]) {
      check(object(order) && member(order.type, UNITS) && int(order.id, 1, g.nextOrderId - 1) && !orderIds.has(order.id), '训练订单');
      orderIds.add(order.id);
      check(UNITS[order.type].age <= g.ages[team] && num(order.remaining, 0, UNITS[order.type].trainTime) && num(order.paid, 0, 10000), '订单进度或支付价格');
    }
    list(g.turrets[team], RULES.maxTurretSlots, '炮位');
    check(g.turrets[team].length >= 1, '缺少初始炮位');
    g.turrets[team].forEach((turret, slot) => {
      if (turret === null) return;
      check(object(turret) && member(turret.type, TURRETS) && turret.team === team && turret.slot === slot && TURRETS[turret.type].age <= g.ages[team], '炮塔');
      numbers(turret, ['cooldown', 'flash', 'shotSerial', 'aim', 'burstRemaining', 'chargeRemaining'], ['burstCooldown', 'flashDuration', 'lastBarrel'], -1, limit);
      for (const key of ['chargeTargetId', 'burstTargetId']) if (turret[key] != null) check(int(turret[key], 1, g.nextUnitId - 1), '炮塔目标');
    });
  }
  const lost = g.bases.player.hp === 0, won = g.bases.enemy.hp === 0;
  check(g.status === (lost && won ? 'draw' : lost ? 'lost' : won ? 'won' : 'playing'), '基地与胜负不一致');
  if (run.phase === 'destruction') check(g.ages.enemy === SURFACE.finalEnemyAge, '终局敌人');
  if (run.phase === 'victory') check(g.ages.enemy < SURFACE.finalEnemyAge, '普通战役终点');
  list(g.units, RULES.armyLimit * 2, '部队');
  for (const unit of g.units) {
    check(object(unit) && member(unit.type, UNITS) && teams.includes(unit.team) && int(unit.id, 1, g.nextUnitId - 1) && !unitIds.has(unit.id), '部队实体');
    unitIds.add(unit.id);
    check(UNITS[unit.type].age <= g.ages[unit.team] && num(unit.hp, Number.MIN_VALUE, UNITS[unit.type].health) && num(unit.x, 0, RULES.width) && bool(unit.moving), '部队属性');
    numbers(unit, ['attackCooldown', 'attackAnimation', 'hitFlash'], ['distanceTravelled', 'chargeTravel', 'guardFlash', 'attackApproach', 'moveMultiplier', 'burstRemaining', 'burstCooldown'], -1);
    if (unit.attackStyle !== undefined) check(['melee', 'ranged'].includes(unit.attackStyle), '攻击姿态');
    if (unit.lastAttackCharged !== undefined) check(bool(unit.lastAttackCharged), '冲锋');
    if (unit.burstTargetId != null) check(int(unit.burstTargetId, 1, g.nextUnitId - 1), '连发目标');
    if (unit.burstTargetBase != null) check(teams.includes(unit.burstTargetBase), '连发基地');
  }
  for (const team of teams) check(g.units.filter(unit => unit.team === team).length + g.queues[team].length <= RULES.armyLimit, '兵力上限');
  list(g.projectiles, 512, '弹药');
  for (const shot of g.projectiles) {
    check(object(shot) && teams.includes(shot.team) && ['sling','stone','boulder','arrow','bolt','egg','fireball','oil','bullet','cannon','shell','rocket','plasma','plasma-orb','rail','laser','ion'].includes(shot.kind), '弹药类型');
    numbers(shot, ['fromX', 'toX', 'fromY', 'toY', 'toOffsetX', 'originX'], ['fromUnitX', 'fromTurretX', 'fromBaseX', 'arc'], -RULES.width, RULES.width * 2);
    numbers(shot, ['damage', 'duration', 'remaining', 'splash', 'armorPierce', 'pierce'], ['pierceFactor', 'pierceDistance']);
    check(shot.duration > 0 && shot.remaining > 0 && shot.remaining <= shot.duration && bool(shot.ignoreArmor), '弹药进度');
    check((shot.targetId === null || int(shot.targetId, 1, g.nextUnitId - 1)) && (shot.targetBase === null || teams.includes(shot.targetBase)), '弹药目标');
    check(shot.maxRange === Infinity || num(shot.maxRange), '弹药射程');
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
    numbers(g.ability, ['remaining', 'wavesLeft', 'x']);
    check(g.ability.x <= RULES.width && int(g.ability.wavesLeft, 0, 4), '技能进度');
  }
  check(object(g.ai) && bool(g.ai.enabled) && ['balanced', 'siege'].includes(g.ai.strategy), '电脑状态');
  numbers(g.ai, ['cooldown', 'orders', 'waves']);
  return session;
}

export function serializeSession(session) {
  validateSession(session);
  return JSON.stringify(session, (key, value) => key === 'maxRange' && value === Infinity ? 'unbounded' : value);
}
export function parseSession(text) {
  check(typeof text === 'string' && text.length <= MAX_SAVE_BYTES, '文件大小');
  const session = JSON.parse(text, (key, value) => key === 'maxRange' && value === 'unbounded' ? Infinity : value);
  return validateSession(session);
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
      try { return { session: parse(observed), ok: true }; }
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
