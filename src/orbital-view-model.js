import { Q } from './quantity.js';
import { AGES } from './game-config.js';
import { SITES, ORBITAL_TALENTS as T, ORBITAL_ACTIONS as A, ORBITAL_RULES as R } from './orbital-config.js';
import { findCivilization, getWarState, getInterventionState, interventionCost, getOrbitalTalentState } from './orbital-game.js';
import { civilizationValue, orbitalYieldMultiplier } from './celestial-economy.js';
export const orbitalTime = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
export function orbitalTalentEffect(o,key,rank=o.talents[key]){
  if(key==='recovery')return `遗产 ×${2**rank}`;
  if(key==='reseed')return `核冬天 ${Math.round(R.winterSeconds*.75**rank)} 秒`;
  if(key==='diversity')return `至少 ${Math.min(6,R.minCivilizations+rank)} 个文明`;
  if(key==='outpost')return rank?'月面家园 · 遗产再 ×2':'仅地球轨道';
  return rank?'已解锁':'未解锁';
}
export function buildOrbitalViewModel(s,{paused=false,talent='monitor'}={}){
  const o=s.orbital,active=s.run.phase==='orbital'&&o?.started;
  const v={'body@data-orbital-active':String(Boolean(active)),'#orbital-game@hidden':!active};if(!active)return v;
  const alive=o.civilizations.filter(c=>c.alive),first=findCivilization(o,o.selectedCivilization),second=findCivilization(o,o.selectedOpponent),winter=o.phase==='winter';
  Object.assign(v,{
    '#colony-legacy':Q.format(s.permanent.legacy),'#orbit-tree-wallet':`${Q.format(s.permanent.legacy)} Legacy`,
    '#colony-earned':`本阶段已收获 ${Q.format(o.legacyEarned)} · 收益 ×${orbitalYieldMultiplier(o)}`,
    '#colony-time':orbitalTime(o.elapsed),'#colony-cycle':`第 ${o.cycle} 轮萌芽 · ${o.nuclearCycles} 次核毁灭`,
    '#colony-pause':paused?'继续':'暂停','#colony-pause@aria-pressed':String(paused),
    '#colony-speed':`${s.permanent.settings.speed}×`,'#colony-speed@hidden':s.debug===true,'#colony-debug-speed@hidden':s.debug!==true,'#colony-debug-speed@value':String(s.debugSpeed??1),
    '#colony-objective':winter?'他们再次走到了终点。':'让地表的战火，照亮轨道。',
    '#colony-objective-detail':winter?`全球文明已被核武毁灭。${Math.ceil(o.remaining)} 秒后，新的火种将在不同点位萌芽。`:'选择两个空闲文明，挑起战争。双方通过招募、杀敌与阵亡获得经验并进化。',
    '#colony-fallout@hidden':!winter,'#colony-fallout':`+${Q.format(o.lastReward)} Legacy 已入账 · 核冬天 ${Math.ceil(o.remaining)} 秒`,
    '#colony-complete@hidden':o.completionAt===null,'#colony-complete':`地月航线已贯通 · VI 完成 · VII 将在后续开放`,
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
    for(const which of ['first','opponent']){v[`#${which}-${site.id}`]=label;v[`#${which}-${site.id}@disabled`]=!c?.alive;}
  }
  for(const [key,a]of Object.entries(A)){
    const status=getInterventionState(s,first?.id,key),cost=first?interventionCost(o,first,key):a.baseCost;
    v[`#intervene-${key}@disabled`]=status!=='ready';v[`#intervene-${key}-cost`]=key==='harvest'&&first?.alive?`+${Q.format(civilizationValue(o,first))} Legacy`:`${Q.format(cost)} Legacy`;
    v[`#intervene-${key}-state`]={locked:`需要「${T[a.talent].name}」`,dead:'文明已消亡',max:'已达界限',legacy:'遗产不足',ready:'执行'}[status];
  }
  for(let i=0;i<3;i++){const w=o.wars[i];v[`#watch-war-${i}@hidden`]=!w;v[`#watch-war-${i}`]=w?w.participants.map(id=>findCivilization(o,id).name).join(' ↔ '):'';v[`#watch-war-${i}@aria-pressed`]=String(w?.id===o.selectedWar);}
  const w=o.wars.find(w=>w.id===o.selectedWar);v['#colony-battle@hidden']=!w;v['#colony-no-war@hidden']=Boolean(w);
  for(const [i,team]of ['player','enemy'].entries())v[`#colony-war-${team}`]=w?`${findCivilization(o,w.participants[i]).name} · ${AGES[w.game.ages[team]].numeral} · 基地 ${Q.format(w.game.bases[team].hp)}/${Q.format(w.game.bases[team].maxHp)} · 金币 ${Q.format(Q.floor(w.game.gold[team]))} · 经验 ${Q.format(w.game.experience[team])}`:'';
  for(const [key,t]of Object.entries(T)){
    const rank=o.talents[key],status=getOrbitalTalentState(s,key);
    v[`#orbit-node-${key}@data-state`]=status;v[`#orbit-node-${key}@aria-label`]=`${t.name}，${rank}/${t.costs.length} 级，${status==='max'?'已完成':`${t.costs[rank]} Legacy`}`;
    v[`#orbit-rank-${key}`]='●'.repeat(rank)+'○'.repeat(t.costs.length-rank);v[`#orbit-cost-${key}`]=status==='max'?'已点亮':`${Q.format(t.costs[rank])} Legacy`;
    for(const parent of Object.keys(t.requires))v[`#orbit-edge-${parent}-${key}@class:lit`]=rank>0;
  }
  const t=T[talent],rank=o.talents[talent],status=getOrbitalTalentState(s,talent);
  Object.assign(v,{'#orbit-detail-name':t.name,'#orbit-detail-description':t.description,'#orbit-detail-effect':`${orbitalTalentEffect(o,talent)} → ${orbitalTalentEffect(o,talent,Math.min(t.costs.length,rank+1))}`,
    '#orbit-detail-requires':`${Object.entries(t.requires).map(([p,n])=>`${T[p].name} ${n} 级`).join(' + ')||'继承自地表篇'}${t.cycles?` · ${t.cycles} 次核毁灭（当前 ${o.nuclearCycles}）`:''}`,
    '#orbit-buy@disabled':status!=='ready','#orbit-buy':status==='max'?'已点亮':`${Q.format(t.costs[rank])} Legacy · ${status==='ready'?'点亮天赋':status==='legacy'?'遗产不足':status==='cycles'?'等待核毁灭记录':'前置未满足'}`});
  for(let i=0;i<R.historyLimit;i++){const e=o.log[o.log.length-1-i];v[`#orbit-log-${i}`]=e?`${orbitalTime(e.time)}  ${e.text}`:'';v[`#orbit-log-${i}@hidden`]=!e;}
  return v;
}
