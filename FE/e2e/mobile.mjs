import puppeteer from 'puppeteer-core';
import { catalogueFlows } from './mobile-catalogue.part.mjs';
import { buyerFlows } from './mobile-buyer.part.mjs';
import { orderFlows } from './mobile-orders.part.mjs';
import { vendorFlows } from './mobile-vendor.part.mjs';
import { merchFlows } from './mobile-merch.part.mjs';
import { adminFlows } from './mobile-admin.part.mjs';
import { imageFlows } from './mobile-images.part.mjs';
import { i18nFlows } from './mobile-i18n.part.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3200';
const SHOTS = process.env.SHOTS;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  defaultViewport: { width: 412, height: 860, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
});

let failures = 0;
const results = [];
async function flow(name, fn) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => results.push(`   pageerror in "${name}": ${e.message}`));
  try {
    await fn(page);
    results.push(`PASS  ${name}`);
  } catch (e) {
    failures++;
    results.push(`FAIL  ${name}: ${e.message.split('\n')[0]}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/m-fail-${name.replace(/\W+/g, '-')}.png` }).catch(() => {});
  } finally {
    await ctx.close();
  }
}

// Whitespace-normalised: Intl separates amount and symbol with a no-break space ("19,60 KM").
const text = (page, t, timeout = 10000) =>
  page.waitForFunction((t) => document.body.innerText.replace(/\s/g, ' ').includes(t.replace(/\s/g, ' ')), { timeout }, t);
const noText = (page, t) => page.waitForFunction((t) => !document.body.innerText.includes(t), { timeout: 10000 }, t);
const path = (page, re) => page.waitForFunction((re) => new RegExp(re).test(location.pathname), { timeout: 10000 }, re.source);
const byLabel = (page, label) => page.locator(`[aria-label="${label}"]`);
async function fill(page, label, value) {
  await page.waitForSelector(`[aria-label="${label}"]`);
  await byLabel(page, label).fill(value);
}
// RN-web renders Pressables as divs; click the visible text.
const tap = (page, t) => page.locator(`::-p-text(${t})`).click();
async function login(page, email, password = 'demo') {
  await page.goto(`${BASE}/login`);
  await fill(page, 'Email', email);
  await fill(page, 'Password', password);
  await page.locator('[role=button] ::-p-text(Log in)').click();
}
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

await flow('signed out → login; wrong password shows error', async (page) => {
  await page.goto(`${BASE}/`);
  await path(page, /^\/login$/);
  await login(page, 'marko@papirko.rs', 'nope');
  await text(page, 'Incorrect email or password');
  await shot(page, 'm-login-error');
});

await flow('vendor login → Home (dashboard); survives reload; log out', async (page) => {
  await login(page, 'marko@papirko.rs');
  await path(page, /^\/vendor\/?$/); // Home = dashboard (Phase 6)
  await text(page, 'Revenue · 30 days');
  await text(page, 'Out of stock');
  await shot(page, 'm-vendor-catalogue');
  await page.reload();
  await text(page, 'Revenue · 30 days');
  await page.locator('[role=tab] ::-p-text(Account)').click();
  await text(page, 'Marko Petrović');
  await page.locator('[role=button] ::-p-text(Log out)').click();
  await path(page, /^\/login$/);
});

await flow('buyer: header vendor switcher changes catalogue; persists', async (page) => {
  await login(page, 'milica@aurora-hotels.rs');
  await path(page, /^\/buyer\/?$/);
  await text(page, 'Ordering from');
  await text(page, ' KM'); // localized money (bs-BA): "38,30 KM"
  await shot(page, 'm-buyer-home');
  await byLabel(page, 'Switch vendor').click();
  await path(page, /^\/switch-vendor$/);
  await shot(page, 'm-switch-vendor');
  // Pick whichever vendor isn't active (the active row is marked checked).
  // Only the vendor rows in the modal — Home's category chips are radios too, and stay mounted underneath.
  const target = await page.$$eval('[role=radio]', (rows) =>
    rows.find((r) => /Wholesale|Chemicals/.test(r.innerText) && r.getAttribute('aria-checked') !== 'true')?.innerText.trim(),
  );
  await page.locator(`[role=radio] ::-p-text(${target})`).click();
  await path(page, /^\/buyer\/?$/);
  await text(page, target);
  await page.reload();
  await text(page, target);
});

await flow('org switcher (Ivan): vendor → buyer via Account', async (page) => {
  await login(page, 'ivan@cleanpro.rs');
  await path(page, /^\/vendor\/?$/);
  await text(page, 'Revenue · 30 days');
  await page.locator('[role=tab] ::-p-text(Account)').click();
  await text(page, 'ORGANIZATIONS'); // section headers are CSS-uppercased
  await shot(page, 'm-account-orgs');
  await page.locator('[role=radio] ::-p-text(Café Lipa)').click();
  await path(page, /^\/buyer\/?$/);
  await text(page, 'Papirko Wholesale');
});

await flow('invite: new buyer company → buyer home on inviting vendor', async (page) => {
  await page.goto(`${BASE}/invite/demo-buyer-invite`);
  await text(page, 'Papirko Wholesale invited you to order');
  await fill(page, 'Your name', 'Petar Kovač');
  await fill(page, 'Password', 'pass1');
  await fill(page, 'Company name', 'Hostel Most');
  await fill(page, 'Delivery address', 'Savska 1, Beograd');
  await shot(page, 'm-invite');
  await page.locator('[role=button] ::-p-text(Accept invite)').click();
  await path(page, /^\/buyer\/?$/);
  await text(page, 'Papirko Wholesale');
});

await flow('invite: unknown token', async (page) => {
  await page.goto(`${BASE}/invite/nope`);
  await text(page, "This invite link isn't valid");
});

await flow('register vendor → empty catalogue', async (page) => {
  await page.goto(`${BASE}/register`);
  await text(page, 'Starter');
  await fill(page, 'Company name', 'Test Supplies');
  await fill(page, 'Your name', 'Tamara Test');
  await fill(page, 'Work email', 'tamara@test.rs');
  await fill(page, 'Password', 'pass1');
  await tap(page, 'Growth');
  await shot(page, 'm-register');
  await page.locator('[role=button] ::-p-text(Create account)').click();
  await path(page, /^\/vendor\/catalogue$/);
  await text(page, 'No products yet');
});

await catalogueFlows({ flow, text, path, fill, login, byLabel, shot });
await buyerFlows({ flow, text, path, fill, login, byLabel, shot });
await orderFlows({ flow, text, path, fill, login, byLabel, shot });
await vendorFlows({ flow, text, path, fill, login, byLabel, shot });
await merchFlows({ flow, text, path, fill, login, byLabel, shot });
await adminFlows({ flow, text, path, fill, login, byLabel, shot });
await imageFlows({ flow, text, path, fill, login, byLabel, shot });
await i18nFlows({ flow, BASE, text, path, fill, login, shot });

await browser.close();
console.log(results.join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
