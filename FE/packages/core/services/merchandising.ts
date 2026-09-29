import type { CreatePromotionInput, FeaturedProduct, Promotion, UpdatePromotionInput } from '../types';

export interface MerchandisingService {
  /** Ordered by position ascending. */
  listFeatured(vendorOrgId: string): Promise<FeaturedProduct[]>;
  /** Replace the whole curated list; array order becomes position. */
  setFeatured(vendorOrgId: string, productIds: string[]): Promise<FeaturedProduct[]>;

  listPromotions(vendorOrgId: string): Promise<Promotion[]>;
  createPromotion(input: CreatePromotionInput): Promise<Promotion>;
  updatePromotion(promotionId: string, patch: UpdatePromotionInput): Promise<Promotion>;
  deletePromotion(promotionId: string): Promise<void>;
}
