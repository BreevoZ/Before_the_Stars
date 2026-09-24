// VII step 3 · launch windows and civilization transfer, plus the VII talent
// tree (a first shape) with the arks and drydocks that reach the other bodies. The Earth stays the womb: a civilization that is not at
// war can be carried by ark to a colony dome. Windows are soft: aligned planets
// make the crossing short and cheap; a launch against the window still flies,
// but slower and dearer. Colony wars and uplift come in steps 4 and 5.
import { Q } from './quantity.js';
import { TAU } from './celestial-clock.js';
import { bodyById, bodyAngle, orbitalPeriod } from './solar-config.js';
import { FACILITIES, arrived, facilityState, buildFacility } from './solar-industry.js';
import { emptyWorld, colonistRate, colonyIncome } from './colony-war.js';
export { colonistRate } from './colony-war.js';

const M = 2 ** 20, G = 2 ** 30;
export const COLONY_RULES = Object.freeze({
  // A Hohmann transfer to Mars leaves when Mars leads the Earth by about 44°.
  target: 'mars', lead: .77, window: .8, hohmannWindow: .45,
  travelSeconds: 60, lateTravel: 2, fuelLateTravel: 1.4, lateCost: 3, fuelLateCost: 1.5,
  domeCapacity: 2, transferBase: 4 * M,
});
const node = (name, x, y, icon, branch, extra = {}) => Object.freeze({ name, x, y, icon, branch, requires: {}, costs: [], ...extra });
// Three routes like the other trees: industry on the left, the gold colony
// mainline up the middle, navigation on the right. 远航协议 is the shared root.
export const SOLAR_TALENTS = Object.freeze({
  voyage: node('远航协议', 660, 1150, 'ark', 'root', { root: true, kind: 'keystone', finale: true, description: '七艘方舟结成先遣编队驶向火星。这一页星图从这里向外生长，也与轨道星图的顶端相连。' }),
  // Industry: arks and drydocks up the inner column, the footholds they reach
  // beside it. Buying a foothold here is the same transaction as in the dossier.
  heat: node('近日隔热', 330, 950, 'heatshield', 'industry', { costs: [12 * M], requires: { voyage: 1 },
    description: '为方舟加装隔热外壳，让它能在金星与水星的高温中停靠。' }),
  venus: node('高空浮空城', 330, 800, 'cloud', 'industry', { facility: 'venus', requires: { heat: 1 } }),
  mercury: node('日冕阵列', 170, 690, 'corona', 'industry', { facility: 'mercury', requires: { venus: 1 } }),
  harbor: node('火星船坞', 490, 950, 'harbor', 'industry', { costs: [24 * M], requires: { voyage: 1 }, arrival: 'mars',
    description: '在先遣编队停泊的火星港建起船坞。此后方舟也可以从火星出发，把下一段航程缩短。' }),
  nuclear: node('核热推进', 490, 790, 'thruster', 'industry', { costs: [64 * M], requires: { harbor: 1 },
    description: '更强的方舟：单段航程从 0.8 AU 延长到 1.5 AU，航速更快。从火星港出发，可以抵达小行星带。' }),
  belt: node('采矿舰队', 330, 650, 'mining', 'industry', { facility: 'belt', requires: { nuclear: 1 } }),
  fusion: node('聚变推进', 490, 630, 'fusion', 'industry', { costs: [320 * M], requires: { nuclear: 1 },
    description: '单段航程延长到 4 AU：从火星港出发，可以抵达木星。' }),
  jupiter: node('气态采集站', 330, 490, 'gasgiant', 'industry', { facility: 'jupiter', requires: { fusion: 1 } }),
  outpost: node('木星船坞', 490, 470, 'outpost', 'industry', { planned: true, requires: { fusion: 1 },
    description: '在木星轨道建起船坞，作为飞往外太阳系的中转站。（后续开放）' }),
  // Mainline: dome → transfer → (colony protocol → deep relay → starship, planned).
  dome: node('火星穹顶', 660, 935, 'dome', 'main', { costs: [16 * M, 128 * M, G, 8 * G, 64 * G], requires: { voyage: 1 }, arrival: 'mars', kind: 'keystone',
    description: '在火星上建起居住穹顶，每座容纳两个殖民文明；升格文明会永久住在穹顶里。需要先遣编队已经抵达火星。' }),
  transfer: node('文明转运', 660, 775, 'transfer', 'main', { costs: [32 * M], requires: { dome: 1 }, kind: 'keystone',
    description: '从地球挑选一个不在交战的文明，装上方舟送往火星。地球的点位会空出来，新的文明照常萌芽。' }),
  uplift: node('殖民地存续协议', 660, 615, 'accord', 'main', { costs: [192 * M], requires: { transfer: 1 }, kind: 'keystone',
    description: '让殖民文明越过大过滤器：第五时代的和平文明可以谈判签署存续协议；两个第五时代文明交战、一方基地跌破 35% 时，可以接管双方核武——败方覆灭但没有核毁灭，胜方升格。升格文明永久住在穹顶里，不再参战，产出是第五时代居民的 4 倍。' }),
  relay: node('深空中继', 660, 455, 'relay', 'main', { planned: true, requires: { uplift: 1 }, description: '在天王星与海王星建立中继，听见太阳系之外。（后续开放）' }),
  starship: node('星际方舟', 660, 250, 'starship', 'main', { planned: true, requires: { relay: 1 }, finale: true, kind: 'keystone', description: 'VII 的终点：驶出日球层，前往 VIII 的星海。（后续开放）' }),
  // Navigation: survey the windows, widen them, carry more, fly against them.
  survey: node('航线测绘', 870, 935, 'chart', 'navigation', { costs: [8 * M], requires: { voyage: 1 }, kind: 'specialist',
    description: '在勘察档案中显示地火窗口的对齐程度与下一次开启的倒计时。' }),
  hohmann: node('轨道计算', 1010, 780, 'orbital', 'navigation', { costs: [96 * M], requires: { survey: 1 },
    description: '更精确的转移轨道：发射窗口的宽度增加一半以上。' }),
  fleet: node('转运舰队', 830, 780, 'convoy', 'navigation', { costs: [256 * M, 2 * G], requires: { survey: 1 },
    description: '每级多一艘转运方舟，可同时在途的转运加一。' }),
  fuel: node('木星燃料', 1010, 615, 'fuelcell', 'navigation', { costs: [G], requires: { hohmann: 1 }, facility_gate: { jupiter: 1 },
    description: '用木星采集站的燃料逆窗加速：逆窗发射的航程与价格惩罚大幅减轻。需要气态采集站。' }),
});
export const SOLAR_TALENT_KEYS = Object.freeze(Object.entries(SOLAR_TALENTS).filter(([, t]) => !t.root && !t.planned && !t.facility).map(([key]) => key));
// Save v26 knew only the colony and navigation talents; v27 added the arks and drydocks.
export const V26_SOLAR_KEYS = Object.freeze(['dome', 'transfer', 'survey', 'hohmann', 'fleet', 'fuel']);
// v29 added 殖民地存续协议 (it was a planned node before).
export const V28_SOLAR_KEYS = Object.freeze(['heat', 'harbor', 'nuclear', 'fusion', 'dome', 'transfer', 'survey', 'hohmann', 'fleet', 'fuel']);
export const emptyColonies = (keys = SOLAR_TALENT_KEYS) => ({ talents: Object.fromEntries(keys.map(key => [key, 0])), colonies: { mars: emptyWorld() }, transfers: [], nextTransfer: 0 });

// ── Talents ──
export function solarTalentState(s, key) {
  const o = s.orbital, t = SOLAR_TALENTS[key];
  if (!t || !o?.started || !o.talents.voyage) return 'locked';
  if (t.root) return 'max';
  if (t.planned) return 'planned';
  if (t.facility) { const state = facilityState(s, t.facility); return state === 'transit' ? 'transit' : state; }
  const rank = o.solar.talents[key];
  if (rank >= t.costs.length) return 'max';
  if (Object.entries(t.requires).some(([p, n]) => solarRank(o, p) < n)) return 'prerequisite';
  if (t.arrival && !arrived(o, t.arrival)) return 'transit';
  if (Object.entries(t.facility_gate ?? {}).some(([f, n]) => o.solar.facilities[f] < n)) return 'prerequisite';
  return Q.gte(s.permanent.legacy, t.costs[rank]) ? 'ready' : 'legacy';
}
export function solarRank(o, key) {
  const t = SOLAR_TALENTS[key];
  if (t.root) return o.talents.voyage ? 1 : 0;
  if (t.planned) return 0;
  return t.facility ? o.solar.facilities[t.facility] : o.solar.talents[key];
}
export const solarCosts = key => { const t = SOLAR_TALENTS[key]; return t.facility ? FACILITIES[t.facility].costs : t.costs; };
export function purchaseSolarTalent(s, key) {
  const t = SOLAR_TALENTS[key];
  if (t?.facility) return buildFacility(s, t.facility);
  if (solarTalentState(s, key) !== 'ready') return false;
  const o = s.orbital, cost = t.costs[o.solar.talents[key]];
  s.permanent.legacy = Q.sub(s.permanent.legacy, cost);
  (o.solar.payments[key] ??= []).push(cost); o.solar.talents[key]++;
  return true;
}

// ── Windows ──
const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
// How far Mars leads the Earth, relative to the ideal Hohmann lead.
export function windowOffset(o, time = o.elapsed) {
  return wrap(bodyAngle(bodyById(COLONY_RULES.target), time) - bodyAngle(bodyById('earth'), time) - COLONY_RULES.lead);
}
export const windowWidth = o => COLONY_RULES.window + (o.solar.talents.hohmann ? COLONY_RULES.hohmannWindow : 0);
export const windowOpen = (o, time = o.elapsed) => Math.abs(windowOffset(o, time)) <= windowWidth(o);
// Seconds until the window next opens (0 when open) or closes.
export function windowTiming(o) {
  const rate = TAU / orbitalPeriod(bodyById(COLONY_RULES.target).au) - TAU / orbitalPeriod(1), offset = windowOffset(o), width = windowWidth(o);
  // Mars is outer and slower: the offset falls steadily, wrapping around.
  const fall = -rate;
  if (Math.abs(offset) <= width) return { open: true, seconds: (offset + width) / fall };
  const distance = ((offset - width) % TAU + TAU) % TAU;
  return { open: false, seconds: distance / fall };
}

// ── Transfers ──
export const domeCapacity = o => o.solar.talents.dome * COLONY_RULES.domeCapacity;
export const fleetCapacity = o => 1 + o.solar.talents.fleet;
// Uplifted civilizations keep their place under the dome for good.
export const colonyCount = o => o.solar.colonies.mars.civs.length + o.solar.colonies.mars.uplifted.length + o.solar.transfers.length;
export function transferQuote(o, civ) {
  const open = windowOpen(o), fuel = o.solar.talents.fuel > 0;
  const base = COLONY_RULES.transferBase * 2 ** (civ.age - 1);
  return { open, cost: open ? base : base * (fuel ? COLONY_RULES.fuelLateCost : COLONY_RULES.lateCost),
    seconds: COLONY_RULES.travelSeconds * (open ? 1 : fuel ? COLONY_RULES.fuelLateTravel : COLONY_RULES.lateTravel) };
}
export function transferState(s, civId) {
  const o = s.orbital;
  if (!o?.talents.voyage || !o.solar.talents.transfer) return 'locked';
  if (o.phase !== 'living') return 'winter';
  if (o.solar.colonies[COLONY_RULES.target].phase !== 'living') return 'colonyWinter';
  const civ = o.civilizations.find(c => c.id === civId);
  if (!civ?.alive) return 'selection';
  if (civ.warId) return 'war';
  if (colonyCount(o) >= domeCapacity(o)) return 'capacity';
  if (o.solar.transfers.length >= fleetCapacity(o)) return 'fleet';
  return Q.gte(s.permanent.legacy, transferQuote(o, civ).cost) ? 'ready' : 'legacy';
}
// The civilization leaves Earth: its site frees up and a new seed can grow there.
export function transferCivilization(s, civId) {
  if (transferState(s, civId) !== 'ready') return false;
  const o = s.orbital, civ = o.civilizations.find(c => c.id === civId), quote = transferQuote(o, civ);
  s.permanent.legacy = Q.sub(s.permanent.legacy, quote.cost);
  (o.solar.payments.transfers ??= []).push(quote.cost);
  o.civilizations = o.civilizations.filter(c => c !== civ);
  for (const key of ['selectedCivilization', 'selectedOpponent']) if (o[key] === civ.id) o[key] = o.civilizations.find(c => c.alive)?.id ?? null;
  o.solar.transfers.push({ id: `t${++o.solar.nextTransfer}`, to: COLONY_RULES.target, departAt: o.elapsed, arriveAt: o.elapsed + quote.seconds,
    civ: { id: civ.id, name: civ.name, age: civ.age, tendency: civ.tendency ?? 0, doctrine: civ.doctrine ?? 0 } });
  return true;
}
// Arrivals move from the ark into the dome.
export function landTransfers(o) {
  const landed = o.solar.transfers.filter(t => o.elapsed >= t.arriveAt - 1e-9);
  if (!landed.length) return [];
  o.solar.transfers = o.solar.transfers.filter(t => !landed.includes(t));
  for (const t of landed) o.solar.colonies[t.to].civs.push({ ...t.civ, arrivedAt: t.arriveAt, progress: 0, warId: null, accord: null });
  return landed;
}
// A colonist works while its world is not in winter: its age doubles its yield (see colony-war.js).
export const colonyRate = colonyIncome;
export const transferValue = civ => COLONY_RULES.transferBase * 2 ** (civ.age - 1);
