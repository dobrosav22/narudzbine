// v1.1 — Platform Admin (web-only) and the tier upgrade flow end to end.
export async function platformAdminFlows({ flow, BASE, text, url, login, shot }) {
  const nav = (page, href) => page.locator(`[data-sidebar=menu] a[href="${href}"]`).click();
  const dialogGone = (page) => page.waitForFunction(() => !document.querySelector('[role=dialog], [role=alertdialog]'));
  // Same-tab user switch: login() reloads, which resets the in-memory mock DB.
  const switchUser = async (page, email) => {
    await page.locator('[aria-label="Account menu"]').click();
    await page.locator('[role=menuitem] ::-p-text(Log out)').click();
    await url(page, /^\/login/);
    // Logging out from a guarded shell navigates twice (the guard's /login?next=… and the menu's /login);
    // wait until the URL stops changing so typing isn't wiped by a late navigation.
    for (let last = ''; ; ) {
      const now = await page.evaluate(() => location.href);
      if (now === last) break;
      last = now;
      await new Promise((res) => setTimeout(res, 400));
    }
    await page.waitForSelector('#email');
    await page.$eval('#email', (e) => (e.value = ''));
    await page.type('#email', email);
    await page.type('#password', 'demo');
    await page.locator('button[type=submit]').click();
  };
  const pick = async (page, triggerId, option) => {
    await page.locator(`#${triggerId}`).click();
    await page.locator(`[role=option] ::-p-text(${option})`).click();
    await page.waitForFunction(() => !document.querySelector('[role=listbox]'));
  };

  await flow('admin gate: the admin lands on /admin and is kept out of vendor routes', async (page) => {
    await login(page, 'admin@narudzbine.rs');
    await url(page, /^\/admin$/);
    await text(page, 'Platform');
    await page.goto(`${BASE}/vendor/catalogue`);
    await url(page, /^\/admin$/);
  });

  await flow('admin gate: a vendor is kept out of /admin', async (page) => {
    await login(page, 'marko@papirko.rs');
    await url(page, /^\/vendor$/);
    await page.goto(`${BASE}/admin/vendors`);
    await url(page, /^\/vendor$/);
  });

  await flow('admin dashboard: platform totals, pending queue, vendors at a limit', async (page) => {
    await login(page, 'admin@narudzbine.rs');
    for (const t of ['Vendors 2', 'Buyers 3', 'Users 9', 'Plan requests waiting 1']) await text(page, t);
    await page.waitForSelector('table[aria-label="Plan requests waiting"] tbody tr');
    await page.waitForFunction(() => document.querySelector('table[aria-label="Plan requests waiting"]')?.innerText.includes('Starter → Growth'));
    await page.waitForFunction(() => document.querySelector('table[aria-label="Vendors at a limit"]')?.innerText.includes('CleanPro Chemicals'));
    await shot(page, 'admin-dashboard');
  });

  await flow('tier upgrade flow: admin applies Growth to CleanPro → Ivan can add products; history says Approved', async (page) => {
    await login(page, 'admin@narudzbine.rs');
    await nav(page, '/admin/vendors');
    await url(page, /^\/admin\/vendors$/);
    await page.locator('[aria-label="Search vendors"]').fill('clean');
    await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Vendors"] tbody tr').length === 1);
    await page.locator('table[aria-label="Vendors"] tbody a').click();
    await url(page, /^\/admin\/vendors\/vo_cleanpro$/);
    await text(page, 'At the limit — blocked');
    await page.locator('button ::-p-text(Apply a plan)').click();
    await page.waitForSelector('[role=dialog]');
    await page.locator('[role=dialog] button ::-p-text(Apply Growth)').click();
    await text(page, 'CleanPro Chemicals is now on Growth');
    await dialogGone(page);
    await page.waitForFunction(() => document.querySelector('table[aria-label="Plan requests"]')?.innerText.includes('Approved'));
    await shot(page, 'admin-vendor-detail');

    await switchUser(page, 'ivan@cleanpro.rs');
    await url(page, /^\/vendor$/);
    await nav(page, '/vendor/catalogue');
    await text(page, '10 of 250 products on Growth');
    await page.waitForSelector('a[href="/vendor/catalogue/new"]'); // Add product is a link again
    await nav(page, '/vendor/settings');
    await page.locator('nav[aria-label="Settings sections"] a[href="/vendor/settings/plan"]').click();
    await page.waitForFunction(() => document.querySelector('table[aria-label="Plan requests"]')?.innerText.includes('Approved'));
  });

  await flow('admin: decline a request; direct tier change warns when going below usage', async (page) => {
    // Marko files a request first (same tab keeps the mock DB).
    await login(page, 'marko@papirko.rs');
    await nav(page, '/vendor/settings');
    await page.locator('nav[aria-label="Settings sections"] a[href="/vendor/settings/plan"]').click();
    await page.locator('button ::-p-text(Request Pro)').click();
    await page.locator('[role=dialog] button[type=submit]').click();
    await text(page, 'Request for Pro sent');
    await dialogGone(page);

    await switchUser(page, 'admin@narudzbine.rs');
    await url(page, /^\/admin$/);
    await page.waitForFunction(() => document.querySelector('table[aria-label="Plan requests waiting"]')?.innerText.includes('Papirko'));
    await page.locator('table[aria-label="Plan requests waiting"] a ::-p-text(Papirko Wholesale)').click();
    await url(page, /^\/admin\/vendors\/vo_papirko$/);
    await page.locator('button ::-p-text(Decline)').click();
    await page.locator('[role=alertdialog] button ::-p-text(Decline)').click();
    await text(page, 'Request declined');
    await dialogGone(page);
    await pick(page, 'admin-set-tier', 'Starter');
    await text(page, 'This vendor would be over the Starter limits');
    await text(page, 'You have 17 products; Starter allows 10.');
  });

  await flow('admin link/unlink: from buyer detail and vendor detail; the buyer sees the new vendor', async (page) => {
    await login(page, 'admin@narudzbine.rs');
    await nav(page, '/admin/buyers');
    await page.locator('table[aria-label="Buyers"] a ::-p-text(Kindergarten Sunce)').click();
    await url(page, /^\/admin\/buyers\/bo_sunce$/);
    await pick(page, 'link-buyer', 'CleanPro Chemicals');
    await page.locator('button ::-p-text(Link)').click();
    await text(page, 'Linked CleanPro Chemicals and Kindergarten Sunce');
    await page.waitForFunction(() => document.querySelector('table[aria-label="Connected vendors"]')?.innerText.includes('CleanPro Chemicals'));
    await shot(page, 'admin-buyer-detail');
    // Same relation from the vendor's side, then unlink there.
    await page.locator('table[aria-label="Connected vendors"] a ::-p-text(CleanPro Chemicals)').click();
    await url(page, /^\/admin\/vendors\/vo_cleanpro$/);
    await page.waitForFunction(() => document.querySelector('table[aria-label="Connected buyers"]')?.innerText.includes('Kindergarten Sunce'));
    await page.locator('[aria-label="Unlink Kindergarten Sunce"]').click();
    await page.locator('[role=alertdialog] button ::-p-text(Unlink)').click();
    await text(page, 'Unlinked Kindergarten Sunce');
    await page.waitForFunction(() => !document.querySelector('table[aria-label="Connected buyers"]')?.innerText.includes('Kindergarten Sunce'));
    // Link again, then the buyer can switch to CleanPro.
    await pick(page, 'link-vendor', 'Kindergarten Sunce');
    await page.locator('button ::-p-text(Link)').click();
    await text(page, 'Linked Kindergarten Sunce and CleanPro Chemicals');
    await switchUser(page, 'dragana@vrticsunce.rs');
    await url(page, /^\/buyer$/);
    await page.waitForSelector('[aria-label="Switch vendor"]'); // a second vendor appeared
  });
}
