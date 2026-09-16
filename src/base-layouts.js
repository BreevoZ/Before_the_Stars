// Coordinates face into the battlefield. Architecture, weapons and simulation
// share these sockets; a purchased extension stays in place after selling its gun.
// Preserve the horizontal positions so the redesign retains existing range boundaries.
export const BASE_MOUNTS = Object.freeze(Object.fromEntries(Object.entries({
  1: [[36, -62], [-34, -104], [24, -122], [-27, -155]],
  2: [[36, -99], [-34, -122], [28, -158], [-29, -194]],
  3: [[38, -54], [-35, -66], [27, -90], [-29, -94]],
  4: [[34, -62], [-33, -70], [25, -104], [-27, -132]],
  5: [[36, -65], [-34, -104], [25, -139], [-28, -179]],
}).map(([age, mounts]) => [age, Object.freeze(mounts.map(([x, y]) => Object.freeze({ x, y })))])));

export const BASE_DESIGNS = Object.freeze({
  1: { name: '巨岩营地', description: '不规则岩棚、兽骨洞口与兽皮营帐；炮位凿入岩脊。' },
  2: { name: '尖塔城堡', description: '高耸尖顶、雉堞角楼与吊闸；炮位沿城楼向上扩建。' },
  3: { name: '星形棱堡', description: '低矮斜墙、尖角炮垒与赤陶屋顶；炮位嵌入层叠棱堡。' },
  4: { name: '战地机库', description: '宽体卷帘门、厚混凝土顶板与雷达；炮位连接屋顶和指挥舱。' },
  5: { name: '环核枢纽', description: '开放式反应环、悬浮晶核与弯曲支臂；炮位生长于装甲翼端。' },
});
