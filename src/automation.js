import { Q } from './quantity.js';
import { AGES, UNITS, TURRETS, RULES, getRecruitState, recruit, getEvolutionState, evolve,
  getTurretState, buildTurret, getExpansionState, expandTurretSlots, sellTurret } from './game.js';
import { stat, STAT_DEFINITIONS } from './stats.js';
import { getExpansionCost, getTurretRefund } from './game.js';
import { AUTOMATION_INTERVAL, AUTOMATION_TARGETS, SURFACE } from './progression-config.js';

// Reserve is a nonnegative integral quantity, bounded by the quantity format.
export const AUTOMATION_MAX_RESERVE = Q.of("1e8999999999999999");
export function createAutomation() {
  return { unlocked: false, enabled: false, target: 'front', recruitEnabled: true,
    mode: 'single', weights: [2, 2, 1], reserve: 0, queueLimit: RULES.queueLimit,
    priority: 'balanced', evolve: false, defense: false, turretTarget: 0,
    maxTurrets: 1, expand: false, replace: false, elite: false, eliteLimit: 1 };
}
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
export function validAutomation(auto, talents, previousVersion = false) {
  if (!auto || typeof auto !== 'object' || Array.isArray(auto)) return false;
  if (Object.keys(auto).length !== Object.keys(createAutomation()).length) return false;
  if (!['unlocked', 'enabled', 'recruitEnabled', 'evolve', 'defense', 'expand', 'replace', 'elite']
    .every(key => typeof auto[key] === 'boolean')) return false;
  if (!AUTOMATION_TARGETS.includes(auto.target) || !['single', 'balanced'].includes(auto.mode) ||
    !['balanced', 'recruit', 'defense'].includes(auto.priority)) return false;
  if (!Q.isInteger(auto.reserve) || Q.lt(auto.reserve, 0) || !integer(auto.queueLimit, 1, STAT_DEFINITIONS.queueLimit.max) ||
    !integer(auto.turretTarget, 0, 2) || !integer(auto.maxTurrets, 1, RULES.maxTurretSlots) || !integer(auto.eliteLimit, 1, 3)) return false;
  if (!Array.isArray(auto.weights) || auto.weights.length !== 3 || !auto.weights.every(weight => integer(weight, 0, 10)) ||
    !auto.weights.some(weight => weight > 0)) return false;
  const logistics = talents.logistics > 0 || previousVersion;
  return (previousVersion || auto.unlocked === (talents.autobuyer > 0)) &&
    (logistics || (Q.eq(auto.reserve, 0) && auto.queueLimit === RULES.queueLimit && auto.priority === 'balanced' && auto.recruitEnabled)) &&
    (auto.unlocked || !auto.enabled) && (auto.mode !== 'balanced' || talents.formation > 0) &&
    (!auto.evolve || talents.evolution > 0) && (!auto.defense || talents.defense > 0) &&
    (!auto.expand || talents.defense > 0) && (!auto.replace || talents.defense > 1) && (!auto.elite || talents.elite > 0);
}
export function configureAutomation(session, patch) {
  if (!session.permanent.automation.unlocked || !patch || typeof patch !== 'object' || Array.isArray(patch) ||
    Object.keys(patch).some(key => key === 'unlocked' || !Object.hasOwn(createAutomation(), key))) return false;
  const next = { ...session.permanent.automation, ...patch };
  try { next.reserve = Q.of(next.reserve); } catch { return false; }
  if (!validAutomation(next, session.permanent.talents)) return false;
  next.weights = [...next.weights];
  session.permanent.automation = next;
  session.run.autoElapsed = 0;
  return true;
}

const inactive = (state, label) => ({ state, label });
function budget(session, plan) {
  const available = Q.max(0, Q.sub(session.game.gold.player, session.permanent.automation.reserve));
  return { ...plan, state: Q.canAfford(available, plan.cost) ? 'ready' : 'budget',
    label: `${Q.canAfford(available, plan.cost) ? '待执行' : '储蓄中'} · ${plan.label} · ${Q.format(plan.cost)} 金币（预留外可用 ${Q.format(Q.floor(available))}）` };
}
function recruitPlan(session) {
  const { game, run, permanent: { automation: auto } } = session;
  if (!auto.recruitEnabled) return inactive('off', '招募已关闭');
  if (game.queues.player.length >= Math.min(auto.queueLimit, stat(game, 'player', 'queueLimit'))) return inactive('blocked', '等待训练队列腾出位置');
  const army = [...game.units.filter(unit => unit.team === 'player'), ...game.queues.player];
  if (army.length >= stat(game, 'player', 'armyLimit')) return inactive('blocked', '已达兵力上限');
  let type;
  if (auto.elite && run.talents.elite && game.ages.player === SURFACE.finalEnemyAge && stat(game, { type: 'superSoldier', team: 'player' }, 'enabled') &&
    army.filter(unit => unit.type === 'superSoldier').length < auto.eliteLimit) type = 'superSoldier';
  else {
    let index = AUTOMATION_TARGETS.indexOf(auto.target);
    if (auto.mode === 'balanced' && run.talents.formation) {
      // Include paid orders and old-era troops, so one queue cannot skew the mix.
      const counts = ['melee', 'archer', 'heavy'].map(role => army.filter(unit =>
        !UNITS[unit.type].playerOnly && UNITS[unit.type].role === role).length);
      const total = counts.reduce((a, b) => a + b, 0), weight = auto.weights.reduce((a, b) => a + b, 0);
      const deficits = auto.weights.map((value, i) => value && stat(game, { type: AGES[game.ages.player].units[i], team: 'player' }, 'enabled')
        ? (total + 1) * value / weight - counts[i] : -Infinity);
      if (deficits.every(value => value === -Infinity)) return inactive('blocked', '编队兵种在本轮被禁用');
      index = deficits.indexOf(Math.max(...deficits));
    }
    type = AGES[game.ages.player].units[index];
  }
  const state = getRecruitState(game, type);
  if (!['ready', 'gold'].includes(state)) return inactive('blocked', '等待可招募条件');
  return budget(session, { kind: 'recruit', type, cost: stat(game, { type, team: 'player' }, 'cost'), label: UNITS[type].name });
}
function defensePlan(session) {
  const { game, run, permanent: { automation: auto } } = session;
  if (!auto.defense || !run.talents.defense) return inactive('off', '建塔已关闭');
  if (!stat(game, 'player', 'canBuild')) return inactive('blocked', '本轮禁止建塔');
  const towers = game.turrets.player, type = AGES[game.ages.player].turrets[auto.turretTarget];
  const slot = towers.findIndex((tower, i) => !tower && i < Math.min(auto.maxTurrets, stat(game, 'player', 'maxTurretSlots')));
  if (slot !== -1 && ['ready', 'gold'].includes(getTurretState(game, 'player', type, slot))) {
    return budget(session, { kind: 'build', type, slot, cost: stat(game, { type, team: 'player' }, 'cost'), label: `炮位 ${slot + 1} · ${TURRETS[type].name}` });
  }
  if (auto.expand && stat(game, { type, team: 'player' }, 'enabled') && towers.length < auto.maxTurrets && ['ready', 'gold'].includes(getExpansionState(game))) {
    return budget(session, { kind: 'expand', type, slot: towers.length,
      cost: Q.add(getExpansionCost(game), stat(game, { type, team: 'player' }, 'cost')), label: `扩容并建造${TURRETS[type].name}` });
  }
  if (auto.replace && run.talents.defense >= 2) {
    const outdated = towers.findIndex((tower, i) => i < Math.min(auto.maxTurrets, stat(game, 'player', 'maxTurretSlots')) && tower && TURRETS[tower.type].age < game.ages.player);
    if (outdated !== -1 && stat(game, { type, team: 'player' }, 'enabled')) return budget(session, { kind: 'replace', type, slot: outdated,
      cost: Q.sub(stat(game, { type, team: 'player' }, 'cost'), getTurretRefund(game, towers[outdated])), label: `替换炮位 ${outdated + 1} · ${TURRETS[type].name}（净支出）` });
  }
  return inactive('complete', '防御目标已满足');
}

// Shared read-only planning keeps the controls' explanation in sync with spending.
export function getAutomationPlan(session) {
  const auto = session.permanent.automation;
  if (!auto.unlocked) return { status: '在天赋树中解锁 Autobuyer 根节点', action: null };
  if (!auto.enabled) return { status: '自动购买已关闭', action: null };
  if (!session.run.talents.autobuyer || session.run.phase !== 'battle' || session.game.status !== 'playing') return { status: '下一轮开始后执行', action: null };
  const plans = { recruit: recruitPlan(session), defense: defensePlan(session) };
  const first = auto.priority === 'balanced' ? session.run.autoTurn : auto.priority;
  const second = first === 'recruit' ? 'defense' : 'recruit';
  const actionable = plan => ['ready', 'budget'].includes(plan.state);
  const source = actionable(plans[first]) ? first : actionable(plans[second]) ? second : null;
  const plan = source ? plans[source] : null;
  return { plans, status: plan ? plan.label : `${plans.recruit.label}；${plans.defense.label}`, action: plan, source };
}

export function updateAutomation(session, dt, { paused = false, hidden = false } = {}) {
  const { permanent, run, game } = session, auto = permanent.automation;
  if (paused || hidden || run.phase !== 'battle' || game.status !== 'playing' ||
      !auto.unlocked || !run.talents.autobuyer || !auto.enabled || !Number.isFinite(dt) || dt <= 0) return;
  run.autoElapsed += Math.min(dt, 0.05);
  if (run.autoElapsed + 1e-9 < AUTOMATION_INTERVAL) return;
  run.autoElapsed = Math.max(0, run.autoElapsed - AUTOMATION_INTERVAL);
  if (auto.evolve && run.talents.evolution && game.ages.player < SURFACE.finalEnemyAge && getEvolutionState(game) === 'ready') evolve(game);
  const { action, source } = getAutomationPlan(session);
  if (!action || action.state !== 'ready') return;
  let success = false;
  if (action.kind === 'recruit') success = recruit(game, action.type);
  if (action.kind === 'build') success = buildTurret(game, 'player', action.type, action.slot);
  // Reserve the entire transaction before either normal command runs.
  if (action.kind === 'expand' && expandTurretSlots(game)) success = buildTurret(game, 'player', action.type, action.slot);
  if (action.kind === 'replace' && sellTurret(game, action.slot)) success = buildTurret(game, 'player', action.type, action.slot);
  if (success) run.autoTurn = source === 'recruit' ? 'defense' : 'recruit';
}
