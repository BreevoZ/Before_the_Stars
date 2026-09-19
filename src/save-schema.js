import { RULES, ABILITIES } from './game-config.js';
import { check, object, num, int, bool, id } from './save-primitives.js';
import { PHASE } from './progression-machine.js';

// Predicates are composable schema entries; domain relationships (ledger,
// target IDs, phase/result, resolved HP) are checked separately.
export const optional = test => value => value === undefined || test(value);
export const oneOf = values => value => values.includes(value);
export const arrayOf = (test, max) => value => Array.isArray(value) && value.length <= max && value.every(test);
export function validateShape(value, fields, path = 'record') {
  check(object(value), path);
  for (const [key, test] of Object.entries(fields)) check(test(value[key]), `${path}.${key}`);
  return value;
}
const clock = value => num(value);
const positiveId = value => int(value, 1);
const signedClock = value => num(value, -1);
export const SESSION_SHAPE = Object.freeze({ version: positiveId, permanent: object, run: object, game: object,
  debug: optional(value => value === true), debugSpeed: optional(clock) });
export const RUN_SHAPE = Object.freeze({ runId: id, battleNumber: positiveId, phase: oneOf(Object.values(PHASE)),
  elapsed: clock, autoElapsed: clock, settled: bool, upgrades: object });
export const GAME_SHAPE = Object.freeze({ status: oneOf(['playing', 'won', 'lost', 'draw']), elapsed: clock,
  abilityCooldown: clock, nextUnitId: positiveId, nextOrderId: positiveId,
  ages: object, experience: object, gold: object, bases: object, queues: object, turrets: object });
export const ORDER_SHAPE = Object.freeze({ id: positiveId, type: value => typeof value === 'string', remaining: clock });
export const UNIT_SHAPE = Object.freeze({ id: positiveId, team: oneOf(['player', 'enemy']), moving: bool,
  chargeRemaining: optional(clock), chargeDuration: optional(clock),
  suppressionMultiplier: optional(value => num(value, .01, 1)),
  attackCooldown: signedClock, attackAnimation: signedClock, hitFlash: signedClock,
  ...Object.fromEntries(['distanceTravelled', 'chargeTravel', 'guardFlash', 'attackApproach', 'moveMultiplier',
    'burstRemaining', 'burstCooldown', 'traitAnimation', 'suppressedUntil'].map(key => [key, optional(signedClock)])) });

// Fixed entity fields live here; validators only add cross-field constraints.
const fields = (keys, test) => Object.fromEntries(keys.split(' ').map(key => [key, test]));
const coordinates = value => num(value, -RULES.width, RULES.width * 2);
export const TURRET_SHAPE = Object.freeze({ team: oneOf(['player', 'enemy']),
  ...fields('cooldown flash shotSerial aim burstRemaining chargeRemaining', signedClock),
  ...fields('burstCooldown flashDuration lastBarrel', optional(signedClock)) });
export const SHOT_SHAPE = Object.freeze({ team: oneOf(['player', 'enemy']),
  kind: oneOf(['sniper','javelin','grenade','canister','sling','stone','boulder','arrow','bolt','egg','fireball','oil','bullet','cannon','shell','rocket','plasma','plasma-orb','rail','laser','ion']),
  ...fields('fromX toX fromY toY toOffsetX originX', coordinates),
  ...fields('fromUnitX fromTurretX fromBaseX arc', optional(coordinates)),
  ...fields('duration remaining splash pierce', clock),
  ...fields('pierceFactor pierceDistance', optional(clock)), ignoreArmor: bool,
  ricochet: optional(value => num(value, 0, 1)), slow: optional(value => num(value, .01, 1)), slowDuration: optional(value => num(value, 0, 10)), secondary: optional(bool), ranged: optional(bool),
  maxRange: value => value === Infinity || clock(value) });
export const FIELD_SHAPE = Object.freeze({ kind: oneOf(['fire', 'oil']),
  ...fields('radius remaining duration tickCooldown tickInterval slow', clock) });
export const EFFECT_SHAPE = Object.freeze({ kind: oneOf(['trait','impact','evolve','pierce','meteor','volley','airstrike','orbital']),
  ...fields('x life duration', clock) });
export const IMPACT_SHAPE = Object.freeze({ ...fields('y angle', coordinates), anchorX: optional(coordinates), radius: optional(clock),
  style: oneOf(['stone','rubble','arrow','egg','fire','oil','bullet','solid','explosion','plasma','rail','laser','ion','blunt','bite','slash','thrust','knife','blade']),
  surface: oneOf(['stone', 'metal', 'soft']) });
export const ABILITY_SHAPE = Object.freeze({ type: value => Object.hasOwn(ABILITIES, value),
  ...fields('remaining wavesLeft x', clock) });
export const AI_SHAPE = Object.freeze({ enabled: bool, strategy: oneOf(['balanced', 'siege']), ...fields('cooldown orders waves', clock) });
