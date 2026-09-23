import { TRAITS } from './traits.js';
import { getSuperSoldierBonuses } from './progression-bonuses.js';
import { Q } from './quantity.js';
import { createGame, updateGame, updateCommander, evolve, AGES, UNITS, TURRETS } from './game.js';
import { createBonusStack, stat } from './stats.js';
import { ORBITAL_RULES as R, TENDENCIES } from './orbital-config.js';
const TEAMS=['player','enemy'];
export function warBonuses(civilizations) {
  const effects=[];
  for (const [i,c] of civilizations.entries()) {
    const team=TEAMS[i], source={kind:'status',id:`orbit:${c.id}`,label:`${c.name} · 轨道战争`};
    const add=(key,value,kind,type='multiply')=>effects.push({target:{stat:key,team,...(kind?{kind}:{})},type,value,source});
    add('income',R.warIncome*(1+c.profile*.025));add('experience',R.warExperience,'reward');add('baseHealth',R.warBaseHealth);
    add('damage',1.25**c.power,'unit');add('health',1.25**c.power,'unit');
    // These wars evolve from casualties, without a hidden time-based XP grant.
    // A limited front prevents the observer from becoming a CPU stress test.
    if (Object.hasOwn(c,'doctrine')) {
      add('traitAccess',true,'unit','override');
      for(const trait of Object.values(TRAITS))if(UNITS[trait.units[0]].age<=c.doctrine)
        effects.push({target:{stat:trait.stat,type:trait.units[0],team},type:'override',value:true,source:{...source,id:`orbit:${c.id}:doctrine`,label:`${c.name} · 第 ${UNITS[trait.units[0]].age} 档学说`}});
      effects.push(...getSuperSoldierBonuses(c.superSoldiers>=2,c.superSoldiers>=1,team).map(e=>({...e,source:{...source,id:`orbit:${c.id}:elite`,label:`${c.name} · ${c.superSoldiers>=2?'狙击激光枪':'超级士兵计划'}`}})));
      effects.push({target:{stat:'allowEnemyRecruit',type:'superSoldier',team},type:'override',value:c.superSoldiers>=1,source});
    }
    // A tendency changes how a civilization fights, so wars stop being identical.
    const tendency=TENDENCIES[c.tendency??0];
    if(tendency)for(const [key,value]of Object.entries(tendency.effects))effects.push({target:{stat:key,team,...(['damage','health'].includes(key)?{kind:'unit'}:key==='experience'?{kind:'reward'}:{})},
      type:'multiply',value,source:{...source,id:`orbit:${c.id}:tendency`,label:`${c.name} · ${tendency.name}`}});
    add('armyLimit',12,undefined,'override');add('queueLimit',4,undefined,'override');
  }
  return createBonusStack(effects);
}
export function createWar(id, civilizations) {
  const game=createGame({mode:'incremental',ages:Object.fromEntries(TEAMS.map((t,i)=>[t,civilizations[i].age])),bonuses:warBonuses(civilizations)});
  game.ai.enabled=false;
  const commanders=Object.fromEntries(TEAMS.map((t,i)=>[t,{enabled:true,cooldown:1+i*.15,orders:civilizations[i].profile,strategy:'balanced',waves:0}]));
  for(const [i,team] of TEAMS.entries()) {game.gold[team]=civilizations[i].gold;game.experience[team]=civilizations[i].experience;}
  return {id,participants:civilizations.map(c=>c.id),game,commanders,ceasefire:0};
}
export function updateWar(war,dt) {
  for(const team of TEAMS) updateCommander(war.game,dt,team,war.commanders[team],{specialType:stat(war.game,{type:'superSoldier',team},'enabled')?'superSoldier':null});
  const before=Q.sum(Object.values(war.game.experience));
  updateGame(war.game,dt);
  return Q.sub(Q.sum(Object.values(war.game.experience)),before);
}
export function syncWarCivilizations(state,war) {
  war.participants.forEach((id,i)=>{
    const c=state.civilizations.find(c=>c.id===id),team=TEAMS[i];
    c.age=war.game.ages[team];c.experience=war.game.experience[team];c.gold=war.game.gold[team];
  });
}
export function refreshWarBonuses(state,war) {
  const g=war.game, ratios=g.units.map(u=>[u,Q.div(u.hp,stat(g,u,'health'))]);
  g.bonuses=warBonuses(war.participants.map(id=>state.civilizations.find(c=>c.id===id)));
  for(const [u,ratio] of ratios) u.hp=Q.mul(ratio,stat(g,u,'health'));
}
export function changeTechnology(state,civ,direction) {
  const next=civ.age+direction,war=state.wars.find(w=>w.id===civ.warId);
  civ.age=next;civ.experience=AGES[next].experienceRequired;
  if(!war)return;
  const g=war.game,team=TEAMS[war.participants.indexOf(civ.id)];
  if(direction>0){g.experience[team]=civ.experience;evolve(g,team);}
  else {
    const fraction=Q.div(g.bases[team].hp,g.bases[team].maxHp);g.ages[team]=next;g.experience[team]=civ.experience;
    g.bases[team].maxHp=stat(g,team,'baseHealth');g.bases[team].hp=Q.max(1,Q.mul(fraction,g.bases[team].maxHp));
    g.units=g.units.filter(u=>u.team!==team || UNITS[u.type].age<=next);
    g.queues[team]=g.queues[team].filter(order=>UNITS[order.type].age<=next);
    g.turrets[team]=g.turrets[team].map(t=>t && TURRETS[t.type].age>next?null:t);
    // Orbital EMP removes this side's advanced munitions as well as its factories.
    g.projectiles=g.projectiles.filter(p=>p.team!==team);g.fields=g.fields.filter(p=>p.team!==team);
  }
}
// 情报网络: a logistic estimate fitted to ~200 headless orbital wars (≈90%
// of favourites won). A single boost outweighs a whole age; once fighting,
// the base and the army on the field matter more than the age gap.
const ODDS=Object.freeze({before:{age:1.6,power:1.9},during:{age:.8,power:1.5,base:3.2,field:1.3},tendency:.7,doctrine:.25,elite:.8});
const tendencyEdge=c=>{const t=TENDENCIES[c.tendency??0]?.effects??{};return Math.log((t.damage??1)*(t.health??1));};
export function warOdds(first,second,war=null){
  const k=war?ODDS.during:ODDS.before;
  let z=k.age*(first.age-second.age)+k.power*(first.power-second.power)+ODDS.tendency*(tendencyEdge(first)-tendencyEdge(second))
    +ODDS.doctrine*(first.doctrine-second.doctrine)+ODDS.elite*(Math.min(1,first.superSoldiers)-Math.min(1,second.superSoldiers));
  if(war){
    const g=war.game,field=team=>Q.toNumber(Q.sum(g.units.filter(u=>u.team===team).map(u=>u.hp))),base=team=>Q.toNumber(Q.div(g.bases[team].hp,g.bases[team].maxHp));
    const [pa,pb]=[field('player'),field('enemy')];
    z+=k.base*(base('player')-base('enemy'))+k.field*(pa-pb)/(pa+pb+1);
  }
  return 1/(1+Math.exp(-Math.max(-30,Math.min(30,z))));
}
