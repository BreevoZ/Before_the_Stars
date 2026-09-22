import { Q } from './quantity.js';
import { BODIES, CIVILIZATION_AGES, ORBITAL_STRUCTURES as S, POLICIES, INTERVENTIONS, ORBITAL_RULES as R } from './orbital-config.js';
import { civilizationAge, civilizationRates, tributeReward } from './celestial-economy.js';
import { orbitalRates, orbitalIncome, orbitalMilestone, getConstructionState, getInterventionState, findCivilization } from './orbital-game.js';
export const orbitalTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const round = value => value.toFixed(1);
export function buildOrbitalViewModel(session, { paused = false } = {}) {
  const o = session.orbital, active = session.run.phase === 'orbital' && o?.started;
  const vm = { 'body@data-orbital-active': String(Boolean(active)), '#orbital-game@hidden': !active };
  if (!active) return vm;
  const rates = orbitalRates(o), milestone = orbitalMilestone(o), moon = o.selectedBody === 'moon';
  Object.assign(vm, {
    '#colony-legacy': Q.format(session.permanent.legacy), '#colony-income': `+${round(orbitalIncome(o))}/秒`,
    '#colony-energy': `${Q.format(Q.floor(o.energy))} / ${rates.capacity}`, '#colony-power': `+${rates.power}/秒`,
    '#colony-energy@title': `应急电源 2 + 太阳翼 ${o.structures.solar * R.powerPerSolar} + 月球前哨 ${o.structures.outpost * 4} + 聚变堆 ${o.structures.reactor * R.powerPerReactor} 能量/秒`,
    '#colony-income@title': '遗产取决于人口、时代、影响力与政策；纷争达到 65 时收入降为 40%。居住舱与治理中继提供额外加成。',
    '#colony-time': orbitalTime(o.elapsed), '#colony-pause': paused ? '继续' : '暂停', '#colony-pause@aria-pressed': String(paused),
    '#colony-speed': `${session.permanent.settings.speed}×`, '#colony-speed@hidden': session.debug === true,
    '#colony-debug-speed@hidden': session.debug !== true, '#colony-debug-speed@value': String(session.debugSpeed ?? 1),
    '#colony-objective': milestone.name, '#colony-objective-detail': milestone.detail,
    '#colony-complete@hidden': o.completionAt === null,
    '#colony-complete': o.completionAt === null ? '' : `VI 完成 · ${orbitalTime(o.completionAt)} · 地月航线已贯通`,
    '#colony-body-name': BODIES[o.selectedBody].subtitle,
    '#observe-earth@aria-pressed': String(!moon), '#observe-moon@aria-pressed': String(moon), '#observe-moon@disabled': !o.structures.survey,
    '#colony-civilizations@hidden': moon, '#colony-civilization@hidden': moon, '#colony-lunar@hidden': !moon,
    '#colony-lunar-detail': o.structures.outpost ? `月面前哨在线 · 聚变堆 ${o.structures.reactor} 级 · 能量供给 ${o.structures.outpost * 4 + o.structures.reactor * 8}/秒` : '探测器已绘制月面。建造前哨，让这片沉静的荒原成为第二处家园。',
    '#colony-auto-row@hidden': !o.structures.relay, '#colony-auto@checked': o.autoStabilize,
    '#colony-project': o.project ? `${S[o.project.key].name} · ${Math.ceil(o.project.remaining)} 秒` : '建造船待命',
    '#colony-project-progress@value': o.project ? 1 - o.project.remaining / o.project.duration : 0,
    '#colony-project-progress@aria-label': o.project ? `${S[o.project.key].name}建造进度` : '建造船待命',
  });
  for (const [key, spec] of Object.entries(S)) {
    const level = o.structures[key], state = getConstructionState(session, key), max = level === spec.legacy.length;
    const missing = Object.entries(spec.requires).filter(([id, rank]) => o.structures[id] < rank).map(([id, rank]) => `${S[id].name} ${rank} 级`);
    const reason = { capacity: '需要扩建储能阵列', busy: '建造船忙碌', max: '已完成', prerequisite: `需要 ${missing.join('、')}`, civilization: '需要一个工艺文明', legacy: '遗产不足', energy: '储能不足', ready: level ? '升级' : '建造', locked: '未抵达轨道' }[state];
    vm[`#build-${key}@disabled`] = state !== 'ready'; vm[`#build-${key}@title`] = reason;
    vm[`#build-${key}-state`] = reason;
    vm[`#build-${key}-rank`] = `${level} / ${spec.legacy.length}`;
    vm[`#build-${key}-cost`] = max ? '设施已投入使用' : `${Q.format(spec.legacy[level])} Legacy · ${spec.energy[level]} 能量 · ${spec.seconds[level]} 秒`;
    vm[`#build-${key}-card@class:is-built`] = max;
  }
  for (const c of o.bodies.earth.civilizations) {
    const name = BODIES.earth.civilizations.find(def => def.id === c.id).name;
    vm[`#observe-${c.id}`] = `${name} · ${c.born ? CIVILIZATION_AGES[civilizationAge(c) - 1] : '等待火光'}`;
    vm[`#observe-${c.id}@aria-pressed`] = String(o.selectedCivilization === c.id);
  }
  const c = findCivilization(o, 'earth', o.selectedCivilization), cr = civilizationRates(c, rates);
  const name = BODIES.earth.civilizations.find(def => def.id === c.id).name;
  Object.assign(vm, {
    '#colony-civ-name': name, '#colony-civ-age': c.born ? CIVILIZATION_AGES[civilizationAge(c) - 1] : '文明尚未诞生',
    '#colony-population': Math.floor(c.population).toLocaleString('zh-CN'), '#colony-influence': `${Math.floor(c.influence)}%`,
    '#colony-unrest': `${Math.floor(c.unrest)}${cr.war ? ' · 战乱' : ' · 平稳'}`, '#colony-unrest@class:at-war': cr.war,
    '#colony-civ-income': `${round(cr.legacy)}/秒`, '#colony-research@value': c.progress / R.maxProgress,
    '#colony-research@title': `发展 ${Math.floor(c.progress)} / ${R.maxProgress} · 每 ${R.ageProgress} 点进入下一时代`,
    '#colony-policy@value': c.policy, '#colony-policy@disabled': !c.born || !o.structures.observer,
    '#colony-policy-detail': o.structures.observer ? POLICIES[c.policy].description : '建造地表观测阵列后，可以改变政策和进行干预。',
    '#colony-event': o.log.at(-1)?.text ?? '',
  });
  for (const [key, action] of Object.entries(INTERVENTIONS)) {
    const state = getInterventionState(session, 'earth', c.id, key);
    vm[`#intervene-${key}@disabled`] = state !== 'ready';
    vm[`#intervene-${key}-cost`] = `${action.energy} 能量${key === 'tribute' ? ` · +${tributeReward(c, rates)} Legacy` : ''}`;
    vm[`#intervene-${key}-state`] = { ready: '可执行', energy: '能量不足', cooldown: `${Math.ceil(c.cooldowns[key])} 秒冷却`, complete: '无需干预', locked: '等待观测阵列与文明' }[state];
  }
  for (let i = 0; i < R.historyLimit; i++) { const e = o.log[o.log.length - i - 1]; vm[`#orbit-log-${i}`] = e ? `${orbitalTime(e.time)}  ${e.text}` : ''; vm[`#orbit-log-${i}@hidden`] = !e; }
  return vm;
}
