import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../serviceProvider';
import { isServiceError } from '../errors';
import { db, resetMockDb } from './db';
import { setMockLatency } from './util';
import { DEMO_INVITE_TOKENS, MOCK_PASSWORD } from './seed';

setMockLatency(0);
const s = createServices(true);
beforeEach(() => resetMockDb());

test('seed covers every branch listed in 02 → "Mock data"', () => {
  assert.ok(db.vendorOrgs.some((v) => v.tracksInventory) && db.vendorOrgs.some((v) => !v.tracksInventory));
  const vendorsPerBuyer = (b: string) => db.relations.filter((r) => r.buyerOrgId === b && r.status === 'active').length;
  assert.ok(db.buyerOrgs.some((b) => vendorsPerBuyer(b.id) >= 2));
  assert.ok(db.buyerOrgs.some((b) =>
    db.locations.filter((l) => l.buyerOrgId === b.id).length >= 2 && db.buyerUsers.filter((u) => u.buyerOrgId === b.id).length >= 2));
  assert.ok(db.priceTiers.length > 0 && db.buyerPrices.length > 0);
  const liveNow = db.promotions.filter((p) => p.isActive && new Date(p.startDate) <= new Date() && new Date() <= new Date(p.endDate));
  assert.ok(liveNow.length >= 1);
  assert.ok(new Set(db.orders.map((o) => o.statusKey)).size >= 4, 'orders in several statuses');
  assert.ok(db.statusConfigs.some((c) => c.statuses.map((x) => x.key).join() !== 'placed,confirmed,fulfilled,cancelled'));
  assert.ok(db.draftCarts.length >= 1 && db.favorites.length >= 1 && db.orders.length >= 20);
  // Non-tracking vendor's products carry no stock field at all.
  assert.ok(db.products.filter((p) => p.vendorOrgId === 'vo_cleanpro').every((p) => p.stock === undefined));
});

test('login / restore / wrong password', async () => {
  const session = await s.auth.login({ email: 'Milica@Aurora-Hotels.rs ', password: MOCK_PASSWORD });
  assert.equal(session.memberships[0]?.orgType, 'buyer');
  assert.deepEqual(await s.auth.restoreSession(session.token), session);
  await assert.rejects(s.auth.login({ email: 'milica@aurora-hotels.rs', password: 'nope' }), (e) => isServiceError(e, 'UNAUTHORIZED'));
});

test('buyer prices resolve through the shared resolver (override, tier, promotion)', async () => {
  const [soap, towels, napkins] = await s.pricing.resolvePrices({
    vendorOrgId: 'vo_papirko', buyerOrgId: 'bo_aurora',
    items: [{ productId: 'p_soap_foam5', quantity: 1 }, { productId: 'p_tw_zfold', quantity: 50 }, { productId: 'p_nap_33', quantity: 1 }],
  });
  assert.equal(soap?.source, 'override');
  assert.equal(soap?.unitPrice, 19.9);
  assert.equal(towels?.unitPrice, 38.9);
  assert.equal(napkins?.appliedPromotion?.id, 'promo_napkins');
  assert.equal(napkins?.unitPrice, 22.14); // 24.60 KM − 10%
});

test('plan limit: CleanPro is at 10/10 products on Starter', async () => {
  await assert.rejects(
    s.catalogue.createProduct({ vendorOrgId: 'vo_cleanpro', name: 'X', sku: 'X-1', tagIds: [], basePrice: 1, unit: 'pc', isActive: true }),
    (e) => isServiceError(e, 'PLAN_LIMIT'),
  );
});

test('createOrder snapshots resolved prices, uses first custom status, removes draft', async () => {
  const order = await s.orders.createOrder({
    vendorOrgId: 'vo_cleanpro', buyerOrgId: 'bo_aurora', locationId: 'loc_aurora_ns', createdByUserId: 'bu_jovana',
    items: [{ productId: 'p_cp_floor5', quantity: 6 }], fromDraftCartId: 'dc_3',
  });
  assert.equal(order.statusKey, 'received');
  assert.equal(order.items[0]?.priceAtOrder, 25.8);
  assert.ok(!db.draftCarts.some((d) => d.id === 'dc_3'));
  await assert.rejects(
    s.orders.createOrder({ vendorOrgId: 'vo_papirko', buyerOrgId: 'bo_aurora', locationId: 'loc_aurora_central', createdByUserId: 'bu_milica', items: [{ productId: 'p_soap_sanit', quantity: 2 }] }),
    (e) => isServiceError(e, 'VALIDATION'),
    'below min order quantity',
  );
});

test('draft carts list the current user first', async () => {
  const drafts = await s.draftCarts.list({ buyerOrgId: 'bo_aurora', vendorOrgId: 'vo_papirko', currentUserId: 'bu_milica' });
  assert.equal(drafts[0]?.createdByUserId, 'bu_milica');
  assert.equal(drafts.length, 2);
});

test('most ordered is derived from history', async () => {
  const top = await s.stats.getMostOrdered('bo_aurora', 'vo_papirko');
  assert.ok(top.length > 3);
  assert.ok(top.slice(0, 3).some((t) => t.product.id === 'p_tp_3ply48'), 'habitual product near the top');
  assert.ok(top.every((t, i) => i === 0 || top[i - 1]!.orderCount >= t.orderCount), 'sorted by frequency');
});

test('invite acceptance: new buyer org, existing buyer, team member', async () => {
  const fresh = await s.auth.acceptInvite(DEMO_INVITE_TOKENS.newBuyer, {
    name: 'Petar', password: 'pass1', orgName: 'Hostel Most', locationName: 'Hostel Most', locationAddress: 'Savska 1',
  });
  const m = fresh.memberships[0]!;
  assert.equal(m.orgType, 'buyer');
  assert.deepEqual((await s.buyerOrgs.listConnectedVendors(m.org.id)).map((v) => v.id), ['vo_papirko']);
  assert.equal((await s.locations.listBuyerLocations(m.org.id)).length, 1);

  const existing = await s.auth.acceptInvite(DEMO_INVITE_TOKENS.existingBuyer, { password: MOCK_PASSWORD });
  assert.equal((await s.buyerOrgs.listConnectedVendors(existing.memberships[0]!.org.id)).length, 2);

  const team = await s.auth.acceptInvite(DEMO_INVITE_TOKENS.team, { name: 'Luka', password: 'pass1' });
  assert.equal(team.memberships[0]?.org.id, 'bo_aurora');
  await assert.rejects(s.auth.acceptInvite(DEMO_INVITE_TOKENS.team, { password: 'pass1' }), (e) => isServiceError(e, 'CONFLICT'));
});

test('status config refuses to drop a status still used by orders', async () => {
  await assert.rejects(
    s.orderStatusConfig.update('vo_papirko', [
      { key: 'placed', label: 'Placed', isTerminal: false, isCancelled: false },
      { key: 'done', label: 'Done', isTerminal: true, isCancelled: false },
      { key: 'cancelled', label: 'Cancelled', isTerminal: true, isCancelled: true },
    ]),
    (e) => isServiceError(e, 'VALIDATION'),
  );
});

test('mocks hand out copies, not live db rows', async () => {
  const p = await s.catalogue.getProduct('p_tw_zfold');
  p.basePrice = 0;
  assert.equal(db.products.find((x) => x.id === 'p_tw_zfold')?.basePrice, 44.6);
});

test('a new account keeps the language it signed up in; starter statuses are named in it', async () => {
  const session = await s.auth.registerVendor({
    orgName: 'Srpski test',
    name: 'Jelena',
    email: 'jelena@srpski.test',
    password: 'demodemo',
    subscriptionTierId: db.vendorOrgs[0]!.subscriptionTierId,
    preferredLocale: 'sr-Latn',
  });
  const orgId = session.memberships[0]!.org.id;
  assert.equal(db.vendorUsers.find((u) => u.email === 'jelena@srpski.test')?.preferredLocale, 'sr-Latn');
  const labels = db.statusConfigs.find((c) => c.vendorOrgId === orgId)!.statuses.map((x) => `${x.key}:${x.label}`);
  assert.deepEqual(labels, ['placed:Primljena', 'confirmed:Potvrđena', 'fulfilled:Isporučena', 'cancelled:Otkazana']);
});
