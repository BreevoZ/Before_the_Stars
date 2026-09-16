import { AGES, UNITS, TURRETS } from './game.js';
import { UPGRADES, UPGRADE_COSTS, AUTOMATION_TARGETS } from './progression-config.js';
import { getUpgradeState, purchaseUpgrade } from './progression.js';
import { TALENTS, getTalentState, purchaseTalent, getLegacyReward } from './talents.js';
import { configureAutomation, getAutomationPlan } from './automation.js';

const el = id => document.getElementById(id);
const text = (id, value) => { if (el(id).textContent !== String(value)) el(id).textContent = value; };
const reasons = { locked: '首次通关后解锁', 'during-run': '两轮之间才能购买', prerequisite: '需先解锁前置天赋', legacy: '文明遗产不足', max: '已满级', ready: '下轮生效' };

export function createTalentUI(getSession, changed) {
  let treeKey = '', controlsKey = '';
  const configs = { ...Object.fromEntries(Object.entries(UPGRADES).map(([key, config]) => [key, { ...config, branch: 'growth', costs: UPGRADE_COSTS, requires: {},
    effects: Array.from({ length: UPGRADE_COSTS.length + 1 }, (_, level) => `${config.description} ×${config.base ** level}`) }])), ...TALENTS };
  for (const [branch, name] of Object.entries({ automation: '自动化', growth: '文明增益', legacy: '遗产收益' })) {
    const column = document.createElement('div'); column.className = 'talent-branch';
    column.innerHTML = `<h4 class="branch-title">${name}</h4><div id="branch-${branch}" class="branch-nodes"></div>`;
    el('talent-tree').append(column);
  }
  for (const key of ['formation', 'evolution', 'defense', 'elite', 'production', 'supply', 'warfare', 'salvage', 'conservation', 'continuity']) {
    const config = configs[key], card = document.createElement('article'); card.className = 'talent-node'; card.id = `talent-${key}`;
    const parents = Object.entries(config.requires).map(([parent, level]) => `${configs[parent].name} ${level} 级`).join('、');
    card.innerHTML = `<p class="talent-requires">${parents ? `前置：${parents}` : '源自文明记忆'}</p><h4>${config.name} <span id="level-${key}"></span></h4><p id="effect-${key}"></p><button id="buy-${key}" type="button" aria-describedby="effect-${key} state-${key}"></button><small id="state-${key}"></small>`;
    el(`branch-${config.branch}`).append(card);
    el(`buy-${key}`).addEventListener('click', () => {
      if ((Object.hasOwn(UPGRADES, key) ? purchaseUpgrade : purchaseTalent)(getSession(), key)) changed();
    });
  }
  document.querySelectorAll('[data-archive-page]').forEach(button => button.addEventListener('click', () => {
    const page = button.dataset.archivePage;
    el('talents-panel').hidden = page !== 'talents'; el('automation-panel').hidden = page !== 'automation';
    document.querySelectorAll('[data-archive-page]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  }));
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
    const nextTreeKey = JSON.stringify([p.completedCycles, p.legacy, p.upgrades, p.talents, run.phase]);
    if (nextTreeKey !== treeKey) {
      treeKey = nextTreeKey;
      for (const [key, config] of Object.entries(configs)) {
        const old = Object.hasOwn(UPGRADES, key), level = old ? p.upgrades[key] : p.talents[key];
        const state = (old ? getUpgradeState : getTalentState)(session, key);
        text(`level-${key}`, `${level}/${config.costs.length}`);
        text(`effect-${key}`, `${config.effects[level]}${level < config.costs.length ? ` → ${config.effects[level + 1]}` : ''}`);
        text(`buy-${key}`, level >= config.costs.length ? '已满级' : `${config.costs[level]} 遗产 · ${level ? '升级' : '解锁'}`);
        const button = el(`buy-${key}`); button.disabled = state !== 'ready'; button.title = reasons[state];
        button.setAttribute('aria-label', `${config.name}，${button.textContent}`);
        text(`state-${key}`, reasons[state]); el(`talent-${key}`).dataset.state = level ? 'owned' : state;
      }
    }
    text('talent-legacy-preview', `本轮终局 +${getLegacyReward(run.talents)} · 下轮终局 +${getLegacyReward(p.talents)} · 累计获得 ${p.totalLegacy} 遗产`);
    const auto = p.automation, nextControlsKey = JSON.stringify([auto, p.talents, game.ages.player]);
    if (nextControlsKey !== controlsKey) {
      controlsKey = nextControlsKey;
      for (const [id, [key, type]] of Object.entries(fields)) {
        el(id)[type === 'checked' ? 'checked' : 'value'] = auto[key]; el(id).disabled = !auto.unlocked;
      }
      AUTOMATION_TARGETS.forEach((role, i) => { el(`auto-weight-${role}`).value = auto.weights[i]; el(`auto-weight-${role}`).disabled = !p.talents.formation; });
      el('auto-mode').querySelector('[value="balanced"]').disabled = !p.talents.formation;
      el('auto-weights').hidden = auto.mode !== 'balanced'; el('auto-target-field').hidden = auto.mode !== 'single';
      for (const [id, required, hint] of [['evolve', p.talents.evolution, '需技术托管'], ['defense', p.talents.defense, '需防御工程'], ['replace', p.talents.defense >= 2, '需防御工程 2 级'], ['elite', p.talents.elite, '需精锐征召']]) {
        el(`auto-${id}`).disabled = !required; text(`auto-${id}-lock`, required ? '' : hint);
      }
      for (const id of ['auto-turret', 'auto-max-turrets', 'auto-expand']) el(id).disabled = !p.talents.defense;
      el('auto-elite-limit').disabled = !p.talents.elite;
      const roster = AGES[game.ages.player].units;
      AGES[game.ages.player].turrets.forEach((type, i) => { el('auto-turret').options[i].textContent = TURRETS[type].name; });
      text('auto-roster-hint', `当前：${roster.map(type => UNITS[type].name).join('／')}。比例包含旧时代部队和已付费订单；填 0 可排除某类，进化后自动换为对应兵种。`);
      text('auto-defense-hint', `进化后跟随同一位置的炮塔类型。扩容会先存够炮位与炮塔的全部费用；替换只处理旧时代炮塔，存够净支出后才拆塔，新建费用按原价、旧塔返还一半。`);
    }
    text('automation-hint', '每 0.25 秒模拟时间检查一次。新功能解锁后默认关闭，由你选择启用；暂停、隐藏页面和结算时停止。');
    text('automation-status', getAutomationPlan(session).status);
  }
  return { sync };
}
