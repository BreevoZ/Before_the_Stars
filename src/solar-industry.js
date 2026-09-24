// VII · arks and planetary industry. The seven lunar arks fly out together as
// one pioneer fleet and moor at the Mars harbour: from then on a light at Mars
// is an ark waiting there. Every foothold elsewhere is founded by sending one of
// them straight from Mars, and each world opens with one technology on the
// VII map's central axis (heat for the inner planets, mining for the belt and
// Jupiter, the deep drive for the ice giants, the relay for Neptune). New arks
// come only from the belt's forges. Industry pays Legacy on its own ledger.
import { Q } from './quantity.js';
import { bodyById } from './solar-config.js';
import { ORBITAL_RULES } from './orbital-config.js';

// One leg's flight time grows gently with its length, and falls with the drive.
export const legSeconds = (distance, speed = 1) => Math.round(25 + 50 * distance ** .6 / speed);
export const auOf = id => id === 'moon' ? 1 : bodyById(id).au;
export const legDistance = (from, to) => Math.abs(auOf(to) - auOf(from));
// The pioneer fleet: seven arks, Moon to Mars, from the moment of 远航协议.
export const PIONEER = Object.freeze({ from: 'moon', to: 'mars', seconds: legSeconds(legDistance('moon', 'mars')) });
// The technology each world waits for, and how fast arks fly once it is known.
export const GATES = Object.freeze({ mercury: 'heat', venus: 'heat', belt: 'mining', jupiter: 'mining', saturn: 'deepDrive', uranus: 'deepDrive', neptune: 'relay' });
export const DRIVES = Object.freeze([
  Object.freeze({ talent: null, name: '化学推进', speed: 1 }),
  Object.freeze({ talent: 'mining', name: '聚变引擎', speed: 1.6 }),
  Object.freeze({ talent: 'deepDrive', name: '深空推进', speed: 2.2 }),
]);
// v30 arks could pass through these drydocks; they are kept only to read old flights.
export const OLD_DOCKS = Object.freeze(['jupiter', 'uranus']);

const M = 2 ** 20, G = 2 ** 30, T = 2 ** 40;
// yield: Legacy per second, doubling with every rank after the first.
// boost: multiplies every yield facility, doubling per rank.
// The first rank is paid when the ark is dispatched and built when it arrives.
const facility = (name, body, costs, kind, description, extra = {}) => Object.freeze({ name, body, costs: Object.freeze(costs), kind, description, ...extra });
export const FACILITIES = Object.freeze({
  venus: facility('高空浮空城', 'venus', [8 * M, 32 * M, 128 * M, 512 * M, 2 * G], 'yield', '在五十公里高空的温和云层里，浮空城采集大气，持续回流 Legacy。', { base: 32768 }),
  mercury: facility('日冕阵列', 'mercury', [32 * M, 256 * M, 2 * G, 16 * G], 'boost', '贴近太阳铺开的集能阵列，为所有行星工业供能：每级产能翻倍。'),
  belt: facility('采矿舰队', 'belt', [64 * M, 256 * M, G, 4 * G, 16 * G], 'yield', '从火星港出发，开采小行星的金属与冰。', { base: 262144 }),
  jupiter: facility('气态采集站', 'jupiter', [512 * M, 2 * G, 8 * G, 32 * G], 'yield', '在木星高层大气中采集氦与氢。', { base: 2 * M }),
  saturn: facility('冰环采集站', 'saturn', [4 * G, 16 * G, 64 * G, 256 * G], 'yield', '在土星环里开采纯净的水冰，送往内太阳系。', { base: 8 * M }),
  uranus: facility('冰巨星采集站', 'uranus', [32 * G, 128 * G, 512 * G], 'yield', '从天王星倾斜的大气中提取氘与氦-3。', { base: 32 * M }),
  neptune: facility('深空前哨', 'neptune', [256 * G, T, 4 * T], 'yield', '太阳系边缘的前哨，从海王星的风暴中采集重氢。', { base: 128 * M }),
});
// Save v29 knew only the first four footholds.
export const V29_FACILITY_KEYS = Object.freeze(['venus', 'mercury', 'belt', 'jupiter']);
export const facilityAt = body => Object.keys(FACILITIES).find(key => FACILITIES[key].body === body) ?? null;
export const emptyIndustry = (keys = Object.keys(FACILITIES)) => ({ facilities: Object.fromEntries(keys.map(key => [key, 0])), payments: {}, produced: 0, fraction: 0 });
export const emptyFlights = () => ({ flights: [] });

// ── Arks ──
const talent = (o, key) => o.solar.talents?.[key] ?? 0;
export const drive = o => DRIVES.filter(d => !d.talent || talent(o, d.talent)).at(-1);
export const pioneerAt = o => o.completionAt === null ? null : o.completionAt + PIONEER.seconds;
export const pioneerProgress = o => o.completionAt === null ? 0 : Math.max(0, Math.min(1, (o.elapsed - o.completionAt) / PIONEER.seconds));
// 光帆加速 shortens every flight, arks and transfers alike.
// 木卫四's depot shortens them again.
export const flightFactor = o => (talent(o, 'solarSail') ? .7 : 1) * (talent(o, 'callisto') ? .8 : 1);
// New arks: the belt's forges and the Ganymede yard.
export const arkTotal = o => ORBITAL_RULES.arkCount + talent(o, 'arkForge') + talent(o, 'ganymede');
// Arks away: those in flight and those that became a station.
export const arksAway = o => (o.solar.flights?.length ?? 0) + Object.values(o.solar.facilities).filter(rank => rank > 0).length;
export const arksMoored = o => arrived(o, PIONEER.to) ? Math.max(0, arkTotal(o) - arksAway(o)) : 0;
// The way to a body: straight from Mars once its technology is known, or why
// no ark can go yet (no harbour, no technology, no ark moored).
export function route(o, body) {
  if (!talent(o, 'harbor')) return { blocked: 'harbor' };
  if (GATES[body] && !talent(o, GATES[body])) return { blocked: 'tech', need: GATES[body] };
  if (!arksMoored(o)) return { blocked: 'fleet' };
  return { from: 'mars', via: [], seconds: Math.round(legSeconds(legDistance('mars', body), drive(o).speed) * flightFactor(o)) };
}
// Where an ark is along its legs: the waypoint it left, the next one and how far between.
export function flightLeg(o, f) {
  const points = [f.from, ...(f.via ?? []), f.body], weights = points.slice(1).map((id, i) => legDistance(points[i], id) ** .6 + .5);
  const total = weights.reduce((a, b) => a + b, 0); let t = Math.max(0, Math.min(1, (o.elapsed - f.departAt) / (f.arriveAt - f.departAt))) * total;
  for (let i = 0; i < weights.length; i++) { if (t <= weights[i] || i === weights.length - 1) return { from: points[i], to: points[i + 1], t: Math.min(1, t / weights[i]) }; t -= weights[i]; }
}
export const flightTo = (o, body) => o.solar.flights?.find(f => f.body === body) ?? null;
// When the ark bound for a body arrives, or null when none is on its way.
export function arrivalAt(o, body) {
  if (body === PIONEER.to) return pioneerAt(o);
  return flightTo(o, body)?.arriveAt ?? null;
}
// Mars is reached by the pioneer fleet; any other body by its foothold.
export function arrived(o, body) {
  if (!o.talents.voyage) return false;
  if (body === PIONEER.to) return o.elapsed >= pioneerAt(o) - 1e-9;
  const key = facilityAt(body);
  return Boolean(key && o.solar.facilities[key]);
}
export const flightProgress = (o, f) => Math.max(0, Math.min(1, (o.elapsed - f.departAt) / (f.arriveAt - f.departAt)));

// 日冕阵列 doubles every yield per rank; 近日熔炉 and 天卫四 add to all of them;
// 大气提纯 and each giant's moon double their own world.
export const industryBoost = o => 2 ** (o.solar.facilities.mercury ?? 0) * (talent(o, 'smelter') ? 1.5 : 1) * (talent(o, 'oberon') ? 1.25 : 1);
const DOUBLERS = Object.freeze({ venus: 'refinery', jupiter: 'io', saturn: 'enceladus', uranus: 'titania', neptune: 'triton' });
export const facilityMultiplier = (o, key) => industryBoost(o) * (talent(o, DOUBLERS[key]) ? 2 : 1);
export function facilityRate(o, key) {
  const f = FACILITIES[key], rank = o.solar.facilities[key];
  return f.kind === 'yield' && rank ? f.base * 2 ** (rank - 1) * facilityMultiplier(o, key) : 0;
}
export const industryRate = o => Object.keys(FACILITIES).reduce((sum, key) => sum + facilityRate(o, key), 0);

export function facilityState(s, key) {
  const o = s.orbital, f = FACILITIES[key];
  if (!f || !o?.started || !o.talents.voyage) return 'locked';
  const rank = o.solar.facilities[key];
  if (rank >= f.costs.length) return 'max';
  if (flightTo(o, f.body)) return 'transit';
  if (!rank && route(o, f.body).blocked) return 'prerequisite';
  return Q.gte(s.permanent.legacy, f.costs[rank]) ? 'ready' : 'legacy';
}
// The first rank dispatches an ark; the foothold stands when it lands.
export function buildFacility(s, key) {
  if (facilityState(s, key) !== 'ready') return false;
  const o = s.orbital, f = FACILITIES[key], rank = o.solar.facilities[key], cost = f.costs[rank];
  s.permanent.legacy = Q.sub(s.permanent.legacy, cost);
  (o.solar.payments[key] ??= []).push(cost);
  if (rank) { o.solar.facilities[key]++; return true; }
  const leg = route(o, f.body);
  o.solar.flights.push({ body: f.body, from: leg.from, via: leg.via, departAt: o.elapsed, arriveAt: o.elapsed + leg.seconds });
  return true;
}
export function landFlights(o) {
  const landed = o.solar.flights.filter(f => o.elapsed >= f.arriveAt - 1e-9);
  if (!landed.length) return [];
  o.solar.flights = o.solar.flights.filter(f => !landed.includes(f));
  for (const f of landed) o.solar.facilities[facilityAt(f.body)] = 1;
  return landed;
}
export const industrySpent = o => o?.solar ? Q.sum(Object.values(o.solar.payments).flat()) : 0;
