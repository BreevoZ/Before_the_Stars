// VII step 3 · launch windows and civilization transfer, plus the VII talent
// tree (a first shape) with the arks and drydocks that reach the other bodies. The Earth stays the womb: a civilization that is not at
// war can be carried by ark to a colony dome. Windows are soft: aligned planets
// make the crossing short and cheap; a launch against the window still flies,
// but slower and dearer. Colony wars and uplift come in steps 4 and 5.
import { Q } from './quantity.js';
import { TAU } from './celestial-clock.js';
import { bodyById, bodyAngle, orbitalPeriod } from './solar-config.js';
import { FACILITIES, arrived, facilityState, buildFacility, flightFactor } from './solar-industry.js';
import { emptyWorld, colonistRate, colonyIncome } from './colony-war.js';
import { effectProduct, effectSum } from './solar-effects.js';
export { colonistRate } from './colony-war.js';

const M = 2 ** 20, G = 2 ** 30, T = 2 ** 40;
export const COLONY_RULES = Object.freeze({
  // A Hohmann transfer to Mars leaves when Mars leads the Earth by about 44°.
  target: 'mars', lead: .77, window: .8, hohmannWindow: .45,
  travelSeconds: 60, lateTravel: 2, fuelLateTravel: 1.4, lateCost: 3, fuelLateCost: 1.5,
  domeCapacity: 2, transferBase: 4 * M,
});
const node = (name, x, y, icon, column, extra = {}) => Object.freeze({ name, x, y, icon, column, requires: {}, costs: [], ...extra });
// The VII map: a gold axis of technology up the middle, each step opening the
// next worlds out from the Sun; beside it, one framed region per world, two per
// tier, left and right. A region grows outwards from its world's large node:
// the planet's own talents along the lower row, its moons along the upper one.
// The axis leads on to VIII (Stellar): the Sun itself.
export const SOLAR_AXIS = 660;
// As wide as the other two maps: up to four columns a side, rows stacked upwards.
// A tier is as tall as its fuller region needs.
const BOTTOM = 4150, COL = 125, ROW = 150, TIER_ROWS = Object.freeze([3, 3, 5, 5, 4]);
const TIER_BASE = TIER_ROWS.reduce((bases, rows, i) => [...bases, i ? bases[i - 1] - (TIER_ROWS[i - 1] - 1) * ROW - 300 : BOTTOM - 230], []);
const tierY = tier => TIER_BASE[tier];
export const SOLAR_MAP = Object.freeze({ width: 1320, height: BOTTOM + 250 });
// Where each tier begins and ends, for the dividers and the region names.
export const SOLAR_TIERS = Object.freeze(TIER_ROWS.map((rows, tier) => Object.freeze({ base: TIER_BASE[tier], top: TIER_BASE[tier] - (rows - 1) * ROW })));
export const SOLAR_ROW = ROW;
function SOLAR_TIERS_TOP() { return TIER_BASE.at(-1) - (TIER_ROWS.at(-1) - 1) * ROW; }
const at = (side, tier, col, row = 0) => ({ x: SOLAR_AXIS + side * (170 + COL * col), y: tierY(tier) - ROW * row });
// id, name, subtitle, side (-1 left / 1 right), tier.
export const SOLAR_REGIONS = Object.freeze([
  ['earth', '地月港', 'EARTH–MOON · 转运与方舟', -1, 0], ['mars', '火星', 'MARS · 殖民世界', 1, 0],
  ['mercury', '水星', 'MERCURY · 近日工业', -1, 1], ['venus', '金星', 'VENUS · 云层与大气', 1, 1],
  ['belt', '小行星带', 'MAIN BELT · 采矿与铸造', -1, 2], ['jupiter', '木星', 'JUPITER · 气态巨行星', 1, 2],
  ['saturn', '土星', 'SATURN · 冰环', -1, 3], ['uranus', '天王星', 'URANUS · 冰巨星', 1, 3],
  ['neptune', '海王星', 'NEPTUNE · 冰巨星', -1, 4], ['pluto', '冥王星', 'PLUTO · 柯伊伯带', 1, 4],
].map(([id, name, en, side, tier]) => Object.freeze({ id, name, en, side, tier })));
const R = Object.fromEntries(SOLAR_REGIONS.map(r => [r.id, r]));
const place = (region, col, row, name, icon, extra) => { const r = R[region]; return node(name, at(r.side, r.tier, col, row).x, at(r.side, r.tier, col, row).y, icon, region, extra); };
const world = (region, name, icon, gate, extra) => place(region, 0, 0, name, icon, { kind: 'planet', requires: { [gate]: 1 }, ...extra });
// A moon's station extends its planet's foothold: a hexagon, stacked above the planet from the nearest moon out.
const moon = (id, region, [col, row], name, icon, parent, cost, description, extra = {}) => place(region, col, row, name, icon, { satellite: id, costs: cost ? [cost] : [], requires: { [parent]: 1 }, description, ...extra });
// A planet talent: [col, row] in its region, price(s), what it needs, what it says.
const talent = (region, [col, row], name, icon, costs, requires, description, extra = {}) => place(region, col, row, name, icon, { costs, requires, description, ...extra });
const axis = (name, tier, icon, cost, requires, description, extra = {}) => node(name, SOLAR_AXIS, tierY(tier), icon, 'axis', { costs: cost ? [cost] : [], requires, gold: true, description, ...extra });
export const SOLAR_TALENTS = Object.freeze({
  voyage: node('远航协议', SOLAR_AXIS, BOTTOM, 'ark', 'axis', { root: true, kind: 'keystone', finale: true, gold: true, description: '七艘方舟结成先遣编队驶向火星。这一页星图从这里向上生长，也与轨道星图的顶端相连。' }),
  // The axis: each technology opens the next worlds out from the Sun.
  heat: axis('耐热外壳', 1, 'heatshield', 12 * M, { voyage: 1 }, '为方舟加装耐热外壳，让它能在水星与金星的高温中停靠。解锁：水星、金星。'),
  mining: axis('小行星采矿', 2, 'drill', 320 * M, { heat: 1 }, '在主带补给、造出聚变引擎：方舟航速 ×1.6。解锁：小行星带、木星。'),
  deepDrive: axis('深空推进', 3, 'deepdrive', 16 * G, { mining: 1 }, '能穿越巨行星之间漫长空隙的推进：方舟航速 ×2.2。解锁：土星、天王星。'),
  relay: axis('深空中继', 4, 'relay', 128 * G, { deepDrive: 1 }, '在外太阳系布下通讯中继，方舟不再与火星失联。解锁：海王星、冥王星。'),
  stellar: node('恒星协议', SOLAR_AXIS, SOLAR_TIERS_TOP() - 250, 'dyson', 'axis', { planned: true, requires: { relay: 1 }, finale: true, kind: 'keystone', gold: true, gate: '需要一个升格文明',
    description: 'VII 的终点：把太阳系的工业与升格文明转向太阳，立项开发恒星本身，进入 VIII · 恒星。戴森群将在 VIII 中一步步建起。需要深空中继与至少一个升格文明。（后续开放）' }),
  // ── Earth–Moon: the harbour that is always there, the yards and the crossing. Columns: yards · navigation · convoy · lift.
  moonPort: world('earth', '地月港', 'lunarport', 'voyage', { root: true, description: 'VI 的月面船坞与地月航线。转运方舟从这里出发前往火星。' }),
  lunarYard: talent('earth', [0, 1], '月面二号船坞', 'lunaryard', [512 * M], { moonPort: 1 }, '在 VI 的月面船坞旁再建一座：多一艘方舟，飞往火星港停泊。'),
  lunarRelay: talent('earth', [0, 2], '行星际回流', 'cargo', [64 * M, G], { lunarYard: 1 }, '行星际货流并入地月航线：VI 月面回流每级翻倍。'),
  survey: talent('earth', [1, 0], '航线测绘', 'chart', [8 * M], { moonPort: 1 }, '在勘察档案中显示地火窗口的对齐程度与下一次开启的倒计时。', { kind: 'specialist' }),
  hohmann: talent('earth', [1, 1], '轨道计算', 'orbital', [96 * M], { survey: 1 }, '更精确的转移轨道：发射窗口的宽度增加一半以上。'),
  launchRail: talent('earth', [1, 2], '电磁发射轨道', 'rail', [512 * M], { hohmann: 1 }, '转运方舟从月面电磁轨道起飞：文明转运的航程缩短 20%。'),
  fleet: talent('earth', [2, 0], '转运舰队', 'convoy', [256 * M, 2 * G], { survey: 1 }, '每级多一艘转运方舟，可同时在途的转运加一。'),
  academy: talent('earth', [2, 1], '殖民学院', 'academy', [G], { fleet: 1 }, '启程前在地月港集训：转运的文明抵达火星时进化一个时代（最高第五时代）。', { kind: 'keystone' }),
  spaceElevator: talent('earth', [3, 0], '地球轨道电梯', 'tether', [256 * M], { fleet: 1 }, '从赤道拉起的缆绳把文明送上轨道：文明转运的价格降低 20%。'),
  // ── Mars: the harbour where the fleet moors, the colony, and how it survives. Columns: moons · dome · transfer · uplift.
  harbor: world('mars', '火星港', 'harbor', 'voyage', { costs: [24 * M], arrival: 'mars',
    description: '先遣编队停泊的地方。建起船坞后，停泊的方舟可以一艘艘派往其他世界；每派出一艘，火星旁就少一点灯火。' }),
  phobos: moon('phobos', 'mars', [0, 1], '火卫一', 'elevator', 'harbor', 256 * M, '轨道升降站：从火卫一向火星放下缆绳，文明转运的价格降低 25%。'),
  deimos: moon('deimos', 'mars', [0, 2], '火卫二', 'berth', 'phobos', 512 * M, '转运泊位：转运方舟在火卫二减速入轨，文明转运的航程缩短 20%。'),
  dome: talent('mars', [1, 0], '火星穹顶', 'dome', [16 * M, 128 * M, G, 8 * G, 64 * G], { harbor: 1 }, '在火星上建起居住穹顶，每座容纳两个殖民文明；升格文明会永久住在穹顶里。', { kind: 'keystone' }),
  terraform: talent('mars', [1, 1], '大气改造', 'terraform', [64 * M, 512 * M, 4 * G], { dome: 1 }, '一点点加厚火星的大气：火星居民的产出每级 ×1.5。'),
  shelters: talent('mars', [1, 2], '核冬天掩体', 'bunker', [256 * M], { terraform: 1 }, '深埋地下的掩体让火星更快复苏：火星核冬天的时长减半。'),
  transfer: talent('mars', [2, 0], '文明转运', 'transfer', [32 * M], { dome: 1 }, '从地球挑选一个不在交战的文明，装上方舟送往火星。地球的点位会空出来，新的文明照常萌芽。', { kind: 'keystone' }),
  rations: talent('mars', [2, 1], '穹顶配给', 'rations', [128 * M], { transfer: 1 }, '按户配给水和氧气：闲置的邻居要等三倍的时间才会开战。'),
  uplift: talent('mars', [3, 0], '殖民地存续协议', 'accord', [192 * M], { transfer: 1 },
    '让殖民文明越过大过滤器：第五时代的和平文明可以谈判签署存续协议；两个第五时代文明交战、一方基地跌破 35% 时，可以接管双方核武——败方覆灭但没有核毁灭，胜方升格。升格文明永久住在穹顶里，不再参战，产出是第五时代居民的 4 倍。', { kind: 'keystone' }),
  envoys: talent('mars', [3, 1], '外交使团', 'envoy', [512 * M], { uplift: 1 }, '常驻穹顶的使团：存续协议的谈判时间减半。'),
  arsenalLocks: talent('mars', [3, 2], '核武联锁', 'nukelock', [G], { envoys: 1 }, '提前在双方核武上装好联锁：一方基地跌破 50% 时就可以接管核武。'),
  // ── Mercury: power, metal and heat. Columns: sails · furnace · dawn line · launcher.
  mercury: world('mercury', '日冕阵列', 'corona', 'heat', { facility: 'mercury' }),
  solarSail: talent('mercury', [0, 1], '光帆加速', 'solarsail', [256 * M], { mercury: 1 }, '水星的日冕为方舟张开光帆：所有方舟与转运方舟的航程缩短 30%。'),
  coronaProbe: talent('mercury', [0, 2], '日冕探测器', 'probe', [4 * G], { solarSail: 1 }, '贴着日冕飞行的探测器，为下一个时代积累对太阳的认识：行星际收入 ×1.1。', { kind: 'specialist' }),
  smelter: talent('mercury', [1, 0], '近日熔炉', 'furnace', [2 * G], { mercury: 1 }, '在水星的昼面冶炼金属：所有行星工业产能 ×1.5。'),
  ironCore: talent('mercury', [1, 1], '铁核开采', 'core', [8 * G], { smelter: 1 }, '水星巨大的铁核是太阳系里最富的金属矿：行星工业产能 ×1.25。'),
  terminator: talent('mercury', [2, 0], '晨昏线城市', 'dawnline', [G], { smelter: 1 }, '沿着缓慢移动的晨昏线行进的城市，永远待在不冷不热的地方：行星工业产能 ×1.2。'),
  mercuryDriver: talent('mercury', [3, 0], '水星弹射轨道', 'launcher', [2 * G], { terminator: 1 }, '低重力、无大气，冶炼好的船体直接弹射到火星港：多一艘方舟。'),
  // ── Venus: the clouds, the air, the heat. Columns: cities · refinery · greenhouse · storms.
  venus: world('venus', '高空浮空城', 'cloud', 'heat', { facility: 'venus' }),
  cloudCities: talent('venus', [0, 1], '浮空城群', 'aerostat', [512 * M, 4 * G], { venus: 1 }, '更多浮空城连成城群：金星浮空城的产出每级 ×1.5。'),
  sunshade: talent('venus', [0, 2], '轨道遮阳帘', 'parasol', [16 * G], { cloudCities: 1 }, '在日金之间展开巨大的遮阳帘，让金星慢慢冷却：金星浮空城的产出翻倍。'),
  refinery: talent('venus', [1, 0], '大气提纯', 'refinery', [256 * M], { venus: 1 }, '浮空城开始提纯硫酸云：金星浮空城的产出翻倍。'),
  carbonFoundry: talent('venus', [1, 1], '碳纤维船坞', 'fiber', [2 * G], { refinery: 1 }, '从二氧化碳里拉出碳纤维，造出更轻的船体：所有航程缩短 10%。'),
  greenhouse: talent('venus', [2, 0], '温室气体输送', 'greenhouse', [G], { refinery: 1 }, '把金星的温室气体送往火星，让稀薄的大气变暖：火星居民与升格文明的产出 ×1.33（抵消火星的稀缺）。'),
  lightning: talent('venus', [3, 0], '雷暴捕能', 'bolt', [G], { greenhouse: 1 }, '金星云层里的闪电从不停歇：行星工业产能 ×1.1。'),
  // ── The belt: metal, ice and new arks. Ceres and Vesta stand in for moons.
  belt: world('belt', '采矿舰队', 'mining', 'mining', { facility: 'belt' }),
  ceresDepot: talent('belt', [0, 1], '谷神星补给站', 'ceres', [G], { belt: 1 }, '在主带最大的矮行星上补水补燃料：所有航程缩短 15%。'),
  vestaMines: talent('belt', [0, 2], '灶神星矿场', 'vesta', [4 * G], { ceresDepot: 1 }, '灶神星古老的玄武岩矿脉：采矿舰队产出翻倍。'),
  arkForge: talent('belt', [1, 0], '方舟铸造', 'arkforge', [2 * G, 8 * G, 32 * G], { belt: 1 }, '采矿舰队的金属在火星港铸成新的方舟：每级多一艘停泊的方舟。'),
  swarm: talent('belt', [1, 1], '自主采矿群', 'swarm', [2 * G, 16 * G], { arkForge: 1 }, '成千上万台无人采矿器：采矿舰队的产出每级 ×1.5。'),
  redirect: talent('belt', [2, 0], '小行星牵引', 'tug', [4 * G], { arkForge: 1 }, '把整颗富金属小行星推向内太阳系：行星工业产能 ×1.2。'),
  palladium: talent('belt', [3, 0], '铂族金属', 'ingot', [16 * G], { redirect: 1 }, '稀有的铂族金属让每一笔交易都更值钱：行星际收入 ×1.1。'),
  // ── Jupiter: the giant and the Galilean moons, nearest first.
  jupiter: world('jupiter', '气态采集站', 'gasgiant', 'mining', { facility: 'jupiter' }),
  io: moon('io', 'jupiter', [0, 1], '木卫一', 'volcano', 'jupiter', 8 * G, '火山热电：木卫一的火山为采集站供热，气态采集站产出翻倍。'),
  europa: moon('europa', 'jupiter', [0, 2], '木卫二', 'ocean', 'io', 16 * G, '冰下海洋：冰壳之下的海洋让升格文明找到新的研究方向，升格文明的产出 ×1.5。'),
  ganymede: moon('ganymede', 'jupiter', [0, 3], '木卫三', 'magnet', 'europa', 16 * G, '磁层船坞：在木卫三自己的磁层里铸造方舟，多一艘停泊在火星港的方舟。'),
  callisto: moon('callisto', 'jupiter', [0, 4], '木卫四', 'depot', 'ganymede', 32 * G, '外缘补给站：辐射带之外的补给站，所有方舟与转运方舟的航程再缩短 20%。'),
  fuel: talent('jupiter', [1, 0], '木星燃料', 'fuelcell', [G], { jupiter: 1 }, '用木星采集站的燃料逆窗加速：地火转运逆窗发射的航程与价格惩罚大幅减轻。'),
  heliumScoop: talent('jupiter', [1, 1], '氦-3 采集', 'scoop', [8 * G], { fuel: 1 }, '在木星上层大气里捞取氦-3：气态采集站产出翻倍。'),
  stormRider: talent('jupiter', [2, 0], '大红斑风能', 'storm', [4 * G], { fuel: 1 }, '在大红斑边缘的风暴里放起风筝发电站：气态采集站产出 ×1.5。'),
  magnetosphere: talent('jupiter', [2, 1], '磁层发电', 'aurora', [16 * G], { stormRider: 1 }, '木星磁层是太阳系最大的发电机：行星工业产能 ×1.2。'),
  gravAssist: talent('jupiter', [3, 0], '引力弹弓', 'slingshot', [8 * G], { stormRider: 1 }, '借木星的引力为每一艘方舟加速：所有航程缩短 15%。'),
  // ── Saturn: rings of ice, and moons out to Titan, the next colony.
  saturn: world('saturn', '冰环采集站', 'ringplanet', 'deepDrive', { facility: 'saturn' }),
  enceladus: moon('enceladus', 'saturn', [0, 1], '土卫二', 'plume', 'saturn', 32 * G, '冰羽采集：收集土卫二喷出的冰羽，冰环采集站产出翻倍。'),
  rhea: moon('rhea', 'saturn', [0, 2], '土卫五', 'cache', 'enceladus', 64 * G, '冰岩仓库：土卫五储存的水冰送进火星穹顶，每座穹顶再多住一户。'),
  iapetus: moon('iapetus', 'saturn', [0, 3], '土卫八', 'yinyang', 'rhea', 128 * G, '双色哨站：一面漆黑一面雪白的卫星上架起观测阵列，行星工业产能 ×1.15。'),
  titan: moon('titan', 'saturn', [0, 4], '土卫六', 'lake', 'iapetus', 0, '甲烷湖前哨：厚雾之下的甲烷湖，是火星之后的下一个殖民世界。（后续开放）', { planned: true }),
  iceWater: talent('saturn', [1, 0], '冰水补给', 'icewater', [8 * G], { saturn: 1 }, '土星环的冰送进火星穹顶：每座穹顶多住一户。'),
  ringHarvest: talent('saturn', [1, 1], '环缝采冰', 'ringcut', [32 * G], { iceWater: 1 }, '沿着卡西尼缝开采最纯净的冰：冰环采集站产出翻倍。'),
  ringDocks: talent('saturn', [2, 0], '环中船坞', 'ringdock', [64 * G], { iceWater: 1 }, '在土星环的阴影里组装方舟：多一艘方舟。'),
  hexagon: talent('saturn', [3, 0], '六边形风暴观测', 'hexstorm', [32 * G], { ringDocks: 1 }, '持续观测土星北极的六边形风暴，积累流体与气候的知识：行星际收入 ×1.1。', { kind: 'specialist' }),
  // ── Uranus: the tilted giant and its moons, nearest first.
  uranus: world('uranus', '冰巨星采集站', 'icegiant', 'deepDrive', { facility: 'uranus' }),
  miranda: moon('miranda', 'uranus', [0, 1], '天卫五', 'cliff', 'uranus', 128 * G, '断崖前哨：太阳系最高的悬崖脚下建起前哨，冰巨星采集站产出 ×1.25。'),
  ariel: moon('ariel', 'uranus', [0, 2], '天卫一', 'canyon', 'miranda', 256 * G, '峡谷船坞：在天卫一的峡谷里避开辐射铸造方舟，多一艘方舟。'),
  titania: moon('titania', 'uranus', [0, 3], '天卫三', 'crystal', 'ariel', 128 * G, '冰岩采集：天卫三的冰岩里藏着更多氘，冰巨星采集站产出翻倍。'),
  oberon: moon('oberon', 'uranus', [0, 4], '天卫四', 'workshop', 'titania', 256 * G, '深空工坊：远离太阳的精密工坊，所有行星工业产能 ×1.25。'),
  tiltPower: talent('uranus', [1, 0], '侧躺季节', 'tilt', [128 * G], { uranus: 1 }, '天王星侧躺着公转，每个极点有四十二年的白昼：追着白昼发电，冰巨星采集站产出翻倍。'),
  deuterium: talent('uranus', [1, 1], '氘提取', 'isotope', [512 * G], { tiltPower: 1 }, '冰巨星的大气富含氘，是聚变时代的货币：行星际收入 ×1.1。'),
  diamondRain: talent('uranus', [2, 0], '钻石雨采集', 'diamond', [256 * G], { tiltPower: 1 }, '高压下的甲烷在深处凝成钻石雨：行星工业产能 ×1.2。'),
  uranusBeacon: talent('uranus', [3, 0], '冰巨星信标', 'beacon', [256 * G], { diamondRain: 1 }, '外太阳系的导航信标：所有航程缩短 10%。'),
  // ── Neptune: the fastest winds, the edge of the Sun's reach.
  neptune: world('neptune', '深空前哨', 'trident', 'relay', { facility: 'neptune' }),
  proteus: moon('proteus', 'neptune', [0, 1], '海卫八', 'shipwright', 'neptune', T, '近轨船坞：在海卫八不规则的身躯上凿出船坞，多一艘方舟。'),
  triton: moon('triton', 'neptune', [0, 2], '海卫一', 'telescope', 'proteus', 512 * G, '逆行观测站：沿着逆行轨道观测海王星的风暴，深空前哨产出翻倍。'),
  nereid: moon('nereid', 'neptune', [0, 3], '海卫二', 'ellipse', 'triton', 2 * T, '偏心轨道站：海卫二极扁的轨道远远掠过深空，适合做远航补给，所有航程缩短 10%。'),
  windFarm: talent('neptune', [1, 0], '超音速风场', 'turbine', [512 * G], { neptune: 1 }, '海王星的风是太阳系最快的风：深空前哨产出翻倍。'),
  ringArcs: talent('neptune', [1, 1], '环弧采集', 'arcs', [2 * T], { windFarm: 1 }, '海王星环里奇特的物质弧：深空前哨产出 ×1.5。'),
  darkSpot: talent('neptune', [2, 0], '大暗斑探测', 'vortex', [T], { windFarm: 1 }, '追踪时隐时现的大暗斑：行星际收入 ×1.1。', { kind: 'specialist' }),
  heliopause: talent('neptune', [3, 0], '日球层顶探测', 'heliopause', [4 * T], { darkSpot: 1 }, '派出探测器触碰太阳风的边界，测量太阳真正的影响范围：行星际收入 ×1.1。', { kind: 'specialist' }),
  // ── Pluto and the Kuiper belt: ice sent home, the coldest archive, the last ark.
  pluto: world('pluto', '冰氮前哨', 'dwarfplanet', 'relay', { facility: 'pluto' }),
  charon: moon('charon', 'pluto', [0, 1], '卡戎', 'binary', 'pluto', 2 * T, '双星轨道站：冰氮前哨产出翻倍。'),
  nix: moon('nix', 'pluto', [0, 2], '冥卫二', 'shard', 'charon', 4 * T, '中继灯塔：小小的冥卫二上架起灯塔，所有航程缩短 5%。'),
  hydra: moon('hydra', 'pluto', [0, 3], '冥卫三', 'triad', 'nix', 8 * T, '深空镜面：冥卫三的冰壳反照率极高，行星际收入 ×1.05。'),
  cometCapture: talent('pluto', [1, 0], '彗星捕获', 'comet', [T], { pluto: 1 }, '把柯伊伯带的冰块推回内太阳系当推进剂：所有方舟与转运方舟的航程再缩短 15%。'),
  coldArchive: talent('pluto', [1, 1], '冷端档案', 'archive', [4 * T], { cometCapture: 1 }, '把文明的遗产存进太阳系最冷的地方，永不升温：行星际收入（工业与殖民地）×1.15。'),
  nitrogenGlaciers: talent('pluto', [2, 0], '氮冰川开采', 'glacier', [2 * T], { cometCapture: 1 }, '斯普特尼克平原的氮冰川缓缓流动：冰氮前哨产出翻倍。'),
  kuiperSurvey: talent('pluto', [3, 0], '柯伊伯带巡天', 'sweep', [4 * T], { nitrogenGlaciers: 1 }, '巡查数以万计的柯伊伯带天体，为下一个时代标出奥尔特云的方向：行星际收入 ×1.1。', { kind: 'specialist' }),
  arrokoth: talent('pluto', [3, 1], '天涯海角', 'snowman', [8 * T], { kuiperSurvey: 1 }, '探访雪人形状的原始天体「天涯海角」，用它的冰造出最后一艘方舟：多一艘方舟。'),
});
export const SOLAR_TALENT_KEYS = Object.freeze(Object.entries(SOLAR_TALENTS).filter(([, t]) => !t.root && !t.planned && !t.facility).map(([key]) => key));
// Save v26 knew only the colony and navigation talents; v27 added the arks and drydocks.
export const V26_SOLAR_KEYS = Object.freeze(['dome', 'transfer', 'survey', 'hohmann', 'fleet', 'fuel']);
// v29 added 殖民地存续协议 (it was a planned node before); v30 rebuilt the map by world;
// v31 put the technology on a central axis.
export const V32_SOLAR_KEYS = Object.freeze(['heat', 'mining', 'deepDrive', 'relay', 'survey', 'hohmann', 'fleet', 'harbor', 'dome', 'transfer', 'uplift', 'phobos', 'deimos', 'solarSail', 'smelter', 'refinery', 'greenhouse', 'arkForge', 'fuel', 'io', 'europa', 'ganymede', 'callisto', 'iceWater', 'enceladus', 'titania', 'oberon', 'cometCapture', 'coldArchive', 'charon', 'triton']);
export const V31_SOLAR_KEYS = Object.freeze(['heat', 'mining', 'deepDrive', 'relay', 'survey', 'hohmann', 'fleet', 'harbor', 'dome', 'transfer', 'uplift', 'phobos', 'deimos', 'solarSail', 'smelter', 'refinery', 'greenhouse', 'arkForge', 'fuel', 'io', 'europa', 'ganymede', 'callisto', 'iceWater', 'enceladus', 'titania', 'oberon', 'triton']);
export const V30_SOLAR_KEYS = Object.freeze(['solarSail', 'smelter', 'refinery', 'greenhouse', 'harbor', 'dome', 'transfer', 'uplift', 'nuclear', 'survey', 'hohmann', 'fleet', 'fusion', 'arkForge', 'fuel', 'jupiterDock', 'deepDrive', 'iceWater', 'uranusDock', 'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'enceladus', 'titania', 'oberon', 'triton']);
export const V29_SOLAR_KEYS = Object.freeze(['heat', 'harbor', 'nuclear', 'fusion', 'dome', 'transfer', 'uplift', 'survey', 'hohmann', 'fleet', 'fuel']);
export const V28_SOLAR_KEYS = Object.freeze(['heat', 'harbor', 'nuclear', 'fusion', 'dome', 'transfer', 'survey', 'hohmann', 'fleet', 'fuel']);
export const emptyColonies = (keys = SOLAR_TALENT_KEYS) => ({ talents: Object.fromEntries(keys.map(key => [key, 0])), colonies: { mars: emptyWorld() }, transfers: [], nextTransfer: 0 });

// ── Talents ──
export function solarTalentState(s, key) {
  const o = s.orbital, t = SOLAR_TALENTS[key];
  if (!t || !o?.started || !o.talents.voyage) return 'locked';
  if (t.root) return 'max';
  if (t.planned) return 'planned';
  if (t.facility) { const state = facilityState(s, t.facility); return state === 'transit' ? 'transit' : state; }
  const rank = o.solar.talents[key];
  if (rank >= t.costs.length) return 'max';
  if (Object.entries(t.requires).some(([p, n]) => solarRank(o, p) < n)) return 'prerequisite';
  if (t.arrival && !arrived(o, t.arrival)) return 'transit';
  if (Object.entries(t.facility_gate ?? {}).some(([f, n]) => o.solar.facilities[f] < n)) return 'prerequisite';
  return Q.gte(s.permanent.legacy, t.costs[rank]) ? 'ready' : 'legacy';
}
export function solarRank(o, key) {
  const t = SOLAR_TALENTS[key];
  if (t.root) return o.talents.voyage ? 1 : 0;
  if (t.planned) return 0;
  return t.facility ? o.solar.facilities[t.facility] : o.solar.talents[key];
}
export const solarCosts = key => { const t = SOLAR_TALENTS[key]; return t.facility ? FACILITIES[t.facility].costs : t.costs; };
export function purchaseSolarTalent(s, key) {
  const t = SOLAR_TALENTS[key];
  if (t?.facility) return buildFacility(s, t.facility);
  if (solarTalentState(s, key) !== 'ready') return false;
  const o = s.orbital, cost = t.costs[o.solar.talents[key]];
  s.permanent.legacy = Q.sub(s.permanent.legacy, cost);
  (o.solar.payments[key] ??= []).push(Q.of(cost)); o.solar.talents[key]++;
  return true;
}

// ── Windows ──
const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
// How far Mars leads the Earth, relative to the ideal Hohmann lead.
export function windowOffset(o, time = o.elapsed) {
  return wrap(bodyAngle(bodyById(COLONY_RULES.target), time) - bodyAngle(bodyById('earth'), time) - COLONY_RULES.lead);
}
export const windowWidth = o => COLONY_RULES.window + effectSum(o, 'window');
export const windowOpen = (o, time = o.elapsed) => Math.abs(windowOffset(o, time)) <= windowWidth(o);
// Seconds until the window next opens (0 when open) or closes.
export function windowTiming(o) {
  const rate = TAU / orbitalPeriod(bodyById(COLONY_RULES.target).au) - TAU / orbitalPeriod(1), offset = windowOffset(o), width = windowWidth(o);
  // Mars is outer and slower: the offset falls steadily, wrapping around.
  const fall = -rate;
  if (Math.abs(offset) <= width) return { open: true, seconds: (offset + width) / fall };
  const distance = ((offset - width) % TAU + TAU) % TAU;
  return { open: false, seconds: distance / fall };
}

// ── Transfers ──
// 冰水补给 lets each dome house one more household.
export const householdsPerDome = o => COLONY_RULES.domeCapacity + effectSum(o, 'households');
export const domeCapacity = o => o.solar.talents.dome * householdsPerDome(o);
export const fleetCapacity = o => 1 + effectSum(o, 'convoy');
// Uplifted civilizations keep their place under the dome for good.
export const colonyCount = o => o.solar.colonies.mars.civs.length + o.solar.colonies.mars.uplifted.length + o.solar.transfers.length;
export function transferQuote(o, civ) {
  const open = windowOpen(o), fuel = o.solar.talents.fuel > 0;
  const base = COLONY_RULES.transferBase * 2 ** (civ.age - 1);
  // 火卫一's elevator makes each launch cheaper; 火卫二's berth, each crossing shorter.
  const cheaper = effectProduct(o, 'transferCost'), shorter = effectProduct(o, 'transferTime');
  return { open, cost: Math.round((open ? base : base * (fuel ? COLONY_RULES.fuelLateCost : COLONY_RULES.lateCost)) * cheaper),
    seconds: COLONY_RULES.travelSeconds * (open ? 1 : fuel ? COLONY_RULES.fuelLateTravel : COLONY_RULES.lateTravel) * flightFactor(o) * shorter };
}
export function transferState(s, civId) {
  const o = s.orbital;
  if (!o?.talents.voyage || !o.solar.talents.transfer) return 'locked';
  if (o.phase !== 'living') return 'winter';
  if (o.solar.colonies[COLONY_RULES.target].phase !== 'living') return 'colonyWinter';
  const civ = o.civilizations.find(c => c.id === civId);
  if (!civ?.alive) return 'selection';
  if (civ.warId) return 'war';
  if (colonyCount(o) >= domeCapacity(o)) return 'capacity';
  if (o.solar.transfers.length >= fleetCapacity(o)) return 'fleet';
  return Q.gte(s.permanent.legacy, transferQuote(o, civ).cost) ? 'ready' : 'legacy';
}
// The civilization leaves Earth: its site frees up and a new seed can grow there.
export function transferCivilization(s, civId) {
  if (transferState(s, civId) !== 'ready') return false;
  const o = s.orbital, civ = o.civilizations.find(c => c.id === civId), quote = transferQuote(o, civ);
  s.permanent.legacy = Q.sub(s.permanent.legacy, quote.cost);
  (o.solar.payments.transfers ??= []).push(quote.cost);
  o.civilizations = o.civilizations.filter(c => c !== civ);
  for (const key of ['selectedCivilization', 'selectedOpponent']) if (o[key] === civ.id) o[key] = o.civilizations.find(c => c.alive)?.id ?? null;
  o.solar.transfers.push({ id: `t${++o.solar.nextTransfer}`, to: COLONY_RULES.target, departAt: o.elapsed, arriveAt: o.elapsed + quote.seconds,
    civ: { id: civ.id, name: civ.name, age: civ.age, tendency: civ.tendency ?? 0, doctrine: civ.doctrine ?? 0 } });
  return true;
}
// Arrivals move from the ark into the dome.
export function landTransfers(o) {
  const landed = o.solar.transfers.filter(t => o.elapsed >= t.arriveAt - 1e-9);
  if (!landed.length) return [];
  o.solar.transfers = o.solar.transfers.filter(t => !landed.includes(t));
  // 殖民学院 trains them on the way: they land an age further on.
  const lift = effectSum(o, 'arrivalAge');
  for (const t of landed) o.solar.colonies[t.to].civs.push({ ...t.civ, age: Math.min(5, t.civ.age + lift), arrivedAt: t.arriveAt, progress: 0, warId: null, accord: null });
  return landed;
}
// A colonist works while its world is not in winter: its age doubles its yield (see colony-war.js).
export const colonyRate = colonyIncome;
export const transferValue = civ => COLONY_RULES.transferBase * 2 ** (civ.age - 1);
