import { AGES, UNITS, TURRETS, ABILITIES, RULES, createGame, buildTurret, getTurretPosition, castAbility, updateGame, attributes } from './game.js';
import { SUPER_WEAPONS } from './game-config.js';
import { getSuperSoldierBonuses } from './progression-bonuses.js';
import { drawUnit } from './units.js';
import { drawTurret } from './turrets.js';
import { drawBase } from './bases.js';
import { drawProjectile, drawFields } from './combat-effects.js';
import { drawLandscape, drawBattleEffects } from './render.js';
import { getMountPose } from './mount-motion.js';
import { getMeleeMotion } from './melee-motion.js';
import { createTraitSampler } from './trait-scenarios.js';
import { TRAITS } from './traits.js';
import { TRAIT_DESCRIPTIONS } from './talents.js';
import { BASE_DESIGNS } from './base-layouts.js';
import { drawOrbitalScene, ORBITAL_SECONDS } from './orbital-scene.js';
import { drawVoyageScene, VOYAGE_SECONDS } from './voyage-scene.js';
import { drawDestructionScene, DESTRUCTION_SECONDS, createDestructionPreview } from './destruction-scene.js';

export const CLIP_SECONDS = 8;
export const CATEGORIES = { all: '全部', unit: '部队', turret: '炮塔', combat: '弹道与命中', trait: '兵种特性', ability: '大招与地面', scene: '基地与环境' };
const mountNotes = { heavy: '探颈咬合 · 骑手同步刺矛 · 沿矛身回收', knight: '锥身骑枪 · 护手握持 · 沿枪轴直刺' };
export const ANIMATION_CLIPS = [
  ...Object.values(TRAITS).map(trait => ({ id: `trait-${trait.id}`, category: 'trait', kind: 'trait', source: 'unit', type: trait.units[0], trait: trait.id, age: UNITS[trait.units[0]].age, name: `${UNITS[trait.units[0]].name} · ${trait.name}`, note: `${TRAIT_DESCRIPTIONS[trait.id]} · 玩家特性实战预览` })),
  ...['heavy', 'knight', ...Object.keys(UNITS).filter(type => !mountNotes[type])].map(type => ({
    id: `unit-${type}`, category: 'unit', kind: 'unit', type, age: UNITS[type].age,
    name: UNITS[type].name, note: mountNotes[type] ?? UNITS[type].description,
  })),
  ...Object.entries(TURRETS).map(([type, stats]) => ({ id: `turret-${type}`, category: 'turret', kind: 'turret', type, age: stats.age, name: stats.name, note: stats.description })),
  ...[['unit', UNITS], ['turret', TURRETS]].flatMap(([source, types]) => Object.entries(types).map(([type, stats]) => ({
    id: `combat-${source}-${type}`, category: 'combat', kind: 'combat', source, type, age: stats.age,
    name: `${stats.name} · ${stats.projectile ? '弹道' : '命中'}`, note: stats.description,
  }))),
  { id: 'combat-unit-superSoldier-melee', category: 'combat', kind: 'combat', source: 'unit', type: 'superSoldier', age: 5, melee: true, name: '超级士兵 · 激光短匕首', note: `贴身 ${SUPER_WEAPONS.meleeRange} 距离短刺 · 护住躯干、小幅前送、迅速收刀 · 完全穿甲` },
  { id: 'combat-unit-superSoldier-sniper', category: 'combat', kind: 'combat', source: 'unit', type: 'superSoldier', age: 5, sniper: true, name: '超级士兵 · 狙击激光枪', note: `天赋武器 · 锁定连线引导 ${SUPER_WEAPONS.sniper.chargeTime} 秒 → ${SUPER_WEAPONS.sniper.damage} 穿甲激光 → 冷却 ${SUPER_WEAPONS.sniper.attackInterval} 秒` },
  ...Object.entries(AGES).map(([age, stats]) => ({ id: `ability-${stats.ability}`, category: 'ability', kind: 'ability', type: stats.ability, age: +age, name: ABILITIES[stats.ability].name, note: ABILITIES[stats.ability].description })),
  ...['fire', 'oil'].map(type => ({ id: `field-${type}`, category: 'ability', kind: 'field', type, age: 2, name: type === 'fire' ? '燃烧区域' : '沸油与蒸汽', note: '落地后持续 2.4 秒 · 末段消散' })),
  ...Object.entries(AGES).map(([age, stats]) => ({ id: `base-${age}`, category: 'scene', kind: 'base', age: +age, name: `${stats.shortName}基地 · ${BASE_DESIGNS[age].name}`, note: `${BASE_DESIGNS[age].description} 预览扩容、受损与废墟。` })),
  { id: 'day-night', category: 'scene', kind: 'sky', name: '昼夜更替', note: '将完整的 120 秒昼夜压缩到 8 秒预览' },
  { id: 'stars', category: 'scene', kind: 'stars', name: '星空闪烁', note: '夜间原速 · 每颗星拥有独立的闪烁节奏' },
  { id: 'civilization-destruction', category: 'scene', kind: 'destruction', name: '文明毁灭 · 最后的反扑', note: '超级士兵出动 → 核武库启动 → 世界毁灭 → 废墟静默 · 22 秒压缩到 8 秒，可拖动预览' },
  { id: 'orbital-launch', category: 'scene', kind: 'orbital', name: 'VI · 轨道启航', note: '36 艘火箭从废墟升空，镜头进入星空 · 24 秒演出压缩到 8 秒，可拖动预览' },
  { id: 'interplanetary-voyage', category: 'scene', kind: 'voyage', name: 'VII · 月面远航', note: '月影渐显 → 七点灯火依次启航 → 行星际文明 · 30 秒压缩到 8 秒，可拖动预览' },
];

function soldier(id, type, team, x) {
  return { id, type, team, x, hp: UNITS[type].health, attackCooldown: 0.35, attackAnimation: 0, hitFlash: 0, moving: false, distanceTravelled: 0 };
}

// Each preview is an isolated real battle with passive, stationary targets.
// Quarter-second checkpoints make backward scrubbing deterministic and cheap.
export function createClipSampler(clip, team) {
  if (clip.kind === 'trait') return createTraitSampler(clip);
  let game = createGame(clip.sniper ? { mode: 'incremental', bonuses: getSuperSoldierBonuses(true).map(effect => ({ ...effect, target: { ...effect.target, team } })) } : {}); game.ai.enabled = false;
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
    game.units.push(soldier(2, 'swordsman', opponent, x + direction * (clip.sniper ? 390 : clip.melee ? stats.meleeRange * 0.95 : Math.min(220, stats.range * 0.9))));
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
  const attack = getMeleeMotion(unit.type, { remaining, duration: UNITS[unit.type].attackDuration,
    cooldown: unit.attackCooldown ?? 0, approach: unit.attackApproach ?? 0, moving: unit.moving,
    charged: (unit.lastAttackCharged && remaining > 0) || (unit.chargeTravel ?? 0) >= UNITS.knight.chargeDistance });
  const pose = getMountPose({ horse: unit.type === 'knight', distance: unit.distanceTravelled ?? time * UNITS[unit.type].speed,
    moving: unit.moving, bodyOffset: attack.body, offset: (unit.id * 0.17) % 1 });
  ctx.save(); ctx.translate(unit.x, 0); ctx.scale((unit.team === 'player' ? 1 : -1) * scale, scale);
  for (const leg of pose.legs) {
    ctx.strokeStyle = leg.far ? '#e7bf8c' : '#d6e8bd'; ctx.lineWidth = 0.7;
    ctx.beginPath(); leg.joints.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    for (const [x, y] of leg.joints.slice(0, -1)) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.stroke(); }
    if (leg.planted) { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(leg.foot[0] - 4, 0); ctx.lineTo(leg.foot[0] + 6, 0); ctx.stroke(); }
  }
  ctx.restore();
}

export function createClipPainter(canvas, clip) {
  const ctx = canvas.getContext('2d'), samplers = new Map();
  const finale = clip.kind === 'destruction' ? createDestructionPreview() : null;
  function sample(team, time) {
    if (!samplers.has(team)) samplers.set(team, createClipSampler(clip, team));
    return samplers.get(team)(time);
  }
  return (time, { team = 'player', action = 'march', guides = false, reducedMotion = false } = {}) => {
    const bounds = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
    if (!bounds.width || !bounds.height) return;
    const width = Math.round(bounds.width * ratio), height = Math.round(bounds.height * ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#1d2d24'; ctx.fillRect(0, 0, width, height);
    if (clip.kind === 'orbital') {
      ctx.scale(ratio, ratio); drawOrbitalScene(ctx, bounds.width, bounds.height, time / CLIP_SECONDS * ORBITAL_SECONDS, { reducedMotion }); return;
    }
    if (clip.kind === 'voyage') {
      ctx.scale(ratio, ratio); drawVoyageScene(ctx, bounds.width, bounds.height, time / CLIP_SECONDS * VOYAGE_SECONDS, { reducedMotion }); return;
    }
    if (clip.kind === 'destruction') {
      ctx.scale(ratio, ratio); drawDestructionScene(ctx, bounds.width, bounds.height, time / CLIP_SECONDS * DESTRUCTION_SECONDS, { game: finale, reducedMotion }); return;
    }
    if (clip.kind === 'sky' || clip.kind === 'stars') {
      const scale = width / RULES.width, h = height / scale;
      ctx.scale(scale, scale); drawLandscape(ctx, h, h * 0.78, clip.kind === 'sky' ? time * 15 : 83 + time); return;
    }
    if (clip.kind === 'trait') team = 'player';
    const direction = team === 'player' ? 1 : -1;
    const worldWidth = clip.kind === 'ability' ? 850 : ['combat', 'trait'].includes(clip.kind) ? 450 : clip.kind === 'base' ? 280 : clip.kind === 'unit' ? 200 : 270;
    const worldHeight = clip.kind === 'ability' ? 410 : clip.kind === 'base' ? 270 : ['combat', 'trait'].includes(clip.kind) ? 240 : 150;
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
      drawUnit(ctx, unit, time, 1, reducedMotion);
      if (guides) gaitGuides(ctx, unit, time, 1);
    } else if (clip.kind === 'turret') {
      drawTurret(ctx, sample(team, time).game.turrets[team][0], time, 2);
    } else if (['combat', 'trait'].includes(clip.kind)) {
      const { game, origin, sourceId } = sample(team, time);
      const sourceX = origin?.x ?? game.units.find(unit => unit.id === sourceId)?.x ?? 500, targetX = game.units.find(unit => clip.trait ? unit.team !== 'player' : unit.id !== sourceId)?.x ?? sourceX + 85;
      ctx.translate(-(sourceX + targetX) / 2, 0);
      drawFields(ctx, game, time, 1, false);
      if (origin) {
        drawBase(ctx, game.bases[team], game.ages[team], time, 1, 1);
        ctx.save(); ctx.translate(origin.x, origin.y); drawTurret(ctx, game.turrets[team][0], time, 1, false, true); ctx.restore();
      }
      for (const unit of game.units) drawUnit(ctx, unit, time, 1, reducedMotion, attributes(game, unit).health, attributes(game, unit));
      for (const shot of game.projectiles) drawProjectile(ctx, shot, 1, reducedMotion);
      drawBattleEffects(ctx, game, 1, reducedMotion);
    } else if (clip.kind === 'ability') {
      const { game } = sample('player', clip.type === 'renewal' ? time : time % 4); ctx.translate(-640, 0);
      for (const unit of game.units) drawUnit(ctx, unit, time, 1, reducedMotion);
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
