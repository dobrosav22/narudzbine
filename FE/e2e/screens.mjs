// Visits every web screen as each role against the LOCAL synthetic backend and reports page
// errors, console errors, failed API calls and rendered error states. Read-only: it only
// navigates, it never submits forms. Also reports content wider than the viewport.
//
// Usage: node e2e/screens.mjs <ready.json>   (env BASE=https://localhost:3000, SHOTS=<dir>,
//        VIEWPORT=390x844 for a phone with touch, FULL_PAGE=1 for full-length screenshots)
import { readFileSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE ?? 'https://localhost:3000';
const API = process.env.API ?? 'http://127.0.0.1:18080/api/v1';
const SHOTS = process.env.SHOTS;
const PASSWORD = 'long synthetic password'; // fixed synthetic fixture of the local harness
const raw = readFileSync(process.argv[2], 'utf8');
const ready = JSON.parse(raw.slice(raw.indexOf('{')));
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

async function apiAs(email) {
  const login = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, transport: 'NATIVE', deviceLabel: 'Screen crawler' }),
  })).json();
  return (path) => fetch(API + path, { headers: { Authorization: `Bearer ${login.bearerToken}` } }).then((r) => r.json());
}

const rs = ready.fixtures.find((f) => f.country === 'RS');
const vendorApi = await apiAs(rs.vendorEmail);
const buyerApi = await apiAs(rs.buyerEmail);
const product = (await vendorApi('/catalogue/products?size=1')).items[0].id;
const vendorOrder = (await vendorApi('/orders?size=1')).items[0].id;
const vendorRel = (await vendorApi('/relationships?size=1')).items[0].id;
const buyerOrder = (await buyerApi('/orders?size=1')).items[0].id;
const buyerRel = (await buyerApi('/relationships?size=1')).items[0].id;
const offer = (await buyerApi(`/vendors/${rs.vendorId}/offers?size=1`)).items[0].product.id;

const ROLES = [
  { name: 'vendor', email: rs.vendorEmail, routes: [
    '/vendor', '/vendor/catalogue', '/vendor/catalogue/new', `/vendor/catalogue/${product}`, '/vendor/catalogue/featured',
    '/vendor/catalogue/promotions', '/vendor/catalogue/taxonomy', '/vendor/catalogue/import', '/vendor/catalogue/inventory',
    '/vendor/orders', `/vendor/orders/${vendorOrder}`, '/vendor/buyers', `/vendor/buyers/${vendorRel}`, '/vendor/stats',
    '/vendor/team', '/vendor/locations', '/vendor/settings', '/vendor/settings/contacts', '/vendor/settings/audit',
    '/vendor/settings/privacy', '/vendor/settings/plan', '/vendor/settings/stages', '/vendor/account',
    '/vendor/account/security', '/vendor/account/notifications', '/vendor/notifications'] },
  { name: 'buyer', email: rs.buyerEmail, routes: [
    '/buyer', `/buyer/products/${offer}`, '/buyer/cart', '/buyer/checkout', '/buyer/drafts', '/buyer/favorites',
    '/buyer/orders', `/buyer/orders/${buyerOrder}`, '/buyer/vendors', `/buyer/vendors/${buyerRel}`, '/buyer/stats',
    '/buyer/settings', '/buyer/settings/team', '/buyer/settings/locations', '/buyer/settings/contacts',
    '/buyer/settings/audit', '/buyer/settings/privacy', '/buyer/account', '/buyer/account/security',
    '/buyer/account/notifications', '/buyer/notifications'] },
  { name: 'admin', email: ready.platformOperatorEmail, routes: [
    '/admin', '/admin/organizations', `/admin/organizations/${rs.vendorId}`, `/admin/organizations/${rs.buyerId}`,
    '/admin/plan-requests', '/admin/audit', '/admin/account'] },
  { name: 'public', email: null, routes: ['/login', '/forgot-password', '/reset-password', '/setup', '/accept-invitation', '/email-change', '/recovery'] },
];

// Below 768 px the app uses its mobile layout, so emulate a phone there (touch, mobile viewport).
const [width, height] = (process.env.VIEWPORT ?? '1280x900').split('x').map(Number);
const phone = width < 768;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--ignore-certificate-errors', `--window-size=${width},${height}`],
  defaultViewport: { width, height, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 },
});

// Lists the innermost visible elements that stick out past the right edge, when the page is
// wider than the viewport. Content inside its own scroll container doesn't widen the page.
const overflowCheck = () => {
  const root = document.documentElement;
  if (root.scrollWidth <= root.clientWidth) return null;
  const edge = root.clientWidth + 1;
  const sticksOut = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.right > edge && getComputedStyle(e).visibility !== 'hidden';
  };
  const offenders = [...document.body.querySelectorAll('*')]
    .filter((e) => sticksOut(e) && ![...e.children].some(sticksOut))
    .slice(0, 5)
    .map((e) => {
      const cls = typeof e.className === 'string' ? e.className.split(' ').slice(0, 3).join('.') : '';
      const text = (e.textContent ?? '').trim().slice(0, 40);
      return `${e.tagName.toLowerCase()}${cls ? '.' + cls : ''} right=${Math.round(e.getBoundingClientRect().right)}${text ? ` "${text}"` : ''}`;
    });
  return `page ${root.scrollWidth}px wide in a ${root.clientWidth}px viewport: ${offenders.join('; ')}`;
};
const report = [];
let problems = 0;

for (const role of ROLES) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  let current = null;
  const issues = new Map();
  const counts = new Map();
  const note = (msg) => current && issues.get(current).push(msg);
  page.on('pageerror', (e) => note(`pageerror: ${e.message.split('\n')[0]}`));
  // Resource-load console lines duplicate the API failures recorded below.
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && note(`console: ${m.text().slice(0, 200)}`));
  page.on('request', (r) => {
    if (current && r.url().includes('/api/v1/') && r.method() !== 'OPTIONS') counts.set(current, (counts.get(current) ?? 0) + 1);
  });
  page.on('response', (r) => {
    const url = r.url();
    const expectedProbe = !role.email && r.status() === 401 && url.endsWith('/api/v1/me');
    if (url.includes('/api/v1/') && r.status() >= 400 && r.request().method() !== 'OPTIONS' && !expectedProbe) note(`api ${r.status()} ${r.request().method()} ${url.replace(/^.*\/api\/v1/, '')}`);
  });
  if (role.email) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#email');
    await page.type('#email', role.email);
    await page.type('#password', PASSWORD);
    await page.locator('button[type=submit]').click();
    await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
  }
  // ONLY=<substring> limits the run to matching routes (e.g. ONLY=/stats).
  const routes = role.routes.filter((r) => !process.env.ONLY || r.includes(process.env.ONLY));
  if (!routes.length) { await context.close(); continue; }
  for (const route of routes) {
    current = route;
    issues.set(route, []);
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
      await new Promise((r) => setTimeout(r, 800));
      const landed = await page.evaluate(() => location.pathname);
      if (landed !== route.split('?')[0]) note(`redirected to ${landed}`);
      const alert = await page.evaluate(() =>
        [...document.querySelectorAll('[data-slot=alert][data-variant=destructive], [role=alert][data-variant=destructive]')].map((e) => e.textContent.trim()).filter(Boolean).join(' | '),
      );
      if (alert) note(`alert: ${alert.slice(0, 200)}`);
      const overflow = await page.evaluate(overflowCheck);
      if (overflow) note(`overflow: ${overflow}`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${role.name}${route.replace(/[^a-z0-9]+/gi, '_')}.png`, fullPage: Boolean(process.env.FULL_PAGE) });
    } catch (e) {
      note(`navigation: ${e.message.split('\n')[0]}`);
    }
    const found = issues.get(route);
    problems += found.length ? 1 : 0;
    // Pace like a person (the backend allows 120 reads per minute per account).
    await new Promise((r) => setTimeout(r, Number(process.env.PACE_MS ?? 3000)));
    report.push(`${found.length ? 'ISSUE' : 'ok   '} ${role.name.padEnd(6)} ${String(counts.get(route) ?? 0).padStart(3)} req ${route}${found.length ? '\n        ' + [...new Set(found)].join('\n        ') : ''}`);
  }
  await context.close();
}
await browser.close();
console.log(report.join('\n'));
console.log(`\n${report.length} screens, ${problems} with issues`);
process.exitCode = problems ? 1 : 0;
