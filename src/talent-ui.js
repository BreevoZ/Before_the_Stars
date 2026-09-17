import { stat } from './stats.js';
import { AGES, UNITS, TURRETS } from './game.js';
import { AUTOMATION_TARGETS } from './progression-config.js';
import { getLegacyReward } from './talents.js';
import { createTalentMap } from './talent-map.js';
import { configureAutomation, getAutomationPlan } from './automation.js';

const el = id => document.getElementById(id);
const text = (id, value) => { if (el(id).textContent !== String(value)) el(id).textContent = value; };
export function createTalentUI(getSession, changed) {
  let controlsKey = '';
  const map = createTalentMap(getSession, changed);
  const fields = {
    'auto-enabled': ['enabled', 'checked'], 'auto-recruit': ['recruitEnabled', 'checked'], 'auto-target': ['target', 'value'],
    'auto-reserve': ['reserve', 'number'], 'auto-queue': ['queueLimit', 'number'], 'auto-priority': ['priority', 'value'], 'auto-mode': ['mode', 'value'],
    'auto-evolve': ['evolve', 'checked'], 'auto-defense': ['defense', 'checked'], 'auto-turret': ['turretTarget', 'number'],
    'auto-max-turrets': ['maxTurrets', 'number'], 'auto-expand': ['expand', 'checked'], 'auto-replace': ['replace', 'checked'],
    'auto-elite': ['elite', 'checked'], 'auto-elite-limit': ['eliteLimit', 'number'],
  };
  function apply(patch) {
    if (!configureAutomation(getSession(), patch)) {
      text('automation-error', '设置未保存：请检查数值范围、比例不能全为 0，以及所需天赋。');
      controlsKey = ''; sync(); return;
    }
    text('automation-error', '设置已保存。'); changed();
  }
  for (const [id, [key, type]] of Object.entries(fields)) el(id).addEventListener('change', () => {
    apply({ [key]: type === 'number' ? (el(id).value === '' ? NaN : Number(el(id).value)) : el(id)[type] });
  });
  AUTOMATION_TARGETS.forEach((role, index) => el(`auto-weight-${role}`).addEventListener('change', () => {
    const weights = [...getSession().permanent.automation.weights], input = el(`auto-weight-${role}`);
    weights[index] = input.value === '' ? NaN : Number(input.value); apply({ weights });
  }));
  function sync() {
    const session = getSession(), { permanent: p, run, game } = session;
    map.sync();
    text('talent-legacy-preview', `本轮终局 +${stat(game, { kind: 'civilization' }, 'legacy')} · 常规重建终局 +${getLegacyReward(p.talents)} · 累计 ${p.totalLegacy} Legacy`);
    text('talent-guide', !p.talents.autobuyer ? '从根节点点亮第一颗星。花 1 Legacy 解锁 Autobuyer，再沿三条路线成长。' : window.innerWidth <= 740 ? '沿星路向上探索 · 点击节点查看与购买' : '微光指引可购买的天赋 · 悬停或点击查看 · 方向键探索星图');
    const auto = p.automation, nextControlsKey = JSON.stringify([auto, p.talents, game.ages.player, stat(game, 'player', 'queueLimit')]);
    if (nextControlsKey !== controlsKey) {
      controlsKey = nextControlsKey;
      el('automation-locked').hidden = auto.unlocked;
      el('automation-settings').hidden = !auto.unlocked;
      document.querySelectorAll('[data-auto-talent]').forEach(group => {
        group.hidden = p.talents[group.dataset.autoTalent] < Number(group.dataset.autoLevel || 1);
      });
      el('auto-queue').replaceChildren(...Array.from({ length: Math.max(auto.queueLimit, stat(game, 'player', 'queueLimit'), 5) }, (_, i) => {
        const option = document.createElement('option'); option.value = String(i + 1); option.textContent = String(i + 1); return option;
      }));
      el('auto-queue').title = `实际训练队列最多 ${stat(game, 'player', 'queueLimit')} 位；自动购买还受此上限约束。`;
      for (const [id, [key, type]] of Object.entries(fields)) {
        el(id)[type === 'checked' ? 'checked' : 'value'] = auto[key]; el(id).disabled = !auto.unlocked;
      }
      AUTOMATION_TARGETS.forEach((role, i) => { el(`auto-weight-${role}`).value = auto.weights[i]; el(`auto-weight-${role}`).disabled = !p.talents.formation; });
      for (const id of ['auto-reserve', 'auto-queue', 'auto-priority', 'auto-recruit']) el(id).disabled = !p.talents.logistics;
      el('auto-mode').disabled = !p.talents.formation;
      el('auto-mode').querySelector('[value="balanced"]').disabled = !p.talents.formation;
      el('auto-weights').hidden = auto.mode !== 'balanced'; el('auto-target-field').hidden = auto.mode !== 'single';
      for (const [id, required, hint] of [['evolve', p.talents.evolution, '需技术托管'], ['defense', p.talents.defense, '需防御工程'], ['replace', p.talents.defense >= 2, '需防御工程 2 级'], ['elite', p.talents.elite, '需精锐征召']]) {
        el(`auto-${id}`).disabled = !required; text(`auto-${id}-lock`, required ? '' : hint);
      }
      for (const id of ['auto-turret', 'auto-max-turrets', 'auto-expand']) el(id).disabled = !p.talents.defense;
      el('auto-elite-limit').disabled = !p.talents.elite;
      const roster = AGES[game.ages.player].units;
      AGES[game.ages.player].turrets.forEach((type, i) => { el('auto-turret').options[i].textContent = TURRETS[type].name; });
      text('auto-roster-hint', `当前：${roster.map(type => UNITS[type].name).join('／')}。进化后自动切换为对应兵种。${p.talents.formation ? '编队比例计入旧时代部队与订单；填 0 可排除某类。' : ''}`);
      text('auto-defense-hint', `进化后跟随同一位置的炮塔类型。扩容会先存够炮位与炮塔的全部费用；替换只处理旧时代炮塔，存够净支出后才拆塔，新塔使用当前造价、旧塔返还实际支付价格的一半。`);
    }
    text('automation-hint', '每 0.25 秒模拟时间检查一次。通过天赋解锁功能，再自行启用；暂停、隐藏页面和结算时停止。');
    text('automation-status', getAutomationPlan(session).status);
  }
  return { sync, open: map.open };
}
