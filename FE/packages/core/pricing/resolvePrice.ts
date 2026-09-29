import type { BuyerProductPrice, PriceTier, Product } from '../types/catalogue';
import type { Promotion } from '../types/merchandising';
import type { ResolvedPrice } from '../types/pricing';

/**
 * THE price resolver. Cart, catalogue, checkout and the mock order service
 * all call this — never re-implement price logic in a component.
 *
 * Order — 04 → "Price resolution order (resolved 2026-09)":
 *   1. Pre-discount price = buyer negotiated price, else the quantity tier
 *      reached, else base price.
 *   2. Of the live promotions applicable to this product/buyer, apply the one
 *      giving the LOWEST resulting unit price — candidates are compared on the
 *      price they produce, never on `value` (10% and a flat amount aren't
 *      comparable otherwise). Promotions never stack. 'fixed' = amount off per unit.
 */
export interface PricingInput {
  product: Product;
  quantity: number;
  buyerOrgId?: string;
  tiers: PriceTier[];
  overrides: BuyerProductPrice[];
  promotions: Promotion[];
  now?: Date;
}

/**
 * Commercial rounding to 2 decimals, half away from zero. Floats can't hold
 * e.g. 42,10 × 0,95 = 39,995 exactly (it's 39,99499999…), so the cents value is
 * first snapped to 12 significant digits — adding Number.EPSILON is far too
 * small at this magnitude and would round it down to 39,99.
 */
export function roundMoney(n: number): number {
  const cents = Number((n * 100).toPrecision(12));
  return (Math.sign(cents) * Math.round(Math.abs(cents))) / 100;
}

export function isPromotionLive(p: Promotion, now: Date): boolean {
  if (!p.isActive) return false;
  const t = now.getTime();
  return new Date(p.startDate).getTime() <= t && t <= new Date(p.endDate).getTime();
}

export function promotionApplies(
  p: Promotion,
  product: Product,
  buyerOrgId: string | undefined,
  now: Date,
): boolean {
  if (p.vendorOrgId !== product.vendorOrgId || !isPromotionLive(p, now)) return false;
  switch (p.scope) {
    case 'all':
      return true;
    case 'product':
      return p.scopeIds.includes(product.id);
    case 'category':
      return product.categoryId !== undefined && p.scopeIds.includes(product.categoryId);
    case 'buyer':
      return buyerOrgId !== undefined && p.scopeIds.includes(buyerOrgId);
  }
}

function applyPromotion(price: number, p: Promotion): number {
  // 'fixed' = amount off per unit [assumed]; never below zero.
  const discounted = p.type === 'percentage' ? price * (1 - p.value / 100) : price - p.value;
  return Math.max(0, roundMoney(discounted));
}

/** Highest tier whose minQty the quantity reaches. */
export function pickTier(tiers: PriceTier[], quantity: number): PriceTier | undefined {
  let best: PriceTier | undefined;
  for (const t of tiers) {
    if (quantity >= t.minQty && (!best || t.minQty > best.minQty)) best = t;
  }
  return best;
}

export function resolvePrice(input: PricingInput): ResolvedPrice {
  const { product, buyerOrgId } = input;
  const quantity = Math.max(0, Math.floor(input.quantity));
  const now = input.now ?? new Date();

  const override = buyerOrgId
    ? input.overrides.find((o) => o.productId === product.id && o.buyerOrgId === buyerOrgId)
    : undefined;
  const tier = override
    ? undefined
    : pickTier(
        input.tiers.filter((t) => t.productId === product.id),
        Math.max(1, quantity),
      );

  const source: ResolvedPrice['source'] = override ? 'override' : tier ? 'tier' : 'base';
  const preDiscountUnitPrice = override?.price ?? tier?.pricePerUnit ?? product.basePrice;

  let unitPrice = preDiscountUnitPrice;
  let appliedPromotion: Promotion | undefined;
  for (const p of input.promotions) {
    if (!promotionApplies(p, product, buyerOrgId, now)) continue;
    const candidate = applyPromotion(preDiscountUnitPrice, p);
    if (candidate < unitPrice) {
      unitPrice = candidate;
      appliedPromotion = p;
    }
  }

  return {
    productId: product.id,
    quantity,
    basePrice: product.basePrice,
    preDiscountUnitPrice,
    unitPrice,
    lineTotal: roundMoney(unitPrice * quantity),
    source,
    appliedTier: tier,
    appliedPromotion: appliedPromotion && {
      id: appliedPromotion.id,
      type: appliedPromotion.type,
      value: appliedPromotion.value,
      scope: appliedPromotion.scope,
    },
  };
}
