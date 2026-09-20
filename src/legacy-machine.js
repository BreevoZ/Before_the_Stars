import { attributes } from './stats.js';
import { Q } from './quantity.js';
import { getLegacyReward } from './talents.js';
import { LEGACY_ECONOMY, machineShare, machineFillSeconds } from './progression-config.js';

export const createLegacyMachine = () => ({ progress: 0, produced: 0 });

// Preview for a loadout that has no battle yet, used by the star map.
export function getLegacyProduction(talents, challengeLevel = 0) {
  const unlocked = (talents.legacyMachine ?? 0) > 0;
  const share = machineShare(talents), seconds = machineFillSeconds(talents);
  const cap = unlocked ? Q.max(1, Q.floor(Q.mul(getLegacyReward(talents, challengeLevel), share))) : 0;
  return { unlocked, cap, share, seconds, perSecond: Q.div(cap, seconds), perMinute: Q.div(Q.mul(cap, 60), seconds) };
}

// The live rate reads the run's own settled attributes, minus the part of the
// reward this civilization has not earned yet: an ember deeper than the deepest
// one ever cleared, and the one-off first-arrival bonus. Diving into an ember
// you cannot beat therefore pays no more than your proven depth, and the run
// cap still bounds a stalled battle.
export function getRunProduction({ run, permanent, game }) {
  const stats = attributes(game, { kind: 'civilization' });
  const gap = Math.max(0, (run.challengeLevel ?? 0) - (permanent.deepestChallenge ?? 0));
  const unproven = LEGACY_ECONOMY.challengeBase ** gap * (run.firstClear ? LEGACY_ECONOMY.firstClearBonus : 1);
  const cap = stats.legacyMachine
    ? Q.max(1, Q.floor(Q.div(Q.mul(stats.legacy, stats.legacyMachineShare), unproven))) : 0;
  const seconds = stats.legacyFillSeconds;
  return { unlocked: stats.legacyMachine, cap, share: stats.legacyMachineShare, seconds,
    perSecond: Q.div(cap, seconds), perMinute: Q.div(Q.mul(cap, 60), seconds) };
}

// Called only by the active simulation. Production is credited the moment it is
// produced, so the balance ticks up during the battle instead of waiting for a
// settlement. Fractional progress survives saves, conflicts and rebuilds.
export function updateLegacyMachine(session, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || session.run.phase !== 'battle' || session.game.status !== 'playing') return 0;
  const production = getRunProduction(session);
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
  // Clamp the stored total, not just the step: at large magnitudes the
  // remaining-amount subtraction rounds, and the cap must still hold exactly.
  const reward = Q.min(whole, remaining);
  run.machineLegacy = Q.min(production.cap, Q.add(run.machineLegacy ?? 0, reward));
  machine.produced = Q.add(machine.produced, reward);
  permanent.totalLegacy = Q.add(permanent.totalLegacy, reward);
  permanent.legacy = Q.add(permanent.legacy, reward);
  return reward;
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
