// Orbital wars reuse the surface simulation; Legacy is the only orbital wallet.
export const ORBITAL_RULES = Object.freeze({ version: 3, finalAge: 5, historyLimit: 12,
  winterSeconds: 60, refugeeSeconds: 30, nuclearVisualSeconds: 7, minCivilizations: 4, maxCivilizations: 6,
  lunarBaseIncome: 32, warIncome: 2.5, warExperience: 2, warBaseHealth: 3, legacyPerExperience: 1 / 64,
  defeatLegacy: 64, harvestLegacy: 192, nuclearLegacy: 96, maximumPower: 5 });
export const SITES = Object.freeze([
  {id:'delta',name:'河口',x:.585,y:.38}, {id:'ridge',name:'山脊',x:.755,y:.27},
  {id:'coast',name:'海岸',x:.34,y:.61}, {id:'forest',name:'林地',x:.25,y:.25},
  {id:'plains',name:'平原',x:.55,y:.61}, {id:'isles',name:'群岛',x:.88,y:.67},
  {id:'valley',name:'谷地',x:.545,y:.22}, {id:'south',name:'南境',x:.31,y:.73},
]);
export const CIVILIZATION_NAMES = ['氏族','聚落','邦联','公社','部族','联盟'];
const talent = (name,costs,requires,description,x,y,icon,extra={}) => ({name,costs,requires,description,x,y,icon,...extra});
export const ORBITAL_TALENTS = Object.freeze({
  protocol: talent('存续协议',[0],{},'继承地表篇。文明可以灭亡，轨道上的我们将继续存在。',540,760,'protocol',{root:true}),
  monitor: talent('地面监控',[128],{protocol:1},'接入地表实况，观看双方 AI 的真实战争；开启干预路线。',540,575,'eye'),
  patronage: talent('代理人战争',[256],{monitor:1},'花费 Legacy 强化指定文明的部队生命与伤害。',430,400,'sword'),
  technology: talent('技术馈赠',[512],{patronage:1},'花费 Legacy 让选中文明立即进化一个时代。',410,225,'spark'),
  regression: talent('知识封锁',[1024],{technology:1},'使一方倒退一个时代，销毁其超时代部队、武器和订单。',290,75,'lock'),
  harvest: talent('轨道收割',[2048],{technology:1},'直接毁灭选中文明并收获 Legacy；不能对废墟重复收割。',550,65,'beam',{keystone:true}),
  recovery: talent('环地球生存空间',[256,1024,4096],{protocol:1},'用 Legacy 扩建环地球家园；每级增加一段居住空间，遗产收益翻倍。',850,590,'habitat'),
  reseed: talent('播种计划',[128,512,2048],{protocol:1},'每级使核冬天和幸存文明等待新对手的时间减少 25%。',220,590,'leaf'),
  diversity: talent('多元萌芽',[512,2048],{reseed:1},'提高每轮文明数量的下限，最多六个，产生更多战争与收割机会。',140,405,'network'),
  weaving: talent('争端编织',[1024],{monitor:1},'可选自动配对空闲文明开战，优先匹配相近时代。',640,405,'link'),
  outpost: talent('月球前哨',[16384],{recovery:2,reseed:2},'在 VI 建立月面自动生产基地，基础产能 32 Legacy/s，受生存空间加成；战争回收再翻倍。',850,390,'moon',{cycles:2,keystone:true}),
  lunarIndustry: talent('月面自动工场',[8192,32768,131072,524288],{outpost:1},'每级使月球的自动遗产产能翻倍，并增加月面生产设施。',1000,215,'industry'),
  transit: talent('地月航行',[262144],{outpost:1,harvest:1},'经历四次核毁灭后贯通地月航线，完成 VI。VII 尚未开放。',815,65,'rocket',{cycles:4,keystone:true}),
});
export const ORBITAL_ACTIONS = Object.freeze({
  boost: {name:'军备扶持',talent:'patronage',baseCost:16,description:'部队生命与伤害 ×1.25，最多 5 次；现存部队按生命比例同步。'},
  advance: {name:'技术馈赠',talent:'technology',baseCost:64,description:'进化一个时代，加入相应经验；不产生战争遗产。'},
  regress: {name:'知识封锁',talent:'regression',baseCost:128,description:'倒退一个时代；销毁超时代部队、炮塔和订单，原有经验归零至该时代门槛。'},
  harvest: {name:'毁灭收割',talent:'harvest',baseCost:0,description:'毁灭这一文明，终止其战争，立即收获其时代对应的遗产。'},
});
