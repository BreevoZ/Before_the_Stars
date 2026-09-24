// VII step 2 · planetary industry. The seven arks that left the lunar drydock
// really travel: each reaches its body a fixed time after 远航协议, and only then
// can a foothold be built there. Industry pays Legacy like the lunar base does,
// on its own clock and ledger (o.solar), and never touches VI's multipliers.
import { Q } from './quantity.js';

// One ark per destination, in the order they arrive. The belt has no ark of its
// own: its mining fleet works from the Mars foothold.
export const ARK_ROUTES = Object.freeze([
  { body: 'venus', seconds: 40 }, { body: 'mercury', seconds: 60 }, { body: 'mars', seconds: 90 },
  { body: 'jupiter', seconds: 240 }, { body: 'saturn', seconds: 420 }, { body: 'uranus', seconds: 720 }, { body: 'neptune', seconds: 1020 },
]);
const M = 2 ** 20, G = 2 ** 30;
// yield: Legacy per second, doubling with every rank after the first.
// boost: multiplies every yield facility, doubling per rank.
const facility = (name, body, costs, kind, description, extra = {}) => Object.freeze({ name, body, costs: Object.freeze(costs), kind, description, ...extra });
export const FACILITIES = Object.freeze({
  venus: facility('高空浮空城', 'venus', [8 * M, 32 * M, 128 * M, 512 * M, 2 * G], 'yield', '在五十公里高空的温和云层里，浮空城采集大气，持续回流 Legacy。', { base: 32768 }),
  mercury: facility('日冕阵列', 'mercury', [32 * M, 256 * M, 2 * G, 16 * G], 'boost', '贴近太阳铺开的集能阵列，为所有行星工业供能：每级产能翻倍。'),
  belt: facility('采矿舰队', 'belt', [64 * M, 256 * M, G, 4 * G, 16 * G], 'yield', '以火星驻地为中转，开采小行星的金属与冰。', { base: 262144, via: 'mars' }),
  jupiter: facility('气态采集站', 'jupiter', [512 * M, 2 * G, 8 * G, 32 * G], 'yield', '在木星高层大气中采集氦与氢，是太阳系里最大的产能。', { base: 2 * M, requires: { belt: 1 } }),
});
export const emptyIndustry = () => ({ facilities: Object.fromEntries(Object.keys(FACILITIES).map(key => [key, 0])), payments: {}, produced: 0, fraction: 0 });

export const arkRoute = body => ARK_ROUTES.find(route => route.body === body);
// When the ark bound for a body arrives (the belt waits for Mars), or null before 远航协议.
export function arrivalAt(o, body) {
  if (o.completionAt === null) return null;
  const route = arkRoute(FACILITIES[body]?.via ?? body);
  return route ? o.completionAt + route.seconds : null;
}
export const arrived = (o, body) => { const at = arrivalAt(o, body); return at !== null && o.elapsed >= at - 1e-9; };
// 0..1 progress of each ark, for drawing and the dossier.
export function arkProgress(o, index) {
  if (o.completionAt === null) return 0;
  return Math.max(0, Math.min(1, (o.elapsed - o.completionAt) / ARK_ROUTES[index].seconds));
}

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
  if (!arrived(o, f.body)) return 'transit';
  if (Object.entries(f.requires ?? {}).some(([other, level]) => o.solar.facilities[other] < level)) return 'prerequisite';
  return Q.gte(s.permanent.legacy, f.costs[rank]) ? 'ready' : 'legacy';
}
export function buildFacility(s, key) {
  if (facilityState(s, key) !== 'ready') return false;
  const o = s.orbital, cost = FACILITIES[key].costs[o.solar.facilities[key]];
  s.permanent.legacy = Q.sub(s.permanent.legacy, cost);
  (o.solar.payments[key] ??= []).push(cost); o.solar.facilities[key]++;
  return true;
}
export const industrySpent = o => o?.solar ? Q.sum(Object.values(o.solar.payments).flat()) : 0;
