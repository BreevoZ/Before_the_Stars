// Orbital wars reuse the surface simulation; Legacy is the only orbital wallet.
export const ORBITAL_RULES = Object.freeze({ version: 4, finalAge: 5, historyLimit: 12,
  winterSeconds: 60, refugeeSeconds: 30, nuclearVisualSeconds: 7, minCivilizations: 4, maxCivilizations: 6,
  habitatSections: 7, lunarRotationSeconds: 180, lunarBaseIncome: 32, warIncome: 2.5, warBaseHealth: 3,
  // A civilization should take minutes, not one, to climb from I to V: each
  // age lasts ~35–40 s of war. Legacy per experience rises by the same factor,
  // so the war income per second stays where it was.
  warExperience: .6, legacyPerExperience: 1 / 20,
  defeatLegacy: 64, harvestLegacy: 192, nuclearLegacy: 96, maximumPower: 5 });
export const SITES = Object.freeze([
  {id:'delta',name:'河口',x:.585,y:.38}, {id:'ridge',name:'山脊',x:.755,y:.27},
  {id:'coast',name:'海岸',x:.34,y:.61}, {id:'forest',name:'林地',x:.25,y:.25},
  {id:'plains',name:'平原',x:.55,y:.61}, {id:'isles',name:'群岛',x:.88,y:.67},
  {id:'valley',name:'谷地',x:.545,y:.22}, {id:'south',name:'南境',x:.31,y:.73},
]);
export const CIVILIZATION_NAMES = ['氏族','聚落','邦联','公社','部族','联盟'];
const talent = (name,costs,requires,description,x,y,icon,extra={}) => ({name,costs,requires,description,x,y,icon,...extra});
// Routes are separate subtrees; later unlocks never draw across another route.
export const ORBITAL_TALENTS = Object.freeze({
  protocol: talent('存续协议',[0],{},'继承地表篇。文明可以灭亡，轨道上的我们将继续存在。',640,1110,'protocol',{root:true,kind:'keystone',branch:'root'}),
  reseed: talent('播种计划',[128,512,2048],{protocol:1},'每级缩短 25% 核冬天和幸存文明等待新对手的时间。',180,915,'leaf',{branch:'life'}),
  diversity: talent('多元萌芽',[512,2048],{reseed:1},'提高每轮文明数量的下限，最多六个。',145,685,'network',{branch:'life',kind:'specialist'}),
  monitor: talent('地面监控',[128],{protocol:1},'接入地表实况，观看双方 AI 的真实战争；开启干预路线。',640,915,'eye',{branch:'war'}),
  weaving: talent('争端编织',[1024],{monitor:1},'可选自动配对空闲文明开战，优先匹配相近时代。',360,765,'link',{branch:'war',kind:'specialist'}),
  patronage: talent('代理人战争',[256],{monitor:1},'花费 Legacy 强化指定文明的部队生命与伤害。',615,685,'sword',{branch:'war'}),
  technology: talent('技术馈赠',[512],{patronage:1},'让选中文明进化一个时代；技术馈赠不产生战争经验收益。',480,465,'spark',{branch:'war'}),
  regression: talent('知识封锁',[1024],{technology:1},'使文明倒退一个时代，销毁超时代部队、炮塔与订单。',355,250,'lock',{branch:'war',kind:'specialist'}),
  harvest: talent('轨道收割',[2048],{technology:1},'直接毁灭选中文明并收获 Legacy；废墟不能重复收割。',535,250,'beam',{branch:'war',kind:'keystone'}),
  doctrines: talent('战争学说',[4096],{patronage:1},'向交战文明逐档授予 I–V 的全部兵种特性；每档对应该时代的三个兵种，最多五档。',770,465,'shield',{branch:'war',kind:'keystone'}),
  superSoldiers: talent('超限战士',[32768],{doctrines:1},'为完成五档学说的未来文明开放超级士兵。AI 使用自己的金币招募，初始使用激光匕首。',770,265,'elite',{branch:'war',kind:'specialist'}),
  sniper: talent('天穹狙击',[131072],{superSoldiers:1},'为已获得超级士兵的文明授予狙击激光枪：远程锁定、引导后贯穿射击。',770,75,'rifle',{branch:'war',kind:'specialist'}),
  recovery: talent('环地球生存空间',[256,1024,4096,16384,65536,262144,1048576],{protocol:1},'每级建成七分之一居住环，遗产收益翻倍。第七段接合后，星环完整环绕地球。',1100,915,'habitat',{branch:'home',kind:'keystone'}),
  outpost: talent('月球前哨',[65536],{recovery:2},'建立 VI 月面生产基地，基础产能 32 Legacy/s，受星环加成；战争回收再翻倍。',1100,685,'moon',{cycles:2,branch:'home',kind:'keystone'}),
  lunarIndustry: talent('月面自动工场',[131072,524288,2097152,8388608],{outpost:1},'每级月面产能翻倍；扩建采掘场、太阳翼与自动生产枢纽。',1230,475,'industry',{branch:'home'}),
  transit: talent('地月航行',[4194304],{outpost:1},'经历四次核毁灭后贯通地月航线，完成 VI。居住环与月面生产继续运转。',1100,220,'rocket',{cycles:4,branch:'home',kind:'specialist'}),
});
export const ORBITAL_ACTIONS = Object.freeze({
  boost: {name:'军备扶持',talent:'patronage',baseCost:16,description:'部队生命与伤害 ×1.25，最多 5 次；现存部队按生命比例同步。'},
  advance: {name:'技术馈赠',talent:'technology',baseCost:64,description:'进化一个时代，加入相应经验；不产生战争遗产。'},
  regress: {name:'知识封锁',talent:'regression',baseCost:128,description:'倒退一个时代；销毁超时代部队、炮塔和订单，原有经验归零至该时代门槛。'},
  doctrines: {name:'兵种学说',talent:'doctrines',costs:[128,512,2048,8192,32768],baseCost:128,description:'逐档开启对应时代三个兵种的全部特性；需要文明已到该时代且正在交战。'},
  superSoldiers: {name:'超级士兵计划',talent:'superSoldiers',baseCost:131072,description:'需要未来时代、五档学说与进行中的战争。开放激光匕首超级士兵，正常付费训练。'},
  sniper: {name:'狙击激光枪',talent:'sniper',baseCost:524288,description:'需要已开放超级士兵且正在交战。赋予锁定引导的远程狙击，现存超级士兵立即生效。'},
  harvest: {name:'毁灭收割',talent:'harvest',baseCost:0,description:'毁灭这一文明，终止其战争，立即收获其时代对应的遗产。'},
});
