// VII · Interplanetary: the solar system seen from above. Orbits follow the
// real order and Kepler's third law, compressed so the outer planets still
// move: one Earth year is EARTH_YEAR_SECONDS of simulation time.
import { TAU } from './celestial-clock.js';

export const EARTH_YEAR_SECONDS = 900;
// kind: home (Earth, where civilizations arise), moon, habitable (colonies),
// industrial (facilities only), relay (outer system, the way to VIII).
const body = (id, name, au, size, kind, color, description, extra = {}) => Object.freeze({ id, name, au, size, kind, color, description, ...extra });
export const BODIES = Object.freeze([
  body('mercury', '水星', .39, 4, 'industrial', '#a79c8a', '离太阳最近的岩石。适合铺设太阳能阵列，为所有行星工业供能。', { phase: 1.1 }),
  body('venus', '金星', .72, 6.5, 'industrial', '#d8c38f', '浓厚的酸性大气。高空浮空城可以采集大气，远期可以改造。', { phase: 3.7 }),
  body('earth', '地球', 1, 7, 'home', '#6f9c86', '文明自发萌芽的地方。VI 的战争与轮回在这里继续。', { phase: 0 }),
  body('mars', '火星', 1.52, 5.5, 'habitable', '#c07a5a', '稀薄干冷，资源稀缺。建起穹顶后可以接收地球的文明，它们会变得好战。', { phase: 2.1 }),
  body('belt', '小行星带', 2.7, 0, 'industrial', '#8f8a7c', '散落的岩石与金属。采矿扩大方舟载量。', { belt: true }),
  body('jupiter', '木星', 5.2, 16, 'industrial', '#c9a57c', '气态巨行星。采集燃料，缩短航程、放宽发射窗口。木卫二的冰下海洋可以殖民。', { phase: 4.2 }),
  body('saturn', '土星', 9.5, 13, 'habitable', '#d6c08e', '带环的气态巨行星。土卫六的甲烷湖与极寒考验每一个殖民文明。', { phase: 1.2, rings: true }),
  body('uranus', '天王星', 19.2, 9, 'relay', '#9cc3c4', '冰巨星。外太阳系的深空中继从这里开始。', { phase: 5.4 }),
  body('neptune', '海王星', 30, 9, 'relay', '#6f8fc0', '太阳系的边缘。越过这里，就是 VIII 的星海。', { phase: 3.3 }),
]);
export const bodyById = id => BODIES.find(b => b.id === id);
export const orbitalPeriod = au => EARTH_YEAR_SECONDS * au ** 1.5;
export const bodyAngle = (b, time) => (b.phase ?? 0) + time / orbitalPeriod(b.au) * TAU;
// Screen layout: a tilted, logarithmically spaced orrery in a 1000×500 frame.
export const SYSTEM = Object.freeze({ cx: 500, cy: 250, tilt: .56, sun: 18 });
// Log spacing, eased so the inner planets get room away from the sun's glare.
export const orbitRadius = au => 58 + 85 * Math.log2(1 + au) ** .88;
export function bodyPosition(b, time) {
  const a = bodyAngle(b, time), r = orbitRadius(b.au);
  // depth > 0 is the near half of the orbit (drawn in front of the sun).
  return { x: SYSTEM.cx + Math.cos(a) * r, y: SYSTEM.cy + Math.sin(a) * r * SYSTEM.tilt, depth: Math.sin(a), angle: a, r };
}
