// M1 covers only surface civilization. Later layers must not change this endpoint.
export const SURFACE = Object.freeze({
  finalEnemyAge: 5, legacyPerCycle: 1,
  enemyStartingGold: Object.freeze({ 1: 180, 2: 300, 3: 480, 4: 720, 5: 1080 }),
});
export const UPGRADES = Object.freeze({
  production: Object.freeze({ name: '生产档案', base: 1.5, description: '被动金币收入', requires: { autobuyer: 1 } }),
  warfare: Object.freeze({ name: '战争档案', base: 1.25, description: '战斗经验', requires: { autobuyer: 1 } }),
});
export const UPGRADE_COSTS = Object.freeze([1, 2, 4, 8, 16]);
export const AUTOMATION_INTERVAL = 0.25;
export const AUTOMATION_TARGETS = Object.freeze(['front', 'ranged', 'heavy']);
// Prototype challenge balance; level 0 is exactly the original surface campaign.
export const CHALLENGE = Object.freeze({ maxLevel: 10, gold: 1.35, income: 1.35,
  experience: 1.2, health: 1.25, damage: 1.25, baseHealth: 1.2 });
export function getChallengeModifiers(level = 0) {
  return Object.fromEntries(Object.entries(CHALLENGE).filter(([key]) => key !== 'maxLevel')
    .map(([key, base]) => [key, base ** level]));
}
export const SAVE_VERSION = 5;
export const SAVE_INTERVAL = 10;
export function getBonuses(levels) {
  return { income: UPGRADES.production.base ** levels.production, experience: UPGRADES.warfare.base ** levels.warfare };
}
