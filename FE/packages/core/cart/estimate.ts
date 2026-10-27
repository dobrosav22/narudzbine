import type { Offer } from '../api/models.gen';
import { sumMoney } from '../money';
import { quantityIssue, snapQuantity, type QuantityIssue, type QuantityRule } from './quantity';
import type { CartLine } from './store';

/**
 * What the cart can say about one line before review: its current quantity rule (from the live
 * offer, else the snapshot taken when it was added), whether the quantity fits, a suggested valid
 * quantity, and confirmed-stock shortage. Advisory only — POST /order-reviews decides.
 */
export interface CartLineCheck {
  rule: QuantityRule | null;
  issue: QuantityIssue | null;
  /** Nearest valid quantity at or above the current one, when the current one does not fit. */
  suggested: number | null;
  /** Tracked, confirmed stock is lower than the line quantity. */
  stockShort: boolean;
  unavailable: boolean;
}

export function checkCartLine(line: CartLine, offer: Offer | undefined, unavailable = false): CartLineCheck {
  const rule: QuantityRule | null = offer ? offer.product : line.snapshot ?? null;
  const issue = rule ? quantityIssue(line.quantity, rule) : null;
  const stockShort = !!offer && offer.stockTracked && offer.availableQuantity !== null && offer.availableQuantity < line.quantity;
  return { rule, issue, suggested: rule && issue ? snapQuantity(line.quantity, rule) : null, stockShort, unavailable };
}

/**
 * Display estimate of the goods total: the sum of current line totals priced at each line's
 * quantity. `complete` is false while any line is unpriced, unavailable or priced at another
 * quantity (e.g. an invalid quantity), so the UI can label the figure as partial.
 */
export function cartEstimate(rows: readonly { line: CartLine; offer: Offer | undefined; unavailable?: boolean }[]): { total: string; complete: boolean } {
  const priced = rows.filter((r) => !r.unavailable && r.offer && r.offer.pricedQuantity === r.line.quantity);
  return { total: sumMoney(priced.map((r) => r.offer!.effectivePrice.lineTotal)), complete: priced.length === rows.length };
}
