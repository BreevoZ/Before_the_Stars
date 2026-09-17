import { RULES, UNITS, AGES, TURRETS, ABILITIES, getAgeUnits, createGame, getIncomeRate, getRecruitState, recruit, cancelTraining, getEvolutionState, evolve, getTurretState, buildTurret, getExpansionState, expandTurretSlots, sellTurret, castAbility, updateGame } from './game.js';
import { createCivilizationUI, formatMultiplier } from './civilization-ui.js';
import { getGameMode } from './debug.js';
import { createRenderer } from './render.js';
import { drawUnit } from './units.js';
import { drawTurret } from './turrets.js';
import { icon, unitIcons, turretIcons, abilityIcons } from './icons.js';

const byId = id => document.getElementById(id);
function setIcon(element, name) {
  if (element.dataset.currentIcon === name) return;
  element.innerHTML = name ? icon(name) : '';
  element.dataset.currentIcon = name;
}
document.querySelectorAll('[data-icon]').forEach(element => setIcon(element, element.dataset.icon));
const helpDialog = byId('help-dialog');
const canvas = byId('battlefield');
const render = createRenderer(canvas);
const cards = [...document.querySelectorAll('[data-unit]')];
const towerCards = [...document.querySelectorAll('[data-turret]')];
const eraSteps = Object.values(AGES).map(age => {
  const step = document.createElement('li');
  step.innerHTML = `<span>${age.numeral}</span><strong class="sr-only">${age.shortName}</strong>`;
  step.title = age.name;
  byId('era-track').append(step);
  return step;
});
const towerSlots = Array.from({ length: RULES.maxTurretSlots }, (_, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'turret-slot';
  button.innerHTML = `<span class="slot-index">${index + 1}</span><span class="slot-icon"></span><strong class="sr-only"></strong>`;
  button.addEventListener('click', () => { selectedSlot = index; syncUI(); });
  byId('turret-slots').append(button);
  return button;
});
const queueSlots = Array.from({ length: RULES.queueLimit }, (_, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'queue-slot';
  button.innerHTML = '<span class="queue-fill" aria-hidden="true"></span><span class="queue-icon" aria-hidden="true"></span><span class="queue-name sr-only"></span><span class="queue-time"></span>';
  button.addEventListener('click', () => {
    const order = game.queues.player[index];
    if (order && cancelTraining(game, order.id)) {
      announce(`已取消${UNITS[order.type].name}，退还 ${order.paid ?? UNITS[order.type].cost} 金币。`);
      syncUI();
    }
  });
  byId('training-queue').append(button);
  return button;
});
const mode = getGameMode(location.search);
const incremental = mode !== 'classic';
document.body.dataset.mode = mode;
if (mode !== 'incremental') {
  byId('mode-link').href = './';
  byId('mode-link').textContent = '返回增量模式';
}
if (mode === 'debug') {
  byId('debug-link').href = '?mode=classic';
  byId('debug-link').textContent = '经典模式';
  document.title = 'Before the Stars · 快速调试';
}
const civilization = incremental ? createCivilizationUI(resetBattle => {
  game = civilization.session.game;
  accumulator = 0; lastTime = null;
  if (resetBattle) resetBattleView();
  syncUI(); if (!civilization.homeOpen) render(game, { targeting, targetX });
  if (resetBattle && !civilization.modalOpen && game.status === 'playing') byId('recruit').focus({ preventScroll: true });
}, { debug: mode === 'debug' }) : null;
let game = civilization?.session.game ?? createGame();
let manualPaused = false;
let lastTime = null;
let accumulator = 0;
let announcedResult = false;
let targeting = false;
let targetX = RULES.width / 2;
let displayedAge = 0;
let announcedAges = { player: 1, enemy: 1 };
let selectedSlot = 0;

function setText(id, value) {
  const element = byId(id);
  if (element.textContent !== String(value)) element.textContent = value;
}
const announce = message => setText('announcement', message);
const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;

setText('recruit-rule', `队列 ${RULES.queueLimit} 位 · 兵力上限 ${RULES.armyLimit}（含训练中）`);
for (const card of cards) card.addEventListener('click', () => train(card.dataset.unit));
for (const card of towerCards) card.addEventListener('click', () => constructTurret(card.dataset.turret));

function syncRoster() {
  if (displayedAge === game.ages.player) return;
  displayedAge = game.ages.player;
  const age = AGES[displayedAge];
  document.body.dataset.age = String(displayedAge);
  cards.forEach((card, index) => {
    const type = getAgeUnits(displayedAge)[index];
    card.hidden = !type;
    if (!type) { card.disabled = true; return; }
    const stats = UNITS[type];
    card.dataset.unit = type;
    card.dataset.age = String(displayedAge);
    card.querySelector('strong').textContent = stats.name;
    setIcon(card.querySelector('.unit-icon'), unitIcons[type]);
    const holder = card.querySelector('.unit-icon');
    const portrait = holder.querySelector('canvas') ?? document.createElement('canvas');
    portrait.width = 240; portrait.height = 160;
    portrait.setAttribute('aria-hidden', 'true');
    holder.append(portrait);
    const context = portrait.getContext('2d');
    context.scale(2, 2); context.translate(0, 77);
    drawUnit(context, { id: index, team: 'player', type, x: 43, hp: stats.health, moving: false, attackAnimation: 0 }, 0, stats.footprint ? 0.66 : 0.9, true);
    card.querySelector('.unit-role').textContent = stats.description;
    card.querySelector('[data-cost]').textContent = stats.cost;
    card.querySelector('[data-training]').textContent = `${stats.trainTime}s`;
    card.dataset.description = `${stats.name} · ${stats.cost} 金币 · ${stats.trainTime} 秒训练\n${stats.health} 生命 / ${stats.damage}${stats.burst ? ` × ${stats.burst}` : ''} 攻击 / ${stats.attackInterval} 秒间隔 / ${stats.armor} 护甲 / ${stats.range} 对兵射程${stats.baseRange ? ` / ${stats.baseRange} 攻城射程` : ''}\n${stats.description}`;
    card.setAttribute('aria-label', `训练${stats.name}，${stats.cost} 金币，耗时 ${stats.trainTime} 秒`);
  });
  setText('roster-age', `${age.numeral} · ${age.name}`);
  towerCards.forEach((card, index) => {
    const type = age.turrets[index];
    const stats = TURRETS[type];
    card.dataset.turret = type;
    card.querySelector('strong').textContent = stats.name;
    setIcon(card.querySelector('.turret-icon'), turretIcons[type]);
    const holder = card.querySelector('.turret-icon');
    const portrait = holder.querySelector('canvas') ?? document.createElement('canvas');
    portrait.width = 240; portrait.height = 160; portrait.setAttribute('aria-hidden', 'true'); holder.append(portrait);
    const context = portrait.getContext('2d'); context.scale(2, 2); context.translate(54, 70);
    drawTurret(context, { type, team: 'player', cooldown: 0 }, 0, 1.15, true);
    card.querySelector('[data-turret-role]').textContent = stats.description;
    card.querySelector('[data-turret-cost]').textContent = stats.cost;
    card.dataset.description = `${stats.name} · ${stats.cost} 金币\n${stats.damage}${stats.burst ? ` × ${stats.burst}` : ''} 攻击 / ${stats.interval} 秒间隔 / ${stats.range} 射程${stats.splash ? ` / ${stats.splash} 爆炸半径` : ''}${stats.chargeTime ? ` / ${stats.chargeTime} 秒充能` : ''}\n${stats.description}`;
    card.setAttribute('aria-label', `建造${stats.name}，${stats.cost} 金币，${stats.description}`);
  });
  const ability = ABILITIES[age.ability];
  setText('ability-name', ability.name);
  setIcon(byId('ability-icon'), abilityIcons[age.ability]);
  setText('ability-description', ability.targeting === 'allies'
    ? `${ability.name}：${ability.description} · 每秒 +${ability.healing} 生命，持续 ${ability.duration} 秒 · ${ability.cooldown} 秒冷却`
    : `${ability.name}：${ability.description} · ${ability.damage}${ability.waves > 1 ? ` × ${ability.waves}` : ''} 伤害 · ${ability.cooldown} 秒冷却`);
  setText('spell-hint', ability.targeting === 'allies' ? '点击或按 Q 立即治疗全场友军，无需选择落点。不修复基地，不超过各兵种的生命上限。' : '选中大招后点击战场释放；也可用方向键瞄准，Enter 释放，Esc 取消。');
  setText('target-text', '选择落点');
  setIcon(byId('target-banner').querySelector('[data-icon]'), abilityIcons[age.ability]);
  byId('ability').dataset.ability = age.ability;
  if (ability.targeting === 'allies') targeting = false;
  byId('help-roster').innerHTML = [
    { title: '部队', controls: cards, icons: unitIcons, key: 'unit' },
    { title: '炮塔', controls: towerCards, icons: turretIcons, key: 'turret' },
  ].map(group => `<h3>${group.title}</h3>${group.controls.filter(card => !card.hidden).map(card => {
    const [heading, ...details] = card.dataset.description.split('\n');
    return `<div class="help-unit"><span class="help-unit-icon">${icon(group.icons[card.dataset[group.key]])}</span><div><strong>${heading}</strong><p>${details.join(' · ')}</p></div></div>`;
  }).join('')}`).join('');
  eraSteps.forEach((step, index) => {
    step.classList.toggle('reached', index + 1 < displayedAge);
    if (index + 1 === displayedAge) step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
  });
}

function syncDefenses() {
  const slots = game.turrets.player;
  if (selectedSlot >= slots.length) selectedSlot = 0;
  setText('turret-capacity', `${slots.filter(Boolean).length} / ${slots.length}`);
  byId('turret-capacity').title = `已建造 ${slots.filter(Boolean).length} 座 · 已解锁 ${slots.length} 个炮位`;
  towerSlots.forEach((button, index) => {
    const locked = index >= slots.length;
    const turret = slots[index];
    button.disabled = locked || game.status !== 'playing';
    button.classList.toggle('occupied', Boolean(turret));
    button.setAttribute('aria-pressed', String(index === selectedSlot));
    button.querySelector('strong').textContent = locked ? '未扩容' : turret ? TURRETS[turret.type].name : '空位';
    setIcon(button.querySelector('.slot-icon'), locked ? 'lock' : turret ? turretIcons[turret.type] : 'plus');
    button.setAttribute('aria-label', `炮位 ${index + 1}，${locked ? '未扩容' : turret ? TURRETS[turret.type].name : '空位'}`);
    button.title = button.getAttribute('aria-label');
  });
  const selected = slots[selectedSlot];
  setText('selected-turret', `炮位 ${selectedSlot + 1} · ${selected ? TURRETS[selected.type].name : '空位'}`);
  byId('sell-turret').hidden = !selected;
  byId('sell-turret').disabled = game.status !== 'playing';
  if (selected) {
    const refund = Math.floor(TURRETS[selected.type].cost / 2);
    setText('sale-refund', `+${refund}`);
    byId('sell-turret').title = `拆除${TURRETS[selected.type].name} · 返还 ${refund} 金币`;
    byId('sell-turret').setAttribute('aria-label', byId('sell-turret').title);
  }
  const expansion = getExpansionState(game);
  const price = RULES.turretExpansionCosts[slots.length - 1];
  byId('expand-turrets').disabled = expansion !== 'ready';
  setText('expansion-price', price ?? `${RULES.maxTurretSlots}/${RULES.maxTurretSlots}`);
  setIcon(byId('expand-turrets').querySelector('[data-icon]'), price === undefined ? 'check' : 'plus');
  byId('expand-turrets').title = expansion === 'max-slots' ? '已达 4 个炮位' : expansion === 'finished' ? '战斗已结束' : `扩容 +1 · ${price} 金币${expansion === 'gold' ? '（不足）' : ''}`;
  byId('expand-turrets').setAttribute('aria-label', byId('expand-turrets').title);
  for (const card of towerCards) {
    const state = getTurretState(game, 'player', card.dataset.turret, selectedSlot);
    card.disabled = state !== 'ready';
    card.querySelector('[data-turret-state]').textContent = { ready: '在选中位置建造', gold: '金币不足', occupied: '炮位已占用', full: '请先扩容', finished: '战斗已结束', locked: '时代未解锁', outdated: '已被新炮塔替代' }[state] ?? '位置未解锁';
    card.title = `${card.dataset.description}\n${card.querySelector('[data-turret-state]').textContent}`;
  }
}

function syncEvolution() {
  const age = AGES[game.ages.player];
  const nextAge = AGES[game.ages.player + 1];
  const experience = game.experience.player;
  const state = getEvolutionState(game);
  setText('evolution-title', `${age.numeral} · ${age.name}`);
  setText('experience-total', nextAge ? `${experience} / ${nextAge.experienceRequired} 经验` : `累计 ${experience} 经验`);
  setText('experience-value', nextAge ? `${experience} / ${nextAge.experienceRequired}` : experience);
  byId('experience-bar').max = nextAge?.experienceRequired ?? age.experienceRequired;
  byId('experience-bar').value = Math.min(experience, byId('experience-bar').max);
  byId('evolve').disabled = state !== 'ready';
  byId('evolve').classList.toggle('ready', state === 'ready');
  setText('evolve-label', state === 'finished' ? '战斗已结束' : nextAge ? `进化至${nextAge.name}` : '已达最高时代');
  setText('evolution-hint', !nextAge ? '五个时代已全部解锁 · 摧毁敌方基地取得胜利' : state === 'ready' ? '经验已达标 · 点击进化或按 E · 不消耗金币' : `击杀经验 + 阵亡75%经验 · 还差 ${nextAge.experienceRequired - experience} 经验`);
  setText('evolution-unlocks', `${nextAge ? '下个时代' : '已解锁'}：${getAgeUnits(game.ages.player + (nextAge ? 1 : 0)).map(type => UNITS[type].name).join(' · ')}`);
  setText('evolution-benefit', nextAge ? `生命 +${nextAge.baseHealth - age.baseHealth} · 收入 ${formatMultiplier(nextAge.income * (game.modifiers?.income ?? 1))}/秒 · ${ABILITIES[nextAge.ability].name} · 三种新炮塔` : '未来要塞 · 离子科技 · 轨道打击');
  byId('evolve').title = `${byId('evolve-label').textContent} · E\n${byId('evolution-hint').textContent}\n${byId('evolution-benefit').textContent}`;
  byId('evolve').setAttribute('aria-label', byId('evolve-label').textContent);
}

function syncUI() {
  syncRoster();
  syncEvolution();
  syncDefenses();
  const ageAnnouncements = [];
  for (const team of ['player', 'enemy']) {
    const { hp, maxHp } = game.bases[team];
    setText(`${team}-health`, `${hp} / ${maxHp}`);
    byId(`${team}-health-bar`).max = maxHp;
    byId(`${team}-health-bar`).value = hp;
    setText(`${team}-count`, game.units.filter(unit => unit.team === team).length);
    const age = AGES[game.ages[team]];
    const nextAge = AGES[game.ages[team] + 1];
    setText(`${team}-age`, `${age.numeral} · ${age.name}`);
    setText(`${team}-era`, age.numeral);
    setText(`${team}-experience`, nextAge ? `${game.experience[team]} / ${nextAge.experienceRequired} 经验` : `${game.experience[team]} 经验 · 最高时代`);
    byId(`${team}-era`).closest('.base-emblem').title = `${team === 'player' ? '我方' : '敌方'} · ${age.name}\n${byId(`${team}-experience`).textContent}`;
    if (announcedAges[team] !== game.ages[team]) {
      ageAnnouncements.push(`${team === 'player' ? '我方' : '敌方'}已进化至${age.name}。`);
      announcedAges[team] = game.ages[team];
    }
  }
  if (ageAnnouncements.length) announce(ageAnnouncements.join(''));
  setText('gold', Math.floor(game.gold.player + 0.000001));
  setText('income-rate', `+${formatMultiplier(getIncomeRate(game))}/s`);
  byId('income-rate').title = civilization ? `${AGES[game.ages.player].income} 基础收入 × ${formatMultiplier(game.modifiers.income)} 生产档案；击杀金币另由战利品回收 ×${game.modifiers.bounty} 加成并向下取整` : `每秒收入 ${getIncomeRate(game)} 金币`;
  if (civilization) byId('experience-bar').closest('.evolution-progress').title = `战争档案 ×${formatMultiplier(game.modifiers.experience)}；击杀经验、按 75% 向下取整的阵亡经验，再乘倍率逐笔向下取整。首次终局胜利后可在天赋树查看本轮加成。`;
  setText('clock', formatTime(game.elapsed));
  setText('enemy-strategy', game.ai.strategy === 'siege' ? '敌军战术 · 重装攻城' : '敌军战术 · 混合推进');
  setIcon(byId('enemy-strategy-icon'), game.ai.strategy === 'siege' ? 'cannon' : 'sword');
  byId('enemy-strategy-icon').title = byId('enemy-strategy').textContent;
  for (const card of cards) {
    if (card.hidden) continue;
    const state = getRecruitState(game, card.dataset.unit);
    card.disabled = state !== 'ready';
    const label = { ready: '加入队列', gold: '金币不足', 'queue-full': '队列已满', 'army-full': '兵力已满', locked: '时代未解锁', outdated: '已被新兵种替代', finished: '战斗已结束' }[state];
    const status = card.querySelector('[data-state]');
    if (status.textContent !== label) status.textContent = label;
    card.title = `${card.dataset.description}\n${label}`;
  }
  setText('queue-count', `${game.queues.player.length} / ${RULES.queueLimit}`);
  queueSlots.forEach((slot, index) => {
    const order = game.queues.player[index];
    const name = order ? UNITS[order.type].name : String(index + 1).padStart(2, '0');
    const time = !order ? '空位' : index > 0 ? '等待中' : order.remaining <= 0.000001 ? '等待出口' : `${order.remaining.toFixed(1)}s`;
    slot.disabled = !order || game.status !== 'playing';
    slot.classList.toggle('active', Boolean(order) && index === 0);
    slot.classList.toggle('occupied', Boolean(order));
    slot.querySelector('.queue-name').textContent = name;
    setIcon(slot.querySelector('.queue-icon'), order ? unitIcons[order.type] : '');
    slot.querySelector('.queue-time').textContent = !order ? '·' : index > 0 ? '' : order.remaining <= 0.000001 ? '…' : time;
    slot.querySelector('.queue-fill').style.transform = `scaleX(${order && index === 0 ? 1 - order.remaining / UNITS[order.type].trainTime : 0})`;
    slot.setAttribute('aria-label', order ? `取消${name}，退还 ${order.paid ?? UNITS[order.type].cost} 金币` : `空队列位 ${index + 1}`);
    slot.title = order ? `${name} · ${time}\n点击取消，退还 ${order.paid ?? UNITS[order.type].cost} 金币` : `空队列位 ${index + 1}`;
  });
  const finished = game.status !== 'playing';
  if (finished) targeting = false;
  byId('ability').disabled = finished || game.abilityCooldown > 0;
  byId('ability').setAttribute('aria-pressed', String(targeting));
  setText('ability-state', finished ? '战斗已结束' : game.ability?.type === 'renewal' ? `治疗中 · ${Math.ceil(game.ability.remaining)} 秒 · 冷却 ${Math.ceil(game.abilityCooldown)} 秒` : game.abilityCooldown > 0 ? `冷却中 · ${Math.ceil(game.abilityCooldown)} 秒` : targeting ? '等待落点 · 再次点击取消' : ABILITIES[AGES[game.ages.player].ability].targeting === 'allies' ? '立即治疗 · 已就绪' : '选择落点 · 已就绪');
  setText('ability-timer', finished ? '—' : game.abilityCooldown > 0 ? `${Math.ceil(game.abilityCooldown)}s` : targeting ? '◎' : '✓');
  byId('ability').title = `${byId('ability-description').textContent}\n${byId('ability-state').textContent} · Q`;
  byId('ability').setAttribute('aria-label', byId('ability-name').textContent);
  byId('target-banner').hidden = !targeting;
  canvas.classList.toggle('targeting', targeting);
  const paused = manualPaused || document.hidden || helpDialog.open || civilization?.paused;
  setText('pause-battle', manualPaused ? '继续' : '暂停');
  byId('pause-battle').disabled = finished;
  byId('pause-battle').setAttribute('aria-pressed', String(manualPaused));
  byId('pause-battle').title = `${manualPaused ? '继续' : '暂停'} · 空格`;
  setText('phase', finished ? '战斗结束' : paused ? '已暂停' : '交战中');
  setIcon(byId('phase-icon'), finished ? 'check' : paused ? 'pause' : 'play');
  byId('phase-icon').title = byId('phase').textContent;
  byId('result').hidden = !finished;
  if (finished && !announcedResult) {
    announcedResult = true;
    const title = game.status === 'won' ? '胜利' : game.status === 'lost' ? '战败' : '平局';
    const detail = game.status === 'won' ? '敌方基地已被摧毁。' : game.status === 'lost' ? '我方基地已被摧毁。' : '双方基地同时被摧毁。';
    setText('result-title', title);
    setText('result-detail', `${detail}用时 ${formatTime(game.elapsed)}`);
    civilization?.sync();
    announce(`${byId('result-title').textContent}。${byId('result-detail').textContent}`);
    byId('play-again').focus({ preventScroll: true });
    civilization?.presentEnd();
  }
  civilization?.sync();
}

function train(type) {
  if (recruit(game, type)) {
    announce(`${UNITS[type].name}已加入训练队列。`);
    syncUI();
  }
}

function constructTurret(type = AGES[game.ages.player].turrets[0]) {
  if (buildTurret(game, 'player', type, selectedSlot)) {
    announce(`${TURRETS[type].name}已建造。`);
    const empty = game.turrets.player.indexOf(null);
    if (empty >= 0) selectedSlot = empty;
    syncUI();
    render(game, { targeting, targetX });
  }
}

function evolvePlayer() {
  if (evolve(game)) {
    civilization?.save();
    syncUI();
    render(game, { targeting, targetX });
  }
}

function toggleAbility() {
  if (game.status !== 'playing' || game.abilityCooldown > 0) return;
  if (ABILITIES[AGES[game.ages.player].ability].targeting === 'allies') {
    if (castAbility(game)) {
      announce('复苏之光已释放，全场友军持续恢复生命。');
      syncUI();
      render(game);
    }
    return;
  }
  targeting = !targeting;
  syncUI();
  if (targeting) {
    announce(`选择${ABILITIES[AGES[game.ages.player].ability].name}落点。点击战场或用方向键调整，Enter 释放，Escape 取消。`);
    canvas.focus({ preventScroll: true });
    canvas.scrollIntoView({ block: 'nearest' });
  }
}

function releaseAbility() {
  if (targeting && castAbility(game, targetX)) {
    targeting = false;
    announce(`${ABILITIES[AGES[game.ages.player].ability].name}已释放。`);
    syncUI();
    render(game, { targeting, targetX });
  }
}

function restart() {
  if (civilization) return civilization.restart();
  game = createGame();
  resetBattleView();
  announce('新一局开始。');
  syncUI();
  render(game, { targeting, targetX });
  byId('recruit').focus({ preventScroll: true });
}

function resetBattleView() {
  manualPaused = false;
  accumulator = 0;
  lastTime = null;
  announcedResult = false;
  announcedAges = { player: 1, enemy: 1 };
  selectedSlot = 0;
  targeting = false;
  targetX = RULES.width / 2;
  displayedAge = 0;
}

function openHelp() {
  accumulator = 0;
  lastTime = null;
  helpDialog.showModal();
  syncUI();
}

function closeHelp() {
  accumulator = 0;
  lastTime = null;
  helpDialog.close();
  syncUI();
}

function togglePause() {
  if (game.status !== 'playing') return;
  manualPaused = !manualPaused;
  accumulator = 0; lastTime = null;
  syncUI();
}
byId('pause-battle').hidden = false;
byId('pause-battle').addEventListener('click', togglePause);
byId('help').addEventListener('click', openHelp);
byId('close-help').addEventListener('click', closeHelp);
helpDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeHelp();
});
byId('restart').addEventListener('click', restart);
byId('play-again').addEventListener('click', () => civilization ? civilization.resultAction() : restart());
byId('expand-turrets').addEventListener('click', () => {
  if (expandTurretSlots(game)) {
    selectedSlot = game.turrets.player.length - 1;
    announce(`已解锁炮位 ${selectedSlot + 1}。`);
    syncUI();
    render(game, { targeting, targetX });
  }
});
byId('sell-turret').addEventListener('click', () => {
  if (sellTurret(game, selectedSlot)) {
    announce('炮塔已拆除，返还一半建造费用。');
    syncUI();
    render(game, { targeting, targetX });
  }
});
byId('evolve').addEventListener('click', evolvePlayer);
byId('ability').addEventListener('click', toggleAbility);
byId('cancel-target').addEventListener('click', () => { targeting = false; syncUI(); byId('ability').focus({ preventScroll: true }); });
function pointerX(event) {
  const bounds = canvas.getBoundingClientRect();
  return Math.max(0, Math.min(RULES.width, (event.clientX - bounds.left) / bounds.width * RULES.width));
}
canvas.addEventListener('pointermove', event => { if (targeting) targetX = pointerX(event); });
canvas.addEventListener('click', event => { if (targeting) { targetX = pointerX(event); releaseAbility(); } });
window.addEventListener('keydown', event => {
  if (civilization?.modalOpen) return;
  if (helpDialog.open) {
    if (event.code === 'Escape') { event.preventDefault(); closeHelp(); }
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.key === '?' || (event.code === 'Slash' && event.shiftKey)) {
    event.preventDefault();
    if (!event.repeat) openHelp();
    return;
  }
  // Space is always pause in the battlefield, including focused buttons and aiming.
  // Inputs and modal dialogs above retain their native keyboard behavior.
  if (event.code === 'Space') {
    event.preventDefault();
    if (!event.repeat) togglePause();
    return;
  }
  if (event.code === 'Enter' && event.target.closest('button')) return;
  if (targeting && ['ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(event.code)) {
    event.preventDefault();
    if (event.repeat && !event.code.startsWith('Arrow')) return;
    if (event.code === 'Escape') { targeting = false; syncUI(); }
    else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') targetX = Math.max(0, Math.min(RULES.width, targetX + (event.code === 'ArrowLeft' ? -24 : 24)));
    else releaseAbility();
    return;
  }
  const roster = getAgeUnits(game.ages.player);
  const actions = { Digit1: () => train(roster[0]), Digit2: () => train(roster[1]), Digit3: () => train(roster[2]), Digit4: () => { if (roster[3]) train(roster[3]); }, KeyE: evolvePlayer, KeyT: constructTurret, KeyQ: toggleAbility };
  if (actions[event.code]) {
    event.preventDefault();
    if (!event.repeat) actions[event.code]();
  }
});
document.addEventListener('visibilitychange', () => {
  accumulator = 0;
  lastTime = null;
  if (document.hidden) civilization?.save();
  syncUI();
});
window.addEventListener('pagehide', () => civilization?.save());
byId('mode-link').addEventListener('click', () => civilization?.save());
byId('debug-link').addEventListener('click', () => civilization?.save());

function frame(timestamp) {
  if (lastTime !== null && !manualPaused && !document.hidden && !helpDialog.open && !civilization?.paused && game.status === 'playing') {
    accumulator += Math.min((timestamp - lastTime) / 1000, 0.1) * (civilization?.timeScale ?? 1);
    while (accumulator >= RULES.fixedStep && game.status === 'playing') {
      if (civilization) civilization.step(RULES.fixedStep);
      else updateGame(game, RULES.fixedStep);
      accumulator -= RULES.fixedStep;
    }
  }
  lastTime = timestamp;
  syncUI();
  // The full-screen home has its own static scene; avoid painting the hidden battlefield.
  if (!civilization?.homeOpen) render(game, { targeting, targetX });
  requestAnimationFrame(frame);
}

syncUI();
render(game, { targeting, targetX });
requestAnimationFrame(frame);
