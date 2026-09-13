import { RULES, createGame, getRecruitState, recruit, updateGame } from './game.js';
import { createRenderer } from './render.js';

const byId = id => document.getElementById(id);
const ui = Object.fromEntries([
  'player-health', 'enemy-health', 'player-health-bar', 'enemy-health-bar', 'player-count',
  'enemy-count', 'clock', 'phase', 'recruit', 'recruit-label', 'cooldown-fill', 'result',
  'result-title', 'result-detail', 'play-again', 'restart', 'announcement',
].map(id => [id, byId(id)]));
const render = createRenderer(byId('battlefield'));
let game = createGame();
let lastTime = null;
let accumulator = 0;
let announcedResult = false;

byId('recruit-rule').textContent = `出兵冷却 ${RULES.playerRecruitInterval} 秒 · 我方最多 ${RULES.armyLimit} 人`;
for (const team of ['player', 'enemy']) ui[`${team}-health-bar`].max = RULES.baseHealth;

function formatTime(seconds) {
  const total = Math.floor(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function syncUI() {
  for (const team of ['player', 'enemy']) {
    const hp = game.bases[team].hp;
    ui[`${team}-health`].textContent = `${hp} / ${RULES.baseHealth}`;
    ui[`${team}-health-bar`].value = hp;
    ui[`${team}-count`].textContent = game.units.filter(unit => unit.team === team).length;
  }
  ui.clock.textContent = formatTime(game.elapsed);
  const recruitment = getRecruitState(game);
  ui.recruit.disabled = recruitment !== 'ready';
  const labels = {
    ready: '派出近战兵', cooldown: `准备中 ${game.recruitCooldown.toFixed(1)}s`,
    full: '战场兵力已满', blocked: '等待营地出口', finished: '战斗已结束',
  };
  ui['recruit-label'].textContent = labels[recruitment];
  ui['cooldown-fill'].style.transform = `scaleX(${recruitment === 'cooldown' ? 1 - game.recruitCooldown / RULES.playerRecruitInterval : 0})`;
  const finished = game.status !== 'playing';
  ui.phase.textContent = finished ? '战斗结束' : document.hidden ? '已暂停' : '交战中';
  ui.result.hidden = !finished;
  if (finished && !announcedResult) {
    announcedResult = true;
    const title = game.status === 'won' ? '胜利' : game.status === 'lost' ? '战败' : '平局';
    const detail = game.status === 'won' ? '敌方基地已被摧毁。' : game.status === 'lost' ? '我方基地已被摧毁。' : '双方基地同时被摧毁。';
    ui['result-title'].textContent = title;
    ui['result-detail'].textContent = `${detail}用时 ${formatTime(game.elapsed)}`;
    ui.announcement.textContent = `${title}。${detail}`;
    ui['play-again'].focus({ preventScroll: true });
  }
}

function sendUnit() {
  if (recruit(game)) {
    syncUI();
    render(game);
  }
}

function restart() {
  game = createGame();
  accumulator = 0;
  lastTime = null;
  announcedResult = false;
  ui.announcement.textContent = '新一局开始。';
  syncUI();
  render(game);
  ui.recruit.focus({ preventScroll: true });
}

ui.recruit.addEventListener('click', sendUnit);
ui.restart.addEventListener('click', restart);
ui['play-again'].addEventListener('click', restart);
window.addEventListener('keydown', event => {
  // Native buttons retain Space/Enter activation; the global shortcut handles the battlefield.
  if (event.code !== 'Space' || event.target.closest('button, input, textarea, select, [contenteditable]')) return;
  event.preventDefault();
  if (!event.repeat) sendUnit();
});
document.addEventListener('visibilitychange', () => {
  // Hidden tabs pause, so returning never causes a burst of simulation or enemy spawns.
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
  render(game);
  requestAnimationFrame(frame);
}

syncUI();
render(game);
requestAnimationFrame(frame);
