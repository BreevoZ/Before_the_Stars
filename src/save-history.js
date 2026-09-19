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
export const HISTORICAL_TALENTS = freeze({ 2: v2, 3: v3, 4: v4, 5: v5, 6: v5, 7: v5 });
export const HISTORICAL_UPGRADE_COSTS = Object.freeze([1, 2, 4, 8, 16]);
