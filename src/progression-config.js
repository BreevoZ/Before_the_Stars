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
export const SAVE_VERSION = 12;
export const SAVE_INTERVAL = 10;
export function getBonuses(levels) {
  return { income: Q.pow(UPGRADES.production.base, levels.production), experience: Q.pow(UPGRADES.warfare.base, levels.warfare) };
}

export const AUTOMATION_MILESTONE = 2;
export const TALENT_LAYER_REQUIREMENT = 1;
export const UNIT_TALENT_COSTS = tierCosts(1, 5);
export const SPEEDS = Object.freeze([1, 2, 3]);
const EMBERS = Object.freeze(['初生之地', '纷争余烬', '铁旗时代', '烽火大陆', '裂土之争', '燃烧边境', '钢铁洪流', '长夜战线', '失序世界', '终焉回声', '最后壁垒']);
export function challengeName(level = 0) { return EMBERS[level] ?? '未知余烬'; }
export function automationUnlocked(permanent) { return permanent.completedCycles >= AUTOMATION_MILESTONE || permanent.automationRetained === true; }
export function availableSpeeds(permanent) { return SPEEDS.slice(0, permanent.talents.timeAcceleration ? 3 : permanent.talents.spark ? 2 : 1); }

// Surface economy v11. Exponential growth comes from expedition depth, which
// has to be fought for; purchased multipliers only trim the curve. Every rank
// costs four times the previous one while granting half as much growth, so its
// payback time keeps rising and no rank is an automatic buy.
export const LEGACY_ECONOMY = Object.freeze({ rules: 11,
  challengeBase: 2, conservationEffect: 1.5, conservationCosts: Object.freeze([4, 16, 64]),
  // The machine can never out-earn playing: one run produces at most its own
  // settlement reward, so stalling a battle is bounded instead of infinite.
  machineCost: 16, machineShares: Object.freeze([0.25, 0.5, 0.75, 1]),
  capacityCosts: Object.freeze([64, 256, 1024]), efficiencyCosts: Object.freeze([32, 128, 512]),
  // The protocol is a depth milestone: clear ember 5, then bank about five of
  // its runs. Deeper embers stay as headroom for later layers.
  fillSeconds: 600, bypasserCost: 500, bypasserChallenge: 5 });
export const TALENT_PRICES = Object.freeze({
  spark: tierCosts(0), logistics: tierCosts(1), formation: tierCosts(1),
  evolution: tierCosts(2), defense: tierCosts(2, 2), elite: tierCosts(7),
  supply: tierCosts(2, 3), salvage: tierCosts(3, 3), challenge: tierCosts(2),
  timeAcceleration: tierCosts(4), superSoldierPlan: tierCosts(6), superRanged: tierCosts(7),
  conservation: LEGACY_ECONOMY.conservationCosts, legacyMachine: Object.freeze([LEGACY_ECONOMY.machineCost]),
  legacyCapacity: LEGACY_ECONOMY.capacityCosts, legacyEfficiency: LEGACY_ECONOMY.efficiencyCosts,
  bypasser: Object.freeze([LEGACY_ECONOMY.bypasserCost]),
});
export const machineShare = talents => LEGACY_ECONOMY.machineShares[talents.legacyCapacity ?? 0] ?? 0;
export const machineFillSeconds = talents => LEGACY_ECONOMY.fillSeconds / 2 ** (talents.legacyEfficiency ?? 0);
