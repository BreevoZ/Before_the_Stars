import { attributes } from './stats.js';
import { Q } from './quantity.js';
import { LEGACY_ECONOMY } from './progression-config.js';

export const createLegacyMachine = () => ({ progress: 0, produced: 0 });
export function getLegacyProduction(talents, game) {
  if (game) {
    const stats = attributes(game, { kind: 'civilization' });
    const amount = stats.legacyMachine ? stats.legacyProduction : 0;
    return { unlocked: stats.legacyMachine, amount, seconds: stats.legacyProductionInterval, perMinute: Q.mul(amount, 60 / stats.legacyProductionInterval) };
  }
  const unlocked = talents.legacyMachine > 0;
  const amount = unlocked ? 2 ** (talents.legacyCapacity ?? 0) : 0;
  const seconds = LEGACY_ECONOMY.productionSeconds / 2 ** (talents.legacyEfficiency ?? 0);
  return { unlocked, amount, seconds, perMinute: amount * 60 / seconds };
}
// Called only by the active simulation. Carry fractional cycle progress across
// saves, conflicts and rebuilds; upgrades apply from the next run's snapshot.
export function updateLegacyMachine(session, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || session.run.phase !== 'battle' || session.game.status !== 'playing') return 0;
  const production = getLegacyProduction(session.run.talents, session.game);
  if (!production.unlocked) return 0;
  const machine = session.permanent.legacyMachine;
  machine.progress += Math.min(dt, .05) / production.seconds;
  const cycles = Math.floor(machine.progress + 1e-10);
  if (!cycles) return 0;
  machine.progress = Math.max(0, machine.progress - cycles);
  const reward = Q.mul(production.amount, cycles);
  machine.produced = Q.add(machine.produced, reward);
  session.permanent.totalLegacy = Q.add(session.permanent.totalLegacy, reward);
  session.permanent.legacy = Q.add(session.permanent.legacy, reward);
  return reward;
}

export function legacyMachineBonuses(talents) {
  return [
    ['legacyMachine', '遗产生产机', 'legacyMachine', 'override', Boolean(talents.legacyMachine)],
    ['legacyCapacity', '平行档案', 'legacyProduction', 'multiply', 2 ** (talents.legacyCapacity ?? 0)],
    ['legacyEfficiency', '回响加速', 'legacyProductionInterval', 'multiply', 2 ** -(talents.legacyEfficiency ?? 0)],
  ].map(([id, label, stat, type, value]) => ({ target: { stat, kind: 'civilization' }, type, value, source: { id, label, kind: 'doctrine' } }));
}
