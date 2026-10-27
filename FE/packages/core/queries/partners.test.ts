import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureApi } from '../api/client';
import { fetchPartner, fetchPartnerOrNull, resetPartnerCache } from './partners';

const PARTNER = '01a17000-0000-7000-8000-000000000001';

function fakeBackend(status: () => number) {
  const calls: string[] = [];
  configureApi({
    baseUrl: 'http://backend.test/api/v1',
    transport: 'NATIVE',
    getBearer: () => 'x'.repeat(43),
    fetch: (async (request: Request) => {
      calls.push(new URL(request.url).pathname);
      const code = status();
      const body =
        code === 200
          ? { organizationId: PARTNER, displayName: 'Partner d.o.o.' }
          : { type: 'about:blank', title: 'Not found', status: code, code: 'NOT_FOUND', requestId: '', errors: [] };
      return new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch,
  });
  return calls;
}

test('concurrent and repeated reads of one partner share a single request until the TTL passes', async () => {
  resetPartnerCache();
  const calls = fakeBackend(() => 200);
  const [a, b] = await Promise.all([fetchPartner(PARTNER, 0), fetchPartner(PARTNER, 1000)]);
  assert.equal(a.displayName, 'Partner d.o.o.');
  assert.equal(a, b);
  assert.equal(calls.length, 1);
  await fetchPartner(PARTNER, 6 * 60_000);
  assert.equal(calls.length, 2, 'expired entries are fetched again');
});

test('failures are not cached and 404 maps to null where tolerated', async () => {
  resetPartnerCache();
  let code = 404;
  const calls = fakeBackend(() => code);
  assert.equal(await fetchPartnerOrNull(PARTNER), null);
  code = 200;
  assert.equal((await fetchPartnerOrNull(PARTNER))?.displayName, 'Partner d.o.o.');
  assert.equal(calls.length, 2);
});

test('reset forgets cached partners (sign-out, disconnect)', async () => {
  resetPartnerCache();
  const calls = fakeBackend(() => 200);
  await fetchPartner(PARTNER);
  resetPartnerCache();
  await fetchPartner(PARTNER);
  assert.equal(calls.length, 2);
});
