import { V17_ORBITAL_TALENTS as OLD, v18OrbitalTalents, v19OrbitalTalents, v20OrbitalTalents } from './orbital-save-history.js';
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
  const V18=v18OrbitalTalents(T),V19=v19OrbitalTalents(T),V20=v20OrbitalTalents(T);
  const configs=version===16?Object.fromEntries(Object.entries(OLD).filter(([key])=>key!=='lunarIndustry')):version===17?OLD:version===18?V18:version===19?V19:version===20?V20:T;
  keys(o,Object.keys(createOrbitalState(1)).filter(key=>version>=17||!['lunarProduced','lunarFraction'].includes(key)),'轨道字段');
  check(o.version===(version===16?2:version===17?3:version===18?4:version===19?5:version===20?6:7)&&bool(o.started)&&num(o.elapsed)&&int(o.rng,0,4294967295),'轨道时钟与随机源');
  for(const key of ['cycle','settledCycle','nuclearCycles','nextCivilization','nextWar'])check(int(o[key]),key);
  check(o.nuclearCycles===o.settledCycle&&o.settledCycle<=o.cycle,'核毁灭凭据');
  check(['dormant','living','winter'].includes(o.phase)&&o.started===(o.phase!=='dormant'),'萌芽阶段');
  check(o.started?o.cycle>=1:o.cycle===0,'萌芽轮次');
  check(o.phase==='winter'?o.settledCycle===o.cycle:o.phase==='living'?o.settledCycle===o.cycle-1:o.settledCycle===0,'轮次结算标记');
  keys(o.talents,Object.keys(configs),'轨道天赋');check(object(o.payments)&&Object.keys(o.payments).every(k=>Object.hasOwn(configs,k)&&k!=='protocol'),'轨道账本');
  for(const [key,t]of Object.entries(configs)){
    const rank=o.talents[key];check(int(rank,0,t.costs.length),'轨道天赋等级');
    if(rank)check(Object.entries(t.requires).every(([p,n])=>o.talents[p]>=n)&&(t.cycles??0)<=o.nuclearCycles&&(t.ring??0)<=o.talents.recovery,'轨道天赋前置');
    // Payments keep the price actually paid; the v19 route was granted free to
    // v18 players who already ran a lunar outpost without it.
    const priced=(table,i,cost)=>table[key]?.costs[i]!==undefined&&Q.eq(cost,table[key].costs[i]);
    const paid=o.payments[key]??[];check(Array.isArray(paid)&&paid.length===(key==='protocol'?0:rank)&&paid.every((cost,i)=>Q.eq(cost,t.costs[i])
      || version>=18 && (priced(OLD,i,cost) || priced(V18,i,cost) || priced(V19,i,cost)) || version>=19 && key==='transit' && o.talents.outpost>0 && Q.eq(cost,0)),'轨道天赋实付');
  }
  check(o.talents.protocol===1,'存续协议继承');
  check(bool(o.autoWar)&&(!o.autoWar||o.talents.weaving>0)&&num(o.autoElapsed,0,.25)&&o.autoElapsed<.25,'战争自动化');
  check(whole(o.interventionSpent)&&whole(o.legacyEarned)&&Q.lte(o.legacyEarned,s.permanent.totalLegacy)&&whole(o.lastReward)&&Q.lte(o.lastReward,o.legacyEarned),'轨道遗产');
  if(version>=17)check(whole(o.lunarProduced)&&Q.lte(o.lunarProduced,o.legacyEarned)&&num(o.lunarFraction,0,1)&&o.lunarFraction<1&&(o.talents.outpost>0||Q.eq(o.lunarProduced,0)&&o.lunarFraction===0),'月面生产记录');
  check(num(o.legacyFraction,0,1)&&o.legacyFraction<1,'战争收益余数');
  check(num(o.remaining,0,rebirthDelay(o))&&num(o.winterDuration,0,rebirthDelay(o))&&o.remaining<=o.winterDuration&&num(o.refugeeRemaining,0,refugeeDelay(o)),'重生等待');
  check(o.phase==='winter'?o.remaining>0:o.remaining===0,'核冬天时钟');
  check(o.lastCatastropheAt===null?o.nuclearCycles===0:num(o.lastCatastropheAt,0,o.elapsed)&&o.nuclearCycles>0,'核毁灭时间');
  check(o.talents[version>=19?'voyage':'transit']?num(o.completionAt,0,o.elapsed):o.completionAt===null,'VI 完成记录');
  check(Array.isArray(o.civilizations)&&o.civilizations.length<=SITES.length,'地表文明数量');
  const ids=new Set(),sites=new Set();
  for(const c of o.civilizations){
    keys(c,['id','site','name','alive','age','experience','gold','power','profile','warId',...(version>=18?['doctrine','superSoldiers']:[]),...(version>=20?['tendency']:[]),...(version>=21?['airdrops']:[])],'文明字段');
    if(version>=21)check(int(c.airdrops,0,R.maximumAirdrops)&&(!c.airdrops||o.talents.airdrop>0),'资源空投');
    if(version>=20)check(int(c.tendency,0,3)&&(!c.tendency||o.talents.tendency>0),'文明倾向');
    check(id(c.id)&&!ids.has(c.id)&&c.id.startsWith(`c${o.cycle}-`)&&SITES.some(p=>p.id===c.site)&&!sites.has(c.site),'文明点位与标识');ids.add(c.id);sites.add(c.site);
    check(typeof c.name==='string'&&c.name.length>0&&c.name.length<=24&&bool(c.alive)&&int(c.age,1,R.finalAge)&&int(c.power,0,R.maximumPower)&&int(c.profile,0,2),'文明状态');
    check(whole(c.experience)&&Q.gte(c.experience,AGES[c.age].experienceRequired)&&amount(c.gold),'文明经济');
    check(c.warId===null||id(c.warId),'文明战争引用');
    if(version>=18){
      check(int(c.doctrine,0,5)&&int(c.superSoldiers,0,2),'文明兵种升级');
      check(!c.doctrine||o.talents.doctrines>0,'学说授权');
      check(!c.superSoldiers||c.doctrine===5&&o.talents.superSoldiers>0,'超级士兵授权');
      check(c.superSoldiers<2||o.talents.sniper>0,'狙击授权');
    }
  }
  check(Array.isArray(o.wars)&&o.wars.length<=3,'战争数量');const wars=new Set(),participants=new Set();
  for(const w of o.wars){
    keys(w,['id','participants','game','commanders',...(version>=21?['ceasefire']:[])],'战争字段');
    if(version>=21)check(num(w.ceasefire,0,R.ceasefireSeconds)&&(w.ceasefire===0||o.talents.ceasefire>0),'停火协议');
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
