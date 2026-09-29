import type { PricingService } from '../services';
import type { ResolvedPrice } from '../types';
import { serviceError } from '../errors';
import { resolvePrice, roundMoney } from '../pricing';
import { db } from './db';
import { clone, delay, findOrThrow, newId } from './util';

/** Shared with the orders mock so an order's snapshot price == what the cart showed. */
export function resolveFromDb(vendorOrgId: string, buyerOrgId: string, productId: string, quantity: number): ResolvedPrice {
  const product = findOrThrow(db.products, (p) => p.id === productId && p.vendorOrgId === vendorOrgId, 'Product');
  return resolvePrice({
    product,
    quantity,
    buyerOrgId,
    tiers: db.priceTiers,
    overrides: db.buyerPrices,
    promotions: db.promotions.filter((p) => p.vendorOrgId === vendorOrgId),
  });
}

export const pricingService: PricingService = {
  async listBuyerOverrides({ vendorOrgId, buyerOrgId, productId }) {
    await delay();
    return clone(
      db.buyerPrices.filter(
        (b) => b.vendorOrgId === vendorOrgId && (!buyerOrgId || b.buyerOrgId === buyerOrgId) && (!productId || b.productId === productId),
      ),
    );
  },
  async setBuyerOverride(input) {
    await delay();
    if (!(input.price >= 0)) throw serviceError('VALIDATION', 'errors.priceNegative');
    const existing = db.buyerPrices.find((b) => b.buyerOrgId === input.buyerOrgId && b.productId === input.productId);
    if (existing) {
      existing.price = roundMoney(input.price);
      return clone(existing);
    }
    const created = { ...input, price: roundMoney(input.price), id: newId('bp') };
    db.buyerPrices.push(created);
    return clone(created);
  },
  async deleteBuyerOverride(overrideId) {
    await delay();
    db.buyerPrices = db.buyerPrices.filter((b) => b.id !== overrideId);
  },
  async resolvePrices({ vendorOrgId, buyerOrgId, items }) {
    await delay(80);
    return items.map((i) => resolveFromDb(vendorOrgId, buyerOrgId, i.productId, i.quantity));
  },
};
