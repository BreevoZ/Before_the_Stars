import { AGES, UNITS, TURRETS, ABILITIES, RULES, createGame, buildTurret, getTurretPosition, castAbility, updateGame } from './game.js';
import { drawUnit } from './units.js';
import { drawTurret } from './turrets.js';
import { drawBase } from './bases.js';
import { drawProjectile, drawFields } from './combat-effects.js';
import { drawLandscape, drawBattleEffects } from './render.js';
import { getMountPose } from './mount-motion.js';

export const CLIP_SECONDS = 8;
export const CATEGORIES = { all: '全部', unit: '部队', turret: '炮塔', combat: '弹道与命中', ability: '大招与地面', scene: '基地与环境' };
const mountNotes = { heavy: '双足承重 · 趾爪落地 · 髋部随步伐起伏', knight: '四足错相 · 蹄部支撑 · 膝与飞节分段弯曲' };
export const ANIMATION_CLIPS = [
  ...['heavy', 'knight', ...Object.keys(UNITS).filter(type => !mountNotes[type])].map(type => ({
    id: `unit-${type}`, category: 'unit', kind: 'unit', type, age: UNITS[type].age,
    name: UNITS[type].name, note: mountNotes[type] ?? UNITS[type].description,
  })),
  ...Object.entries(TURRETS).map(([type, stats]) => ({ id: `turret-${type}`, category: 'turret', kind: 'turret', type, age: stats.age, name: stats.name, note: stats.description })),
  ...[['unit', UNITS], ['turret', TURRETS]].flatMap(([source, types]) => Object.entries(types).map(([type, stats]) => ({
    id: `combat-${source}-${type}`, category: 'combat', kind: 'combat', source, type, age: stats.age,
    name: `${stats.name} · ${stats.projectile ? '弹道' : '命中'}`, note: stats.description,
  }))),
  ...Object.entries(AGES).map(([age, stats]) => ({ id: `ability-${stats.ability}`, category: 'ability', kind: 'ability', type: stats.ability, age: +age, name: ABILITIES[stats.ability].name, note: ABILITIES[stats.ability].description })),
  ...['fire', 'oil'].map(type => ({ id: `field-${type}`, category: 'ability', kind: 'field', type, age: 2, name: type === 'fire' ? '燃烧区域' : '沸油与蒸汽', note: '落地后持续 2.4 秒 · 末段消散' })),
  ...Object.entries(AGES).map(([age, stats]) => ({ id: `base-${age}`, category: 'scene', kind: 'base', age: +age, name: `${stats.shortName}基地`, note: '1–4 炮位扩容 → 进化光环 → 受损 → 废墟' })),
  { id: 'day-night', category: 'scene', kind: 'sky', name: '昼夜更替', note: '将完整的 120 秒昼夜压缩到 8 秒预览' },
  { id: 'stars', category: 'scene', kind: 'stars', name: '星空闪烁', note: '夜间原速 · 每颗星拥有独立的闪烁节奏' },
];

function soldier(id, type, team, x) {
  return { id, type, team, x, hp: UNITS[type].health, attackCooldown: 0.35, attackAnimation: 0, hitFlash: 0, moving: false, distanceTravelled: 0 };
}

// Each preview is an isolated real battle with passive, stationary targets.
// Quarter-second checkpoints make backward scrubbing deterministic and cheap.
export function createClipSampler(clip, team) {
  let game = createGame(); game.ai.enabled = false;
  const direction = team === 'player' ? 1 : -1, opponent = team === 'player' ? 'enemy' : 'player';
  const source = clip.source ?? clip.kind;
  const held = new Map();
  let sourceId = null, origin = null;
  if (clip.kind === 'ability') {
    game.ages.player = clip.age;
    const type = AGES[clip.age].units[0];
    for (const [i, x] of [520, 640, 760].entries()) {
      const unit = soldier(i + 1, type, clip.type === 'renewal' ? 'player' : 'enemy', x);
      unit.hp = clip.type === 'renewal' ? UNITS[type].health * 0.2 : 1e8;
      game.units.push(unit);
    }
    castAbility(game, 640);
  } else if (source === 'turret') {
    const stats = TURRETS[clip.type];
    game.ages[team] = stats.age; game.gold[team] = stats.cost;
    game.bases[team].x = team === 'player' ? 300 : 980;
    buildTurret(game, team, clip.type);
    game.turrets[team][0].cooldown = 0.35;
    origin = getTurretPosition(game, team, 0);
    const targetX = origin.x + direction * Math.min(220, stats.range * 0.8);
    for (let i = 0; i < (stats.pierce ? stats.pierce + 1 : 1); i++) {
      game.units.push(soldier(i + 1, 'swordsman', opponent, targetX + direction * i * 35));
    }
  } else {
    const stats = UNITS[clip.type]; sourceId = 1;
    const x = team === 'player' ? 500 : 780;
    game.units.push(soldier(sourceId, clip.type, team, x));
    game.units.push(soldier(2, 'swordsman', opponent, x + direction * Math.min(220, stats.range * 0.9)));
  }
  for (const unit of game.units) held.set(unit.id, unit.x);
  const checkpoints = new Map([[0, structuredClone(game)]]);
  let frame = 0;
  return time => {
    const target = Math.max(0, Math.min(CLIP_SECONDS * 60, Math.floor(time * 60 + 1e-6)));
    if (target < frame) {
      frame = Math.floor(target / 15) * 15;
      while (!checkpoints.has(frame)) frame -= 15;
      game = structuredClone(checkpoints.get(frame));
    }
    while (frame < target) {
      for (const unit of game.units) {
        unit.x = held.get(unit.id);
        if (unit.id !== sourceId) {
          unit.attackCooldown = 1000;
          if (clip.type !== 'renewal') unit.hp = 1e8;
        } else if (unit.type === 'knight') unit.chargeTravel = UNITS.knight.chargeDistance;
      }
      updateGame(game, RULES.fixedStep);
      for (const unit of game.units) { unit.x = held.get(unit.id); unit.moving = false; }
      frame++;
      if (frame % 15 === 0) checkpoints.set(frame, structuredClone(game));
    }
    return { game, origin, sourceId };
  };
}

function ground(ctx, width, distance = 0, direction = 1) {
  ctx.strokeStyle = '#697a4b55'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-width, 0); ctx.lineTo(width, 0); ctx.stroke();
  ctx.fillStyle = '#91a37440';
  const scroll = ((distance * direction) % 24 + 24) % 24;
  for (let x = -width - scroll; x < width; x += 24) ctx.fillRect(x, 7, 4, 1);
}

function gaitGuides(ctx, unit, time, scale) {
  if (!mountNotes[unit.type]) return;
  const remaining = unit.attackAnimation ?? 0;
  const progress = remaining > 0 ? 1 - remaining / UNITS[unit.type].attackDuration : 1;
  const strike = remaining ? Math.max(0, Math.sin(Math.PI * Math.min(1, progress * 1.3 + 0.15))) : 0;
  const pose = getMountPose({ horse: unit.type === 'knight', distance: unit.distanceTravelled ?? time * UNITS[unit.type].speed, moving: unit.moving, strike, offset: (unit.id * 0.17) % 1 });
  ctx.save(); ctx.translate(unit.x, 0); ctx.scale((unit.team === 'player' ? 1 : -1) * scale, scale);
  for (const leg of pose.legs) {
    ctx.strokeStyle = leg.far ? '#e7bf8c' : '#d6e8bd'; ctx.lineWidth = 0.7;
    ctx.beginPath(); [leg.hip, leg.knee, leg.ankle, leg.foot].forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    for (const [x, y] of [leg.hip, leg.knee, leg.ankle]) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.stroke(); }
    if (leg.planted) { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(leg.foot[0] - 4, 0); ctx.lineTo(leg.foot[0] + 6, 0); ctx.stroke(); }
  }
  ctx.restore();
}

export function createClipPainter(canvas, clip) {
  const ctx = canvas.getContext('2d'), samplers = new Map();
  function sample(team, time) {
    if (!samplers.has(team)) samplers.set(team, createClipSampler(clip, team));
    return samplers.get(team)(time);
  }
  return (time, { team = 'player', action = 'march', guides = false } = {}) => {
    const bounds = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
    if (!bounds.width || !bounds.height) return;
    const width = Math.round(bounds.width * ratio), height = Math.round(bounds.height * ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#1d2d24'; ctx.fillRect(0, 0, width, height);
    if (clip.kind === 'sky' || clip.kind === 'stars') {
      const scale = width / RULES.width, h = height / scale;
      ctx.scale(scale, scale); drawLandscape(ctx, h, h * 0.78, clip.kind === 'sky' ? time * 15 : 83 + time); return;
    }
    const direction = team === 'player' ? 1 : -1;
    const worldWidth = clip.kind === 'ability' ? 850 : clip.kind === 'combat' ? 450 : clip.kind === 'base' ? 280 : clip.kind === 'unit' ? 200 : 270;
    const worldHeight = clip.kind === 'ability' ? 410 : clip.kind === 'base' ? 240 : clip.kind === 'combat' ? 240 : 150;
    const scale = Math.min(width / worldWidth, height / worldHeight);
    ctx.setTransform(scale, 0, 0, scale, width / 2, height * 0.84);
    const floorWidth = width / scale;
    ground(ctx, floorWidth, clip.kind === 'unit' && action === 'march' ? time * UNITS[clip.type].speed : 0, direction);
    if (clip.kind === 'unit') {
      let unit = soldier(1, clip.type, team, -direction * 13);
      if (action === 'attack') unit = { ...sample(team, time).game.units[0], x: -direction * 13 };
      if (action === 'march') { unit.moving = true; unit.distanceTravelled = time * UNITS[clip.type].speed; }
      if (action === 'hit') {
        unit.hitFlash = Math.max(0, 0.14 - time % 1.2);
        unit.guardFlash = Math.max(0, 0.18 - time % 1.2); unit.hp *= 0.65;
      }
      drawUnit(ctx, unit, time);
      if (guides) gaitGuides(ctx, unit, time, 1);
    } else if (clip.kind === 'turret') {
      drawTurret(ctx, sample(team, time).game.turrets[team][0], time, 2);
    } else if (clip.kind === 'combat') {
      const { game, origin, sourceId } = sample(team, time);
      const sourceX = origin?.x ?? game.units[0].x, targetX = game.units.find(unit => unit.id !== sourceId).x;
      ctx.translate(-(sourceX + targetX) / 2, 0);
      drawFields(ctx, game, time, 1, false);
      if (origin) {
        drawBase(ctx, game.bases[team], game.ages[team], time, 1, 1);
        ctx.save(); ctx.translate(origin.x, origin.y); drawTurret(ctx, game.turrets[team][0], time, 1, false, true); ctx.restore();
      }
      for (const unit of game.units) drawUnit(ctx, unit, time);
      for (const shot of game.projectiles) drawProjectile(ctx, shot);
      drawBattleEffects(ctx, game);
    } else if (clip.kind === 'ability') {
      const { game } = sample('player', clip.type === 'renewal' ? time : time % 4); ctx.translate(-640, 0);
      for (const unit of game.units) drawUnit(ctx, unit, time);
      drawBattleEffects(ctx, game, 1, false, 320);
    } else if (clip.kind === 'field') {
      const remaining = 2.4 - time % 3;
      const radius = TURRETS[clip.type === 'fire' ? 'fireCatapult' : 'oil'].fieldRadius;
      if (remaining > 0) drawFields(ctx, { fields: [{ kind: clip.type, x: 0, radius, remaining }] }, time, 1, false);
    } else if (clip.kind === 'base') {
      const hp = time < 5.5 ? 100 : time < 6.8 ? 30 : 0;
      drawBase(ctx, { team, x: 0, hp, maxHp: 100, hitFlash: time >= 5.5 && time < 5.65 ? 0.15 : 0 }, clip.age, time, 1, Math.min(4, 1 + Math.floor(time / 1.2)));
      if (time >= 4.3 && time < 5.5) drawBattleEffects(ctx, { effects: [{ kind: 'evolve', team, x: 0, life: 5.5 - time, duration: 1.2 }], units: [] });
    }
  };
}
