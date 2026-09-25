import { Q, isLargeQuantity } from './quantity.js';
export const limit = 1e12;
export const fail = message => { throw new Error(`存档无效：${message}`); };
export const check = (condition, name) => { if (!condition) fail(name); };
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const num = (value, min = 0, max = limit) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export const int = (value, min = 0, max = limit) => num(value, min, max) && Number.isInteger(value);
export const bool = value => typeof value === 'boolean';
export const id = value => typeof value === 'string' && /^[a-zA-Z0-9:-]{1,120}$/.test(value);
export const member = (value, config) => typeof value === 'string' && Object.hasOwn(config, value);
export function numbers(value, required, optional = [], min = 0, max = limit) {
  for (const key of required) check(num(value[key], min, max), key);
  for (const key of optional) if (value[key] !== undefined) check(num(value[key], min, max), key);
}
export function list(value, max, name) { check(Array.isArray(value) && value.length <= max, name); }
export function safeTree(value, depth = 0, key = '') {
  check(depth <= 12, '嵌套过深');
  if (value === Infinity && key === 'maxRange') return;
  if (isLargeQuantity(value)) { check(Q.valid(value), '大数格式'); return; }
  if (typeof value === 'number') check(num(value, -limit), '数值超出范围');
  else if (typeof value === 'string') check(value.length <= 200, '文字过长');
  else if (Array.isArray(value)) {
    check(value.length <= 2048, '数组过长');
    value.forEach(item => safeTree(item, depth + 1));
  } else if (object(value)) {
    check(Object.keys(value).length <= 128, '字段过多');
    for (const [name, item] of Object.entries(value)) {
      check(!['__proto__', 'constructor', 'prototype'].includes(name), '非法字段');
      // Undefined optional fields are omitted by JSON.stringify.
      if (item !== undefined) safeTree(item, depth + 1, name);
    }
  } else check(value === null || bool(value), '数据类型');
}
