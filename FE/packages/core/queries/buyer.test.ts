import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureApi } from '../api/client';
import { ApiError } from '../api/problem';
import type { Offer, OrderReview, PriceResolution, ReorderPreview, ReviewedLine } from '../api/models.gen';
import type { KeyValueStorage } from '../session/store';
import { createCartStore, snapshotFromOffer } from '../cart/store';
import { offerStockStatus, isDiscounted, priceSource, resolveActiveVendor, splitFavorites, normalizeFilters } from './offers';
import { applyReorder, reorderPlan } from './buyerWorkspace';
import { canSubmitOrders, changedReviewLines, prepareReview, retryPendingSubmission, submitReviewed, termsChange } from './checkout';

const VENDOR = '01a17298-754f-7e54-acfa-50e29c8db76e';
const price = (final: string, extra: Partial<PriceResolution> = {}): PriceResolution => ({
  baseUnitPrice: '0.85',
  normalUnitPrice: '0.85',
  agreedUnitPrice: null,
  promotionId: null,
  finalUnitPrice: final,
  lineTotal: final,
  appliedPromotion: null,
  reachedTierThreshold: null,
  agreedPriceId: null,
  ...extra,
});

function offer(productId: string, extra: Partial<Offer> = {}): Offer {
  return {
    product: {
      id: productId,
      revision: 'r',
      sku: `SKU-${productId}`,
      name: `Product ${productId}`,
      description: null,
      unitId: null,
      packDescription: null,
      categoryId: null,
      tagIds: [],
      minimumQuantity: 6,
      quantityStep: 6,
      state: 'ACTIVE',
      featured: false,
      unitAndPackFrozen: false,
      galleryAssetIds: ['asset-1'],
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.000Z',
    },
    vendorId: VENDOR,
    unitName: 'kom',
    currency: 'RSD',
    priceBasis: 'NET_EXCLUDING_VAT',
    basePrice: '0.85',
    agreedPrice: null,
    tiers: [],
    stockTracked: false,
    availableQuantity: null,
    category: null,
    tags: [],
    promotions: [],
    pricedQuantity: 6,
    effectivePrice: price('0.85'),
    pricedAt: '2026-10-25T10:00:00.000Z',
    ...extra,
  };
}

const reviewed = (productId: string, quantity: number, final = '0.85'): ReviewedLine => ({
  productId,
  sku: `SKU-${productId}`,
  name: `Product ${productId}`,
  unitName: 'kom',
  packDescription: null,
  quantity,
  price: price(final),
});

test('active vendor: remembered while connected, else the first, else none', () => {
  const vendors = [
    { vendorId: 'a', relationshipId: 'ra', displayName: 'A', legalName: 'A', currency: 'RSD' as const, country: 'RS' as const },
    { vendorId: 'b', relationshipId: 'rb', displayName: 'B', legalName: 'B', currency: 'RSD' as const, country: 'RS' as const },
  ];
  assert.equal(resolveActiveVendor(vendors, 'b')?.vendorId, 'b');
  assert.equal(resolveActiveVendor(vendors, 'gone')?.vendorId, 'a');
  assert.equal(resolveActiveVendor(vendors, null)?.vendorId, 'a');
  assert.equal(resolveActiveVendor([], 'a'), null);
});

test('filters drop empty values so no empty query params are sent', () => {
  assert.deepEqual(normalizeFilters({ q: '  ', sort: 'NAME_ASC', categoryId: '', featured: false }), { sort: 'NAME_ASC' });
  assert.deepEqual(normalizeFilters({ q: ' voda ', tagId: 't' }), { q: 'voda', tagId: 't' });
});

test('price source follows backend precedence and stock is shown only when confirmed', () => {
  assert.equal(priceSource(price('0.70', { appliedPromotion: { id: 'p', name: 'Akcija', kind: 'PERCENTAGE', value: '10.00' } })), 'PROMOTION');
  assert.equal(priceSource(price('0.80', { agreedUnitPrice: '0.80' })), 'AGREED');
  assert.equal(priceSource(price('0.75', { reachedTierThreshold: 24 })), 'TIER');
  assert.equal(priceSource(price('0.85')), 'BASE');
  assert.equal(isDiscounted(price('0.75')), true);
  assert.equal(isDiscounted(price('0.85')), false);
  assert.deepEqual(offerStockStatus({ stockTracked: false, availableQuantity: null }), { kind: 'UNTRACKED' });
  assert.deepEqual(offerStockStatus({ stockTracked: true, availableQuantity: null }), { kind: 'UNCONFIRMED' });
  assert.deepEqual(offerStockStatus({ stockTracked: true, availableQuantity: 0 }), { kind: 'OUT' });
  assert.deepEqual(offerStockStatus({ stockTracked: true, availableQuantity: 8 }), { kind: 'AVAILABLE', quantity: 8 });
});

test('favorites split into the active vendor and unavailable references', () => {
  const favorites = [
    { productId: 'a', available: true, offer: offer('a'), createdAt: 't' },
    { productId: 'b', available: true, offer: offer('b', { vendorId: 'other' }), createdAt: 't' },
    { productId: 'c', available: false, offer: null, createdAt: 't' },
  ];
  const { current, unavailable } = splitFavorites(favorites, VENDOR);
  assert.deepEqual(current.map((f) => f.productId), ['a']);
  assert.deepEqual(unavailable.map((f) => f.productId), ['c']);
});

test('reorder keeps original quantities, skips unavailable lines and flags changes', () => {
  const preview: ReorderPreview = {
    originalOrderId: 'o1',
    lines: [
      { original: reviewed('a', 12), available: true, changes: [], currentOffer: offer('a') },
      { original: reviewed('b', 7), available: false, changes: ['UNAVAILABLE', 'STEP'], currentOffer: offer('b') },
      { original: reviewed('c', 3), available: false, changes: ['UNAVAILABLE'], currentOffer: null },
      { original: reviewed('d', 6, '0.80'), available: true, changes: ['PRICE'], currentOffer: offer('d') },
    ],
  };
  const plan = reorderPlan(preview);
  assert.equal(plan.vendorId, VENDOR);
  assert.deepEqual(plan.lines.map((l) => [l.productId, l.quantity]), [['a', 12], ['b', 7], ['d', 6]]);
  assert.deepEqual(plan.unavailable.map((l) => l.productId), ['c']);
  assert.deepEqual(plan.attention.map((a) => [a.line.productId, a.quantityInvalid]), [['b', true], ['d', false]]);

  const cart = createCartStore(memoryStorage());
  const scope = { buyerOrgId: 'buyer', vendorId: VENDOR };
  cart.add(scope, 'a', 6, snapshotFromOffer(offer('a')));
  cart.linkDraft(scope, { id: 'd', revision: 'r' });
  applyReorder(cart, scope, plan);
  assert.deepEqual(cart.getState(scope).lines.map((l) => [l.productId, l.quantity]), [['a', 18], ['b', 7], ['d', 6]]);
  assert.deepEqual(cart.getState(scope).draft, { id: 'd', revision: 'r' }, 'merge keeps the draft link');
  applyReorder(cart, scope, plan, 'replace');
  assert.equal(cart.getState(scope).lines.length, 3);
  assert.equal(cart.getState(scope).draft, null, 'replaced work must not overwrite the linked draft');
});

test('staff can submit unless the buyer restricts staff submission', () => {
  const org = (restricted: boolean) => ({ type: 'BUYER' as const, staffSubmissionRestricted: restricted });
  const as = (role: 'OWNER' | 'ADMIN' | 'STAFF', restricted: boolean) =>
    canSubmitOrders({ account: { role } as never, organization: org(restricted) as never });
  assert.equal(as('STAFF', false), true);
  assert.equal(as('STAFF', true), false);
  assert.equal(as('ADMIN', true), true);
  assert.equal(as('OWNER', true), true);
});

// ── Orchestration against a fake backend ───────────────────────────────────

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => void data.set(k, v), removeItem: async (k) => void data.delete(k) };
}

interface Call {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
}

function fakeBackend(respond: (call: Call) => Response | Promise<Response> | 'network') {
  const calls: Call[] = [];
  configureApi({
    baseUrl: 'http://backend.test/api/v1',
    transport: 'NATIVE',
    getBearer: () => 'test-bearer',
    fetch: async (input) => {
      const request = input as Request;
      const text = await request.text();
      const call = { method: request.method, path: new URL(request.url).pathname.replace('/api/v1', ''), headers: request.headers, body: text ? JSON.parse(text) : undefined };
      calls.push(call);
      const result = await respond(call);
      if (result === 'network') throw new TypeError('fetch failed');
      return result;
    },
  });
  return calls;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  json(status, { type: 'about:blank', title: code, status, code, requestId: '01a1729a-0000-7000-8000-000000000000', errors: [], ...extra });

const receipt = (id: string, final = '0.85'): OrderReview => ({
  id,
  expiresAt: '2026-10-25T10:15:00.000Z',
  intent: {
    vendorId: VENDOR,
    lines: [{ productId: 'a', quantity: 6 }],
    deliveryLocationId: 'loc',
    contactOverride: null,
    instructionsOverride: null,
    note: null,
    replacementForOrderId: null,
    instructionsMode: 'INHERIT',
  },
  lines: [reviewed('a', 6, final)],
  deliveryAddress: { line1: 'Street 1', line2: null, city: 'City', postalCode: '11000', country: 'RS', latitude: null, longitude: null },
  deliveryContact: { name: 'Receiver', phone: '+381 11 123', email: null },
  currency: 'RSD',
  priceBasis: 'NET_EXCLUDING_VAT',
  goodsTotal: final,
  deliveryInstructions: null,
});

function preparedCart() {
  const cart = createCartStore(memoryStorage());
  const scope = { buyerOrgId: 'buyer', vendorId: VENDOR };
  cart.add(scope, 'a', 6, snapshotFromOffer(offer('a')));
  cart.updateDetails(scope, { deliveryLocationId: 'loc' });
  return { cart, scope };
}

test('a linked cart saves its draft first, then requests a draft-bound receipt', async () => {
  const { cart, scope } = preparedCart();
  cart.linkDraft(scope, { id: 'draft-1', revision: 'rev-1' });
  const calls = fakeBackend((call) =>
    call.method === 'PUT'
      ? json(200, { id: 'draft-1', revision: 'rev-2', intent: (call.body as { intent: unknown }).intent, state: 'OPEN', submittedOrderId: null, createdAt: 't', updatedAt: 't' })
      : json(201, receipt('review-1')),
  );
  const result = await prepareReview(cart, scope);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['PUT /drafts/draft-1', 'POST /order-reviews']);
  assert.equal((calls[0]!.body as { expectedRevision: string }).expectedRevision, 'rev-1');
  assert.deepEqual((calls[1]!.body as { draftId: string; draftRevision: string }).draftId, 'draft-1');
  assert.deepEqual((calls[1]!.body as { draftRevision: string }).draftRevision, 'rev-2');
  assert.deepEqual(result.draft, { id: 'draft-1', revision: 'rev-2' });
  assert.deepEqual(cart.getState(scope).draft, { id: 'draft-1', revision: 'rev-2' });
});

test('a stale linked draft rejects review and leaves the cart untouched', async () => {
  const { cart, scope } = preparedCart();
  cart.linkDraft(scope, { id: 'draft-1', revision: 'old' });
  const before = cart.getState(scope);
  fakeBackend(() => problem(409, 'REVISION_CONFLICT', { currentRevision: 'new' }));
  await assert.rejects(prepareReview(cart, scope), (e) => e instanceof ApiError && e.code === 'REVISION_CONFLICT');
  assert.equal(cart.getState(scope), before);
});

test('lost response keeps the pending submission; the retry reuses the same key and then clears the cart', async () => {
  const { cart, scope } = preparedCart();
  let attempt = 0;
  const calls = fakeBackend(() => (++attempt === 1 ? 'network' : json(201, { id: 'order-1' })));
  await assert.rejects(submitReviewed(cart, scope, { review: receipt('review-1'), draft: null }), (e) => e instanceof ApiError && e.code === 'NETWORK_ERROR');
  const pending = cart.getState(scope).pendingSubmission;
  assert.equal(pending?.kind, 'ORDER');
  assert.equal(cart.getState(scope).lines.length, 1, 'cart kept while the outcome is unknown');

  const order = await retryPendingSubmission(cart, scope);
  assert.equal(order.id, 'order-1');
  const keys = calls.map((c) => c.headers.get('Idempotency-Key'));
  assert.equal(keys[0], keys[1], 'same Idempotency-Key on the retry');
  assert.match(keys[0]!, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(cart.getState(scope).lines.length, 0);
  assert.equal(cart.getState(scope).pendingSubmission, null);
  assert.equal(cart.getState(scope).deliveryLocationId, 'loc', 'location preference survives');
});

test('resubmitting the same receipt reuses its key; TERMS_CHANGED clears it and exposes the new receipt', async () => {
  const { cart, scope } = preparedCart();
  const calls = fakeBackend((call) =>
    (call.body as { reviewId: string }).reviewId === 'review-1'
      ? problem(409, 'TERMS_CHANGED', { currentTerms: receipt('review-2', '0.90'), unavailableLines: [] })
      : json(201, { id: 'order-2' }),
  );
  let change: ReturnType<typeof termsChange> = null;
  await submitReviewed(cart, scope, { review: receipt('review-1'), draft: null }).catch((e: unknown) => (change = termsChange(e)));
  assert.ok(change);
  const terms = change as NonNullable<ReturnType<typeof termsChange>>;
  assert.equal(terms.currentTerms?.id, 'review-2');
  assert.deepEqual([...changedReviewLines(receipt('review-1'), terms.currentTerms!)], ['a']);
  assert.equal(cart.getState(scope).pendingSubmission, null);
  await submitReviewed(cart, scope, { review: terms.currentTerms!, draft: null });
  assert.notEqual(calls[0]!.headers.get('Idempotency-Key'), calls[1]!.headers.get('Idempotency-Key'), 'a new receipt is a new intent');
});

test('draft-bound submission sends reviewId + expectedRevision without an Idempotency-Key', async () => {
  const { cart, scope } = preparedCart();
  const calls = fakeBackend(() => json(200, { id: 'order-3' }));
  await submitReviewed(cart, scope, { review: receipt('review-9'), draft: { id: 'draft-1', revision: 'rev-2' } });
  assert.equal(calls[0]!.path, '/drafts/draft-1/submission');
  assert.deepEqual(calls[0]!.body, { reviewId: 'review-9', expectedRevision: 'rev-2' });
  assert.equal(calls[0]!.headers.get('Idempotency-Key'), null);
});

test('a definite rejection (staff restriction) clears the pending intent but keeps the cart', async () => {
  const { cart, scope } = preparedCart();
  fakeBackend(() => problem(403, 'FORBIDDEN'));
  await assert.rejects(submitReviewed(cart, scope, { review: receipt('review-1'), draft: null }));
  assert.equal(cart.getState(scope).pendingSubmission, null);
  assert.equal(cart.getState(scope).lines.length, 1);
});
