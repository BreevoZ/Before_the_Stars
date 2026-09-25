import { V17_ORBITAL_TALENTS as OLD, v18OrbitalTalents, v19OrbitalTalents, v20OrbitalTalents, v21OrbitalTalents, v22OrbitalTalents, v23OrbitalTalents, OLD_SHIPYARD_COST } from './orbital-save-history.js';
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
import { FACILITIES, V29_FACILITY_KEYS, V31_FACILITY_KEYS, OLD_DOCKS, arrived, facilityAt, arksAway, arkTotal } from './solar-industry.js';
import { WORLDS, COLONY_WAR, UPLIFT, fuseSeconds } from './colony-war.js';
import { SOLAR_TALENTS, SOLAR_TALENT_KEYS, V26_SOLAR_KEYS, V28_SOLAR_KEYS, V29_SOLAR_KEYS, V30_SOLAR_KEYS, V31_SOLAR_KEYS, V32_SOLAR_KEYS, solarRank, domeCapacity, fleetCapacity, COLONY_RULES } from './solar-colony.js';
function keys(value,expected,name){check(object(value)&&Object.keys(value).length===expected.length&&expected.every(k=>Object.hasOwn(value,k)),name);}
const amount=v=>Q.valid(v)&&Q.gte(v,0);
const whole=v=>amount(v)&&Q.isInteger(v);
export function validateOrbital(s,version){
  if(version<=15)return validateOldOrbital(s,version);
  const o=s.orbital;if(s.run.phase!=='orbital'){check(o===undefined,'轨道阶段状态');return;}
  const V18=v18OrbitalTalents(T),V19=v19OrbitalTalents(T),V20=v20OrbitalTalents(T),V21=v21OrbitalTalents(T),V22=v22OrbitalTalents(T),V23=v23OrbitalTalents(T);
  const configs=version===16?Object.fromEntries(Object.entries(OLD).filter(([key])=>key!=='lunarIndustry')):version===17?OLD:version===18?V18:version===19?V19:version===20?V20:version===21?V21:version===22?V22:version===23?V23:T;
  keys(o,Object.keys(createOrbitalState(1)).filter(key=>(version>=17||!['lunarProduced','lunarFraction'].includes(key))&&(version>=23||key!=='seedTendency')&&(version>=25||key!=='solar')),'轨道字段');
  if(version>=23)check(int(o.seedTendency,0,3)&&(!o.seedTendency||o.talents.directed>0),'定向播种');
  if(version>=25){
    // Planetary industry: exact ledger, only on bodies whose ark has arrived.
    const sol=o.solar,colonyKeys=version>=26?['talents','colonies','transfers','nextTransfer']:[],flights=version>=27?sol.flights:[];
    keys(sol,['facilities','payments','produced','fraction',...colonyKeys,...(version>=27?['flights']:[])],'行星工业字段');const facilityKeys=version>=32?Object.keys(FACILITIES):version>=30?V31_FACILITY_KEYS:V29_FACILITY_KEYS;keys(sol.facilities,facilityKeys,'行星工业设施');
    const ledgerKeys=[...facilityKeys,...(version>=26?[...solarKeysOf(version),'transfers']:[]),...(version>=29?['accords','seizures']:[])];
    check(object(sol.payments)&&Object.keys(sol.payments).every(k=>ledgerKeys.includes(k)),'行星工业账本');
    // v25 footholds only needed the belt before Jupiter; v26 roots the branch on Venus.
    const requiresOf=(key,f)=>version>=26?f.requires??{}:key==='jupiter'?{belt:1}:{};
    for(const key of facilityKeys){const f=FACILITIES[key],rank=sol.facilities[key],paid=sol.payments[key]??[];
      check(int(rank,0,f.costs.length)&&Array.isArray(paid)&&paid.length===rank+(Array.isArray(flights)&&flights.some(x=>x?.body===f.body)?1:0)&&paid.every((cost,i)=>Q.eq(cost,f.costs[i])),'行星工业实付');
      if(rank)check(o.talents.voyage>0&&arrived(o,f.body)&&Object.entries(requiresOf(key,f)).every(([other,level])=>sol.facilities[other]>=level),'行星工业前置');}
    check(whole(sol.produced)&&Q.lte(sol.produced,o.legacyEarned)&&num(sol.fraction,0,1)&&sol.fraction<1,'行星工业产出');
    if(version>=26)validateColonies(o,version);
    if(version>=27)validateFlights(o,version);
  }
  check(o.version===(version===16?2:version===17?3:version===18?4:version===19?5:version===20?6:version===21?7:version===22?8:version===23?9:version===24?10:version===25?11:version===26?12:version===27?13:version===28?14:version===29?15:version===30?16:version===31?17:version===32?18:R.version)&&bool(o.started)&&num(o.elapsed)&&int(o.rng,0,4294967295),'轨道时钟与随机源');
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
      || version>=18 && [OLD,V18,V19,V20,V21,V22,V23].some(table=>priced(table,i,cost)) || version>=19 && key==='transit' && o.talents.outpost>0 && Q.eq(cost,0)
      // v24 keeps the old complete shipyard's payment and grants the six extra ranks.
      || version>=24 && key==='shipyard' && rank===R.arkCount && i>0 && Q.eq(paid[0],OLD_SHIPYARD_COST) && Q.eq(cost,0)
      // v22 moved 轨道收割 under 知识封锁 and granted the lock to earlier harvesters.
      || version>=22 && key==='regression' && o.talents.harvest>0 && Q.eq(cost,0)),'轨道天赋实付');
    if(version>=24&&key==='shipyard'&&paid.length&&Q.eq(paid[0],OLD_SHIPYARD_COST))check(rank===R.arkCount&&paid.slice(1).every(cost=>Q.eq(cost,0)),'旧方舟编队继承');
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
  check(Array.isArray(o.wars)&&o.wars.length<=(version>=22?R.maxWars:3),'战争数量');const wars=new Set(),participants=new Set();
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

// VII colonies (v26): talents on their own ledger, the dome's residents and the
// arks in flight. Transfers are paid; a civilization can only be in one place.
// Before v30 the map had other shapes: an old save is checked for its own keys
// and prices; its prerequisites belong to that old map and are not re-derived.
const solarKeysOf=version=>version>=33?SOLAR_TALENT_KEYS:version>=32?V32_SOLAR_KEYS:version>=31?V31_SOLAR_KEYS:version>=30?V30_SOLAR_KEYS:version>=29?V29_SOLAR_KEYS:version>=27?V28_SOLAR_KEYS:V26_SOLAR_KEYS;
const OLD_COSTS=Object.freeze({heat:[12*2**20],nuclear:[64*2**20],fusion:[320*2**20],jupiterDock:[4*2**30],uranusDock:[64*2**30]});
function validateColonies(o,version){
  const sol=o.solar,talentKeys=solarKeysOf(version);keys(sol.talents,talentKeys,'行星际天赋');
  for(const key of talentKeys){const t=SOLAR_TALENTS[key],costs=t?.costs??OLD_COSTS[key],rank=sol.talents[key],paid=sol.payments[key]??[];
    // 火星港 was granted free (a recorded 0) to v29 saves that already had a dome.
    check(int(rank,0,costs.length)&&Array.isArray(paid)&&paid.length===rank&&paid.every((cost,i)=>Q.eq(cost,costs[i])||key==='harbor'&&Q.eq(cost,0)),'行星际天赋实付');
    if(rank&&version>=33)check(o.talents.voyage>0&&Object.entries(t.requires).every(([p,n])=>solarRank(o,p)>=n)&&(!t.arrival||arrived(o,t.arrival)),'行星际天赋前置');}
  keys(sol.colonies,['mars'],'殖民地');const world=sol.colonies.mars,residents=version>=28?world?.civs:world,uplifted=version>=29?world?.uplifted:[];
  check(Array.isArray(residents)&&Array.isArray(sol.transfers)&&int(sol.nextTransfer),'殖民地列表');
  check(Array.isArray(uplifted),'升格文明列表');
  check(residents.length+uplifted.length+sol.transfers.length<=domeCapacity(o)&&sol.transfers.length<=fleetCapacity(o)&&(sol.transfers.length+residents.length+uplifted.length===0||sol.talents.transfer>0),'殖民容量');
  const ids=new Set(o.civilizations.map(c=>c.id)),civ=c=>{keys(c,['id','name','age','tendency','doctrine'],'殖民文明');
    check(id(c.id)&&!ids.has(c.id)&&typeof c.name==='string'&&c.name.length<=24&&int(c.age,1,R.finalAge)&&int(c.tendency,0,3)&&int(c.doctrine,0,5),'殖民文明状态');ids.add(c.id);};
  for(const c of residents){const {arrivedAt,progress,warId,accord,...rest}=version>=29?c:version>=28?{...c,accord:null}:{...c,progress:0,warId:null,accord:null};civ(rest);check(num(arrivedAt,0,o.elapsed),'殖民抵达时间');
    check(num(progress,0,1)&&progress<1&&(warId===null||id(warId))&&(accord===null||num(accord,0,1)&&accord<1&&rest.age===R.finalAge&&rest.tendency!==UPLIFT.warlike&&sol.talents.uplift>0),'殖民文明进度');}
  // Uplifted civilizations are paid for: by an accord or a seized war.
  for(const c of uplifted){const {arrivedAt,upliftedAt,via,...rest}=c;civ(rest);
    check(rest.age===R.finalAge&&num(arrivedAt,0,o.elapsed)&&num(upliftedAt,arrivedAt,o.elapsed)&&['accord','seizure'].includes(via)&&sol.talents.uplift>0,'升格文明');}
  if(version>=29){const count=(list,n)=>Array.isArray(list??[])&&(list??[]).length>=n&&(list??[]).every(cost=>whole(cost)&&Q.gt(cost,0));
    check(count(sol.payments.accords,residents.filter(c=>c.accord!==null).length+uplifted.filter(c=>c.via==='accord').length),'协议实付');
    check(count(sol.payments.seizures,world.wars.filter(w=>w.seized).length+uplifted.filter(c=>c.via==='seizure').length),'接管实付');}
  if(version>=28)validateWorld(o,world,'mars',version);
  const transfers=new Set();
  for(const t of sol.transfers){keys(t,['id','to','departAt','arriveAt','civ'],'转运字段');
    check(id(t.id)&&!transfers.has(t.id)&&t.to===COLONY_RULES.target&&num(t.departAt,0,o.elapsed)&&num(t.arriveAt)&&t.arriveAt>o.elapsed-1e-9&&t.arriveAt>t.departAt,'转运航程');transfers.add(t.id);civ(t.civ);}
  const paid=sol.payments.transfers??[];check(Array.isArray(paid)&&paid.length>=sol.transfers.length+residents.length&&paid.every(cost=>whole(cost)&&Q.gt(cost,0)),'转运实付');
}

// Arks in flight (v27): one per unbuilt foothold, paid, from a drydock the
// player owns, on a leg the current drive and hull can fly.
// v30: every ark leaves Mars (older ones may have left the Moon) and passes
// only through drydocks; no more arks are away than the fleet holds.
function validateFlights(o,version){
  const sol=o.solar,seen=new Set();check(Array.isArray(sol.flights),'方舟航程');
  for(const f of sol.flights){keys(f,['body','from',...(version>=30?['via']:[]),'departAt','arriveAt'],'方舟航程字段');const key=facilityAt(f.body);
    check(key&&!seen.has(f.body)&&sol.facilities[key]===0&&['moon','mars'].includes(f.from)&&(version<30||Array.isArray(f.via)&&f.via.every(d=>OLD_DOCKS.includes(d)&&d!==f.body)),'方舟航线');seen.add(f.body);
    check(num(f.departAt,0,o.elapsed)&&num(f.arriveAt)&&f.arriveAt>o.elapsed-1e-9&&f.arriveAt>f.departAt,'方舟航行时间');}
  if(version>=30)check(arksAway(o)<=arkTotal(o),'方舟数量');
}

// A colony world (v28): its phase and winter clock, and the abstract wars
// between its residents. A war names exactly the two residents fighting it.
function validateWorld(o,w,key,version){
  const env=WORLDS[key],R=COLONY_WAR;
  keys(w,['phase','remaining','civs','wars',...(version>=29?['uplifted']:[]),'nextWar','fuse','nuclear'],'殖民世界');
  check(['living','winter'].includes(w.phase)&&num(w.remaining,0,env.winter)&&int(w.nextWar)&&num(w.fuse,0,fuseSeconds(o,key))&&int(w.nuclear)&&Array.isArray(w.wars),'殖民世界状态');
  check(w.phase==='winter'?w.remaining>0&&w.civs.length===0&&w.wars.length===0:w.remaining===0,'殖民核冬天');
  const fighting=new Map(),seen=new Set();
  for(const war of w.wars){keys(war,['id','sides','base','elapsed','tempo','luck','surge','nextSurge',...(version>=29?['seized']:[])],'殖民战争字段');
    check(version<29||typeof war.seized==='boolean','殖民战争接管');
    check(id(war.id)&&!seen.has(war.id)&&Array.isArray(war.sides)&&war.sides.length===2&&war.sides[0]!==war.sides[1],'殖民战争双方');seen.add(war.id);
    for(const side of war.sides){check(!fighting.has(side),'殖民战争重复参战');fighting.set(side,war.id);}
    check([war.base,war.luck,war.surge].every(a=>Array.isArray(a)&&a.length===2)&&war.base.every(b=>num(b,0,1))&&num(war.elapsed)&&num(war.nextSurge)
      &&num(war.tempo,R.tempoMin,R.tempoMin+R.tempoSpan)&&war.luck.every(x=>num(x,R.luckMin,R.luckMin+R.luckSpan))&&war.surge.every(x=>num(x,R.surgeMin,R.surgeMin+R.surgeSpan)),'殖民战争状态');}
  for(const c of w.civs)check(c.warId===(fighting.get(c.id)??null),'殖民战争引用');
  check(fighting.size===w.wars.length*2&&[...fighting.keys()].every(side=>w.civs.some(c=>c.id===side)),'殖民战争成员');
}
