import type {
  BuyerOrg,
  BuyerUser,
  Location,
  LocationInput,
  SubscriptionTier,
  TierUpgradeRequest,
  VendorBuyerRelation,
  VendorLocation,
  VendorOrg,
  VendorUsage,
  VendorUser,
} from '../types';

/** GET/PATCH /vendor-orgs/:id */
export interface VendorOrgsService {
  getVendorOrg(vendorOrgId: string): Promise<VendorOrg>;
  updateVendorOrg(vendorOrgId: string, patch: Partial<Pick<VendorOrg, 'name' | 'tracksInventory'>>): Promise<VendorOrg>;
}

/** GET/PATCH /buyer-orgs/:id, plus the buyer's view of its vendor connections. */
export interface BuyerOrgsService {
  getBuyerOrg(buyerOrgId: string): Promise<BuyerOrg>;
  updateBuyerOrg(buyerOrgId: string, patch: Partial<Pick<BuyerOrg, 'name'>>): Promise<BuyerOrg>;
  /** Vendors this buyer is actively connected to — powers the vendor switcher. */
  listConnectedVendors(buyerOrgId: string): Promise<VendorOrg[]>;
}

/**
 * v1.1 (01 §2, 02 "Tier limit enforcement"): tiers come from config/subscriptionTiers.ts,
 * limits are hard-enforced, and vendors can't change their own tier — they request it.
 * Only services.admin.setTier / resolveUpgradeRequest change VendorOrg.subscriptionTierId.
 */
export interface SubscriptionService {
  /** GET /subscription-tiers — cheapest first. */
  listTiers(): Promise<SubscriptionTier[]>;
  /** GET /vendor-orgs/:id/usage — checked before Add Product and Invite Buyer, and shown on Subscription & Billing. */
  getUsage(vendorOrgId: string): Promise<VendorUsage>;
  /** POST /vendor-orgs/:id/upgrade-requests. [assumed] One pending request at a time (CONFLICT otherwise). */
  requestUpgrade(input: { vendorOrgId: string; requestedTierId: string; message?: string }): Promise<TierUpgradeRequest>;
  /** [assumed] GET /vendor-orgs/:id/upgrade-requests — the vendor's own history, newest first (03 → Subscription & billing). */
  listUpgradeRequests(vendorOrgId: string): Promise<TierUpgradeRequest[]>;
}

/** /vendor-orgs/:id/locations and /buyer-orgs/:id/locations */
export interface LocationsService {
  listVendorLocations(vendorOrgId: string): Promise<VendorLocation[]>;
  createVendorLocation(vendorOrgId: string, input: LocationInput): Promise<VendorLocation>;
  updateVendorLocation(locationId: string, input: Partial<LocationInput>): Promise<VendorLocation>;
  deleteVendorLocation(locationId: string): Promise<void>;

  listBuyerLocations(buyerOrgId: string): Promise<Location[]>;
  createBuyerLocation(buyerOrgId: string, input: LocationInput): Promise<Location>;
  updateBuyerLocation(locationId: string, input: Partial<LocationInput>): Promise<Location>;
  deleteBuyerLocation(locationId: string): Promise<void>;
}

/** /vendor-orgs/:id/users and /buyer-orgs/:id/users (invites live in InvitesService) */
export interface TeamService {
  listVendorUsers(vendorOrgId: string): Promise<VendorUser[]>;
  removeVendorUser(userId: string): Promise<void>;
  listBuyerUsers(buyerOrgId: string): Promise<BuyerUser[]>;
  removeBuyerUser(userId: string): Promise<void>;
  /** Home location is a default filter only, never a permission (01 §1). */
  setHomeLocation(userId: string, locationId: string | null): Promise<VendorUser | BuyerUser>;
}

export interface BuyerConnection {
  relation: VendorBuyerRelation;
  buyerOrg: BuyerOrg;
  /** Populated for 'invited' relations that haven't been accepted yet. */
  pendingInviteEmail?: string;
}

/** Vendor's view of its buyers — GET /vendor-orgs/:id/buyer-connections */
export interface BuyersService {
  listConnections(vendorOrgId: string): Promise<BuyerConnection[]>;
  getConnection(vendorOrgId: string, buyerOrgId: string): Promise<BuyerConnection>;
  removeConnection(vendorOrgId: string, buyerOrgId: string): Promise<void>;
}
