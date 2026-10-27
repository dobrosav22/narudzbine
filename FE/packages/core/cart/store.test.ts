import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cartFromDraft,
  cartItemCount,
  createCartStore,
  draftIntentFromCart,
  EMPTY_CART,
  mergeCartLines,
  orderIntentFromCart,
  parseCartState,
  type CartLineSnapshot,
} from './store';
import type { KeyValueStorage } from '../session/store';
import type { Draft } from '../api/models.gen';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}
const rs = { buyerOrgId: 'buyer-1', vendorId: 'vendor-a' };
const rsOther = { buyerOrgId: 'buyer-1', vendorId: 'vendor-b' };
const tick = () => new Promise((r) => setTimeout(r, 0));
const snap: CartLineSnapshot = { name: 'Voda', sku: 'RS-001', unitName: 'kom', packDescription: '6 x 0,5 l', minimumQuantity: 6, quantityStep: 6, imageAssetId: null };

test('add accumulates; setQuantity 0 removes; carts are per (buyer, vendor)', () => {
  const cart = createCartStore(memoryStorage());
  cart.add(rs, 'p1', 6, snap);
  cart.add(rs, 'p1', 6);
  cart.add(rs, 'p2', 1);
  cart.add(rsOther, 'x', 4);
  assert.deepEqual(cart.getState(rs).lines, [{ productId: 'p1', quantity: 12, snapshot: snap }, { productId: 'p2', quantity: 1 }]);
  assert.equal(cartItemCount(cart.getState(rs).lines), 2);
  cart.setQuantity(rs, 'p1', 0);
  assert.deepEqual(cart.getState(rs).lines, [{ productId: 'p2', quantity: 1 }]);
  assert.deepEqual(cart.getState(rsOther).lines, [{ productId: 'x', quantity: 4 }]);
  cart.add(rs, 'p3', 0);
  cart.add(rs, 'p3', 1.5);
  assert.equal(cart.getState(rs).lines.length, 1, 'non-positive or fractional adds are ignored');
});

test('snapshots stay stable until that cart changes', () => {
  const cart = createCartStore(memoryStorage());
  const empty = cart.getState(rs);
  assert.equal(cart.getState(rs), empty);
  cart.add(rs, 'p1', 1);
  const after = cart.getState(rs);
  assert.notEqual(after, empty);
  cart.add(rsOther, 'x', 1);
  assert.equal(cart.getState(rs), after, 'another scope changing must not change this snapshot');
  cart.updateSnapshots(rs, {});
  assert.equal(cart.getState(rs), after, 'no-op snapshot refresh keeps the reference');
});

test('persists and hydrates; corrupt storage starts empty; clear keeps only the location', async () => {
  const storage = memoryStorage();
  const first = createCartStore(storage);
  first.add(rs, 'p1', 6, snap);
  first.updateDetails(rs, { deliveryLocationId: 'loc-1', note: 'Back door', instructionsMode: 'OVERRIDE', instructionsOverride: 'Ring' });
  first.linkDraft(rs, { id: 'draft-1', revision: 'r1' });
  await tick();
  const second = createCartStore(storage);
  await second.hydrate(rs);
  const restored = second.getState(rs);
  assert.deepEqual(restored.lines, [{ productId: 'p1', quantity: 6, snapshot: snap }]);
  assert.equal(restored.deliveryLocationId, 'loc-1');
  assert.equal(restored.instructionsOverride, 'Ring');
  assert.deepEqual(restored.draft, { id: 'draft-1', revision: 'r1' });

  second.clear(rs);
  assert.deepEqual(second.getState(rs), { ...EMPTY_CART, deliveryLocationId: 'loc-1' });

  storage.data.set('narudzbine.cart.v2.buyer-1.vendor-b', '{not json');
  const third = createCartStore(storage);
  await third.hydrate(rsOther);
  assert.equal(third.getState(rsOther), EMPTY_CART);
});

test('parse drops invalid lines, duplicates and stray override text', () => {
  const state = parseCartState(
    JSON.stringify({
      lines: [{ productId: 'a', quantity: 2 }, { productId: 'a', quantity: 3 }, { productId: 'b', quantity: -1 }, { quantity: 1 }],
      instructionsMode: 'INHERIT',
      instructionsOverride: 'leftover',
      pendingSubmission: { kind: 'ORDER', reviewId: 'r', idempotencyKey: 'k', startedAt: 't' },
    }),
  );
  assert.deepEqual(state.lines, [{ productId: 'a', quantity: 2 }]);
  assert.equal(state.instructionsOverride, null);
  assert.deepEqual(state.pendingSubmission, { kind: 'ORDER', reviewId: 'r', idempotencyKey: 'k', startedAt: 't' });
});

test('switching instructions mode away from OVERRIDE clears the override text', () => {
  const cart = createCartStore(memoryStorage());
  cart.updateDetails(rs, { instructionsMode: 'OVERRIDE', instructionsOverride: 'Gate 2' });
  cart.updateDetails(rs, { instructionsMode: 'CLEAR' });
  assert.equal(cart.getState(rs).instructionsOverride, null);
});

test('intents: drafts allow incomplete work, orders need lines + location (+ override text)', () => {
  const state = { ...EMPTY_CART, lines: [{ productId: 'p1', quantity: 6, snapshot: snap }], note: '  ', instructionsMode: 'OVERRIDE' as const, instructionsOverride: ' Gate 2 ' };
  assert.deepEqual(draftIntentFromCart(state, 'vendor-a'), {
    vendorId: 'vendor-a',
    lines: [{ productId: 'p1', quantity: 6 }],
    deliveryLocationId: null,
    contactOverride: null,
    instructionsMode: 'OVERRIDE',
    instructionsOverride: 'Gate 2',
    note: null,
    replacementForOrderId: null,
  });
  assert.equal(orderIntentFromCart(state, 'vendor-a'), null);
  assert.equal(orderIntentFromCart({ ...state, deliveryLocationId: 'loc', instructionsOverride: '  ' }, 'vendor-a'), null);
  assert.equal(orderIntentFromCart({ ...state, deliveryLocationId: 'loc' }, 'vendor-a')?.deliveryLocationId, 'loc');
});

test('a cart resumed from a draft is linked to it and keeps its preparation', () => {
  const draft: Draft = {
    id: 'd1',
    revision: 'rev',
    state: 'OPEN',
    submittedOrderId: null,
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:00:00.000Z',
    intent: {
      vendorId: 'vendor-a',
      lines: [{ productId: 'p1', quantity: 7 }],
      deliveryLocationId: null,
      contactOverride: { name: 'Pera', phone: '+381 60 1', email: null },
      instructionsOverride: null,
      note: 'Weekly',
      replacementForOrderId: null,
      instructionsMode: 'CLEAR',
    },
  };
  const state = cartFromDraft(draft, { p1: snap });
  assert.deepEqual(state.draft, { id: 'd1', revision: 'rev' });
  assert.deepEqual(state.lines, [{ productId: 'p1', quantity: 7, snapshot: snap }], 'invalid saved quantities are kept, not changed');
  assert.equal(state.instructionsMode, 'CLEAR');
  assert.equal(state.note, 'Weekly');
});

test('merge sums quantities per product', () => {
  assert.deepEqual(mergeCartLines([{ productId: 'a', quantity: 2 }], [{ productId: 'a', quantity: 3 }, { productId: 'b', quantity: 1 }]), [
    { productId: 'a', quantity: 5 },
    { productId: 'b', quantity: 1 },
  ]);
});

test('line checks and the estimate only count lines priced at their own quantity', async () => {
  const { checkCartLine, cartEstimate } = await import('./estimate');
  const offerAt = (quantity: number, total: string, extra: Record<string, unknown> = {}) =>
    ({ product: { minimumQuantity: 6, quantityStep: 6 }, stockTracked: false, availableQuantity: null, pricedQuantity: quantity, effectivePrice: { lineTotal: total }, ...extra }) as never;
  const ok = { productId: 'a', quantity: 12, snapshot: snap };
  const odd = { productId: 'b', quantity: 7, snapshot: snap };
  assert.deepEqual(checkCartLine(ok, offerAt(12, '9.00')), { rule: { minimumQuantity: 6, quantityStep: 6 }, issue: null, suggested: null, stockShort: false, unavailable: false });
  assert.equal(checkCartLine(odd, undefined).suggested, 12, 'snapshot rule is used before the offer loads');
  assert.equal(checkCartLine(ok, offerAt(12, '9.00', { stockTracked: true, availableQuantity: 8 })).stockShort, true);
  assert.deepEqual(cartEstimate([{ line: ok, offer: offerAt(12, '9.00') }, { line: odd, offer: offerAt(6, '5.10') }]), { total: '9.00', complete: false });
  assert.deepEqual(cartEstimate([{ line: ok, offer: offerAt(12, '9.00') }]), { total: '9.00', complete: true });
});
