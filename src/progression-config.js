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
// A doubled base reward reaches exactly the next price tier. The archive and
// side branches use the same tiers as the unit-era spine.
export const tierCosts = (tier, ranks = 1) => Object.freeze(Array.from({ length: ranks }, (_, rank) => 2 ** (tier + rank)));
export const UPGRADE_COSTS = tierCosts(1, 5);
export const TALENT_PRICES = Object.freeze({
  spark: tierCosts(0), logistics: tierCosts(1), formation: tierCosts(1),
  evolution: tierCosts(2), defense: tierCosts(2, 2), elite: tierCosts(7),
  supply: tierCosts(2, 3), salvage: tierCosts(3, 3), challenge: tierCosts(2),
  timeAcceleration: tierCosts(4), superSoldierPlan: tierCosts(6), superRanged: tierCosts(7), bypasser: tierCosts(20),
});
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
// Prototype challenge balance; level 0 is exactly the original surface campaign.
export const CHALLENGE = Object.freeze({ maxLevel: 10, gold: 1.35, income: 1.35,
  experience: 1.2, health: 1.25, damage: 1.25, baseHealth: 1.2 });
export function getChallengeModifiers(level = 0) {
  return Object.fromEntries(Object.entries(CHALLENGE).filter(([key]) => key !== 'maxLevel')
    .map(([key, base]) => [key, Q.pow(base, level)]));
}
export const SAVE_VERSION = 11;
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

// Surface economy tuning: each rank doubles both its price and its effect.
export const LEGACY_ECONOMY = Object.freeze({ rules: 10, rewardRanks: 8,
  conservationCost: 2, continuityCost: 512, producerCost: 8,
  capacityRanks: 8, efficiencyRanks: 6, capacityCost: 16, efficiencyCost: 32, productionSeconds: 60 });
export const doublingCosts = (first, ranks) => Object.freeze(Array.from({ length: ranks }, (_, rank) => first * 2 ** rank));
