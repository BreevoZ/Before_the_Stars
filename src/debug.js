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
  session.game.gold.player = Math.min(1e12, session.game.gold.player + DEBUG_GOLD);
  session.game.experience.player = Math.max(session.game.experience.player, AGES[SURFACE.finalEnemyAge].experienceRequired);
  return true;
}

export function createDebugProgression() {
  const session = createProgression();
  session.debug = true;
  session.debugSpeed = 10;
  supplyDebugRun(session);
  return session;
}

// Explicit debug commands still use the normal civilization settlement logic.
// They are unavailable to either production incremental or classic sessions.
export function runDebugCommand(session, command) {
  if (session.debug !== true || session.run.phase !== 'battle' || session.game.status !== 'playing') return false;
  const game = session.game;
  if (command === 'resources') return supplyDebugRun(session);
  if (!['victory', 'finale', 'defeat'].includes(command)) return false;
  if (command === 'finale') {
    game.experience.enemy = Math.max(game.experience.enemy, AGES[SURFACE.finalEnemyAge].experienceRequired);
    while (game.ages.enemy < SURFACE.finalEnemyAge) evolve(game, 'enemy');
  }
  game.bases[command === 'defeat' ? 'player' : 'enemy'].hp = 0;
  game.status = game.bases.player.hp === 0 ? (game.bases.enemy.hp === 0 ? 'draw' : 'lost') : 'won';
  return resolveBattle(session);
}
