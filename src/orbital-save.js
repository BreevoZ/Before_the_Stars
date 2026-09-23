import { Q } from './quantity.js';
import { check, object, num, int, bool, id } from './save-primitives.js';
import { validateShape, AI_SHAPE } from './save-schema.js';
import { validateBattle } from './save-battle.js';
import { validateOldOrbital } from './orbital-save-v15.js';
import { ORBITAL_RULES as R, ORBITAL_TALENTS as T, SITES } from './orbital-config.js';
import { createOrbitalState } from './orbital-game.js';
import { warBonuses } from './orbital-war.js';
import { rebirthDelay, refugeeDelay } from './celestial-economy.js';
import { AGES } from './game-config.js';
function keys(value,expected,name){check(object(value)&&Object.keys(value).length===expected.length&&expected.every(k=>Object.hasOwn(value,k)),name);}
const amount=v=>Q.valid(v)&&Q.gte(v,0);
const whole=v=>amount(v)&&Q.isInteger(v);
export function validateOrbital(s,version){
  if(version<=15)return validateOldOrbital(s,version);
  const o=s.orbital;if(s.run.phase!=='orbital'){check(o===undefined,'轨道阶段状态');return;}
  const configs=version===16?Object.fromEntries(Object.entries(T).filter(([key])=>key!=='lunarIndustry')):T;
  keys(o,Object.keys(createOrbitalState(1)).filter(key=>version>=17||!['lunarProduced','lunarFraction'].includes(key)),'轨道字段');
  check(o.version===(version===16?2:3)&&bool(o.started)&&num(o.elapsed)&&int(o.rng,0,4294967295),'轨道时钟与随机源');
  for(const key of ['cycle','settledCycle','nuclearCycles','nextCivilization','nextWar'])check(int(o[key]),key);
  check(o.nuclearCycles===o.settledCycle&&o.settledCycle<=o.cycle,'核毁灭凭据');
  check(['dormant','living','winter'].includes(o.phase)&&o.started===(o.phase!=='dormant'),'萌芽阶段');
  check(o.started?o.cycle>=1:o.cycle===0,'萌芽轮次');
  check(o.phase==='winter'?o.settledCycle===o.cycle:o.phase==='living'?o.settledCycle===o.cycle-1:o.settledCycle===0,'轮次结算标记');
  keys(o.talents,Object.keys(configs),'轨道天赋');check(object(o.payments)&&Object.keys(o.payments).every(k=>Object.hasOwn(configs,k)&&k!=='protocol'),'轨道账本');
  for(const [key,t]of Object.entries(configs)){
    const rank=o.talents[key];check(int(rank,0,t.costs.length),'轨道天赋等级');
    if(rank)check(Object.entries(t.requires).every(([p,n])=>o.talents[p]>=n)&&(t.cycles??0)<=o.nuclearCycles,'轨道天赋前置');
    const paid=o.payments[key]??[];check(Array.isArray(paid)&&paid.length===(key==='protocol'?0:rank)&&paid.every((cost,i)=>Q.eq(cost,t.costs[i])),'轨道天赋实付');
  }
  check(o.talents.protocol===1,'存续协议继承');
  check(bool(o.autoWar)&&(!o.autoWar||o.talents.weaving>0)&&num(o.autoElapsed,0,.25)&&o.autoElapsed<.25,'战争自动化');
  check(whole(o.interventionSpent)&&whole(o.legacyEarned)&&Q.lte(o.legacyEarned,s.permanent.totalLegacy)&&whole(o.lastReward)&&Q.lte(o.lastReward,o.legacyEarned),'轨道遗产');
  if(version>=17)check(whole(o.lunarProduced)&&Q.lte(o.lunarProduced,o.legacyEarned)&&num(o.lunarFraction,0,1)&&o.lunarFraction<1&&(o.talents.outpost>0||Q.eq(o.lunarProduced,0)&&o.lunarFraction===0),'月面生产记录');
  check(num(o.legacyFraction,0,1)&&o.legacyFraction<1,'战争收益余数');
  check(num(o.remaining,0,rebirthDelay(o))&&num(o.winterDuration,0,rebirthDelay(o))&&o.remaining<=o.winterDuration&&num(o.refugeeRemaining,0,refugeeDelay(o)),'重生等待');
  check(o.phase==='winter'?o.remaining>0:o.remaining===0,'核冬天时钟');
  check(o.lastCatastropheAt===null?o.nuclearCycles===0:num(o.lastCatastropheAt,0,o.elapsed)&&o.nuclearCycles>0,'核毁灭时间');
  check(o.talents.transit?num(o.completionAt,0,o.elapsed):o.completionAt===null,'VI 完成记录');
  check(Array.isArray(o.civilizations)&&o.civilizations.length<=SITES.length,'地表文明数量');
  const ids=new Set(),sites=new Set();
  for(const c of o.civilizations){
    keys(c,['id','site','name','alive','age','experience','gold','power','profile','warId'],'文明字段');
    check(id(c.id)&&!ids.has(c.id)&&c.id.startsWith(`c${o.cycle}-`)&&SITES.some(p=>p.id===c.site)&&!sites.has(c.site),'文明点位与标识');ids.add(c.id);sites.add(c.site);
    check(typeof c.name==='string'&&c.name.length>0&&c.name.length<=24&&bool(c.alive)&&int(c.age,1,R.finalAge)&&int(c.power,0,R.maximumPower)&&int(c.profile,0,2),'文明状态');
    check(whole(c.experience)&&Q.gte(c.experience,AGES[c.age].experienceRequired)&&amount(c.gold),'文明经济');
    check(c.warId===null||id(c.warId),'文明战争引用');
  }
  check(Array.isArray(o.wars)&&o.wars.length<=3,'战争数量');const wars=new Set(),participants=new Set();
  for(const w of o.wars){
    keys(w,['id','participants','game','commanders'],'战争字段');
    check(id(w.id)&&!wars.has(w.id)&&w.id.startsWith(`w${o.cycle}-`)&&Array.isArray(w.participants)&&w.participants.length===2&&new Set(w.participants).size===2,'战争标识');wars.add(w.id);
    const civs=w.participants.map(id=>o.civilizations.find(c=>c.id===id));
    check(civs.every(c=>c?.alive&&c.warId===w.id&&!participants.has(c.id)),'战争双方');civs.forEach(c=>participants.add(c.id));
    const g=w.game;check(object(g)&&g.mode==='incremental'&&Array.isArray(g.bonuses)&&JSON.stringify(g.bonuses)===JSON.stringify(warBonuses(civs)),'战争属性来源');
    check(g.ai.enabled===false&&g.ability===null&&g.abilityCooldown===0&&num(g.elapsed,0,o.elapsed),'战争接管');
    keys(w.commanders,['player','enemy'],'双方指挥官');
    for(const [i,team]of ['player','enemy'].entries()){
      validateShape(w.commanders[team],AI_SHAPE,'commander');check(w.commanders[team].enabled,'指挥官接管');
      check(civs[i].age===g.ages[team]&&Q.eq(civs[i].experience,g.experience[team])&&Q.eq(civs[i].gold,g.gold[team]),'文明与战斗快照');
    }
    validateBattle(g,version);check(g.status==='playing','待结算战争');
  }
  for(const c of o.civilizations)check(c.warId===null?!participants.has(c.id):wars.has(c.warId)&&participants.has(c.id),'孤立战争引用');
  if(o.phase!=='living')check(o.wars.length===0&&o.civilizations.every(c=>!c.alive),'核冬天地表');
  for(const field of ['selectedCivilization','selectedOpponent'])check(o[field]===null||ids.has(o[field]),'文明选择');
  check(o.selectedWar===null||wars.has(o.selectedWar),'战争监控选择');
  check(Array.isArray(o.log)&&o.log.length<=R.historyLimit&&o.log.every(e=>object(e)&&num(e.time,0,o.elapsed)&&typeof e.text==='string'&&e.text.length<=140),'轨道日志');
  if(!o.started)check(o.elapsed===0&&o.civilizations.length===0&&o.nextWar===0&&o.nextCivilization===0&&!Object.keys(o.payments).length&&Q.eq(o.interventionSpent,0),'未开始的家园');
}
