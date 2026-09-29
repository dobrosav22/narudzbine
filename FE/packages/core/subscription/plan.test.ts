import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderEnglish as en } from '../i18n/message';
import { createServices } from '../serviceProvider';
import { db, resetMockDb } from '../mocks/db';
import { setMockLatency } from '../mocks/util';
import { isServiceError } from '../errors';
import { SUBSCRIPTION_TIERS } from '../config/subscriptionTiers';
import { isAtLimit, limitMessage, loadVendorPlan, pendingRequest, requestableTiers, usageLine } from './plan';

setMockLatency(0);
const s = createServices(true);
beforeEach(() => resetMockDb());
const rejects = (p: Promise<unknown>, code: Parameters<typeof isServiceError>[1]) => assert.rejects(p, (e) => isServiceError(e, code));

test('tiers come from config/subscriptionTiers.ts, cheapest first', async () => {
  assert.deepEqual((await s.subscription.listTiers()).map((t) => t.id), SUBSCRIPTION_TIERS.map((t) => t.id));
});

test('seed: CleanPro sits at its product limit and has a pending upgrade request', async () => {
  const plan = await loadVendorPlan(s, 'vo_cleanpro');
  assert.equal(plan.tier.name, 'Starter');
  assert.deepEqual([plan.productCount, plan.maxProducts], [10, 10]);
  assert.equal(isAtLimit(plan, 'products'), true);
  assert.equal(isAtLimit(plan, 'buyers'), false);
  assert.equal(en(usageLine(plan, 'products')), '10 of 10 products on Starter');
  assert.match(limitMessage(plan, 'products').map(en).join(' '), /^Your Starter plan allows 10 products\. Request/);
  assert.equal(pendingRequest(await s.subscription.listUpgradeRequests('vo_cleanpro'))?.requestedTierId, 'tier_growth');
  // The mock still backstops the hard block the UI enforces.
  await rejects(
    s.catalogue.createProduct({ vendorOrgId: 'vo_cleanpro', name: 'X', sku: 'X-1', tagIds: [], basePrice: 1, unit: 'piece', isActive: true }),
    'PLAN_LIMIT',
  );
});

test('upgrade request: one pending at a time, never the current tier, and it does not change the tier', async () => {
  await rejects(s.subscription.requestUpgrade({ vendorOrgId: 'vo_cleanpro', requestedTierId: 'tier_pro' }), 'CONFLICT');
  await rejects(s.subscription.requestUpgrade({ vendorOrgId: 'vo_papirko', requestedTierId: 'tier_growth' }), 'VALIDATION');
  const req = await s.subscription.requestUpgrade({ vendorOrgId: 'vo_papirko', requestedTierId: 'tier_pro', message: '  more SKUs  ' });
  assert.equal(req.status, 'pending');
  assert.equal(req.message, 'more SKUs');
  assert.equal((await s.subscription.getUsage('vo_papirko')).tierId, 'tier_growth');
  assert.deepEqual(requestableTiers(await s.subscription.listTiers(), 'tier_growth').map((t) => t.id), ['tier_starter', 'tier_pro']);
});

test('admin: resolve applies a tier (not necessarily the requested one) and unblocks; dismiss changes nothing', async () => {
  const [pending] = await s.admin.listUpgradeRequests('pending');
  assert.equal(pending?.id, 'tur_cleanpro_growth');
  const done = await s.admin.resolveUpgradeRequest(pending!.id, { action: 'fulfill', tierId: 'tier_pro' });
  assert.equal(done.status, 'fulfilled');
  assert.equal(done.appliedTierId, 'tier_pro');
  assert.ok(done.resolvedAt);
  const plan = await loadVendorPlan(s, 'vo_cleanpro');
  assert.equal(plan.tier.id, 'tier_pro');
  assert.equal(isAtLimit(plan, 'products'), false);
  await rejects(s.admin.resolveUpgradeRequest(pending!.id, { action: 'dismiss' }), 'CONFLICT');

  const again = await s.subscription.requestUpgrade({ vendorOrgId: 'vo_cleanpro', requestedTierId: 'tier_starter' });
  assert.equal((await s.admin.resolveUpgradeRequest(again.id, { action: 'dismiss' })).status, 'dismissed');
  assert.equal((await s.subscription.getUsage('vo_cleanpro')).tierId, 'tier_pro');
});

test('admin: set tier directly, even below current usage (vendor is then over its limit)', async () => {
  await s.admin.setTier('vo_papirko', 'tier_starter');
  const plan = await loadVendorPlan(s, 'vo_papirko');
  assert.ok(plan.productCount > plan.maxProducts);
  assert.equal(isAtLimit(plan, 'products'), true);
  assert.match(limitMessage(plan, 'products').map(en).join(' '), /You have 17 products\./);
});

test('admin: summary, lists and details', async () => {
  const summary = await s.admin.getPlatformSummary();
  assert.deepEqual(summary, {
    vendorCount: db.vendorOrgs.length,
    buyerCount: db.buyerOrgs.length,
    userCount: db.vendorUsers.length + db.buyerUsers.length,
    pendingUpgradeRequests: 1,
  });
  const vendors = await s.admin.listVendorOrgs();
  assert.equal(vendors.find((v) => v.vendorOrg.id === 'vo_cleanpro')?.hasPendingRequest, true);
  const detail = await s.admin.getVendorOrgDetail('vo_papirko');
  assert.equal(detail.tier.name, 'Growth');
  assert.equal(detail.userCount, 2);
  assert.ok(detail.orderCount > 0);
  assert.deepEqual(detail.upgradeRequests.map((r) => r.status), ['dismissed', 'fulfilled']); // newest first
  const aurora = await s.admin.getBuyerOrgDetail('bo_aurora');
  assert.deepEqual(aurora.connections.map((c) => c.vendorOrg.id).sort(), ['vo_cleanpro', 'vo_papirko']);
});

test('admin: link/unlink reuse the relation record; the buyer sees the change; pending invites close', async () => {
  // Café Lipa ↔ CleanPro is "invited" in the seed (pending invite inv_2).
  const rel = await s.admin.linkVendorBuyer('vo_cleanpro', 'bo_lipa');
  assert.equal(rel.status, 'active');
  assert.equal(db.relations.filter((r) => r.vendorOrgId === 'vo_cleanpro' && r.buyerOrgId === 'bo_lipa').length, 1);
  assert.equal(db.invites.find((i) => i.id === 'inv_2')?.status, 'accepted');
  assert.deepEqual((await s.buyerOrgs.listConnectedVendors('bo_lipa')).map((v) => v.id).sort(), ['vo_cleanpro', 'vo_papirko']);
  await rejects(s.admin.linkVendorBuyer('vo_cleanpro', 'bo_lipa'), 'CONFLICT');

  await s.admin.unlinkVendorBuyer(rel.id);
  assert.deepEqual((await s.buyerOrgs.listConnectedVendors('bo_lipa')).map((v) => v.id), ['vo_papirko']);
  assert.equal((await s.admin.getVendorOrgDetail('vo_cleanpro')).connections.some((c) => c.buyerOrg.id === 'bo_lipa'), false);
});
