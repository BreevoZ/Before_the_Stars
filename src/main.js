import { RULES, UNITS, createGame, getRecruitState, recruit, cancelTraining, getTurretState, buildTurret, castMeteor, updateGame } from './game.js';
import { createRenderer } from './render.js';

const byId = id => document.getElementById(id);
const canvas = byId('battlefield');
const render = createRenderer(canvas);
const cards = [...document.querySelectorAll('[data-unit]')];
const queueSlots = Array.from({ length: RULES.queueLimit }, (_, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'queue-slot';
  button.innerHTML = '<span class="queue-fill" aria-hidden="true"></span><span class="queue-name"></span><span class="queue-time"></span>';
  button.addEventListener('click', () => {
    const order = game.queues.player[index];
    if (order && cancelTraining(game, order.id)) {
      announce(`已取消${UNITS[order.type].name}，退还 ${UNITS[order.type].cost} 金币。`);
      syncUI();
    }
  });
  byId('training-queue').append(button);
  return button;
});
let game = createGame();
let lastTime = null;
let accumulator = 0;
let announcedResult = false;
let targeting = false;
let targetX = RULES.width / 2;

function setText(id, value) {
  const element = byId(id);
  if (element.textContent !== String(value)) element.textContent = value;
}
const announce = message => setText('announcement', message);
const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;

setText('income-rate', `+${RULES.goldPerSecond} / 秒`);
setText('recruit-rule', `队列 ${RULES.queueLimit} 位 · 兵力上限 ${RULES.armyLimit}（含训练中）`);
setText('meteor-description', `${RULES.meteorDamage} 范围伤害 · ${RULES.meteorCooldown} 秒冷却 · 不伤友军`);
for (const team of ['player', 'enemy']) byId(`${team}-health-bar`).max = RULES.baseHealth;
for (const card of cards) {
  const stats = UNITS[card.dataset.unit];
  card.querySelector('[data-cost]').textContent = `${stats.cost} 金币`;
  card.querySelector('[data-training]').textContent = `${stats.trainTime}s`;
  card.title = `${stats.health} 生命 / ${stats.damage} 攻击 / ${stats.armor} 护甲 / ${stats.range} 射程`;
  card.setAttribute('aria-label', `训练${stats.name}，${stats.cost} 金币，耗时 ${stats.trainTime} 秒`);
  card.addEventListener('click', () => train(card.dataset.unit));
}

function syncUI() {
  for (const team of ['player', 'enemy']) {
    const hp = game.bases[team].hp;
    setText(`${team}-health`, `${hp} / ${RULES.baseHealth}`);
    byId(`${team}-health-bar`).value = hp;
    setText(`${team}-count`, game.units.filter(unit => unit.team === team).length);
  }
  setText('gold', Math.floor(game.gold.player + 0.000001));
  setText('clock', formatTime(game.elapsed));
  for (const card of cards) {
    const state = getRecruitState(game, card.dataset.unit);
    card.disabled = state !== 'ready';
    const label = { ready: '加入队列', gold: '金币不足', 'queue-full': '队列已满', 'army-full': '兵力已满', finished: '战斗已结束' }[state];
    const status = card.querySelector('[data-state]');
    if (status.textContent !== label) status.textContent = label;
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
    slot.querySelector('.queue-time').textContent = time;
    slot.querySelector('.queue-fill').style.transform = `scaleX(${order && index === 0 ? 1 - order.remaining / UNITS[order.type].trainTime : 0})`;
    slot.setAttribute('aria-label', order ? `取消${name}，退还 ${UNITS[order.type].cost} 金币` : `空队列位 ${index + 1}`);
  });
  const turretState = getTurretState(game);
  byId('build-turret').disabled = turretState !== 'ready';
  setText('turret-state', {
    ready: `建造 · ${RULES.turretCost} 金币`, gold: `金币不足 · 需要 ${RULES.turretCost}`,
    built: '已建造 · 自动防御中', finished: '战斗已结束',
  }[turretState]);
  byId('build-turret').classList.toggle('built', Boolean(game.turrets.player));
  const finished = game.status !== 'playing';
  if (finished) targeting = false;
  byId('meteor').disabled = finished || game.meteorCooldown > 0;
  byId('meteor').setAttribute('aria-pressed', String(targeting));
  setText('meteor-state', finished ? '战斗已结束' : game.meteorCooldown > 0 ? `冷却中 · ${Math.ceil(game.meteorCooldown)} 秒` : targeting ? '等待落点 · 再次点击取消' : '选择落点 · 已就绪');
  byId('target-banner').hidden = !targeting;
  canvas.classList.toggle('targeting', targeting);
  setText('phase', finished ? '战斗结束' : document.hidden ? '已暂停' : '交战中');
  byId('result').hidden = !finished;
  if (finished && !announcedResult) {
    announcedResult = true;
    const title = game.status === 'won' ? '胜利' : game.status === 'lost' ? '战败' : '平局';
    const detail = game.status === 'won' ? '敌方基地已被摧毁。' : game.status === 'lost' ? '我方基地已被摧毁。' : '双方基地同时被摧毁。';
    setText('result-title', title);
    setText('result-detail', `${detail}用时 ${formatTime(game.elapsed)}`);
    announce(`${title}。${detail}`);
    byId('play-again').focus({ preventScroll: true });
  }
}

function train(type) {
  if (recruit(game, type)) {
    announce(`${UNITS[type].name}已加入训练队列。`);
    syncUI();
  }
}

function constructTurret() {
  if (buildTurret(game)) {
    announce('守卫炮塔已建造。');
    syncUI();
    render(game, { targeting, targetX });
  }
}

function toggleMeteor() {
  if (game.status !== 'playing' || game.meteorCooldown > 0) return;
  targeting = !targeting;
  syncUI();
  if (targeting) {
    announce('选择陨石落点。点击战场或用方向键调整，Enter 释放，Escape 取消。');
    canvas.focus({ preventScroll: true });
    canvas.scrollIntoView({ block: 'nearest' });
  }
}

function releaseMeteor() {
  if (targeting && castMeteor(game, targetX)) {
    targeting = false;
    announce('陨星天降已释放。');
    syncUI();
    render(game, { targeting, targetX });
  }
}

function restart() {
  game = createGame();
  accumulator = 0;
  lastTime = null;
  announcedResult = false;
  targeting = false;
  targetX = RULES.width / 2;
  announce('新一局开始。');
  syncUI();
  render(game, { targeting, targetX });
  byId('recruit').focus({ preventScroll: true });
}

byId('restart').addEventListener('click', restart);
byId('play-again').addEventListener('click', restart);
byId('build-turret').addEventListener('click', constructTurret);
byId('meteor').addEventListener('click', toggleMeteor);
byId('cancel-target').addEventListener('click', () => { targeting = false; syncUI(); byId('meteor').focus({ preventScroll: true }); });
function pointerX(event) {
  const bounds = canvas.getBoundingClientRect();
  return Math.max(0, Math.min(RULES.width, (event.clientX - bounds.left) / bounds.width * RULES.width));
}
canvas.addEventListener('pointermove', event => { if (targeting) targetX = pointerX(event); });
canvas.addEventListener('click', event => { if (targeting) { targetX = pointerX(event); releaseMeteor(); } });
window.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input, textarea, select, [contenteditable]')) return;
  // Native activation must also work for the cancel-target button while aiming.
  if (['Space', 'Enter'].includes(event.code) && event.target.closest('button')) return;
  if (targeting && ['ArrowLeft', 'ArrowRight', 'Enter', 'Space', 'Escape'].includes(event.code)) {
    event.preventDefault();
    if (event.repeat && !event.code.startsWith('Arrow')) return;
    if (event.code === 'Escape') { targeting = false; syncUI(); }
    else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') targetX = Math.max(0, Math.min(RULES.width, targetX + (event.code === 'ArrowLeft' ? -24 : 24)));
    else releaseMeteor();
    return;
  }
  const actions = { Digit1: () => train('melee'), Digit2: () => train('archer'), Digit3: () => train('heavy'), Space: () => train('melee'), KeyT: constructTurret, KeyQ: toggleMeteor };
  if (actions[event.code]) {
    event.preventDefault();
    if (!event.repeat) actions[event.code]();
  }
});
document.addEventListener('visibilitychange', () => {
  accumulator = 0;
  lastTime = null;
  syncUI();
});

function frame(timestamp) {
  if (lastTime !== null && !document.hidden && game.status === 'playing') {
    accumulator += Math.min((timestamp - lastTime) / 1000, 0.1);
    while (accumulator >= RULES.fixedStep) {
      updateGame(game, RULES.fixedStep);
      accumulator -= RULES.fixedStep;
    }
  }
  lastTime = timestamp;
  syncUI();
  render(game, { targeting, targetX });
  requestAnimationFrame(frame);
}

syncUI();
render(game, { targeting, targetX });
requestAnimationFrame(frame);
