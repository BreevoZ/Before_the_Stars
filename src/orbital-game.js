import { Q } from './quantity.js';
import { ORBITAL_RULES as R, ORBITAL_TALENTS as T, ORBITAL_ACTIONS as ACTIONS } from './orbital-config.js';
import { seedCivilizations, seedRefugee, orbitalYieldMultiplier, civilizationValue, rebirthDelay, refugeeDelay, lunarLegacyRate, nuclearMultiplier, bondRate, chronicleMultiplier } from './celestial-economy.js';
import { createWar, updateWar, syncWarCivilizations, refreshWarBonuses, changeTechnology } from './orbital-war.js';
import { AGES } from './game-config.js';
import { emptyIndustry, emptyFlights, industryRate, industrySpent, landFlights, FACILITIES, facilityAt } from './solar-industry.js';
import { emptyColonies, colonyRate, landTransfers } from './solar-colony.js';
import { bodyById } from './solar-config.js';

export function createOrbitalState(seed = (Math.random()*4294967296)>>>0) {
  return {version:R.version,started:false,elapsed:0,rng:seed>>>0,cycle:0,settledCycle:0,nuclearCycles:0,
    phase:'dormant',remaining:0,winterDuration:0,refugeeRemaining:0,nextCivilization:0,nextWar:0,
    civilizations:[],wars:[],talents:Object.fromEntries(Object.keys(T).map(k=>[k,k==='protocol'?1:0])),
    payments:{},interventionSpent:0,legacyEarned:0,legacyFraction:0,lunarProduced:0,lunarFraction:0,lastReward:0,lastCatastropheAt:null,
    selectedCivilization:null,selectedOpponent:null,selectedWar:null,autoWar:false,autoElapsed:0,completionAt:null,seedTendency:0,solar:{...emptyIndustry(),...emptyColonies(),...emptyFlights()},
    log:[{time:0,text:'存续协议已生效。地表的战火，将成为轨道家园的遗产。'}]};
}
export function orbitalLegacySpent(o) {return o?Q.sum([Q.sum(Object.values(o.payments).flat()),o.interventionSpent,industrySpent(o)]):0;}
function log(o,text){o.log.push({time:o.elapsed,text});if(o.log.length>R.historyLimit)o.log.shift();}
function award(s,amount){if(Q.lte(amount,0))return;s.orbital.legacyEarned=Q.add(s.orbital.legacyEarned,amount);s.permanent.totalLegacy=Q.add(s.permanent.totalLegacy,amount);s.permanent.legacy=Q.add(s.permanent.legacy,amount);}
const active=s=>s.run.phase==='orbital' && s.orbital?.started;
export function findCivilization(o,id){return o?.civilizations.find(c=>c.id===id);}
function beginCycle(o){o.cycle++;o.phase='living';o.remaining=0;o.refugeeRemaining=0;seedCivilizations(o);o.selectedCivilization=o.civilizations[0].id;o.selectedOpponent=o.civilizations[1].id;o.selectedWar=null;log(o,`第 ${o.cycle} 轮萌芽：${o.civilizations.length} 个原始文明在地表点燃火种。`);}
export function enterOrbital(s){if(s.run.phase!=='orbital'||!s.orbital||s.orbital.started)return false;s.orbital.started=true;beginCycle(s.orbital);return true;}
export function getOrbitalTalentState(s,key){
  const o=s.orbital,t=T[key];if(!active(s)||!t)return 'locked';if(o.talents[key]>=t.costs.length)return 'max';
  if(Object.entries(t.requires).some(([p,n])=>o.talents[p]<n)||(t.ring??0)>o.talents.recovery)return 'prerequisite';
  if((t.cycles??0)>o.nuclearCycles)return 'cycles';
  // The ark leaves while the surface lies in nuclear winter, like the fleet
  // that left the first civilization's ruins.
  if(key==='voyage'&&o.phase!=='winter')return 'winter';
  return Q.gte(s.permanent.legacy,t.costs[o.talents[key]])?'ready':'legacy';
}
export function purchaseOrbitalTalent(s,key){
  if(getOrbitalTalentState(s,key)!=='ready')return false;const o=s.orbital,cost=T[key].costs[o.talents[key]];
  s.permanent.legacy=Q.sub(s.permanent.legacy,cost);(o.payments[key]??=[]).push(cost);o.talents[key]++;
  if(key==='reseed'){o.remaining*=.75;o.winterDuration*=.75;o.refugeeRemaining*=.75;}
  if(key==='voyage' && o.completionAt===null)o.completionAt=o.elapsed;
  log(o,`轨道天赋：${T[key].name} ${o.talents[key]} 级。`);return true;
}
// 定向播种: 0 keeps the random draw, 1–3 pick the tendency of every later seed.
export function setSeedTendency(s,value){const o=s.orbital;if(!active(s)||!o.talents.directed||![0,1,2,3].includes(value))return false;o.seedTendency=value;return true;}
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
  // Survivors pay in full; with 连锁反扑, this cycle's ruins pay half their final age.
  const survivors=Q.sum(o.civilizations.filter(c=>c.alive).map(c=>civilizationValue(o,c,'nuclear')));
  const ruins=o.talents.chain?Q.mul(Q.sum(o.civilizations.filter(c=>!c.alive).map(c=>civilizationValue(o,c,'nuclear'))),R.chainShare):0;
  const reward=Q.floor(Q.mul(Q.add(survivors,ruins),nuclearMultiplier(o)));
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
export const warOf=(o,c)=>o.wars.find(w=>w.id===c?.warId);
export function interventionCost(o,c,key){
  if(key==='doctrines')return ACTIONS[key].costs[Math.min(4,c.doctrine)];
  // Priced against the civilization's worth, so they stay a decision as the
  // ring multiplies every reward.
  const worth=2**(c.age-1)*orbitalYieldMultiplier(o);
  if(key==='boost')return ACTIONS.boost.baseCost*4**c.power*worth;
  if(key==='airdrop')return ACTIONS.airdrop.baseCost*2**c.airdrops*worth;
  if(key==='ceasefire'){const w=warOf(o,c),top=w?Math.max(...w.participants.map(id=>findCivilization(o,id).age)):c.age;return ACTIONS.ceasefire.baseCost*2**(top-1)*orbitalYieldMultiplier(o);}
  return ACTIONS[key].baseCost*2**(key==='regress'?Math.max(0,c.age-2):key==='advance'?c.age-1:0);
}
export function getInterventionState(s,id,key){
  const o=s.orbital,c=findCivilization(o,id),a=ACTIONS[key];if(!active(s)||o.phase!=='living'||!a||!o.talents[a.talent]||!o.talents.monitor)return 'locked';
  if(!c?.alive)return 'dead';
  if(['doctrines','superSoldiers','sniper'].includes(key)){
    if(key==='doctrines'&&c.doctrine>=5||key==='superSoldiers'&&c.superSoldiers>=1||key==='sniper'&&c.superSoldiers>=2)return 'max';
    if(!c.warId)return 'war';
    if(key==='doctrines'&&c.age<c.doctrine+1||key!=='doctrines'&&c.age<5)return 'age';
    if(key==='superSoldiers'&&c.doctrine<5||key==='sniper'&&c.superSoldiers<1)return 'doctrine';
  }
  if(key==='ceasefire'){if(!c.warId)return 'war';if(warOf(o,c).ceasefire>0)return 'truce';}
  if((key==='airdrop'&&c.airdrops>=R.maximumAirdrops)||(key==='boost'&&c.power>=R.maximumPower)||(key==='advance'&&c.age>=R.finalAge)||(key==='regress'&&c.age<=1))return 'max';
  return Q.gte(s.permanent.legacy,interventionCost(o,c,key))?'ready':'legacy';
}
export function intervene(s,id,key){
  if(getInterventionState(s,id,key)!=='ready')return false;const o=s.orbital,c=findCivilization(o,id),cost=interventionCost(o,c,key);
  s.permanent.legacy=Q.sub(s.permanent.legacy,cost);o.interventionSpent=Q.add(o.interventionSpent,cost);
  if(key==='boost'){c.power++;const war=o.wars.find(w=>w.id===c.warId);if(war)refreshWarBonuses(o,war);}
  if(['doctrines','superSoldiers','sniper'].includes(key)){
    if(key==='doctrines')c.doctrine++;else c.superSoldiers=key==='sniper'?2:1;
    refreshWarBonuses(o,o.wars.find(w=>w.id===c.warId));
  }
  if(key==='airdrop'){
    // Gold lands in the treasury the civilization is actually spending from.
    const war=warOf(o,c),gold=AGES[c.age].startingGold*R.airdropGold;c.airdrops++;
    if(war){const team=['player','enemy'][war.participants.indexOf(c.id)];war.game.gold[team]=Q.add(war.game.gold[team],gold);syncWarCivilizations(o,war);}else c.gold=Q.add(c.gold,gold);
  }
  if(key==='ceasefire')warOf(o,c).ceasefire=R.ceasefireSeconds;
  if(key==='advance'||key==='regress'){changeTechnology(o,c,key==='advance'?1:-1);const war=o.wars.find(w=>w.id===c.warId);if(war)syncWarCivilizations(o,war);}
  if(key==='harvest'){
    const reward=civilizationValue(o,c);c.alive=false;const war=o.wars.find(w=>w.id===c.warId);if(war){syncWarCivilizations(o,war);endWar(o,war);}award(s,reward);
    log(o,`轨道光束抹去了${c.name}，收割 ${Q.format(reward)} Legacy。`);
  }else log(o,`${ACTIONS[key].name}${key==='doctrines'?' '+c.doctrine+'/5':''} → ${c.name} · −${Q.format(cost)} Legacy。`);
  return true;
}
export function updateOrbital(s,dt,{paused=false,hidden=false}={}){
  const o=s.orbital;if(!active(s)||paused||hidden||!Number.isFinite(dt)||dt<=0)return false;
  dt=Math.min(.05,dt);o.elapsed+=dt;let changed=false;
  o.lunarFraction+=lunarLegacyRate(o)*dt;
  const lunarWhole=Math.floor(o.lunarFraction+1e-10);o.lunarFraction=Math.max(0,o.lunarFraction-lunarWhole);
  if(lunarWhole){o.lunarProduced=Q.add(o.lunarProduced,lunarWhole);award(s,lunarWhole);}
  // VII industry runs on its own ledger, winter or not, like the moon.
  for(const t of landTransfers(o))log(o,`${t.civ.name}抵达火星穹顶，开始在新家园工作。`);
  for(const f of landFlights(o))log(o,`方舟抵达${bodyById(f.body).name}，${FACILITIES[facilityAt(f.body)].name}开始运转。`);
  o.solar.fraction+=(industryRate(o)+colonyRate(o))*dt;const solarWhole=Math.floor(o.solar.fraction+1e-10);o.solar.fraction=Math.max(0,o.solar.fraction-solarWhole);
  if(solarWhole){o.solar.produced=Q.add(o.solar.produced,solarWhole);award(s,solarWhole);}
  if(o.phase==='winter'){
    // 余烬观测: the winter itself pays out half the last annihilation, evenly.
    if(o.talents.fallout&&o.winterDuration>0){o.legacyFraction+=Q.toNumber(o.lastReward)*R.falloutShare/o.winterDuration*Math.min(dt,o.remaining);
      const whole=Math.floor(o.legacyFraction+1e-10);o.legacyFraction=Math.max(0,o.legacyFraction-whole);award(s,whole);}
    o.remaining=Math.max(0,o.remaining-dt);if(o.remaining<=1e-8){beginCycle(o);return true;}return false;}
  for(const war of [...o.wars]){
    // A frozen war neither fights nor pays; only its truce clock runs.
    if(war.ceasefire>0){war.ceasefire=Math.max(0,war.ceasefire-dt);if(war.ceasefire<=1e-8){war.ceasefire=0;changed=true;}continue;}
    // Every paid launch owns a damage snapshot; live modifiers affect only new attacks.
    const xp=updateWar(war,dt);syncWarCivilizations(o,war);
    o.legacyFraction+=(Q.toNumber(xp)*R.legacyPerExperience*orbitalYieldMultiplier(o)+bondRate(o,war)*dt)*chronicleMultiplier(o);
    const whole=Math.floor(o.legacyFraction+1e-10);o.legacyFraction=Math.max(0,o.legacyFraction-whole);award(s,whole);
    if(resolveOrbitalWar(s,war.id)){changed=true;if(o.phase==='winter')return true;}
  }
  const alive=o.civilizations.filter(c=>c.alive);
  if(alive.length<2){o.refugeeRemaining+=dt;if(o.refugeeRemaining>=refugeeDelay(o)){const c=seedRefugee(o);o.refugeeRemaining=0;if(c){log(o,`${c.name}从废墟中萌芽。`);changed=true;}}}else o.refugeeRemaining=0;
  o.autoElapsed+=dt;if(o.autoElapsed>=.25){o.autoElapsed%=.25;if(o.autoWar&&o.talents.weaving){const idle=o.civilizations.filter(c=>c.alive&&!c.warId).sort((a,b)=>a.age-b.age);for(let i=0;i+1<idle.length;i+=2)changed=startOrbitalWar(s,idle[i].id,idle[i+1].id)||changed;}}
  return changed;
}
