// VII star map: states, prices and detail text, derived from the saved state.
import { Q } from './quantity.js';
import { SOLAR_TALENTS as T, solarTalentState, solarRank, solarCosts, COLONY_RULES, householdsPerDome } from './solar-colony.js';
import { FACILITIES, DRIVES, DOCKS, arrivalAt, facilityMultiplier, flightTo, route, arksMoored, arkTotal } from './solar-industry.js';
import { bodyById } from './solar-config.js';

const BRANCH = { root: 'ORIGIN / 远航协议', mercury: 'MERCURY / 水星', venus: 'VENUS / 金星', mars: 'MARS / 火星', belt: 'MAIN BELT / 小行星带', jupiter: 'JUPITER / 木星', saturn: 'SATURN / 土星', uranus: 'URANUS / 天王星', neptune: 'NEPTUNE / 海王星' };
const placeName = id => id === 'moon' ? '月球' : bodyById(id).name;
// Why a world cannot be reached yet, in the words of the node's gate.
export function reachNeed(o, body) {
  const leg = route(o, body);
  if (!leg.blocked) return '';
  if (leg.blocked === 'harbor') return '需火星港';
  if (leg.blocked === 'fleet') return '无停泊方舟';
  const drive = DRIVES.find(d => d.range >= leg.distance);
  if (drive && drive.talent && !o.solar.talents[drive.talent]) return `需${drive.name}`;
  const dock = Object.entries(DOCKS).find(([id, key]) => id !== body && !o.solar.talents[key]);
  return dock ? `需${T[dock[1]].name}中转` : '航程不足';
}
// data-state reuses the VI tree's styling: transit dims like a cycle gate.
const STYLE_STATE = { transit: 'cycles' };
export function solarTalentEffect(o, key, rank = solarRank(o, key)) {
  const t = T[key];
  if (t.root) return '七艘方舟已启航';
  if (t.planned) return '规划中';
  if (t.facility) { const f = FACILITIES[t.facility];
    if (!rank && flightTo(o, f.body)) return '方舟航行中';
    return f.kind === 'boost' ? `行星工业 ×${2 ** rank}` : rank ? `${Q.format(f.base * 2 ** (rank - 1) * facilityMultiplier(o, t.facility))} Legacy/s` : '尚未建成'; }
  if (t.satellite) return rank ? { phobos: '转运价格 ×0.75', deimos: '转运航程 ×0.8', io: '木星采集站 ×2', europa: '升格文明 ×1.5', ganymede: '多一艘方舟', callisto: '航程 ×0.8', enceladus: '冰环采集站 ×2', titania: '冰巨星采集站 ×2', oberon: '行星工业 ×1.25', triton: '深空前哨 ×2' }[key] ?? '已建立' : '尚未登陆';
  if (key === 'harbor') return rank ? `停泊 ${arksMoored(o)} / ${arkTotal(o)} 艘方舟` : '方舟停泊在火星，尚不能派出';
  if (key === 'solarSail') return rank ? '航程 ×0.7' : '航程 ×1';
  if (key === 'smelter') return rank ? '行星工业 ×1.5' : '行星工业 ×1';
  if (key === 'refinery') return rank ? '浮空城 ×2' : '浮空城 ×1';
  if (key === 'greenhouse') return rank ? '火星产出 ×1' : '火星产出 ×0.75';
  if (key === 'arkForge') return `方舟共 ${7 + rank} 艘`;
  if (key === 'iceWater') return `每座穹顶 ${COLONY_RULES.domeCapacity + rank} 户`;
  if (key === 'jupiterDock' || key === 'uranusDock') return rank ? '可在此中转' : '尚无船坞';
  if (['nuclear', 'fusion', 'deepDrive'].includes(key)) { const d = DRIVES.find(x => x.talent === key), prev = DRIVES[DRIVES.indexOf(d) - 1]; return `单段航程 ${(rank ? d : prev).range} AU`; }
  if (key === 'dome') return rank ? `可容纳 ${rank * householdsPerDome(o)} 户` : '火星尚无穹顶';
  if (key === 'uplift') return rank ? '可以谈判存续协议、接管核武' : '殖民文明终将核毁灭';
  if (key === 'transfer') return rank ? '可以从地球转运文明' : '文明只能留在地球';
  if (key === 'survey') return rank ? '档案显示窗口对齐与倒计时' : '窗口只能靠经验判断';
  if (key === 'hohmann') { const deg = Math.round((COLONY_RULES.window + (rank ? COLONY_RULES.hohmannWindow : 0)) * 180 / Math.PI); return `窗口宽度 ±${deg}°`; }
  if (key === 'fleet') return `同时在途 ${1 + rank} 艘`;
  if (key === 'fuel') return rank ? `逆窗航程 ×${COLONY_RULES.fuelLateTravel} · 价格 ×${COLONY_RULES.fuelLateCost}` : `逆窗航程 ×${COLONY_RULES.lateTravel} · 价格 ×${COLONY_RULES.lateCost}`;
  return rank ? '已点亮' : '未点亮';
}
function gate(o, key) {
  const t = T[key], body = t.facility ? FACILITIES[t.facility].body : t.arrival;
  const parts = [];
  if (body && o.talents.voyage) { const at = arrivalAt(o, body); if (at !== null && at > o.elapsed) parts.push(`${t.arrival ? '编队' : '方舟'} ${Math.ceil(at - o.elapsed)}s`); }
  if (t.facility && !solarRank(o, key) && !flightTo(o, body)) { const need = reachNeed(o, body); if (need) parts.push(need); }
  if (t.gate && t.planned) parts.push(t.gate.replace('需要', '需'));
  return parts.join(' · ');
}
// The leg an unbuilt foothold would fly: which drydock, and for how long.
function legText(o, key) {
  const t = T[key]; if (!t.facility || !o.talents.voyage || solarRank(o, key) || flightTo(o, FACILITIES[t.facility].body)) return '';
  const leg = route(o, FACILITIES[t.facility].body);
  return leg.blocked ? '' : `航线：${[leg.from, ...leg.via, FACILITIES[t.facility].body].map(placeName).join(' → ')} · ${leg.seconds} 秒`;
}
export function buildSolarTreeViewModel(s, { talent = 'dome', selected = false } = {}) {
  const o = s.orbital, v = {};
  // The VII page only exists after 远航协议; VI syncs it every frame, so stay empty.
  if (!o?.started || !o.talents.voyage) return v;
  v['#solar-tree-wallet'] = Q.format(s.permanent.legacy);
  for (const [key, t] of Object.entries(T)) {
    const costs = solarCosts(key), rank = solarRank(o, key), state = solarTalentState(s, key), max = costs.length;
    v[`#solar-node-${key}@data-state`] = STYLE_STATE[state] ?? state; v[`#solar-node-${key}@data-owned`] = String(rank > 0);
    v[`#solar-node-${key}@aria-pressed`] = String(selected && key === talent);
    v[`#solar-rank-${key}`] = t.root ? '●' : t.planned ? '' : '●'.repeat(rank) + '○'.repeat(Math.max(0, max - rank));
    v[`#solar-cost-${key}`] = t.root || t.planned || state === 'max' || (t.facility && state === 'transit') ? '' : Q.format(costs[rank]);
    v[`#solar-gate-${key}`] = state === 'max' ? '' : gate(o, key);
    v[`#solar-node-${key}@aria-label`] = `${t.name}，${t.planned ? '规划中' : state === 'max' || rank >= max ? '已完成' : `${Q.format(costs[rank])} Legacy`}`;
    for (const parent of Object.keys(t.requires)) v[`#solar-edge-${parent}-${key}@class:lit`] = rank > 0;
  }
  const t = T[talent], rank = solarRank(o, talent), state = solarTalentState(s, talent), costs = solarCosts(talent);
  const requires = [...Object.entries(t.requires).map(([p, n]) => `${T[p].name}${n > 1 ? ` ${n} 级` : ''}`),
    ...(t.arrival ? ['先遣编队抵达火星'] : []), ...(t.gate ? [t.gate.replace('需要', '')] : []),
    ...(t.facility && !rank && !flightTo(o, FACILITIES[t.facility].body) && reachNeed(o, FACILITIES[t.facility].body) ? [reachNeed(o, FACILITIES[t.facility].body).replace(/^需/, '')] : [])];
  Object.assign(v, {
    '#solar-detail@hidden': !selected, '#solar-detail-branch': BRANCH[t.column], '#solar-detail-name': t.name,
    '#solar-detail-description': t.description ?? (t.facility ? FACILITIES[t.facility].description : ''),
    '#solar-detail-current': solarTalentEffect(o, talent), '#solar-detail-next': t.root || t.planned || rank >= costs.length ? '—' : solarTalentEffect(o, talent, rank + 1),
    '#solar-detail-requires': [requires.length ? `需要：${requires.join(' + ')}` : '', legText(o, talent)].filter(Boolean).join(' · '),
    '#solar-buy@disabled': state !== 'ready',
    '#solar-buy': t.root ? '已启航' : t.planned ? '规划中 · 尚未开放' : state === 'max' ? '已点亮' :
      `${Q.format(costs[rank])} Legacy · ${{ ready: t.facility ? (rank ? '扩建' : '派遣方舟') : '点亮天赋', legacy: '遗产不足', transit: t.facility ? '方舟航行中' : '等待编队抵达', prerequisite: '前置未满足', locked: '远航后开放' }[state] ?? ''}`,
  });
  return v;
}
