import { Q } from './quantity.js';
import { createGame, updateGame } from './game.js';
import { updateAutomation, createAutomation, configureAutomation } from './automation.js';
import { SURFACE, UPGRADES, UPGRADE_COSTS, SAVE_VERSION, CHALLENGE } from './progression-config.js';
import { emptyTalents, talentLevel } from './talents.js';
import { getRunBonuses } from './progression-bonuses.js';
import { createBonusStack, stat } from './stats.js';

function uniqueId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

// Shared fresh-run factory for the game and headless balance simulations.
// Callers provide a validated loadout; this does not award or spend Legacy.
export function createCivilizationRun(permanent, challengeLevel = 0, extraBonuses = []) {
  const runId = uniqueId();
  const upgrades = { ...permanent.upgrades };
  const talents = { ...permanent.talents };
  const run = { runId, challengeLevel, battleNumber: 1, battleId: `${runId}:1`, phase: 'battle',
    processedBattleId: null, settled: false, earnedLegacy: 0, upgrades, talents, autoElapsed: 0, autoTurn: 'recruit', elapsed: 0 };
  if (extraBonuses.length) run.extraBonuses = createBonusStack(extraBonuses);
  const game = createConflict(run);
  return { run, game };
}

function createConflict(run, ages = { player: 1, enemy: 1 }) {
  return createGame({ mode: 'incremental', ages, bonuses: getRunBonuses(run) });
}

function startRun(session, challengeLevel = 0, extraBonuses = []) {
  Object.assign(session, createCivilizationRun(session.permanent, challengeLevel, extraBonuses));
}

export function createProgression() {
  const session = { version: SAVE_VERSION, permanent: { completedCycles: 0, legacy: 0, totalLegacy: 0,
    upgrades: { production: 0, warfare: 0 }, talents: emptyTalents(), talentGrants: [], automation: createAutomation() } };
  startRun(session);
  return session;
}

// Called by the simulation/controller, never by rendering or animation callbacks.
export function resolveBattle(session) {
  const { run, game, permanent } = session;
  if (run.phase !== 'battle' || game.status === 'playing' || run.processedBattleId === run.battleId) return false;
  run.processedBattleId = run.battleId;
  if (game.status !== 'won') run.phase = 'defeat';
  else if (game.ages.enemy !== SURFACE.finalEnemyAge) run.phase = 'victory';
  else {
    run.phase = 'destruction';
    if (!run.settled) {
      run.settled = true;
      run.earnedLegacy = stat(game, { kind: 'civilization' }, 'legacy');
      permanent.completedCycles++;
      permanent.legacy += run.earnedLegacy;
      permanent.totalLegacy += run.earnedLegacy;
    }
  }
  return true;
}

export function updateProgression(session, dt, { paused = false, hidden = false } = {}) {
  if (paused || hidden || !Number.isFinite(dt) || dt <= 0) return false;
  if (resolveBattle(session)) return true;
  if (session.run.phase !== 'battle') return false;
  dt = Math.min(dt, 0.05);
  updateAutomation(session, dt);
  updateGame(session.game, dt);
  session.run.elapsed += dt;
  return resolveBattle(session);
}

export function continueCivilization(session, battleId) {
  const { game, run } = session;
  if (run.phase !== 'victory' || battleId !== run.battleId || game.status !== 'won' || game.ages.enemy >= SURFACE.finalEnemyAge) return false;
  const nextAge = game.ages.enemy + 1;
  const next = createConflict(run, { player: game.ages.player, enemy: nextAge });
  next.experience.player = game.experience.player;
  next.gold.player = Q.add(game.gold.player, Q.sum(game.queues.player.map(order => order.paid)));
  next.turrets.player = game.turrets.player.map(turret => turret ? { ...turret,
    burstRemaining: 0, chargeRemaining: 0, chargeTargetId: null, burstTargetId: null, flash: 0 } : null);
  next.abilityCooldown = game.abilityCooldown;
  run.battleNumber++;
  run.battleId = `${run.runId}:${run.battleNumber}`;
  run.phase = 'battle';
  run.autoElapsed = 0;
  run.autoTurn = 'recruit';
  session.game = next;
  return true;
}

export function rebuildCivilization(session, runId) {
  if (session.run.runId !== runId || !['destruction', 'defeat'].includes(session.run.phase)) return false;
  startRun(session);
  return true;
}

// Only a completed civilization can unlock the next difficulty. The run ID
// makes stale/double clicks harmless, including after a reload or import.
export function getNextChallengeLevel(session) {
  const { run, permanent } = session;
  if (!permanent.talents.challenge) return null;
  if (run.phase === 'destruction' && run.settled && run.challengeLevel < CHALLENGE.maxLevel) return run.challengeLevel + 1;
  if (run.phase === 'defeat' && run.challengeLevel > 0) return run.challengeLevel;
  return null;
}
export function startChallenge(session, runId) {
  const level = getNextChallengeLevel(session);
  if (session.run.runId !== runId || level === null) return false;
  startRun(session, level);
  return true;
}

// The UI must confirm abandoning an unfinished civilization before calling this.
export function abandonCivilization(session, runId) {
  if (session.run.runId !== runId || !['battle', 'victory'].includes(session.run.phase)) return false;
  startRun(session, session.run.challengeLevel, session.run.extraBonuses ?? []);
  return true;
}

export function getUpgradeState(session, key) {
  if (!Object.hasOwn(UPGRADES, key)) return 'invalid';
  if (!session.permanent.completedCycles) return 'locked';
  if (!['destruction', 'defeat'].includes(session.run.phase)) return 'during-run';
  const level = session.permanent.upgrades[key];
  if (level >= UPGRADE_COSTS.length) return 'max';
  if (Object.entries(UPGRADES[key].requires).some(([parent, required]) => talentLevel(session, parent) < required)) return 'prerequisite';
  return session.permanent.legacy >= UPGRADE_COSTS[level] ? 'ready' : 'legacy';
}

export function purchaseUpgrade(session, key) {
  if (getUpgradeState(session, key) !== 'ready') return false;
  session.permanent.legacy -= UPGRADE_COSTS[session.permanent.upgrades[key]];
  session.permanent.upgrades[key]++;
  return true;
}

export function setAutomation(session, enabled, target) {
  return configureAutomation(session, { enabled, target });
}
