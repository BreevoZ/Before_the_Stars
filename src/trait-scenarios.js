import { createGame, UNITS, RULES, updateGame } from './game.js';
import { TRAITS } from './traits.js';
const CLIP_SECONDS = 8;
function soldier(id, type, team, x) { return { id, type, team, x, hp: UNITS[type].health, attackCooldown: .35, attackAnimation: 0, hitFlash: 0, moving: false, distanceTravelled: 0 }; }

export function createTraitSampler(clip, enabled = true) {
  const trait = TRAITS[clip.trait], stats = UNITS[clip.type];
  let game = createGame({ mode: 'incremental', bonuses: [{ target: { stat: trait.stat, team: 'player', type: clip.type }, type: 'override', value: enabled,
    source: { kind: 'doctrine', id: trait.id, label: trait.name } }] });
  game.ai.enabled = false;
  game.ages.player = game.ages.enemy = 5;
  const source = soldier(1, clip.type, 'player', 500); game.units.push(source);
  const distance = ['openingStone','javelin','grenade','blink'].includes(trait.id) ? 130 : trait.id === 'parry' ? 30 : trait.id === 'coaxial' ? 100 : trait.id === 'canister' ? 90 : Math.min(stats.range * .85, 180);
  const enemyType = trait.id === 'parry' ? 'swordsman' : ['shieldWall','forceField'].includes(trait.id) ? 'rifleman' : 'swordsman';
  game.units.push(soldier(2, enemyType, 'enemy', source.x + distance));
  if (['ricochet','canister','overload'].includes(trait.id)) for (let i=0; i<2; i++) game.units.push(soldier(3+i, 'swordsman', 'enemy', source.x + distance + 35*(i+1)));
  if (trait.id === 'volley') for (let i=0;i<2;i++) game.units.push(soldier(3+i, clip.type, 'player', source.x-25*(i+1)));
  if (trait.id === 'forceField') { source.x = 480; game.units.push(soldier(3, 'blaster', 'player', 545)); }
  if (trait.id === 'devour') { source.hp = stats.health * .35; game.units[1].hp = 1; }
  for (const unit of game.units) if (unit.team === 'enemy' && trait.id !== 'devour') unit.hp = 1e8;
  game.nextUnitId = 10;
  const checkpoints = new Map([[0, structuredClone(game)]]); let frame=0;
  return time => {
    const target=Math.max(0,Math.min(CLIP_SECONDS*60,Math.floor(time*60+1e-6)));
    if(target<frame) { frame=Math.floor(target/15)*15; while(!checkpoints.has(frame))frame-=15; game=structuredClone(checkpoints.get(frame)); }
    while(frame<target) {
      for(const unit of game.units) {
        if(unit.team==='enemy') { unit.moving=false; if(!['parry','shieldWall','forceField'].includes(trait.id))unit.attackCooldown=1000; }
      }
      // Previews contain actual combat; only the stationary enemy target and
      // target durability are held for repeatable inspection of the same shot.
      const positions = new Map(game.units.filter(u=>u.team==='enemy' && trait.id !== 'suppression').map(u=>[u.id,u.x]));
      updateGame(game,RULES.fixedStep);
      for(const unit of game.units) if(positions.has(unit.id)) { unit.x=positions.get(unit.id); unit.moving=false; }
      frame++; if(frame%15===0)checkpoints.set(frame,structuredClone(game));
    }
    return {game,origin:null,sourceId:1};
  };
}
