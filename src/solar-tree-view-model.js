// VII star map: states, prices and detail text, derived from the saved state.
import { Q } from './quantity.js';
import { SOLAR_TALENTS as T, solarTalentState, solarRank, solarCosts, COLONY_RULES, windowWidth } from './solar-colony.js';
import { FACILITIES, DRIVES, arrivalAt, industryBoost, flightTo, route } from './solar-industry.js';
import { bodyById } from './solar-config.js';

const BRANCH = { root: 'ORIGIN / 远航协议', industry: 'INDUSTRY / 行星工业', main: 'COLONY / 殖民主线', navigation: 'NAVIGATION / 航行' };
// data-state reuses the VI tree's styling: transit dims like a cycle gate.
const STYLE_STATE = { transit: 'cycles' };
export function solarTalentEffect(o, key, rank = solarRank(o, key)) {
  const t = T[key];
  if (t.root) return '七艘方舟已启航';
  if (t.planned) return '规划中';
  if (t.facility) { const f = FACILITIES[t.facility];
    if (!rank && flightTo(o, f.body)) return '方舟航行中';
    return f.kind === 'boost' ? `行星工业 ×${2 ** rank}` : rank ? `${Q.format(f.base * 2 ** (rank - 1) * industryBoost(o))} Legacy/s` : '尚未建成'; }
  if (key === 'heat') return rank ? '方舟可停靠金星与水星' : '高温会烧毁方舟';
  if (key === 'harbor') return rank ? '方舟可以从火星出发' : '方舟只能从月球出发';
  if (key === 'nuclear' || key === 'fusion') { const d = DRIVES.find(x => x.talent === key), prev = DRIVES[DRIVES.indexOf(d) - 1]; return `单段航程 ${(rank ? d : prev).range} AU`; }
  if (key === 'dome') return rank ? `可容纳 ${rank * COLONY_RULES.domeCapacity} 个殖民文明` : '火星尚无穹顶';
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
  for (const [f, n] of Object.entries(t.facility_gate ?? {})) if (o.solar.facilities[f] < n) parts.push(`需${FACILITIES[f].name}`);
  return parts.join(' · ');
}
// The leg an unbuilt foothold would fly: which drydock, and for how long.
function legText(o, key) {
  const t = T[key]; if (!t.facility || !o.talents.voyage || solarRank(o, key) || flightTo(o, FACILITIES[t.facility].body)) return '';
  const leg = route(o, FACILITIES[t.facility].body);
  return leg.blocked ? '' : `航线：${leg.from === 'moon' ? '月球' : bodyById(leg.from).name} → ${bodyById(FACILITIES[t.facility].body).name} · ${leg.seconds} 秒`;
}
export function buildSolarTreeViewModel(s, { talent = 'dome', selected = false } = {}) {
  const o = s.orbital, v = {};
  if (!o?.started) return v;
  v['#solar-tree-wallet'] = Q.format(s.permanent.legacy);
  for (const [key, t] of Object.entries(T)) {
    const costs = solarCosts(key), rank = solarRank(o, key), state = solarTalentState(s, key), max = costs.length;
    v[`#solar-node-${key}@data-state`] = STYLE_STATE[state] ?? state; v[`#solar-node-${key}@data-owned`] = String(rank > 0);
    v[`#solar-node-${key}@aria-pressed`] = String(selected && key === talent);
    v[`#solar-rank-${key}`] = t.root ? '●' : t.planned ? '' : '●'.repeat(rank) + '○'.repeat(Math.max(0, max - rank));
    v[`#solar-cost-${key}`] = t.root || t.planned || state === 'max' || (t.facility && state === 'transit') ? '' : Q.format(costs[rank]);
    v[`#solar-gate-${key}`] = state === 'max' ? '' : gate(o, key);
    v[`#solar-node-${key}@aria-label`] = `${t.name}，${t.planned ? '规划中' : state === 'max' ? '已完成' : `${Q.format(costs[rank])} Legacy`}`;
    for (const parent of Object.keys(t.requires)) v[`#solar-edge-${parent}-${key}@class:lit`] = rank > 0;
  }
  const t = T[talent], rank = solarRank(o, talent), state = solarTalentState(s, talent), costs = solarCosts(talent);
  const requires = [...Object.entries(t.requires).map(([p, n]) => `${T[p].name}${n > 1 ? ` ${n} 级` : ''}`),
    ...(t.arrival ? ['先遣编队抵达火星'] : []),
    ...Object.entries(t.facility_gate ?? {}).map(([f]) => FACILITIES[f].name)];
  Object.assign(v, {
    '#solar-detail@hidden': !selected, '#solar-detail-branch': BRANCH[t.branch], '#solar-detail-name': t.name,
    '#solar-detail-description': t.description ?? (t.facility ? FACILITIES[t.facility].description : ''),
    '#solar-detail-current': solarTalentEffect(o, talent), '#solar-detail-next': t.root || t.planned || rank >= costs.length ? '—' : solarTalentEffect(o, talent, rank + 1),
    '#solar-detail-requires': [requires.length ? `需要：${requires.join(' + ')}` : '', legText(o, talent)].filter(Boolean).join(' · '),
    '#solar-buy@disabled': state !== 'ready',
    '#solar-buy': t.root ? '已启航' : t.planned ? '规划中 · 尚未开放' : state === 'max' ? '已点亮' :
      `${Q.format(costs[rank])} Legacy · ${{ ready: t.facility ? (rank ? '扩建' : '派遣方舟') : '点亮天赋', legacy: '遗产不足', transit: t.facility ? '方舟航行中' : '等待编队抵达', prerequisite: '前置未满足', locked: '远航后开放' }[state] ?? ''}`,
  });
  return v;
}
