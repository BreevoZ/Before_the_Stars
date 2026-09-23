import { Q } from './quantity.js';
import { AGES, UNITS } from './game-config.js';
import { SITES, ORBITAL_TALENTS as T, ORBITAL_ACTIONS as A, ORBITAL_RULES as R } from './orbital-config.js';
import { findCivilization, getWarState, getInterventionState, interventionCost, getOrbitalTalentState } from './orbital-game.js';
import { civilizationValue, orbitalYieldMultiplier, lunarLegacyRate } from './celestial-economy.js';
import { TRAITS } from './traits.js';
import { siteDaylight } from './celestial-clock.js';
export const orbitalTime = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
export function orbitalTalentEffect(o,key,rank=o.talents[key]){
  if(key==='recovery')return `${rank} 段 · 遗产 ×${2**rank}`;
  if(key==='reseed')return `核冬天 ${Math.round(R.winterSeconds*.75**rank)} 秒`;
  if(key==='diversity')return `至少 ${Math.min(6,R.minCivilizations+rank)} 个文明`;
  if(key==='outpost')return rank?`${Q.format(R.lunarBaseIncome*2**(o.talents.recovery+o.talents.lunarIndustry))} Legacy/s · 战争再 ×2`:'尚未建立月面基地';
  if(key==='lunarIndustry')return `${Q.format(R.lunarBaseIncome*2**(o.talents.recovery+rank))} Legacy/s`;
  if(key==='doctrines')return rank?'可授予 I–V 五档兵种特性':'未开放兵种学说';
  if(key==='superSoldiers')return rank?'可授权近战超级士兵':'未开放精锐授权';
  if(key==='sniper')return rank?'可授权引导狙击激光枪':'未开放远程强化';
  return rank?'已解锁':'未解锁';
}
export function buildOrbitalViewModel(s,{paused=false,talent='monitor',selected=false}={}){
  const o=s.orbital,active=s.run.phase==='orbital'&&o?.started;
  const v={'body@data-orbital-active':String(Boolean(active)),'#orbital-game@hidden':!active};if(!active)return v;
  const alive=o.civilizations.filter(c=>c.alive),first=findCivilization(o,o.selectedCivilization),second=findCivilization(o,o.selectedOpponent),winter=o.phase==='winter';
  Object.assign(v,{
    '#colony-legacy':Q.format(s.permanent.legacy),'#orbit-tree-wallet':Q.format(s.permanent.legacy),
    '#colony-earned':`本阶段已收获 ${Q.format(o.legacyEarned)} · 收益 ×${orbitalYieldMultiplier(o)}`,
    '#colony-income':o.talents.outpost?`月面 +${Q.format(lunarLegacyRate(o))}/s`:'文明遗产',
    '#colony-lunar@hidden':!o.talents.outpost,'#colony-lunar-rate':Q.format(lunarLegacyRate(o)),
    '#colony-lunar-level':`自动工场 ${o.talents.lunarIndustry} / 4 · ${3+o.talents.lunarIndustry*2} 处设施 · 星环 ×${2**o.talents.recovery}`,
    '#colony-lunar-produced':`累计生产 ${Q.format(o.lunarProduced)} Legacy`,'#colony-habitat-state':`${o.talents.recovery} / ${R.habitatSections} 段 · 遗产 ×${2**o.talents.recovery}`,
    '#colony-time':orbitalTime(o.elapsed),'#colony-cycle':`第 ${o.cycle} 轮萌芽 · ${o.nuclearCycles} 次核毁灭`,
    '#colony-pause':paused?'继续':'暂停','#colony-pause@aria-pressed':String(paused),
    '#colony-speed':`${s.permanent.settings.speed}×`,'#colony-speed@hidden':s.debug===true,'#colony-debug-speed@hidden':s.debug!==true,'#colony-debug-speed@value':String(s.debugSpeed??1),
    '#colony-objective':winter?'余烬，等待下一次黎明。':'地球之上，文明再生。',
    '#colony-objective-detail':winter?`全球文明已被核武毁灭。${Math.ceil(o.remaining)} 秒后，新的火种将在不同点位萌芽。`:'选择两个空闲文明，挑起战争。双方通过招募、杀敌与阵亡获得经验并进化。',
    '#colony-fallout@hidden':!winter,'#colony-fallout':`+${Q.format(o.lastReward)} Legacy 已入账 · 核冬天 ${Math.ceil(o.remaining)} 秒`,
    '#colony-complete@hidden':o.completionAt===null,'#colony-complete':`VI · 地月家园已贯通。月面生产与地表观测持续运行。`,
    '#colony-first@value':first?.site??'', '#colony-opponent@value':second?.site??'',
    '#colony-start-war@disabled':getWarState(s,first?.id,second?.id)!=='ready',
    '#colony-war-hint':{waiting:'等待文明重新萌芽。',selection:'请选择两个存活文明。',busy:'所选文明正在交战；每个文明同时参与一场战争。',ready:'免费挑起战争 · 战斗中的金币属于地面文明。'}[getWarState(s,first?.id,second?.id)],
    '#colony-auto-row@hidden':!o.talents.weaving,'#colony-auto@checked':o.autoWar,
    '#colony-refugees@hidden':winter||alive.length>=2,'#colony-refugees':`幸存者正在等待新的对手。新聚落即将从空闲点位萌芽。`,
    '#colony-selected-name':first?`${first.name} · ${first.alive?AGES[first.age].numeral+' '+AGES[first.age].shortName:'废墟'}`:'选择一个文明',
    '#colony-selected-stats':first?.alive?`军备扶持 ${first.power}/5 · 部队伤害与生命 ×${(1.25**first.power).toFixed(2)} · 收割价值 ${Q.format(civilizationValue(o,first))} Legacy`:'废墟没有可收割的遗产。',
    '#colony-monitor-locked@hidden':Boolean(o.talents.monitor),'#colony-monitor@hidden':!o.talents.monitor,
    '#colony-event':o.log.at(-1)?.text??'',
  });
  for(const site of SITES){const c=o.civilizations.find(c=>c.site===site.id),label=c?`${c.name} · ${c.alive?AGES[c.age].numeral+(c.warId?' 交战':''):'废墟'}`:`${site.name} · 尚无火种`;
    v[`#site-${site.id}@title`]=label;v[`#site-${site.id}@aria-label`]=label;v[`#site-${site.id}@aria-pressed`]=String(c?.id===first?.id);v[`#site-${site.id}@disabled`]=!c;
    v[`#site-${site.id}@data-state`]=c?.alive?(c.warId?'war':'alive'):'empty';v[`#site-${site.id}-age`]=c?.alive?AGES[c.age].numeral:'·';
    v[`#roster-${site.id}@hidden`]=!c;v[`#roster-${site.id}@aria-pressed`]=String(c?.id===first?.id);v[`#roster-${site.id}@data-state`]=c?.alive?(c.warId?'war':'alive'):'ruins';
    v[`#roster-name-${site.id}`]=c?.name??site.name;v[`#roster-age-${site.id}`]=c?.alive?`${AGES[c.age].numeral} · ${siteDaylight(o.elapsed,site).label}`:'废墟';
    for(const which of ['first','opponent']){v[`#${which}-${site.id}`]=label;v[`#${which}-${site.id}@disabled`]=!c?.alive;}
  }
  for(let rank=1;rank<=R.habitatSections;rank++)v[`#colony-ring-ranks-${rank}@class:built`]=o.talents.recovery>=rank;
  for(let rank=1;rank<=4;rank++)v[`#colony-lunar-ranks-${rank}@class:built`]=o.talents.lunarIndustry>=rank;
  v['#colony-doctrines@hidden']=!o.talents.doctrines;
  v['#colony-doctrine-status']=first?.alive?`${first.name} · 学说 ${first.doctrine}/5${first.superSoldiers?' · '+(first.superSoldiers===2?'狙击精锐':'匕首精锐'):''}`:'等待一个交战文明';
  for(let age=1;age<=5;age++)v[`#doctrine-tier-${age}@class:granted`]=Boolean(first?.alive&&first.doctrine>=age);
  for(const [key,a]of Object.entries(A)){
    const status=getInterventionState(s,first?.id,key),cost=first?interventionCost(o,first,key):a.baseCost;
    v[`#intervene-${key}@disabled`]=status!=='ready';
    v[`#intervene-${key}-name`]=key==='doctrines'&&first?.doctrine<5?`授予 ${AGES[first.doctrine+1].numeral} · ${AGES[first.doctrine+1].shortName}学说`:a.name;
    if(['superSoldiers','sniper'].includes(key))v[`#intervene-${key}@hidden`]=!o.talents[a.talent];v[`#intervene-${key}-cost`]=key==='harvest'&&first?.alive?`+${Q.format(civilizationValue(o,first))}`:`${Q.format(cost)}`;
    v[`#intervene-${key}-state`]={locked:`需要「${T[a.talent].name}」`,dead:'文明已消亡',max:'已完成',legacy:'遗产不足',war:'需要交战中的文明',age:'文明时代不足',doctrine:key==='sniper'?'先授予超级士兵':'先完成五档学说',ready:key==='doctrines'?Object.values(TRAITS).filter(t=>UNITS[t.units[0]].age===(first?.doctrine??0)+1).map(t=>t.name).join(' · '):'执行'}[status];
  }
  for(let i=0;i<3;i++){const w=o.wars[i];v[`#watch-war-${i}@hidden`]=!w;v[`#watch-war-${i}`]=w?w.participants.map(id=>findCivilization(o,id).name).join(' ↔ '):'';v[`#watch-war-${i}@aria-pressed`]=String(w?.id===o.selectedWar);}
  const w=o.wars.find(w=>w.id===o.selectedWar);v['#colony-battle@hidden']=!w;v['#colony-no-war@hidden']=Boolean(w);
  const host=w&&findCivilization(o,w.participants[0]),site=host&&SITES.find(s=>s.id===host.site);
  v['#colony-solar-time']=site?`${host.name}战区 · ${siteDaylight(o.elapsed,site).label} · 双方 AI 接管`:'等待地面信号';
  for(const [i,team]of ['player','enemy'].entries())v[`#colony-war-${team}`]=w?`${findCivilization(o,w.participants[i]).name} · ${AGES[w.game.ages[team]].numeral} · 基地 ${Q.format(w.game.bases[team].hp)}/${Q.format(w.game.bases[team].maxHp)} · 金币 ${Q.format(Q.floor(w.game.gold[team]))} · 经验 ${Q.format(w.game.experience[team])}`:'';
  for(const [key,t]of Object.entries(T)){
    const rank=o.talents[key],status=getOrbitalTalentState(s,key);
    v[`#orbit-node-${key}@data-state`]=status;v[`#orbit-node-${key}@aria-pressed`]=String(selected&&key===talent);v[`#orbit-node-${key}@aria-expanded`]=String(selected&&key===talent);v[`#orbit-node-${key}@aria-label`]=`${t.name}，${rank}/${t.costs.length} 级，${status==='max'?'已完成':`${t.costs[rank]} Legacy`}`;
    v[`#orbit-rank-${key}`]='●'.repeat(rank)+'○'.repeat(t.costs.length-rank);v[`#orbit-cost-${key}`]=status==='max'?'已点亮':`${Q.format(t.costs[rank])}`;
    for(const parent of Object.keys(t.requires))v[`#orbit-edge-${parent}-${key}@class:lit`]=rank>0;
  }
  const t=T[talent],rank=o.talents[talent],status=getOrbitalTalentState(s,talent);
  Object.assign(v,{'#orbit-detail@hidden':!selected,'#orbit-detail-current':orbitalTalentEffect(o,talent),'#orbit-detail-next':rank>=t.costs.length?'已完成':orbitalTalentEffect(o,talent,rank+1),'#orbit-detail-branch':T[talent].branch==='home'?'HABITAT / 地月家园':T[talent].branch==='life'?'LIFE / 文明播种':T[talent].branch==='root'?'ORIGIN / 存续协议':'SURFACE / 地表干预','#orbit-detail-name':t.name,'#orbit-detail-description':t.description,'#orbit-detail-effect':`${orbitalTalentEffect(o,talent)} → ${orbitalTalentEffect(o,talent,Math.min(t.costs.length,rank+1))}`,
    '#orbit-detail-requires':`${Object.entries(t.requires).map(([p,n])=>`${T[p].name} ${n} 级`).join(' + ')||'继承自地表篇'}${t.cycles?` · ${t.cycles} 次核毁灭（当前 ${o.nuclearCycles}）`:''}`,
    '#orbit-buy@disabled':status!=='ready','#orbit-buy':status==='max'?'已点亮':`${Q.format(t.costs[rank])} Legacy · ${status==='ready'?'点亮天赋':status==='legacy'?'遗产不足':status==='cycles'?'等待核毁灭记录':'前置未满足'}`});
  for(let i=0;i<R.historyLimit;i++){const e=o.log[o.log.length-1-i];v[`#orbit-log-${i}`]=e?`${orbitalTime(e.time)}  ${e.text}`:'';v[`#orbit-log-${i}@hidden`]=!e;}
  return v;
}
