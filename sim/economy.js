import { pathToFileURL } from 'node:url';
import { TALENT_TREE, TALENTS, emptyTalents, getLegacyReward, meetsTalentRequirements } from '../src/talents.js';
import { LEGACY_ECONOMY as ECONOMY, CHALLENGE, UPGRADES, UPGRADE_COSTS } from '../src/progression-config.js';
import { simulateRun } from './simulate.js';

// Purchase order of a reasonable player: automation first because it is cheap
// and runs the army, then the unit spine that makes deeper embers survivable,
// then the reward multipliers and the producer.
const PRIORITY = ['spark', 'logistics', 'formation', 'evolution', 'defense',
  'conservation', 'challenge', 'production', 'warfare',
  'openingStone', 'ricochet', 'devour', 'shieldWall', 'fireArrow', 'javelin', 'parry', 'volley', 'canister',
  'legacyMachine', 'legacyEfficiency', 'legacyCapacity',
  'grenade', 'suppression', 'coaxial', 'blink', 'overload', 'forceField',
  'superSoldierPlan', 'elite', 'superRanged', 'timeAcceleration', 'supply', 'salvage'];

const priceOf = (key, level) => (Object.hasOwn(UPGRADES, key) ? UPGRADE_COSTS : TALENT_TREE[key].costs)[level];
const ranksOf = key => (Object.hasOwn(UPGRADES, key) ? UPGRADE_COSTS : TALENT_TREE[key].costs).length;

// Before 技术托管/防御工程 the Autobuyer cannot evolve or build, so those runs
// are played by hand. They are modelled as a manual win of MANUAL_SECONDS
// rather than simulated, since the simulator has no manual commands.
export const MANUAL_SECONDS = 300;
const playsItself = levels => levels.evolution > 0 && levels.defense > 0;
function automationFor(levels) {
  return { enabled: true, recruitEnabled: Boolean(levels.logistics), queueLimit: levels.logistics ? 2 : 5,
    mode: levels.formation ? 'balanced' : 'single', weights: [2, 2, 1],
    evolve: Boolean(levels.evolution), defense: Boolean(levels.defense),
    maxTurrets: levels.defense ? 2 : 1, expand: Boolean(levels.defense), replace: levels.defense > 1,
    elite: Boolean(levels.elite), eliteLimit: 1 };
}

// Spend everything affordable, cheapest priority first; never buy the finale
// here, since reaching it is what the report measures.
function spend(levels, wallet, log) {
  for (let bought = true; bought;) {
    bought = false;
    for (const key of PRIORITY) {
      const level = levels[key] ?? 0;
      if (level >= ranksOf(key)) continue;
      if (!meetsTalentRequirements(levels, TALENT_TREE[key])) continue;
      const price = priceOf(key, level);
      if (price > wallet) continue;
      wallet -= price; levels[key] = level + 1; bought = true;
      log.push({ key, rank: level + 1, price });
    }
  }
  return wallet;
}

/** Play the surface economy end to end with real battles.
 * Depth rises after a win and falls back after a loss, exactly like a player
 * probing the next ember. Returns the full run-by-run history. */
export function simulateEconomy({ maxRuns = 60, maxSeconds = 1800, verbose = false } = {}) {
  const levels = { ...emptyTalents(), production: 0, warfare: 0 };
  const history = [];
  let wallet = 0, total = 0, seconds = 0, depth = 0, completedCycles = 0, deepest = 0, launchRun = null;
  // A player retries a failed ember only after buying something new.
  let blockedDepth = Infinity, boughtSinceFailure = true;
  for (let run = 1; run <= maxRuns; run++) {
    if (depth >= blockedDepth && !boughtSinceFailure) depth = Math.max(0, blockedDepth - 1);
    const level = levels.challenge ? Math.min(depth, CHALLENGE.maxLevel, completedCycles) : 0;
    const result = playsItself(levels)
      ? simulateRun({ talents: levels, challengeLevel: level, completedCycles, automation: automationFor(levels), maxSeconds })
      : { outcome: 'won', duration: MANUAL_SECONDS, legacy: getLegacyReward(levels, level), settlementLegacy: getLegacyReward(levels, level), producedLegacy: 0 };
    const earned = Number(result.legacy);
    seconds += result.duration;
    if (result.outcome === 'won') {
      completedCycles++; deepest = Math.max(deepest, level); depth = level + 1;
      blockedDepth = Math.max(blockedDepth === Infinity ? 0 : blockedDepth, level + 1);
    }
    else { blockedDepth = Math.min(blockedDepth, level); boughtSinceFailure = false; depth = Math.max(0, level - 1); }
    wallet += earned; total += earned;
    const purchases = [];
    wallet = spend(levels, wallet, purchases);
    // Something new was bought, so the ember that stopped the run is worth one
    // more attempt; never leap past the deepest ember already cleared.
    if (purchases.length) { boughtSinceFailure = true; depth = Math.max(depth, Math.min(blockedDepth, deepest + 1, CHALLENGE.maxLevel)); }
    const canLaunch = deepest >= ECONOMY.bypasserChallenge && wallet >= TALENTS.bypasser.costs[0];
    history.push({ run, depth: level, outcome: result.outcome, duration: result.duration, earned,
      settlement: Number(result.settlementLegacy), produced: Number(result.producedLegacy),
      wallet, total, purchases });
    if (verbose) {
      console.error(`run ${run} ember ${level} ${result.outcome} ${Math.round(result.duration)}s ` +
        `+${earned} → ${wallet} ${purchases.map(p => `${p.key}${p.rank}`).join(' ')}`);
    }
    if (canLaunch) { launchRun = run; break; }
  }
  const owned = Object.entries(levels).filter(([, level]) => level > 0).length;
  return { launchRun, runs: history.length, simulationHours: seconds / 3600, deepest, total,
    ownedTalents: owned, levels, history };
}

// Static audit: no rank of a reward talent may repay as fast as the one before.
export function paybackReport(depth = ECONOMY.bypasserChallenge) {
  const ranks = TALENTS.conservation.costs.map((cost, rank) => {
    const gain = getLegacyReward({ ...emptyTalents(), conservation: rank + 1 }, depth)
      - getLegacyReward({ ...emptyTalents(), conservation: rank }, depth);
    return { rank: rank + 1, cost, gain, paybackRuns: cost / gain };
  });
  return { depth, conservation: ranks, deepestReward: getLegacyReward({ ...emptyTalents(), conservation: ranks.length }, depth),
    bypasserCost: TALENTS.bypasser.costs[0], bypasserChallenge: ECONOMY.bypasserChallenge };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runs = Number(process.argv[2] ?? 60);
  const report = simulateEconomy({ maxRuns: runs, verbose: true });
  console.log(JSON.stringify({ payback: paybackReport(), launchRun: report.launchRun, runs: report.runs,
    simulationHours: Math.round(report.simulationHours * 100) / 100, deepest: report.deepest,
    total: report.total, ownedTalents: report.ownedTalents,
    history: report.history.map(({ run, depth, outcome, duration, earned, wallet }) =>
      ({ run, depth, outcome, duration: Math.round(duration), earned, wallet })) }, null, 2));
}
