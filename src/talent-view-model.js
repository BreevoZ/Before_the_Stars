import { UPGRADES } from './progression-config.js';
import { getUpgradeState } from './progression.js';
import { TALENT_TREE, getTalentState } from './talents.js';
const reasons = { locked: '首次通关后解锁', 'during-run': '本轮已启程 · 重建前可购买', prerequisite: '先点亮前置星辰', legacy: '遗产不足', max: '已满级', ready: '新文明开始时生效' };

export function buildTalentViewModel(session) {
  const { permanent: p } = session, view = {};
  const put = (id, value, prop = '') => { view[`#${id}${prop ? `@${prop}` : ''}`] = value; };
  for (const [name, config] of Object.entries(TALENT_TREE)) {
    const upgrade = Object.hasOwn(UPGRADES, name), level = upgrade ? p.upgrades[name] : p.talents[name];
    const state = (upgrade ? getUpgradeState : getTalentState)(session, name);
    put(`level-${name}`, '●'.repeat(level) + '○'.repeat(config.costs.length - level));
    put(`cost-${name}`, state === 'max' ? '完整' : `${config.costs[level]} ✧`);
    put(`current-${name}`, config.effects[level]); put(`next-${name}`, config.effects[level + 1] ?? '已达到最高等级');
    put(`grant-${name}`, !p.talentGrants.includes(name), 'hidden');
    put(`node-${name}`, state, 'data-state'); put(`node-${name}`, String(level > 0), 'data-owned');
    put(`node-${name}`, `${config.name}，${level}/${config.costs.length} 级，${state === 'max' ? '' : `下一级 ${config.costs[level]} 遗产，`}${reasons[state]}`, 'aria-label');
    put(`buy-${name}`, state === 'max' ? '已满级' : `${config.costs[level]} Legacy · ${level ? '升级' : '点亮'}`);
    put(`buy-${name}`, state !== 'ready', 'disabled'); put(`state-${name}`, reasons[state]);
    if (Object.keys(config.requires).length) {
      const [parent, rank] = Object.entries(config.requires)[0], parentLevel = p.talents[parent] ?? p.upgrades[parent];
      put(`link-${name}`, level ? 'owned' : parentLevel >= rank ? 'available' : 'locked', 'data-state');
    }
  }
  put('root-caption', p.talents.autobuyer ? '文明的第一颗星' : '1 Legacy · 从这里开始');
  return view;
}
