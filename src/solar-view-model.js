import { Q } from './quantity.js';
import { lunarLegacyRate } from './celestial-economy.js';
import { getOrbitalTalentState } from './orbital-game.js';
import { ORBITAL_TALENTS as T } from './orbital-config.js';
import { DESTINATIONS, SATELLITES, destination, bodyKindLabel, systemOf, satellitesOf } from './solar-bodies.js';
import { orbitalPeriod, EARTH_YEAR_SECONDS } from './solar-config.js';
import { ARK_COUNT } from './shipyard-render.js';
import { transferState, transferQuote, windowTiming, domeCapacity, colonistRate, colonyRate, COLONY_RULES, SOLAR_TALENTS, solarRank } from './solar-colony.js';
import { AGES } from './game-config.js';
import { reachNeed, solarTalentEffect } from './solar-tree-view-model.js';
import { FACILITIES, arksMoored, arrivalAt, arrived, facilityRate, facilityState, industryRate, industryBoost, flightTo, route, pioneerAt } from './solar-industry.js';
import { bodyById } from './solar-config.js';
import { WORLDS, UPLIFT, accordState, seizeState, upliftedRate, fuseSeconds, seizeLine } from './colony-war.js';
import { TENDENCIES } from './orbital-config.js';
const temper=c=>TENDENCIES[c.tendency]?.name??'无倾向';
const placeName=id=>id==='moon'?'月球':bodyById(id).name;
export function buildSolarViewModel(s,{view='earth',selected='earth',transferCiv='',watching=null}={}){
  const o=s.orbital;if(!o?.started)return{};const vii=Boolean(o.talents.voyage),b=destination(view==='system'?selected:view)??destination(selected)??destination('earth'),owned=['earth','moon'].includes(b.id),alive=o.civilizations.filter(c=>c.alive).length;
  const root=destination(systemOf(b.id)),local=!['system','earth','moon'].includes(view),reached=DESTINATIONS.filter(d=>d.id==='earth'||arrived(o,d.id)).length;
  const facilityKey=Object.keys(FACILITIES).find(k=>FACILITIES[k].body===b.id),gate=getOrbitalTalentState(s,'voyage'),rank=o.talents.shipyard,ready=rank===ARK_COUNT;
  const v={
    '#orbital-game@data-stage':vii?'VII':'VI','#orbital-game@data-view':view,'#colony-system@hidden':!vii||view!=='system',
    '#orbital-game@data-local-world':vii&&local,'#solar-navigation@hidden':!vii,'#colony-body-card@hidden':!vii||!local,
    '#solar-overview@aria-pressed':String(view==='system'),'#solar-overview-progress':`${reached} / ${DESTINATIONS.length} 驻地`,
    '#solar-atlas-selection':`${b.name} · ${bodyStatus(o,b)}`,'#solar-atlas-open':`进入${b.name}${b.belt?'星域':'系统'} ↗`,
    '#solar-home-signal':o.phase==='winter'?`核冬天 · ${Math.ceil(o.remaining)}s`:`${alive} 个文明 / ${o.wars.length} 场战争`,
    '#solar-moon-income':`+${Q.format(lunarLegacyRate(o))} / s`,'#solar-industry-income':vii?`+${Q.format(industryRate(o))} / s`:'远航后开放',
    '#solar-fleet':!vii?`${ARK_COUNT} 艘 · 先遣编队`:arrived(o,'mars')?`火星港停泊 ${arksMoored(o)} 艘${o.solar.flights.length?` · 在途 ${o.solar.flights.length}`:''}`:`先遣编队 · ${Math.ceil(pioneerAt(o)-o.elapsed)}s 抵达火星`,
    '#colony-body-name':b.name,'#colony-body-kind':bodyKindLabel(b),'#colony-body-description':b.description,
    '#colony-body-status':b.id==='earth'?(o.phase==='winter'?'等待下一次文明萌芽':`${alive} 个文明 · 地表实况在线`):b.id==='moon'?`${Q.format(lunarLegacyRate(o))} Legacy/s · 月面生产中`:bodyStatus(o,b),
    '#solar-body-distance':b.parent?`${root.name}的卫星`:`${b.au} AU`,
    '#solar-period-label':b.parent?'绕行周期':'公转周期',
    '#solar-body-period':b.parent?`${Math.abs(b.period).toFixed(Math.abs(b.period)<2?2:1)} 天${b.period<0?' · 逆行':''}`:`${(orbitalPeriod(b.au)/EARTH_YEAR_SECONDS).toFixed(b.au<2?2:1)} 地球年`,
    '#solar-body-purpose':b.parent&&b.id!=='moon'?'卫星观测':facilityKey&&o.solar.facilities[facilityKey]?'工业驻地':{home:'观测 / 文明轮回',moon:'制造 / 深空船坞',habitable:'殖民候选地',industrial:'工业候选地',relay:'外太阳系勘察',dwarf:'柯伊伯带勘察'}[b.kind],
    '#solar-body-note':owned?'家园仍在运转。':b.parent?(SOLAR_TALENTS[b.id]?.planned?'这里将是下一个殖民世界。（后续开放）':o.solar.talents[b.id]?`驻地已建立：${solarTalentEffect(o,b.id)}。`:`在行星际星图的${root.name}一列建立驻地：由${root.name}驻地派出登陆艇，不占用方舟。`):facilityKey?'驻地生产的遗产持续回流到共同的家园。':b.id===COLONY_RULES.target?'火星不会自行萌芽。文明来自地球的转运，核冬天仅影响这颗星球。':b.kind==='habitable'?'卫星等待着未来的殖民者。驻地建设尚未开放。':'遥远的观测信号。深空驻地尚未开放。',
    '#colony-shipyard@hidden':!o.talents.outpost,'#shipyard-status':vii?'七艘方舟已启航':ready?'七艘方舟 · 整备完成':`月面船坞 · 方舟 ${rank} / ${ARK_COUNT}`,
    '#shipyard-detail':vii?'七点灯火已离开月面。家园与工场继续留在后方。':ready?'七艘方舟已经齐备。等待完整星环和核冬天中的远航窗口。':'每完成一级，月面就会多一处灯火。七艘方舟将带着文明的遗产，分赴深空。',
    '#shipyard-build':ready?'查看船坞档案 ↗':`建造第 ${rank+1} 艘 · ${Q.format(T.shipyard.costs[rank])} Legacy ↗`,
    '#shipyard-voyage':vii?'重温远航':gate==='ready'?'签署远航协议 ↗':'查看远航条件 ↗',
    '#colony-lunar-arks':vii?`七艘方舟已离港`:`月面方舟 ${rank} / ${ARK_COUNT} · 每级点亮一处灯火`,
    '#shipyard-gate-fleet':`方舟 ${rank}/${ARK_COUNT}`,'#shipyard-gate-fleet@data-ready':ready,
    '#shipyard-gate-ring':`星环 ${o.talents.recovery}/${T.voyage.ring}`,'#shipyard-gate-ring@data-ready':o.talents.recovery>=T.voyage.ring,
    '#shipyard-gate-cycles':`核毁灭 ${o.nuclearCycles}/${T.voyage.cycles}`,'#shipyard-gate-cycles@data-ready':o.nuclearCycles>=T.voyage.cycles,
    '#shipyard-gate-winter':vii?'远航窗口已使用':o.phase==='winter'?'核冬天窗口开启':'等待核冬天窗口','#shipyard-gate-winter@data-ready':vii||o.phase==='winter',
    '#shipyard-link@hidden':!o.talents.outpost||vii,'#shipyard-link':o.talents.shipyard?'月面船坞 · 查看方舟 ↗':'月面船坞 · 规划远航 ↗',
    '#solar-selected-id':`${b.parent?root.id.toUpperCase():String(DESTINATIONS.findIndex(d=>d.id===b.id)+1).padStart(2,'0')} / ${b.id.toUpperCase()}`,
  };
  for(const d of DESTINATIONS){
    v[`#solar-select-${d.id}@aria-pressed`]=String(view!=='system'&&d.id===root.id);
    v[`#solar-select-${d.id}@data-reach`]=reachState(o,d);
    v[`#solar-select-${d.id}@title`]=`${d.name} · ${bodyStatus(o,d)}${satellitesOf(d.id).length?' · 再次点击切换卫星':''}`;
    v[`#solar-nav-state-${d.id}`]={home:'家园',reached:'驻地',transit:'航行中',available:'可派遣',survey:'待抵达'}[reachState(o,d)];
  }
  for(const m of SATELLITES)v[`#solar-moon-${m.id}@aria-pressed`]=String(view===m.id);
  // Mars: the dome, the window and the transfer from Earth.
  v['#solar-colony@hidden']=!vii||view!==COLONY_RULES.target;
  if(vii&&b.id===COLONY_RULES.target){
    const sol=o.solar,world=sol.colonies.mars,residents=world.civs,flights=sol.transfers,cap=domeCapacity(o),timing=windowTiming(o),civ=o.civilizations.find(c=>c.id===transferCiv),state=transferState(s,transferCiv);
    const winter=world.phase==='winter',env=WORLDS.mars,idle=residents.filter(c=>!c.warId).length;
    v['#solar-colony-capacity']=winter?`核冬天 · ${Math.ceil(world.remaining)} 秒`:sol.talents.dome?`${residents.length+world.uplifted.length} / ${cap} 户${flights.length?` · 在途 ${flights.length}`:''}`:'尚无穹顶';
    v['#solar-wars-empty']=world.wars.length?'':winter?'核冬天中没有战争。':'暂无战争。';
    v['#solar-colony@data-winter']=String(winter);
    // What the planet is doing: its own winter, its wars, or the fuse between idle neighbours.
    v['#solar-colony-status']=winter?`火星核冬天：穹顶暂时无法居住，在途的方舟停在轨道上等待。地球不受影响。${world.nuclear>1?`（第 ${world.nuclear} 次）`:''}`
      :world.wars.length?`${world.wars.length} 场战争 · 两个第五时代文明结束战争时，火星将核毁灭${sol.talents.uplift?'，除非你接管它们的核武':''}。`
      :idle>=2?`火星资源稀缺：闲置的邻居 ${Math.ceil(fuseSeconds(o,'mars')-world.fuse)} 秒内会开战。`:residents.length?'火星收入 ×0.75，战争伤害 ×1.5。':'';
    world.wars.forEach((war,i)=>{if(i>2)return;const [a,b]=war.sides.map(id=>residents.find(c=>c.id===id));
      v[`#solar-war-${i}`]=`${a.name} ${AGES[a.age].numeral} ⚔ ${b.name} ${AGES[b.age].numeral} · 基地 ${Math.round(war.base[0]*100)}% : ${Math.round(war.base[1]*100)}% · ${watching===war.id?'观看中':'观看'}`;
      v[`#solar-war-${i}@aria-pressed`]=String(watching===war.id);
      // Seizing the arsenals: only in a final-age war, only at the brink.
      const seize=seizeState(s,'mars',war.id);v[`#solar-seize-${i}@hidden`]=['locked','age'].includes(seize);v[`#solar-seize-${i}@disabled`]=seize!=='ready';
      v[`#solar-seize-${i}`]={ready:`接管双方核武 · ${Q.format(UPLIFT.seizeCost)} Legacy`,early:`接管核武 · 等待一方基地跌破 ${Math.round(seizeLine(o)*100)}%`,seized:'核武已接管 · 胜者将升格',legacy:`${Q.format(UPLIFT.seizeCost)} Legacy · 遗产不足`}[seize]??'';});
    for(let i=0;i<3;i++){v[`#solar-war-${i}@hidden`]=!world.wars[i];if(!world.wars[i])v[`#solar-seize-${i}@hidden`]=true;}
    const shown=world.wars.find(w=>w.id===watching);v['#solar-battle-panel@hidden']=!shown;
    if(shown){const [a,b]=shown.sides.map(id=>residents.find(c=>c.id===id));v['#solar-battle-hud']=`◀ ${a.name} · ${AGES[a.age].numeral} · 基地 ${Math.round(shown.base[0]*100)}%　　${b.name} · ${AGES[b.age].numeral} · 基地 ${Math.round(shown.base[1]*100)}% ▶`;}
    v['#solar-window']=sol.talents.survey?(timing.open?`地火窗口开启 · ${Math.ceil(timing.seconds)} 秒后关闭`:`地火窗口关闭 · ${Math.ceil(timing.seconds)} 秒后开启 · 逆窗发射更慢更贵`):(timing.open?'地火窗口开启':'地火窗口关闭 · 逆窗发射更慢更贵');
    v['#solar-window@data-open']=String(timing.open);
    const quote=civ?transferQuote(o,civ):null;
    v['#solar-transfer-quote']=quote?`${civ.name} · ${AGES[civ.age].numeral} · ${Q.format(quote.cost)} Legacy · 航程 ${Math.round(quote.seconds)} 秒${quote.open?'':' · 逆窗'} · 抵达后 +${Q.format(colonistRate(civ))} Legacy/s`:'';
    v['#solar-transfer-go']={ready:'发射方舟 ↗',locked:'需要「文明转运」',winter:'地球正处于核冬天',colonyWinter:'火星正处于核冬天',selection:'选择一个地球文明',war:'该文明正在交战',capacity:sol.talents.dome?'穹顶已满 · 扩建火星穹顶':'需要「火星穹顶」',fleet:'转运方舟都在途中',legacy:'遗产不足'}[state];
    v['#solar-transfer-go@disabled']=state!=='ready';
    // Each resident carries its own path past the filter: an accord if it is peaceful.
    const rows=[...residents.map(c=>({civ:c,text:`${c.name} · ${AGES[c.age].numeral} · ${temper(c)} · +${Q.format(colonistRate(c))} Legacy/s${c.warId?' · 交战中':''}`,transit:false})),
      ...flights.map(t=>({text:`${t.civ.name} · 航行中 · ${Math.max(0,Math.ceil(t.arriveAt-o.elapsed))} 秒`,transit:true}))];
    for(let i=0;i<10;i++){const row=rows[i],accord=row?.civ?accordState(s,'mars',row.civ.id):'locked';
      v[`#solar-colonist-${i}@hidden`]=!row;v[`#solar-colonist-text-${i}`]=row?.text??'';v[`#solar-colonist-${i}@data-transit`]=String(Boolean(row?.transit));
      v[`#solar-colonist-${i}@data-accord`]=String(row?.civ?.accord!=null);
      v[`#solar-colonist-act-${i}@hidden`]=['locked','selection','warlike'].includes(accord);v[`#solar-colonist-act-${i}@disabled`]=accord!=='ready';
      v[`#solar-colonist-act-${i}`]={ready:`签署存续协议 · ${Q.format(UPLIFT.accordCost)}`,negotiating:`谈判中 ${Math.floor((row?.civ?.accord??0)*100)}%`,age:'第五时代后可谈判',war:'交战中 · 无法谈判',legacy:`${Q.format(UPLIFT.accordCost)} · 遗产不足`}[accord]??'';}
    const uplifted=world.uplifted;v['#solar-uplifted@hidden']=!uplifted.length;
    v['#solar-uplifted-title']=`升格文明 · ${uplifted.length} · +${Q.format(uplifted.length*upliftedRate('mars'))} Legacy/s`;
    for(let i=0;i<10;i++){const c=uplifted[i];v[`#solar-uplifted-${i}@hidden`]=!c;v[`#solar-uplifted-${i}`]=c?`★ ${c.name} · ${c.via==='accord'?'签署存续协议':'核武被接管后停战'} · +${Q.format(upliftedRate('mars'))} Legacy/s`:'';}
    v['#solar-dome-caption']=sol.talents.dome?`${sol.talents.dome} / ${SOLAR_TALENTS.dome.costs.length} 座穹顶 · 每座两户 · ${residents.length+uplifted.length+flights.length} / ${cap} 已占用${uplifted.length?` · 其中 ${uplifted.length} 户已升格`:''}`:'火星尚无穹顶：在行星际星图中建起第一座。';
  }
  // The foothold on the selected body, if it has one.
  const f=facilityKey&&FACILITIES[facilityKey],state=f?facilityState(s,facilityKey):'locked',level=f?o.solar.facilities[facilityKey]:0;
  v['#solar-facility@hidden']=!f||!vii||!local;
  if(f){
    v['#solar-facility-name']=f.name;v['#solar-facility-level']=`${level} / ${f.costs.length}`;v['#solar-facility-description']=f.description;
    for(let i=1;i<=5;i++){v[`#solar-facility-rank-${i}@hidden`]=i>f.costs.length;v[`#solar-facility-rank-${i}@class:built`]=i<=level;}
    const next=level<f.costs.length?level+1:level,rate=r=>r?f.base*2**(r-1)*industryBoost(o):0;
    v['#solar-facility-effect']=f.kind==='boost'?`行星工业产能 ×${2**level}${level<f.costs.length?` → ×${2**next}`:''}`:`${Q.format(facilityRate(o,facilityKey))} Legacy/s${level<f.costs.length?` → ${Q.format(rate(next))} Legacy/s`:''}`;
    const cost=level<f.costs.length?Q.format(f.costs[level]):'',wait=Math.max(0,Math.ceil((arrivalAt(o,f.body)??0)-o.elapsed)),leg=route(o,f.body);
    // The first rank sends an ark: say where from and for how long.
    const dispatch=leg.blocked?'':`${[leg.from,...leg.via].map(placeName).join(' → ')}出发 · 航程 ${leg.seconds} 秒`;
    v['#solar-facility-build']={ready:level?`扩建 · ${cost} Legacy`:`派遣方舟 · ${cost} Legacy · ${dispatch}`,legacy:`${cost} Legacy · 遗产不足${level?'':` · ${dispatch}`}`,transit:`方舟航行中 · ${wait} 秒后抵达`,
      prerequisite:facilityNeed(o,facilityKey),max:'已全部建成',locked:'远航后开放'}[state];
    v['#solar-facility-build@disabled']=state!=='ready';
  }
  return v;
}
// What the dossier says about a body other than home: where its ark is, and
// what stands there.
export function bodyStatus(o,b){
  if(b.id==='earth')return o.phase==='winter'?'母星核冬天':`${o.civilizations.filter(c=>c.alive).length} 个文明 · 母星在线`;
  if(b.id==='moon')return '月面生产与深空船坞运行中';
  if(b.parent)return '卫星观测 · 尚无驻地';
  if(!o.talents.voyage)return '勘察记录 · 尚无驻地';
  const key=Object.keys(FACILITIES).find(k=>FACILITIES[k].body===b.id),at=arrivalAt(o,b.id);
  if(b.id===COLONY_RULES.target){
    if(!arrived(o,b.id))return `先遣编队航行中 · 还有 ${Math.ceil(at-o.elapsed)} 秒抵达`;
    const port=o.solar.talents.harbor?'火星港 · ':'',world=o.solar.colonies.mars;
    if(world.phase==='winter')return `${port}火星核冬天 · 还有 ${Math.ceil(world.remaining)} 秒`;
    return o.solar.talents.dome?`${port}火星穹顶 · ${world.civs.length+world.uplifted.length} / ${domeCapacity(o)} 居民${world.uplifted.length?` · ${world.uplifted.length} 个升格文明`:''}${world.wars.length?` · ${world.wars.length} 场战争`:''} · +${Q.format(colonyRate(o))} Legacy/s`:`${port||'先遣编队已停泊 · '}可以建起火星穹顶`;
  }
  if(!key)return '勘察记录 · 尚无驻地';
  if(flightTo(o,b.id))return `方舟航行中 · 还有 ${Math.ceil(at-o.elapsed)} 秒抵达`;
  if(o.solar.facilities[key])return `驻地运转中 · +${Q.format(facilityRate(o,key))} Legacy/s${FACILITIES[key].kind==='boost'?` · 行星工业 ×${industryBoost(o)}`:''}`;
  return route(o,b.id).blocked?'勘察记录 · 方舟尚无法抵达':'航线已通 · 可以派遣方舟';
}
export function reachState(o,b){
  if(b.id==='earth'||b.id==='moon')return 'home';
  if(arrived(o,b.id))return 'reached';
  if(b.id==='mars'&&o.talents.voyage||flightTo(o,b.id))return 'transit';
  const key=Object.keys(FACILITIES).find(k=>FACILITIES[k].body===b.id);
  return key&&!route(o,b.id).blocked?'available':'survey';
}
// Why a foothold cannot be started yet: the tree's own prerequisites first,
// then the route (hull or drive), then another foothold it depends on.
export function facilityNeed(o,key){
  const need=reachNeed(o,FACILITIES[key].body);
  if(need==='需火星港')return '需要「火星港」：方舟停泊在火星';
  if(need==='无停泊方舟')return '火星港没有停泊的方舟 · 在小行星带铸造新方舟';
  const tech=need.match(/^需(.+)$/);
  return tech?`需要中轴科技「${tech[1]}」`:'暂时无法派遣';
}
