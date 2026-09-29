import type {
  BuyerFavorite,
  BuyerOrg,
  BuyerProductPrice,
  BuyerUser,
  Category,
  DraftCart,
  FeaturedProduct,
  Invite,
  Location,
  NotificationPreference,
  Order,
  OrderMessage,
  PriceTier,
  Product,
  Promotion,
  PlatformAdmin,
  TierUpgradeRequest,
  Tag,
  VendorBuyerRelation,
  VendorLocation,
  VendorOrderStatusConfig,
  VendorOrg,
  VendorUser,
} from '../types';
import { buildSeed } from './seed';

export interface MockDb {
  platformAdmins: PlatformAdmin[];
  upgradeRequests: TierUpgradeRequest[];
  vendorOrgs: VendorOrg[];
  vendorLocations: VendorLocation[];
  vendorUsers: VendorUser[];
  buyerOrgs: BuyerOrg[];
  locations: Location[];
  buyerUsers: BuyerUser[];
  relations: VendorBuyerRelation[];
  invites: Invite[];
  categories: Category[];
  tags: Tag[];
  products: Product[];
  priceTiers: PriceTier[];
  buyerPrices: BuyerProductPrice[];
  featured: FeaturedProduct[];
  promotions: Promotion[];
  statusConfigs: VendorOrderStatusConfig[];
  orders: Order[];
  messages: OrderMessage[];
  favorites: BuyerFavorite[];
  draftCarts: DraftCart[];
  /** Only explicitly-changed preferences; the rest default (see mocks/notifications.ts). */
  notificationPrefs: NotificationPreference[];
  /** Mock-only: email → password. Every seeded user's password is MOCK_PASSWORD. */
  passwords: Record<string, string>;
}

/**
 * In-memory, per-process (per browser tab on web, per app launch on mobile).
 * A page reload resets it to the seed — acceptable while mocked.
 */
export const db: MockDb = buildSeed(new Date());

/** Tests use this to start from a clean seed. Mutates in place so every importer sees it. */
export function resetMockDb(now: Date = new Date()): void {
  Object.assign(db, buildSeed(now));
}
