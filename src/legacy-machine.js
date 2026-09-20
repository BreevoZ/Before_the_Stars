import { attributes } from './stats.js';
import { Q } from './quantity.js';
import { getLegacyReward } from './talents.js';
import { LEGACY_ECONOMY, machineShare, machineFillSeconds } from './progression-config.js';

export const createLegacyMachine = () => ({ progress: 0, produced: 0 });

// Production is a share of the run's own settlement reward, filled linearly.
// The cap is what keeps a stalled battle from out-earning a finished one.
export function getLegacyProduction(talents, game, challengeLevel = 0) {
  const stats = game ? attributes(game, { kind: 'civilization' }) : null;
  const unlocked = stats ? stats.legacyMachine : (talents.legacyMachine ?? 0) > 0;
  const share = stats ? stats.legacyMachineShare : machineShare(talents);
  const seconds = stats ? stats.legacyFillSeconds : machineFillSeconds(talents);
  const reward = stats ? stats.legacy : getLegacyReward(talents, challengeLevel);
  // A share of the settlement, but never nothing: the first ranks of the
  // campaign still see the machine tick while their rewards are tiny.
  const cap = unlocked ? Q.max(1, Q.floor(Q.mul(reward, share))) : 0;
  return { unlocked, cap, share, seconds, perMinute: Q.div(Q.mul(cap, 60), seconds) };
}

// Called only by the active simulation. Production accrues into the run and is
// paid out only when that civilization reaches its finale: an abandoned or lost
// expedition banks nothing, so diving into an ember you cannot clear earns
// nothing either. Fractional progress still survives saves and conflicts.
export function updateLegacyMachine(session, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || session.run.phase !== 'battle' || session.game.status !== 'playing') return 0;
  const production = getLegacyProduction(session.run.talents, session.game);
  if (!production.unlocked || Q.lte(production.cap, 0)) return 0;
  const { run, permanent } = session;
  const remaining = Q.sub(production.cap, run.machineLegacy ?? 0);
  if (Q.lte(remaining, 0)) return 0;
  const machine = permanent.legacyMachine;
  // Accumulate as a quantity: a deep expedition can fill more than one Legacy
  // per frame, and the carried remainder is always below one.
  const filled = Q.add(machine.progress + 1e-10, Q.mul(Q.div(production.cap, production.seconds), Math.min(dt, .05)));
  const whole = Q.floor(filled);
  machine.progress = Math.max(0, Q.toNumber(Q.sub(filled, whole)) - 1e-10);
  if (Q.lte(whole, 0)) return 0;
  const reward = Q.min(whole, remaining);
  run.machineLegacy = Q.add(run.machineLegacy ?? 0, reward);
  return reward;
}

// Paid once, by the settlement transition that also pays the finale reward.
export function bankLegacyProduction({ run, permanent }) {
  const pending = run.machineLegacy ?? 0;
  if (Q.lte(pending, 0)) return 0;
  permanent.legacyMachine.produced = Q.add(permanent.legacyMachine.produced, pending);
  return pending;
}

export function legacyMachineBonuses(talents) {
  return [
    ['legacyMachine', '遗产生产机', 'legacyMachine', 'override', (talents.legacyMachine ?? 0) > 0],
    ['legacyCapacity', '平行档案', 'legacyMachineShare', 'override', machineShare(talents)],
    ['legacyEfficiency', '回响加速', 'legacyFillSeconds', 'multiply', 2 ** -(talents.legacyEfficiency ?? 0)],
  ].map(([id, label, stat, type, value]) => ({ target: { stat, kind: 'civilization' }, type, value, source: { id, label, kind: 'doctrine' } }));
}

// Retired rules-10 production, kept so old saves still rebuild their stack.
export function legacyProductionBonuses(talents) {
  return [
    ['legacyMachine', '遗产生产机', 'legacyMachine', 'override', Boolean(talents.legacyMachine)],
    ['legacyCapacity', '平行档案', 'legacyProduction', 'multiply', 2 ** (talents.legacyCapacity ?? 0)],
    ['legacyEfficiency', '回响加速', 'legacyProductionInterval', 'multiply', 2 ** -(talents.legacyEfficiency ?? 0)],
  ].map(([id, label, stat, type, value]) => ({ target: { stat, kind: 'civilization' }, type, value, source: { id, label, kind: 'doctrine' } }));
}

export const MACHINE_SHARES = LEGACY_ECONOMY.machineShares;
