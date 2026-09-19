import { Q } from '../src/quantity.js';
import { RULES } from '../src/game.js';
import { createProgression, createCivilizationRun, updateProgression, continueCivilization } from '../src/progression.js';
import { CHALLENGE, UPGRADES, automationUnlocked } from '../src/progression-config.js';
import { TALENT_TREE, meetsTalentRequirements } from '../src/talents.js';
import { createAutomation, validAutomation } from '../src/automation.js';
import { createBonusStack } from '../src/stats.js';

export const DEFAULT_MAX_SECONDS = 1800;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const jsonAmount = value => typeof value === 'number' ? value : Q.encode(value);
const round = value => Math.round(value * 1e6) / 1e6;

// A hypothetical purchased loadout, never a browser save or a grant of resources.
// Requiring dependencies prevents scans from accidentally using impossible builds.
export function normalizeRunOptions(options = {}) {
  if (!record(options) || Object.keys(options).some(key => !['talents', 'challengeLevel', 'automation', 'maxSeconds', 'bonuses', 'completedCycles'].includes(key))) {
    throw new TypeError('Expected { talents, challengeLevel, automation, maxSeconds, bonuses, completedCycles }; unknown option');
  }
  const { talents = {}, challengeLevel = 0, automation = {}, maxSeconds = DEFAULT_MAX_SECONDS, completedCycles = 0 } = options;
  if (!record(talents) || Object.keys(talents).some(key => !Object.hasOwn(TALENT_TREE, key))) throw new TypeError('Unknown talent ID');
  const levels = Object.fromEntries(Object.keys(TALENT_TREE).map(key => [key, Object.hasOwn(talents, key) ? talents[key] : 0]));
  for (const [key, config] of Object.entries(TALENT_TREE)) {
    if (!Number.isInteger(levels[key]) || levels[key] < 0 || levels[key] > config.costs.length) throw new RangeError(`Invalid talent level: ${key}`);
    if (levels[key] && !meetsTalentRequirements(levels, config)) {
      throw new RangeError(`Missing prerequisite for ${key}: ${JSON.stringify(config.requires)}`);
    }
  }
  if (!Number.isInteger(challengeLevel) || challengeLevel < 0 || challengeLevel > CHALLENGE.maxLevel) throw new RangeError(`challengeLevel must be 0–${CHALLENGE.maxLevel}`);
  if (challengeLevel && !levels.challenge) throw new RangeError('challengeLevel > 0 requires the challenge talent');
  if (!Number.isInteger(completedCycles) || completedCycles < challengeLevel || completedCycles > 1e12) throw new RangeError('Invalid completedCycles or challenge depth not yet earned');
  const defaults = createAutomation();
  if (!record(automation) || Object.keys(automation).some(key => key === 'unlocked' || !Object.hasOwn(defaults, key))) {
    throw new TypeError('Unknown automation setting; unlocked is derived from completedCycles');
  }
  const auto = { ...defaults, ...automation, unlocked: automationUnlocked({ completedCycles }) };
  auto.reserve = Q.of(auto.reserve);
  if (!validAutomation(auto, levels)) throw new RangeError('Invalid automation settings or missing automation talent');
  auto.weights = [...auto.weights];
  if (!Number.isFinite(maxSeconds) || maxSeconds < RULES.fixedStep || maxSeconds > 86400) {
    throw new RangeError('maxSeconds must be between one simulation frame and 86400 seconds');
  }
  if (options.bonuses !== undefined && !Array.isArray(options.bonuses)) throw new TypeError('bonuses must be an array');
  return { talents: levels, completedCycles, challengeLevel, automation: auto, maxSeconds, bonuses: createBonusStack(options.bonuses ?? []) };
}

/** Simulate one civilization using the actual fixed-step game and Autobuyer.
 * No wall clock, rendering, storage, debug gold, manual commands or offline time.
 * Durations are simulation seconds. A timeout earns no completion reward;
 * unlocked production may still earn Legacy during actual simulated battle.
 */
export function simulateRun(options = {}) {
  const config = normalizeRunOptions(options);
  const session = createProgression(), permanent = session.permanent;
  for (const [key, level] of Object.entries(config.talents)) {
    (Object.hasOwn(UPGRADES, key) ? permanent.upgrades : permanent.talents)[key] = level;
  }
  permanent.completedCycles = config.completedCycles;
  permanent.automation = config.automation;
  Object.assign(session, createCivilizationRun(permanent, config.challengeLevel, config.bonuses));
  const battles = [], traitActivations = {};
  let peakGold = session.game.gold.player, ticks = 0, battleStart = 0;
  let enemyStartAge = session.game.ages.enemy;
  const limit = Math.floor(config.maxSeconds / RULES.fixedStep + 1e-9);
  const recordBattle = outcome => {
    for (const [key, count] of Object.entries(session.game.traitActivations ?? {})) traitActivations[key] = (traitActivations[key] ?? 0) + count;
    battles.push({
    number: session.run.battleNumber, enemyStartAge, enemyEndAge: session.game.ages.enemy,
    playerEndAge: session.game.ages.player, outcome, duration: round((ticks - battleStart) * RULES.fixedStep),
  }); };
  while (ticks < limit && session.run.phase === 'battle') {
    updateProgression(session, RULES.fixedStep);
    ticks++;
    peakGold = Q.max(peakGold, session.game.gold.player);
    if (session.run.phase === 'battle') continue;
    recordBattle(session.game.status);
    if (session.run.phase !== 'victory') break;
    // Continuing a won conflict is the only simulated UI action. The normal
    // transition handles refunds, retained assets and the enemy's next age.
    if (ticks === limit) break;
    if (!continueCivilization(session, session.run.battleId)) throw new Error('Could not continue a won conflict');
    peakGold = Q.max(peakGold, session.game.gold.player);
    battleStart = ticks;
    enemyStartAge = session.game.ages.enemy;
  }
  if (session.run.phase === 'battle') recordBattle('timeout');
  const outcome = session.run.phase === 'destruction' ? 'won'
    : session.run.phase === 'defeat' ? session.game.status : 'timeout';
  return { outcome, traitActivations, duration: round(ticks * RULES.fixedStep), battles,
    peakGold: typeof peakGold === 'number' ? round(peakGold) : Q.encode(peakGold), totalExperience: typeof session.game.experience.player === 'number' ? session.game.experience.player : Q.encode(session.game.experience.player), legacy: jsonAmount(Q.add(session.run.earnedLegacy, permanent.legacyMachine.produced)), settlementLegacy: jsonAmount(session.run.earnedLegacy), producedLegacy: jsonAmount(permanent.legacyMachine.produced) };
}
