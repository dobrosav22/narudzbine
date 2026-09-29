import type { MerchandisingService } from '../merchandising';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const merchandisingService: MerchandisingService = {
  listFeatured: async () => notImplemented('merchandising.listFeatured'),
  setFeatured: async () => notImplemented('merchandising.setFeatured'),
  listPromotions: async () => notImplemented('merchandising.listPromotions'),
  createPromotion: async () => notImplemented('merchandising.createPromotion'),
  updatePromotion: async () => notImplemented('merchandising.updatePromotion'),
  deletePromotion: async () => notImplemented('merchandising.deletePromotion'),
};
