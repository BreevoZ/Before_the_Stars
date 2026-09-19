import { Q } from './quantity.js';

// Actual payments are inputs, not a valuation of owned talents at today's prices.
// One entry per owned rank; historical grants have a zero payment.
export function payLegacy(permanent, key, cost) {
  permanent.legacy = Q.sub(permanent.legacy, cost);
  (permanent.purchaseCosts[key] ??= []).push(cost);
}
export function paidLegacy(permanent) {
  return Q.sum(Object.values(permanent.purchaseCosts).flat());
}
