import type { PricingService } from '../pricing';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const pricingService: PricingService = {
  listBuyerOverrides: async () => notImplemented('pricing.listBuyerOverrides'),
  setBuyerOverride: async () => notImplemented('pricing.setBuyerOverride'),
  deleteBuyerOverride: async () => notImplemented('pricing.deleteBuyerOverride'),
  resolvePrices: async () => notImplemented('pricing.resolvePrices'),
};
