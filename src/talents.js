import { SURFACE, UPGRADES, UPGRADE_COSTS } from './progression-config.js';

export const TALENT_VALUES = Object.freeze({ startingGold: 150, bountyPerLevel: 0.25, legacyMultiplierPerLevel: 0.5 });
// All talents are bought between runs and snapshotted when a civilization starts.
// Historical prices participate in the save ledger; repricing needs a migration.
export const TALENTS = Object.freeze({
  autobuyer: { name: 'Autobuyer', branch: 'root', costs: [1], requires: {},
    effects: ['自动购买未解锁', '解锁基础自动招募与三条天赋路线'] },
  logistics: { name: '后勤调度', branch: 'automation', costs: [1], requires: { autobuyer: 1 },
    effects: ['使用默认预算与队列', '自定义预留金币、队列上限与购买优先级'] },
  formation: { name: '编队协议', branch: 'automation', costs: [1], requires: { autobuyer: 1 },
    effects: ['单一兵种', '按前排／远程／重型比例补员'] },
  evolution: { name: '技术托管', branch: 'automation', costs: [2], requires: { formation: 1 },
    effects: ['手动进化', '经验达标时自动进化'] },
  defense: { name: '防御工程', branch: 'automation', costs: [2, 4], requires: { formation: 1 },
    effects: ['手动建塔', '自动建塔与炮位扩容', '可按半价退款替换旧时代炮塔'] },
  elite: { name: '精锐征召', branch: 'automation', costs: [3], requires: { evolution: 1 },
    effects: ['手动招募超级士兵', '未来时代自动维持指定精锐数量'] },
  supply: { name: '重建储备', branch: 'growth', costs: [1, 2, 4], requires: { production: 1 },
    effects: Array.from({ length: 4 }, (_, level) => `起始金币 +${level * TALENT_VALUES.startingGold}`) },
  salvage: { name: '战利品回收', branch: 'growth', costs: [2, 4, 8], requires: { warfare: 1 },
    effects: Array.from({ length: 4 }, (_, level) => `击杀金币 ×${1 + level * TALENT_VALUES.bountyPerLevel}`) },
  conservation: { name: '遗产保存', branch: 'legacy', costs: [2, 4, 8], requires: { autobuyer: 1 },
    effects: Array.from({ length: 4 }, (_, level) => `终局基础遗产 ${SURFACE.legacyPerCycle + level}`) },
  continuity: { name: '文明传承', branch: 'legacy', costs: [6, 12], requires: { conservation: 2 },
    effects: Array.from({ length: 3 }, (_, level) => `终局遗产 ×${1 + level * TALENT_VALUES.legacyMultiplierPerLevel}`) },
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
  if (!session.permanent.completedCycles) return 'locked';
  if (!['destruction', 'defeat'].includes(session.run.phase)) return 'during-run';
  const config = TALENTS[key], level = talentLevel(session, key);
  if (level >= config.costs.length) return 'max';
  if (Object.entries(config.requires).some(([parent, required]) => talentLevel(session, parent) < required)) return 'prerequisite';
  return session.permanent.legacy >= config.costs[level] ? 'ready' : 'legacy';
}
export function purchaseTalent(session, key) {
  if (getTalentState(session, key) !== 'ready') return false;
  session.permanent.legacy -= TALENTS[key].costs[session.permanent.talents[key]];
  session.permanent.talents[key]++;
  if (key === 'autobuyer') session.permanent.automation.unlocked = true;
  return true;
}
export function getTalentBonuses(talents) {
  return { startingGold: talents.supply * TALENT_VALUES.startingGold,
    bounty: 1 + talents.salvage * TALENT_VALUES.bountyPerLevel };
}
export function getLegacyReward(talents) {
  return Math.floor((SURFACE.legacyPerCycle + talents.conservation) *
    (1 + talents.continuity * TALENT_VALUES.legacyMultiplierPerLevel));
}
export function getTalentSpending(talents, grants = []) {
  return Object.entries(TALENTS).reduce((sum, [key, config]) =>
    sum + (grants.includes(key) ? 0 : config.costs.slice(0, talents[key]).reduce((total, cost) => total + cost, 0)), 0);
}
