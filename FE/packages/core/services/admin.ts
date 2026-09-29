import type {
  BuyerOrg,
  SubscriptionTier,
  TierUpgradeRequest,
  VendorBuyerRelation,
  VendorOrg,
  VendorUsage,
} from '../types';

/** GET /admin/stats/summary */
export interface PlatformSummary {
  vendorCount: number;
  buyerCount: number;
  /** Vendor users + buyer users (the admin itself isn't counted). */
  userCount: number;
  /** [assumed] Extra: what the admin should look at first. */
  pendingUpgradeRequests: number;
}

/** One row of GET /admin/vendor-orgs. */
export interface AdminVendorRow {
  vendorOrg: VendorOrg;
  tier: SubscriptionTier;
  usage: VendorUsage;
  hasPendingRequest: boolean;
}

/** GET /admin/vendor-orgs/:id — 03 → Vendor detail. */
export interface AdminVendorDetail extends AdminVendorRow {
  orderCount: number;
  userCount: number;
  /** All of this vendor's requests, pending first, then newest. */
  upgradeRequests: TierUpgradeRequest[];
  /** Active and invited connections (removed ones are history, not shown). */
  connections: { relation: VendorBuyerRelation; buyerOrg: BuyerOrg }[];
}

/** One row of GET /admin/buyer-orgs. */
export interface AdminBuyerRow {
  buyerOrg: BuyerOrg;
  connectedVendorCount: number;
  userCount: number;
  locationCount: number;
}

/** GET /admin/buyer-orgs/:id — 03 → Buyer detail. */
export interface AdminBuyerDetail extends AdminBuyerRow {
  connections: { relation: VendorBuyerRelation; vendorOrg: VendorOrg }[];
}

export type ResolveUpgradeAction = { action: 'fulfill'; tierId: string } | { action: 'dismiss' };

/**
 * Platform Admin (01 §10, 04 "Platform Admin"). Web-only; one seeded account. Admin actions
 * bypass vendor-side rules on purpose: setTier may leave a vendor over its limits, and link
 * may exceed maxBuyers — the vendor is then hard-blocked from adding more until under.
 */
export interface AdminService {
  getPlatformSummary(): Promise<PlatformSummary>;
  listVendorOrgs(): Promise<AdminVendorRow[]>;
  getVendorOrgDetail(vendorOrgId: string): Promise<AdminVendorDetail>;
  listBuyerOrgs(): Promise<AdminBuyerRow[]>;
  getBuyerOrgDetail(buyerOrgId: string): Promise<AdminBuyerDetail>;
  /** POST /admin/vendor-orgs/:id/set-tier — direct override, independent of any request. */
  setTier(vendorOrgId: string, tierId: string): Promise<VendorOrg>;
  /** GET /admin/upgrade-requests?status= */
  listUpgradeRequests(status?: TierUpgradeRequest['status']): Promise<TierUpgradeRequest[]>;
  /** POST /admin/upgrade-requests/:id/resolve — fulfill applies a tier (any, not only the requested one); dismiss changes nothing. */
  resolveUpgradeRequest(requestId: string, resolution: ResolveUpgradeAction): Promise<TierUpgradeRequest>;
  /** POST /admin/vendor-buyer-relations — sets status 'active', creating the relation if needed. */
  linkVendorBuyer(vendorOrgId: string, buyerOrgId: string): Promise<VendorBuyerRelation>;
  /** DELETE /admin/vendor-buyer-relations/:id — status 'removed'. */
  unlinkVendorBuyer(relationId: string): Promise<VendorBuyerRelation>;
}
