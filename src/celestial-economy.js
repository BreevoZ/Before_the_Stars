import { ORBITAL_RULES as R, SITES, CIVILIZATION_NAMES } from './orbital-config.js';
// Persisted PRNG: refresh cannot reroll civilizations or change ongoing wars.
export function nextRandom(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}
export function seedCivilizations(state) {
  const pool = [...SITES], count = Math.min(R.maxCivilizations, R.minCivilizations + state.talents.diversity + Math.floor(nextRandom(state) * 3));
  state.civilizations = [];
  for (let i=0;i<count;i++) {
    const site = pool.splice(Math.floor(nextRandom(state)*pool.length),1)[0];
    state.civilizations.push(createCivilization(state,site));
  }
}
export function createCivilization(state,site) {
  return { id:`c${state.cycle}-${++state.nextCivilization}`, site:site.id,
    name:site.name+CIVILIZATION_NAMES[Math.floor(nextRandom(state)*CIVILIZATION_NAMES.length)],
    alive:true,age:1,experience:0,gold:180,power:0,profile:Math.floor(nextRandom(state)*3),warId:null };
}
export function seedRefugee(state) {
  const free = SITES.filter(site=>!state.civilizations.some(c=>c.alive && c.site===site.id));
  if (!free.length) return null;
  // Replace the old ruins at that site, retaining the last outcome in the log.
  const site=free[Math.floor(nextRandom(state)*free.length)];
  state.civilizations=state.civilizations.filter(c=>c.site!==site.id);
  const civ=createCivilization(state,site);state.civilizations.push(civ);
  for(const key of ['selectedCivilization','selectedOpponent'])if(!state.civilizations.some(c=>c.id===state[key]))state[key]=civ.id;
  return civ;
}
export const orbitalYieldMultiplier = state => 2 ** (state.talents.recovery + state.talents.outpost);
export const rebirthDelay = state => R.winterSeconds * .75 ** state.talents.reseed;
export const refugeeDelay = state => R.refugeeSeconds * .75 ** state.talents.reseed;
export const civilizationValue = (state,civ,kind='harvest') => R[`${kind}Legacy`] * 2 ** (civ.age-1) * orbitalYieldMultiplier(state);

export const lunarLegacyRate = state => state.talents.outpost ? R.lunarBaseIncome * 2 ** (state.talents.recovery + state.talents.lunarIndustry) : 0;
