// Orbital wars reuse the surface simulation; Legacy is the only orbital wallet.
export const ORBITAL_RULES = Object.freeze({ version: 2, finalAge: 5, historyLimit: 12,
  winterSeconds: 60, refugeeSeconds: 30, nuclearVisualSeconds: 7, minCivilizations: 4, maxCivilizations: 6,
  warIncome: 2.5, warExperience: 2, warBaseHealth: 3, legacyPerExperience: 1 / 64,
  defeatLegacy: 64, harvestLegacy: 192, nuclearLegacy: 96, maximumPower: 5 });
export const SITES = Object.freeze([
  {id:'delta',name:'河口',x:.36,y:.59}, {id:'ridge',name:'山脊',x:.59,y:.31},
  {id:'coast',name:'海岸',x:.74,y:.55}, {id:'forest',name:'林地',x:.27,y:.34},
  {id:'plains',name:'平原',x:.64,y:.70}, {id:'isles',name:'群岛',x:.82,y:.39},
  {id:'valley',name:'谷地',x:.38,y:.41}, {id:'south',name:'南境',x:.43,y:.78},
]);
export const CIVILIZATION_NAMES = ['氏族','聚落','邦联','公社','部族','联盟'];
const talent = (name,costs,requires,description,x,y,icon,extra={}) => ({name,costs,requires,description,x,y,icon,...extra});
export const ORBITAL_TALENTS = Object.freeze({
  protocol: talent('存续协议',[0],{},'继承地表篇。文明可以灭亡，轨道上的我们将继续存在。',450,790,'orbit',{root:true}),
  monitor: talent('地面监控',[128],{protocol:1},'接入地表实况，观看双方 AI 的真实战争；开启干预路线。',450,630,'eye'),
  patronage: talent('代理人战争',[256],{monitor:1},'花费 Legacy 强化指定文明的部队生命与伤害。',320,470,'sword'),
  technology: talent('技术馈赠',[512],{patronage:1},'花费 Legacy 让选中文明立即进化一个时代。',250,310,'spark'),
  regression: talent('知识封锁',[1024],{technology:1},'使一方倒退一个时代，销毁其超时代部队、武器和订单。',150,150,'lock'),
  harvest: talent('轨道收割',[2048],{technology:1},'直接毁灭选中文明并收获 Legacy；不能对废墟重复收割。',365,150,'beam',{keystone:true}),
  recovery: talent('遗产回收',[256,1024,4096],{protocol:1},'每级让轨道的战争、歼灭和核毁灭收益翻倍。',700,630,'archive'),
  reseed: talent('播种计划',[128,512,2048],{protocol:1},'每级使核冬天和幸存文明等待新对手的时间减少 25%。',200,630,'leaf'),
  diversity: talent('多元萌芽',[512,2048],{reseed:1},'提高每轮文明数量的下限，最多六个，产生更多战争与收割机会。',100,470,'nodes'),
  weaving: talent('争端编织',[1024],{monitor:1},'可选自动配对空闲文明开战，优先匹配相近时代。',580,470,'link'),
  outpost: talent('月球前哨',[16384],{recovery:2,reseed:2},'经历两次核毁灭后，将家园扩展到月面；轨道收益再翻倍。',700,310,'moon',{cycles:2,keystone:true}),
  transit: talent('地月航行',[262144],{outpost:1,harvest:1},'经历四次核毁灭后贯通地月航线，完成 VI。VII 尚未开放。',600,70,'star',{cycles:4,keystone:true}),
});
export const ORBITAL_ACTIONS = Object.freeze({
  boost: {name:'军备扶持',talent:'patronage',baseCost:16,description:'部队生命与伤害 ×1.25，最多 5 次；现存部队按生命比例同步。'},
  advance: {name:'技术馈赠',talent:'technology',baseCost:64,description:'进化一个时代，加入相应经验；不产生战争遗产。'},
  regress: {name:'知识封锁',talent:'regression',baseCost:128,description:'倒退一个时代；销毁超时代部队、炮塔和订单，原有经验归零至该时代门槛。'},
  harvest: {name:'毁灭收割',talent:'harvest',baseCost:0,description:'毁灭这一文明，终止其战争，立即收获其时代对应的遗产。'},
});
