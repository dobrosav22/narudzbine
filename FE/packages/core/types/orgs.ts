import type { AppLocale } from '../i18n/locales';
// Mirrors 04-data-contract-api-outline.md → "Vendor org" and "Buyer org".

export interface VendorOrg {
  id: string;
  name: string;
  subscriptionTierId: string;
  tracksInventory: boolean; // default policy; may be overridden per-product [assumed]
  createdAt: string;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  priceMonthly: number;
  maxProducts: number;
  maxBuyers: number;
}

export interface VendorLocation {
  id: string;
  vendorOrgId: string;
  name: string;
  address: string;
}

export interface VendorUser {
  id: string;
  vendorOrgId: string;
  email: string;
  name: string;
  homeLocationId?: string; // default context filter only, not a permission
  /** v1.1 (01 §12): this person's UI language; defaults to 'en'. */
  preferredLocale: AppLocale;
  createdAt: string;
}

export interface BuyerOrg {
  id: string;
  name: string;
  createdAt: string;
}

/** Buyer-side location = delivery address. */
export interface Location {
  id: string;
  buyerOrgId: string;
  name: string;
  address: string;
}

export interface BuyerUser {
  id: string;
  buyerOrgId: string;
  email: string;
  name: string;
  homeLocationId?: string;
  /** v1.1 (01 §12): this person's UI language; defaults to 'en'. */
  preferredLocale: AppLocale;
  createdAt: string;
}

export type OrgType = 'vendor' | 'buyer';

// ── v1.1: tier enforcement and Platform Admin (04 → "Platform Admin") ─────

/** GET /vendor-orgs/:id/usage — the one source of truth for "where does this vendor stand". */
export interface VendorUsage {
  vendorOrgId: string;
  productCount: number;
  maxProducts: number;
  /** Connected buyers, counting pending invites (they'd take a seat on acceptance). */
  buyerCount: number;
  maxBuyers: number;
  /** [assumed] Not in 04's shape; lets screens name the plan without a second call. */
  tierId: string;
}

export interface TierUpgradeRequest {
  id: string;
  vendorOrgId: string;
  requestedTierId: string;
  message?: string;
  status: 'pending' | 'fulfilled' | 'dismissed';
  createdAt: string;
  resolvedAt?: string;
  /** [assumed] Not in 04: the tier actually applied when fulfilled (the admin may pick a different one). */
  appliedTierId?: string;
}

export interface PlatformAdmin {
  id: string;
  email: string;
  name: string;
  preferredLocale: AppLocale;
  createdAt: string;
}
