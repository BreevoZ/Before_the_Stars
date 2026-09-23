import { Q } from './quantity.js';
import { AGES } from './game-config.js';
// M1 covers only surface civilization. Later layers must not change this endpoint.
export const SURFACE = Object.freeze({
  finalEnemyAge: 5, legacyPerCycle: 1,
  enemyStartingGold: Object.freeze(Object.fromEntries(Object.entries(AGES).map(([id, age]) => [id, age.startingGold]))),
});
export const UPGRADES = Object.freeze({
  production: Object.freeze({ name: '生产档案', base: 1.5, description: '被动金币收入', requires: { spark: 1 } }),
  warfare: Object.freeze({ name: '战争档案', base: 1.25, description: '战斗经验', requires: { spark: 1 } }),
});
// Prices follow the era spine: each tier costs twice the previous one. Rewards
// must grow more slowly than prices, so payback time rises with every rank.
export const tierCosts = (tier, ranks = 1) => Object.freeze(Array.from({ length: ranks }, (_, rank) => 2 ** (tier + rank)));
export const UPGRADE_COSTS = tierCosts(1, 5);
export const AUTOMATION_INTERVAL = 0.25;
export const VICTORY_SUPPLIES = Object.freeze({ goldShare: 0.75, experienceShare: 0.5 });
// A reserve for the next conflict, never a forced evolution or Legacy award.
export function getVictorySupplies(game) {
  const next = AGES[game.ages.enemy + 1];
  if (game.mode !== 'incremental' || game.status !== 'won' || game.ages.enemy >= SURFACE.finalEnemyAge) return { gold: 0, experience: 0 };
  return { gold: Math.floor(next.startingGold * VICTORY_SUPPLIES.goldShare),
    experience: Q.floor(Q.mul(Q.max(0, Q.sub(next.experienceRequired, game.experience.player)), VICTORY_SUPPLIES.experienceShare)) };
}
export const AUTOMATION_TARGETS = Object.freeze(['front', 'ranged', 'heavy']);
// Level 0 is exactly the original surface campaign. Every ember multiplies the
// enemy's economy and body by the same factor; measured against a fully bought
// loadout, 1.12 keeps the next ember a real question instead of a wall.
export const CHALLENGE = Object.freeze({ maxLevel: 10, gold: 1.12, income: 1.12,
  experience: 1.12, health: 1.12, damage: 1.12, baseHealth: 1.12 });
// Ember scaling is part of a run's contract, like its reward rules. Runs and
// saves made before v11 keep the factors they started under.
export const HISTORICAL_CHALLENGE = Object.freeze({ gold: 1.35, income: 1.35,
  experience: 1.2, health: 1.25, damage: 1.25, baseHealth: 1.2 });
export function getChallengeModifiers(level = 0, rules = 11) {
  const table = rules < 11 ? HISTORICAL_CHALLENGE : CHALLENGE;
  return Object.fromEntries(Object.entries(table).filter(([key]) => key !== 'maxLevel')
    .map(([key, base]) => [key, Q.pow(base, level)]));
}
export const SAVE_VERSION = 23;
export const SAVE_INTERVAL = 10;
export function getBonuses(levels) {
  return { income: Q.pow(UPGRADES.production.base, levels.production), experience: Q.pow(UPGRADES.warfare.base, levels.warfare) };
}

export const AUTOMATION_MILESTONE = 2;
export const TALENT_LAYER_REQUIREMENT = 1;
export const UNIT_TALENT_COSTS = tierCosts(2, 5);
export const SPEEDS = Object.freeze([1, 2, 3]);
const EMBERS = Object.freeze(['初生之地', '纷争余烬', '铁旗时代', '烽火大陆', '裂土之争', '燃烧边境', '钢铁洪流', '长夜战线', '失序世界', '终焉回声', '最后壁垒']);
export function challengeName(level = 0) { return EMBERS[level] ?? '未知余烬'; }
export function automationUnlocked(permanent) { return permanent.completedCycles >= AUTOMATION_MILESTONE || permanent.automationRetained === true; }
export function availableSpeeds(permanent) { return SPEEDS.slice(0, permanent.talents.timeAcceleration ? 3 : permanent.talents.spark ? 2 : 1); }

// Surface economy v12. The settlement starts at 1, so the only multiplier that
// survives its rounding is a doubling: 遗产保存 doubles the reward while its
// price quadruples, and expedition depth doubles it again per ember. Depth stays
// the larger term (×32 by ember 5 against ×16 bought), and it has to be fought
// for. The opening is deliberate: clear once to buy 2× speed, clear again to
// double the reward, and the third clear opens the expedition.
export const LEGACY_ECONOMY = Object.freeze({ rules: 12,
  challengeBase: 2, conservationEffect: 2, conservationCosts: Object.freeze([1, 4, 16, 64]),
  // A first clear of an ember pays triple: the spike lands exactly when the
  // player pushes deeper, and repeating a cleared ember never triggers it.
  firstClearBonus: 3,
  // The machine can never out-earn playing: one run produces at most its own
  // settlement reward, so stalling a battle is bounded instead of infinite.
  // Production is worth buying: half a settlement at rank 0, twice it at max.
  // The cap still ties it to a finished run, so stalling stays bounded.
  machineCost: 32, machineShares: Object.freeze([0.5, 1, 1.5, 2]),
  capacityCosts: Object.freeze([128, 512, 2048]), efficiencyCosts: Object.freeze([64, 256, 1024]),
  // The protocol is a depth milestone: clear ember 5, then bank about five of
  // its runs. Deeper embers stay as headroom for later layers.
  fillSeconds: 240, bypasserCost: 10000, bypasserChallenge: 5 });
export const TALENT_PRICES = Object.freeze({
  // Run 1 buys 2× speed, run 2 doubles the reward, run 3 opens the expedition.
  spark: tierCosts(0), challenge: tierCosts(1),
  fireControl: tierCosts(3), campaign: tierCosts(4), extermination: tierCosts(6),
  logistics: tierCosts(1), formation: tierCosts(1),
  evolution: tierCosts(2), defense: tierCosts(2, 2), elite: tierCosts(8),
  supply: tierCosts(3, 3), salvage: tierCosts(4, 3),
  timeAcceleration: tierCosts(5), superSoldierPlan: tierCosts(8), superRanged: tierCosts(9),
  conservation: LEGACY_ECONOMY.conservationCosts, legacyMachine: Object.freeze([LEGACY_ECONOMY.machineCost]),
  legacyCapacity: LEGACY_ECONOMY.capacityCosts, legacyEfficiency: LEGACY_ECONOMY.efficiencyCosts,
  bypasser: Object.freeze([LEGACY_ECONOMY.bypasserCost]),
});
export const machineShare = talents => LEGACY_ECONOMY.machineShares[talents.legacyCapacity ?? 0] ?? 0;
export const machineFillSeconds = talents => LEGACY_ECONOMY.fillSeconds / 2 ** (talents.legacyEfficiency ?? 0);
