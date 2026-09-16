// M1 covers only surface civilization. Later layers must not change this endpoint.
export const SURFACE = Object.freeze({
  finalEnemyAge: 5, legacyPerCycle: 1,
  enemyStartingGold: Object.freeze({ 1: 180, 2: 300, 3: 480, 4: 720, 5: 1080 }),
});
export const UPGRADES = Object.freeze({
  production: Object.freeze({ name: '生产档案', base: 1.5, description: '被动金币收入' }),
  warfare: Object.freeze({ name: '战争档案', base: 1.25, description: '战斗经验' }),
});
export const UPGRADE_COSTS = Object.freeze([1, 2, 4, 8, 16]);
export const AUTOMATION_INTERVAL = 0.25;
export const AUTOMATION_TARGETS = Object.freeze(['front', 'ranged', 'heavy']);
export const SAVE_VERSION = 1;
export const SAVE_INTERVAL = 10;
export function getBonuses(levels) {
  return { income: UPGRADES.production.base ** levels.production, experience: UPGRADES.warfare.base ** levels.warfare };
}
