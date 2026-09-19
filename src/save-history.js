// Historical purchase schema, independent of the live talent tree.
const v4 = {
  autobuyer: {"costs": [1], "requires": {}},
  logistics: {"costs": [1], "requires": {"autobuyer": 1}},
  formation: {"costs": [1], "requires": {"autobuyer": 1}},
  evolution: {"costs": [2], "requires": {"formation": 1}},
  defense: {"costs": [2, 4], "requires": {"formation": 1}},
  elite: {"costs": [3], "requires": {"evolution": 1}},
  supply: {"costs": [1, 2, 4], "requires": {"production": 1}},
  salvage: {"costs": [2, 4, 8], "requires": {"warfare": 1}},
  conservation: {"costs": [2, 4, 8], "requires": {"autobuyer": 1}},
  continuity: {"costs": [6, 12], "requires": {"conservation": 2}},
};
const v3 = { ...v4, conservation: { ...v4.conservation, requires: {} } };
const v2 = Object.fromEntries(Object.entries(v3).filter(([key]) => !['autobuyer', 'logistics'].includes(key)).map(([key, config]) => [key, key === 'formation' ? { ...config, requires: {} } : config]));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const v5 = { ...v4, challenge: { costs: [2], requires: { conservation: 1 } } };
// Frozen v9 purchase inputs; retain exact old prices and era gates during migration.
const v9 = {
  spark: {"costs":[1],"requires":{},"branch":"root"},
  logistics: {"costs":[1],"requires":{"spark":1},"branch":"automation"},
  formation: {"costs":[1],"requires":{"spark":1},"branch":"automation"},
  evolution: {"costs":[2],"requires":{"formation":1},"branch":"automation"},
  defense: {"costs":[2,4],"requires":{"formation":1},"branch":"automation"},
  elite: {"costs":[3],"requires":{"superSoldierPlan":1},"branch":"automation"},
  supply: {"costs":[1,2,4],"requires":{"production":1},"branch":"growth"},
  salvage: {"costs":[2,4,8],"requires":{"warfare":1},"branch":"growth"},
  conservation: {"costs":[2,4,8],"requires":{"spark":1},"branch":"legacy"},
  challenge: {"costs":[2],"requires":{"conservation":1},"branch":"legacy"},
  continuity: {"costs":[6,12],"requires":{"conservation":2},"branch":"legacy"},
  openingStone: {"costs":[1],"requires":{"spark":1},"layer":1,"unit":"melee","branch":"units"},
  ricochet: {"costs":[1],"requires":{"spark":1},"layer":1,"unit":"archer","branch":"units"},
  devour: {"costs":[1],"requires":{"spark":1},"layer":1,"unit":"heavy","branch":"units"},
  shieldWall: {"costs":[2],"requires":{},"requiresLayer":1,"layer":2,"unit":"swordsman","branch":"units"},
  fireArrow: {"costs":[2],"requires":{},"requiresLayer":1,"layer":2,"unit":"crossbow","branch":"units"},
  javelin: {"costs":[2],"requires":{},"requiresLayer":1,"layer":2,"unit":"knight","branch":"units"},
  parry: {"costs":[4],"requires":{},"requiresLayer":2,"layer":3,"unit":"duelist","branch":"units"},
  volley: {"costs":[4],"requires":{},"requiresLayer":2,"layer":3,"unit":"musketeer","branch":"units"},
  canister: {"costs":[4],"requires":{},"requiresLayer":2,"layer":3,"unit":"cannoneer","branch":"units"},
  grenade: {"costs":[6],"requires":{},"requiresLayer":3,"layer":4,"unit":"commando","branch":"units"},
  suppression: {"costs":[6],"requires":{},"requiresLayer":3,"layer":4,"unit":"rifleman","branch":"units"},
  coaxial: {"costs":[6],"requires":{},"requiresLayer":3,"layer":4,"unit":"tank","branch":"units"},
  blink: {"costs":[10],"requires":{},"requiresLayer":4,"layer":5,"unit":"blade","branch":"units"},
  overload: {"costs":[10],"requires":{},"requiresLayer":4,"layer":5,"unit":"blaster","branch":"units"},
  forceField: {"costs":[10],"requires":{},"requiresLayer":4,"layer":5,"unit":"warMachine","branch":"units"},
  timeAcceleration: {"costs":[8],"requires":{"spark":1},"requiresLayer":3,"layer":4,"branch":"growth"},
  superSoldierPlan: {"costs":[15],"requires":{},"requiresLayer":5,"layer":6,"branch":"units"},
  superRanged: {"costs":[12],"requires":{"superSoldierPlan":1},"layer":7,"branch":"units"},
  bypasser: {"costs":[],"requires":{"superSoldierPlan":1},"layer":8,"branch":"legacy","placeholder":true},
};
const v10 = { ...v9,
  conservation: { ...v9.conservation, costs: [2,4,8,16,32,64,128,256] },
  continuity: { ...v9.continuity, costs: [6,12,24,48,96,192,384,768] },
  legacyMachine: { costs: [8], requires: { conservation: 2 }, requiresLayer: 3, branch: 'legacy' },
  legacyCapacity: { costs: [8,16,32,64,128,256,512,1024], requires: { legacyMachine: 1 }, branch: 'legacy' },
  legacyEfficiency: { costs: [8,16,32,64,128,256], requires: { legacyMachine: 1 }, branch: 'legacy' },
};
export const HISTORICAL_TALENTS = freeze({ 2: v2, 3: v3, 4: v4, 5: v5, 6: v5, 7: v5, 8: v5, 9: v9, 10: v10 });
export const HISTORICAL_UPGRADE_COSTS = Object.freeze([1, 2, 4, 8, 16]);
