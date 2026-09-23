import { UPGRADES, LEGACY_ECONOMY } from './progression-config.js';
import { Q } from './quantity.js';
import { getUpgradeState } from './progression.js';
import { TALENT_TREE, getTalentState, layerTalents, meetsTalentRequirements, protocolPrice } from './talents.js';
const reasons = { locked: '首次通关后解锁', 'during-run': '本轮已启程 · 重建前可购买', 'victory-required': '完成一次未来终局后启航', 'depth-required': `通关余烬远征第 ${LEGACY_ECONOMY.bypasserChallenge} 层后开放`, prerequisite: '先点亮前置星辰', legacy: '遗产不足', max: '已满级', ready: '新文明开始时生效', planned: '规划中 · 轨道文明尚未开放' };

export function buildTalentViewModel(session, { armed = false } = {}) {
  const { permanent: p } = session, view = {};
  const put = (id, value, prop = '') => { view[`#${id}${prop ? `@${prop}` : ''}`] = value; };
  for (const [name, config] of Object.entries(TALENT_TREE)) {
    const upgrade = Object.hasOwn(UPGRADES, name), level = upgrade ? p.upgrades[name] : p.talents[name];
    // Purchase availability and having another rank are separate facts.
    const complete = !config.placeholder && level >= config.costs.length;
    const state = complete ? 'max' : (upgrade ? getUpgradeState : getTalentState)(session, name);
    const protocol = name === 'bypasser' && !complete, price = protocol ? Q.format(protocolPrice(p), 6) : config.costs[level] === undefined ? '' : Q.format(config.costs[level], 6);
    const reason = session.run.phase === 'orbital' && state === 'during-run' ? '已抵达轨道 · 地表档案留存' : state === 'ready' && name === 'bypasser' ? '注入全部遗产后立即启航，VI 从零开始 · 演出可跳过，进度立即保存' : protocol && state === 'legacy' ? `注入全部遗产，至少 ${Q.format(config.costs[0], 6)}` : state === 'ready' && ['spark', 'timeAcceleration'].includes(name) ? '立即解锁速度档位' : reasons[state];
    put(`level-${name}`, '●'.repeat(level) + '○'.repeat(config.costs.length - level));
    put(`cost-${name}`, state === 'planned' ? '待开放' : state === 'max' ? '完整' : `${protocol ? '全部 ' : ''}${price} ✧`);
    put(`current-${name}`, config.effects[level]); put(`next-${name}`, config.effects[level + 1] ?? '已达到最高等级');
    put(`grant-${name}`, !p.talentGrants.includes(name), 'hidden');
    put(`node-${name}`, state, 'data-state'); put(`node-${name}`, String(level > 0), 'data-owned');
    put(`node-${name}`, `${config.name}，${state === 'planned' ? '规划占位，' : `${level}/${config.costs.length} 级，${state === 'max' ? '' : `下一级 ${price} 遗产，`}`}${reason}`, 'aria-label');
    put(`buy-${name}`, state === 'planned' ? '尚未开放' : state === 'max' ? '已满级' : protocol ? (armed && state === 'ready' ? `确认注入全部 ${price} Legacy 并启航` : `注入全部 ${price} Legacy · 启航`) : `${price} Legacy · ${level ? '升级' : '点亮'}`);
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
