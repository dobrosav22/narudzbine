import { formatNumber } from '../helpers';
import type {
  BuyerConnection,
  BuyerOrgsService,
  BuyersService,
  LocationsService,
  SubscriptionService,
  TeamService,
  VendorOrgsService,
} from '../services';
import type { SubscriptionTier, TierUpgradeRequest, VendorUsage } from '../types';
import { serviceError } from '../errors';
import { db } from './db';
import { clone, delay, findOrThrow, newId, nowIso } from './util';
import { SUBSCRIPTION_TIERS } from '../config/subscriptionTiers';

/**
 * [assumed] Orders still in progress that would lose their warehouse or delivery address.
 * Finished and cancelled orders keep the id (their history shows "Former location").
 */
function openOrdersUsing(match: (o: (typeof db.orders)[number]) => boolean): number {
  return db.orders.filter((o) => {
    if (!match(o)) return false;
    const config = db.statusConfigs.find((c) => c.vendorOrgId === o.vendorOrgId);
    return !config?.statuses.find((s) => s.key === o.statusKey)?.isTerminal;
  }).length;
}

function requireName(name: string | undefined): void {
  if (name !== undefined && !name.trim()) throw serviceError('VALIDATION', 'errors.companyNameRequired');
}

export const vendorOrgsService: VendorOrgsService = {
  async getVendorOrg(vendorOrgId) {
    await delay();
    return clone(findOrThrow(db.vendorOrgs, (o) => o.id === vendorOrgId, 'Vendor'));
  },
  async updateVendorOrg(vendorOrgId, patch) {
    await delay();
    const org = findOrThrow(db.vendorOrgs, (o) => o.id === vendorOrgId, 'Vendor');
    requireName(patch.name);
    Object.assign(org, patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch);
    // Turning tracking on gives every product a stock number to edit; off removes it (01 §3).
    if (patch.tracksInventory !== undefined) {
      for (const p of db.products.filter((p) => p.vendorOrgId === vendorOrgId)) {
        if (patch.tracksInventory) p.stock ??= 0;
        else delete p.stock;
      }
    }
    return clone(org);
  },
};

export const buyerOrgsService: BuyerOrgsService = {
  async getBuyerOrg(buyerOrgId) {
    await delay();
    return clone(findOrThrow(db.buyerOrgs, (o) => o.id === buyerOrgId, 'Buyer organization'));
  },
  async updateBuyerOrg(buyerOrgId, patch) {
    await delay();
    const org = findOrThrow(db.buyerOrgs, (o) => o.id === buyerOrgId, 'Buyer organization');
    requireName(patch.name);
    Object.assign(org, patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch);
    return clone(org);
  },
  async listConnectedVendors(buyerOrgId) {
    await delay();
    const ids = db.relations.filter((r) => r.buyerOrgId === buyerOrgId && r.status === 'active').map((r) => r.vendorOrgId);
    return clone(db.vendorOrgs.filter((v) => ids.includes(v.id)).sort((a, b) => a.name.localeCompare(b.name)));
  },
};

/** The configured tier by id (config/subscriptionTiers.ts is the mock's read source — 02 v1.1). */
export function tierById(tierId: string): SubscriptionTier {
  const tier = SUBSCRIPTION_TIERS.find((t) => t.id === tierId);
  if (!tier) throw serviceError('NOT_FOUND', 'errors.notFound');
  return clone(tier);
}

/** Exported for the hard limit checks in the catalogue and invites mocks, and the admin mock. */
export function usageFor(vendorOrgId: string): VendorUsage {
  const org = findOrThrow(db.vendorOrgs, (o) => o.id === vendorOrgId, 'Vendor');
  const tier = tierById(org.subscriptionTierId);
  const buyerEmails = new Set(db.buyerUsers.map((u) => u.email));
  const connected = db.relations.filter((r) => r.vendorOrgId === vendorOrgId && r.status !== 'removed').length;
  // Pending invites to brand-new buyers (no org yet, so no relation) also hold a seat.
  const pendingNew = db.invites.filter(
    (i) => i.type === 'buyer_org_invite' && i.vendorOrgId === vendorOrgId && i.status === 'pending' && !buyerEmails.has(i.email),
  ).length;
  return {
    vendorOrgId,
    productCount: db.products.filter((p) => p.vendorOrgId === vendorOrgId).length,
    maxProducts: tier.maxProducts,
    buyerCount: connected + pendingNew,
    maxBuyers: tier.maxBuyers,
    tierId: tier.id,
  };
}

export const subscriptionService: SubscriptionService = {
  async listTiers() {
    await delay();
    return clone([...SUBSCRIPTION_TIERS].sort((a, b) => a.priceMonthly - b.priceMonthly));
  },
  async getUsage(vendorOrgId) {
    await delay();
    return usageFor(vendorOrgId);
  },
  async requestUpgrade({ vendorOrgId, requestedTierId, message }) {
    await delay();
    const org = findOrThrow(db.vendorOrgs, (o) => o.id === vendorOrgId, 'Vendor');
    tierById(requestedTierId);
    if (requestedTierId === org.subscriptionTierId) throw serviceError('VALIDATION', 'errors.alreadyOnPlan');
    if (db.upgradeRequests.some((r) => r.vendorOrgId === vendorOrgId && r.status === 'pending'))
      throw serviceError('CONFLICT', 'errors.requestPending');
    const request: TierUpgradeRequest = {
      id: newId('tur'),
      vendorOrgId,
      requestedTierId,
      ...(message?.trim() ? { message: message.trim() } : {}),
      status: 'pending',
      createdAt: nowIso(),
    };
    db.upgradeRequests.push(request);
    return clone(request);
  },
  async listUpgradeRequests(vendorOrgId) {
    await delay();
    return clone(db.upgradeRequests.filter((r) => r.vendorOrgId === vendorOrgId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },
};

function requireAddress(name: string | undefined, address: string | undefined): void {
  if (name !== undefined && !name.trim()) throw serviceError('VALIDATION', 'errors.locationNameRequired');
  if (address !== undefined && !address.trim()) throw serviceError('VALIDATION', 'errors.addressRequired');
}

function trimmed(input: { name?: string; address?: string }) {
  return {
    ...(input.name !== undefined && { name: input.name.trim() }),
    ...(input.address !== undefined && { address: input.address.trim() }),
  };
}

export const locationsService: LocationsService = {
  async listVendorLocations(vendorOrgId) {
    await delay();
    return clone(db.vendorLocations.filter((l) => l.vendorOrgId === vendorOrgId));
  },
  async createVendorLocation(vendorOrgId, input) {
    await delay();
    requireAddress(input.name, input.address);
    const loc = { id: newId('vl'), vendorOrgId, name: input.name.trim(), address: input.address.trim() };
    db.vendorLocations.push(loc);
    return clone(loc);
  },
  async updateVendorLocation(locationId, input) {
    await delay();
    requireAddress(input.name, input.address);
    const loc = findOrThrow(db.vendorLocations, (l) => l.id === locationId, 'Location');
    Object.assign(loc, trimmed(input));
    return clone(loc);
  },
  async deleteVendorLocation(locationId) {
    await delay();
    const open = openOrdersUsing((o) => o.fulfillingLocationId === locationId);
    if (open) throw serviceError('CONFLICT', 'errors.warehouseInUse', { count: open, countText: formatNumber(open) });
    db.vendorLocations = db.vendorLocations.filter((l) => l.id !== locationId);
    for (const u of db.vendorUsers) if (u.homeLocationId === locationId) delete u.homeLocationId;
  },

  async listBuyerLocations(buyerOrgId) {
    await delay();
    return clone(db.locations.filter((l) => l.buyerOrgId === buyerOrgId));
  },
  async createBuyerLocation(buyerOrgId, input) {
    await delay();
    requireAddress(input.name, input.address);
    const loc = { id: newId('loc'), buyerOrgId, name: input.name.trim(), address: input.address.trim() };
    db.locations.push(loc);
    return clone(loc);
  },
  async updateBuyerLocation(locationId, input) {
    await delay();
    requireAddress(input.name, input.address);
    const loc = findOrThrow(db.locations, (l) => l.id === locationId, 'Location');
    Object.assign(loc, trimmed(input));
    return clone(loc);
  },
  async deleteBuyerLocation(locationId) {
    await delay();
    const loc = findOrThrow(db.locations, (l) => l.id === locationId, 'Location');
    if (db.locations.filter((l) => l.buyerOrgId === loc.buyerOrgId).length === 1)
      throw serviceError('VALIDATION', 'errors.lastLocation');
    const open = openOrdersUsing((o) => o.locationId === locationId);
    if (open) throw serviceError('CONFLICT', 'errors.locationInUse', { count: open, countText: formatNumber(open) });
    db.locations = db.locations.filter((l) => l.id !== locationId);
    for (const u of db.buyerUsers) if (u.homeLocationId === locationId) delete u.homeLocationId;
  },
};

export const teamService: TeamService = {
  async listVendorUsers(vendorOrgId) {
    await delay();
    return clone(db.vendorUsers.filter((u) => u.vendorOrgId === vendorOrgId));
  },
  async removeVendorUser(userId) {
    await delay();
    const user = findOrThrow(db.vendorUsers, (u) => u.id === userId, 'User');
    if (db.vendorUsers.filter((u) => u.vendorOrgId === user.vendorOrgId).length === 1)
      throw serviceError('VALIDATION', 'errors.lastUser');
    db.vendorUsers = db.vendorUsers.filter((u) => u.id !== userId);
  },
  async listBuyerUsers(buyerOrgId) {
    await delay();
    return clone(db.buyerUsers.filter((u) => u.buyerOrgId === buyerOrgId));
  },
  async removeBuyerUser(userId) {
    await delay();
    const user = findOrThrow(db.buyerUsers, (u) => u.id === userId, 'User');
    if (db.buyerUsers.filter((u) => u.buyerOrgId === user.buyerOrgId).length === 1)
      throw serviceError('VALIDATION', 'errors.lastUser');
    db.buyerUsers = db.buyerUsers.filter((u) => u.id !== userId);
  },
  async setHomeLocation(userId, locationId) {
    await delay();
    const user = db.vendorUsers.find((u) => u.id === userId) ?? db.buyerUsers.find((u) => u.id === userId);
    if (!user) throw serviceError('NOT_FOUND', 'errors.notFound');
    if (locationId === null) delete user.homeLocationId;
    else user.homeLocationId = locationId;
    return clone(user);
  },
};

function connection(vendorOrgId: string, buyerOrgId: string): BuyerConnection {
  const relation = findOrThrow(
    db.relations,
    (r) => r.vendorOrgId === vendorOrgId && r.buyerOrgId === buyerOrgId && r.status !== 'removed',
    'Buyer connection',
  );
  const buyerOrg = findOrThrow(db.buyerOrgs, (o) => o.id === buyerOrgId, 'Buyer organization');
  const emails = db.buyerUsers.filter((u) => u.buyerOrgId === buyerOrgId).map((u) => u.email);
  const pendingInviteEmail =
    relation.status === 'invited'
      ? db.invites.find((i) => i.vendorOrgId === vendorOrgId && i.status === 'pending' && emails.includes(i.email))?.email
      : undefined;
  return clone({ relation, buyerOrg, pendingInviteEmail });
}

export const buyersService: BuyersService = {
  async listConnections(vendorOrgId) {
    await delay();
    return db.relations
      .filter((r) => r.vendorOrgId === vendorOrgId && r.status !== 'removed')
      .map((r) => connection(vendorOrgId, r.buyerOrgId))
      .sort((a, b) => a.buyerOrg.name.localeCompare(b.buyerOrg.name));
  },
  async getConnection(vendorOrgId, buyerOrgId) {
    await delay();
    return connection(vendorOrgId, buyerOrgId);
  },
  async removeConnection(vendorOrgId, buyerOrgId) {
    await delay();
    const rel = findOrThrow(db.relations, (r) => r.vendorOrgId === vendorOrgId && r.buyerOrgId === buyerOrgId, 'Buyer connection');
    rel.status = 'removed';
  },
};
