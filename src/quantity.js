import Decimal from './vendor/break-infinity/break_infinity.esm.js';

// Small values keep the game's original IEEE-754 arithmetic and frame timing.
// Growth values share this API at every size; callers never coerce large values.
const SMALL = 1e12;
export const MAX_EXPONENT = 9e15 - 1;
const syntax = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
class LargeQuantity extends Decimal {
  constructor(value) { super(value); Object.freeze(this); }
  [Symbol.toPrimitive](hint) {
    if (hint === 'string') return this.toString();
    throw new TypeError('Use quantity arithmetic instead of numeric coercion');
  }
}
export const isLargeQuantity = value => value instanceof LargeQuantity;
const decimal = value => value instanceof Decimal ? value : new Decimal(value);
function normalize(value) {
  if (!Number.isFinite(value.mantissa) || !Number.isSafeInteger(value.exponent) || Math.abs(value.exponent) > MAX_EXPONENT) {
    throw new RangeError('Quantity exceeds the supported exponent range');
  }
  if (value.mantissa === 0) return 0;
  if (value.exponent >= -300 && value.exponent <= 12) {
    const small = value.toNumber();
    if (Math.abs(small) <= SMALL) return small;
  }
  return new LargeQuantity(value);
}
export function quantity(value) {
  if (isLargeQuantity(value)) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Quantity must be finite');
    return Math.abs(value) <= SMALL ? value : normalize(decimal(value));
  }
  if (typeof value !== 'string' || value.length > 120 || !syntax.test(value)) throw new TypeError('Invalid quantity');
  // Number's own decimal parser preserves the exact small-value JSON round trip.
  const small = Number(value);
  if (Number.isFinite(small) && Math.abs(small) <= SMALL && (small !== 0 || decimal(value).mantissa === 0)) return small;
  return normalize(decimal(value));
}
export function validQuantity(value) {
  try { quantity(value); return typeof value !== 'string'; } catch { return false; }
}
function binary(a, b, native, method, underflow = false) {
  a = quantity(a); b = quantity(b);
  if (typeof a === 'number' && typeof b === 'number') {
    const result = native(a, b);
    if (Number.isFinite(result) && Math.abs(result) <= SMALL && !(underflow && !result && a && b)) return result;
  }
  return normalize(decimal(a)[method](decimal(b)));
}
export const add = (a, b) => binary(a, b, (a, b) => a + b, 'add');
export const sub = (a, b) => binary(a, b, (a, b) => a - b, 'sub');
export const mul = (a, b) => binary(a, b, (a, b) => a * b, 'mul', true);
export function div(a, b) {
  if (eq(b, 0)) throw new RangeError('Division by zero');
  return binary(a, b, (a, b) => a / b, 'div', true);
}
export function pow(a, exponent) {
  a = quantity(a);
  if (!Number.isFinite(exponent)) throw new TypeError('Invalid quantity exponent');
  if (typeof a === 'number') {
    const result = a ** exponent;
    if (Number.isFinite(result) && Math.abs(result) <= SMALL && (result !== 0 || a === 0)) return result;
  }
  return normalize(decimal(a).pow(exponent));
}
export function cmp(a, b) {
  a = quantity(a); b = quantity(b);
  return typeof a === 'number' && typeof b === 'number' ? (a === b ? 0 : a > b ? 1 : -1) : decimal(a).cmp(decimal(b));
}
export const eq = (a, b) => cmp(a, b) === 0;
export const gt = (a, b) => cmp(a, b) > 0;
export const gte = (a, b) => cmp(a, b) >= 0;
export const lt = (a, b) => cmp(a, b) < 0;
export const lte = (a, b) => cmp(a, b) <= 0;
export const min = (a, b) => lte(a, b) ? quantity(a) : quantity(b);
export const max = (a, b) => gte(a, b) ? quantity(a) : quantity(b);
export const clamp = (value, low, high) => min(high, max(low, value));
export const abs = value => lt(value, 0) ? mul(value, -1) : quantity(value);
export const floor = value => { value = quantity(value); return typeof value === 'number' ? Math.floor(value) : normalize(value.floor()); };
export const round = value => { value = quantity(value); return typeof value === 'number' ? Math.round(value) : normalize(value.round()); };
export const isInteger = value => validQuantity(value) && eq(value, floor(value));
export const sum = values => values.reduce(add, 0);
export const canAfford = (balance, price) => gte(add(balance, 1e-6), price);

// Only bounded presentation/configuration values may cross into native Number.
export function toNumber(value) {
  value = quantity(value);
  if (typeof value !== 'number') throw new RangeError('Unbounded quantity cannot be converted to Number');
  return value;
}
export function ratio(value, total) {
  if (lte(total, 0) || lte(value, 0)) return 0;
  if (gte(value, total)) return 1;
  if (decimal(value).exponent - decimal(total).exponent < -300) return 0;
  return toNumber(clamp(div(value, total), 0, 1));
}
export const encodeQuantity = value => String(quantity(value));
export function decodeQuantity(value) {
  if (typeof value !== 'string') throw new TypeError('Saved quantity must be a string');
  const result = quantity(value);
  if (encodeQuantity(result) !== value) throw new TypeError('Saved quantity must be canonical');
  return result;
}
export function formatQuantity(value, digits = 3) {
  value = quantity(value);
  if (typeof value === 'number' && (value === 0 || (Math.abs(value) < 1e6 && Math.abs(value) >= 0.001))) {
    return digits === null ? String(value) : String(Number(value.toFixed(digits)));
  }
  return decimal(value).toExponential(digits ?? 3).replace(/\.?0+e/, 'e');
}

export const Q = Object.freeze({ of: quantity, add, sub, mul, div, pow, cmp, eq, gt, gte, lt, lte,
  min, max, clamp, abs, floor, round, sum, canAfford, ratio, toNumber, format: formatQuantity,
  encode: encodeQuantity, decode: decodeQuantity, valid: validQuantity, isInteger });
