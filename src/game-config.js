// Alternate weapons share one balance source with talents, simulation and previews.
export const SUPER_WEAPONS = Object.freeze({
  // The dagger reaches 32, but anything inside meleeSwitch is already too close
  // to aim a rifle at: the soldier lowers it, steps in and stabs.
  meleeRange: 32, meleeSwitch: 120, daggerTip: 14,
  sniper: Object.freeze({ damage: 1800, range: 520, baseRange: 620, attackInterval: 2.4, chargeTime: 1.1, muzzleX: 60 }),
});

// Pure simulation. Timings are seconds; positions are in battlefield coordinates.
export const UNITS = Object.freeze({
  melee: Object.freeze({ name: '棍棒人', age: 1, role: 'melee', cost: 30, trainTime: 1.6, health: 70, damage: 12, armor: 0, speed: 62, range: 32, attackInterval: 0.8, bounty: 10, experience: 20, lane: 'front', description: '廉价前排 · 重棍挥击', attackDuration: 0.42, height: 61 }),
  archer: Object.freeze({ name: '弹弓手', age: 1, role: 'archer', projectile: 'sling', cost: 45, trainTime: 2.4, health: 42, damage: 14, armor: 0, speed: 54, range: 190, attackInterval: 1.2, bounty: 15, experience: 28, lane: 'back', description: '脆弱后排 · 弧线石弹', attackDuration: 0.38, muzzleX: 25, muzzleY: -43, height: 57 }),
  heavy: Object.freeze({ name: '恐龙骑兵', age: 1, role: 'heavy', cost: 85, trainTime: 4, health: 170, damage: 26, armor: 3, speed: 36, range: 60, attackInterval: 1.3, bounty: 25, experience: 45, lane: 'front', description: '巨兽前排 · 咬击两人，副目标 45% 伤害', cleaveRadius: 60, cleaveFactor: 0.45, footprint: 42, attackDuration: 0.6, height: 89 }),
  swordsman: Object.freeze({ name: '盾剑士', age: 2, role: 'melee', cost: 50, trainTime: 2, health: 115, damage: 20, armor: 1, speed: 66, range: 34, attackInterval: 0.85, bounty: 17, experience: 30, lane: 'front', description: '盾牌防线 · 单体弹药减伤 30%，完全穿甲除外', rangedReduction: 0.3, attackDuration: 0.4, height: 70 }),
  crossbow: Object.freeze({ name: '长弓手', age: 2, role: 'archer', projectile: 'arrow', cost: 75, trainTime: 3, health: 65, damage: 30, armor: 0, speed: 50, range: 230, attackInterval: 1.5, bounty: 24, experience: 42, lane: 'back', description: '长弓压制 · 射程长，需前排保护', attackDuration: 0.4, muzzleX: 29, muzzleY: -42, height: 66 }),
  knight: Object.freeze({ name: '重甲骑士', age: 2, role: 'heavy', cost: 130, trainTime: 4.8, health: 270, damage: 42, armor: 5, speed: 68, range: 72, attackInterval: 1.4, bounty: 40, experience: 65, lane: 'front', description: '骑马冲锋 · 连续前进 80 距离后首击 +32', chargeDistance: 80, chargeDamage: 32, footprint: 44, attackDuration: 0.5, height: 105 }),
  duelist: Object.freeze({ name: '决斗士', age: 3, role: 'melee', cost: 80, trainTime: 2.2, health: 205, damage: 29, armor: 3, speed: 72, range: 46, attackInterval: 0.65, bounty: 28, experience: 46, lane: 'front', description: '迅捷刺击 · 忽略 3 点护甲', armorPierce: 3, attackDuration: 0.3, height: 72 }),
  musketeer: Object.freeze({ name: '火枪手', age: 3, role: 'archer', projectile: 'bullet', cost: 115, trainTime: 3.2, health: 110, damage: 60, armor: 1, speed: 48, range: 255, attackInterval: 1.7, bounty: 40, experience: 65, lane: 'back', description: '火绳枪 · 单发穿甲，克制重装与盾牌', ignoreArmor: true, attackDuration: 0.48, muzzleX: 50, muzzleY: -46, height: 71 }),
  cannoneer: Object.freeze({ name: '野战炮组', age: 3, role: 'heavy', projectile: 'cannon', splash: 55, cost: 210, trainTime: 5.2, health: 380, damage: 95, armor: 7, speed: 30, range: 185, baseRange: 360, attackInterval: 2.1, bounty: 70, experience: 110, lane: 'front', description: '轮式火炮 · 远距攻城 / 55 范围爆炸', footprint: 38, attackDuration: 0.65, muzzleX: 51, muzzleY: -35, height: 61 }),
  commando: Object.freeze({ name: '匕首突击兵', age: 4, role: 'melee', cost: 130, trainTime: 2.4, health: 340, damage: 56, armor: 6, speed: 76, range: 58, attackInterval: 0.65, bounty: 45, experience: 80, lane: 'front', description: '匕首突击 · 压低重心，近距快速刺击', attackDuration: 0.34, height: 65 }),
  rifleman: Object.freeze({ name: '自动步枪兵', age: 4, role: 'archer', projectile: 'bullet', cost: 190, trainTime: 3.4, health: 185, damage: 30, armor: 3, speed: 54, range: 270, attackInterval: 1.1, bounty: 65, experience: 110, lane: 'back', description: '三连点射 · 每轮 3 发，每发 30 伤害', burst: 3, burstInterval: 0.12, attackDuration: 0.16, muzzleX: 45, muzzleY: -34, height: 61 }),
  tank: Object.freeze({ name: '主战坦克', age: 4, role: 'heavy', projectile: 'shell', splash: 70, cost: 350, trainTime: 5.6, health: 720, damage: 145, armor: 14, speed: 26, range: 200, baseRange: 420, attackInterval: 1.9, bounty: 120, experience: 180, lane: 'front', description: '履带装甲 · 远距攻城 / 70 范围炮击', footprint: 47, attackDuration: 0.6, muzzleX: 67, muzzleY: -44, height: 63 }),
  blade: Object.freeze({ name: '光刃战士', age: 5, role: 'melee', ignoreArmor: true, cost: 220, trainTime: 2.6, health: 550, damage: 90, armor: 10, speed: 82, range: 40, attackInterval: 0.6, bounty: 70, experience: 140, lane: 'front', description: '光刃突进 · 近战完全无视护甲', attackDuration: 0.3, height: 73 }),
  blaster: Object.freeze({ name: '等离子射手', age: 5, role: 'archer', projectile: 'plasma', cost: 300, trainTime: 3.6, health: 300, damage: 85, armor: 5, speed: 56, range: 300, attackInterval: 0.65, bounty: 100, experience: 180, lane: 'back', description: '能量火力 · 300 射程 / 忽略 8 点护甲', armorPierce: 8, attackDuration: 0.38, muzzleX: 44, muzzleY: -43, height: 74 }),
  superSoldier: Object.freeze({ name: '超级士兵', age: 5, role: 'heavy', playerOnly: true, projectile: 'plasma', ignoreArmor: true, cost: 3000, trainTime: 12, health: 6000, damage: 320, meleeDamage: 440, meleeRange: SUPER_WEAPONS.meleeRange, meleeSwitch: SUPER_WEAPONS.meleeSwitch, meleeInterval: 0.55, chargeTime: 0, armor: 32, speed: 48, range: 340, baseRange: 540, attackInterval: 0.55, bounty: 600, experience: 800, lane: 'front', description: '独行精锐 · 全覆轻甲，320 能量穿甲点射 / 近身 440 激光匕首', attackDuration: 0.4, muzzleX: 35, muzzleY: -43, height: 68 }),
  warMachine: Object.freeze({ name: '悬浮战争机器', age: 5, role: 'heavy', projectile: 'plasma-orb', splash: 90, cost: 580, trainTime: 6, health: 1200, damage: 235, armor: 22, speed: 23, range: 220, baseRange: 500, attackInterval: 1.8, bounty: 200, experience: 300, lane: 'front', description: '悬浮重炮 · 远距攻城 / 90 范围能量爆破', footprint: 48, attackDuration: 0.6, muzzleX: 55, muzzleY: -46, height: 74 }),
});

export const RULES = Object.freeze({
  width: 1280, height: 480,
  baseHealth: 600, baseHalfWidth: 54, playerBaseX: 108, enemyBaseX: 1172,
  startingGold: 180, goldPerSecond: 7,
  unitSpacing: 30, armyLimit: 16, queueLimit: 5,
  aiFirstDecision: 2.4, aiDecisionInterval: 1.8,
  casualtyExperienceRate: 0.75,
  turretExpansionCosts: Object.freeze([100, 160, 240]), maxTurretSlots: 4,
  fixedStep: 1 / 60,
});

export const TURRETS = Object.freeze({
  rockSling: Object.freeze({ name: '弹石器', age: 1, cost: 120, damage: 24, interval: 1.5, range: 290, projectile: 'stone', arc: 48, muzzleX: 16, muzzleY: -29, description: '弹力抛石 · 低成本单体防御' }),
  egg: Object.freeze({ name: '自动蛋塔', age: 1, cost: 150, damage: 9, interval: 0.36, range: 245, projectile: 'egg', arc: 16, muzzleX: 22, muzzleY: -25, description: '快速抛蛋 · 压制轻装，惧怕重甲' }),
  primitiveCatapult: Object.freeze({ name: '原始投石机', age: 1, cost: 220, damage: 52, interval: 2.6, range: 330, projectile: 'boulder', arc: 85, splash: 35, muzzleX: 11, muzzleY: -37, description: '巨石高抛 · 慢速重击 / 小范围砸击' }),
  catapult: Object.freeze({ name: '重型投石机', age: 2, cost: 240, damage: 60, interval: 2, range: 350, projectile: 'boulder', arc: 90, splash: 55, muzzleX: 11, muzzleY: -39, description: '配重投掷 · 范围打击密集部队' }),
  fireCatapult: Object.freeze({ name: '火焰投石机', age: 2, cost: 300, damage: 28, interval: 2.8, range: 330, projectile: 'fireball', arc: 90, splash: 45, field: 'fire', fieldRadius: 55, fieldDuration: 2.4, tickDamage: 6, tickInterval: 0.4, muzzleX: 11, muzzleY: -39, description: '火弹落地燃烧 2.4 秒 · 每 0.4 秒灼烧 6 生命，无视护甲' }),
  oil: Object.freeze({ name: '沸油锅', age: 2, cost: 260, damage: 16, interval: 3.1, range: 175, projectile: 'oil', arc: 5, splash: 35, ignoreArmor: true, field: 'oil', fieldRadius: 45, fieldDuration: 2.4, tickDamage: 5, tickInterval: 0.4, slow: 0.55, muzzleX: 20, muzzleY: -17, description: '近城倾油 · 油区持续 2.4 秒，移速降至 55%，每 0.4 秒烫伤 5 生命' }),
  smallCannon: Object.freeze({ name: '轻型加农炮', age: 3, cost: 260, damage: 70, interval: 1.2, range: 350, projectile: 'cannon', arc: 0, armorPierce: 3, aimable: true, muzzleX: 30, muzzleY: -19, description: '直射实心弹 · 忽略 3 点护甲' }),
  largeCannon: Object.freeze({ name: '重型加农炮', age: 3, cost: 380, damage: 125, interval: 1.8, range: 375, projectile: 'cannon', arc: 0, ignoreArmor: true, aimable: true, muzzleX: 33, muzzleY: -19, description: '长炮管重弹 · 单体完全穿甲' }),
  explosiveCannon: Object.freeze({ name: '爆破加农炮', age: 3, cost: 480, damage: 100, interval: 2.5, range: 370, projectile: 'shell', arc: 65, splash: 95, muzzleX: 24, muzzleY: -30, description: '榴弹曲射 · 95 范围爆破，清理密集阵线' }),
  singleTurret: Object.freeze({ name: '单管炮塔', age: 4, cost: 420, damage: 76, interval: 0.65, range: 350, projectile: 'bullet', arc: 0, armorPierce: 4, aimable: true, muzzleX: 31, muzzleY: -22, description: '稳定点射 · 忽略 4 点护甲' }),
  doubleTurret: Object.freeze({ name: '双管炮塔', age: 4, cost: 560, damage: 62, interval: 1.05, range: 385, projectile: 'bullet', arc: 0, burst: 2, burstInterval: 0.16, aimable: true, muzzleX: 32, muzzleY: -22, barrelGap: 7, description: '双管交替 · 每轮 2 发，间隔 0.16 秒；丢失目标即停射' }),
  rocket: Object.freeze({ name: '火箭发射塔', age: 4, cost: 640, damage: 160, interval: 2.3, range: 400, projectile: 'rocket', arc: 45, splash: 105, muzzleX: 23, muzzleY: -32, description: '导轨火箭 · 105 范围轰炸' }),
  titanium: Object.freeze({ name: '钛金射击塔', age: 5, cost: 720, damage: 100, interval: 0.7, range: 380, projectile: 'rail', arc: 0, armorPierce: 10, pierce: 1, pierceFactor: 0.6, pierceDistance: 90, aimable: true, muzzleX: 32, muzzleY: -22, description: '动能贯穿 · 忽略 10 护甲，再贯穿后方 90 距离内 1 人，伤害 60%' }),
  laser: Object.freeze({ name: '激光炮塔', age: 5, cost: 900, damage: 45, interval: 0.22, range: 430, projectile: 'laser', arc: 0, ignoreArmor: true, aimable: true, muzzleX: 31, muzzleY: -23, description: '高频激光脉冲 · 单体完全穿甲' }),
  ion: Object.freeze({ name: '离子射线塔', age: 5, cost: 1200, damage: 250, interval: 2.2, chargeTime: 0.65, range: 450, projectile: 'ion', arc: 0, ignoreArmor: true, pierce: 2, pierceFactor: 0.65, pierceDistance: 130, aimable: true, muzzleX: 25, muzzleY: -23, description: '充能 0.65 秒 · 完全穿甲，再贯穿后方 130 距离内 2 人，伤害 65%' }),
});

export const ABILITIES = Object.freeze({
  meteor: Object.freeze({ name: '陨星天降', cooldown: 40, delay: 0.8, radius: 140, damage: 110, baseDamage: 40, waves: 1, waveInterval: 0, ignoreArmor: true, description: '单次范围轰击 · 无视护甲' }),
  volley: Object.freeze({ name: '箭雨齐射', cooldown: 45, delay: 0.45, radius: 210, damage: 32, baseDamage: 12, waves: 4, waveInterval: 0.35, ignoreArmor: false, description: '四波箭雨 · 大范围压制' }),
  renewal: Object.freeze({ name: '复苏之光', icon: '✚', targeting: 'allies', cooldown: 50, duration: 8, healing: 18, description: '全场友军持续回血' }),
  airstrike: Object.freeze({ name: '轰炸空袭', icon: '✈', cooldown: 50, delay: 0.85, radius: 95, sweep: 140, damage: 150, baseDamage: 45, waves: 3, waveInterval: 0.4, ignoreArmor: false, description: '三枚炸弹 · 从左向右轰炸' }),
  orbital: Object.freeze({ name: '轨道打击', icon: '⊕', cooldown: 55, delay: 1.25, radius: 180, damage: 450, baseDamage: 140, waves: 1, waveInterval: 0, ignoreArmor: true, description: '轨道光束 · 无视护甲' }),
});

export const AGES = Object.freeze({
  1: Object.freeze({ startingGold: 180, name: '原始时代', shortName: '原始', numeral: 'I', units: Object.freeze(['melee', 'archer', 'heavy']), turrets: Object.freeze(['rockSling', 'egg', 'primitiveCatapult']), ability: 'meteor', experienceRequired: 0, baseHealth: RULES.baseHealth, income: 7, unitIcons: Object.freeze(['⚔', '➶', '⬟']), turretIcons: Object.freeze(['◈', '➶', '♨']) }),
  2: Object.freeze({ startingGold: 300, name: '中世纪', shortName: '中世纪', numeral: 'II', units: Object.freeze(['swordsman', 'crossbow', 'knight']), turrets: Object.freeze(['catapult', 'fireCatapult', 'oil']), ability: 'volley', experienceRequired: 160, baseHealth: 900, income: 10, unitIcons: Object.freeze(['⚔', '⌁', '♜']), turretIcons: Object.freeze(['⌖', '⋙', '●']) }),
  3: Object.freeze({ startingGold: 480, name: '文艺复兴时代', shortName: '文艺复兴', numeral: 'III', units: Object.freeze(['duelist', 'musketeer', 'cannoneer']), turrets: Object.freeze(['smallCannon', 'largeCannon', 'explosiveCannon']), ability: 'renewal', experienceRequired: 480, baseHealth: 1500, income: 16, unitIcons: Object.freeze(['⚔', '⌐', '◉']), turretIcons: Object.freeze(['●', '⋙', '◒']) }),
  4: Object.freeze({ startingGold: 720, name: '现代时代', shortName: '现代', numeral: 'IV', units: Object.freeze(['commando', 'rifleman', 'tank']), turrets: Object.freeze(['singleTurret', 'doubleTurret', 'rocket']), ability: 'airstrike', experienceRequired: 1100, baseHealth: 2400, income: 24, unitIcons: Object.freeze(['⚔', '⌁', '▰']), turretIcons: Object.freeze(['⋙', '═', '➚']) }),
  5: Object.freeze({ startingGold: 1080, name: '未来时代', shortName: '未来', numeral: 'V', units: Object.freeze(['blade', 'blaster', 'warMachine']), specialUnits: Object.freeze(['superSoldier']), turrets: Object.freeze(['titanium', 'laser', 'ion']), ability: 'orbital', experienceRequired: 2200, baseHealth: 3800, income: 36, unitIcons: Object.freeze(['ϟ', '⊙', '♜']), turretIcons: Object.freeze(['⊙', 'ϟ', '⊕']) }),
});

