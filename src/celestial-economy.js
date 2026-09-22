import { ORBITAL_RULES as R, POLICIES, INTERVENTIONS, CIVILIZATION_AGES } from './orbital-config.js';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function createBody(definition) {
  return { civilizations: definition.civilizations.map(({ id }) => ({ id, born: false, population: 0, progress: 0,
    influence: 25, unrest: 10, policy: 'balance', eventIndex: 0,
    cooldowns: Object.fromEntries(Object.keys(INTERVENTIONS).map(key => [key, 0])), signal: null })) };
}
export const civilizationAge = civ => civ.born ? Math.min(5, 1 + Math.floor((civ.progress + 1e-8) / R.ageProgress)) : 0;
export function civilizationRates(civ, modifiers) {
  const policy = POLICIES[civ.policy], war = civ.unrest >= 65;
  return { legacy: !civ.born ? 0 : modifiers.legacy * R.baseLegacy * civilizationAge(civ) * (civ.population / 80) *
    (.6 + civ.influence / 100) * policy.legacy * (war ? .4 : 1),
    growth: R.baseGrowth * modifiers.growth * policy.growth * (war ? .3 : 1), war };
}
export const tributeReward = (civ, modifiers) => Math.max(1, Math.floor(16 * civilizationAge(civ) * civ.population / 80 * modifiers.legacy));
// No scene/DOM/session access. A future planet provides different settlements,
// birth times and affinities while sharing these rules and intervention verbs.
export function advanceBody(body, definition, dt, elapsed, modifiers) {
  const events = []; let legacy = 0;
  body.civilizations.forEach((civ, index) => {
    const config = definition.civilizations[index];
    if (!civ.born && elapsed >= config.birth) {
      civ.born = true; civ.population = 20;
      events.push(`${config.name}的火光出现在废墟间。`);
    }
    for (const key of Object.keys(civ.cooldowns)) civ.cooldowns[key] = Math.max(0, civ.cooldowns[key] - dt);
    if (civ.signal) { civ.signal.remaining = Math.max(0, civ.signal.remaining - dt); if (!civ.signal.remaining) civ.signal = null; }
    if (!civ.born) return;
    const before = civilizationAge(civ), rates = civilizationRates(civ, modifiers), policy = POLICIES[civ.policy];
    legacy += rates.legacy * dt;
    civ.population = clamp(civ.population + rates.growth * config.growth * (1 - civ.population / R.maxPopulation) * dt, 12, R.maxPopulation);
    civ.progress = clamp(civ.progress + R.baseResearch * config.research * modifiers.growth * policy.growth * (rates.war ? .5 : 1) * dt, 0, R.maxProgress);
    civ.unrest = clamp(civ.unrest + (policy.unrest + config.unrest) * dt, 0, 100);
    civ.influence = clamp(civ.influence + policy.influence * dt, 10, 100);
    if (civilizationAge(civ) > before) events.push(`${config.name}进入${CIVILIZATION_AGES[civilizationAge(civ) - 1]}。`);
    if (elapsed >= config.birth + (civ.eventIndex + 1) * R.eventInterval) {
      const event = (civ.eventIndex + index) % 3; civ.eventIndex++;
      if (event === 0) { civ.population = Math.min(R.maxPopulation, civ.population + 6); civ.unrest = Math.max(0, civ.unrest - 8); events.push(`${config.name}开辟了新的贸易路线。`); }
      if (event === 1) { civ.population = Math.max(12, civ.population * .95); civ.unrest = Math.min(100, civ.unrest + 12); events.push(`${config.name}遭遇资源短缺，纷争上升。`); }
      if (event === 2) { civ.unrest = Math.min(100, civ.unrest + 18); events.push(`${config.name}与邻邦的边境冲突正在扩大。`); }
    }
  });
  return { legacy, events };
}
export function applyIntervention(civ, key, modifiers) {
  let reward = 0;
  if (key === 'uplift') { civ.progress = Math.min(R.maxProgress, civ.progress + 22); civ.influence = Math.min(100, civ.influence + 6); civ.unrest = Math.min(100, civ.unrest + 8); }
  if (key === 'peace') { civ.unrest = Math.max(0, civ.unrest - 35); civ.influence = Math.min(100, civ.influence + 8); }
  if (key === 'tribute') { reward = tributeReward(civ, modifiers); civ.unrest = Math.min(100, civ.unrest + 25); civ.influence = Math.max(10, civ.influence - 5); }
  civ.cooldowns[key] = INTERVENTIONS[key].cooldown;
  civ.signal = { kind: key, remaining: 2 };
  return reward;
}
