// Frozen costs and prerequisites, used only to validate historic purchases.
export const V17_ORBITAL_TALENTS = Object.freeze({
  protocol: {"costs":[0],"requires":{}},
  monitor: {"costs":[128],"requires":{"protocol":1}},
  patronage: {"costs":[256],"requires":{"monitor":1}},
  technology: {"costs":[512],"requires":{"patronage":1}},
  regression: {"costs":[1024],"requires":{"technology":1}},
  harvest: {"costs":[2048],"requires":{"technology":1}},
  recovery: {"costs":[256,1024,4096],"requires":{"protocol":1}},
  reseed: {"costs":[128,512,2048],"requires":{"protocol":1}},
  diversity: {"costs":[512,2048],"requires":{"reseed":1}},
  weaving: {"costs":[1024],"requires":{"monitor":1}},
  outpost: {"costs":[16384],"requires":{"recovery":2,"reseed":2},"cycles":2},
  lunarIndustry: {"costs":[8192,32768,131072,524288],"requires":{"outpost":1}},
  transit: {"costs":[262144],"requires":{"outpost":1,"harvest":1},"cycles":4},
});
const V21_KEYS=['airdrop','intel','ceasefire'];
const V20_KEYS=['tendency','nuclearResearch','chain','doomsday','bonds',...V21_KEYS];
// v18: the moon produced before the route existed and 地月航线 completed VI.
export function v18OrbitalTalents(current){
  const talents=Object.fromEntries(Object.entries(current).filter(([key])=>!['massDriver','shipyard','voyage',...V20_KEYS].includes(key))
    .map(([key,t])=>[key,{costs:t.costs,requires:t.requires,...(t.cycles?{cycles:t.cycles}:{})}]));
  talents.outpost={costs:[65536],requires:{recovery:2},cycles:2};
  talents.transit={costs:[4194304],requires:{outpost:1},cycles:4};
  talents.regression={costs:[1024],requires:{technology:1}};
  talents.harvest={costs:[2048],requires:{technology:1}};
  return Object.freeze(talents);
}
// v19: no cycle or war-bond talents; 知识封锁 and 轨道收割 hung under 技术馈赠.
export function v19OrbitalTalents(current){
  const talents=Object.fromEntries(Object.entries(current).filter(([key])=>!V20_KEYS.includes(key))
    .map(([key,t])=>[key,{costs:t.costs,requires:t.requires,...(t.cycles?{cycles:t.cycles}:{}),...(t.ring?{ring:t.ring}:{})}]));
  talents.regression={costs:[1024],requires:{technology:1}};
  talents.harvest={costs:[2048],requires:{technology:1}};
  return Object.freeze(talents);
}
// v20: no airdrop, intelligence or truce. Every surviving node kept its price.
export function v20OrbitalTalents(current){
  return Object.freeze(Object.fromEntries(Object.entries(current).filter(([key])=>!V21_KEYS.includes(key))
    .map(([key,t])=>[key,{costs:t.costs,requires:t.requires,...(t.cycles?{cycles:t.cycles}:{}),...(t.ring?{ring:t.ring}:{})}])));
}
