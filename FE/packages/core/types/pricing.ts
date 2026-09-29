import type { PriceTier } from './catalogue';
import type { Promotion } from './merchandising';

export interface PriceQuery {
  productId: string;
  quantity: number;
}

/**
 * Output of the single price resolver (packages/core/pricing). [assumed]
 * shape — 04 only says "returns a final price"; the extra fields let the UI
 * explain *why* ("your price", tier hit, promotion applied).
 */
export interface ResolvedPrice {
  productId: string;
  quantity: number;
  /** Product.basePrice — the public list price. */
  basePrice: number;
  /** Price before promotions: override, else tier, else base. */
  preDiscountUnitPrice: number;
  /** Final per-unit price the buyer pays. */
  unitPrice: number;
  lineTotal: number;
  source: 'base' | 'tier' | 'override';
  appliedTier?: PriceTier;
  appliedPromotion?: Pick<Promotion, 'id' | 'type' | 'value' | 'scope'>;
}
