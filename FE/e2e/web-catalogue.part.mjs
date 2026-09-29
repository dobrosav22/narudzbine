// Phase 2 — vendor catalogue flows. Imported by web.mjs; uses its helpers via the `h` argument.
export async function catalogueFlows({ flow, BASE, text, url, type, login, shot }) {
  const rowCount = (page) => page.$$eval('tbody tr', (rows) => rows.length);
  const rowsReady = (page) => page.waitForSelector('tbody tr');
  const priceOf = (page, name) =>
    page.$$eval(
      'tbody tr',
      (rows, name) => rows.find((r) => r.innerText.includes(name))?.querySelectorAll('td')[4]?.innerText.split('/')[0].trim(),
      name,
    );
  const nbsp = (s) => s?.replace(/\s/g, ' ');
  // Vendors land on the Dashboard (Phase 6); open the catalogue from the sidebar, keeping in-tab mock state.
  const openCatalogue = async (page) => {
    await page.locator('[data-sidebar=menu] a[href="/vendor/catalogue"]').click();
    await url(page, /^\/vendor\/catalogue$/);
    // The dashboard's recent-orders table has tbody rows too; wait for the catalogue itself.
    await page.waitForSelector('[aria-label="Search products"]');
  };

  await flow('catalogue: tag + status filters, localized prices', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openCatalogue(page);
    await rowsReady(page);
    if (nbsp(await priceOf(page, 'Centrefeed paper roll')) !== '38,30 KM') throw new Error(`price shown as ${await priceOf(page, 'Centrefeed paper roll')}`);
    await text(page, '17 of 250 products on Growth');
    await page.locator('[aria-label="Filter by tag"]').click();
    await page.locator('[role=menuitemcheckbox] ::-p-text(Eco)').click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3);
    await page.locator('[aria-label="Filter by tag"]').click();
    await page.locator('[role=menuitem] ::-p-text(Clear tags)').click();
    await page.locator('[aria-label="Filter by status"] ::-p-text(Inactive)').click();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    await text(page, 'Vinyl gloves size L');
  });

  await flow('catalogue: bulk +10% price on two products', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openCatalogue(page);
    await rowsReady(page);
    await page.locator('[aria-label="Select Centrefeed paper roll, 6 × 150 m"]').click();
    await page.locator('[aria-label="Select Cocktail napkins 24×24, 3000 pcs"]').click();
    await text(page, '2 products selected');
    await shot(page, 'catalogue-bulk');
    await page.locator('[role=toolbar] ::-p-text(Change price)').click();
    await type(page, 'bulk-price', '10');
    await text(page, '38,30 KM → 42,13 KM');
    await page.locator('[role=dialog] button[type=submit]').click();
    await text(page, 'Changed 2 prices by +10%');
    await page.waitForFunction(() => document.body.innerText.includes('42,13'));
    if (nbsp(await priceOf(page, 'Cocktail napkins')) !== '21,12 KM') throw new Error(`cocktail napkins now ${await priceOf(page, 'Cocktail napkins')}`);
  });

  await flow('product edit: base price + tier, validation, save', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openCatalogue(page);
    await rowsReady(page);
    await page.locator('tbody a ::-p-text(Z-fold hand towels)').click();
    await url(page, /^\/vendor\/catalogue\/p_tw_zfold$/);
    await page.waitForSelector('#basePrice');
    if ((await page.$eval('#basePrice', (e) => e.value)) !== '44,60') throw new Error('base price not prefilled in bs-BA');
    await page.locator('button ::-p-text(Add tier)').click();
    const tierInputs = await page.$$('[aria-label^="Tier 3"]');
    await tierInputs[0].type('100');
    await tierInputs[1].type('50,00');
    await page.locator('button[type=submit]').click();
    await text(page, 'Must not cost more than the 50+ tier');
    await tierInputs[1].click();
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await tierInputs[1].type('36,50');
    await type(page, 'basePrice', '45,90');
    await page.locator('button[type=submit]').click();
    await text(page, 'Changes saved');
    await shot(page, 'product-edit');
  });

  await flow('product edit persists within the session (client navigation)', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openCatalogue(page);
    await rowsReady(page);
    await page.locator('tbody a ::-p-text(Z-fold hand towels)').click();
    await page.waitForSelector('#basePrice');
    await type(page, 'basePrice', '45,90');
    await page.locator('button[type=submit]').click();
    await text(page, 'Changes saved');
    await page.locator('[aria-label="Back to catalogue"]').click();
    await url(page, /^\/vendor\/catalogue$/);
    await rowsReady(page);
    await page.waitForFunction(() => document.body.innerText.includes('45,90'));
  });

  await flow('new product: SKU conflict on the field, then create', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openCatalogue(page);
    await rowsReady(page);
    await page.locator('a ::-p-text(Add product)').click();
    await url(page, /^\/vendor\/catalogue\/new$/);
    await page.waitForSelector('#name');
    await page.locator('button[type=submit]').click();
    await text(page, 'Name is required');
    await type(page, 'name', 'Bamboo toilet paper, 24 rolls');
    await type(page, 'sku', 'TP-3P-48');
    await type(page, 'basePrice', '29,90');
    await type(page, 'unit', 'case');
    await type(page, 'stock', '40');
    await page.locator('button[type=submit]').click();
    await text(page, 'already used by');
    await type(page, 'sku', 'TP-BAM-24');
    await page.locator('button[type=submit]').click();
    await text(page, 'Added “Bamboo toilet paper, 24 rolls”');
    await page.waitForFunction(() => /^\/vendor\/catalogue\/p_/.test(location.pathname));
    await page.locator('[aria-label="Back to catalogue"]').click();
    await text(page, '18 of 250 products');
  });

  await flow('buyer-specific price: add one, see it listed, remove it', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openCatalogue(page);
    await rowsReady(page);
    await page.locator('tbody a ::-p-text(Foam hand soap)').click();
    await text(page, 'Buyer-specific prices');
    await page.waitForFunction(() => document.body.innerText.includes('19,90'));
    await page.locator('#override-buyer').click();
    await page.locator('[role=option] ::-p-text(Café Lipa)').click();
    await type(page, 'override-price', '21,50');
    await page.locator('button ::-p-text(Set price)').click();
    await text(page, "Set Café Lipa's price to 21,50");
    await page.waitForFunction(() => [...document.querySelectorAll('tr')].some((r) => r.innerText.includes('Café Lipa')));
    await shot(page, 'buyer-prices');
    await page.locator(`[aria-label="Remove Café Lipa's price"]`).click();
    await text(page, 'Café Lipa now pays the list price');
  });

  await flow('delete product', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openCatalogue(page);
    await rowsReady(page);
    await page.locator('tbody a ::-p-text(Vinyl gloves size L)').click();
    await page.waitForSelector('#name');
    await page.locator('button ::-p-text(Delete)').click();
    await page.locator('[role=alertdialog] button ::-p-text(Delete product)').click();
    await url(page, /^\/vendor\/catalogue$/);
    await text(page, '16 of 250 products');
  });

  await flow('plan limit (v1.1 hard block): Add product disabled, notice links to Subscription & billing', async (page) => {
    await login(page, 'ivan@cleanpro.rs');
    await openCatalogue(page);
    await rowsReady(page);
    await text(page, '10 of 10 products on Starter');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Add product') && b.disabled));
    if (await page.$('a[href="/vendor/catalogue/new"]')) throw new Error('Add product still a link at the limit');
    await text(page, "You've reached your plan's product limit");
    await text(page, 'Your Starter plan allows 10 products.');
    await shot(page, 'plan-limit');
    await page.locator('[role=alert] a ::-p-text(Subscription & billing)').click();
    await url(page, /^\/vendor\/settings\/plan$/);
    await text(page, 'Your request for Growth is waiting for review'); // seeded pending request
    if (!(await page.$eval('[aria-label="Pro plan"] button', (b) => b.disabled))) throw new Error('second request allowed while one is pending');
    // The new-product page, reached directly, is blocked too.
    await page.goto(`${BASE}/vendor/catalogue/new`);
    await text(page, "You've reached your plan's product limit");
    if (!(await page.$eval('button[type=submit]', (b) => b.disabled))) throw new Error('save enabled at limit');
    // Non-tracking vendor: no Inventory card at all.
    if ((await page.evaluate(() => document.body.innerText)).includes('In stock')) throw new Error('inventory shown for non-tracking vendor');
  });

  await flow('categories & tags sheet: add a tag, it shows up in the filter', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openCatalogue(page);
    await rowsReady(page);
    await page.locator('button ::-p-text(Categories & tags)').click();
    await type(page, 'new-tag', 'Seasonal');
    await page.keyboard.press('Enter');
    await text(page, 'Added tag “Seasonal”');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role=dialog]', { hidden: true }); // exit animation overlay swallows clicks
    await page.locator('[aria-label="Filter by tag"]').click();
    await page.locator('[role=menuitemcheckbox] ::-p-text(Seasonal)').wait();
  });
}
