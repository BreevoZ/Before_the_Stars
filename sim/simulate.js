import { RULES } from '../src/game.js';
import { createProgression, createCivilizationRun, updateProgression, continueCivilization } from '../src/progression.js';
import { CHALLENGE, UPGRADES } from '../src/progression-config.js';
import { TALENT_TREE } from '../src/talents.js';
import { createAutomation, validAutomation } from '../src/automation.js';
import { createBonusStack } from '../src/stats.js';

export const DEFAULT_MAX_SECONDS = 1800;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const round = value => Math.round(value * 1e6) / 1e6;

// A hypothetical purchased loadout, never a browser save or a grant of resources.
// Requiring dependencies prevents scans from accidentally using impossible builds.
export function normalizeRunOptions(options = {}) {
  if (!record(options) || Object.keys(options).some(key => !['talents', 'challengeLevel', 'automation', 'maxSeconds', 'bonuses'].includes(key))) {
    throw new TypeError('Expected { talents, challengeLevel, automation, maxSeconds, bonuses }; unknown option');
  }
  const { talents = {}, challengeLevel = 0, automation = {}, maxSeconds = DEFAULT_MAX_SECONDS } = options;
  if (!record(talents) || Object.keys(talents).some(key => !Object.hasOwn(TALENT_TREE, key))) throw new TypeError('Unknown talent ID');
  const levels = Object.fromEntries(Object.keys(TALENT_TREE).map(key => [key, Object.hasOwn(talents, key) ? talents[key] : 0]));
  for (const [key, config] of Object.entries(TALENT_TREE)) {
    if (!Number.isInteger(levels[key]) || levels[key] < 0 || levels[key] > config.costs.length) throw new RangeError(`Invalid talent level: ${key}`);
    if (levels[key] && Object.entries(config.requires).some(([parent, level]) => levels[parent] < level)) {
      throw new RangeError(`Missing prerequisite for ${key}: ${JSON.stringify(config.requires)}`);
    }
  }
  if (!Number.isInteger(challengeLevel) || challengeLevel < 0 || challengeLevel > CHALLENGE.maxLevel) throw new RangeError(`challengeLevel must be 0–${CHALLENGE.maxLevel}`);
  if (challengeLevel && !levels.challenge) throw new RangeError('challengeLevel > 0 requires the challenge talent');
  const defaults = createAutomation();
  if (!record(automation) || Object.keys(automation).some(key => key === 'unlocked' || !Object.hasOwn(defaults, key))) {
    throw new TypeError('Unknown automation setting; unlocked is derived from talents.autobuyer');
  }
  const auto = { ...defaults, ...automation, unlocked: levels.autobuyer > 0 };
  if (!validAutomation(auto, levels)) throw new RangeError('Invalid automation settings or missing automation talent');
  auto.weights = [...auto.weights];
  if (!Number.isFinite(maxSeconds) || maxSeconds < RULES.fixedStep || maxSeconds > 86400) {
    throw new RangeError('maxSeconds must be between one simulation frame and 86400 seconds');
  }
  if (options.bonuses !== undefined && !Array.isArray(options.bonuses)) throw new TypeError('bonuses must be an array');
  return { talents: levels, challengeLevel, automation: auto, maxSeconds, bonuses: createBonusStack(options.bonuses ?? []) };
}

/** Simulate one civilization using the actual fixed-step game and Autobuyer.
 * No wall clock, rendering, storage, debug gold, manual commands or offline time.
 * Durations are simulation seconds. A timeout earns no Legacy.
 */
export function simulateRun(options = {}) {
  const config = normalizeRunOptions(options);
  const session = createProgression(), permanent = session.permanent;
  for (const [key, level] of Object.entries(config.talents)) {
    (Object.hasOwn(UPGRADES, key) ? permanent.upgrades : permanent.talents)[key] = level;
  }
  permanent.automation = config.automation;
  Object.assign(session, createCivilizationRun(permanent, config.challengeLevel, config.bonuses));
  const battles = [];
  let peakGold = session.game.gold.player, ticks = 0, battleStart = 0;
  let enemyStartAge = session.game.ages.enemy;
  const limit = Math.floor(config.maxSeconds / RULES.fixedStep + 1e-9);
  const recordBattle = outcome => battles.push({
    number: session.run.battleNumber, enemyStartAge, enemyEndAge: session.game.ages.enemy,
    playerEndAge: session.game.ages.player, outcome, duration: round((ticks - battleStart) * RULES.fixedStep),
  });
  while (ticks < limit && session.run.phase === 'battle') {
    updateProgression(session, RULES.fixedStep);
    ticks++;
    peakGold = Math.max(peakGold, session.game.gold.player);
    if (session.run.phase === 'battle') continue;
    recordBattle(session.game.status);
    if (session.run.phase !== 'victory') break;
    // Continuing a won conflict is the only simulated UI action. The normal
    // transition handles refunds, retained assets and the enemy's next age.
    if (ticks === limit) break;
    if (!continueCivilization(session, session.run.battleId)) throw new Error('Could not continue a won conflict');
    peakGold = Math.max(peakGold, session.game.gold.player);
    battleStart = ticks;
    enemyStartAge = session.game.ages.enemy;
  }
  if (session.run.phase === 'battle') recordBattle('timeout');
  const outcome = session.run.phase === 'destruction' ? 'won'
    : session.run.phase === 'defeat' ? session.game.status : 'timeout';
  return { outcome, duration: round(ticks * RULES.fixedStep), battles,
    peakGold: round(peakGold), totalExperience: session.game.experience.player, legacy: session.run.earnedLegacy };
}
