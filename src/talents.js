import { SURFACE } from './progression-config.js';

export const TALENT_VALUES = Object.freeze({ startingGold: 150, bountyPerLevel: 0.25, legacyMultiplierPerLevel: 0.5 });
// All talents are bought between runs and snapshotted when a civilization starts.
// Historical prices participate in the save ledger; repricing needs a migration.
export const TALENTS = Object.freeze({
  formation: { name: '编队协议', branch: 'automation', costs: [1], requires: {},
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
  conservation: { name: '遗产保存', branch: 'legacy', costs: [2, 4, 8], requires: {},
    effects: Array.from({ length: 4 }, (_, level) => `终局基础遗产 ${SURFACE.legacyPerCycle + level}`) },
  continuity: { name: '文明传承', branch: 'legacy', costs: [6, 12], requires: { conservation: 2 },
    effects: Array.from({ length: 3 }, (_, level) => `终局遗产 ×${1 + level * TALENT_VALUES.legacyMultiplierPerLevel}`) },
});
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
export function getTalentSpending(talents) {
  return Object.entries(TALENTS).reduce((sum, [key, config]) =>
    sum + config.costs.slice(0, talents[key]).reduce((total, cost) => total + cost, 0), 0);
}
