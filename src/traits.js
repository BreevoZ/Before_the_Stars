import { Q } from './quantity.js';

// Registration order is hook order. Hooks receive simulation services, never a
// renderer or DOM. Values below are the single balance source for these talents.
export const TRAIT_VALUES = Object.freeze({ stone: .45, ricochet: .5, devour: .3, shield: .6,
  fireDamage: .10, fireDuration: 1.5, fireRadius: 28, javelin: .5, parryCooldown: 3, counter: .15, parryRecovery: .35,
  volley: 1.12, canister: 1, canisterRange: 110, grenade: .65, grenadeRadius: 38,
  suppression: .9, suppressionDuration: .3, coaxial: .10, coaxialRange: 130,
  blinkRange: 150, overloadEvery: 4, overloadDamage: .5, forceShare: .18, forceRadius: 90 });
const once = { used: { type: 'boolean', initial: false } };
const flash = (ctx, kind) => ctx.effect(kind, ctx.unit.x, ctx.unit.team);
const opener = (kind, factor, range, options = {}) => ({ range, state: once, hooks: {
  onEngage(ctx) {
    if (ctx.state.used || !ctx.target?.type) return;
    ctx.state.used = true;
    ctx.launch(ctx.target, kind, Q.mul(ctx.stats.damage, factor), { ...options, trait: ctx.trait.id });
    flash(ctx, 'throw');
  },
} });
const definitions = [
  { id: 'openingStone', name: '投石开路', units: ['melee'], ...opener('sling', TRAIT_VALUES.stone, 140, { arc: 38 }) },
  { id: 'ricochet', name: '跳弹', units: ['archer'], state: {}, hooks: {
    beforeAttack(ctx) { if (ctx.attack.projectile) { ctx.attack.ricochet = TRAIT_VALUES.ricochet; ctx.attack.trait = ctx.trait.id; } },
  } },
  { id: 'devour', name: '吞噬', units: ['heavy'], state: {}, hooks: {
    onKill(ctx) { if (Q.gt(ctx.unit.hp, 0)) { ctx.heal(ctx.unit, Q.mul(ctx.stats.health, TRAIT_VALUES.devour)); flash(ctx, 'heal'); } },
  } },
  { id: 'shieldWall', name: '盾墙', units: ['swordsman'], state: {}, hooks: {
    onHit(ctx) { if (ctx.role === 'defender' && ctx.hit.ranged && !ctx.hit.ignoreArmor && !ctx.unit.moving) { ctx.hit.guard = Math.max(ctx.hit.guard, TRAIT_VALUES.shield); flash(ctx, 'shield'); } },
  } },
  { id: 'fireArrow', name: '火箭', units: ['crossbow'], state: {}, hooks: {
    beforeAttack(ctx) { ctx.attack.fieldStats = { kind: 'fire', radius: TRAIT_VALUES.fireRadius, duration: TRAIT_VALUES.fireDuration,
      remaining: TRAIT_VALUES.fireDuration, tickCooldown: .5, tickInterval: .5, slow: 1, damage: Q.mul(ctx.stats.damage, TRAIT_VALUES.fireDamage) }; ctx.attack.trait = ctx.trait.id; },
  } },
  { id: 'javelin', name: '投枪', units: ['knight'], ...opener('javelin', TRAIT_VALUES.javelin, 160, { arc: 24 }) },
  { id: 'parry', name: '格挡', units: ['duelist'], state: { readyAt: { type: 'number', initial: 0, delay: TRAIT_VALUES.parryCooldown, min: 0, max: 1e12 } }, hooks: {
    onHit(ctx) {
      if (ctx.role !== 'defender' || !ctx.hit.melee || !ctx.attacker?.type || ctx.hit.secondary || ctx.time < ctx.state.readyAt || !Q.gt(ctx.hit.damage, 0)) return;
      ctx.state.readyAt = ctx.time + TRAIT_VALUES.parryCooldown; ctx.hit.cancelled = true;
      ctx.unit.attackCooldown += TRAIT_VALUES.parryRecovery;
      ctx.strike(ctx.attacker, Q.mul(ctx.stats.damage, TRAIT_VALUES.counter), { secondary: true, ignoreArmor: false }); flash(ctx, 'parry');
    },
  } },
  { id: 'volley', name: '齐射', units: ['musketeer'], state: {}, hooks: {
    beforeAttack(ctx) { if (ctx.allies.filter(unit => unit.type === 'musketeer' && Q.gt(unit.hp, 0)).length >= 3) { ctx.attack.damage = Q.mul(ctx.attack.damage, TRAIT_VALUES.volley); flash(ctx, 'volley'); } },
  } },
  { id: 'canister', name: '霰弹', units: ['cannoneer'], state: {}, hooks: {
    beforeAttack(ctx) { if (ctx.target.type && Math.abs(ctx.target.x - ctx.unit.x) <= TRAIT_VALUES.canisterRange) {
      ctx.attack.projectile = 'canister'; ctx.attack.damage = Q.mul(ctx.attack.damage, TRAIT_VALUES.canister);
      ctx.attack.splash = 0; ctx.attack.ranged = false; ctx.attack.pierce = 3; ctx.attack.pierceFactor = 1; ctx.attack.pierceDistance = 75;
      ctx.attack.maxRange = TRAIT_VALUES.canisterRange + 75; flash(ctx, 'canister');
    } },
  } },
  { id: 'grenade', name: '手雷', units: ['commando'], ...opener('grenade', TRAIT_VALUES.grenade, 150, { arc: 70, splash: TRAIT_VALUES.grenadeRadius }) },
  { id: 'suppression', name: '压制射击', units: ['rifleman'], state: {}, hooks: {
    beforeAttack(ctx) { ctx.attack.slow = TRAIT_VALUES.suppression; ctx.attack.slowDuration = TRAIT_VALUES.suppressionDuration; ctx.attack.trait = ctx.trait.id; },
  } },
  { id: 'coaxial', name: '同轴机枪', units: ['tank'], state: {}, hooks: {
    beforeAttack(ctx) {
      const target = ctx.enemies.filter(unit => Q.gt(unit.hp, 0) && Math.abs(unit.x - ctx.unit.x) <= TRAIT_VALUES.coaxialRange).sort((a, b) => Math.abs(a.x - ctx.unit.x) - Math.abs(b.x - ctx.unit.x) || a.id - b.id)[0];
      if (target) { ctx.launch(target, 'bullet', Q.mul(ctx.stats.damage, TRAIT_VALUES.coaxial), { trait: ctx.trait.id, fromY: -47 }); flash(ctx, 'coaxial'); }
    },
  } },
  { id: 'blink', name: '瞬步', units: ['blade'], range: TRAIT_VALUES.blinkRange, state: once, hooks: {
    onEngage(ctx) {
      if (ctx.state.used || !ctx.target?.type) return;
      ctx.state.used = true; const from = ctx.unit.x;
      ctx.moveToTarget(ctx.target, ctx.stats.range); ctx.effect('blink', from, ctx.unit.team, ctx.unit.x);
    },
  } },
  { id: 'overload', name: '过载', units: ['blaster'], state: { shots: { type: 'integer', initial: 0, min: 0, max: 3 } }, hooks: {
    beforeAttack(ctx) {
      ctx.state.shots = (ctx.state.shots + 1) % TRAIT_VALUES.overloadEvery;
      if (!ctx.state.shots) { ctx.attack.pierce = 2; ctx.attack.pierceFactor = TRAIT_VALUES.overloadDamage; ctx.attack.pierceDistance = 90; ctx.attack.maxRange = ctx.stats.range + 90; ctx.attack.trait = ctx.trait.id; flash(ctx, 'overload'); }
    },
  } },
  { id: 'forceField', name: '力场', units: ['warMachine'], protectionRadius: TRAIT_VALUES.forceRadius, state: {}, hooks: {
    onHit(ctx) {
      if (ctx.role !== 'protector' || ctx.hit.secondary || ctx.hit.cancelled || !Q.gt(ctx.unit.hp, 0)) return;
      const shared = Q.min(ctx.unit.hp, Q.mul(ctx.hit.resolvedDamage, TRAIT_VALUES.forceShare));
      ctx.hit.resolvedDamage = Q.sub(ctx.hit.resolvedDamage, shared);
      // Redirection is already mitigated damage, cannot re-trigger another field.
      ctx.absorb(shared); ctx.effect('field', ctx.unit.x, ctx.unit.team, ctx.hit.target.x);
    },
    onDeath(ctx) { flash(ctx, 'fieldBreak'); },
  } },
];
export const TRAITS = Object.freeze(Object.fromEntries(definitions.map(def => [def.id, Object.freeze({ ...def, stat: `trait_${def.id}`, units: Object.freeze(def.units), state: Object.freeze(def.state), hooks: Object.freeze(def.hooks) })])));
export const TRAIT_STATS = Object.freeze(Object.fromEntries(definitions.map(def => [`trait_${def.id}`, { boolean: true }])));
export const TRAIT_DEFAULTS = Object.freeze(Object.fromEntries(Object.keys(TRAIT_STATS).map(key => [key, false])));
export const TRAIT_HOOKS = Object.freeze(['onEngage', 'beforeAttack', 'onHit', 'onKill', 'onDeath']);
const byUnit = Object.fromEntries([...new Set(definitions.flatMap(def => def.units))].map(type => [type, definitions.filter(def => def.units.includes(type)).map(def => TRAITS[def.id])]));
export function unitTraits(unit) { return byUnit[unit.type] ?? []; }
export function runTraitHook(hook, context) {
  if (!TRAIT_HOOKS.includes(hook)) throw new TypeError(`Unknown trait hook: ${hook}`);
  // Surface opponents keep their old rules; orbital sponsorship explicitly
  // enables the same hooks for either side through the attribute pipeline.
  if (context.stats.traitAccess === false || context.unit.team !== 'player' && !context.stats.traitAccess) return;
  for (const trait of unitTraits(context.unit)) {
    if (!trait.hooks[hook] || !context.stats[trait.stat]) continue;
    if (hook === 'onEngage' && context.distance > (trait.range ?? context.stats.range)) continue;
    context.unit.traits ??= {};
    context.unit.traits[trait.id] ??= Object.fromEntries(Object.entries(trait.state).map(([key, field]) => [key, field.delay ? context.time + field.delay : field.initial]));
    const state = context.unit.traits[trait.id];
    if (hook === 'onEngage' && state.used) continue;
    trait.hooks[hook]({ ...context, trait, state,
      effect: (...args) => context.effect(trait.id, ...args) });
  }
}
export function validTraitState(unit, { allowEnemy = false } = {}) {
  if (unit.traits === undefined) return true;
  if (!unit.traits || typeof unit.traits !== 'object' || Array.isArray(unit.traits)) return false;
  return Object.entries(unit.traits).every(([id, state]) => {
    const def = Object.hasOwn(TRAITS, id) ? TRAITS[id] : null;
    return def && (unit.team === 'player' || allowEnemy && unit.team === 'enemy') && def.units.includes(unit.type) && state && typeof state === 'object' && !Array.isArray(state)
      && Object.keys(state).length === Object.keys(def.state).length && Object.entries(def.state).every(([key, field]) =>
        field.type === 'boolean' ? typeof state[key] === 'boolean' : typeof state[key] === 'number' && Number.isFinite(state[key]) && state[key] >= field.min && state[key] <= field.max && (field.type !== 'integer' || Number.isInteger(state[key])));
  });
}
