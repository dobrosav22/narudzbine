import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../serviceProvider';
import { resetMockDb } from '../mocks/db';
import { setMockLatency } from '../mocks/util';
import { MOCK_PASSWORD } from '../mocks/seed';
import { createSessionStore, type KeyValueStorage } from './store';

setMockLatency(0);
const services = createServices(true);

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}
const make = (storage = memoryStorage()) => ({ storage, store: createSessionStore({ storage, ...services }) });
const login = (email: string) => services.auth.login({ email, password: MOCK_PASSWORD });

beforeEach(() => resetMockDb());

test('starts loading, restores to signedOut with nothing stored', async () => {
  const { store } = make();
  assert.equal(store.getState().status, 'loading');
  await store.init();
  assert.equal(store.getState().status, 'signedOut');
});

test('buyer sign-in picks a connected vendor; selection survives a restart', async () => {
  const { storage, store } = make();
  await store.signIn(await login('milica@aurora-hotels.rs'));
  let s = store.getState();
  assert.ok(s.status === 'signedIn' && s.membership.orgType === 'buyer');
  assert.deepEqual(s.connectedVendors.map((v) => v.id).sort(), ['vo_cleanpro', 'vo_papirko']);
  await store.selectVendor('vo_cleanpro');

  const restarted = make(storage).store;
  await restarted.init();
  s = restarted.getState();
  assert.ok(s.status === 'signedIn');
  assert.equal(s.activeVendor?.id, 'vo_cleanpro');
});

test('selectVendor ignores vendors the buyer is not connected to', async () => {
  const { store } = make();
  await store.signIn(await login('nikola@cafelipa.rs'));
  await store.selectVendor('vo_cleanpro'); // only invited, not active
  const s = store.getState();
  assert.ok(s.status === 'signedIn');
  assert.equal(s.activeVendor?.id, 'vo_papirko');
});

test('dual membership: switch vendor → buyer org, remembered across restart', async () => {
  const { storage, store } = make();
  const session = await login('ivan@cleanpro.rs');
  assert.equal(session.memberships.length, 2);
  await store.signIn(session);
  assert.equal(store.getState().status, 'signedIn');
  await store.selectMembership('bo_lipa');
  const restarted = make(storage).store;
  await restarted.init();
  const s = restarted.getState();
  assert.ok(s.status === 'signedIn' && s.membership.orgType === 'buyer' && s.membership.org.id === 'bo_lipa');
});

test('signOut clears storage; a bad stored token lands on signedOut, not a spinner', async () => {
  const { storage, store } = make();
  await store.signIn(await login('marko@papirko.rs'));
  await store.signOut();
  assert.equal(store.getState().status, 'signedOut');
  assert.equal(storage.data.size, 0);

  storage.data.set('narudzbine.session.token', 'garbage');
  const again = make(storage).store;
  await again.init();
  assert.equal(again.getState().status, 'signedOut');
});

test('refresh picks up a vendor connection added while signed in', async () => {
  const { store } = make();
  const session = await login('nikola@cafelipa.rs');
  await store.signIn(session);
  await services.auth.acceptInvite('demo-existing-buyer-invite', { password: MOCK_PASSWORD });
  await store.refresh();
  const s = store.getState();
  assert.ok(s.status === 'signedIn');
  assert.equal(s.connectedVendors.length, 2);
});

test('v1.1: the Platform Admin gets its own state (no org), survives a restart, signs out', async () => {
  const { storage, store } = make();
  const session = await login('admin@narudzbine.rs');
  assert.equal(session.memberships.length, 0);
  await store.signIn(session);
  const s = store.getState();
  assert.ok(s.status === 'admin' && s.admin.email === 'admin@narudzbine.rs');
  const restarted = make(storage).store;
  await restarted.init();
  assert.equal(restarted.getState().status, 'admin');
  await restarted.signOut();
  assert.equal(restarted.getState().status, 'signedOut');
});
