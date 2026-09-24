import { Q } from './quantity.js';
import { lunarLegacyRate } from './celestial-economy.js';
import { getOrbitalTalentState } from './orbital-game.js';
import { ORBITAL_TALENTS as T } from './orbital-config.js';
import { DESTINATIONS, destination, bodyKindLabel } from './solar-render.js';
import { orbitalPeriod, EARTH_YEAR_SECONDS } from './solar-config.js';
import { ARK_COUNT } from './shipyard-render.js';
import { transferState, transferQuote, windowTiming, domeCapacity, colonistRate, colonyRate, COLONY_RULES } from './solar-colony.js';
import { AGES } from './game-config.js';
import { FACILITIES, ARK_ROUTES, arrivalAt, arrived, facilityRate, facilityState, industryRate, industryBoost } from './solar-industry.js';
export function buildSolarViewModel(s,{view='earth',selected='earth',transferCiv=''}={}){
  const o=s.orbital;if(!o?.started)return{};const vii=Boolean(o.talents.voyage),b=destination(selected)??destination('earth'),owned=['earth','moon'].includes(b.id),alive=o.civilizations.filter(c=>c.alive).length;
  const facilityKey=Object.keys(FACILITIES).find(k=>FACILITIES[k].body===b.id),gate=getOrbitalTalentState(s,'voyage'),rank=o.talents.shipyard,ready=rank===ARK_COUNT;
  const v={
    '#orbital-game@data-stage':vii?'VII':'VI','#orbital-game@data-view':view,'#colony-system@hidden':!vii||view!=='system',
    '#solar-home-signal':o.phase==='winter'?`核冬天 · ${Math.ceil(o.remaining)}s`:`${alive} 个文明 / ${o.wars.length} 场战争`,
    '#solar-moon-income':`+${Q.format(lunarLegacyRate(o))} / s`,'#solar-industry-income':vii?`+${Q.format(industryRate(o))} / s`:'远航后开放',
    '#solar-fleet':vii?`${ARK_ROUTES.filter(r=>arrived(o,r.body)).length} / ${ARK_COUNT} 艘已抵达`:`${ARK_COUNT} 艘 · 先遣编队`,
    '#colony-body-name':b.name,'#colony-body-kind':bodyKindLabel(b),'#colony-body-description':b.description,
    '#colony-body-status':b.id==='earth'?(o.phase==='winter'?'等待下一次文明萌芽':`${alive} 个文明 · 地表实况在线`):b.id==='moon'?`${Q.format(lunarLegacyRate(o))} Legacy/s · 月面生产中`:bodyStatus(o,b),
    '#solar-body-distance':b.id==='moon'?'地球卫星':`${b.au} AU`,
    '#solar-body-period':b.id==='moon'?'地月运输网':`${(orbitalPeriod(b.au)/EARTH_YEAR_SECONDS).toFixed(b.au<2?2:1)} 地球年`,
    '#solar-body-purpose':facilityKey&&o.solar.facilities[facilityKey]?'工业驻地':{home:'观测 / 文明轮回',moon:'制造 / 深空船坞',habitable:'殖民候选地',industrial:'工业候选地',relay:'外太阳系勘察'}[b.kind],
    '#colony-body-enter@hidden':!owned,'#colony-body-enter':b.id==='moon'?'进入月面家园 ↗':'接入地球观测 ↗',
    '#solar-body-note':owned?'家园仍在运转。':facilityKey?'驻地建成后产出计入 Legacy，暂停与离线时不推进。':b.id===COLONY_RULES.target?'殖民地之间的战争、独立的核冬天与升格将在后续开放。':b.kind==='habitable'?'殖民将在后续开放：先要把地球的文明运过来。':'深空中继将在后续开放，它通往 VIII。',
    '#colony-shipyard@hidden':!o.talents.outpost,'#shipyard-status':vii?'七艘方舟已启航':ready?'七艘方舟 · 整备完成':`月面船坞 · 方舟 ${rank} / ${ARK_COUNT}`,
    '#shipyard-detail':vii?'七点灯火已离开月面。家园与工场继续留在后方。':ready?'七艘方舟已经齐备。等待完整星环和核冬天中的远航窗口。':'每完成一级，月面就会多一处灯火。七艘方舟将带着文明的遗产，分赴深空。',
    '#shipyard-build':ready?'查看船坞档案 ↗':`建造第 ${rank+1} 艘 · ${Q.format(T.shipyard.costs[rank])} Legacy ↗`,
    '#shipyard-voyage':vii?'重温远航':gate==='ready'?'签署远航协议 ↗':'查看远航条件 ↗',
    '#colony-lunar-arks':vii?`七艘方舟已离港`:`月面方舟 ${rank} / ${ARK_COUNT} · 每级点亮一处灯火`,
    '#shipyard-gate-fleet':`方舟 ${rank}/${ARK_COUNT}`,'#shipyard-gate-fleet@data-ready':ready,
    '#shipyard-gate-ring':`星环 ${o.talents.recovery}/${T.voyage.ring}`,'#shipyard-gate-ring@data-ready':o.talents.recovery>=T.voyage.ring,
    '#shipyard-gate-cycles':`核毁灭 ${o.nuclearCycles}/${T.voyage.cycles}`,'#shipyard-gate-cycles@data-ready':o.nuclearCycles>=T.voyage.cycles,
    '#shipyard-gate-winter':vii?'远航窗口已使用':o.phase==='winter'?'核冬天窗口开启':'等待核冬天窗口','#shipyard-gate-winter@data-ready':vii||o.phase==='winter',
    '#shipyard-link@hidden':!o.talents.outpost,'#shipyard-link':o.talents.shipyard?'月面船坞 · 查看方舟 ↗':'月面船坞 · 规划远航 ↗',
    '#solar-selected-id':`${String(DESTINATIONS.findIndex(d=>d.id===b.id)+1).padStart(2,'0')} / ${b.id.toUpperCase()}`,
  };
  for(const d of DESTINATIONS)v[`#solar-select-${d.id}@aria-pressed`]=String(d.id===b.id);
  // Mars: the dome, the window and the transfer from Earth.
  v['#solar-colony@hidden']=!vii||b.id!==COLONY_RULES.target;
  if(vii&&b.id===COLONY_RULES.target){
    const sol=o.solar,residents=sol.colonies.mars,flights=sol.transfers,cap=domeCapacity(o),timing=windowTiming(o),civ=o.civilizations.find(c=>c.id===transferCiv),state=transferState(s,transferCiv);
    v['#solar-colony-capacity']=sol.talents.dome?`${residents.length} / ${cap} 居民${flights.length?` · 在途 ${flights.length}`:''}`:'尚无穹顶';
    v['#solar-window']=sol.talents.survey?(timing.open?`地火窗口开启 · ${Math.ceil(timing.seconds)} 秒后关闭`:`地火窗口关闭 · ${Math.ceil(timing.seconds)} 秒后开启 · 逆窗发射更慢更贵`):(timing.open?'地火窗口开启':'地火窗口关闭 · 逆窗发射更慢更贵');
    v['#solar-window@data-open']=String(timing.open);
    const quote=civ?transferQuote(o,civ):null;
    v['#solar-transfer-quote']=quote?`${civ.name} · ${AGES[civ.age].numeral} · ${Q.format(quote.cost)} Legacy · 航程 ${Math.round(quote.seconds)} 秒${quote.open?'':' · 逆窗'} · 抵达后 +${Q.format(colonistRate(civ))} Legacy/s`:'';
    v['#solar-transfer-go']={ready:'发射方舟 ↗',locked:'需要「文明转运」',winter:'地球正处于核冬天',selection:'选择一个地球文明',war:'该文明正在交战',capacity:sol.talents.dome?'穹顶已满 · 扩建火星穹顶':'需要「火星穹顶」',fleet:'转运方舟都在途中',legacy:'遗产不足'}[state];
    v['#solar-transfer-go@disabled']=state!=='ready';
    const rows=[...residents.map(c=>({text:`${c.name} · ${AGES[c.age].numeral} · +${Q.format(colonistRate(c))} Legacy/s`,transit:false})),
      ...flights.map(t=>({text:`${t.civ.name} · 航行中 · ${Math.max(0,Math.ceil(t.arriveAt-o.elapsed))} 秒`,transit:true}))];
    for(let i=0;i<8;i++){v[`#solar-colonist-${i}@hidden`]=!rows[i];v[`#solar-colonist-${i}`]=rows[i]?.text??'';v[`#solar-colonist-${i}@data-transit`]=String(Boolean(rows[i]?.transit));}
  }
  // The foothold on the selected body, if it has one.
  const f=facilityKey&&FACILITIES[facilityKey],state=f?facilityState(s,facilityKey):'locked',level=f?o.solar.facilities[facilityKey]:0;
  v['#solar-facility@hidden']=!f||!vii;
  if(f){
    v['#solar-facility-name']=f.name;v['#solar-facility-level']=`${level} / ${f.costs.length}`;v['#solar-facility-description']=f.description;
    for(let i=1;i<=5;i++){v[`#solar-facility-rank-${i}@hidden`]=i>f.costs.length;v[`#solar-facility-rank-${i}@class:built`]=i<=level;}
    const next=level<f.costs.length?level+1:level,rate=r=>r?f.base*2**(r-1)*industryBoost(o):0;
    v['#solar-facility-effect']=f.kind==='boost'?`行星工业产能 ×${2**level}${level<f.costs.length?` → ×${2**next}`:''}`:`${Q.format(facilityRate(o,facilityKey))} Legacy/s${level<f.costs.length?` → ${Q.format(rate(next))} Legacy/s`:''}`;
    const cost=level<f.costs.length?Q.format(f.costs[level]):'',wait=Math.max(0,Math.ceil((arrivalAt(o,f.body)??0)-o.elapsed));
    v['#solar-facility-build']={ready:`${level?'扩建':'建立驻地'} · ${cost} Legacy`,legacy:`${cost} Legacy · 遗产不足`,transit:`${f.via?'火星方舟':'方舟'}航行中 · ${wait} 秒后抵达`,
      prerequisite:`需要先建立${Object.keys(f.requires??{}).map(k=>FACILITIES[k].name).join('、')}`,max:'已全部建成',locked:'远航后开放'}[state];
    v['#solar-facility-build@disabled']=state!=='ready';
  }
  return v;
}
// What the dossier says about a body other than home: where its ark is, and
// what stands there.
function bodyStatus(o,b){
  if(!o.talents.voyage)return '勘察记录 · 尚无驻地';
  const key=Object.keys(FACILITIES).find(k=>FACILITIES[k].body===b.id),via=key?FACILITIES[key].via:null,at=arrivalAt(o,key?b.id:b.id);
  if(at===null||(!key&&!ARK_ROUTES.some(r=>r.body===b.id)))return '勘察记录 · 尚无驻地';
  if(!arrived(o,b.id))return `${via?'火星方舟':'方舟'}航行中 · 还有 ${Math.ceil(at-o.elapsed)} 秒抵达`;
  if(key&&o.solar.facilities[key])return `驻地运转中 · +${Q.format(facilityRate(o,key))} Legacy/s${FACILITIES[key].kind==='boost'?` · 行星工业 ×${industryBoost(o)}`:''}`;
  if(b.id===COLONY_RULES.target&&o.solar.talents.dome)return `火星穹顶 · ${o.solar.colonies.mars.length} / ${domeCapacity(o)} 居民 · +${Q.format(colonyRate(o))} Legacy/s`;
  return key?'方舟已抵达 · 可以建立驻地':b.id===COLONY_RULES.target?'方舟已抵达 · 可以建起火星穹顶':'方舟已抵达 · 等待后续开发';
}
