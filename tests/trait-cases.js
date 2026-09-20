import { SUPER_WEAPONS } from '../src/game-config.js';
import { getSuperSoldierBonuses } from '../src/progression-bonuses.js';
import { drawUnitTargeting } from '../src/render.js';
import { getMeleeMotion } from '../src/melee-motion.js';
import { Q } from '../src/quantity.js';
import { createGame, updateGame, stat, explainStat, attributes, UNITS, AGES, RULES, evolve, recruit, getRecruitState } from '../src/game.js';
import { TRAITS, TRAIT_HOOKS, runTraitHook, validTraitState } from '../src/traits.js';
import { createProgression, createCivilizationRun, resolveBattle, rebuildCivilization, purchaseUpgrade, setGameSpeed, cycleGameSpeed, updateProgression } from '../src/progression.js';
import { TALENTS, emptyTalents, layerTalents, purchaseTalent, getTalentState } from '../src/talents.js';
import { LEGACY_ECONOMY, automationUnlocked, availableSpeeds, SAVE_VERSION } from '../src/progression-config.js';
import { serializeSession, parseSession, mapSessionQuantities } from '../src/save.js';
import { record as capturedV8 } from './fixtures/v8-save.js';
import { fromV8Record, toV8Record } from '../src/save-record.js';
import { getRunBonuses, getV8RunBonuses } from '../src/progression-bonuses.js';
import { createClipSampler, ANIMATION_CLIPS } from '../src/animation-clips.js';
import { mountFixture } from './progression-cases.js';
import { SAVE_KEY } from '../src/save.js';
import { simulateRun } from '../sim/simulate.js';

export const UNIT_PATH = ['openingStone','shieldWall','parry','grenade','blink'];
export function buyUnitPath(s) { for (const key of [...UNIT_PATH, 'superSoldierPlan']) if (!s.permanent.talents[key] && !purchaseTalent(s,key)) throw Error(`Cannot buy ${key}`); }
export function buyAllTalents(s) {
  const pending = new Set(Object.keys(TALENTS).filter(key=>key!=='bypasser' && !TALENTS[key].placeholder));
  for(let pass=0;pass<20 && pending.size;pass++) for(const key of pending) {
    if(getTalentState(s,key)==='max') pending.delete(key);
    else if(purchaseTalent(s,key) && getTalentState(s,key)==='max') pending.delete(key);
  }
  if(pending.size)throw Error(`Unpurchased talents: ${[...pending]}`);
}
const bonus = (id, value=true, team='player') => ({target:{stat:TRAITS[id].stat,team,type:TRAITS[id].units[0]},type:'override',value,source:{kind:'doctrine',id,label:TRAITS[id].name}});
const soldier=(g,type,team,x,hp=UNITS[type].health)=>({id:g.nextUnitId++,type,team,x,hp,moving:false,attackCooldown:0,attackAnimation:0,hitFlash:0});
function fixture(id, distance=30) {
 const g=createGame({mode:'incremental',bonuses:[bonus(id)]});g.ai.enabled=false;g.ages.player=g.ages.enemy=5;
 const player=soldier(g,TRAITS[id].units[0],'player',500),enemy=soldier(g,'swordsman','enemy',500+distance,10000);
 g.units=[player,enemy];return {g,player,enemy};
}
const ticks=(g,n)=>{for(let i=0;i<n;i++)updateGame(g,RULES.fixedStep);};
function finish(s) { s.game.experience.enemy=AGES[5].experienceRequired;while(s.game.ages.enemy<5)evolve(s.game,'enemy');s.game.bases.enemy.hp=0;s.game.status='won';resolveBattle(s); }
function fund(count=1000) { const s=createProgression(); for(let i=0;i<Math.min(count,100);i++){if(i)rebuildCivilization(s,s.run.runId);finish(s);}if(count>100){s.permanent.completedCycles=s.permanent.totalLegacy=s.permanent.legacy=count;}return s; }
function sniperFixture() {
 const g=createGame({mode:'incremental',ages:{player:5,enemy:5},bonuses:getSuperSoldierBonuses(true)});g.ai.enabled=false;
 const player=soldier(g,'superSoldier','player',400),enemy=soldier(g,'warMachine','enemy',850,10000);
 enemy.attackCooldown=100;g.units=[player,enemy];return {g,player,enemy};
}
export function registerTraitTests(test,assert,near) {
 const rejects=fn=>{let failed=false;try{fn();}catch{failed=true;}assert(failed,'Expected rejection');};
 test('V9: fire unlocks only speed; two genuine completions unlock free, disabled recruitment',()=>{
  const s=createProgression();assert(!setGameSpeed(s,2));finish(s);assert(purchaseTalent(s,'spark'));
  assert(!automationUnlocked(s.permanent)&&!s.permanent.automation.unlocked);assert(setGameSpeed(s,2));
  assert(!setGameSpeed(s,3)&&!setGameSpeed(s,20));assert(parseSession(serializeSession(s)).permanent.settings.speed===2);
  rebuildCivilization(s,s.run.runId);finish(s);assert(s.permanent.automation.unlocked&&!s.permanent.automation.enabled&&s.permanent.legacy===1);
  assert(cycleGameSpeed(s)&&s.permanent.settings.speed===1&&RULES.fixedStep===1/60);
  s.debug=true;s.debugSpeed=10;assert(!cycleGameSpeed(s)&&s.debugSpeed===10);
 });
 test('V9: age gates use any one previous unit talent, max speed is 3 and bypasser stays unaffordable before the late economy',()=>{
  const s=fund();assert(purchaseTalent(s,'spark'));assert(getTalentState(s,'shieldWall')==='prerequisite');
  assert(purchaseTalent(s,'ricochet')&&purchaseTalent(s,'fireArrow')&&purchaseTalent(s,'volley'));
  assert(purchaseTalent(s,'timeAcceleration'));assert(availableSpeeds(s.permanent).join(',')==='1,2,3'&&setGameSpeed(s,3));
  assert(getTalentState(s,'superSoldierPlan')==='prerequisite');assert(purchaseTalent(s,'coaxial')&&purchaseTalent(s,'overload')&&purchaseTalent(s,'superSoldierPlan'));
  // The protocol now needs the deepest expedition behind it, not only Legacy.
  const before=s.permanent.legacy;assert(!purchaseTalent(s,'bypasser')&&s.permanent.legacy===before&&getTalentState(s,'bypasser')==='depth-required');
  s.permanent.deepestChallenge=LEGACY_ECONOMY.bypasserChallenge;s.permanent.completedCycles=Math.max(s.permanent.completedCycles,LEGACY_ECONOMY.bypasserChallenge);
  // Proving the depth is what opens it; taking that proof away closes it again.
  assert(getTalentState(s,'bypasser')==='ready');
  s.permanent.deepestChallenge=0;
  assert(getTalentState(s,'bypasser')==='depth-required'&&!purchaseTalent(s,'bypasser')&&s.permanent.legacy===before);
  rebuildCivilization(s,s.run.runId);finish(s);assert(s.run.phase==='destruction');parseSession(serializeSession(s));
 });
 test('V9: paid and free v8 roots migrate by ledger, retaining automation without duplicate grants or reward',()=>{
  for(const free of [false,true]) for(const settled of [false,true]) {
    const old=fromV8Record(capturedV8),p=old.permanent;p.completedCycles=1;p.totalLegacy=1;p.talents.autobuyer=old.run.talents.autobuyer=1;
    p.talentGrants=free?['autobuyer']:[];p.legacy=Number(free);p.automation.unlocked=p.automation.enabled=true;old.game.bonuses=getV8RunBonuses(old.run);
    if(settled){old.game.ages.enemy=5;old.game.bases.enemy.hp=0;old.game.status='won';old.run.phase='destruction';old.run.settled=true;old.run.earnedLegacy=1;old.run.processedBattleId=old.run.battleId;}
    const wire=toV8Record(old);mapSessionQuantities(wire,Q.encode);const next=parseSession(JSON.stringify(wire));assert(next.version===SAVE_VERSION&&next.permanent.legacy===1&&next.permanent.totalLegacy===1);
    assert(next.permanent.talents.spark===1&&next.permanent.talentGrants.join(',')==='spark'&&next.permanent.automationRetained&&next.permanent.automation.enabled);
    assert(next.run.phase===old.run.phase&&next.run.earnedLegacy===old.run.earnedLegacy&&!resolveBattle(next));
    const raw=serializeSession(next);assert(serializeSession(parseSession(raw))===raw);
  }
 });
 test('Traits: registration is deterministic, default-off, player-only and challenge overrides remain explainable',()=>{
  assert(Object.keys(TRAITS).length===15&&TRAIT_HOOKS.join(',')==='onEngage,beforeAttack,onHit,onKill,onDeath');
  for(const trait of Object.values(TRAITS)) {
   assert(!stat(createGame(),{type:trait.units[0],team:'player'},trait.stat));
   const {g,player,enemy}=fixture(trait.id);assert(stat(g,player,trait.stat)&&!stat(g,enemy,trait.stat));
   g.bonuses=[...g.bonuses,{...bonus(trait.id,false),source:{kind:'challenge',id:'no-traits',label:'无特性'}}];
   assert(!stat(g,player,trait.stat)&&explainStat(g,player,trait.stat).effects.at(-1).source.id==='no-traits');
   runTraitHook('onEngage',{unit:{...player,team:'enemy'},stats:{[trait.stat]:true}});
  }
  rejects(()=>runTraitHook('unknown',{}));
 });
 test('Traits: all fifteen workshop scenarios trigger real hooks and rewind deterministically',()=>{
  for(const trait of Object.values(TRAITS)) {
   const clip=ANIMATION_CLIPS.find(clip=>clip.trait===trait.id);assert(clip,trait.id);
   const sample=createClipSampler(clip,'player'),after=sample(7).game;
   assert(after.traitActivations?.[trait.id]>0,`${trait.id} must actually activate`);
   const expected=JSON.stringify(sample(1).game);sample(6);assert(JSON.stringify(sample(1).game)===expected,`${trait.id} rewind`);
  }
 });
 test('Traits: opener snapshots damage, only launches once and cannot replay after a v9 save',()=>{
  const s=fund(3);purchaseTalent(s,'spark');purchaseTalent(s,'openingStone');rebuildCivilization(s,s.run.runId);
  const g=s.game;g.ai.enabled=false;g.units=[soldier(g,'melee','player',500),soldier(g,'melee','enemy',630)];g.units[1].attackCooldown=100;
  ticks(g,1);const shot=g.projectiles[0];near(shot.damage,UNITS.melee.damage*.45);assert(g.units[0].traits.openingStone.used);
  const resumed=parseSession(serializeSession(s));ticks(resumed.game,120);assert(resumed.game.traitActivations.openingStone===1);
  const copy=JSON.parse(serializeSession(s));copy.game.units[0].traits.openingStone.used='true';rejects(()=>parseSession(JSON.stringify(copy)));
  assert(!validTraitState({...g.units[0],traits:{parry:{readyAt:0}}}));
 });
 test('Traits: shield, parry cooldown, devour healing and force redirection change actual health without resurrection',()=>{
  const a=fixture('shieldWall',25);a.enemy.type='rifleman';a.enemy.hp=UNITS.rifleman.health;a.player.attackCooldown=100;
  ticks(a.g,45);assert(a.g.traitActivations.shieldWall>0&&Q.gt(a.player.hp,0));
  const b=fixture('parry');b.player.attackCooldown=100;ticks(b.g,1);assert(!b.g.traitActivations?.parry);
  b.enemy.attackCooldown=100;ticks(b.g,181);b.enemy.attackCooldown=0;const hp=b.player.hp;ticks(b.g,1);assert(b.player.hp===hp&&b.enemy.hp<10000);
  const count=b.g.traitActivations.parry;b.enemy.attackCooldown=0;ticks(b.g,1);assert(b.player.hp<hp&&b.g.traitActivations.parry===count);
  const c=fixture('devour');c.player.hp=50;c.enemy.hp=1;c.enemy.attackCooldown=100;ticks(c.g,1);near(c.player.hp,50+UNITS.heavy.health*.3);assert(c.g.units.length===1);
  const d=fixture('forceField',150);d.enemy.type='rifleman';d.player.attackCooldown=100;const ally=soldier(d.g,'blaster','player',560);ally.attackCooldown=100;d.g.units.push(ally);ticks(d.g,45);
  assert(d.g.traitActivations.forceField>0&&d.player.hp<UNITS.warMachine.health&&ally.hp>UNITS.blaster.health-(UNITS.rifleman.damage-UNITS.blaster.armor)*UNITS.rifleman.burst);
  const e=fixture('forceField',150);e.enemy.type='rifleman';e.player.attackCooldown=100;
  const fragile=soldier(e.g,'blaster','player',560,1);fragile.attackCooldown=100;
  e.g.units.push(fragile,soldier(e.g,'rifleman','enemy',640));ticks(e.g,10);
  assert(!e.g.units.includes(fragile)&&e.g.traitActivations.forceField===1,'A field cannot absorb further hits for an already dead ally');
 });
 test('Traits: suppression expires on simulation time and its launch payload survives saves',()=>{
  const {g,player,enemy}=fixture('suppression',140);enemy.attackCooldown=100;
  ticks(g,1);assert(g.projectiles[0].slow===.9);ticks(g,15);assert(enemy.suppressedUntil>g.elapsed&&g.traitActivations.suppression>0);
  player.attackCooldown=100;g.projectiles=[];ticks(g,45);assert(enemy.moveMultiplier===1);
 });
 test('Traits: parry rejects ranged splash even with a charged block',()=>{
  const {g,player,enemy}=fixture('parry',30);
  player.traits={parry:{readyAt:0}};player.attackCooldown=100;
  enemy.type='cannoneer';enemy.attackCooldown=0;
  const hp=player.hp;ticks(g,15);
  assert(Q.lt(player.hp,hp),'A cannon impact must deal damage');
  assert(!g.traitActivations?.parry&&player.traits.parry.readyAt===0,'Splash is not a melee attack');
 });
 test('Super plan: incremental recruits require plan; close dagger and charged sniper unlock separately; classic ranged fire unchanged',()=>{
  const s=fund();purchaseTalent(s,'spark');rebuildCivilization(s,s.run.runId);s.game.experience.player=2200;while(s.game.ages.player<5)evolve(s.game);
  s.game.gold.player=10000;assert(getRecruitState(s.game,'superSoldier')==='disabled');finish(s);buyUnitPath(s);rebuildCivilization(s,s.run.runId);
  const g=s.game;g.ai.enabled=false;g.ages.player=5;g.units=[soldier(g,'superSoldier','player',500),soldier(g,'tank','enemy',530)];g.units[1].attackCooldown=100;
  ticks(g,1);assert(!g.projectiles.length&&g.units[0].attackStyle==='melee'&&g.units[1].hp===UNITS.tank.health-440);
  finish(s);assert(purchaseTalent(s,'superRanged'));rebuildCivilization(s,s.run.runId);s.game.ai.enabled=false;s.game.units=[soldier(s.game,'superSoldier','player',500),soldier(s.game,'tank','enemy',700)];ticks(s.game,67);assert(s.game.projectiles[0].kind==='sniper');
  const classic=createGame();assert(stat(classic,{type:'superSoldier',team:'player'},'enabled')&&stat(classic,{type:'superSoldier',team:'player'},'canRanged')&&stat(classic,{type:'superSoldier',team:'player'},'range')===340);
 });

 test('Sniper: resolved range, damage and cadence are player-only; charge precedes a snapshotted beam',()=>{
  const {g,player,enemy}=sniperFixture(),cfg=SUPER_WEAPONS.sniper;
  assert(stat(g,player,'range')===cfg.range&&stat(g,player,'damage')===cfg.damage);
  assert(!stat(g,{type:'superSoldier',team:'enemy'},'sniperRifle'));
  ticks(g,1);near(player.chargeRemaining,cfg.chargeTime);assert(!g.projectiles.length&&enemy.hp===10000);
  ticks(g,60);assert(player.chargeRemaining>0&&!g.projectiles.length&&enemy.hp===10000);
  ticks(g,6);const shot=g.projectiles[0];assert(shot.kind==='sniper'&&shot.damage===cfg.damage&&!player.chargeRemaining);
  near(player.attackCooldown,cfg.attackInterval);
  g.bonuses=[...g.bonuses,{target:{stat:'damage',team:'player'},type:'multiply',value:10,source:{kind:'depth',id:'later',label:'之后的伤害'}}];
  ticks(g,12);near(enemy.hp,10000-cfg.damage);assert(!g.projectiles.length);
  ticks(g,90);assert(!player.chargeRemaining&&!g.projectiles.length,'A high-power shot needs its full recovery');
 });
 test('Sniper: a lost target needs a new full lock; an adjacent enemy cancels the beam and gets a close stab',()=>{
  for(const remove of [true,false]) {
   const {g,player,enemy}=sniperFixture();ticks(g,35);
   if(remove)g.units=[player];else enemy.x=1250;
   const replacement=soldier(g,'warMachine','enemy',800);replacement.attackCooldown=100;g.units.push(replacement);
   ticks(g,1);assert(!player.chargeRemaining&&!g.projectiles.length);
   ticks(g,1);near(player.chargeRemaining,SUPER_WEAPONS.sniper.chargeTime);assert(player.chargeTargetId===replacement.id);
   ticks(g,40);assert(!g.projectiles.length&&replacement.hp===UNITS.warMachine.health);
  }
  const {g,player,enemy}=sniperFixture();ticks(g,35);
  const close=soldier(g,'warMachine','enemy',430);close.attackCooldown=100;g.units.push(close);
  ticks(g,1);assert(!player.chargeRemaining&&!g.projectiles.length&&player.attackStyle==='melee');
  near(close.hp,UNITS.warMachine.health-UNITS.superSoldier.meleeDamage);
  near(player.attackCooldown,UNITS.superSoldier.meleeInterval);assert(enemy.hp===10000);
 });
 test('Sniper: mid-lock v9 saves resume once, preserve beam damage and reject invalid target/timer state',()=>{
  const s=fund();purchaseTalent(s,'spark');buyUnitPath(s);purchaseTalent(s,'superRanged');rebuildCivilization(s,s.run.runId);
  const g=s.game;g.ai.enabled=false;
  for(const team of ['player','enemy']){g.experience[team]=2200;while(g.ages[team]<5)evolve(g,team);}
  g.units=[soldier(g,'superSoldier','player',400),soldier(g,'warMachine','enemy',850)];g.units[1].attackCooldown=100;
  ticks(g,35);const raw=serializeSession(s),resumed=parseSession(raw);assert(serializeSession(resumed)===raw);
  updateProgression(resumed,1,{paused:true});updateProgression(resumed,1,{hidden:true});assert(serializeSession(resumed)===raw);
  ticks(g,32);ticks(resumed.game,32);assert(g.projectiles.length===1&&JSON.stringify(g.projectiles)===JSON.stringify(resumed.game.projectiles));
  const fired=parseSession(serializeSession(resumed));ticks(fired.game,15);assert(!fired.game.projectiles.length&&fired.game.units.length===1);
  for(const patch of [{chargeDuration:0},{chargeRemaining:100},{chargeTargetBase:'enemy'},{chargeTargetId:9999}]) {
   const bad=JSON.parse(raw);Object.assign(bad.game.units[0],patch);rejects(()=>parseSession(JSON.stringify(bad)));
  }
 });
 test('Super dagger and sniper workshop: compact thrust reaches contact and the charge clip rewinds deterministically',()=>{
  const pose=getMeleeMotion('superSoldier',{remaining:.4,duration:.4});
  assert(pose.hand[0]+pose.body.x+SUPER_WEAPONS.daggerTip<=SUPER_WEAPONS.meleeRange+5);
  assert(getMeleeMotion('superSoldier',{remaining:.2,duration:.4}).drive===0);
  const clip=ANIMATION_CLIPS.find(c=>c.sniper),sample=createClipSampler(clip,'player');
  assert(sample(.8).game.units[0].chargeRemaining>0);
  assert(sample(1.5).game.projectiles.some(s=>s.kind==='sniper'));
  const before=JSON.stringify(sample(.8).game);sample(6);assert(JSON.stringify(sample(.8).game)===before);
 });
 test.browser('Sniper targeting stays attached to its target, renders at mobile scale and respects reduced motion',()=>{
  const {g,player,enemy}=sniperFixture();ticks(g,20);
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=150;const ctx=canvas.getContext('2d');
  const paint=(reduced,scale=1)=>{ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,1000,150);ctx.translate(0,100);drawUnitTargeting(ctx,g,scale,reduced);return canvas.toDataURL();};
  const before=paint(true);player.chargeRemaining-=.2;g.elapsed+=10;assert(paint(true)===before);
  enemy.x-=30;assert(paint(true)!==before,'The lock follows the same moving target');
  const normal=paint(false);player.chargeRemaining-=.2;assert(paint(false)!==normal,'Reticle closes as the charge completes');
  paint(false,.7);assert(ctx.getImageData(400,50,450,40).data.some((v,i)=>i%4===3&&v>0));
  enemy.hp=0;paint(false);assert(!ctx.getImageData(0,0,1000,150).data.some((v,i)=>i%4===3&&v>0));
 });

 test('Traits: every active trait state, launch snapshot and field validates and round-trips in v9',()=>{
  const template=fund(200000);purchaseTalent(template,'spark');purchaseUpgrade(template,'production');purchaseUpgrade(template,'warfare');buyAllTalents(template);rebuildCivilization(template,template.run.runId);
  for(const trait of Object.values(TRAITS)) for(const time of [.4,3.5,6.8]) {
   const s=parseSession(serializeSession(template));
   s.run.extraBonuses=[{target:{stat:'health',kind:'unit',team:'enemy'},type:'override',value:1e8,source:{kind:'challenge',id:'durable-targets',label:'固定检验目标'}}];
   s.game=createClipSampler(ANIMATION_CLIPS.find(c=>c.trait===trait.id),'player')(time).game;
   s.game.bonuses=getRunBonuses(s.run);
   for(const team of ['player','enemy'])s.game.bases[team].hp=s.game.bases[team].maxHp=stat(s.game,team,'baseHealth');
   const raw=serializeSession(s);assert(serializeSession(parseSession(raw))===raw,trait.id+' snapshot');
  }
 });
 test.browser('Speed HUD: R and button cycle fixed-step speed, preserve preference, pause in dialogs and survive refresh',async()=>{
  const s=fund();purchaseTalent(s,'spark');buyUnitPath(s);purchaseTalent(s,'timeAcceleration');rebuildCivilization(s,s.run.runId);s.game.ai.enabled=false;
  let frame=await mountFixture(serializeSession(s));
  try {
   const el=id=>frame.contentDocument.getElementById(id),key=()=>frame.contentDocument.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{code:'KeyR',bubbles:true,cancelable:true}));
   const stored=()=>parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
   key();assert(el('game-speed').textContent==='2×'&&stored().permanent.settings.speed===2);
   el('game-speed').click();assert(el('game-speed').textContent==='3×');
   let now=0;frame.contentWindow.__testFrame(now);for(let i=0;i<30;i++)frame.contentWindow.__testFrame(now+=1000/60);
   el('save-menu').click();el('manual-save').click();const before=stored().game.elapsed;near(before,1.5);
   key();for(let i=0;i<60;i++)frame.contentWindow.__testFrame(now+=1000/60);el('manual-save').click();near(stored().game.elapsed,before);assert(stored().permanent.settings.speed===3);
   el('close-save').click();el('pause-battle').click();for(let i=0;i<60;i++)frame.contentWindow.__testFrame(now+=1000/60);
   el('save-menu').click();el('manual-save').click();near(stored().game.elapsed,before);
   const raw=serializeSession(stored());frame.remove();frame=await mountFixture(raw);assert(el('game-speed').textContent==='3×');
   key();assert(el('game-speed').textContent==='1×');
  } finally { frame.remove(); }
 });
 test('Traits: simulator accepts layered purchased talents and exposes measurable activations',()=>{
  const result=simulateRun({completedCycles:2,talents:{spark:1,ricochet:1},automation:{enabled:true,target:'ranged'},maxSeconds:90});
  assert(result.traitActivations.ricochet>0);
  rejects(()=>simulateRun({talents:{spark:1,forceField:1}}));
 });
}
