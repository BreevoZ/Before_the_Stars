import { ORBITAL_RULES as R, SITES, CIVILIZATION_NAMES } from './orbital-config.js';
import { AGES } from './game-config.js';
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
  // 加速萌芽 starts each seed in a later age, with that age's gold and experience.
  const age=1+(state.talents.quickening??0);
  const civ={ id:`c${state.cycle}-${++state.nextCivilization}`, site:site.id,
    name:site.name+CIVILIZATION_NAMES[Math.floor(nextRandom(state)*CIVILIZATION_NAMES.length)],
    alive:true,age,experience:AGES[age].experienceRequired,gold:AGES[age].startingGold,power:0,airdrops:0,doctrine:0,superSoldiers:0,profile:Math.floor(nextRandom(state)*3),warId:null,
    // Drawn only once the talent exists, so older random sequences are unchanged.
    tendency:state.talents.tendency?1+Math.floor(nextRandom(state)*3):0 };
  // 定向播种 overrides the draw (the draw still happens, so the sequence is stable).
  if(civ.tendency&&state.talents.directed&&state.seedTendency)civ.tendency=state.seedTendency;
  return civ;
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

// The ring multiplies what comes from the surface, not the moon: war and
// annihilation stay the heart of VI, the moon is its supply line.
export const lunarLegacyRate = state => state.talents.outpost
  ? R.lunarBaseIncome * 2 ** (state.talents.lunarIndustry + (state.talents.massDriver ?? 0)) : 0;
// A cycle begins when the previous winter ends (or when VI opens).
export const cycleStartedAt = state => state.lastCatastropheAt === null ? 0 : state.lastCatastropheAt + state.winterDuration;
export function doomsdayMultiplier(state) {
  if (!state.talents.doomsday) return 1;
  const duration = Math.max(0, state.elapsed - cycleStartedAt(state));
  return 1 + Math.max(0, Math.min(1, (R.doomsdaySeconds - duration) / R.doomsdaySeconds));
}
// 轮回记忆: every past annihilation permanently raises war and bond Legacy.
export const chronicleMultiplier = state => 1 + R.chronicleStep * (state.talents.chronicle ?? 0) * state.nuclearCycles;
export const nuclearMultiplier = state => 2 ** (state.talents.nuclearResearch ?? 0) * doomsdayMultiplier(state);
export function bondRate(state, war) {
  if (!state.talents.bonds) return 0;
  const lower = Math.min(war.game.ages.player, war.game.ages.enemy);
  return R.bondRate * 2 ** (state.talents.bonds - 1) * 2 ** (lower - 1) * orbitalYieldMultiplier(state);
}
