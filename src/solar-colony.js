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
// The VII map is a fan: 远航协议 at the bottom links one large node per world,
// ordered outward from the Sun, and every world grows its own talents upwards.
// Only Mars carries the gold mainline (the colony, then the way to VIII); every
// other column is green. Satellites will branch off beside their planet.
export const SOLAR_MAP = Object.freeze({ width: 3580, height: 1990 });
export const SOLAR_COLUMNS = Object.freeze({ mercury: 250, venus: 690, mars: 1130, belt: 1570, jupiter: 2010, saturn: 2450, uranus: 2890, neptune: 3330 });
const X = SOLAR_COLUMNS, ROW = Object.freeze([1480, 1270, 1070, 870, 670]);
const moon = (id, name, x, y, icon, parent, cost, description, extra = {}) => node(name, x, y, icon, SOLAR_TALENTS_COLUMN[parent], { satellite: id, kind: 'keystone', costs: [cost], requires: { [parent]: 1 }, description, ...extra });
const SOLAR_TALENTS_COLUMN = Object.freeze({ harbor: 'mars', jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus', neptune: 'neptune' });
const world = (key, name, icon, extra) => node(name, X[key], ROW[0], icon, key, { kind: 'planet', requires: { voyage: 1 }, ...extra });
export const SOLAR_TALENTS = Object.freeze({
  voyage: node('远航协议', X.mars, 1760, 'ark', 'root', { root: true, kind: 'keystone', finale: true, gold: true, description: '七艘方舟结成先遣编队驶向火星。这一页星图从这里向外生长，也与轨道星图的顶端相连。' }),
  // Mercury: the corona array, sails and a furnace close to the Sun.
  mercury: world('mercury', '水星 · 日冕阵列', 'corona', { facility: 'mercury' }),
  solarSail: node('光帆加速', X.mercury, ROW[1], 'solarsail', 'mercury', { costs: [256 * M], requires: { mercury: 1 },
    description: '水星的日冕为方舟张开光帆：所有方舟与转运方舟的航程缩短 30%。' }),
  smelter: node('近日熔炉', X.mercury, ROW[2], 'furnace', 'mercury', { costs: [2 * G], requires: { solarSail: 1 },
    description: '在水星的昼面冶炼金属：所有行星工业产能再乘 1.5。' }),
  // Venus: the cloud city, then what its air can do for others.
  venus: world('venus', '金星 · 高空浮空城', 'cloud', { facility: 'venus' }),
  refinery: node('大气提纯', X.venus, ROW[1], 'refinery', 'venus', { costs: [256 * M], requires: { venus: 1 },
    description: '浮空城开始提纯硫酸云：金星浮空城的产出翻倍。' }),
  greenhouse: node('温室气体输送', X.venus, ROW[2], 'greenhouse', 'venus', { costs: [G], requires: { refinery: 1 },
    description: '把金星的温室气体送往火星，让稀薄的大气变暖：火星居民与升格文明的产出从 ×0.75 恢复到 ×1。' }),
  // Mars: the harbour where the fleet moors, the gold colony mainline, the arks' first upgrades and the Earth–Mars transfer.
  harbor: world('mars', '火星 · 火星港', 'harbor', { costs: [24 * M], arrival: 'mars', gold: true,
    description: '先遣编队停泊的地方。建起船坞后，停泊的方舟可以一艘艘派往其他世界；每派出一艘，火星旁就少一点灯火。' }),
  dome: node('火星穹顶', X.mars, ROW[1], 'dome', 'mars', { costs: [16 * M, 128 * M, G, 8 * G, 64 * G], requires: { harbor: 1 }, kind: 'keystone', gold: true,
    description: '在火星上建起居住穹顶，每座容纳两个殖民文明；升格文明会永久住在穹顶里。' }),
  transfer: node('文明转运', X.mars, ROW[2], 'transfer', 'mars', { costs: [32 * M], requires: { dome: 1 }, kind: 'keystone', gold: true,
    description: '从地球挑选一个不在交战的文明，装上方舟送往火星。地球的点位会空出来，新的文明照常萌芽。' }),
  uplift: node('殖民地存续协议', X.mars, ROW[3], 'accord', 'mars', { costs: [192 * M], requires: { transfer: 1 }, kind: 'keystone', gold: true,
    description: '让殖民文明越过大过滤器：第五时代的和平文明可以谈判签署存续协议；两个第五时代文明交战、一方基地跌破 35% 时，可以接管双方核武——败方覆灭但没有核毁灭，胜方升格。升格文明永久住在穹顶里，不再参战，产出是第五时代居民的 4 倍。' }),
  starship: node('星际方舟', X.mars, 430, 'starship', 'mars', { planned: true, requires: { uplift: 1 }, finale: true, kind: 'keystone', gold: true, gate: '需要海王星的深空中继',
    description: 'VII 的终点：驶出日球层，前往 VIII 的星海。需要升格文明与海王星的深空中继。（后续开放）' }),
  nuclear: node('核热推进', X.mars - 140, ROW[1], 'thruster', 'mars', { costs: [64 * M], requires: { harbor: 1 },
    description: '更强的方舟：单段航程从 0.8 AU 延长到 1.5 AU，航速更快。从火星港出发，可以抵达水星与小行星带。' }),
  survey: node('航线测绘', X.mars - 260, ROW[1], 'chart', 'mars', { costs: [8 * M], requires: { harbor: 1 }, kind: 'specialist',
    description: '在勘察档案中显示地火窗口的对齐程度与下一次开启的倒计时。' }),
  hohmann: node('轨道计算', X.mars - 260, ROW[2], 'orbital', 'mars', { costs: [96 * M], requires: { survey: 1 },
    description: '更精确的转移轨道：发射窗口的宽度增加一半以上。' }),
  fleet: node('转运舰队', X.mars - 140, ROW[2], 'convoy', 'mars', { costs: [256 * M, 2 * G], requires: { survey: 1 },
    description: '每级多一艘转运方舟，可同时在途的转运加一。' }),
  // The belt: metal for faster drives and for new arks.
  belt: world('belt', '小行星带 · 采矿舰队', 'mining', { facility: 'belt' }),
  fusion: node('聚变推进', X.belt, ROW[1], 'fusion', 'belt', { costs: [320 * M], requires: { belt: 1 },
    description: '用小行星的金属造出聚变引擎：单段航程延长到 4 AU，从火星港可以抵达木星。' }),
  arkForge: node('方舟铸造', X.belt, ROW[2], 'arkforge', 'belt', { costs: [2 * G, 8 * G, 32 * G], requires: { fusion: 1 },
    description: '采矿舰队的金属在火星港铸成新的方舟：每级多一艘停泊的方舟。' }),
  // Jupiter: fuel, the first outer drydock, and the drive that crosses the giants.
  jupiter: world('jupiter', '木星 · 气态采集站', 'gasgiant', { facility: 'jupiter' }),
  fuel: node('木星燃料', X.jupiter, ROW[1], 'fuelcell', 'jupiter', { costs: [G], requires: { jupiter: 1 },
    description: '用木星采集站的燃料逆窗加速：地火转运逆窗发射的航程与价格惩罚大幅减轻。' }),
  jupiterDock: node('木星船坞', X.jupiter, ROW[2], 'outpost', 'jupiter', { costs: [4 * G], requires: { fuel: 1 },
    description: '在木星轨道建起船坞：方舟可以在这里中转，飞向更远的世界。' }),
  deepDrive: node('深空推进', X.jupiter, ROW[3], 'deepdrive', 'jupiter', { costs: [16 * G], requires: { jupiterDock: 1 },
    description: '单段航程延长到 15 AU：从火星港直达土星；经木星船坞中转可以抵达天王星。' }),
  // The outer giants: ice, the far drydock and the relay that opens VIII.
  saturn: world('saturn', '土星 · 冰环采集站', 'ringplanet', { facility: 'saturn' }),
  iceWater: node('冰水补给', X.saturn, ROW[1], 'icewater', 'saturn', { costs: [8 * G], requires: { saturn: 1 },
    description: '土星环的冰送进火星穹顶：每座穹顶多住一户。' }),
  uranus: world('uranus', '天王星 · 冰巨星采集站', 'icegiant', { facility: 'uranus' }),
  uranusDock: node('天王星船坞', X.uranus, ROW[1], 'anchor', 'uranus', { costs: [64 * G], requires: { uranus: 1 },
    description: '太阳系外缘的船坞：方舟经这里中转，可以抵达海王星。' }),
  neptune: world('neptune', '海王星 · 深空前哨', 'trident', { facility: 'neptune' }),
  relay: node('深空中继', X.neptune, ROW[1], 'relay', 'neptune', { planned: true, requires: { neptune: 1 },
    description: '在海王星建立深空中继，听见太阳系之外。它与升格文明一起打开星际方舟。（后续开放）' }),
  // Satellites branch beside their planet. A moon's station is set down by a
  // lander from the planet's own station: no new ark leaves Mars for it.
  phobos: moon('phobos', '火卫一 · 轨道升降站', X.mars + 140, ROW[1], 'elevator', 'harbor', 256 * M, '从火卫一向火星放下缆绳：文明转运的价格降低 25%。'),
  deimos: moon('deimos', '火卫二 · 转运泊位', X.mars + 280, ROW[1], 'berth', 'harbor', 512 * M, '转运方舟在火卫二减速入轨：文明转运的航程缩短 20%。'),
  io: moon('io', '木卫一 · 火山热电', X.jupiter - 140, ROW[1], 'volcano', 'jupiter', 8 * G, '木卫一的火山为采集站供热：木星气态采集站产出翻倍。'),
  europa: moon('europa', '木卫二 · 冰下海洋', X.jupiter - 280, ROW[1], 'ocean', 'jupiter', 16 * G, '冰壳之下的海洋让升格文明找到新的研究方向：升格文明的产出 ×1.5。'),
  ganymede: moon('ganymede', '木卫三 · 磁层船坞', X.jupiter + 140, ROW[1], 'magnet', 'jupiter', 16 * G, '在木卫三的磁层里铸造方舟：多一艘停泊在火星港的方舟。'),
  callisto: moon('callisto', '木卫四 · 外缘补给站', X.jupiter + 280, ROW[1], 'depot', 'jupiter', 32 * G, '辐射带之外的补给站：所有方舟与转运方舟的航程再缩短 20%。'),
  enceladus: moon('enceladus', '土卫二 · 冰羽采集', X.saturn + 140, ROW[1], 'plume', 'saturn', 32 * G, '收集土卫二喷出的冰羽：土星冰环采集站产出翻倍。'),
  titan: moon('titan', '土卫六 · 甲烷湖前哨', X.saturn + 280, ROW[1], 'lake', 'saturn', 0, '厚雾之下的甲烷湖，是火星之后的下一个殖民世界。（后续开放）', { planned: true, costs: [] }),
  titania: moon('titania', '天卫三 · 冰岩采集', X.uranus + 140, ROW[1], 'crystal', 'uranus', 128 * G, '天卫三的冰岩里藏着更多氘：冰巨星采集站产出翻倍。'),
  oberon: moon('oberon', '天卫四 · 深空工坊', X.uranus + 280, ROW[1], 'workshop', 'uranus', 256 * G, '远离太阳的精密工坊：所有行星工业产能 ×1.25。'),
  triton: moon('triton', '海卫一 · 逆行观测站', X.neptune + 140, ROW[1], 'telescope', 'neptune', 512 * G, '沿着逆行轨道观测海王星的风暴：深空前哨产出翻倍。'),
});
export const SOLAR_TALENT_KEYS = Object.freeze(Object.entries(SOLAR_TALENTS).filter(([, t]) => !t.root && !t.planned && !t.facility).map(([key]) => key));
// Save v26 knew only the colony and navigation talents; v27 added the arks and drydocks.
export const V26_SOLAR_KEYS = Object.freeze(['dome', 'transfer', 'survey', 'hohmann', 'fleet', 'fuel']);
// v29 added 殖民地存续协议 (it was a planned node before); v30 rebuilt the map by world.
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
