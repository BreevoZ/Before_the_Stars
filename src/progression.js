import { AGES, createGame, updateGame } from './game.js';
import { updateAutomation } from './automation.js';
import { SURFACE, UPGRADES, UPGRADE_COSTS, SAVE_VERSION, AUTOMATION_TARGETS, getBonuses } from './progression-config.js';

function uniqueId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function startRun(session) {
  const runId = uniqueId();
  const upgrades = { ...session.permanent.upgrades };
  session.run = { runId, battleNumber: 1, battleId: `${runId}:1`, phase: 'battle',
    processedBattleId: null, settled: false, earnedLegacy: 0, upgrades, autoElapsed: 0, elapsed: 0 };
  session.game = createGame({ mode: 'incremental', modifiers: getBonuses(upgrades) });
}

export function createProgression() {
  const session = { version: SAVE_VERSION, permanent: { completedCycles: 0, legacy: 0,
    upgrades: { production: 0, warfare: 0 }, automation: { unlocked: false, enabled: false, target: 'front' } } };
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
      run.earnedLegacy = SURFACE.legacyPerCycle;
      permanent.completedCycles++;
      permanent.legacy += run.earnedLegacy;
      // First unlock is free and opt-in; subsequent cycles preserve preferences.
      permanent.automation.unlocked = true;
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
  const next = createGame({ mode: 'incremental', modifiers: getBonuses(run.upgrades) });
  next.ages.player = game.ages.player;
  next.experience.player = game.experience.player;
  next.gold.player = game.gold.player + game.queues.player.reduce((sum, order) => sum + order.paid, 0);
  next.bases.player.hp = next.bases.player.maxHp = AGES[next.ages.player].baseHealth;
  next.turrets.player = game.turrets.player.map(turret => turret ? { ...turret,
    burstRemaining: 0, chargeRemaining: 0, chargeTargetId: null, burstTargetId: null, flash: 0 } : null);
  next.abilityCooldown = game.abilityCooldown;
  next.ages.enemy = nextAge;
  next.experience.enemy = AGES[nextAge].experienceRequired;
  next.gold.enemy = SURFACE.enemyStartingGold[nextAge];
  next.bases.enemy.hp = next.bases.enemy.maxHp = AGES[nextAge].baseHealth;
  run.battleNumber++;
  run.battleId = `${run.runId}:${run.battleNumber}`;
  run.phase = 'battle';
  run.autoElapsed = 0;
  session.game = next;
  return true;
}

export function rebuildCivilization(session, runId) {
  if (session.run.runId !== runId || !['destruction', 'defeat'].includes(session.run.phase)) return false;
  startRun(session);
  return true;
}

// The UI must confirm abandoning an unfinished civilization before calling this.
export function abandonCivilization(session, runId) {
  if (session.run.runId !== runId || !['battle', 'victory'].includes(session.run.phase)) return false;
  startRun(session);
  return true;
}

export function getUpgradeState(session, key) {
  if (!Object.hasOwn(UPGRADES, key)) return 'invalid';
  if (!['destruction', 'defeat'].includes(session.run.phase)) return 'during-run';
  const level = session.permanent.upgrades[key];
  if (level >= UPGRADE_COSTS.length) return 'max';
  return session.permanent.legacy >= UPGRADE_COSTS[level] ? 'ready' : 'legacy';
}

export function purchaseUpgrade(session, key) {
  if (getUpgradeState(session, key) !== 'ready') return false;
  session.permanent.legacy -= UPGRADE_COSTS[session.permanent.upgrades[key]];
  session.permanent.upgrades[key]++;
  return true;
}

export function setAutomation(session, enabled, target) {
  if (!session.permanent.automation.unlocked || typeof enabled !== 'boolean' || !AUTOMATION_TARGETS.includes(target)) return false;
  Object.assign(session.permanent.automation, { enabled, target });
  session.run.autoElapsed = 0;
  return true;
}
