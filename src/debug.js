import { orbitalLegacySpent } from './orbital-game.js';
import { paidLegacy } from './legacy-ledger.js';
import { Q } from './quantity.js';
import { AGES, evolve } from './game.js';
import { SURFACE } from './progression-config.js';
import { createProgression, resolveBattle } from './progression.js';

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
    game.experience.enemy = Q.max(game.experience.enemy, AGES[SURFACE.finalEnemyAge].experienceRequired);
    while (game.ages.enemy < SURFACE.finalEnemyAge) evolve(game, 'enemy');
  }
  game.bases[command === 'defeat' ? 'player' : 'enemy'].hp = 0;
  game.status = Q.eq(game.bases.player.hp, 0) ? (Q.eq(game.bases.enemy.hp, 0) ? 'draw' : 'lost') : 'won';
  return resolveBattle(session);
}
