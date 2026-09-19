import { Q } from './quantity.js';
import { stat, attributes } from './stats.js';
import { describeStat } from './stat-text.js';
import { RULES, AGES, UNITS, TURRETS, ABILITIES, getAgeUnits, getIncomeRate, getRecruitState, getEvolutionState,
  getTurretState, getExpansionState, getExpansionCost, getTurretRefund } from './game.js';
import { unitIcons, turretIcons, abilityIcons } from './icons.js';
export const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;
export const formatMultiplier = value => Q.format(value, null);
const recruitLabels = { disabled: '本轮禁止招募', ready: '加入队列', gold: '金币不足', 'queue-full': '队列已满', 'army-full': '兵力已满', locked: '时代未解锁', outdated: '已被新兵种替代', finished: '战斗已结束' };
const turretLabels = { disabled: '本轮禁止建造', ready: '在选中位置建造', gold: '金币不足', occupied: '炮位已占用', full: '请先扩容', finished: '战斗已结束', locked: '时代未解锁', outdated: '已被新炮塔替代' };

// Pure projection. UI-only state (pause, selection, aim) is an explicit input;
// this module never reads document/window or changes the simulation.
export function buildViewModel(session, { selectedSlot = 0, targeting = false, manualPaused = false, paused = false, queueSlots = 0 } = {}) {
  const game = session.game, view = {};
  const put = (id, value, property = '') => { view[`#${id}${property ? `@${property}` : ''}`] = value; };
  const at = (selector, value, property = '') => { view[`${selector}${property ? `@${property}` : ''}`] = value; };
  const age = AGES[game.ages.player], nextAge = AGES[game.ages.player + 1];
  const finished = game.status !== 'playing', slots = game.turrets.player;
  if (selectedSlot >= slots.length) selectedSlot = 0;
  if (finished || ABILITIES[age.ability].targeting === 'allies') targeting = false;
  at('body', String(game.ages.player), 'data-age');
  const units = getAgeUnits(game.ages.player).map(type => ({ type, ...attributes(game, { type, team: 'player' }) }));
  const towers = age.turrets.map(type => ({ type, ...attributes(game, { type, team: 'player' }) }));
  for (let index = 0; index < 4; index++) {
    const card = `[data-unit-slot="${index}"]`, unit = units[index];
    at(card, !unit, 'hidden');
    if (!unit) { at(card, true, 'disabled'); continue; }
    const { type } = unit, state = getRecruitState(game, type), label = recruitLabels[state];
    const description = `${unit.name} · ${Q.format(unit.cost)} 金币 · ${unit.trainTime} 秒训练\n${Q.format(unit.health)} 生命 / ${Q.format(unit.damage)}${unit.burst ? ` × ${unit.burst}` : ''} 攻击 / ${unit.attackInterval} 秒间隔 / ${Q.format(unit.armor)} 护甲 / ${unit.range} 对兵射程${unit.baseRange ? ` / ${unit.baseRange} 攻城射程` : ''}\n${unit.description}`;
    unit.help = description;
    at(card, type, 'data-unit'); at(card, String(age.id ?? game.ages.player), 'data-age');
    at(`${card} strong`, unit.name); at(`${card} .unit-role`, unit.description);
    at(`${card} .unit-icon`, unitIcons[type], 'icon'); at(`${card} .unit-icon`, type, 'unitPortrait');
    at(`${card} [data-cost]`, Q.format(unit.cost)); at(`${card} [data-training]`, `${unit.trainTime}s`);
    at(card, description, 'data-description'); at(card, `训练${unit.name}，${Q.format(unit.cost)} 金币，耗时 ${unit.trainTime} 秒`, 'aria-label');
    at(card, state !== 'ready', 'disabled'); at(`${card} [data-state]`, label); at(card, `${description}\n${label}`, 'title');
  }
  towers.forEach((tower, index) => {
    const card = `[data-turret-slot="${index}"]`, { type } = tower;
    const state = getTurretState(game, 'player', type, selectedSlot), label = turretLabels[state] ?? '位置未解锁';
    const description = `${tower.name} · ${Q.format(tower.cost)} 金币\n${Q.format(tower.damage)}${tower.burst ? ` × ${tower.burst}` : ''} 攻击 / ${tower.interval} 秒间隔 / ${tower.range} 射程${tower.splash ? ` / ${tower.splash} 爆炸半径` : ''}${tower.chargeTime ? ` / ${tower.chargeTime} 秒充能` : ''}\n${tower.description}`;
    tower.help = description;
    at(card, type, 'data-turret'); at(`${card} strong`, tower.name);
    at(`${card} .turret-icon`, turretIcons[type], 'icon'); at(`${card} .turret-icon`, type, 'turretPortrait');
    at(`${card} [data-turret-role]`, tower.description); at(`${card} [data-turret-cost]`, Q.format(tower.cost));
    at(card, description, 'data-description'); at(card, `建造${tower.name}，${Q.format(tower.cost)} 金币，${tower.description}`, 'aria-label');
    at(card, state !== 'ready', 'disabled'); at(`${card} [data-turret-state]`, label); at(card, `${description}\n${label}`, 'title');
  });
  for (const [kind, entries, count, icons] of [['unit', units, 4, unitIcons], ['turret', towers, 3, turretIcons]]) {
    for (let i = 0; i < count; i++) {
      const item = entries[i], selector = `#help-${kind}-${i}`;
      at(selector, !item, 'hidden');
      if (!item) continue;
      const [heading, ...details] = item.help.split('\n');
      at(`${selector} strong`, heading); at(`${selector} p`, details.join(' · '));
      at(`${selector} .help-unit-icon`, icons[item.type], 'icon');
    }
  }
  put('roster-age', `${age.numeral} · ${age.name}`);
  Object.keys(AGES).forEach((key, index) => {
    const selector = `#era-track li:nth-child(${index + 1})`;
    at(selector, Number(key) < game.ages.player, 'class:reached'); at(selector, Number(key) === game.ages.player ? 'step' : null, 'aria-current');
  });
  const capacity = slots.filter(Boolean).length, limit = stat(game, 'player', 'maxTurretSlots');
  put('turret-capacity', `${capacity} / ${slots.length}`); put('turret-capacity', `已建造 ${capacity} 座 · 已解锁 ${slots.length} 个炮位`, 'title');
  for (let index = 0; index < RULES.maxTurretSlots; index++) {
    const selector = `#turret-slots button:nth-child(${index + 1})`, tower = slots[index], locked = index >= slots.length;
    const name = locked ? '未扩容' : tower ? TURRETS[tower.type].name : '空位';
    at(selector, index >= Math.max(slots.length, limit), 'hidden'); at(selector, locked || finished, 'disabled');
    at(selector, Boolean(tower), 'class:occupied'); at(selector, String(index === selectedSlot), 'aria-pressed');
    at(`${selector} strong`, name); at(`${selector} .slot-icon`, locked ? 'lock' : tower ? turretIcons[tower.type] : 'plus', 'icon');
    at(selector, `炮位 ${index + 1}，${name}`, 'aria-label'); at(selector, `炮位 ${index + 1}，${name}`, 'title');
  }
  const selected = slots[selectedSlot];
  put('selected-turret', `炮位 ${selectedSlot + 1} · ${selected ? TURRETS[selected.type].name : '空位'}`);
  put('sell-turret', !selected, 'hidden'); put('sell-turret', finished, 'disabled');
  if (selected) {
    const refund = Q.format(getTurretRefund(game, selected));
    put('sale-refund', `+${refund}`);
    for (const prop of ['title', 'aria-label']) put('sell-turret', `拆除${TURRETS[selected.type].name} · 返还 ${refund} 金币`, prop);
  }
  const expansion = getExpansionState(game), price = slots.length < limit ? getExpansionCost(game) : undefined;
  put('expand-turrets', expansion !== 'ready', 'disabled'); put('expansion-price', price === undefined ? `${limit}/${limit}` : Q.format(price));
  at('#expand-turrets [data-icon]', price === undefined ? 'check' : 'plus', 'icon');
  const expansionHint = expansion === 'max-slots' ? `已达 ${limit} 个炮位` : expansion === 'disabled' ? '本轮禁止扩容' : expansion === 'finished' ? '战斗已结束' : `扩容 +1 · ${Q.format(price)} 金币${expansion === 'gold' ? '（不足）' : ''}`;
  for (const prop of ['title', 'aria-label']) put('expand-turrets', expansionHint, prop);
  const xp = game.experience.player, evolution = getEvolutionState(game);
  const evolveLabel = evolution === 'disabled' ? '本轮禁止进化' : evolution === 'finished' ? '战斗已结束' : nextAge ? `进化至${nextAge.name}` : '已达最高时代';
  const evolutionHint = !nextAge ? '五个时代已全部解锁 · 摧毁敌方基地取得胜利' : evolution === 'ready' ? '经验已达标 · 点击进化或按 E · 不消耗金币' : `击杀经验 + 阵亡75%经验 · 还差 ${Q.format(Q.max(0, Q.sub(nextAge.experienceRequired, xp)))} 经验`;
  const benefit = nextAge ? `生命 +${Q.format(Q.sub(stat(game, { team: 'player', age: game.ages.player + 1 }, 'baseHealth'), stat(game, 'player', 'baseHealth')))} · 收入 ${formatMultiplier(stat(game, { team: 'player', age: game.ages.player + 1 }, 'income'))}/秒 · ${ABILITIES[nextAge.ability].name} · 三种新炮塔` : '未来要塞 · 离子科技 · 轨道打击';
  put('evolution-title', `${age.numeral} · ${age.name}`);
  put('experience-total', nextAge ? `${Q.format(xp)} / ${nextAge.experienceRequired} 经验` : `累计 ${Q.format(xp)} 经验`);
  put('experience-value', nextAge ? `${Q.format(xp)} / ${nextAge.experienceRequired}` : Q.format(xp));
  const xpMax = nextAge?.experienceRequired ?? age.experienceRequired;
  put('experience-bar', xpMax, 'max'); put('experience-bar', Q.toNumber(Q.min(xp, xpMax)), 'value');
  put('evolve', evolution !== 'ready', 'disabled'); put('evolve', evolution === 'ready', 'class:ready');
  put('evolve-label', evolveLabel); put('evolution-hint', evolutionHint); put('evolution-benefit', benefit);
  put('evolution-unlocks', `${nextAge ? '下个时代' : '已解锁'}：${getAgeUnits(game.ages.player + (nextAge ? 1 : 0)).map(type => UNITS[type].name).join(' · ')}`);
  put('evolve', `${evolveLabel} · E\n${evolutionHint}\n${benefit}`, 'title'); put('evolve', evolveLabel, 'aria-label');
  for (const team of ['player', 'enemy']) {
    const base = game.bases[team], teamAge = AGES[game.ages[team]], next = AGES[game.ages[team] + 1];
    const health = `${Q.format(base.hp)} / ${Q.format(base.maxHp)}`;
    put(`${team}-health`, health); put(`${team}-health-bar`, 1, 'max'); put(`${team}-health-bar`, Q.ratio(base.hp, base.maxHp), 'value'); put(`${team}-health-bar`, health, 'aria-valuetext');
    put(`${team}-count`, game.units.filter(unit => unit.team === team).length);
    put(`${team}-age`, `${teamAge.numeral} · ${teamAge.name}`); put(`${team}-era`, teamAge.numeral);
    const experience = next ? `${Q.format(game.experience[team])} / ${next.experienceRequired} 经验` : `${Q.format(game.experience[team])} 经验 · 最高时代`;
    put(`${team}-experience`, experience); at(`.${team}-status .base-emblem`, `${team === 'player' ? '我方' : '敌方'} · ${teamAge.name}\n${experience}`, 'title');
  }
  put('gold', Q.format(Q.floor(Q.add(game.gold.player, 0.000001)))); put('income-rate', `+${formatMultiplier(getIncomeRate(game))}/s`); put('income-rate', describeStat(game, 'player', 'income'), 'title');
  at('.evolution-progress', `以 100 点击杀经验为例：${describeStat(game, { kind: 'reward', team: 'player' }, 'experience', 100)}。阵亡经验先按 75% 向下取整，再结算加成并逐笔向下取整。`, 'title');
  put('clock', formatTime(game.elapsed));
  const strategy = game.ai.strategy === 'siege' ? '敌军战术 · 重装攻城' : '敌军战术 · 混合推进';
  put('enemy-strategy', strategy); put('enemy-strategy-icon', strategy, 'title'); put('enemy-strategy-icon', game.ai.strategy === 'siege' ? 'cannon' : 'sword', 'icon');
  const queueLimit = stat(game, 'player', 'queueLimit'), queueCount = Math.max(queueLimit, game.queues.player.length);
  put('recruit-rule', `队列 ${queueLimit} 位 · 兵力上限 ${stat(game, 'player', 'armyLimit')}（含训练中）`); put('queue-count', `${game.queues.player.length} / ${queueLimit}`);
  // Previously allocated queue slots remain mounted but can become hidden.
  for (let index = 0; index < Math.max(queueCount, queueSlots); index++) {
    const selector = `#training-queue button:nth-child(${index + 1})`, order = game.queues.player[index];
    const name = order ? UNITS[order.type].name : String(index + 1).padStart(2, '0');
    const time = !order ? '空位' : index > 0 ? '等待中' : order.remaining <= 0.000001 ? '等待出口' : `${order.remaining.toFixed(1)}s`;
    at(selector, index >= queueCount, 'hidden'); at(selector, !order || finished, 'disabled'); at(selector, Boolean(order) && index === 0, 'class:active'); at(selector, Boolean(order), 'class:occupied');
    at(`${selector} .queue-name`, name); at(`${selector} .queue-icon`, order ? unitIcons[order.type] : '', 'icon');
    at(`${selector} .queue-time`, !order ? '·' : index > 0 ? '' : order.remaining <= 0.000001 ? '…' : time);
    at(`${selector} .queue-fill`, `scaleX(${order && index === 0 ? 1 - order.remaining / (order.duration ?? UNITS[order.type].trainTime) : 0})`, 'style:transform');
    const refund = order ? Q.format(order.paid ?? UNITS[order.type].cost) : '';
    at(selector, order ? `取消${name}，退还 ${refund} 金币` : `空队列位 ${index + 1}`, 'aria-label');
    at(selector, order ? `${name} · ${time}\n点击取消，退还 ${refund} 金币` : `空队列位 ${index + 1}`, 'title');
  }
  const ability = attributes(game, { kind: 'ability', type: age.ability, team: 'player' });
  const abilityDisabled = !stat(game, 'player', 'canCast') || !ability.enabled;
  const abilityDescription = ability.targeting === 'allies' ? `${ability.name}：${ability.description} · 每秒 +${Q.format(ability.healing)} 生命，持续 ${ability.duration} 秒 · ${ability.cooldown} 秒冷却` : `${ability.name}：${ability.description} · ${Q.format(ability.damage)}${ability.waves > 1 ? ` × ${ability.waves}` : ''} 伤害 · ${ability.cooldown} 秒冷却`;
  const abilityState = abilityDisabled ? '本轮禁止大招' : finished ? '战斗已结束' : game.ability?.type === 'renewal' ? `治疗中 · ${Math.ceil(game.ability.remaining)} 秒 · 冷却 ${Math.ceil(game.abilityCooldown)} 秒` : game.abilityCooldown > 0 ? `冷却中 · ${Math.ceil(game.abilityCooldown)} 秒` : targeting ? '等待落点 · 再次点击取消' : ability.targeting === 'allies' ? '立即治疗 · 已就绪' : '选择落点 · 已就绪';
  put('ability-name', ability.name); put('ability-description', abilityDescription); put('ability-icon', abilityIcons[age.ability], 'icon');
  put('spell-hint', ability.targeting === 'allies' ? '点击或按 Q 立即治疗全场友军，无需选择落点。不修复基地，不超过各兵种的生命上限。' : '选中大招后点击战场释放；也可用方向键瞄准，Enter 释放，Esc 取消。');
  put('target-text', '选择落点'); at('#target-banner [data-icon]', abilityIcons[age.ability], 'icon');
  put('ability', age.ability, 'data-ability'); put('ability', finished || abilityDisabled || game.abilityCooldown > 0, 'disabled'); put('ability', String(targeting), 'aria-pressed');
  put('ability-state', abilityState); put('ability-timer', finished ? '—' : game.abilityCooldown > 0 ? `${Math.ceil(game.abilityCooldown)}s` : targeting ? '◎' : '✓');
  put('ability', `${abilityDescription}\n${abilityState} · Q`, 'title'); put('ability', ability.name, 'aria-label');
  put('target-banner', !targeting, 'hidden'); at('#battlefield', targeting, 'class:targeting');
  put('pause-battle', manualPaused ? '继续' : '暂停'); put('pause-battle', finished, 'disabled'); put('pause-battle', String(manualPaused), 'aria-pressed'); put('pause-battle', `${manualPaused ? '继续' : '暂停'} · 空格`, 'title');
  const phase = finished ? '战斗结束' : paused || manualPaused ? '已暂停' : '交战中';
  put('phase', phase); put('phase-icon', finished ? 'check' : paused || manualPaused ? 'pause' : 'play', 'icon'); put('phase-icon', phase, 'title'); put('result', !finished, 'hidden');
  const result = { title: game.status === 'won' ? '胜利' : game.status === 'lost' ? '战败' : '平局',
    detail: `${game.status === 'won' ? '敌方基地已被摧毁。' : game.status === 'lost' ? '我方基地已被摧毁。' : '双方基地同时被摧毁。'}用时 ${formatTime(game.elapsed)}` };
  if (!session.run && finished) { put('result-title', result.title); put('result-detail', result.detail); }
  return { bindings: view, units, towers, queueCount, selectedSlot, targeting, finished, result };
}
