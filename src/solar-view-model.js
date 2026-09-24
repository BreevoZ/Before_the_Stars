import { Q } from './quantity.js';
import { lunarLegacyRate } from './celestial-economy.js';
import { getOrbitalTalentState } from './orbital-game.js';
import { ORBITAL_TALENTS as T } from './orbital-config.js';
import { DESTINATIONS, destination, bodyKindLabel } from './solar-render.js';
import { orbitalPeriod, EARTH_YEAR_SECONDS } from './solar-config.js';
import { ARK_COUNT } from './shipyard-render.js';
export function buildSolarViewModel(s,{view='earth',selected='earth'}={}){
  const o=s.orbital;if(!o?.started)return{};const vii=Boolean(o.talents.voyage),b=destination(selected)??destination('earth'),owned=['earth','moon'].includes(b.id),alive=o.civilizations.filter(c=>c.alive).length;
  const gate=getOrbitalTalentState(s,'voyage'),rank=o.talents.shipyard,ready=rank===ARK_COUNT;
  const v={
    '#orbital-game@data-stage':vii?'VII':'VI','#orbital-game@data-view':view,'#colony-system@hidden':!vii||view!=='system',
    '#solar-home-signal':o.phase==='winter'?`核冬天 · ${Math.ceil(o.remaining)}s`:`${alive} 个文明 / ${o.wars.length} 场战争`,
    '#solar-moon-income':`+${Q.format(lunarLegacyRate(o))} / s`,'#solar-fleet':`${ARK_COUNT} 艘 · 先遣编队`,
    '#colony-body-name':b.name,'#colony-body-kind':bodyKindLabel(b),'#colony-body-description':b.description,
    '#colony-body-status':b.id==='earth'?(o.phase==='winter'?'等待下一次文明萌芽':`${alive} 个文明 · 地表实况在线`):b.id==='moon'?`${Q.format(lunarLegacyRate(o))} Legacy/s · 月面生产中`:'勘察记录 · 尚无驻地',
    '#solar-body-distance':b.id==='moon'?'地球卫星':`${b.au} AU`,
    '#solar-body-period':b.id==='moon'?'地月运输网':`${(orbitalPeriod(b.au)/EARTH_YEAR_SECONDS).toFixed(b.au<2?2:1)} 地球年`,
    '#solar-body-purpose':{home:'观测 / 文明轮回',moon:'制造 / 深空船坞',habitable:'殖民候选地',industrial:'工业候选地',relay:'外太阳系勘察'}[b.kind],
    '#colony-body-enter@hidden':!owned,'#colony-body-enter':b.id==='moon'?'进入月面家园 ↗':'接入地球观测 ↗',
    '#solar-body-note':owned?'家园仍在运转。': '该天体目前可观测，驻地建设尚未开放。',
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
  return v;
}
