import { AGES, UNITS, TURRETS } from './game.js';
import { UPGRADES, AUTOMATION_TARGETS } from './progression-config.js';
import { getUpgradeState, purchaseUpgrade } from './progression.js';
import { TALENT_TREE, TALENT_BRANCHES, getTalentState, purchaseTalent, getLegacyReward } from './talents.js';
import { configureAutomation, getAutomationPlan } from './automation.js';

const el = id => document.getElementById(id);
const text = (id, value) => { if (el(id).textContent !== String(value)) el(id).textContent = value; };
const reasons = { locked: '首次通关后解锁', 'during-run': '两轮之间才能购买', prerequisite: '需先解锁前置天赋', legacy: '文明遗产不足', max: '已满级', ready: '下轮生效' };

export function createTalentUI(getSession, changed) {
  let treeKey = '', controlsKey = '';
  const configs = TALENT_TREE;
  function select(key, reveal = false) {
    for (const node of Object.keys(configs)) {
      el(`node-${node}`).setAttribute('aria-pressed', String(node === key));
      el(`talent-${node}`).hidden = node !== key;
    }
    if (reveal && window.matchMedia('(max-width: 1000px)').matches) {
      el('talent-details').scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }
  function addNode(key, list, descend = true) {
    const config = configs[key], item = document.createElement('li');
    const parent = Object.entries(config.requires)[0];
    item.dataset.talent = key;
    if (parent) { item.dataset.parent = parent[0]; item.dataset.requiredLevel = parent[1]; }
    item.innerHTML = `${parent ? `<span class="talent-edge">${configs[parent[0]].name} ${parent[1]} 级后</span>` : ''}<button class="talent-node" id="node-${key}" type="button" aria-pressed="false" aria-controls="talent-${key}"><span class="node-mark" id="mark-${key}" aria-hidden="true"></span><span class="node-name">${config.name}</span><small id="level-${key}"></small>${key === 'autobuyer' ? '<span class="root-caption" id="root-caption"></span>' : ''}</button>`;
    list.append(item);
    const children = Object.keys(configs).filter(child => Object.hasOwn(configs[child].requires, key));
    if (descend && children.length) {
      const nested = document.createElement('ul'); nested.className = 'talent-children'; item.append(nested);
      children.forEach(child => addNode(child, nested));
    }
    el(`node-${key}`).addEventListener('click', () => select(key, true));
    return item;
  }
  const roots = document.createElement('ul'); roots.className = 'tree-roots'; el('talent-tree').append(roots);
  const root = addNode('autobuyer', roots, false); root.className = 'talent-origin';
  const routes = document.createElement('div'); routes.className = 'talent-routes'; root.append(routes);
  for (const [branch, name] of Object.entries(TALENT_BRANCHES)) {
    const column = document.createElement('div'); column.className = 'talent-branch'; column.id = `branch-${branch}`;
    column.dataset.branch = branch; column.dataset.parent = 'autobuyer';
    column.setAttribute('aria-label', `${name}天赋路径`);
    const heading = document.createElement('h4'); heading.className = 'branch-title'; heading.textContent = name;
    const list = document.createElement('ul'); list.className = 'talent-children branch-nodes';
    column.append(heading, list); routes.append(column);
    Object.keys(configs).filter(key => configs[key].branch === branch && Object.hasOwn(configs[key].requires, 'autobuyer')).forEach(key => addNode(key, list));
  }
  for (const [key, config] of Object.entries(configs)) {
    const card = document.createElement('article'); card.className = 'talent-detail'; card.id = `talent-${key}`;
    const parents = Object.entries(config.requires).map(([parent, level]) => `${configs[parent].name} ${level} 级`).join('、');
    card.innerHTML = `<p class="talent-requires">${parents ? `前置：${parents}` : '起点 · 首次通关后可购买'}</p><h4>${config.name}</h4><p id="effect-${key}"></p><p class="archive-note" id="grant-${key}" hidden>兼容旧版进度，已免费保留此前置天赋。</p><button id="buy-${key}" type="button" aria-describedby="effect-${key} state-${key}"></button><small id="state-${key}"></small>`;
    el('talent-details').append(card);
    el(`buy-${key}`).addEventListener('click', () => {
      if ((Object.hasOwn(UPGRADES, key) ? purchaseUpgrade : purchaseTalent)(getSession(), key)) changed();
    });
  }
  select('autobuyer');
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
    const nextTreeKey = JSON.stringify([p.completedCycles, p.legacy, p.upgrades, p.talents, p.talentGrants, run.phase]);
    if (nextTreeKey !== treeKey) {
      treeKey = nextTreeKey;
      for (const [key, config] of Object.entries(configs)) {
        const old = Object.hasOwn(UPGRADES, key), level = old ? p.upgrades[key] : p.talents[key];
        const state = (old ? getUpgradeState : getTalentState)(session, key);
        text(`level-${key}`, `${level}/${config.costs.length}`);
        text(`effect-${key}`, `当前：${config.effects[level]}${level < config.costs.length ? `\n下一级：${config.effects[level + 1]}` : ''}`);
        text(`mark-${key}`, level ? '✓' : state === 'ready' ? '+' : '·');
        el(`grant-${key}`).hidden = !p.talentGrants.includes(key);
        el(`node-${key}`).setAttribute('aria-label', `${config.name}，${level}/${config.costs.length} 级，${reasons[state]}`);
        text(`buy-${key}`, level >= config.costs.length ? '已满级' : `${config.costs[level]} 遗产 · ${level ? '升级' : '解锁'}`);
        const button = el(`buy-${key}`); button.disabled = state !== 'ready'; button.title = reasons[state];
        button.setAttribute('aria-label', `${config.name}，${button.textContent}`);
        text(`state-${key}`, reasons[state]); el(`node-${key}`).dataset.state = level ? 'owned' : state;
      }
    }
    text('talent-legacy-preview', `本轮终局 +${getLegacyReward(run.talents, run.challengeLevel)} · 常规重建终局 +${getLegacyReward(p.talents)} · 累计获得 ${p.totalLegacy} 遗产`);
    text('root-caption', p.talents.autobuyer ? '已解锁 · 三条路线已开启' : `${configs.autobuyer.costs[0]} Legacy · 解锁自动购买`);
    text('talent-guide', !p.talents.autobuyer ? '先解锁根节点，再沿三条路线成长。点击节点查看与购买。' : '沿连线解锁天赋。两轮之间购买，重建后生效。');
    const auto = p.automation, nextControlsKey = JSON.stringify([auto, p.talents, game.ages.player]);
    if (nextControlsKey !== controlsKey) {
      controlsKey = nextControlsKey;
      el('automation-locked').hidden = auto.unlocked;
      el('automation-settings').hidden = !auto.unlocked;
      document.querySelectorAll('[data-auto-talent]').forEach(group => {
        group.hidden = p.talents[group.dataset.autoTalent] < Number(group.dataset.autoLevel || 1);
      });
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
      text('auto-defense-hint', `进化后跟随同一位置的炮塔类型。扩容会先存够炮位与炮塔的全部费用；替换只处理旧时代炮塔，存够净支出后才拆塔，新建费用按原价、旧塔返还一半。`);
    }
    text('automation-hint', '每 0.25 秒模拟时间检查一次。通过天赋解锁功能，再自行启用；暂停、隐藏页面和结算时停止。');
    text('automation-status', getAutomationPlan(session).status);
  }
  return { sync };
}
