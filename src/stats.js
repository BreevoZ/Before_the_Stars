import { RULES, UNITS, TURRETS, ABILITIES, AGES } from './game-config.js';

// Values are resolved once: last override, sum of additions, product of
// multipliers, then the stat's rounding and bounds. Never mutate base configs.
const scalar = Object.freeze({ min: 0, max: 1e9 });
const count = max => ({ min: 0, max, round: 'floor' });
export const STAT_DEFINITIONS = Object.freeze({
  damage: scalar, meleeDamage: scalar, chargeDamage: scalar, tickDamage: scalar, baseDamage: scalar,
  health: { min: 1, max: 1e9, round: 'round' }, baseHealth: { min: 1, max: 1e9, round: 'round' },
  armor: scalar, armorPierce: scalar, rangedReduction: { min: 0, max: 1 },
  speed: scalar, range: scalar, baseRange: scalar, meleeRange: scalar,
  attackSpeed: { min: 0.01, max: 100 }, attackInterval: { min: RULES.fixedStep, max: 3600 },
  trainTime: { min: RULES.fixedStep, max: 3600 }, cost: count(1e9),
  bounty: count(1e9), experience: count(1e9), income: scalar, startingGold: count(1e9),
  armyLimit: count(256), queueLimit: count(64), maxTurretSlots: count(RULES.maxTurretSlots),
  initialTurretSlots: count(RULES.maxTurretSlots), expansionCost: count(1e9),
  cooldown: scalar, healing: scalar, radius: scalar, splash: scalar,
  chargeTime: scalar, burstInterval: { min: RULES.fixedStep, max: 3600 },
  fieldRadius: scalar, fieldDuration: { min: RULES.fixedStep, max: 60 },
  tickInterval: { min: RULES.fixedStep, max: 10 }, slow: { min: 0.01, max: 1 },
  enabled: { boolean: true }, canRecruit: { boolean: true }, canBuild: { boolean: true },
  canExpand: { boolean: true }, canEvolve: { boolean: true }, canCast: { boolean: true },
  legacy: count(1e9),
});
const kinds = ['team', 'unit', 'turret', 'ability', 'reward', 'civilization'];
const sources = ['doctrine', 'challenge', 'depth', 'milestone', 'age', 'status', 'legacy'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));

export function createBonusStack(...contributions) {
  const stack = contributions.flat();
  if (stack.length > 256) throw new RangeError('Too many stat bonuses');
  return Object.freeze(stack.map(effect => {
    if (!object(effect) || !exactKeys(effect, ['target', 'type', 'value', 'source'])) throw new TypeError('Invalid stat bonus');
    const { target, type, value, source } = effect;
    if (!object(target) || !exactKeys(target, ['stat', 'kind', 'team', 'type', 'role', 'age']) ||
        !Object.hasOwn(STAT_DEFINITIONS, target.stat) ||
        (target.kind !== undefined && !kinds.includes(target.kind)) ||
        (target.team !== undefined && !['player', 'enemy'].includes(target.team)) ||
        (target.type !== undefined && !(Object.hasOwn(UNITS, target.type) || Object.hasOwn(TURRETS, target.type) || Object.hasOwn(ABILITIES, target.type))) ||
        (target.role !== undefined && !['melee', 'archer', 'heavy'].includes(target.role)) ||
        (target.age !== undefined && (!Number.isInteger(target.age) || !Object.hasOwn(AGES, target.age)))) throw new TypeError('Invalid stat target');
    if (!['add', 'multiply', 'override'].includes(type)) throw new TypeError('Invalid stat operation');
    if (STAT_DEFINITIONS[target.stat].boolean ? type !== 'override' || typeof value !== 'boolean'
      : !Number.isFinite(value) || Math.abs(value) > 1e9 || (type === 'multiply' && value < 0)) throw new TypeError('Invalid stat value');
    if (!object(source) || !exactKeys(source, ['id', 'kind', 'label']) || !sources.includes(source.kind) ||
        ![source.id, source.label].every(text => typeof text === 'string' && text.length > 0 && text.length <= 100)) throw new TypeError('Invalid bonus source');
    return Object.freeze({ target: Object.freeze({ ...target }), type, value, source: Object.freeze({ ...source }) });
  }));
}

export function resolveStatValue(base, effects, definition = scalar) {
  let value = base, add = 0, multiply = 1, zeroMultiplier = false;
  for (const effect of effects) {
    if (effect.type === 'override') value = effect.value;
    if (effect.type === 'add') add += effect.value;
    if (effect.type === 'multiply') {
      multiply *= effect.value;
      zeroMultiplier ||= effect.value === 0;
    }
  }
  if (definition.boolean) return value;
  // Even an overflowing stack must keep zero effects at zero, never NaN.
  value = zeroMultiplier || value + add === 0 ? 0 : (value + add) * multiply;
  value = Math.max(definition.min, Math.min(definition.max, value));
  return definition.round ? Math[definition.round](value) : value;
}

const empty = Object.freeze([]), caches = new WeakMap();
const damageFamily = ['meleeDamage', 'chargeDamage', 'tickDamage', 'baseDamage'];
function describe(game, subject) {
  if (typeof subject === 'string') subject = { kind: 'team', team: subject };
  const kind = subject.kind ?? (Object.hasOwn(UNITS, subject.type) ? 'unit' : Object.hasOwn(TURRETS, subject.type) ? 'turret' : 'team');
  const team = subject.team ?? 'player', type = subject.type;
  const base = kind === 'unit' ? UNITS[type] : kind === 'turret' ? TURRETS[type] : kind === 'ability' ? ABILITIES[type] : {};
  const age = subject.age ?? base?.age ?? game.ages[team];
  return { kind, team, type, age, role: base?.role, base, slot: subject.slot };
}
function baseValues(context) {
  if (context.kind === 'team') return { income: RULES.goldPerSecond, startingGold: RULES.startingGold,
    baseHealth: RULES.baseHealth, armyLimit: RULES.armyLimit, queueLimit: RULES.queueLimit,
    maxTurretSlots: RULES.maxTurretSlots, initialTurretSlots: 1,
    expansionCost: RULES.turretExpansionCosts[Math.max(0, context.slot ?? 0)] ?? 0,
    canRecruit: true, canBuild: true, canExpand: true, canEvolve: true, canCast: true };
  if (context.kind === 'reward') return { bounty: 0, experience: 0 };
  if (context.kind === 'civilization') return { legacy: 1 };
  return { ...context.base, enabled: true, attackSpeed: 1,
    ...(context.kind === 'turret' ? { attackInterval: context.base.interval } : {}) };
}
function eraBonuses(context) {
  if (context.kind !== 'team') return empty;
  const age = AGES[context.age];
  return Object.entries({ income: age.income, baseHealth: age.baseHealth,
    ...(context.team === 'enemy' ? { startingGold: age.startingGold } : {}) }).map(([key, value]) => ({
    target: { stat: key, kind: 'team', team: context.team }, type: 'override', value,
    source: { id: `age:${context.age}`, kind: 'age', label: age.name },
  }));
}
function matches(effect, context, key) {
  const target = effect.target;
  // A general damage multiplier also scales alternate attacks and damage over
  // time. Additive/override bonuses to a charge must explicitly target it.
  if (target.stat !== key && !(target.stat === 'damage' && effect.type === 'multiply' && damageFamily.includes(key))) return false;
  return ['kind', 'team', 'type', 'role', 'age'].every(key => target[key] === undefined || target[key] === context[key]);
}
function cacheFor(game) {
  const stack = game.mode === 'incremental' ? game.bonuses ?? empty : empty;
  const ages = `${game.ages.player}:${game.ages.enemy}`;
  let cache = caches.get(game);
  if (!cache || cache.stack !== stack || cache.ages !== ages) {
    cache = { stack, ages, entries: new Map() }; caches.set(game, cache);
  }
  return cache;
}
function entryFor(game, subject) {
  const context = describe(game, subject), cache = cacheFor(game);
  const key = `${context.kind}:${context.team}:${context.type ?? ''}:${context.age}:${context.slot ?? ''}`;
  if (!cache.entries.has(key)) {
    const base = baseValues(context), effects = [...eraBonuses(context), ...cache.stack];
    const values = { ...base }, applied = new Map();
    for (const [key, definition] of Object.entries(STAT_DEFINITIONS)) {
      if (base[key] === undefined) continue;
      const selected = effects.filter(effect => matches(effect, context, key));
      applied.set(key, selected);
      values[key] = resolveStatValue(base[key], selected, definition);
    }
    if (values.attackInterval !== undefined) {
      values.attackInterval = Math.max(RULES.fixedStep, Math.min(3600, values.attackInterval / values.attackSpeed));
      if (context.kind === 'turret') values.interval = values.attackInterval;
    }
    cache.entries.set(key, { context, base, values: Object.freeze(values), effects, applied });
  }
  return cache.entries.get(key);
}

function statusEffects(subject, key) {
  return key === 'speed' && subject?.moveMultiplier !== undefined && subject.moveMultiplier !== 1
    ? [{ target: { stat: 'speed', kind: 'unit' }, type: 'multiply', value: subject.moveMultiplier,
      source: { id: 'oil', kind: 'status', label: '沸油减速' } }] : empty;
}
export function attributes(game, subject) {
  const values = entryFor(game, subject).values;
  return statusEffects(subject, 'speed').length ? { ...values, speed: stat(game, subject, 'speed') } : values;
}
export function stat(game, subject, key, base) {
  const entry = entryFor(game, subject);
  const temporary = statusEffects(subject, key);
  if (base === undefined && !temporary.length) {
    if (entry.values[key] === undefined) throw new TypeError(`Unknown attribute: ${entry.context.kind}.${key}`);
    return entry.values[key];
  }
  base ??= entry.base[key];
  if (!Object.hasOwn(STAT_DEFINITIONS, key) || !Number.isFinite(base)) throw new TypeError('Invalid stat base');
  const effects = entry.applied.get(key) ?? entry.effects.filter(effect => matches(effect, entry.context, key));
  const value = resolveStatValue(base, temporary.length ? [...effects, ...temporary] : effects, STAT_DEFINITIONS[key]);
  return key === 'attackInterval' ? Math.max(RULES.fixedStep, Math.min(3600, value / entry.values.attackSpeed)) : value;
}
export function explainStat(game, subject, key, base) {
  const entry = entryFor(game, subject);
  return { base: base ?? entry.base[key], effects: [...entry.effects.filter(effect => matches(effect, entry.context, key)), ...statusEffects(subject, key)],
    value: stat(game, subject, key, base), ...(key === 'attackInterval' ? { attackSpeed: explainStat(game, subject, 'attackSpeed') } : {}) };
}

// One-time adapter for pre-pipeline callers/saves. Combat never reads these bags.
export function legacyBonuses(modifiers = {}, enemyModifiers = {}) {
  return createBonusStack(...[
    ...Object.entries(modifiers).map(([key, value]) => [key, value, 'player']),
    ...Object.entries(enemyModifiers).map(([key, value]) => [key === 'gold' ? 'startingGold' : key, value, 'enemy']),
  ].map(([key, value, team]) => ({ target: { stat: key, team, ...(['experience', 'bounty'].includes(key) ? { kind: 'reward' } : {}) }, type: 'multiply', value,
    source: { id: `legacy:${team}:${key}`, kind: 'legacy', label: '旧版加成' } })));
}
