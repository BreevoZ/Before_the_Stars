// What each VII talent does, per rank. The simulation reads these through
// effectProduct/effectSum; the star map prints them with effectText. A talent
// may carry several effects. mult multiplies per rank, add adds per rank.
const x = (type, mult, target) => Object.freeze({ type, mult, ...(target ? { target } : {}) });
const plus = (type, add) => Object.freeze({ type, add });
export const EFFECTS = Object.freeze({
  // Earth–Moon: the crossing and the lunar yards.
  hohmann: [plus('window', .45)], fleet: [plus('convoy', 1)], lunarYard: [plus('arks', 1)], lunarRelay: [x('lunar', 2)],
  launchRail: [x('transferTime', .8)], academy: [plus('arrivalAge', 1)], spaceElevator: [x('transferCost', .8)],
  // Mars: the colony and its moons.
  terraform: [x('colonists', 1.5)], shelters: [x('marsWinter', .5)], rations: [x('fuse', 3)], envoys: [x('accordTime', .5)], arsenalLocks: [plus('seizeLine', .15)],
  phobos: [x('transferCost', .75)], deimos: [x('transferTime', .8)],
  // Mercury.
  solarSail: [x('flight', .7)], smelter: [x('industry', 1.5)], ironCore: [x('industry', 1.25)], terminator: [x('industry', 1.2)],
  mercuryDriver: [plus('arks', 1)], coronaProbe: [x('income', 1.1)],
  // Venus.
  refinery: [x('yield', 2, 'venus')], cloudCities: [x('yield', 1.5, 'venus')], sunshade: [x('yield', 2, 'venus')], carbonFoundry: [x('flight', .9)],
  greenhouse: [x('colonists', 4 / 3), x('uplifted', 4 / 3)], lightning: [x('industry', 1.1)],
  // The belt.
  arkForge: [plus('arks', 1)], ceresDepot: [x('flight', .85)], vestaMines: [x('yield', 2, 'belt')], swarm: [x('yield', 1.5, 'belt')],
  redirect: [x('industry', 1.2)], palladium: [x('income', 1.1)],
  // Jupiter and the Galilean moons.
  heliumScoop: [x('yield', 2, 'jupiter')], stormRider: [x('yield', 1.5, 'jupiter')], magnetosphere: [x('industry', 1.2)], gravAssist: [x('flight', .85)],
  io: [x('yield', 2, 'jupiter')], europa: [x('uplifted', 1.5)], ganymede: [plus('arks', 1)], callisto: [x('flight', .8)],
  // Saturn.
  iceWater: [plus('households', 1)], ringHarvest: [x('yield', 2, 'saturn')], ringDocks: [plus('arks', 1)], hexagon: [x('income', 1.1)],
  enceladus: [x('yield', 2, 'saturn')], rhea: [plus('households', 1)], iapetus: [x('industry', 1.15)],
  // Uranus.
  tiltPower: [x('yield', 2, 'uranus')], deuterium: [x('income', 1.1)], diamondRain: [x('industry', 1.2)], uranusBeacon: [x('flight', .9)],
  miranda: [x('yield', 1.25, 'uranus')], ariel: [plus('arks', 1)], titania: [x('yield', 2, 'uranus')], oberon: [x('industry', 1.25)],
  // Neptune.
  windFarm: [x('yield', 2, 'neptune')], ringArcs: [x('yield', 1.5, 'neptune')], darkSpot: [x('income', 1.1)], heliopause: [x('income', 1.1)],
  proteus: [plus('arks', 1)], triton: [x('yield', 2, 'neptune')], nereid: [x('flight', .9)],
  // Pluto and the Kuiper belt.
  cometCapture: [x('flight', .85)], coldArchive: [x('income', 1.15)], nitrogenGlaciers: [x('yield', 2, 'pluto')], kuiperSurvey: [x('income', 1.1)],
  arrokoth: [plus('arks', 1)], charon: [x('yield', 2, 'pluto')], nix: [x('flight', .95)], hydra: [x('income', 1.05)],
});
const rankOf = (o, key) => o?.solar?.talents?.[key] ?? 0;
// Indexed by type (and target) once, so a lookup in the frame loop touches only its own few talents.
const INDEX = new Map();
for (const [key, list] of Object.entries(EFFECTS)) for (const e of list) { const id = `${e.type}:${e.target ?? ''}`; if (!INDEX.has(id)) INDEX.set(id, []); INDEX.get(id).push([key, e]); }
export function effectProduct(o, type, target = null) {
  let m = 1;
  for (const [key, e] of INDEX.get(`${type}:${target ?? ''}`) ?? []) { const r = rankOf(o, key); if (r && e.mult !== undefined) m *= e.mult ** r; }
  return m;
}
export function effectSum(o, type) {
  let s = 0;
  for (const [key, e] of INDEX.get(`${type}:`) ?? []) { const r = rankOf(o, key); if (r && e.add !== undefined) s += e.add * r; }
  return s;
}
const FACILITY_LABELS = { venus: '浮空城', belt: '采矿舰队', jupiter: '气态采集站', saturn: '冰环采集站', uranus: '冰巨星采集站', neptune: '深空前哨', pluto: '冰氮前哨' };
const LABELS = { industry: '行星工业', flight: '航程', transferCost: '转运价格', transferTime: '转运航程', colonists: '火星居民产出', uplifted: '升格文明产出',
  arks: '方舟', households: '每座穹顶住户', window: '发射窗口', convoy: '同时在途转运', income: '行星际收入', lunar: '月面回流', accordTime: '谈判时长',
  seizeLine: '接管核武门槛', fuse: '邻居开战前的等待', marsWinter: '火星核冬天', arrivalAge: '抵达时代' };
const fmt = n => Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
// "航程 ×0.7 · 方舟 +1" for a talent at a given rank.
export function effectText(key, rank) {
  return (EFFECTS[key] ?? []).map(e => {
    const label = e.target ? FACILITY_LABELS[e.target] : LABELS[e.type];
    if (e.add !== undefined) {
      const total = e.add * rank;
      return e.type === 'window' ? `${label} +${Math.round(total * 180 / Math.PI)}°` : e.type === 'seizeLine' ? `${label} +${Math.round(total * 100)}%` : `${label} +${fmt(total)}`;
    }
    return `${label} ×${fmt(e.mult ** rank)}`;
  }).join(' · ');
}
