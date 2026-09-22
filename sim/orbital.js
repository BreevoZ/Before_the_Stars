import { createOrbitalState, enterOrbital, constructOrbital, updateOrbital, intervene, setCivilizationPolicy } from '../src/orbital-game.js';
import { Q } from '../src/quantity.js';
import { POLICIES } from '../src/orbital-config.js';

// The same fixed-step simulation as the browser; no grants, instant projects or
// offline clocks. The reference starts with an empty post-launch Legacy wallet.
export function simulateOrbital({ legacy = 0, policy = 'balance', active = true, maxSeconds = 3600 } = {}) {
  legacy = Q.of(legacy);
  if (Q.lt(legacy, 0) || !Q.isInteger(legacy) || !Object.hasOwn(POLICIES, policy) || typeof active !== 'boolean' || !Number.isFinite(maxSeconds) || maxSeconds < 0 || maxSeconds > 86400) throw new Error('Invalid orbital simulation options');
  const session = { run: { phase: 'orbital' }, permanent: { legacy: Q.of(legacy), totalLegacy: Q.of(legacy) }, orbital: createOrbitalState() };
  enterOrbital(session);
  const plan = ['solar','habitat','observer','battery','solar','habitat','relay','solar','battery','relay','habitat','survey','outpost','reactor','shipyard'];
  let next = 0; const builds = [];
  while (!session.orbital.completionAt && session.orbital.elapsed < maxSeconds) {
    const o = session.orbital;
    if (next < plan.length && constructOrbital(session, plan[next])) { builds.push({ key: plan[next++], at: Math.round(o.elapsed) }); }
    if (active && o.structures.observer) for (const c of o.bodies.earth.civilizations) {
      setCivilizationPolicy(session, 'earth', c.id, policy);
      if (c.unrest >= 50 && Q.gt(o.energy, 150)) intervene(session, 'earth', c.id, 'peace');
      if (!o.structures.survey && c.id === 'ridge' && c.progress < 160 && Q.gt(o.energy, 300)) intervene(session, 'earth', c.id, 'uplift');
    }
    updateOrbital(session, 1 / 30);
  }
  return { completed: Boolean(session.orbital.completionAt), seconds: Math.round(session.orbital.elapsed),
    legacyEarned: Q.encode(session.orbital.legacyEarned), energy: Q.encode(session.orbital.energy), builds, session };
}
