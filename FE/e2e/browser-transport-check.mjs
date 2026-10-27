// Checks the real browser transport against the local backend through e2e/api-proxy.mjs:
// pre-auth bootstrap cookie, browser login, HttpOnly session cookie, CSRF-protected write,
// logout. Uses a page served (by request interception) at the web dev origin.
// Usage: CHECK_EMAIL=<synthetic buyer/vendor email> node e2e/browser-transport-check.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.WEB_ORIGIN ?? 'https://localhost:3000';
const API = process.env.API_BASE ?? 'https://localhost:18443/api/v1';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  // Request interception serves the page without an IP, so Chrome treats it as public space; a
  // real dev server on localhost is loopback-to-loopback and needs no override.
  args: ['--ignore-certificate-errors', '--disable-features=LocalNetworkAccessChecks'],
});
try {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) =>
    request.url().startsWith(ORIGIN) ? request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>check</title>' }) : request.continue(),
  );
  page.on('console', (m) => console.log('console:', m.text()));
  page.on('requestfailed', (r) => console.log('failed:', r.url(), r.failure()?.errorText));
  await page.goto(`${ORIGIN}/`);
  const result = await page.evaluate(
    async (api, email) => {
      const out = {};
      const json = (r) => r.json().catch(() => null);
      const boot = await fetch(`${api}/auth/bootstrap`, { credentials: 'include' });
      out.bootstrap = boot.status;
      const { nonce } = await json(boot);
      const login = await fetch(`${api}/auth/login`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'long synthetic password', transport: 'BROWSER', deviceLabel: 'Transport check', preAuthNonce: nonce }),
      });
      const session = await json(login);
      out.login = login.status;
      out.bearerIsNull = session?.bearerToken === null;
      out.cookieHiddenFromJs = !document.cookie.includes('narudzbine_session');
      out.me = (await fetch(`${api}/me`, { credentials: 'include' })).status;
      const csrf = await json(await fetch(`${api}/auth/csrf`, { credentials: 'include' }));
      out.csrfMatches = csrf?.csrfToken === session?.csrfToken;
      out.notificationsCors = (await fetch(`${api}/me/notifications?size=5`, { credentials: 'include' })).status;
      out.writeWithoutCsrf = (await fetch(`${api}/auth/logout`, { method: 'POST', credentials: 'include' })).status;
      out.logout = (await fetch(`${api}/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': session.csrfToken } })).status;
      out.meAfterLogout = (await fetch(`${api}/me`, { credentials: 'include' })).status;
      return out;
    },
    API,
    process.env.CHECK_EMAIL,
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
