// Visits the main mobile screens in the Expo web export (react-native-web) with the NATIVE
// bearer transport, against the LOCAL synthetic backend through `api-proxy.mjs --native`.
// Covers routing, guards, session and data loading; not native-only behaviour (SecureStore,
// Hermes Intl, push). Read-only.
//
// Usage: node e2e/mobile-screens.mjs <ready.json>   (env BASE=http://localhost:3200)
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE ?? 'http://localhost:3200';
const API = process.env.API ?? 'http://127.0.0.1:18080/api/v1';
const PASSWORD = 'long synthetic password'; // fixed synthetic fixture of the local harness
const raw = readFileSync(process.argv[2], 'utf8');
const ready = JSON.parse(raw.slice(raw.indexOf('{')));
// COUNTRY=BA uses the Bosnian fixtures (fresh login budget, BAM/Sarajevo formatting).
const rs = ready.fixtures.find((f) => f.country === (process.env.COUNTRY ?? 'RS'));

async function first(email, path) {
  const login = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, transport: 'NATIVE', deviceLabel: 'Mobile screen check' }),
  })).json();
  return (await (await fetch(API + path, { headers: { Authorization: `Bearer ${login.bearerToken}` } })).json()).items[0];
}
const order = (await first(rs.vendorEmail, '/orders?size=1')).id;
const product = (await first(rs.vendorEmail, '/catalogue/products?size=1&state=ACTIVE')).id;
const relationship = (await first(rs.buyerEmail, '/relationships?size=1')).id;

const ROLES = [
  { name: 'vendor', email: rs.vendorEmail, routes: ['/vendor', '/vendor/catalogue', `/vendor/product/${product}`, '/vendor/inventory', '/vendor/merchandising', '/vendor/orders', `/vendor/order/${order}`, '/vendor/stages', '/vendor/buyers', '/vendor/stats', '/vendor/plan', '/vendor/account', '/vendor/profile', '/vendor/security', '/vendor/team', '/vendor/locations', '/vendor/company', '/vendor/inbox'] },
  { name: 'buyer', email: rs.buyerEmail, routes: ['/buyer', `/buyer/product/${product}`, '/buyer/favorites', '/buyer/cart', '/buyer/checkout', '/buyer/drafts', '/buyer/orders', `/buyer/order/${order}`, '/buyer/vendors', `/buyer/vendor/${relationship}`, '/buyer/stats', '/buyer/account', '/buyer/team', '/buyer/locations', '/buyer/inbox'] },
];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--ignore-certificate-errors', '--window-size=420,900'],
  defaultViewport: { width: 420, height: 900 },
});
const report = [];
let problems = 0;
for (const role of ROLES) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  let current = 'login';
  const issues = new Map([['login', []]]);
  const note = (m) => issues.get(current)?.push(m);
  page.on('pageerror', (e) => note(`pageerror: ${e.message.split('\n')[0]}`));
  page.on('response', (r) => {
    if (r.url().includes('/api/v1/') && r.status() >= 400 && r.request().method() !== 'OPTIONS') note(`api ${r.status()} ${r.request().method()} ${r.url().replace(/^.*\/api\/v1/, '')}`);
  });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[aria-label="Email"]');
  await page.type('[aria-label="Email"]', role.email);
  await page.type('[aria-label="Password"]', PASSWORD);
  await page.locator('::-p-xpath(//*[@role="button"][normalize-space(.)="Log in"])').click();
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });
  for (const route of role.routes) {
    current = route;
    issues.set(route, []);
    try {
      // The web export keeps the bearer in sessionStorage, so a reload stays signed in.
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
      await new Promise((r) => setTimeout(r, 2500));
      const landed = await page.evaluate(() => location.pathname);
      if (landed !== route) note(`redirected to ${landed}`);
    } catch (e) {
      note(`navigation: ${e.message.split('\n')[0]}`);
    }
    // Pace like a person (the backend allows 120 reads per minute per account).
    await new Promise((r) => setTimeout(r, Number(process.env.PACE_MS ?? 3000)));
    const found = issues.get(route);
    if (found.length) problems++;
    report.push(`${found.length ? 'ISSUE' : 'ok   '} ${role.name.padEnd(6)} ${route}${found.length ? '\n        ' + [...new Set(found)].join('\n        ') : ''}`);
  }
  if (issues.get('login').length) report.push(`ISSUE ${role.name} login\n        ${issues.get('login').join('\n        ')}`);
  await context.close();
}
await browser.close();
console.log(report.join('\n'));
console.log(`\n${report.length} mobile screens, ${problems} with issues`);
process.exitCode = problems ? 1 : 0;
