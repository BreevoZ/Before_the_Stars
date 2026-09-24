// VII step 3 · launch windows and civilization transfer, plus the VII talent
// tree (a first shape) with the arks and drydocks that reach the other bodies. The Earth stays the womb: a civilization that is not at
// war can be carried by ark to a colony dome. Windows are soft: aligned planets
// make the crossing short and cheap; a launch against the window still flies,
// but slower and dearer. Colony wars and uplift come in steps 4 and 5.
import { Q } from './quantity.js';
import { TAU } from './celestial-clock.js';
import { bodyById, bodyAngle, orbitalPeriod } from './solar-config.js';
import { FACILITIES, arrived, facilityState, buildFacility, flightFactor } from './solar-industry.js';
import { emptyWorld, colonistRate, colonyIncome } from './colony-war.js';
export { colonistRate } from './colony-war.js';

const M = 2 ** 20, G = 2 ** 30;
export const COLONY_RULES = Object.freeze({
  // A Hohmann transfer to Mars leaves when Mars leads the Earth by about 44°.
  target: 'mars', lead: .77, window: .8, hohmannWindow: .45,
  travelSeconds: 60, lateTravel: 2, fuelLateTravel: 1.4, lateCost: 3, fuelLateCost: 1.5,
  domeCapacity: 2, transferBase: 4 * M,
});
const node = (name, x, y, icon, column, extra = {}) => Object.freeze({ name, x, y, icon, column, requires: {}, costs: [], ...extra });
// The VII map: a gold axis of technology up the middle, each step opening the
// next worlds out from the Sun; beside it, one framed region per world, two per
// tier, left and right. A region grows outwards from its world's large node:
// the planet's own talents along the lower row, its moons along the upper one.
// The axis leads on to VIII (Stellar): the Sun itself.
export const SOLAR_AXIS = 1400;
const BOTTOM = 2700, TIER = 480, tierY = tier => BOTTOM - 240 - tier * TIER;
// Every region is the same frame: from the axis gap out to a fixed width, one tier high.
export const regionFrame = r => ({ left: r.side < 0 ? SOLAR_AXIS - 1150 : SOLAR_AXIS + 150, right: r.side < 0 ? SOLAR_AXIS - 150 : SOLAR_AXIS + 1150, top: tierY(r.tier) - 325, bottom: tierY(r.tier) + 105 });
export const SOLAR_MAP = Object.freeze({ width: 2800, height: BOTTOM + 250 });
const at = (side, tier, col, row = 0) => ({ x: SOLAR_AXIS + side * (260 + 190 * col), y: tierY(tier) - 190 * row });
// id, name, subtitle, side (-1 left / 1 right), tier.
export const SOLAR_REGIONS = Object.freeze([
  ['earth', '地月港', 'EARTH–MOON · 转运与方舟', -1, 0], ['mars', '火星', 'MARS · 殖民世界', 1, 0],
  ['mercury', '水星', 'MERCURY · 近日工业', -1, 1], ['venus', '金星', 'VENUS · 云层与大气', 1, 1],
  ['belt', '小行星带', 'MAIN BELT · 采矿与铸造', -1, 2], ['jupiter', '木星', 'JUPITER · 气态巨行星', 1, 2],
  ['saturn', '土星', 'SATURN · 冰环', -1, 3], ['uranus', '天王星', 'URANUS · 冰巨星', 1, 3],
  ['neptune', '海王星', 'NEPTUNE · 太阳系边缘', -1, 4], ['reserve', '外太阳系', 'KUIPER BELT · 预留', 1, 4],
].map(([id, name, en, side, tier]) => Object.freeze({ id, name, en, side, tier, reserved: id === 'reserve' })));
const R = Object.fromEntries(SOLAR_REGIONS.map(r => [r.id, r]));
const place = (region, col, row, name, icon, extra) => { const r = R[region]; return node(name, at(r.side, r.tier, col, row).x, at(r.side, r.tier, col, row).y, icon, region, extra); };
const world = (region, name, icon, gate, extra) => place(region, 0, 0, name, icon, { kind: 'planet', requires: { [gate]: 1 }, ...extra });
const moon = (id, region, col, name, icon, parent, cost, description, extra = {}) => place(region, col, 1, name, icon, { satellite: id, kind: 'keystone', costs: cost ? [cost] : [], requires: { [parent]: 1 }, description, ...extra });
const axis = (name, tier, icon, cost, requires, description, extra = {}) => node(name, SOLAR_AXIS, tierY(tier), icon, 'axis', { costs: cost ? [cost] : [], requires, gold: true, description, ...extra });
export const SOLAR_TALENTS = Object.freeze({
  voyage: node('远航协议', SOLAR_AXIS, BOTTOM, 'ark', 'axis', { root: true, kind: 'keystone', finale: true, gold: true, description: '七艘方舟结成先遣编队驶向火星。这一页星图从这里向上生长，也与轨道星图的顶端相连。' }),
  // The axis: each technology opens the next worlds out from the Sun.
  heat: axis('耐热外壳', 1, 'heatshield', 12 * M, { voyage: 1 }, '为方舟加装耐热外壳，让它能在水星与金星的高温中停靠。解锁：水星、金星。'),
  mining: axis('小行星采矿', 2, 'drill', 320 * M, { heat: 1 }, '在主带补给、造出聚变引擎：方舟航速 ×1.6。解锁：小行星带、木星。'),
  deepDrive: axis('深空推进', 3, 'deepdrive', 16 * G, { mining: 1 }, '能穿越巨行星之间漫长空隙的推进：方舟航速 ×2.2。解锁：土星、天王星。'),
  relay: axis('深空中继', 4, 'relay', 128 * G, { deepDrive: 1 }, '在外太阳系布下通讯中继，方舟不再与火星失联。解锁：海王星。'),
  dyson: node('戴森群计划', SOLAR_AXIS, tierY(4) - 300, 'dyson', 'axis', { planned: true, requires: { relay: 1 }, finale: true, kind: 'keystone', gold: true, gate: '需要一个升格文明',
    description: 'VII 的终点：把整个太阳系的工业转向太阳，开始建造戴森群，进入 VIII · 恒星。需要深空中继与至少一个升格文明。（后续开放）' }),
  // Earth–Moon: the harbour that is always there, the Earth–Mars crossing.
  moonPort: world('earth', '地月港 · 月面船坞', 'lunarport', 'voyage', { root: true, description: 'VI 的月面船坞与地月航线。转运方舟从这里出发前往火星。' }),
  survey: place('earth', 1, 0, '航线测绘', 'chart', { costs: [8 * M], requires: { moonPort: 1 }, kind: 'specialist', description: '在勘察档案中显示地火窗口的对齐程度与下一次开启的倒计时。' }),
  hohmann: place('earth', 2, 0, '轨道计算', 'orbital', { costs: [96 * M], requires: { survey: 1 }, description: '更精确的转移轨道：发射窗口的宽度增加一半以上。' }),
  fleet: place('earth', 1, 1, '转运舰队', 'convoy', { costs: [256 * M, 2 * G], requires: { survey: 1 }, description: '每级多一艘转运方舟，可同时在途的转运加一。' }),
  // Mars: the harbour where the fleet moors, then the colony.
  harbor: world('mars', '火星 · 火星港', 'harbor', 'voyage', { costs: [24 * M], arrival: 'mars',
    description: '先遣编队停泊的地方。建起船坞后，停泊的方舟可以一艘艘派往其他世界；每派出一艘，火星旁就少一点灯火。' }),
  dome: place('mars', 1, 0, '火星穹顶', 'dome', { costs: [16 * M, 128 * M, G, 8 * G, 64 * G], requires: { harbor: 1 }, kind: 'keystone',
    description: '在火星上建起居住穹顶，每座容纳两个殖民文明；升格文明会永久住在穹顶里。' }),
  transfer: place('mars', 2, 0, '文明转运', 'transfer', { costs: [32 * M], requires: { dome: 1 }, kind: 'keystone',
    description: '从地球挑选一个不在交战的文明，装上方舟送往火星。地球的点位会空出来，新的文明照常萌芽。' }),
  uplift: place('mars', 3, 0, '殖民地存续协议', 'accord', { costs: [192 * M], requires: { transfer: 1 }, kind: 'keystone',
    description: '让殖民文明越过大过滤器：第五时代的和平文明可以谈判签署存续协议；两个第五时代文明交战、一方基地跌破 35% 时，可以接管双方核武——败方覆灭但没有核毁灭，胜方升格。升格文明永久住在穹顶里，不再参战，产出是第五时代居民的 4 倍。' }),
  phobos: moon('phobos', 'mars', 1, '火卫一 · 轨道升降站', 'elevator', 'harbor', 256 * M, '从火卫一向火星放下缆绳：文明转运的价格降低 25%。'),
  deimos: moon('deimos', 'mars', 2, '火卫二 · 转运泊位', 'berth', 'harbor', 512 * M, '转运方舟在火卫二减速入轨：文明转运的航程缩短 20%。'),
  // Mercury and Venus, behind the heat shield.
  mercury: world('mercury', '水星 · 日冕阵列', 'corona', 'heat', { facility: 'mercury' }),
  solarSail: place('mercury', 1, 0, '光帆加速', 'solarsail', { costs: [256 * M], requires: { mercury: 1 }, description: '水星的日冕为方舟张开光帆：所有方舟与转运方舟的航程缩短 30%。' }),
  smelter: place('mercury', 2, 0, '近日熔炉', 'furnace', { costs: [2 * G], requires: { solarSail: 1 }, description: '在水星的昼面冶炼金属：所有行星工业产能再乘 1.5。' }),
  venus: world('venus', '金星 · 高空浮空城', 'cloud', 'heat', { facility: 'venus' }),
  refinery: place('venus', 1, 0, '大气提纯', 'refinery', { costs: [256 * M], requires: { venus: 1 }, description: '浮空城开始提纯硫酸云：金星浮空城的产出翻倍。' }),
  greenhouse: place('venus', 2, 0, '温室气体输送', 'greenhouse', { costs: [G], requires: { refinery: 1 }, description: '把金星的温室气体送往火星，让稀薄的大气变暖：火星居民与升格文明的产出从 ×0.75 恢复到 ×1。' }),
  // The belt and Jupiter, once arks can mine and refuel.
  belt: world('belt', '小行星带 · 采矿舰队', 'mining', 'mining', { facility: 'belt' }),
  arkForge: place('belt', 1, 0, '方舟铸造', 'arkforge', { costs: [2 * G, 8 * G, 32 * G], requires: { belt: 1 }, description: '采矿舰队的金属在火星港铸成新的方舟：每级多一艘停泊的方舟。' }),
  jupiter: world('jupiter', '木星 · 气态采集站', 'gasgiant', 'mining', { facility: 'jupiter' }),
  fuel: place('jupiter', 1, 0, '木星燃料', 'fuelcell', { costs: [G], requires: { jupiter: 1 }, description: '用木星采集站的燃料逆窗加速：地火转运逆窗发射的航程与价格惩罚大幅减轻。' }),
  io: moon('io', 'jupiter', 1, '木卫一 · 火山热电', 'volcano', 'jupiter', 8 * G, '木卫一的火山为采集站供热：木星气态采集站产出翻倍。'),
  europa: moon('europa', 'jupiter', 2, '木卫二 · 冰下海洋', 'ocean', 'jupiter', 16 * G, '冰壳之下的海洋让升格文明找到新的研究方向：升格文明的产出 ×1.5。'),
  ganymede: moon('ganymede', 'jupiter', 3, '木卫三 · 磁层船坞', 'magnet', 'jupiter', 16 * G, '在木卫三的磁层里铸造方舟：多一艘停泊在火星港的方舟。'),
  callisto: moon('callisto', 'jupiter', 4, '木卫四 · 外缘补给站', 'depot', 'jupiter', 32 * G, '辐射带之外的补给站：所有方舟与转运方舟的航程再缩短 20%。'),
  // The ice giants, once the deep drive crosses the gaps.
  saturn: world('saturn', '土星 · 冰环采集站', 'ringplanet', 'deepDrive', { facility: 'saturn' }),
  iceWater: place('saturn', 1, 0, '冰水补给', 'icewater', { costs: [8 * G], requires: { saturn: 1 }, description: '土星环的冰送进火星穹顶：每座穹顶多住一户。' }),
  enceladus: moon('enceladus', 'saturn', 1, '土卫二 · 冰羽采集', 'plume', 'saturn', 32 * G, '收集土卫二喷出的冰羽：土星冰环采集站产出翻倍。'),
  titan: moon('titan', 'saturn', 2, '土卫六 · 甲烷湖前哨', 'lake', 'saturn', 0, '厚雾之下的甲烷湖，是火星之后的下一个殖民世界。（后续开放）', { planned: true }),
  uranus: world('uranus', '天王星 · 冰巨星采集站', 'icegiant', 'deepDrive', { facility: 'uranus' }),
  titania: moon('titania', 'uranus', 1, '天卫三 · 冰岩采集', 'crystal', 'uranus', 128 * G, '天卫三的冰岩里藏着更多氘：冰巨星采集站产出翻倍。'),
  oberon: moon('oberon', 'uranus', 2, '天卫四 · 深空工坊', 'workshop', 'uranus', 256 * G, '远离太阳的精密工坊：所有行星工业产能 ×1.25。'),
  // Neptune, at the edge, once the relay keeps arks in touch.
  neptune: world('neptune', '海王星 · 深空前哨', 'trident', 'relay', { facility: 'neptune' }),
  triton: moon('triton', 'neptune', 1, '海卫一 · 逆行观测站', 'telescope', 'neptune', 512 * G, '沿着逆行轨道观测海王星的风暴：深空前哨产出翻倍。'),
});
export const SOLAR_TALENT_KEYS = Object.freeze(Object.entries(SOLAR_TALENTS).filter(([, t]) => !t.root && !t.planned && !t.facility).map(([key]) => key));
// Save v26 knew only the colony and navigation talents; v27 added the arks and drydocks.
export const V26_SOLAR_KEYS = Object.freeze(['dome', 'transfer', 'survey', 'hohmann', 'fleet', 'fuel']);
// v29 added 殖民地存续协议 (it was a planned node before); v30 rebuilt the map by world;
// v31 put the technology on a central axis.
export const V30_SOLAR_KEYS = Object.freeze(['solarSail', 'smelter', 'refinery', 'greenhouse', 'harbor', 'dome', 'transfer', 'uplift', 'nuclear', 'survey', 'hohmann', 'fleet', 'fusion', 'arkForge', 'fuel', 'jupiterDock', 'deepDrive', 'iceWater', 'uranusDock', 'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'enceladus', 'titania', 'oberon', 'triton']);
export const V29_SOLAR_KEYS = Object.freeze(['heat', 'harbor', 'nuclear', 'fusion', 'dome', 'transfer', 'uplift', 'survey', 'hohmann', 'fleet', 'fuel']);
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
// 冰水补给 lets each dome house one more household.
export const householdsPerDome = o => COLONY_RULES.domeCapacity + (o.solar.talents.iceWater ?? 0);
export const domeCapacity = o => o.solar.talents.dome * householdsPerDome(o);
export const fleetCapacity = o => 1 + o.solar.talents.fleet;
// Uplifted civilizations keep their place under the dome for good.
export const colonyCount = o => o.solar.colonies.mars.civs.length + o.solar.colonies.mars.uplifted.length + o.solar.transfers.length;
export function transferQuote(o, civ) {
  const open = windowOpen(o), fuel = o.solar.talents.fuel > 0;
  const base = COLONY_RULES.transferBase * 2 ** (civ.age - 1);
  // 火卫一's elevator makes each launch cheaper; 火卫二's berth, each crossing shorter.
  const cheaper = o.solar.talents.phobos ? .75 : 1, shorter = o.solar.talents.deimos ? .8 : 1;
  return { open, cost: Math.round((open ? base : base * (fuel ? COLONY_RULES.fuelLateCost : COLONY_RULES.lateCost)) * cheaper),
    seconds: COLONY_RULES.travelSeconds * (open ? 1 : fuel ? COLONY_RULES.fuelLateTravel : COLONY_RULES.lateTravel) * flightFactor(o) * shorter };
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
