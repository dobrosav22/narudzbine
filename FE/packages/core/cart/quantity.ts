/**
 * Whole-number ordering rules shared by the cart, product detail and checkout. The backend
 * accepts a quantity only when `quantity >= minimumQuantity` and
 * `(quantity - minimumQuantity) % quantityStep === 0` (GET /vendors/{id}/offers/{productId},
 * POST /order-reviews), with an upper bound of 1 000 000 000. These helpers mirror that rule so the
 * UI never sends a quantity the backend will reject; the backend still decides at review time.
 */

export const MAX_QUANTITY = 1_000_000_000;

export interface QuantityRule {
  minimumQuantity: number;
  quantityStep: number;
}

export type QuantityIssue = 'BELOW_MINIMUM' | 'STEP' | 'TOO_LARGE';

const step = (rule: QuantityRule) => Math.max(1, Math.floor(rule.quantityStep));
const minimum = (rule: QuantityRule) => Math.max(1, Math.floor(rule.minimumQuantity));

/** The largest quantity this rule allows (≤ MAX_QUANTITY). */
export function maxQuantity(rule: QuantityRule): number {
  const min = minimum(rule);
  if (min > MAX_QUANTITY) return min;
  return min + Math.floor((MAX_QUANTITY - min) / step(rule)) * step(rule);
}

/** Why a quantity is not orderable under the rule, or null when it is. */
export function quantityIssue(quantity: number, rule: QuantityRule): QuantityIssue | null {
  if (!Number.isInteger(quantity) || quantity < minimum(rule)) return 'BELOW_MINIMUM';
  if (quantity > MAX_QUANTITY) return 'TOO_LARGE';
  if ((quantity - minimum(rule)) % step(rule) !== 0) return 'STEP';
  return null;
}

export function isValidQuantity(quantity: number, rule: QuantityRule): boolean {
  return quantityIssue(quantity, rule) === null;
}

/**
 * The nearest valid quantity at or above `quantity` (the minimum for anything below it), capped
 * at the largest allowed quantity. Used to commit typed input and to suggest a fix.
 */
export function snapQuantity(quantity: number, rule: QuantityRule): number {
  const min = minimum(rule);
  const s = step(rule);
  if (!Number.isFinite(quantity) || quantity <= min) return min;
  const steps = Math.ceil((Math.floor(quantity) - min) / s);
  return Math.min(min + steps * s, maxQuantity(rule));
}

/** One step up or down from `quantity`, always landing on a valid quantity (never below the minimum). */
export function stepQuantity(quantity: number, rule: QuantityRule, direction: 1 | -1): number {
  const min = minimum(rule);
  const s = step(rule);
  if (direction === 1) {
    if (!isValidQuantity(quantity, rule)) return snapQuantity(quantity, rule);
    return Math.min(quantity + s, maxQuantity(rule));
  }
  if (quantity <= min) return min;
  if (!isValidQuantity(quantity, rule)) {
    // Down from an off-step value lands on the valid quantity just below it.
    const below = min + Math.floor((Math.min(quantity, maxQuantity(rule)) - min) / s) * s;
    return Math.max(min, below);
  }
  return Math.max(min, quantity - s);
}
