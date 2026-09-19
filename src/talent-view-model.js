import { UPGRADES } from './progression-config.js';
import { getUpgradeState } from './progression.js';
import { TALENT_TREE, getTalentState, layerTalents, meetsTalentRequirements } from './talents.js';
const reasons = { locked: '首次通关后解锁', 'during-run': '本轮已启程 · 重建前可购买', prerequisite: '先点亮前置星辰', legacy: '遗产不足', max: '已满级', ready: '新文明开始时生效', planned: '规划中 · 轨道文明尚未开放' };

export function buildTalentViewModel(session) {
  const { permanent: p } = session, view = {};
  const put = (id, value, prop = '') => { view[`#${id}${prop ? `@${prop}` : ''}`] = value; };
  for (const [name, config] of Object.entries(TALENT_TREE)) {
    const upgrade = Object.hasOwn(UPGRADES, name), level = upgrade ? p.upgrades[name] : p.talents[name];
    const state = (upgrade ? getUpgradeState : getTalentState)(session, name);
    const reason = state === 'ready' && ['spark', 'timeAcceleration'].includes(name) ? '立即解锁速度档位' : reasons[state];
    put(`level-${name}`, '●'.repeat(level) + '○'.repeat(config.costs.length - level));
    put(`cost-${name}`, state === 'planned' ? '待开放' : state === 'max' ? '完整' : `${config.costs[level]} ✧`);
    put(`current-${name}`, config.effects[level]); put(`next-${name}`, config.effects[level + 1] ?? '已达到最高等级');
    put(`grant-${name}`, !p.talentGrants.includes(name), 'hidden');
    put(`node-${name}`, state, 'data-state'); put(`node-${name}`, String(level > 0), 'data-owned');
    put(`node-${name}`, `${config.name}，${state === 'planned' ? '规划占位，' : `${level}/${config.costs.length} 级，${state === 'max' ? '' : `下一级 ${config.costs[level]} 遗产，`}`}${reason}`, 'aria-label');
    put(`buy-${name}`, state === 'planned' ? '尚未开放' : state === 'max' ? '已满级' : `${config.costs[level]} Legacy · ${level ? '升级' : '点亮'}`);
    put(`buy-${name}`, state !== 'ready', 'disabled'); put(`state-${name}`, reason);
    if (Object.keys(config.requires).length || config.requiresLayer || config.unit) {
      const available = meetsTalentRequirements({ ...p.talents, ...p.upgrades }, config);
      put(`link-${name}`, level ? 'owned' : available ? 'available' : 'locked', 'data-state');
    }
  }
  put('gate-link-spark', p.talents.spark ? 'owned' : 'locked', 'data-state');
  for (let layer = 1; layer <= 5; layer++) for (const key of layerTalents(layer)) put(`gate-link-${key}`, p.talents[key] ? 'owned' : 'locked', 'data-state');
  for (let layer = 1; layer <= 6; layer++) put(`gate-${layer}`, (layer === 1 ? p.talents.spark : layerTalents(layer - 1).some(key => p.talents[key])) ? 'available' : 'locked', 'data-state');
  put('root-caption', p.talents.spark ? '文明的第一颗星' : '1 Legacy · 从这里开始');
  return view;
}
