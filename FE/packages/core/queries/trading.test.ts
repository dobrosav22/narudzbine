import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgreedPrice, Invitation } from '../api/models';
import { listBuyerInvitations, loadRelationshipAgreedPrices, relationshipCounterpartyId, buyerInviteNeedsResend } from './trading';

const price = (n: number): AgreedPrice => ({
  id: `id-${n}`,
  revision: 'r',
  productId: `p-${n}`,
  buyerOrganizationId: 'b',
  unitPrice: '1.00',
  confirmationRequired: true,
});

test('the counterparty is the other organization of the pair', () => {
  const rel = { vendorId: 'v', buyerId: 'b' };
  assert.equal(relationshipCounterpartyId(rel, 'v'), 'b');
  assert.equal(relationshipCounterpartyId(rel, 'b'), 'v');
});

test('agreed prices are returned only from one consistent snapshot', async () => {
  const pages = (rev: string) => [
    { items: Array.from({ length: 100 }, (_, i) => price(i)), pricingRevision: rev, relationshipRevision: 'R' },
    { items: [price(100)], pricingRevision: rev, relationshipRevision: 'R' },
  ];
  let calls = 0;
  const changing = async (page: number) => {
    calls++;
    // First pass: page 1 sees a newer pricing revision than page 0; second pass is stable.
    return calls === 2 ? pages('P2')[page]! : pages(calls < 2 ? 'P1' : 'P2')[page]!;
  };
  const snapshot = await loadRelationshipAgreedPrices('rel', changing);
  assert.equal(snapshot.items.length, 101);
  assert.equal(snapshot.pricingRevision, 'P2');
  assert.equal(calls, 4);
});

test('a snapshot that never settles is an error, not a stale review', async () => {
  let n = 0;
  const neverStable = async () => ({ items: n++ % 2 ? [price(1)] : Array.from({ length: 100 }, (_, i) => price(i)), pricingRevision: `P${n}`, relationshipRevision: 'R' });
  await assert.rejects(loadRelationshipAgreedPrices('rel', neverStable));
});

test('buyer invitations exclude member invitations across pages', async () => {
  const inv = (purpose: Invitation['purpose'], i: number) => ({ id: `${purpose}-${i}`, purpose }) as Invitation;
  const fetchPage = async (page: number) => ({
    items: page === 0 ? Array.from({ length: 100 }, (_, i) => inv(i % 2 ? 'MEMBER' : 'SETUP_BUYER', i)) : [inv('TRADING', 0), inv('MEMBER', 1)],
  });
  const result = await listBuyerInvitations('PENDING', fetchPage);
  assert.equal(result.length, 51);
  assert.ok(result.every((i) => i.purpose !== 'MEMBER'));
});

test('failed or unknown delivery of a pending invitation needs a manual resend', () => {
  assert.equal(buyerInviteNeedsResend({ state: 'PENDING', deliveryState: 'FAILED' }), true);
  assert.equal(buyerInviteNeedsResend({ state: 'PENDING', deliveryState: 'UNKNOWN' }), true);
  assert.equal(buyerInviteNeedsResend({ state: 'PENDING', deliveryState: 'DELIVERED' }), false);
  assert.equal(buyerInviteNeedsResend({ state: 'REVOKED', deliveryState: 'FAILED' }), false);
});
