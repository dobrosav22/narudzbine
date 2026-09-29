import type { BuyerProductPrice, PriceQuery, ResolvedPrice } from '../types';

export interface PricingService {
  /** GET /vendor-orgs/:id/buyer-prices?buyerOrgId= */
  listBuyerOverrides(params: { vendorOrgId: string; buyerOrgId?: string; productId?: string }): Promise<BuyerProductPrice[]>;
  /** Upsert: one override per (buyer, product). */
  setBuyerOverride(input: Omit<BuyerProductPrice, 'id'>): Promise<BuyerProductPrice>;
  deleteBuyerOverride(overrideId: string): Promise<void>;

  /**
   * 04 → "Frontend expects a single endpoint or client-side resolver that takes
   * (vendorOrgId, buyerOrgId, productId, quantity)". Batched so a catalogue page
   * or cart resolves in one call. Mocks delegate to packages/core/pricing.
   */
  resolvePrices(params: { vendorOrgId: string; buyerOrgId: string; items: PriceQuery[] }): Promise<ResolvedPrice[]>;
}
