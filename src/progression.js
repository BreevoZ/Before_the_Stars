import { createLegacyMachine, updateLegacyMachine } from './legacy-machine.js';
import { Q } from './quantity.js';
import { createGame, updateGame } from './game.js';
import { updateAutomation, createAutomation, configureAutomation } from './automation.js';
import { UPGRADES, UPGRADE_COSTS, SAVE_VERSION, automationUnlocked, availableSpeeds, getVictorySupplies, LEGACY_ECONOMY } from './progression-config.js';
import { emptyTalents, talentLevel } from './talents.js';
import { getRunBonuses } from './progression-bonuses.js';
import { createBonusStack, stat } from './stats.js';
import { PHASE, getTransition, getNextChallengeLevel, isBetweenRuns } from './progression-machine.js';
export { getNextChallengeLevel } from './progression-machine.js';

function uniqueId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

// Shared fresh-run factory for the game and headless balance simulations.
// Callers provide a validated loadout; this does not award or spend Legacy.
export function createCivilizationRun(permanent, challengeLevel = 0, extraBonuses = []) {
  const runId = uniqueId();
  const upgrades = { ...permanent.upgrades };
  const talents = { ...permanent.talents };
  const run = { runId, legacyRules: LEGACY_ECONOMY.rules, challengeLevel, battleNumber: 1, battleId: `${runId}:1`, phase: PHASE.BATTLE,
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
    legacyMachine: createLegacyMachine(), upgrades: { production: 0, warfare: 0 }, talents: emptyTalents(), talentGrants: [], settings: { speed: 1 }, automationRetained: false, automation: createAutomation() } };
  startRun(session);
  return session;
}

// Every meta event passes through the same state/token/guard table. Effects
// are synchronous simulation work; rendering and animations never dispatch rewards.
export function transitionCivilization(session, event, token) {
  const transition = getTransition(session, event, token);
  if (!transition) return false;
  effects[transition.effect](session);
  session.run.phase = transition.to;
  return true;
}

export function resolveBattle(session) {
  return transitionCivilization(session, 'resolve', session.run.battleId);
}

export function updateProgression(session, dt, { paused = false, hidden = false } = {}) {
  if (paused || hidden || !Number.isFinite(dt) || dt <= 0) return false;
  if (resolveBattle(session)) return true;
  if (session.run.phase !== PHASE.BATTLE) return false;
  dt = Math.min(dt, 0.05);
  updateLegacyMachine(session, dt);
  updateAutomation(session, dt);
  updateGame(session.game, dt);
  session.run.elapsed += dt;
  return resolveBattle(session);
}

function continueConflict(session) {
  const { game, run } = session;
  const supplies = getVictorySupplies(game);
  const next = createConflict(run, { player: game.ages.player, enemy: game.ages.enemy + 1 });
  next.experience.player = Q.add(game.experience.player, supplies.experience);
  next.gold.player = Q.sum([game.gold.player, supplies.gold, ...game.queues.player.map(order => order.paid)]);
  next.turrets.player = game.turrets.player.map(turret => turret ? { ...turret,
    burstRemaining: 0, chargeRemaining: 0, chargeTargetId: null, burstTargetId: null, flash: 0 } : null);
  next.abilityCooldown = game.abilityCooldown;
  run.battleNumber++;
  run.battleId = `${run.runId}:${run.battleNumber}`;
  run.autoElapsed = 0;
  run.autoTurn = 'recruit';
  session.game = next;
}

const effects = {
  finishBattle({ run }) { run.processedBattleId = run.battleId; },
  settle(session) {
    const { run, game, permanent } = session;
    const reward = stat(game, { kind: 'civilization' }, 'legacy');
    run.processedBattleId = run.battleId;
    run.settled = true;
    run.earnedLegacy = reward;
    permanent.completedCycles++;
    permanent.legacy = Q.add(permanent.legacy, reward);
    permanent.totalLegacy = Q.add(permanent.totalLegacy, reward);
    permanent.automation.unlocked = automationUnlocked(permanent);
  },
  continue: continueConflict,
  rebuild: session => startRun(session),
  challenge: session => startRun(session, getNextChallengeLevel(session)),
  abandon: session => startRun(session, session.run.challengeLevel, session.run.extraBonuses ?? []),
};

export const continueCivilization = (session, battleId) => transitionCivilization(session, 'continue', battleId);
export const rebuildCivilization = (session, runId) => transitionCivilization(session, 'rebuild', runId);
export const startChallenge = (session, runId) => transitionCivilization(session, 'challenge', runId);
// The controller confirms abandonment before dispatching this event.
export const abandonCivilization = (session, runId) => transitionCivilization(session, 'abandon', runId);

export function getUpgradeState(session, key) {
  if (!Object.hasOwn(UPGRADES, key)) return 'invalid';
  if (!session.permanent.completedCycles) return 'locked';
  if (!isBetweenRuns(session.run.phase)) return 'during-run';
  const level = session.permanent.upgrades[key];
  if (level >= UPGRADE_COSTS.length) return 'max';
  if (Object.entries(UPGRADES[key].requires).some(([parent, required]) => talentLevel(session, parent) < required)) return 'prerequisite';
  return Q.gte(session.permanent.legacy, UPGRADE_COSTS[level]) ? 'ready' : 'legacy';
}

export function purchaseUpgrade(session, key) {
  if (getUpgradeState(session, key) !== 'ready') return false;
  session.permanent.legacy = Q.sub(session.permanent.legacy, UPGRADE_COSTS[session.permanent.upgrades[key]]);
  session.permanent.upgrades[key]++;
  return true;
}

export function setAutomation(session, enabled, target) {
  return configureAutomation(session, { enabled, target });
}

export function setGameSpeed(session, speed) {
  if (session.debug || !availableSpeeds(session.permanent).includes(speed)) return false;
  session.permanent.settings.speed = speed;
  return true;
}
export function cycleGameSpeed(session) {
  const speeds = availableSpeeds(session.permanent), index = speeds.indexOf(session.permanent.settings.speed);
  return setGameSpeed(session, speeds[(index + 1) % speeds.length]);
}
