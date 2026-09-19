import { Q } from './quantity.js';
import { stat } from './stats.js';
import { buildViewModel } from './view-model.js';
import { createBindings } from './dom-bindings.js';
import { createBattleUI, setIcon } from './battle-ui.js';
import { RULES, UNITS, AGES, TURRETS, ABILITIES, getAgeUnits, createGame, recruit, cancelTraining, evolve, buildTurret, expandTurretSlots, sellTurret, castAbility, updateGame } from './game.js';
import { createCivilizationUI } from './civilization-ui.js';
import { getGameMode } from './debug.js';
import { createRenderer } from './render.js';

const byId = id => document.getElementById(id);
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
const queueSlots = [];
function ensureQueueSlots(count) {
  while (queueSlots.length < count) {
    const index = queueSlots.length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'queue-slot';
    button.innerHTML = '<span class="queue-fill" aria-hidden="true"></span><span class="queue-icon" aria-hidden="true"></span><span class="queue-name sr-only"></span><span class="queue-time"></span>';
    button.addEventListener('click', () => {
      const order = game.queues.player[index];
      if (order && cancelTraining(game, order.id)) {
        announce(`已取消${UNITS[order.type].name}，退还 ${Q.format(order.paid ?? UNITS[order.type].cost)} 金币。`);
        syncUI();
      }
    });
    byId('training-queue').append(button);
    queueSlots.push(button);
  }
}
ensureQueueSlots(RULES.queueLimit);
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
let announcedAges = { player: 1, enemy: 1 };
let selectedSlot = 0;

const bindBattle = createBattleUI();
const bindAnnouncement = createBindings(document, { '#announcement': value => value });
const announce = message => bindAnnouncement(message);

for (const card of cards) card.addEventListener('click', () => train(card.dataset.unit));
for (const card of towerCards) card.addEventListener('click', () => constructTurret(card.dataset.turret));

function syncUI() {
  const vm = buildViewModel(civilization?.session ?? { game }, {
    selectedSlot, targeting, manualPaused, queueSlots: queueSlots.length,
    paused: document.hidden || helpDialog.open || civilization?.paused,
  });
  selectedSlot = vm.selectedSlot; targeting = vm.targeting;
  ensureQueueSlots(vm.queueCount);
  bindBattle(vm.bindings);
  civilization?.sync();
  const ageAnnouncements = [];
  for (const team of ['player', 'enemy']) if (announcedAges[team] !== game.ages[team]) {
    ageAnnouncements.push(`${team === 'player' ? '我方' : '敌方'}已进化至${AGES[game.ages[team]].name}。`);
    announcedAges[team] = game.ages[team];
  }
  if (ageAnnouncements.length) announce(ageAnnouncements.join(''));
  if (vm.finished && !announcedResult) {
    announcedResult = true;
    announce(`${byId('result-title').textContent}。${byId('result-detail').textContent}`);
    byId('play-again').focus({ preventScroll: true });
    civilization?.presentEnd();
  }
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
  if (game.status !== 'playing' || game.abilityCooldown > 0 || !stat(game, 'player', 'canCast') || !stat(game, { kind: 'ability', type: AGES[game.ages.player].ability }, 'enabled')) return;
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
