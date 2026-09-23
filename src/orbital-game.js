import { Q } from './quantity.js';
import { ORBITAL_RULES as R, ORBITAL_TALENTS as T, ORBITAL_ACTIONS as ACTIONS } from './orbital-config.js';
import { seedCivilizations, seedRefugee, orbitalYieldMultiplier, civilizationValue, rebirthDelay, refugeeDelay } from './celestial-economy.js';
import { createWar, updateWar, syncWarCivilizations, refreshWarBonuses, changeTechnology } from './orbital-war.js';

export function createOrbitalState(seed = (Math.random()*4294967296)>>>0) {
  return {version:R.version,started:false,elapsed:0,rng:seed>>>0,cycle:0,settledCycle:0,nuclearCycles:0,
    phase:'dormant',remaining:0,winterDuration:0,refugeeRemaining:0,nextCivilization:0,nextWar:0,
    civilizations:[],wars:[],talents:Object.fromEntries(Object.keys(T).map(k=>[k,k==='protocol'?1:0])),
    payments:{},interventionSpent:0,legacyEarned:0,legacyFraction:0,lastReward:0,lastCatastropheAt:null,
    selectedCivilization:null,selectedOpponent:null,selectedWar:null,autoWar:false,autoElapsed:0,completionAt:null,
    log:[{time:0,text:'存续协议已生效。地表的战火，将成为轨道家园的遗产。'}]};
}
export function orbitalLegacySpent(o) {return o?Q.add(Q.sum(Object.values(o.payments).flat()),o.interventionSpent):0;}
function log(o,text){o.log.push({time:o.elapsed,text});if(o.log.length>R.historyLimit)o.log.shift();}
function award(s,amount){if(Q.lte(amount,0))return;s.orbital.legacyEarned=Q.add(s.orbital.legacyEarned,amount);s.permanent.totalLegacy=Q.add(s.permanent.totalLegacy,amount);s.permanent.legacy=Q.add(s.permanent.legacy,amount);}
const active=s=>s.run.phase==='orbital' && s.orbital?.started;
export function findCivilization(o,id){return o?.civilizations.find(c=>c.id===id);}
function beginCycle(o){o.cycle++;o.phase='living';o.remaining=0;o.refugeeRemaining=0;seedCivilizations(o);o.selectedCivilization=o.civilizations[0].id;o.selectedOpponent=o.civilizations[1].id;o.selectedWar=null;log(o,`第 ${o.cycle} 轮萌芽：${o.civilizations.length} 个原始文明在地表点燃火种。`);}
export function enterOrbital(s){if(s.run.phase!=='orbital'||!s.orbital||s.orbital.started)return false;s.orbital.started=true;beginCycle(s.orbital);return true;}
export function getOrbitalTalentState(s,key){
  const o=s.orbital,t=T[key];if(!active(s)||!t)return 'locked';if(o.talents[key]>=t.costs.length)return 'max';
  if(Object.entries(t.requires).some(([p,n])=>o.talents[p]<n))return 'prerequisite';
  if((t.cycles??0)>o.nuclearCycles)return 'cycles';
  return Q.gte(s.permanent.legacy,t.costs[o.talents[key]])?'ready':'legacy';
}
export function purchaseOrbitalTalent(s,key){
  if(getOrbitalTalentState(s,key)!=='ready')return false;const o=s.orbital,cost=T[key].costs[o.talents[key]];
  s.permanent.legacy=Q.sub(s.permanent.legacy,cost);(o.payments[key]??=[]).push(cost);o.talents[key]++;
  if(key==='reseed'){o.remaining*=.75;o.winterDuration*=.75;o.refugeeRemaining*=.75;}
  if(key==='transit' && o.completionAt===null)o.completionAt=o.elapsed;
  log(o,`轨道天赋：${T[key].name} ${o.talents[key]} 级。`);return true;
}
export function getWarState(s,a,b){
  if(!active(s)||s.orbital.phase!=='living')return 'waiting';
  const first=findCivilization(s.orbital,a),second=findCivilization(s.orbital,b);
  if(!first?.alive||!second?.alive||first===second)return 'selection';if(first.warId||second.warId)return 'busy';return 'ready';
}
export function startOrbitalWar(s,a,b){
  if(getWarState(s,a,b)!=='ready')return false;const o=s.orbital,first=findCivilization(o,a),second=findCivilization(o,b);
  const war=createWar(`w${o.cycle}-${++o.nextWar}`,[first,second]);first.warId=second.warId=war.id;o.wars.push(war);o.selectedWar=war.id;
  log(o,`${first.name}与${second.name}开战。双方由 AI 招募与进化。`);return true;
}
function endWar(o,war){for(const id of war.participants){const c=findCivilization(o,id);c.warId=null;}o.wars=o.wars.filter(w=>w!==war);if(o.selectedWar===war.id)o.selectedWar=o.wars[0]?.id??null;}
function settleNuclear(s){
  const o=s.orbital;if(o.phase!=='living'||o.settledCycle===o.cycle)return false;
  const reward=Q.sum(o.civilizations.filter(c=>c.alive).map(c=>civilizationValue(o,c,'nuclear')));
  o.settledCycle=o.cycle;o.nuclearCycles++;o.phase='winter';o.remaining=o.winterDuration=rebirthDelay(o);o.lastCatastropheAt=o.elapsed;o.lastReward=reward;
  for(const c of o.civilizations){c.alive=false;c.warId=null;}o.wars=[];o.selectedWar=null;award(s,reward);
  log(o,`未来战争触发全球核毁灭。所有文明消亡，收获 ${Q.format(reward)} Legacy。`);return true;
}
export function resolveOrbitalWar(s,id){
  const o=s.orbital,war=o?.wars.find(w=>w.id===id);if(!active(s)||o.phase!=='living'||!war||war.game.status==='playing')return false;
  syncWarCivilizations(o,war);
  if(war.game.status!=='draw' && war.participants.every(id=>findCivilization(o,id).age===R.finalAge))return settleNuclear(s);
  const loserTeams=war.game.status==='draw'?[0,1]:[war.game.status==='won'?1:0];
  let reward=0;for(const i of loserTeams){const c=findCivilization(o,war.participants[i]);reward=Q.add(reward,civilizationValue(o,c,'defeat'));c.alive=false;}
  endWar(o,war);award(s,reward);log(o,`一场地表战争结束，收获 ${Q.format(reward)} Legacy。幸存者保留时代与经验。`);return true;
}
export function interventionCost(o,c,key){return ACTIONS[key].baseCost*2**(key==='boost'?c.power:key==='regress'?Math.max(0,c.age-2):key==='advance'?c.age-1:0);}
export function getInterventionState(s,id,key){
  const o=s.orbital,c=findCivilization(o,id),a=ACTIONS[key];if(!active(s)||o.phase!=='living'||!a||!o.talents[a.talent]||!o.talents.monitor)return 'locked';
  if(!c?.alive)return 'dead';if((key==='boost'&&c.power>=R.maximumPower)||(key==='advance'&&c.age>=R.finalAge)||(key==='regress'&&c.age<=1))return 'max';
  return Q.gte(s.permanent.legacy,interventionCost(o,c,key))?'ready':'legacy';
}
export function intervene(s,id,key){
  if(getInterventionState(s,id,key)!=='ready')return false;const o=s.orbital,c=findCivilization(o,id),cost=interventionCost(o,c,key);
  s.permanent.legacy=Q.sub(s.permanent.legacy,cost);o.interventionSpent=Q.add(o.interventionSpent,cost);
  if(key==='boost'){c.power++;const war=o.wars.find(w=>w.id===c.warId);if(war)refreshWarBonuses(o,war);}
  if(key==='advance'||key==='regress'){changeTechnology(o,c,key==='advance'?1:-1);const war=o.wars.find(w=>w.id===c.warId);if(war)syncWarCivilizations(o,war);}
  if(key==='harvest'){
    const reward=civilizationValue(o,c);c.alive=false;const war=o.wars.find(w=>w.id===c.warId);if(war){syncWarCivilizations(o,war);endWar(o,war);}award(s,reward);
    log(o,`轨道光束抹去了${c.name}，收割 ${Q.format(reward)} Legacy。`);
  }else log(o,`${ACTIONS[key].name} → ${c.name} · −${cost} Legacy。`);
  return true;
}
export function updateOrbital(s,dt,{paused=false,hidden=false}={}){
  const o=s.orbital;if(!active(s)||paused||hidden||!Number.isFinite(dt)||dt<=0)return false;
  dt=Math.min(.05,dt);o.elapsed+=dt;let changed=false;
  if(o.phase==='winter'){o.remaining=Math.max(0,o.remaining-dt);if(o.remaining<=1e-8){beginCycle(o);return true;}return false;}
  for(const war of [...o.wars]){
    // Every paid launch owns a damage snapshot; live modifiers affect only new attacks.
    const xp=updateWar(war,dt);syncWarCivilizations(o,war);
    o.legacyFraction+=Q.toNumber(xp)*R.legacyPerExperience*orbitalYieldMultiplier(o);
    const whole=Math.floor(o.legacyFraction+1e-10);o.legacyFraction=Math.max(0,o.legacyFraction-whole);award(s,whole);
    if(resolveOrbitalWar(s,war.id)){changed=true;if(o.phase==='winter')return true;}
  }
  const alive=o.civilizations.filter(c=>c.alive);
  if(alive.length<2){o.refugeeRemaining+=dt;if(o.refugeeRemaining>=refugeeDelay(o)){const c=seedRefugee(o);o.refugeeRemaining=0;if(c){log(o,`${c.name}从废墟中萌芽。`);changed=true;}}}else o.refugeeRemaining=0;
  o.autoElapsed+=dt;if(o.autoElapsed>=.25){o.autoElapsed%=.25;if(o.autoWar&&o.talents.weaving){const idle=o.civilizations.filter(c=>c.alive&&!c.warId).sort((a,b)=>a.age-b.age);for(let i=0;i+1<idle.length;i+=2)changed=startOrbitalWar(s,idle[i].id,idle[i+1].id)||changed;}}
  return changed;
}
