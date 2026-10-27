// Seeds richer synthetic data into a running LOCAL synthetic backend (BE/operations/README.md)
// through the public API only, so every screen has something to show: taxonomy, priced and
// tiered products, featured items, a promotion, an agreed price, favorites, a shared draft,
// order stages and orders in every lifecycle state with messages and a cancellation request.
//
// Usage: node e2e/seed.mjs <ready.json>   (the SYNTHETIC_DEVELOPMENT_READY JSON object)
// Env: API (default http://127.0.0.1:18080/api/v1). Never point this at a non-local backend.
import { readFileSync } from 'node:fs';
import { randomUUID, getRandomValues } from 'node:crypto';

const API = process.env.API ?? 'http://127.0.0.1:18080/api/v1';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(API)) throw new Error('seed.mjs only targets a loopback synthetic backend');
const PASSWORD = 'long synthetic password'; // fixed synthetic test fixture of the local harness
const ready = JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^[^{]*/, ''));

let last = 0, seq = 0;
function uuidv7() {
  const b = getRandomValues(new Uint8Array(16));
  let now = Date.now();
  if (now <= last) { seq = (seq + 1) & 0xfff; now = last; } else { last = now; seq = 0; }
  for (let i = 0; i < 6; i++) b[i] = Number((BigInt(now) >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = 0x70 | (seq >> 8); b[7] = seq & 0xff; b[8] = 0x80 | (b[8] & 0x3f);
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function call(token, method, path, body, headers = {}, attempt = 0) {
  const response = await fetch(API + path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  // 429 is a definite refusal before any effect, so waiting and resending the same request is safe.
  if (response.status === 429 && attempt < 8) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * Number(response.headers.get('Retry-After') ?? 2)));
    return call(token, method, path, body, headers, attempt + 1);
  }
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${json?.code ?? ''} ${JSON.stringify(json?.errors ?? [])}`);
  return json;
}
const login = async (email) => (await call(null, 'POST', '/auth/login', { email, password: PASSWORD, transport: 'NATIVE', deviceLabel: 'Seed script' })).bearerToken;

function localTime(date, country) {
  // Country-local wall time with its current UTC offset (Belgrade and Sarajevo share CET/CEST).
  const zone = country === 'RS' ? 'Europe/Belgrade' : 'Europe/Sarajevo';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).map((p) => [p.type, p.value]));
  const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const offsetMinutes = Math.round((Date.parse(`${local}Z`) - date.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return { localDateTime: local, offset: `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}` };
}

const CATALOGUE = [
  ['Mineralna voda 0,5 l', 'Napici', 'kom', '6 x 0,5 l', '0.85', [[24, '0.75'], [96, '0.69']], ['Novo']],
  ['Sok od jabuke 1 l', 'Napici', 'kom', null, '1.90', [[12, '1.75']], ['Bio']],
  ['Kafa u zrnu 1 kg', 'Napici', 'kg', null, '18.50', [], []],
  ['Čaj kamilica 20 kesica', 'Napici', 'pak', '20 x 1,5 g', '2.10', [], ['Bio']],
  ['Brašno T-400 25 kg', 'Prehrana', 'kom', 'vreća 25 kg', '21.00', [[10, '19.50']], []],
  ['Šećer kristal 1 kg', 'Prehrana', 'kg', null, '1.20', [[50, '1.10']], []],
  ['Ulje suncokretovo 5 l', 'Prehrana', 'kom', 'PET 5 l', '9.80', [], ['Akcija']],
  ['Pirinač dugo zrno 1 kg', 'Prehrana', 'kg', null, '2.40', [], []],
  ['Tečni sapun 5 l', 'Higijena', 'kom', 'kanister 5 l', '12.90', [[4, '11.90']], ['Novo']],
  ['Papirni ubrusi 2 sloja', 'Higijena', 'pak', '6 rolni', '5.60', [], []],
  ['Sredstvo za pod 1 l', 'Higijena', 'kom', null, '3.30', [], ['Akcija']],
  ['Rukavice nitrilne M', 'Higijena', 'pak', '100 kom', '8.40', [[10, '7.90']], []],
];

async function seedCountry(fixture, admin) {
  const { country } = fixture;
  console.log(`--- ${country}`);
  const vendor = await login(fixture.vendorEmail);
  const buyer = await login(fixture.buyerEmail);

  // Enough plan capacity for the demo catalogue (an upgrade; never a downgrade).
  const plans = await call(admin, 'GET', '/plans?size=100');
  const pro = plans.items.find((p) => p.code === 'PRO' && !p.retired);
  const current = await call(admin, 'GET', `/admin/vendors/${fixture.vendorId}/plan`);
  if (pro && current.plan.code !== 'PRO') {
    await call(admin, 'PUT', `/admin/vendors/${fixture.vendorId}/plan`, { expectedRevision: current.revision, planRevisionId: pro.id, reason: 'Synthetic demo data capacity' });
  }

  const relationship = (await call(vendor, 'GET', '/relationships?size=10&state=ACTIVE')).items.find((r) => r.buyerId === fixture.buyerId);
  const make = async (kind, name) => (await call(vendor, 'POST', `/catalogue/${kind}`, { id: uuidv7(), name })).id;
  const units = {}, categories = {}, tags = {};
  for (const name of ['kom', 'kg', 'pak']) units[name] = await make('units', name);
  for (const name of ['Napici', 'Prehrana', 'Higijena']) categories[name] = await make('categories', name);
  for (const name of ['Novo', 'Akcija', 'Bio']) tags[name] = await make('tags', name);

  const products = [];
  for (const [index, [name, category, unit, pack, base, tiers, tagNames]] of CATALOGUE.entries()) {
    const step = unit === 'kom' && pack?.startsWith('6 x') ? 6 : 1;
    const product = await call(vendor, 'POST', '/catalogue/products', {
      id: uuidv7(), sku: `${country}-${String(index + 1).padStart(3, '0')}`, name, description: `${name} — sintetički demo artikal.`,
      unitId: units[unit], packDescription: pack, categoryId: categories[category], tagIds: tagNames.map((t) => tags[t]),
      minimumQuantity: step, quantityStep: step,
    });
    const pricing = await call(vendor, 'GET', `/catalogue/products/${product.id}/pricing`);
    await call(vendor, 'PUT', `/catalogue/products/${product.id}/pricing`, {
      expectedRevision: pricing.revision, basePrice: base, tiers: tiers.map(([q, p]) => ({ minimumQuantity: q, unitPrice: p })), deactivateProduct: false,
    });
    let current = await call(vendor, 'GET', `/catalogue/products/${product.id}`);
    if (index !== CATALOGUE.length - 1) current = await call(vendor, 'POST', `/catalogue/products/${product.id}/activate`, { expectedRevision: current.revision });
    if (index < 3) current = await call(vendor, 'PUT', `/catalogue/products/${product.id}/featured`, { expectedRevision: current.revision, featured: true });
    products.push(current);
  }
  const active = products.filter((p) => p.state === 'ACTIVE');
  console.log(`products ${products.length} (${active.length} active)`);

  const now = new Date();
  await call(vendor, 'POST', '/promotions', {
    id: uuidv7(), name: 'Jesenja akcija higijene', kind: 'PERCENTAGE', value: '10', productMode: 'SELECTED', productIds: [], categoryIds: [categories.Higijena],
    buyerMode: 'ALL', buyerIds: [], startsAt: localTime(new Date(now.getTime() + 60_000), country), endsAt: localTime(new Date(now.getTime() + 30 * 86_400_000), country),
  });
  const agreed = active[4];
  const agreedPrices = await call(vendor, 'GET', `/relationships/${relationship.id}/agreed-prices?size=100`);
  const existing = agreedPrices.items.find((a) => a.productId === agreed.id);
  await call(vendor, 'PUT', `/relationships/${relationship.id}/agreed-prices/${agreed.id}`, { unitPrice: '18.90', expectedRevision: existing?.revision ?? null });

  const stages = [];
  for (const name of ['Pakovanje', 'Spremno za utovar']) stages.push(await call(vendor, 'POST', '/organization/order-stages', { id: uuidv7(), name }));

  // Buyer side: favorites, a shared draft and orders.
  for (const product of active.slice(0, 3)) await call(buyer, 'PUT', `/favorites/${product.id}`);
  const location = (await call(buyer, 'GET', '/organization/locations?size=10')).items.find((l) => l.state !== 'ARCHIVED') ?? (await call(buyer, 'GET', '/organization/locations?size=10')).items[0];
  const line = (product, multiple = 1) => ({ productId: product.id, quantity: product.minimumQuantity * multiple });
  const intent = (lines, note = null) => ({ vendorId: fixture.vendorId, lines, deliveryLocationId: location.id, contactOverride: null, instructionsOverride: null, note, replacementForOrderId: null, instructionsMode: 'INHERIT' });
  await call(buyer, 'POST', '/drafts', { id: uuidv7(), intent: { ...intent([line(active[1], 2), line(active[6], 1)], 'Nedeljna nabavka — proveriti količine'), deliveryLocationId: location.id } });

  const submit = async (lines, note) => {
    const review = await call(buyer, 'POST', '/order-reviews', { intent: intent(lines, note), draftId: null, draftRevision: null });
    return call(buyer, 'POST', '/orders', { reviewId: review.id }, { 'Idempotency-Key': randomUUID() });
  };
  const orders = [];
  orders.push(await submit([line(active[0], 4), line(active[2], 2)], 'Isporuka pre 10h, molim.'));
  orders.push(await submit([line(active[4], 3), line(active[5], 20)], null));
  orders.push(await submit([line(active[7], 10), line(active[8], 2)], null));
  orders.push(await submit([line(active[9], 5)], null));
  orders.push(await submit([line(active[10], 6)], 'Hitno'));
  orders.push(await submit([line(active[3], 12)], null));
  const fresh = async (order) => call(vendor, 'GET', `/orders/${order.id}`);
  const accept = async (order) => call(vendor, 'POST', `/orders/${order.id}/acceptance`, { expectedRevision: (await fresh(order)).revision, fulfillmentLocationId: null });

  await call(buyer, 'POST', `/orders/${orders[0].id}/messages`, { text: 'Dobar dan, da li možete isporučiti u utorak?' }, { 'Idempotency-Key': randomUUID() });
  await call(vendor, 'POST', `/orders/${orders[0].id}/messages`, { text: 'Može, isporuka u utorak do 10h.' }, { 'Idempotency-Key': randomUUID() });

  let o = await accept(orders[1]);
  o = await call(vendor, 'POST', `/orders/${o.id}/stage`, { expectedRevision: o.revision, stageId: stages[0].id });
  o = await accept(orders[2]);
  await call(vendor, 'POST', `/orders/${o.id}/dispatch`, { expectedRevision: o.revision });
  o = await accept(orders[3]);
  o = await call(vendor, 'POST', `/orders/${o.id}/dispatch`, { expectedRevision: o.revision });
  await call(vendor, 'POST', `/orders/${o.id}/delivery`, { expectedRevision: o.revision });
  await call(vendor, 'POST', `/orders/${orders[4].id}/rejection`, { expectedRevision: (await fresh(orders[4])).revision, reason: 'Artikal trenutno nije dostupan.' });
  o = await accept(orders[5]);
  await call(buyer, 'POST', `/orders/${o.id}/cancellation-requests`, { expectedRevision: (await call(buyer, 'GET', `/orders/${o.id}`)).revision, reason: 'Pogrešna količina, poručićemo ponovo.' });
  console.log(`orders ${orders.length + 1} (submitted, accepted+stage, dispatched, delivered, rejected, cancellation requested)`);
}

const admin = await login(ready.platformOperatorEmail);
const only = process.env.SEED_COUNTRY;
for (const fixture of ready.fixtures) if (!only || fixture.country === only) await seedCountry(fixture, admin);
console.log('seed complete');
