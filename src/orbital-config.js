// Orbital wars reuse the surface simulation; Legacy is the only orbital wallet.
export const ORBITAL_RULES = Object.freeze({ version: 7, finalAge: 5, historyLimit: 12,
  winterSeconds: 60, refugeeSeconds: 30, nuclearVisualSeconds: 7, minCivilizations: 4, maxCivilizations: 6,
  habitatSections: 7, lunarRotationSeconds: 180, lunarBaseIncome: 512, warIncome: 2.5, warBaseHealth: 3,
  // A civilization should take minutes, not one, to climb from I to V: each
  // age lasts ~35–40 s of war. Legacy per experience rises by the same factor,
  // so the war income per second stays where it was.
  warExperience: .6, legacyPerExperience: 1 / 20,
  // War bonds pay per second per war, doubling with the lower age of the two.
  bondRate: .5, chainShare: .5, doomsdaySeconds: 600,
  // A ceasefire freezes one war; an airdrop hands a civilization twice the
  // gold its age starts with. Both are capped so they stay tactical.
  ceasefireSeconds: 60, airdropGold: 2, maximumAirdrops: 5,
  defeatLegacy: 64, harvestLegacy: 192, nuclearLegacy: 96, maximumPower: 5 });
export const SITES = Object.freeze([
  {id:'delta',name:'河口',x:.585,y:.38}, {id:'ridge',name:'山脊',x:.755,y:.27},
  {id:'coast',name:'海岸',x:.34,y:.61}, {id:'forest',name:'林地',x:.25,y:.25},
  {id:'plains',name:'平原',x:.55,y:.61}, {id:'isles',name:'群岛',x:.88,y:.67},
  {id:'valley',name:'谷地',x:.545,y:.22}, {id:'south',name:'南境',x:.31,y:.73},
]);
export const CIVILIZATION_NAMES = ['氏族','聚落','邦联','公社','部族','联盟'];
// 0 is no tendency. Each changes how a civilization fights, not only how hard.
export const TENDENCIES = Object.freeze([null,
  {name:'好战',effects:{damage:1.25,income:1.1,health:.9}},
  {name:'守成',effects:{baseHealth:1.6,health:1.15,damage:.9}},
  {name:'重科技',effects:{experience:1.4,income:.9}},
]);
const talent = (name,costs,requires,description,x,y,icon,extra={}) => ({name,costs,requires,description,x,y,icon,...extra});
// Routes are separate subtrees; later unlocks never draw across another route.
// The mainline to the next stage runs straight up the middle; the cycle of
// seeding and ending civilizations sits to the left, intervention to the right.
export const ORBITAL_TALENTS = Object.freeze({
  protocol: talent('存续协议',[0],{},'继承地表篇。文明可以灭亡，轨道上的我们将继续存在。',660,1150,'protocol',{root:true,kind:'keystone',branch:'root',finale:true}),
  // LIFE · 文明循环: seeding on one side, the winter that ends each cycle on the other.
  reseed: talent('播种计划',[128,512,2048],{protocol:1},'每级缩短 25% 核冬天和幸存文明等待新对手的时间。',340,935,'leaf',{branch:'life'}),
  diversity: talent('多元萌芽',[512,2048],{reseed:1},'提高每轮文明数量的下限，最多六个。',150,780,'network',{branch:'life',kind:'specialist'}),
  tendency: talent('文明倾向',[1024],{reseed:1},'此后萌芽的文明随机带有好战、守成或重科技倾向，改变它们的战斗方式与战争结局。',310,780,'spark',{branch:'life'}),
  nuclearResearch: talent('核冬天研究',[4096,65536],{reseed:1},'每级核毁灭遗产翻倍。',470,780,'fire',{branch:'life',kind:'keystone'}),
  chain: talent('连锁反扑',[16384],{nuclearResearch:1},'核毁灭时，本轮已经覆灭的文明废墟也按其最终时代结算一半遗产。',430,610,'beam',{branch:'life'}),
  doomsday: talent('末日时钟',[262144],{chain:1},'显示本轮已持续的时间；一轮在十分钟内走向核毁灭，遗产最多翻倍。',330,455,'clock',{branch:'life',kind:'specialist'}),
  // HOME · 地月家园: the mainline, in the order goods actually travel.
  recovery: talent('环地球生存空间',[256,1024,4096,16384,65536,262144,1048576],{protocol:1},'每级建成七分之一居住环，战争与核毁灭遗产翻倍。第七段接合后，星环完整环绕地球。',660,935,'habitat',{branch:'home',kind:'keystone'}),
  // The route comes first: nothing mined on the moon reaches Earth without it.
  transit: talent('地月航线',[32768],{recovery:2},'贯通地月运输航线。只有打通航线，月面的产出才能运回地球。',660,775,'orbital',{cycles:2,branch:'home'}),
  outpost: talent('月球前哨',[65536],{transit:1},'建立 VI 月面生产基地，货运舱沿地月航线运回遗产；战争与核毁灭遗产再翻倍。',660,615,'moon',{branch:'home',kind:'keystone'}),
  lunarIndustry: talent('月面自动工场',[131072,524288,2097152,8388608],{outpost:1},'每级月面产能翻倍；扩建采掘场、太阳翼与自动生产枢纽。',565,460,'industry',{branch:'home'}),
  massDriver: talent('质量投射器',[1048576],{outpost:1},'在月面铺设电磁发射轨道，货运舱发射更快，月面产能 ×2。',755,460,'up',{branch:'home',kind:'specialist'}),
  shipyard: talent('深空船坞',[4194304],{lunarIndustry:2,massDriver:1},'在月面建造远航方舟的船坞。',660,285,'rocket',{cycles:3,branch:'home'}),
  // The full ring is a stated condition rather than an edge: a drawn link from
  // the ring would cut straight through the route, outpost and shipyard nodes.
  voyage: talent('远航协议',[16777216],{shipyard:1},'带上历次轮回中观测到的全部文明，驶离地月系统。需要完整星环，只能在核冬天期间启航，完成 VI。',660,70,'ark',{cycles:4,ring:7,branch:'home',kind:'keystone',finale:true}),
  // WAR · 地表干预: observation along the bottom row, then two columns —
  // proxy war rising under 代理人战争, intelligence and truce beside it.
  monitor: talent('地面监控',[128],{protocol:1},'接入地表实况，观看双方 AI 的真实战争；开启干预路线。',1020,935,'eye',{branch:'war'}),
  airdrop: talent('资源空投',[128],{monitor:1},'花费 Legacy 向选中文明空投金币，数额为其时代起始金币的两倍；每个文明最多五次，价格逐次翻倍。',850,935,'parachute',{branch:'war'}),
  weaving: talent('争端编织',[1024],{monitor:1},'可选自动配对空闲文明开战，优先匹配相近时代。',1200,935,'link',{branch:'war',kind:'specialist'}),
  patronage: talent('代理人战争',[256],{monitor:1},'花费 Legacy 强化指定文明的部队生命与伤害。',900,780,'sword',{branch:'war'}),
  bonds: talent('战争债券',[2048,32768],{monitor:1},'每场进行中的战争持续产出遗产，随双方中较低的时代翻倍；二级再翻倍。',1040,780,'legacy',{branch:'war'}),
  intel: talent('情报网络',[1024],{monitor:1},'挑起战争前显示双方胜率预估；交战中随基地与兵力实时更新。',1180,780,'radar',{branch:'war'}),
  // Advancing and blocking technology are two sides of one lever.
  technology: talent('技术馈赠',[512],{patronage:1},'让选中文明进化一个时代；技术馈赠不产生战争经验收益。',830,615,'spark',{branch:'war'}),
  regression: talent('知识封锁',[512],{patronage:1},'使文明倒退一个时代，销毁超时代部队、炮塔与订单。',970,615,'lock',{branch:'war'}),
  harvest: talent('轨道收割',[2048],{patronage:1},'直接毁灭选中文明并收获 Legacy；废墟不能重复收割。',1090,615,'beam',{branch:'war',kind:'keystone'}),
  ceasefire: talent('停火协议',[8192],{intel:1},'花费 Legacy 冻结一场战争 60 秒：双方停止行动，也不产生经验与债券收益。用来决定核毁灭何时到来。',1210,615,'truce',{branch:'war',kind:'specialist'}),
  doctrines: talent('战争学说',[4096],{patronage:1},'向交战文明逐档授予 I–V 的全部兵种特性；每档对应该时代的三个兵种，最多五档。',900,455,'shield',{branch:'war',kind:'keystone'}),
  superSoldiers: talent('超限战士',[32768],{doctrines:1},'为完成五档学说的未来文明开放超级士兵。AI 使用自己的金币招募，初始使用激光匕首。',900,300,'elite',{branch:'war',kind:'specialist'}),
  sniper: talent('天穹狙击',[131072],{superSoldiers:1},'为已获得超级士兵的文明授予狙击激光枪：远程锁定、引导后贯穿射击。',900,160,'rifle',{branch:'war',kind:'specialist'}),
});
export const ORBITAL_ACTIONS = Object.freeze({
  // One boost all but decides a war between equals, so the first costs what
  // the win pays — the loser's defeat value — and each further boost ×4.
  boost: {name:'军备扶持',talent:'patronage',baseCost:64,description:'部队生命与伤害 ×1.25，最多 5 次；价格随文明时代、轨道收益倍率上涨，每次 ×4。'},
  airdrop: {name:'资源空投',talent:'airdrop',baseCost:4,description:'空投其时代起始金币两倍的金币；价格随时代与收益倍率上涨，每次翻倍，最多 5 次。'},
  ceasefire: {name:'停火协议',talent:'ceasefire',baseCost:64,description:'冻结所在战争 60 秒；双方停止行动，不产生经验与债券收益。价格为较先进一方的击败价值。'},
  advance: {name:'技术馈赠',talent:'technology',baseCost:64,description:'进化一个时代，加入相应经验；不产生战争遗产。'},
  regress: {name:'知识封锁',talent:'regression',baseCost:128,description:'倒退一个时代；销毁超时代部队、炮塔和订单，原有经验归零至该时代门槛。'},
  doctrines: {name:'兵种学说',talent:'doctrines',costs:[128,512,2048,8192,32768],baseCost:128,description:'逐档开启对应时代三个兵种的全部特性；需要文明已到该时代且正在交战。'},
  superSoldiers: {name:'超级士兵计划',talent:'superSoldiers',baseCost:131072,description:'需要未来时代、五档学说与进行中的战争。开放激光匕首超级士兵，正常付费训练。'},
  sniper: {name:'狙击激光枪',talent:'sniper',baseCost:524288,description:'需要已开放超级士兵且正在交战。赋予锁定引导的远程狙击，现存超级士兵立即生效。'},
  harvest: {name:'毁灭收割',talent:'harvest',baseCost:0,description:'毁灭这一文明，终止其战争，立即收获其时代对应的遗产。'},
});
