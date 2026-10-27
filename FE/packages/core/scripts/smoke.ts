// Ad-hoc smoke check of the core client against a running local backend (synthetic data only).
// Usage: API_BASE_URL=http://127.0.0.1:<port>/api/v1 SMOKE_EMAIL=<synthetic email> tsx scripts/smoke.ts
import { api, bearerReader, configureApi, createSessionStore, data, isApiError, type KeyValueStorage } from '../index';

const memory = new Map<string, string>();
const storage: KeyValueStorage = {
  getItem: async (k) => memory.get(k) ?? null,
  setItem: async (k, v) => void memory.set(k, v),
  removeItem: async (k) => void memory.delete(k),
};
async function main() {
configureApi({ baseUrl: process.env.API_BASE_URL!, transport: 'NATIVE', getBearer: bearerReader(storage) });
const session = createSessionStore({ storage, deviceLabel: () => 'Smoke script' });

try {
  await session.login({ email: 'nobody@example.com', password: 'long synthetic password' });
} catch (error) {
  console.log('bad login ->', isApiError(error) ? `${error.status} ${error.code}` : error);
}
const state = await session.login({ email: process.env.SMOKE_EMAIL!, password: process.env.SMOKE_PASSWORD ?? 'long synthetic password' });
console.log('state', state.status, state.status === 'business' ? [state.organization.type, state.organization.country, state.account.role] : '');
const relationships = await data(api.GET('/relationships', { params: { query: { size: 10 } } }));
console.log('relationships', relationships.items.length, JSON.stringify(relationships.items[0]).slice(0, 400));
const orders = await data(api.GET('/orders', { params: { query: { size: 5 } } }));
console.log('orders', orders.items.length, orders.items[0]?.number, orders.items[0]?.state);
await session.logout();
console.log('after logout', session.getState().status);
}
void main();
