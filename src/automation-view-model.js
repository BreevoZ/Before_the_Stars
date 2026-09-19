import { Q } from './quantity.js';
import { stat } from './stats.js';
import { AGES, UNITS, TURRETS } from './game.js';
import { AUTOMATION_TARGETS } from './progression-config.js';
import { getLegacyReward } from './talents.js';
import { getAutomationPlan } from './automation.js';

export const AUTOMATION_FIELDS = Object.freeze({
  'auto-enabled': ['enabled', 'checked'], 'auto-recruit': ['recruitEnabled', 'checked'], 'auto-target': ['target', 'value'],
  'auto-reserve': ['reserve', 'quantity'], 'auto-queue': ['queueLimit', 'number'], 'auto-priority': ['priority', 'value'], 'auto-mode': ['mode', 'value'],
  'auto-evolve': ['evolve', 'checked'], 'auto-defense': ['defense', 'checked'], 'auto-turret': ['turretTarget', 'number'],
  'auto-max-turrets': ['maxTurrets', 'number'], 'auto-expand': ['expand', 'checked'], 'auto-replace': ['replace', 'checked'],
  'auto-elite': ['elite', 'checked'], 'auto-elite-limit': ['eliteLimit', 'number'],
});
export function buildAutomationViewModel(session, { mobile = false } = {}) {
  const { permanent: p, game } = session, auto = p.automation, view = {};
  const put = (id, value, prop = '') => { view[`#${id}${prop ? `@${prop}` : ''}`] = value; };
  put('talent-legacy-preview', `本轮终局 +${Q.format(stat(game, { kind: 'civilization' }, 'legacy'))} · 常规重建终局 +${Q.format(getLegacyReward(p.talents))} · 累计 ${Q.format(p.totalLegacy)} Legacy`);
  put('talent-guide', !p.talents.spark ? '从根节点点亮第一颗星。花 1 Legacy 点亮文明火种，解锁 2× 速度。自动招募在累计通关 2 次后免费获得。' : mobile ? '上下探索时代，左右浏览侧枝 · 点击节点查看与购买' : '微光指引可购买的天赋 · 悬停或点击查看 · 方向键探索星图');
  put('automation-locked', `累计通关 2 次免费解锁基础自动招募 · 当前 ${p.completedCycles}/2。解锁后默认关闭，可自行启用。`);
  put('automation-locked', auto.unlocked, 'hidden'); put('automation-settings', !auto.unlocked, 'hidden');
  for (const [key, level] of [['logistics', 1], ['formation', 1], ['elite', 1], ['evolution', 1], ['defense', 1], ['defense', 2]]) {
    view[`[data-auto-talent="${key}"]${level === 1 ? ':not([data-auto-level])' : `[data-auto-level="${level}"]`}@hidden`] = p.talents[key] < level;
  }
  put('auto-queue', Math.max(auto.queueLimit, stat(game, 'player', 'queueLimit'), 5), 'optionCount');
  put('auto-queue', `实际训练队列最多 ${stat(game, 'player', 'queueLimit')} 位；自动购买还受此上限约束。`, 'title');
  for (const [id, [key, type]] of Object.entries(AUTOMATION_FIELDS)) {
    put(id, type === 'quantity' ? Q.encode(auto[key]) : auto[key], type === 'checked' ? 'checked' : 'value'); put(id, !auto.unlocked, 'disabled');
  }
  AUTOMATION_TARGETS.forEach((role, i) => { put(`auto-weight-${role}`, auto.weights[i], 'value'); put(`auto-weight-${role}`, !p.talents.formation, 'disabled'); });
  for (const id of ['auto-reserve', 'auto-queue', 'auto-priority', 'auto-recruit']) put(id, !p.talents.logistics, 'disabled');
  put('auto-mode', !p.talents.formation, 'disabled'); view['#auto-mode [value="balanced"]@disabled'] = !p.talents.formation;
  put('auto-weights', auto.mode !== 'balanced', 'hidden'); put('auto-target-field', auto.mode !== 'single', 'hidden');
  for (const [id, required, hint] of [['evolve', p.talents.evolution, '需技术托管'], ['defense', p.talents.defense, '需防御工程'], ['replace', p.talents.defense >= 2, '需防御工程 2 级'], ['elite', p.talents.elite, '需精锐征召']]) {
    put(`auto-${id}`, !required, 'disabled'); put(`auto-${id}-lock`, required ? '' : hint);
  }
  for (const id of ['auto-turret', 'auto-max-turrets', 'auto-expand']) put(id, !p.talents.defense, 'disabled');
  put('auto-elite-limit', !p.talents.elite, 'disabled');
  const age = AGES[game.ages.player];
  age.turrets.forEach((type, i) => { view[`#auto-turret option:nth-child(${i + 1})`] = TURRETS[type].name; });
  put('auto-roster-hint', `当前：${age.units.map(type => UNITS[type].name).join('／')}。进化后自动切换为对应兵种。${p.talents.formation ? '编队比例计入旧时代部队与订单；填 0 可排除某类。' : ''}`);
  put('auto-defense-hint', '进化后跟随同一位置的炮塔类型。扩容会先存够炮位与炮塔的全部费用；替换只处理旧时代炮塔，存够净支出后才拆塔，新塔使用当前造价、旧塔返还实际支付价格的一半。');
  put('automation-hint', '每 0.25 秒模拟时间检查一次。通过天赋解锁功能，再自行启用；暂停、隐藏页面和结算时停止。');
  put('automation-status', getAutomationPlan(session).status);
  return view;
}
