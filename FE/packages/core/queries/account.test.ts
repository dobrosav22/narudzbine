import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { base64Url, createPkceVerifier, parseClientLink, passwordProblem, pendingInvitationStore } from './account';
import type { KeyValueStorage } from '../session/store';

test('password bounds count Unicode code points and keep spaces', () => {
  assert.equal(passwordProblem('short'), 'tooShort');
  assert.equal(passwordProblem('a'.repeat(15)), null);
  assert.equal(passwordProblem('😀'.repeat(15)), null, 'astral characters are one code point each');
  assert.equal(passwordProblem(' '.repeat(15)), null);
  assert.equal(passwordProblem('a'.repeat(129)), 'tooLong');
});

test('client links: token routes, id routes and rejects', () => {
  assert.deepEqual(parseClientLink('#/password-reset?token=abc_-1'), { kind: 'passwordReset', token: 'abc_-1' });
  assert.deepEqual(parseClientLink('/invitation?token=t'), { kind: 'invitation', token: 't' });
  assert.deepEqual(parseClientLink('#/invitation-proof?token=p'), { kind: 'invitationProof', token: 'p' });
  assert.deepEqual(parseClientLink('#/email-proof?token=e'), { kind: 'emailProof', token: 'e' });
  assert.deepEqual(parseClientLink('#/recovery-acceptance?token=r'), { kind: 'recoveryAcceptance', token: 'r' });
  const id = '01A17298-754F-7626-A263-54D8EB3106E3';
  assert.deepEqual(parseClientLink(`#/orders/${id}`), { kind: 'order', orderId: id.toLowerCase() });
  assert.deepEqual(parseClientLink(`#/relationships/${id}`), { kind: 'relationship', relationshipId: id.toLowerCase() });
  assert.deepEqual(parseClientLink(`#/notifications/${id}`), { kind: 'notification', notificationId: id.toLowerCase() });
  assert.deepEqual(parseClientLink(`#/recovery/${id}`), { kind: 'recovery', caseId: id.toLowerCase() });
  assert.equal(parseClientLink('#/password-reset'), null);
  assert.equal(parseClientLink('#/orders/not-an-id'), null);
  assert.equal(parseClientLink('#/unknown?token=x'), null);
  assert.equal(parseClientLink(''), null);
  assert.equal(parseClientLink('#token=x'), null);
});

function memoryStorage(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
  };
}

test('pending invitation merges token and proof in either order and expires', async () => {
  let now = 1_000;
  const storage = memoryStorage();
  const store = pendingInvitationStore(storage, () => now);
  await store.merge({ proof: 'p1' });
  const merged = await store.merge({ token: 't1', purpose: 'MEMBER' });
  assert.deepEqual({ ...merged, savedAt: 0 }, { proof: 'p1', token: 't1', purpose: 'MEMBER', savedAt: 0 });
  const other = await store.merge({ token: 't2' });
  assert.equal(other.proof, undefined, 'a different invitation drops the old proof');
  now += 8 * 24 * 60 * 60 * 1000;
  assert.equal(await store.read(), null);
  storage.map.set('narudzbine.pendingInvitation', '{broken');
  assert.equal(await store.read(), null);
});

test('PKCE verifier and S256 challenge encoding', () => {
  const verifier = createPkceVerifier();
  assert.match(verifier, /^[A-Za-z0-9\-._~]{64}$/);
  const digest = createHash('sha256').update(verifier).digest();
  assert.equal(base64Url(new Uint8Array(digest)), digest.toString('base64url'));
  // RFC 7636 appendix B example.
  const rfc = createHash('sha256').update('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk').digest();
  assert.equal(base64Url(new Uint8Array(rfc)), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.equal(base64Url(new Uint8Array([0xff])), '_w');
  assert.equal(base64Url(new Uint8Array([0xff, 0xee])), '_-4');
});
