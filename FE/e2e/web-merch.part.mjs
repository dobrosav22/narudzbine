// Phase 6 — dashboard, stats, featured products, promotions (web).
export async function merchFlows({ flow, text, url, login, shot }) {
  const nav = (page, href) => page.locator(`[data-sidebar=menu] a[href="${href}"]`).click();
  // Switch user WITHOUT reloading: `login()` navigates to /login, and a page load resets the in-memory mock DB.
  const switchUser = async (page, email) => {
    await page.locator('[aria-label="Account menu"]').click();
    await page.locator('[role=menuitem] ::-p-text(Log out)').click();
    await url(page, /^\/login/);
    await page.waitForSelector('#email');
    await page.$eval('#email', (e) => (e.value = ''));
    await page.type('#email', email);
    await page.type('#password', 'demo');
    await page.locator('button[type=submit]').click();
  };
  const pick = async (page, trigger, option) => {
    await page.locator(`[aria-label="${trigger}"]`).click();
    await page.locator(`[role=option] ::-p-text(${option})`).click();
    await page.waitForFunction(() => !document.querySelector('[role=listbox]'));
  };
  // React-controlled date input: set through the native setter so onChange fires.
  const setDate = (page, id, value) =>
    page.$eval(
      `#${id}`,
      (el, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
      value,
    );
  const openPromotions = async (page) => {
    await nav(page, '/vendor/catalogue');
    await url(page, /^\/vendor\/catalogue$/);
    await page.locator('nav[aria-label="Catalogue sections"] a ::-p-text(Promotions)').click();
    await url(page, /^\/vendor\/catalogue\/promotions$/);
    await page.waitForSelector('table[aria-label="Promotions"] tbody tr');
  };

  await flow('dashboard: headline stats, low stock, live promotions; recent order opens', async (page) => {
    await login(page, 'marko@papirko.rs');
    await url(page, /^\/vendor$/);
    await text(page, 'Revenue · last 30 days');
    await page.waitForSelector('[aria-label="Low stock products"]');
    await text(page, 'Out of stock'); // Kitchen roll at 0
    await page.waitForFunction(() => document.querySelector('[aria-label="Live promotions"]')?.innerText.includes('Napkins'));
    await text(page, '1 scheduled');
    await shot(page, 'dashboard');
    await page.locator('table[aria-label="Recent orders"] tbody a').click();
    await url(page, /^\/vendor\/orders\/ord_/);
  });

  await flow('dashboard: non-tracking vendor has no low-stock card', async (page) => {
    await login(page, 'ivan@cleanpro.rs');
    await url(page, /^\/vendor$/);
    await page.waitForSelector('table[aria-label="Recent orders"]');
    if (await page.$('[aria-label="Low stock products"]')) throw new Error('low stock shown without inventory tracking');
    if ((await page.$$eval('[data-slot=card-title]', (t) => t.map((x) => x.textContent))).includes('Low stock')) throw new Error('low stock card shown');
  });

  await flow('stats: by product, period, then by buyer', async (page) => {
    await login(page, 'marko@papirko.rs');
    await nav(page, '/vendor/stats');
    await url(page, /^\/vendor\/stats$/);
    await page.waitForSelector('table[aria-label="Sales by product"] tbody tr');
    await text(page, 'Nitrile gloves size M');
    const total90 = await page.$eval('table[aria-label="Sales by product"] tfoot', (f) => f.innerText);
    await pick(page, 'Period', 'All time');
    await text(page, 'All time · cancelled orders excluded');
    await page.waitForFunction(
      (before) => document.querySelector('table[aria-label="Sales by product"] tfoot')?.innerText !== before,
      {},
      total90,
    );
    await page.locator('[role=tab] ::-p-text(By buyer)').click();
    await page.waitForSelector('table[aria-label="Sales by buyer"] tbody tr');
    await text(page, 'Hotel Aurora Group');
    await shot(page, 'stats-buyers');
  });

  await flow('featured: reorder + save → buyer home shelf follows the new order', async (page) => {
    await login(page, 'marko@papirko.rs');
    await nav(page, '/vendor/catalogue');
    await url(page, /^\/vendor\/catalogue$/);
    await page.locator('nav[aria-label="Catalogue sections"] a ::-p-text(Featured)').click();
    await page.waitForSelector('ol[aria-label="Featured products"] li');
    const moveUp = '[aria-label^="Move Recycled toilet paper"][aria-label$=" up"]';
    await page.locator(moveUp).click();
    await page.locator(moveUp).click();
    await text(page, 'Unsaved changes');
    await page.locator('button ::-p-text(Save order)').click();
    await text(page, 'Featured products saved');
    await shot(page, 'featured');
    // Nikola buys only from Papirko.
    await switchUser(page, 'nikola@cafelipa.rs');
    await page.waitForFunction(() => document.querySelector('section[aria-label="Featured by Papirko Wholesale"]')?.innerText.includes('Z-fold'));
    const shelf = await page.$eval('section[aria-label="Featured by Papirko Wholesale"]', (s) => s.innerText);
    if (!(shelf.indexOf('Recycled toilet paper') < shelf.indexOf('Z-fold hand towels'))) throw new Error(`shelf order: ${shelf.slice(0, 200)}`);
  });

  await flow('promotions: states listed; validation; create → buyer sees it; pause; delete', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openPromotions(page);
    for (const s of ['Live', 'Scheduled', 'Paused', 'Ended']) await text(page, s);

    await page.locator('button ::-p-text(New promotion)').click();
    await page.waitForSelector('[role=dialog]');
    await page.locator('#promo-scope-category').click();
    await setDate(page, 'promo-end', '2020-01-01');
    await page.locator('[role=dialog] button[type=submit]').click();
    await text(page, 'Pick at least one category');
    await text(page, 'The end date must be on or after the start date');

    // Fix it up: 20% on one product, today → in 30 days.
    await page.locator('#promo-value').fill('20');
    await page.locator('#promo-scope-product').click();
    await page.locator('[aria-label="Search products"]').fill('Nitrile');
    await page.locator('[role=dialog] [role=checkbox]').click();
    const start = await page.$eval('#promo-start', (el) => el.value);
    const end = new Date(new Date(start).getTime() + 30 * 86400000).toISOString().slice(0, 10);
    await setDate(page, 'promo-end', end);
    await text(page, 'reaches 1 product');
    await page.locator('[role=dialog] button[type=submit]').click();
    await text(page, 'Promotion created');
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
    await page.waitForFunction(() => document.querySelector('table[aria-label="Promotions"]')?.innerText.includes('Nitrile gloves size M'));
    await shot(page, 'promotions');

    // The buyer sees it on the price (same tab — the mock DB lives in memory).
    await switchUser(page, 'nikola@cafelipa.rs');
    await page.locator('[aria-label="Search products"]').fill('Nitrile');
    await page.waitForFunction(() => /20\s?% off/.test(document.body.innerText));

    // Back as the vendor: pause, then delete.
    await switchUser(page, 'marko@papirko.rs');
    await openPromotions(page);
    const row = 'Nitrile gloves size M';
    // Labels read "Active: 20% off, Nitrile gloves size M, 10 × 100" / "Actions for …".
    await page.locator(`[role=switch][aria-label*="${row}"]`).click();
    await text(page, 'Promotion paused');
    await page.locator(`[aria-label^="Actions for"][aria-label*="${row}"]`).click();
    await page.locator('[role=menuitem] ::-p-text(Delete)').click();
    await page.locator('[role=alertdialog] button ::-p-text(Delete)').click();
    await text(page, 'Promotion deleted');
    await page.waitForFunction((row) => !document.querySelector('table[aria-label="Promotions"]')?.innerText.includes(row), {}, row);
  });

  await flow('buyer stats: spend, month chart, by product; location filter', async (page) => {
    await login(page, 'milica@aurora-hotels.rs');
    await url(page, /^\/buyer$/);
    await nav(page, '/buyer/stats');
    await url(page, /^\/buyer\/stats$/);
    await text(page, 'Total spend');
    await page.waitForSelector('table[aria-label="Spend by product"] tbody tr');
    await page.waitForSelector('[data-slot=chart]');
    await shot(page, 'buyer-stats');
    await pick(page, 'Period', 'All time');
    await pick(page, 'Filter by location', 'Aurora Riverside');
    await page.waitForSelector('table[aria-label="Spend by product"] tbody tr, [data-slot=empty]');
  });
}
