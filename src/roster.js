import { AGES, UNITS, TURRETS, createGame, buildTurret, getTurretPosition, updateGame } from './game.js';
import { drawUnit } from './units.js';
import { drawTurret } from './turrets.js';
const root = document.getElementById('roster');
const action = document.getElementById('action');
const team = document.getElementById('team');
const pause = document.getElementById('pause');
const isTurret = document.body.dataset.roster === 'turrets';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const themes = isTurret
  ? ['弹力 · 抛蛋 · 巨石', '配重 · 火弹 · 沸油', '铜炮 · 实心弹 · 榴弹', '点射 · 双管 · 火箭', '动能 · 激光 · 离子']
  : ['兽皮 · 石器 · 巨兽', '锁甲 · 长弓 · 骑兵', '羽帽 · 细剑 · 火药', '钢盔 · 自动武器 · 履带', '能量装甲 · 光刃 · 悬浮'];
const previews = [];
function turretPreview(type, side) {
  const stats = TURRETS[type], game = createGame();
  game.ai.enabled = false; game.ages[side] = stats.age; game.gold[side] = stats.cost;
  buildTurret(game, side, type);
  const origin = getTurretPosition(game, side, 0);
  const targetX = origin.x + (side === 'player' ? 1 : -1) * Math.min(200, stats.range * 0.8);
  game.units.push({ id: 1, team: side === 'player' ? 'enemy' : 'player', type: 'heavy', x: targetX, hp: 1e9, attackCooldown: 1000, attackAnimation: 0, hitFlash: 0 });
  return { game, targetX, side, turret: game.turrets[side][0] };
}
for (const [index, age] of Object.values(AGES).entries()) {
  const section = document.createElement('section');
  section.innerHTML = `<h2><span>${age.numeral}</span>${age.name}<small class="age-note">${themes[index]}</small></h2><div class="cards"></div>`;
  for (const type of isTurret ? age.turrets : age.units) {
    const stats = (isTurret ? TURRETS : UNITS)[type];
    const card = document.createElement('article'); card.className = 'unit';
    const damage = `${stats.damage}${stats.burst ? ` × ${stats.burst}` : ''} ${isTurret ? '单轮伤害' : '伤害'}`;
    const attributes = isTurret ? `${damage} · ${stats.range} 射程<br>${stats.interval} 秒冷却${stats.chargeTime ? ` + ${stats.chargeTime} 秒充能` : ''}${stats.splash ? ` · ${stats.splash} 爆炸半径` : ''}`
      : `${stats.health} 生命 · ${stats.armor} 护甲 · ${damage}<br>${stats.range} 射程 · ${stats.attackInterval} 秒攻击间隔${stats.baseRange ? ` · ${stats.baseRange} 攻城射程` : ''}`;
    card.innerHTML = `<canvas role="img" aria-label="${stats.name}的装备与动作预览"></canvas><div class="unit-info"><h3>${stats.name}</h3><p class="role">${stats.description}</p><p class="stats">${attributes}</p><p class="price">${stats.cost} 金币${isTurret ? ` / 拆除返还 ${Math.floor(stats.cost / 2)}` : ` / ${stats.trainTime} 秒训练`}</p></div>`;
    section.querySelector('.cards').append(card);
    const canvas = card.querySelector('canvas');
    previews.push({ canvas, context: canvas.getContext('2d'), visible: true, stats, type,
      battle: isTurret ? turretPreview(type, 'player') : null,
      unit: { id: previews.length + 1, type, team: 'player', x: 135, hp: stats.health, attackAnimation: 0, attackCooldown: 0, moving: true, distanceTravelled: 0 } });
  }
  root.append(section);
}
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) previews.find(preview => preview.canvas === entry.target).visible = entry.isIntersecting;
});
previews.forEach(preview => observer.observe(preview.canvas));
let paused = reducedMotion.matches, elapsed = 0, previous = null;
function syncPause() { pause.textContent = paused ? '播放动画' : '暂停动画'; pause.setAttribute('aria-pressed', String(paused)); }
pause.addEventListener('click', () => { paused = !paused; syncPause(); });
reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; syncPause(); });
syncPause();
function frame(now) {
  const dt = previous !== null && !paused && !document.hidden ? Math.min((now - previous) / 1000, 0.05) : 0;
  elapsed += dt; previous = now;
  for (const preview of previews) {
    const { canvas, context, visible, stats, unit } = preview;
    if (!visible) continue;
    const bounds = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(bounds.width * ratio), height = Math.round(bounds.height * ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, width, height);
    const scale = width / 320; context.setTransform(scale, 0, 0, scale, 0, height * 0.86);
    if (isTurret) {
      if (preview.battle.side !== team.value) preview.battle = turretPreview(preview.type, team.value);
      const { game, targetX, turret } = preview.battle;
      if (action.value === 'attack' && dt) {
        game.units[0].x = targetX; game.units[0].hp = 1e9; game.units[0].attackCooldown = 1000;
        updateGame(game, dt);
      }
      context.translate(team.value === 'player' ? 145 : 175, 0);
      const model = action.value === 'idle' ? { type: preview.type, team: team.value, cooldown: 0 } : turret;
      drawTurret(context, model, game.elapsed, 2.4, reducedMotion.matches && paused);
    } else {
      unit.team = team.value; unit.x = team.value === 'player' ? 133 : 187;
      unit.moving = action.value === 'march'; unit.distanceTravelled = unit.moving ? elapsed * stats.speed : 0;
      const phase = elapsed % stats.attackInterval;
      const shotAge = stats.burst ? phase - Math.min(stats.burst - 1, Math.floor(phase / stats.burstInterval)) * stats.burstInterval : phase;
      unit.attackAnimation = action.value === 'attack' ? Math.max(0, stats.attackDuration - shotAge) : 0;
      unit.attackCooldown = action.value === 'attack' ? stats.attackInterval - phase : 0;
      unit.lastAttackCharged = unit.type === 'knight';
      drawUnit(context, unit, elapsed, 1.38, reducedMotion.matches && paused);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
