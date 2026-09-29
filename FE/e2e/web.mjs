import puppeteer from 'puppeteer-core';
import { catalogueFlows } from './web-catalogue.part.mjs';
import { buyerFlows } from './web-buyer.part.mjs';
import { orderFlows } from './web-orders.part.mjs';
import { vendorFlows } from './web-vendor.part.mjs';
import { merchFlows } from './web-merch.part.mjs';
import { adminFlows } from './web-admin.part.mjs';
import { imageFlows } from './web-images.part.mjs';
import { platformAdminFlows } from './web-platform-admin.part.mjs';
import { i18nFlows } from './web-i18n.part.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3103';
const SHOTS = process.env.SHOTS;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--window-size=1280,860'],
  defaultViewport: { width: 1280, height: 860 },
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
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fail-${name.replace(/\W+/g, '-')}.png` }).catch(() => {});
  } finally {
    await ctx.close();
  }
}

// Whitespace-normalised: Intl separates amount and symbol with a no-break space ("19,60 KM").
const text = (page, t, timeout = 8000) =>
  page.waitForFunction((t) => document.body.innerText.replace(/\s/g, ' ').includes(t.replace(/\s/g, ' ')), { timeout }, t);
const url = (page, re, timeout = 8000) => page.waitForFunction((re) => new RegExp(re).test(location.pathname + location.search), { timeout }, re.source);
const click = (page, t) => page.locator(`::-p-text(${t})`).click();
const type = async (page, id, v) => {
  await page.waitForSelector(`#${id}`);
  await page.$eval(`#${id}`, (el) => (el.value = ''));
  await page.type(`#${id}`, v);
};
async function login(page, email, password = 'demo') {
  await page.goto(`${BASE}/login`);
  await type(page, 'email', email);
  await type(page, 'password', password);
  await page.locator('button[type=submit]').click();
}
async function logout(page) {
  await page.locator('[aria-label="Account menu"]').click();
  await click(page, 'Log out');
  await url(page, /^\/login/);
}
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

await flow('guarded route redirects to login with ?next=', async (page) => {
  await page.goto(`${BASE}/vendor/catalogue`);
  await url(page, /^\/login\?next=%2Fvendor%2Fcatalogue$/);
});

await flow('wrong password shows an error', async (page) => {
  await login(page, 'marko@papirko.rs', 'nope');
  await text(page, 'Incorrect email or password');
  await shot(page, 'login-error');
});

await flow('vendor login honours ?next=, survives reload, is kept out of buyer routes, logs out', async (page) => {
  await page.goto(`${BASE}/vendor/catalogue`);
  await url(page, /^\/login/);
  await type(page, 'email', 'marko@papirko.rs');
  await type(page, 'password', 'demo');
  await page.locator('button[type=submit]').click();
  await url(page, /^\/vendor\/catalogue$/); // ?next= wins over the role's home
  await text(page, '17 of 250 products on Growth');
  await shot(page, 'vendor-shell');
  await page.reload();
  await text(page, '17 of 250 products on Growth');
  await page.goto(`${BASE}/buyer`);
  await url(page, /^\/vendor$/); // wrong role → the vendor home, the Dashboard (Phase 6)
  await logout(page);
  await page.goto(`${BASE}/vendor/catalogue`);
  await url(page, /^\/login/);
});

await flow('buyer: vendor switcher changes context and persists', async (page) => {
  await login(page, 'milica@aurora-hotels.rs');
  await url(page, /^\/buyer$/);
  await page.waitForSelector('[aria-label="Switch vendor"]');
  const before = await page.$eval('h1', (h) => h.textContent);
  const other = before === 'CleanPro Chemicals' ? 'Papirko Wholesale' : 'CleanPro Chemicals';
  await page.locator('[aria-label="Switch vendor"]').click();
  await page.locator(`[role=menuitemradio] ::-p-text(${other})`).click();
  await page.waitForFunction((o) => document.querySelector('h1')?.textContent === o, {}, other);
  await text(page, `Now ordering from ${other}`);
  await shot(page, 'buyer-shell');
  await page.reload();
  await page.waitForFunction((o) => document.querySelector('h1')?.textContent === o, {}, other);
});

await flow('single-vendor buyer sees a static label, no picker', async (page) => {
  await login(page, 'nikola@cafelipa.rs');
  await url(page, /^\/buyer$/);
  await text(page, 'Ordering from');
  if (await page.$('[aria-label="Switch vendor"]')) throw new Error('picker shown for one vendor');
});

await flow('org switcher: vendor ↔ buyer membership for one login', async (page) => {
  await login(page, 'ivan@cleanpro.rs');
  await url(page, /^\/vendor$/);
  await text(page, 'CleanPro Chemicals');
  await page.locator('[aria-label="Account menu"]').click();
  await page.locator('[role=menuitemradio] ::-p-text(Café Lipa)').click();
  await url(page, /^\/buyer$/);
  await text(page, 'Ordering for Café Lipa');
  await page.reload();
  await text(page, 'Ordering for Café Lipa');
});

await flow('invite: new buyer org registers and lands on the inviting vendor', async (page) => {
  await page.goto(`${BASE}/invite/demo-buyer-invite`);
  await text(page, 'Papirko Wholesale invited you to order');
  await type(page, 'name', 'Petar Kovač');
  await type(page, 'password', 'pass1');
  await type(page, 'orgName', 'Hostel Most');
  await type(page, 'locationAddress', 'Savska 1, Beograd');
  await shot(page, 'invite-new-buyer');
  await page.locator('button[type=submit]').click();
  await url(page, /^\/buyer$/);
  await text(page, 'Ordering for Hostel Most');
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Papirko Wholesale');
});

await flow('invite: existing buyer connects a second vendor (password only)', async (page) => {
  await page.goto(`${BASE}/invite/demo-existing-buyer-invite`);
  await text(page, 'Log in to connect your company to CleanPro Chemicals');
  if (await page.$('#name')) throw new Error('asked for name from an existing account');
  await type(page, 'password', 'demo');
  await page.locator('button[type=submit]').click();
  await url(page, /^\/buyer$/);
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'CleanPro Chemicals');
  await page.waitForSelector('[aria-label="Switch vendor"]');
});

await flow('invite: team member joins Hotel Aurora', async (page) => {
  await page.goto(`${BASE}/invite/demo-team-invite`);
  await text(page, 'Join Hotel Aurora Group');
  await type(page, 'name', 'Luka Pavlović');
  await type(page, 'password', 'pass1');
  await page.locator('button[type=submit]').click();
  await url(page, /^\/buyer$/);
  await text(page, 'Ordering for Hotel Aurora Group');
});

await flow('invite: unknown token shows a friendly state', async (page) => {
  await page.goto(`${BASE}/invite/not-a-real-token`);
  await text(page, "This invite link isn't valid");
});

await flow('register a vendor → empty catalogue', async (page) => {
  await page.goto(`${BASE}/register`);
  await text(page, 'Starter');
  await type(page, 'orgName', 'Test Supplies');
  await type(page, 'name', 'Tamara Test');
  await type(page, 'email', 'tamara@test.rs');
  await type(page, 'password', 'pass1');
  await page.locator('label[for="tier-tier_growth"]').click();
  await shot(page, 'register');
  await page.locator('button[type=submit]').click();
  await url(page, /^\/vendor\/catalogue$/);
  await text(page, 'No products yet');
});

await flow('register with a taken email shows the conflict', async (page) => {
  await page.goto(`${BASE}/register`);
  await text(page, 'Starter');
  await type(page, 'orgName', 'X');
  await type(page, 'name', 'X');
  await type(page, 'email', 'marko@papirko.rs');
  await type(page, 'password', 'pass1');
  await page.locator('button[type=submit]').click();
  await text(page, 'already exists');
});

await catalogueFlows({ flow, BASE, text, url, type, login, shot });
await buyerFlows({ flow, BASE, text, url, login, shot });
await orderFlows({ flow, BASE, text, url, login, shot });
await vendorFlows({ flow, BASE, text, url, login, shot });
await merchFlows({ flow, BASE, text, url, login, shot });
await adminFlows({ flow, BASE, text, url, login, shot });
await imageFlows({ flow, BASE, text, url, login, shot });
await platformAdminFlows({ flow, BASE, text, url, login, shot });
await i18nFlows({ flow, BASE, text, url, login, shot });

await browser.close();
console.log(results.join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
