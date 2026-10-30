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

export type QuantityInput =
  | { kind: 'EMPTY' }
  /** Not a plain whole number: decimals ("6.5", "1,5"), separators ("1.000"), signs or letters. */
  | { kind: 'NOT_WHOLE' }
  /** `adjusted`: the typed number was moved to the nearest valid quantity (minimum or step). */
  | { kind: 'OK'; quantity: number; adjusted: boolean };

/**
 * Reads a typed quantity. Only plain digits count: a decimal or thousands separator is ambiguous
 * between languages ("1.000" is a thousand in Serbian), so it is rejected instead of being dropped,
 * which would turn "6.5" into 65.
 */
export function readTypedQuantity(text: string, rule: QuantityRule): QuantityInput {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'EMPTY' };
  if (!/^\d+$/.test(trimmed)) return { kind: 'NOT_WHOLE' };
  const typed = Number(trimmed);
  const quantity = snapQuantity(typed, rule);
  return { kind: 'OK', quantity, adjusted: quantity !== typed };
}

/** Quantities at or above this ask for confirmation before an order is placed (QA-016). */
export const LARGE_QUANTITY = 1000;

export function isLargeQuantity(quantity: number): boolean {
  return quantity >= LARGE_QUANTITY;
}
