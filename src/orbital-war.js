import { Q } from './quantity.js';
import { createGame, updateGame, updateCommander, evolve, AGES, UNITS, TURRETS } from './game.js';
import { createBonusStack, stat } from './stats.js';
import { ORBITAL_RULES as R } from './orbital-config.js';
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
    add('armyLimit',12,undefined,'override');add('queueLimit',4,undefined,'override');
  }
  return createBonusStack(effects);
}
export function createWar(id, civilizations) {
  const game=createGame({mode:'incremental',ages:Object.fromEntries(TEAMS.map((t,i)=>[t,civilizations[i].age])),bonuses:warBonuses(civilizations)});
  game.ai.enabled=false;
  const commanders=Object.fromEntries(TEAMS.map((t,i)=>[t,{enabled:true,cooldown:1+i*.15,orders:civilizations[i].profile,strategy:'balanced',waves:0}]));
  for(const [i,team] of TEAMS.entries()) {game.gold[team]=civilizations[i].gold;game.experience[team]=civilizations[i].experience;}
  return {id,participants:civilizations.map(c=>c.id),game,commanders};
}
export function updateWar(war,dt) {
  for(const team of TEAMS) updateCommander(war.game,dt,team,war.commanders[team]);
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
