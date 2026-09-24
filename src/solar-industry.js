// VII · arks, drydocks and planetary industry. The seven lunar arks fly out
// together as one pioneer fleet and found the Mars harbour. Every other body is
// reached by dispatching an ark from a drydock (the Moon's, or one built later):
// the drive limits how far one leg can reach, some bodies need a hull that can
// survive them, and every drydock can serve as a relay for the next leg.
// Industry pays Legacy like the lunar base does, on its own ledger (o.solar).
import { Q } from './quantity.js';
import { bodyById } from './solar-config.js';

// One leg's flight time grows gently with its length, and falls with the drive.
export const legSeconds = (distance, speed = 1) => Math.round(25 + 50 * distance ** .6 / speed);
export const auOf = id => id === 'moon' ? 1 : bodyById(id).au;
export const legDistance = (from, to) => Math.abs(auOf(to) - auOf(from));
// The pioneer fleet: seven arks, Moon to Mars, from the moment of 远航协议.
export const PIONEER = Object.freeze({ from: 'moon', to: 'mars', seconds: legSeconds(legDistance('moon', 'mars')) });
// Drives are VII talents; the first comes with 远航协议. range is one leg in AU.
export const DRIVES = Object.freeze([
  Object.freeze({ talent: null, name: '化学推进', range: .8, speed: 1 }),
  Object.freeze({ talent: 'nuclear', name: '核热推进', range: 1.5, speed: 1.25 }),
  Object.freeze({ talent: 'fusion', name: '聚变推进', range: 4, speed: 1.6 }),
]);
// Drydocks: the Moon's is VI's shipyard; the others are VII talents.
export const DOCKS = Object.freeze({ moon: null, mars: 'harbor' });
// Bodies an ordinary hull cannot survive, and the talent that makes it able to.
export const HAZARDS = Object.freeze({ venus: 'heat', mercury: 'heat' });

const M = 2 ** 20, G = 2 ** 30;
// yield: Legacy per second, doubling with every rank after the first.
// boost: multiplies every yield facility, doubling per rank.
// The first rank is paid when the ark is dispatched and built when it arrives.
const facility = (name, body, costs, kind, description, extra = {}) => Object.freeze({ name, body, costs: Object.freeze(costs), kind, description, ...extra });
export const FACILITIES = Object.freeze({
  venus: facility('高空浮空城', 'venus', [8 * M, 32 * M, 128 * M, 512 * M, 2 * G], 'yield', '在五十公里高空的温和云层里，浮空城采集大气，持续回流 Legacy。', { base: 32768 }),
  mercury: facility('日冕阵列', 'mercury', [32 * M, 256 * M, 2 * G, 16 * G], 'boost', '贴近太阳铺开的集能阵列，为所有行星工业供能：每级产能翻倍。', { requires: { venus: 1 } }),
  belt: facility('采矿舰队', 'belt', [64 * M, 256 * M, G, 4 * G, 16 * G], 'yield', '从火星港出发，开采小行星的金属与冰。', { base: 262144 }),
  jupiter: facility('气态采集站', 'jupiter', [512 * M, 2 * G, 8 * G, 32 * G], 'yield', '在木星高层大气中采集氦与氢，是太阳系里最大的产能。', { base: 2 * M }),
});
export const facilityAt = body => Object.keys(FACILITIES).find(key => FACILITIES[key].body === body) ?? null;
export const emptyIndustry = () => ({ facilities: Object.fromEntries(Object.keys(FACILITIES).map(key => [key, 0])), payments: {}, produced: 0, fraction: 0 });
export const emptyFlights = () => ({ flights: [] });

// ── Reach ──
const talent = (o, key) => o.solar.talents?.[key] ?? 0;
export const drive = o => DRIVES.filter(d => !d.talent || talent(o, d.talent)).at(-1);
export const docks = o => Object.entries(DOCKS).filter(([, key]) => !key || talent(o, key)).map(([body]) => body);
export const pioneerAt = o => o.completionAt === null ? null : o.completionAt + PIONEER.seconds;
export const pioneerProgress = o => o.completionAt === null ? 0 : Math.max(0, Math.min(1, (o.elapsed - o.completionAt) / PIONEER.seconds));
// The next leg to a body: from the nearest drydock in range, or why it cannot go.
export function route(o, body) {
  const hazard = HAZARDS[body];
  if (hazard && !talent(o, hazard)) return { blocked: 'hazard', need: hazard };
  const d = drive(o), legs = docks(o).map(from => ({ from, distance: legDistance(from, body) })).sort((a, b) => a.distance - b.distance);
  const leg = legs.find(l => l.distance <= d.range + 1e-9);
  if (!leg) return { blocked: 'range', need: DRIVES.find(x => x.range >= legs[0].distance)?.talent ?? null, distance: legs[0].distance };
  return { ...leg, seconds: legSeconds(leg.distance, d.speed) };
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

export const industryBoost = o => 2 ** (o.solar.facilities.mercury ?? 0);
export function facilityRate(o, key) {
  const f = FACILITIES[key], rank = o.solar.facilities[key];
  return f.kind === 'yield' && rank ? f.base * 2 ** (rank - 1) * industryBoost(o) : 0;
}
export const industryRate = o => Object.keys(FACILITIES).reduce((sum, key) => sum + facilityRate(o, key), 0);

export function facilityState(s, key) {
  const o = s.orbital, f = FACILITIES[key];
  if (!f || !o?.started || !o.talents.voyage) return 'locked';
  const rank = o.solar.facilities[key];
  if (rank >= f.costs.length) return 'max';
  if (flightTo(o, f.body)) return 'transit';
  if (Object.entries(f.requires ?? {}).some(([other, level]) => o.solar.facilities[other] < level)) return 'prerequisite';
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
  o.solar.flights.push({ body: f.body, from: leg.from, departAt: o.elapsed, arriveAt: o.elapsed + leg.seconds });
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
