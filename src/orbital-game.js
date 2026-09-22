import { Q } from './quantity.js';
import { ORBITAL_RULES as R, ORBITAL_STRUCTURES as STRUCTURES, BODIES, POLICIES, INTERVENTIONS } from './orbital-config.js';
import { createBody, civilizationAge, civilizationRates, advanceBody, applyIntervention } from './celestial-economy.js';

export function createOrbitalState() {
  return { version: R.version, started: false, elapsed: 0, energy: R.startingEnergy,
    structures: Object.fromEntries(Object.keys(STRUCTURES).map(key => [key, 0])), project: null,
    bodies: Object.fromEntries(Object.entries(BODIES).map(([key, body]) => [key, createBody(body)])),
    legacyEarned: 0, legacyFraction: 0, selectedBody: 'earth', selectedCivilization: 'delta', autoStabilize: false,
    completionAt: null, log: [{ time: 0, text: '舰队已进入轨道。先展开太阳翼，让家园获得第一束电力。' }] };
}
export function orbitalRates(state) {
  const b = state.structures;
  return { power: R.basePower + b.solar * R.powerPerSolar + b.outpost * 4 + b.reactor * R.powerPerReactor,
    capacity: R.baseStorage + b.battery * R.storagePerBattery,
    growth: 1 + b.habitat * .15 + b.observer * .15,
    legacy: b.habitat ? (1 + (b.habitat - 1) * .25) * 1.6 ** b.relay : 0 };
}
export function orbitalLegacySpent(state) {
  if (!state) return 0;
  return Q.sum(Object.entries(STRUCTURES).flatMap(([key, config]) => config.legacy.slice(0, state.structures[key]))
    .concat(state.project ? [state.project.legacy] : []));
}
export const orbitalIncome = state => state.bodies.earth.civilizations.reduce((sum, civ) => sum + civilizationRates(civ, orbitalRates(state)).legacy, 0);
export function orbitalMilestone(state) {
  if (state.structures.shipyard) return { name: '地月之间，家园相连', detail: 'VI 已完成。继续管理地表与家园；VII 行星际文明将在后续开放。', key: 'complete' };
  if (state.structures.outpost) return { name: '为远航供能', detail: '建造月面聚变堆与地月航行港，完成这段过渡。', key: 'lunar' };
  if (state.structures.habitat >= 2 && state.structures.relay) return { name: '月光成为下一处家园', detail: '让任一地表文明进入工艺时代，完成月面测绘与前哨建设。', key: 'expansion' };
  if (state.structures.habitat) return { name: '从观察，到支配', detail: '建设观测阵列与治理中继，平衡文明发展、纷争与贡纳。', key: 'stewardship' };
  return { name: '先让家园亮起来', detail: '展开太阳翼，再组装第一座环形居住舱。', key: 'home' };
}
export function getConstructionState(session, key) {
  const state = session.orbital, config = STRUCTURES[key];
  if (!config || !state || session.run.phase !== 'orbital' || !state.started) return 'locked';
  const level = state.structures[key];
  if (level >= config.legacy.length) return 'max';
  if (state.project) return 'busy';
  if (Object.entries(config.requires).some(([parent, rank]) => state.structures[parent] < rank)) return 'prerequisite';
  if (key === 'survey' && !state.bodies.earth.civilizations.some(civ => civilizationAge(civ) >= 3)) return 'civilization';
  if (config.energy[level] > orbitalRates(state).capacity) return 'capacity';
  if (Q.lt(session.permanent.legacy, config.legacy[level])) return 'legacy';
  if (Q.lt(state.energy, config.energy[level])) return 'energy';
  return 'ready';
}
function log(state, text) { state.log.push({ time: state.elapsed, text }); if (state.log.length > R.historyLimit) state.log.shift(); }
function award(session, amount) {
  if (Q.lte(amount, 0)) return;
  const p = session.permanent;
  session.orbital.legacyEarned = Q.add(session.orbital.legacyEarned, amount);
  p.totalLegacy = Q.add(p.totalLegacy, amount); p.legacy = Q.add(p.legacy, amount);
}
export function enterOrbital(session) {
  if (session.run.phase !== 'orbital' || !session.orbital || session.orbital.started) return false;
  session.orbital.started = true; return true;
}
export function constructOrbital(session, key) {
  if (getConstructionState(session, key) !== 'ready') return false;
  const state = session.orbital, config = STRUCTURES[key], rank = state.structures[key];
  state.project = { key, rank: rank + 1, remaining: config.seconds[rank], duration: config.seconds[rank], legacy: config.legacy[rank], energy: config.energy[rank] };
  session.permanent.legacy = Q.sub(session.permanent.legacy, config.legacy[rank]); state.energy = Q.sub(state.energy, config.energy[rank]);
  log(state, `开始建造${config.name} ${rank + 1} 级。`); return true;
}
export function findCivilization(state, bodyId, civId) { return state?.bodies[bodyId]?.civilizations.find(civ => civ.id === civId); }
export function getInterventionState(session, bodyId, civId, key) {
  const state = session.orbital, civ = findCivilization(state, bodyId, civId), action = INTERVENTIONS[key];
  if (!state?.started || session.run.phase !== 'orbital' || !state.structures.observer || !civ?.born || !action) return 'locked';
  if (civ.cooldowns[key] > 0) return 'cooldown';
  if (key === 'peace' && civ.unrest === 0 || key === 'uplift' && civ.progress >= R.maxProgress) return 'complete';
  return Q.gte(state.energy, action.energy) ? 'ready' : 'energy';
}
export function intervene(session, bodyId, civId, key) {
  if (getInterventionState(session, bodyId, civId, key) !== 'ready') return false;
  const state = session.orbital, civ = findCivilization(state, bodyId, civId), action = INTERVENTIONS[key];
  state.energy = Q.sub(state.energy, action.energy);
  const reward = applyIntervention(civ, key, orbitalRates(state)); award(session, reward);
  const name = BODIES[bodyId].civilizations.find(item => item.id === civId).name;
  log(state, `${action.name} → ${name}${reward ? ` · +${Q.format(reward)} Legacy` : ''}。`); return true;
}
export function setCivilizationPolicy(session, bodyId, civId, policy) {
  const state = session.orbital, civ = findCivilization(state, bodyId, civId);
  if (session.run.phase !== 'orbital' || !state?.started || !state.structures.observer || !civ?.born || !Object.hasOwn(POLICIES, policy) || civ.policy === policy) return false;
  civ.policy = policy; return true;
}
export function updateOrbital(session, dt, { paused = false, hidden = false } = {}) {
  const state = session.orbital;
  if (!state?.started || session.run.phase !== 'orbital' || paused || hidden || !Number.isFinite(dt) || dt <= 0) return false;
  dt = Math.min(.05, dt); state.elapsed += dt;
  const rates = orbitalRates(state);
  state.energy = Q.min(rates.capacity, Q.add(state.energy, rates.power * dt));
  let changed = false;
  if (state.project) {
    state.project.remaining = Math.max(0, state.project.remaining - dt);
    if (state.project.remaining < 1e-8) {
      const key = state.project.key; state.structures[key]++; state.project = null;
      log(state, `${STRUCTURES[key].name}已投入使用。`); changed = true;
      if (key === 'shipyard' && state.completionAt === null) { state.completionAt = state.elapsed; log(state, '地月航线已经贯通。VI 完成，下一站是更广阔的行星际空间。'); }
    }
  }
  for (const [key, body] of Object.entries(state.bodies)) {
    const result = advanceBody(body, BODIES[key], dt, state.elapsed, rates);
    state.legacyFraction += result.legacy;
    const whole = Math.floor(state.legacyFraction + 1e-10); state.legacyFraction = Math.max(0, state.legacyFraction - whole); award(session, whole);
    for (const text of result.events) { log(state, text); changed = true; }
    if (state.autoStabilize && state.structures.relay) for (const civ of body.civilizations) {
      if (civ.unrest >= 65 && Q.gte(state.energy, INTERVENTIONS.peace.energy + 100)) changed = intervene(session, key, civ.id, 'peace') || changed;
    }
  }
  return changed;
}
