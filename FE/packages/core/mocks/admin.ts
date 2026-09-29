import type { AdminService, AdminVendorRow } from '../services';
import type { TierUpgradeRequest, VendorBuyerRelation } from '../types';
import { serviceError } from '../errors';
import { db } from './db';
import { tierById, usageFor } from './orgs';
import { clone, delay, findOrThrow, newId, nowIso } from './util';

function vendorRow(vendorOrgId: string): AdminVendorRow {
  const vendorOrg = findOrThrow(db.vendorOrgs, (o) => o.id === vendorOrgId, 'Vendor');
  return {
    vendorOrg: clone(vendorOrg),
    tier: tierById(vendorOrg.subscriptionTierId),
    usage: usageFor(vendorOrgId),
    hasPendingRequest: db.upgradeRequests.some((r) => r.vendorOrgId === vendorOrgId && r.status === 'pending'),
  };
}

function buyerRow(buyerOrgId: string) {
  const buyerOrg = findOrThrow(db.buyerOrgs, (o) => o.id === buyerOrgId, 'Buyer organization');
  return {
    buyerOrg: clone(buyerOrg),
    connectedVendorCount: db.relations.filter((r) => r.buyerOrgId === buyerOrgId && r.status === 'active').length,
    userCount: db.buyerUsers.filter((u) => u.buyerOrgId === buyerOrgId).length,
    locationCount: db.locations.filter((l) => l.buyerOrgId === buyerOrgId).length,
  };
}

/** Pending first (oldest waiting longest first), then the rest newest first. */
function sortRequests(list: TierUpgradeRequest[]): TierUpgradeRequest[] {
  return [...list].sort((a, b) => {
    if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
    return a.status === 'pending' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt);
  });
}

/** A pending vendor invite to this buyer org's people would contradict an admin link/unlink — close it. */
function closePendingInvites(vendorOrgId: string, buyerOrgId: string, status: 'accepted' | 'expired') {
  const emails = new Set(db.buyerUsers.filter((u) => u.buyerOrgId === buyerOrgId).map((u) => u.email));
  for (const i of db.invites)
    if (i.type === 'buyer_org_invite' && i.vendorOrgId === vendorOrgId && i.status === 'pending' && emails.has(i.email)) {
      i.status = status;
      if (status === 'accepted') i.acceptedAt = nowIso();
    }
}

function applyTier(vendorOrgId: string, tierId: string) {
  tierById(tierId);
  const org = findOrThrow(db.vendorOrgs, (o) => o.id === vendorOrgId, 'Vendor');
  org.subscriptionTierId = tierId;
  return org;
}

/**
 * Mock Platform Admin service (04 v1.1 → "Platform Admin"). Like every mock, it doesn't
 * check who's calling — the real backend must reject these for anything but an admin
 * session (01 §1: isolation is enforced by scoping plus auth).
 */
export const adminService: AdminService = {
  async getPlatformSummary() {
    await delay();
    return {
      vendorCount: db.vendorOrgs.length,
      buyerCount: db.buyerOrgs.length,
      userCount: db.vendorUsers.length + db.buyerUsers.length,
      pendingUpgradeRequests: db.upgradeRequests.filter((r) => r.status === 'pending').length,
    };
  },

  async listVendorOrgs() {
    await delay();
    return db.vendorOrgs.map((o) => vendorRow(o.id)).sort((a, b) => a.vendorOrg.name.localeCompare(b.vendorOrg.name));
  },

  async getVendorOrgDetail(vendorOrgId) {
    await delay();
    const row = vendorRow(vendorOrgId);
    return {
      ...row,
      orderCount: db.orders.filter((o) => o.vendorOrgId === vendorOrgId).length,
      userCount: db.vendorUsers.filter((u) => u.vendorOrgId === vendorOrgId).length,
      upgradeRequests: clone(sortRequests(db.upgradeRequests.filter((r) => r.vendorOrgId === vendorOrgId))),
      connections: db.relations
        .filter((r) => r.vendorOrgId === vendorOrgId && r.status !== 'removed')
        .map((relation) => ({ relation: clone(relation), buyerOrg: clone(findOrThrow(db.buyerOrgs, (b) => b.id === relation.buyerOrgId, 'Buyer organization')) }))
        .sort((a, b) => a.buyerOrg.name.localeCompare(b.buyerOrg.name)),
    };
  },

  async listBuyerOrgs() {
    await delay();
    return db.buyerOrgs.map((o) => buyerRow(o.id)).sort((a, b) => a.buyerOrg.name.localeCompare(b.buyerOrg.name));
  },

  async getBuyerOrgDetail(buyerOrgId) {
    await delay();
    return {
      ...buyerRow(buyerOrgId),
      connections: db.relations
        .filter((r) => r.buyerOrgId === buyerOrgId && r.status !== 'removed')
        .map((relation) => ({ relation: clone(relation), vendorOrg: clone(findOrThrow(db.vendorOrgs, (v) => v.id === relation.vendorOrgId, 'Vendor')) }))
        .sort((a, b) => a.vendorOrg.name.localeCompare(b.vendorOrg.name)),
    };
  },

  async setTier(vendorOrgId, tierId) {
    await delay();
    // Deliberately allowed below current usage: the vendor is then over its limit and hard-blocked (01 §2).
    return clone(applyTier(vendorOrgId, tierId));
  },

  async listUpgradeRequests(status) {
    await delay();
    return clone(sortRequests(db.upgradeRequests.filter((r) => !status || r.status === status)));
  },

  async resolveUpgradeRequest(requestId, resolution) {
    await delay();
    const request = findOrThrow(db.upgradeRequests, (r) => r.id === requestId, 'Upgrade request');
    if (request.status !== 'pending') throw serviceError('CONFLICT', 'errors.requestAlreadyResolved', { status: request.status });
    if (resolution.action === 'fulfill') {
      applyTier(request.vendorOrgId, resolution.tierId);
      request.status = 'fulfilled';
      request.appliedTierId = resolution.tierId;
    } else {
      request.status = 'dismissed';
    }
    request.resolvedAt = nowIso();
    return clone(request);
  },

  async linkVendorBuyer(vendorOrgId, buyerOrgId) {
    await delay();
    findOrThrow(db.vendorOrgs, (o) => o.id === vendorOrgId, 'Vendor');
    findOrThrow(db.buyerOrgs, (o) => o.id === buyerOrgId, 'Buyer organization');
    // Reuses the same relation record the invite flow creates (01 §9); bypasses the buyer limit on purpose.
    let relation: VendorBuyerRelation | undefined = db.relations.find((r) => r.vendorOrgId === vendorOrgId && r.buyerOrgId === buyerOrgId);
    if (relation?.status === 'active') throw serviceError('CONFLICT', 'errors.alreadyConnected');
    if (relation) {
      relation.status = 'active';
      relation.joinedAt = nowIso();
    } else {
      relation = { id: newId('rel'), vendorOrgId, buyerOrgId, status: 'active', joinedAt: nowIso() };
      db.relations.push(relation);
    }
    closePendingInvites(vendorOrgId, buyerOrgId, 'accepted');
    return clone(relation);
  },

  async unlinkVendorBuyer(relationId) {
    await delay();
    const relation = findOrThrow(db.relations, (r) => r.id === relationId, 'Connection');
    relation.status = 'removed';
    closePendingInvites(relation.vendorOrgId, relation.buyerOrgId, 'expired');
    return clone(relation);
  },
};
