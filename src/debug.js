import { orbitalLegacySpent, enterOrbital, purchaseOrbitalTalent, getOrbitalTalentState, startOrbitalWar, resolveOrbitalWar, updateOrbital } from './orbital-game.js';
import { ORBITAL_TALENTS, ORBITAL_RULES } from './orbital-config.js';
import { TALENTS, layerTalents } from './talents.js';
import { automationUnlocked, LEGACY_ECONOMY, TALENT_LAYER_REQUIREMENT } from './progression-config.js';
import { paidLegacy } from './legacy-ledger.js';
import { Q } from './quantity.js';
import { AGES, evolve, getEvolutionState } from './game.js';
import { SURFACE } from './progression-config.js';
import { createProgression, resolveBattle, purchaseTalent, rebuildCivilization, transitionCivilization } from './progression.js';

export const DEBUG_SPEEDS = Object.freeze([1, 5, 10, 20]);
export const DEBUG_GOLD = 10000;
export function getGameMode(search = '') {
  const mode = new URLSearchParams(search).get('mode');
  return mode === 'classic' || mode === 'debug' ? mode : 'incremental';
}

export function supplyDebugRun(session) {
  if (session.debug !== true || session.run.phase !== 'battle') return false;
  session.game.gold.player = Q.add(session.game.gold.player, DEBUG_GOLD);
  session.game.experience.player = Q.max(session.game.experience.player, AGES[SURFACE.finalEnemyAge].experienceRequired);
  return true;
}

export function createDebugProgression() {
  const session = createProgression();
  session.debug = true;
  session.debugSpeed = 10;
  supplyDebugRun(session);
  return session;
}

// Debug credits are separate from rewards and purchases, so setting the balance
// down to zero never erases earned currency, production or a settlement marker.
export function setDebugLegacy(session, value) {
  if (session.debug !== true) return false;
  let amount;
  try { amount = Q.of(value); } catch { return false; }
  if (!Q.valid(amount) || !Q.isInteger(amount) || Q.lt(amount, 0)) return false;
  const p = session.permanent, spent = Q.add(paidLegacy(p), orbitalLegacySpent(session.orbital));
  const adjustment = Q.sub(Q.add(amount, spent), p.totalLegacy);
  // Extremely different magnitudes may exceed the quantity format's precision.
  if (!Q.eq(Q.sub(Q.add(p.totalLegacy, adjustment), spent), amount)) return false;
  p.debugLegacyAdjustment = adjustment;
  p.legacy = amount;
  return true;
}

// Explicit debug commands still use the normal civilization settlement logic.
// They are unavailable to either production incremental or classic sessions.
export function runDebugCommand(session, command) {
  if (session.debug !== true) return false;
  if (command === 'legacy') {
    if (!session.permanent.completedCycles || !['destruction', 'defeat'].includes(session.run.phase)) return false;
    return setDebugLegacy(session, Q.add(session.permanent.legacy, 2 ** 21));
  }
  if (session.run.phase !== 'battle' || session.game.status !== 'playing') return false;
  const game = session.game;
  if (command === 'resources') return supplyDebugRun(session);
  if (!['victory', 'finale', 'defeat'].includes(command)) return false;
  if (command === 'finale') {
    const experience = Q.max(game.experience.enemy, AGES[SURFACE.finalEnemyAge].experienceRequired);
    const probe = { ...game, ages: { ...game.ages }, experience: { ...game.experience, enemy: experience } };
    for (; probe.ages.enemy < SURFACE.finalEnemyAge; probe.ages.enemy++) {
      if (getEvolutionState(probe, 'enemy') !== 'ready') return false;
    }
    game.experience.enemy = experience;
    // Bounded even if a test challenge prevents evolution at a later age.
    for (let age = game.ages.enemy; age < SURFACE.finalEnemyAge; age++) if (!evolve(game, 'enemy')) return false;
  }
  game.bases[command === 'defeat' ? 'player' : 'enemy'].hp = 0;
  game.status = Q.eq(game.bases.player.hp, 0) ? (Q.eq(game.bases.enemy.hp, 0) ? 'draw' : 'lost') : 'won';
  return resolveBattle(session);
}

// ── Stage skips (debug saves only) ──
// Both go through the production purchases: the prerequisites are bought or
// played out for real, only the waiting is skipped, so the save stays valid.
const BUDGET = 2 ** 36;
// 存续协议: finish this run as a civilization victory, record the expedition
// depth the protocol asks for, buy the unit layers up to 超级士兵计划, then sign.
export function debugProtocol(session) {
  if (session.debug !== true || session.run.phase === 'orbital') return false;
  if (session.run.phase === 'victory') transitionCivilization(session, 'continue', session.run.battleId);
  if (session.run.phase === 'defeat') rebuildCivilization(session, session.run.runId);
  if (session.run.phase === 'battle' && !runDebugCommand(session, 'finale')) return false;
  if (session.run.phase !== 'destruction') return false;
  const p = session.permanent, depth = LEGACY_ECONOMY.bypasserChallenge;
  p.completedCycles = Math.max(p.completedCycles, depth); p.deepestChallenge = Math.max(p.deepestChallenge ?? 0, depth);
  p.automation.unlocked = automationUnlocked(p);
  if (!setDebugLegacy(session, BUDGET)) return false;
  if (!p.talents.spark) purchaseTalent(session, 'spark');
  for (let layer = 1; layer <= 5; layer++)
    for (const key of layerTalents(layer)) { if (layerTalents(layer).filter(k => p.talents[k] > 0).length >= TALENT_LAYER_REQUIREMENT) break; purchaseTalent(session, key); }
  if (!p.talents.superSoldierPlan && !purchaseTalent(session, 'superSoldierPlan')) return false;
  // The protocol takes the whole wallet: sign with the floor, like a fresh arrival.
  if (!setDebugLegacy(session, TALENTS.bypasser.costs[0])) return false;
  return purchaseTalent(session, 'bypasser');
}
// Two civilizations fight to the final age and one wins: a real annihilation.
function annihilate(session) {
  const o = session.orbital, idle = o.civilizations.filter(c => c.alive && !c.warId);
  if (idle.length < 2 || !startOrbitalWar(session, idle[0].id, idle[1].id)) return false;
  const war = o.wars.find(w => w.id === o.selectedWar);
  for (const team of ['player', 'enemy']) { war.game.experience[team] = Q.max(war.game.experience[team], AGES[ORBITAL_RULES.finalAge].experienceRequired); while (war.game.ages[team] < ORBITAL_RULES.finalAge) evolve(war.game, team); }
  war.game.bases.enemy.hp = 0; war.game.status = 'won';
  return resolveOrbitalWar(session, war.id) && o.phase === 'winter';
}
const endWinter = session => { for (let i = 0; i < 20000 && session.orbital.phase === 'winter'; i++) updateOrbital(session, 1 / 20); };
// 远航协议: buy the whole road to it (星环, 地月航线, 月面, 七座船坞), living
// through as many annihilations as the gates ask for, and sign in a winter.
export function debugVoyage(session) {
  const o = session.orbital;
  if (session.debug !== true || session.run.phase !== 'orbital' || !o || o.talents.voyage) return false;
  if (!o.started) enterOrbital(session);
  if (!setDebugLegacy(session, BUDGET)) return false;
  const road = new Set(), add = key => { if (road.has(key)) return; road.add(key); Object.keys(ORBITAL_TALENTS[key].requires).forEach(add); };
  add('voyage'); add('recovery'); road.delete('voyage');
  for (let round = 0; round < 40; round++) {
    let bought = true;
    while (bought) { bought = false; for (const key of road) if (purchaseOrbitalTalent(session, key)) bought = true; }
    if (getOrbitalTalentState(session, 'voyage') === 'ready') return purchaseOrbitalTalent(session, 'voyage');
    if (o.phase === 'winter') endWinter(session);
    if (!annihilate(session)) { endWinter(session); continue; }
    setDebugLegacy(session, BUDGET);
  }
  return false;
}
