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
// v18: the moon produced before the route existed and 地月航线 completed VI.
export function v18OrbitalTalents(current){
  const talents=Object.fromEntries(Object.entries(current).filter(([key])=>!['massDriver','shipyard','voyage'].includes(key))
    .map(([key,t])=>[key,{costs:t.costs,requires:t.requires,...(t.cycles?{cycles:t.cycles}:{})}]));
  talents.outpost={costs:[65536],requires:{recovery:2},cycles:2};
  talents.transit={costs:[4194304],requires:{outpost:1},cycles:4};
  return Object.freeze(talents);
}
