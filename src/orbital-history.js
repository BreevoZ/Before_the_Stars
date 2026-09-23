import { Q } from './quantity.js';
// VI is a short, serial construction arc. VII can supply other bodies to the
// same population / unrest / influence simulation without copying the economy.
export const ORBITAL_RULES = Object.freeze({ version: 1, startingEnergy: 120, basePower: 2,
  baseStorage: 400, storagePerBattery: 600, powerPerSolar: 3, powerPerReactor: 8,
  ageProgress: 80, maxProgress: 320, eventInterval: 150, maxPopulation: 240,
  baseLegacy: .75, baseResearch: .18, baseGrowth: .16, historyLimit: 12 });
export const BODIES = Object.freeze({
  earth: { name: '地球', subtitle: '废墟之上，文明再次萌芽', color: '#93b2a1', civilizations: [
    { id: 'delta', name: '河口聚落', x: .39, y: .59, birth: 8, growth: 1.15, research: .95, unrest: .005, color: '#a7c8b8' },
    { id: 'ridge', name: '山脊联盟', x: .62, y: .38, birth: 35, growth: .85, research: 1.2, unrest: .015, color: '#b8b595' },
    { id: 'coast', name: '海岸诸邦', x: .69, y: .68, birth: 65, growth: 1.05, research: 1, unrest: .01, color: '#98b5c0' },
  ] },
  moon: { name: '月球', subtitle: '从远方的月光，到第二处家园', color: '#c0c1b0', civilizations: [] },
});
export const CIVILIZATION_AGES = ['原始聚落', '城邦时代', '工艺文明', '工业文明', '信息文明'];
export const POLICIES = Object.freeze({
  nurture: { name: '扶植', description: '成长 ×1.3 · 遗产 ×0.75 · 降低纷争', growth: 1.3, legacy: .75, unrest: -.05, influence: .025 },
  balance: { name: '共治', description: '平衡发展与贡纳 · 稳定影响力', growth: 1, legacy: 1, unrest: .012, influence: .012 },
  tribute: { name: '征贡', description: '遗产 ×2 · 成长 ×0.8 · 持续增加纷争', growth: .8, legacy: 2, unrest: .10, influence: -.008 },
});
export const INTERVENTIONS = Object.freeze({
  uplift: { name: '知识播种', energy: 60, cooldown: 45, description: '发展 +22 · 影响力 +6 · 纷争 +8' },
  peace: { name: '调停纷争', energy: 40, cooldown: 40, description: '纷争 −35 · 影响力 +8' },
  tribute: { name: '征收遗产', energy: 80, cooldown: 60, description: '立即征收一笔遗产 · 纷争 +25 · 影响力 −5' },
});
const structure = (name, site, legacy, energy, seconds, requires, description) => ({ name, site, legacy, energy, seconds, requires, description });
export const ORBITAL_STRUCTURES = Object.freeze({
  solar: structure('展开式太阳翼', 'orbit', [0, 0, 0], [40, 100, 200], [40, 50, 60], {}, '每级产能 +3 能量/秒；应急电源始终提供 2/秒。'),
  habitat: structure('环形居住舱', 'orbit', [0, 120, 400], [100, 250, 500], [60, 80, 100], { solar: 1 }, '建立家园并接收地表遗产；每级增加居住空间与文明成长速度。'),
  observer: structure('地表观测阵列', 'orbit', [80], [100], [60], { habitat: 1 }, '开启文明干预：知识播种、调停纷争与征收遗产。'),
  battery: structure('储能阵列', 'orbit', [80, 200], [120, 220], [50, 70], { solar: 1 }, '每级储能上限 +600，为月面建设积蓄能量。'),
  relay: structure('治理中继', 'orbit', [160, 600], [180, 500], [80, 100], { observer: 1 }, '每级地表遗产 ×1.6；可开启自动调停，仍消耗能量。'),
  survey: structure('月面测绘', 'moon', [500], [600], [120], { habitat: 2, observer: 1, battery: 1 }, '任一地表文明达到工艺时代后，派出探测器开启月球开发。'),
  outpost: structure('月球前哨', 'moon', [1200], [900], [150], { survey: 1, solar: 3 }, '建立月面基地，开始太阳能与地表联合供给。产能 +4 能量/秒。'),
  reactor: structure('月面聚变堆', 'moon', [1800, 3600], [1000, 1400], [150, 120], { outpost: 1, battery: 2 }, '每级产能 +8 能量/秒，为深空航行提供稳定电力。'),
  shipyard: structure('地月航行港', 'moon', [3200], [1600], [180], { habitat: 3, relay: 2, reactor: 1 }, '贯通地月运输，完成 VI。家园、能量与文明治理体系留给下一阶段。'),
});

export function oldOrbitalRates(o) { return { capacity: 400 + o.structures.battery * 600 }; }
export function oldOrbitalSpent(o) { if (!o) return 0; return Q.sum(Object.entries(ORBITAL_STRUCTURES).flatMap(([key,c])=>c.legacy.slice(0,o.structures[key])).concat(o.project?[o.project.legacy]:[])); }
export function createOldOrbitalState() { return { version:1,started:false,elapsed:0,energy:120,structures:Object.fromEntries(Object.keys(ORBITAL_STRUCTURES).map(k=>[k,0])),project:null,bodies:Object.fromEntries(Object.entries(BODIES).map(([k,d])=>[k,{civilizations:d.civilizations.map(c=>({id:c.id,born:false,population:0,progress:0,influence:25,unrest:10,policy:'balance',eventIndex:0,cooldowns:{uplift:0,peace:0,tribute:0},signal:null}))}])),legacyEarned:0,legacyFraction:0,selectedBody:'earth',selectedCivilization:'delta',autoStabilize:false,completionAt:null,log:[{time:0,text:'舰队已进入轨道。先展开太阳翼，让家园获得第一束电力。'}] }; }
