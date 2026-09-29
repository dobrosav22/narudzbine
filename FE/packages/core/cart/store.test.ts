import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartItemCount, createCartStore } from './store';
import type { KeyValueStorage } from '../session/store';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}
const aurora = { buyerOrgId: 'bo_aurora', vendorOrgId: 'vo_papirko' };
const auroraCleanpro = { buyerOrgId: 'bo_aurora', vendorOrgId: 'vo_cleanpro' };
const tick = () => new Promise((r) => setTimeout(r, 0));

test('add accumulates; setQuantity 0 removes; carts are per vendor', () => {
  const cart = createCartStore(memoryStorage());
  cart.add(aurora, 'p1', 2);
  cart.add(aurora, 'p1', 3);
  cart.add(aurora, 'p2', 1);
  cart.add(auroraCleanpro, 'x', 4);
  assert.deepEqual(cart.getLines(aurora), [{ productId: 'p1', quantity: 5 }, { productId: 'p2', quantity: 1 }]);
  assert.equal(cartItemCount(cart.getLines(aurora)), 6);
  cart.setQuantity(aurora, 'p1', 0);
  assert.deepEqual(cart.getLines(aurora), [{ productId: 'p2', quantity: 1 }]);
  assert.deepEqual(cart.getLines(auroraCleanpro), [{ productId: 'x', quantity: 4 }]);
});

test('snapshots are stable until that cart changes', () => {
  const cart = createCartStore(memoryStorage());
  const empty = cart.getLines(aurora);
  assert.equal(cart.getLines(aurora), empty);
  cart.add(aurora, 'p1', 1);
  const after = cart.getLines(aurora);
  assert.notEqual(after, empty);
  cart.add(auroraCleanpro, 'x', 1);
  assert.equal(cart.getLines(aurora), after, 'another scope changing must not change this snapshot');
});

test('persists and hydrates; corrupt storage starts empty', async () => {
  const storage = memoryStorage();
  const first = createCartStore(storage);
  first.add(aurora, 'p1', 7);
  await tick();
  const second = createCartStore(storage);
  await second.hydrate(aurora);
  assert.deepEqual(second.getLines(aurora), [{ productId: 'p1', quantity: 7 }]);

  storage.data.set('narudzbine.cart.bo_aurora.vo_cleanpro', '{not json');
  await second.hydrate(auroraCleanpro);
  assert.deepEqual(second.getLines(auroraCleanpro), []);
});

test('clearing removes the persisted cart', async () => {
  const storage = memoryStorage();
  const cart = createCartStore(storage);
  cart.add(aurora, 'p1', 1);
  cart.clear(aurora);
  await tick();
  assert.equal(storage.data.size, 0);
});
