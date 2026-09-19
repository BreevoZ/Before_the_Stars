import { Q } from './quantity.js';
export { purchaseTalent } from './progression.js';
import { SUPER_WEAPONS } from './game-config.js';
import { TRAITS, TRAIT_VALUES as V } from './traits.js';
import { isBetweenRuns } from './progression-machine.js';
import { SURFACE, UPGRADES, UPGRADE_COSTS, TALENT_PRICES as PRICES, CHALLENGE, TALENT_LAYER_REQUIREMENT, UNIT_TALENT_COSTS, LEGACY_ECONOMY as ECONOMY, doublingCosts } from './progression-config.js';
import { resolveStatValue, STAT_DEFINITIONS } from './stats.js';

export const TALENT_VALUES = Object.freeze({ startingGold: 150, bountyPerLevel: 0.25 });
// All talents are bought between runs and snapshotted when a civilization starts.
// Historical prices participate in the save ledger; repricing needs a migration.
const percent = value => `${Math.round(value * 10000) / 100}%`;
export const TRAIT_DESCRIPTIONS = Object.freeze({
  openingStone: `首次接敌前投石 · ${percent(V.stone)} 攻击伤害`,
  ricochet: `石弹命中后跳向后方一人 · ${percent(V.ricochet)} 伤害`,
  devour: `击杀时恢复 ${percent(V.devour)} 最大生命`,
  shieldWall: `停止前进时，单体远程减伤由 30% 提高至 ${percent(V.shield)}`,
  fireArrow: `箭矢命中留下半径 ${V.fireRadius} 的火场 · 每 0.5 秒造成 ${percent(V.fireDamage)} 攻击伤害，持续 ${V.fireDuration} 秒`,
  javelin: `冲锋接敌前投枪 · ${percent(V.javelin)} 攻击伤害`,
  parry: `接敌蓄势 ${V.parryCooldown} 秒后，每 ${V.parryCooldown} 秒格挡一次近战攻击，并以 ${percent(V.counter)} 攻击反击 · 收势 ${V.parryRecovery} 秒`,
  volley: `至少 3 名火枪手同时在场时，伤害 +${percent(V.volley - 1)}`,
  canister: `${V.canisterRange} 距离内使用扇形霰弹 · ${percent(V.canister)} 伤害，最多贯穿后方 3 人`,
  grenade: `首次接敌投掷手雷 · ${percent(V.grenade)} 伤害，半径 ${V.grenadeRadius}`,
  suppression: `命中使目标减速 ${percent(1 - V.suppression)}，持续 ${V.suppressionDuration} 秒`,
  coaxial: `攻击时向 ${V.coaxialRange} 距离内敌人追加机枪射击 · ${percent(V.coaxial)} 伤害`,
  blink: `首次接敌时瞬步至近战距离 · 不穿越友军`,
  overload: `每第 ${V.overloadEvery} 发穿透后方最多 2 人 · ${percent(V.overloadDamage)} 次级伤害`,
  forceField: `替 ${V.forceRadius} 距离内友军吸收 ${percent(V.forceShare)} 实际伤害 · 不叠加、不递归`,
});
export const TALENTS = Object.freeze({
  spark: { name: '文明火种', branch: 'root', costs: PRICES.spark, requires: {},
    effects: ['游戏速度 1×', '解锁 1× / 2× 速度切换 · 自动招募在累计通关 2 次后免费解锁'] },
  logistics: { name: '后勤调度', branch: 'automation', costs: PRICES.logistics, requires: { spark: 1 },
    effects: ['使用默认预算与队列', '自定义预留金币、队列上限与购买优先级'] },
  formation: { name: '编队协议', branch: 'automation', costs: PRICES.formation, requires: { spark: 1 },
    effects: ['单一兵种', '按前排／远程／重型比例补员'] },
  evolution: { name: '技术托管', branch: 'automation', costs: PRICES.evolution, requires: { formation: 1 },
    effects: ['手动进化', '经验达标时自动进化'] },
  defense: { name: '防御工程', branch: 'automation', costs: PRICES.defense, requires: { formation: 1 },
    effects: ['手动建塔', '自动建塔与炮位扩容', '可按半价退款替换旧时代炮塔'] },
  elite: { name: '精锐征召', branch: 'automation', costs: PRICES.elite, requires: { superSoldierPlan: 1 },
    effects: ['手动招募超级士兵', '未来时代自动维持指定精锐数量'] },
  supply: { name: '重建储备', branch: 'growth', costs: PRICES.supply, requires: { production: 1 },
    effects: Array.from({ length: 4 }, (_, level) => `起始金币 +${level * TALENT_VALUES.startingGold}`) },
  salvage: { name: '战利品回收', branch: 'growth', costs: PRICES.salvage, requires: { warfare: 1 },
    effects: Array.from({ length: 4 }, (_, level) => `击杀金币 ×${1 + level * TALENT_VALUES.bountyPerLevel}`) },
  conservation: { name: '遗产保存', branch: 'legacy', costs: doublingCosts(ECONOMY.conservationCost, ECONOMY.rewardRanks), requires: { spark: 1 },
    effects: Array.from({ length: ECONOMY.rewardRanks + 1 }, (_, level) => `终局遗产 ×${2 ** level} · 与文明传承相乘`) },
  challenge: { name: '余烬远征', branch: 'legacy', costs: PRICES.challenge, requires: { conservation: 1 },
    effects: ['初生之地循环', `通关后踏入下一片余烬；敌军逐步强化，通关遗产随远征深度提升，最多 ${CHALLENGE.maxLevel} 次深入`] },
  continuity: { name: '文明传承', branch: 'legacy', costs: doublingCosts(ECONOMY.continuityCost, ECONOMY.rewardRanks), requires: { conservation: 2 },
    effects: Array.from({ length: ECONOMY.rewardRanks + 1 }, (_, level) => `终局遗产 ×${2 ** level} · 与遗产保存相乘`) },
  legacyMachine: { name: '遗产生产机', branch: 'legacy', costs: [ECONOMY.producerCost], requires: { conservation: 2 }, requiresLayer: 3,
    effects: ['尚未生产遗产', `战斗中每 ${ECONOMY.productionSeconds} 模拟秒生产 1 Legacy · 暂停／离线／结算时停止`] },
  legacyCapacity: { name: '平行档案', branch: 'legacy', costs: doublingCosts(ECONOMY.capacityCost, ECONOMY.capacityRanks), requires: { legacyMachine: 1 },
    effects: Array.from({ length: ECONOMY.capacityRanks + 1 }, (_, level) => `单次产量 ${2 ** level} Legacy · 每级翻倍`) },
  legacyEfficiency: { name: '回响加速', branch: 'legacy', costs: doublingCosts(ECONOMY.efficiencyCost, ECONOMY.efficiencyRanks), requires: { legacyMachine: 1 },
    effects: Array.from({ length: ECONOMY.efficiencyRanks + 1 }, (_, level) => `生产速度 ×${2 ** level} · 每 ${ECONOMY.productionSeconds / 2 ** level} 模拟秒生产一次`) },
  ...Object.fromEntries(Object.values(TRAITS).map(trait => {
    const layer = ['melee', 'archer', 'heavy'].includes(trait.units[0]) ? 1 : ['swordsman', 'crossbow', 'knight'].includes(trait.units[0]) ? 2 : ['duelist', 'musketeer', 'cannoneer'].includes(trait.units[0]) ? 3 : ['commando', 'rifleman', 'tank'].includes(trait.units[0]) ? 4 : 5;
    return [trait.id, { name: trait.name, branch: 'units', layer, unit: trait.units[0], costs: [UNIT_TALENT_COSTS[layer - 1]], requires: layer === 1 ? { spark: 1 } : {}, requiresLayer: layer > 1 ? layer - 1 : undefined,
      effects: ['基础作战方式', TRAIT_DESCRIPTIONS[trait.id]] }];
  })),
  timeAcceleration: { name: '时间加速', branch: 'growth', layer: 4, costs: PRICES.timeAcceleration, requires: { spark: 1 }, requiresLayer: 3,
    effects: ['最高速度 2×', '解锁 3× 游戏速度'] },
  superSoldierPlan: { name: '超级士兵计划', branch: 'units', layer: 6, costs: PRICES.superSoldierPlan, requires: {}, requiresLayer: 5,
    effects: ['超级士兵未开放', '未来时代可招募超级士兵 · 全覆轻甲与激光短匕首'] },
  superRanged: { name: '狙击激光枪', branch: 'units', layer: 7, costs: PRICES.superRanged, requires: { superSoldierPlan: 1 },
    effects: ['仅贴身激光匕首', `${SUPER_WEAPONS.sniper.range} 射程 / ${SUPER_WEAPONS.sniper.damage} 穿甲伤害 · 锁定 ${SUPER_WEAPONS.sniper.chargeTime} 秒，开火后冷却 ${SUPER_WEAPONS.sniper.attackInterval} 秒 · 近身改用匕首`] },
  bypasser: { name: 'Great Filter Bypasser', branch: 'legacy', layer: 8, costs: PRICES.bypasser, requires: { superSoldierPlan: 1 },
    effects: ['地表文明的最后一道门槛', '终局后购买，立即启航至 VI 轨道文明 · 地表篇完成，轨道建设待后续开放'] },

});
// The diagram and purchasing rules share the same prerequisites. Branch names
// group descendants visually; they are not extra purchases or separate pages.
export const TALENT_BRANCHES = Object.freeze({ automation: '自动化', growth: '文明增益', legacy: '遗产收益' });
export const TALENT_TREE = Object.freeze({ ...TALENTS, ...Object.fromEntries(Object.entries(UPGRADES).map(([key, config]) => [key, {
  ...config, branch: 'growth', costs: UPGRADE_COSTS,
  effects: Array.from({ length: UPGRADE_COSTS.length + 1 }, (_, level) => `${config.description} ×${config.base ** level}`),
}])) });
export function emptyTalents() { return Object.fromEntries(Object.keys(TALENTS).map(key => [key, 0])); }
export function talentLevel(session, key, active = false) {
  const source = active ? session.run : session.permanent;
  return source.talents[key] ?? source.upgrades[key] ?? 0;
}
export function getTalentState(session, key) {
  if (!Object.hasOwn(TALENTS, key)) return 'invalid';
  if (TALENTS[key].placeholder) return 'planned';
  if (!session.permanent.completedCycles) return 'locked';
  if (!isBetweenRuns(session.run.phase)) return 'during-run';
  const config = TALENTS[key], level = talentLevel(session, key);
  if (level >= config.costs.length) return 'max';
  if (key === 'bypasser' && session.run.phase !== 'destruction') return 'victory-required';
  if (!meetsTalentRequirements({ ...session.permanent.talents, ...session.permanent.upgrades }, config)) return 'prerequisite';
  return Q.gte(session.permanent.legacy, config.costs[level]) ? 'ready' : 'legacy';
}
export function getTalentBonuses(talents) {
  return { startingGold: talents.supply * TALENT_VALUES.startingGold,
    bounty: 1 + talents.salvage * TALENT_VALUES.bountyPerLevel };
}
export function getLegacyBonuses(talents, challengeLevel = 0, rules = ECONOMY.rules) {
  return [
    ['conservation', '遗产保存', 'doctrine', rules < 10 ? 'add' : 'multiply', rules < 10 ? talents.conservation : 2 ** talents.conservation],
    ['continuity', '文明传承', 'doctrine', 'multiply', (rules < 10 ? 1 + talents.continuity * 0.5 : 2 ** talents.continuity)],
    ['challenge:legacy', '挑战遗产', 'challenge', 'multiply', challengeLevel + 1],
  ].map(([id, label, kind, type, value]) => ({ target: { stat: 'legacy', kind: 'civilization' }, type, value, source: { id, label, kind } }));
}
export function getLegacyReward(talents, challengeLevel = 0, rules = ECONOMY.rules) {
  return resolveStatValue(SURFACE.legacyPerCycle, getLegacyBonuses(talents, challengeLevel, rules), STAT_DEFINITIONS.legacy);
}
export function getTalentSpending(talents, grants = []) {
  return Object.entries(TALENTS).reduce((sum, [key, config]) =>
    sum + (grants.includes(key) ? 0 : config.costs.slice(0, talents[key]).reduce((total, cost) => total + cost, 0)), 0);
}

export function layerTalents(layer) { return Object.entries(TALENTS).filter(([, config]) => config.branch === 'units' && config.layer === layer && config.unit).map(([key]) => key); }
export function meetsTalentRequirements(levels, config) {
  return Object.entries(config.requires).every(([key, required]) => (levels[key] ?? 0) >= required) &&
    (!config.requiresLayer || layerTalents(config.requiresLayer).filter(key => levels[key] > 0).length >= TALENT_LAYER_REQUIREMENT);
}
export function talentPrerequisiteText(config) {
  const specific = Object.entries(config.requires).map(([key, rank]) => `${TALENT_TREE[key].name} ${rank} 级`);
  if (config.requiresLayer) specific.push(`第 ${config.requiresLayer} 时代层至少 ${TALENT_LAYER_REQUIREMENT} 个兵种天赋`);
  return specific.join('；') || '根节点 · 一切从这里开始';
}
