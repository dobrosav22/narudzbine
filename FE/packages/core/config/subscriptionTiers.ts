import type { SubscriptionTier } from '../types';

/**
 * Subscription tiers — the single editable source (01 §2, 02 "Tier limit enforcement",
 * 04 "Vendor org"). Not a database table and not env vars. The mock subscription service
 * reads this directly; a real backend replaces the read source (GET /subscription-tiers),
 * not the shape. Prices are monthly, in CURRENCY (BAM); limits are hard-enforced.
 */
export const SUBSCRIPTION_TIERS: readonly SubscriptionTier[] = [
  { id: 'tier_starter', name: 'Starter', priceMonthly: 59, maxProducts: 10, maxBuyers: 5 },
  { id: 'tier_growth', name: 'Growth', priceMonthly: 159, maxProducts: 250, maxBuyers: 50 },
  { id: 'tier_pro', name: 'Pro', priceMonthly: 389, maxProducts: 5000, maxBuyers: 500 },
];
