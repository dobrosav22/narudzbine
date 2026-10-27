// End-to-end workflows through the real web UI against the LOCAL synthetic backend. Each step is
// performed by clicking/typing in the browser; outcomes are confirmed independently through the
// API (native bearer) so a UI that only *looks* successful fails the run.
//
//   1. Vendor creates a product, prices it and activates it.
//   2. Buyer finds it, adds it to the cart, reviews and places the order.
//   3. Vendor accepts, dispatches and delivers the order; the buyer sees DELIVERED.
//   4. Buyer and vendor exchange messages on the order.
//   5. Buyer saves a draft from the cart and finds it in the shared drafts list.
//
// Usage: node e2e/flows.mjs <ready.json>   (env BASE=https://localhost:3000, SHOTS=<dir>)
import { readFileSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE ?? 'https://localhost:3000';
const API = process.env.API ?? 'http://127.0.0.1:18080/api/v1';
const SHOTS = process.env.SHOTS;
const PASSWORD = 'long synthetic password'; // fixed synthetic fixture of the local harness
const raw = readFileSync(process.argv[2], 'utf8');
const ready = JSON.parse(raw.slice(raw.indexOf('{')));
const rs = ready.fixtures.find((f) => f.country === 'RS');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

async function apiAs(email) {
  const login = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, transport: 'NATIVE', deviceLabel: 'Flow checker' }),
  })).json();
  const auth = { Authorization: `Bearer ${login.bearerToken}` };
  // Flows assert English labels; the RS organizations default to Serbian, so pin this account to English.
  const me = await (await fetch(`${API}/me`, { headers: auth })).json();
  await fetch(`${API}/me/language`, {
    method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: me.revision, languageOverride: 'en' }),
  });
  return (path) => fetch(API + path, { headers: auth }).then((r) => r.json());
}
const vendorApi = await apiAs(rs.vendorEmail);
const buyerApi = await apiAs(rs.buyerEmail);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--ignore-certificate-errors', '--window-size=1280,900'],
  defaultViewport: { width: 1280, height: 900 },
});

const results = [];
let failures = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(email) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => results.push(`   pageerror (${email.slice(0, 8)}): ${e.message.split('\n')[0]}`));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await page.type('#email', email);
  await page.type('#password', PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 45000 });
  return { page, close: () => context.close() };
}

async function step(name, fn, page) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (e) {
    failures++;
    results.push(`FAIL  ${name}: ${e.message.split('\n')[0]}`);
    if (SHOTS && page) await page.screenshot({ path: `${SHOTS}/fail-${name.replace(/\W+/g, '-')}.png` }).catch(() => {});
  }
}

/** Message items use content-visibility:auto, so off-screen ones are absent from innerText. */
const threadHas = (page, t, timeout = 20000) =>
  page.waitForFunction((t) => (document.querySelector('[data-slot=message-scroller]')?.textContent ?? '').includes(t), { timeout }, t);
const text = (page, t, timeout = 20000) =>
  page.waitForFunction((t) => document.body.innerText.replace(/\s+/g, ' ').includes(t), { timeout }, t);
const clickText = (page, t) => page.locator(`::-p-text(${t})`).click();
/** A button whose whole label is exactly `label` (avoids matching "Accepted" for "Accept"). */
const clickButton = (page, label, scope = '') =>
  page.locator(`::-p-xpath(${scope}//button[normalize-space(.)="${label}"])`).click();
const clickInDialog = (page, label) => clickButton(page, label, '//*[@role="dialog"]');
async function until(check, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error('condition not met through the API');
    await sleep(1500); // API polling shares the account's 120 reads/min with the browser
  }
}

const stamp = Date.now().toString(36).toUpperCase();
const productName = `Flow test ${stamp}`;
const sku = `FLOW-${stamp}`;
let productId;
let orderId;

// One browser login per role for the whole run: the backend allows 30 browser logins per
// 15 minutes per source address, so tests must not log in per step.
const vendor = await session(rs.vendorEmail);
const v = vendor.page;

// 1. Vendor: create, price and activate a product.
{
  const page = v;
  await step('vendor creates a priced product', async () => {
    await page.goto(`${BASE}/vendor/catalogue/new`, { waitUntil: 'networkidle2' });
    await page.type('#name', productName);
    await page.type('#sku', sku);
    await page.locator('#unit').click();
    await page.locator('[role=option] ::-p-text(kom)').click();
    await page.type('#basePrice', '42.50');
    await page.locator('button[type=submit]').click();
    await page.waitForFunction(() => /^\/vendor\/catalogue\/[0-9a-f-]{36}$/.test(location.pathname));
    productId = page.url().split('/').pop();
    const pricing = await until(async () => {
      const p = await vendorApi(`/catalogue/products/${productId}/pricing`);
      return p.basePrice === '42.50' && p;
    });
    if (!pricing) throw new Error('price not saved');
  }, page);
  await step('vendor activates it', async () => {
    await clickButton(page, 'Activate');
    await until(async () => (await vendorApi(`/catalogue/products/${productId}`)).state === 'ACTIVE');
  }, page);
}

// 2–5. Buyer orders it; vendor fulfils; both message; buyer saves a draft.
{
  const buyer = await session(rs.buyerEmail);
  const page = buyer.page;
  await step('buyer adds the new product to the cart', async () => {
    await page.goto(`${BASE}/buyer/products/${productId}`, { waitUntil: 'networkidle2' });
    await text(page, productName);
    await clickButton(page, 'Add to cart');
    await text(page, 'View cart');
  }, page);
  await step('buyer reviews and places the order', async () => {
    await page.goto(`${BASE}/buyer/checkout`, { waitUntil: 'networkidle2' });
    await clickButton(page, 'Review order');
    await text(page, 'Order review');
    await clickButton(page, 'Place order');
    await page.waitForFunction(() => /^\/buyer\/orders\/[0-9a-f-]{36}$/.test(location.pathname));
    orderId = page.url().split('/').pop();
    const order = await buyerApi(`/orders/${orderId}`);
    if (order.state !== 'AWAITING_ACCEPTANCE' || order.lines[0].productId !== productId || order.goodsTotal !== '42.50') {
      throw new Error(`unexpected order ${order.state} ${order.goodsTotal}`);
    }
  }, page);
  await step('buyer sends a message on the order', async () => {
    await page.locator('textarea').fill('Flow test: please deliver before noon.');
    await page.keyboard.press('Enter'); // the composer sends on Enter
    await until(async () => (await buyerApi(`/orders/${orderId}/messages?size=25`)).items?.some((m) => m.text.startsWith('Flow test: please')));
  }, page);

  await step('vendor sees the message and replies', async () => {
    await v.goto(`${BASE}/vendor/orders/${orderId}`, { waitUntil: 'networkidle2' });
    await threadHas(v, 'Flow test: please deliver before noon.');
    await v.locator('textarea').fill('Flow test: confirmed.');
    await v.keyboard.press('Enter');
    await until(async () => (await buyerApi(`/orders/${orderId}/messages?size=25`)).items?.some((m) => m.text === 'Flow test: confirmed.'));
  }, v);
  for (const [action, state] of [['Accept', 'ACCEPTED'], ['Mark as dispatched', 'DISPATCHED'], ['Mark as delivered', 'DELIVERED']]) {
    await step(`vendor: ${action.toLowerCase()} → ${state}`, async () => {
      await clickButton(v, action);
      await v.waitForSelector('[role=dialog]');
      await clickInDialog(v, action);
      await until(async () => (await vendorApi(`/orders/${orderId}`)).state === state);
    }, v);
  }
  await step('buyer sees the order delivered', async () => {
    await page.reload({ waitUntil: 'networkidle2' });
    // The history timeline only gains this entry once the vendor really delivered.
    await text(page, 'Order delivered');
  }, page);

  await step('buyer saves the cart as a shared draft', async () => {
    const before = (await buyerApi('/drafts?size=100')).items.length;
    await page.goto(`${BASE}/buyer/products/${productId}`, { waitUntil: 'networkidle2' });
    await clickButton(page, 'Add to cart');
    await text(page, 'View cart');
    await page.goto(`${BASE}/buyer/cart`, { waitUntil: 'networkidle2' });
    await clickButton(page, 'Save as draft');
    await until(async () => (await buyerApi('/drafts?size=100')).items.length === before + 1);
    await page.goto(`${BASE}/buyer/drafts`, { waitUntil: 'networkidle2' });
    await text(page, '1 product');
  }, page);
  await buyer.close();
}

await vendor.close();
await browser.close();
console.log(results.join('\n'));
console.log(`\n${results.filter((r) => /^(PASS|FAIL)/.test(r)).length} steps, ${failures} failed`);
process.exitCode = failures ? 1 : 0;
