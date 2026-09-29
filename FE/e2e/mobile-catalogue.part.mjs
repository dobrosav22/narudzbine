// Phase 2 — vendor catalogue on mobile (Expo web export). Imported by mobile.mjs.
export async function catalogueFlows({ flow, text, path, fill, login, byLabel, shot }) {
  const saveHeader = (page) => page.locator('[role=button] ::-p-text(Save)').click();
  const openProduct = (page, name) => page.locator(`[aria-label^="Edit ${name}"]`).click();
  // Vendors land on Home (the dashboard, Phase 6); the catalogue is its own tab.
  const openCatalogue = async (page) => {
    await page.locator('[role=tab] ::-p-text(Catalogue)').click();
    await path(page, /^\/vendor\/catalogue$/);
  };

  await flow('m-catalogue: localized prices, category chip filter, plan usage', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openCatalogue(page);
    await text(page, '17 of 250 products on Growth');
    await text(page, '38,30 KM');
    await page.locator('[role=radio] ::-p-text(Napkins)').click();
    await page.waitForFunction(() => document.querySelectorAll('[aria-label^="Edit "]').length === 3);
    await shot(page, 'm-catalogue-filter');
  });

  await flow('m-product edit: tier validation, then save base price', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openCatalogue(page);
    await text(page, '17 of 250 products');
    await openProduct(page, 'Z-fold hand towels');
    await path(page, /^\/vendor\/product\/p_tw_zfold$/);
    await page.waitForSelector('[aria-label="Base price"]');
    if ((await page.$eval('[aria-label="Base price"]', (e) => e.value)) !== '44,60') throw new Error('base price not prefilled as 44,60');
    await page.locator('[role=button] ::-p-text(Add tier)').click();
    await fill(page, 'Tier 3 minimum quantity', '100');
    await fill(page, 'Tier 3 price per unit', '50,00');
    await saveHeader(page);
    await text(page, 'Must not cost more than the 50+ tier');
    await shot(page, 'm-product-edit');
    await fill(page, 'Tier 3 price per unit', '36,50');
    await fill(page, 'Base price', '45,90');
    await saveHeader(page);
    await path(page, /^\/vendor\/catalogue$/);
    await text(page, '45,90 KM');
  });

  await flow('m-new product: SKU conflict, then create', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openCatalogue(page);
    await text(page, '17 of 250 products');
    await byLabel(page, 'Add product').click();
    await path(page, /^\/vendor\/product\/new$/);
    await fill(page, 'Name', 'Bamboo toilet paper, 24 rolls');
    await fill(page, 'SKU', 'TP-3P-48');
    await fill(page, 'Base price', '29,90');
    await fill(page, 'Unit', 'case');
    await saveHeader(page);
    await text(page, 'already used by');
    await fill(page, 'SKU', 'TP-BAM-24');
    await saveHeader(page);
    await path(page, /^\/vendor\/catalogue$/);
    await text(page, '18 of 250 products');
  });

  await flow('m-buyer price: add Café Lipa price on foam soap', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openCatalogue(page);
    await text(page, '17 of 250 products');
    await openProduct(page, 'Foam hand soap');
    await text(page, 'Buyer-specific prices');
    await text(page, '19,90 KM');
    await page.locator('[role=radio] ::-p-text(Café Lipa)').click();
    await fill(page, 'Negotiated price', '21,50');
    await page.locator('[role=button] ::-p-text(Set price)').click();
    await byLabel(page, "Remove Café Lipa's price").wait();
    await text(page, '21,50 KM');
  });

  await flow('m-delete product with inline confirm', async (page) => {
    await login(page, 'marko@papirko.rs');
    await openCatalogue(page);
    await text(page, '17 of 250 products');
    await openProduct(page, 'Vinyl gloves size L');
    await page.waitForSelector('[aria-label="Name"]');
    await page.locator('[role=button] ::-p-text(Delete)').click();
    await page.locator('[role=button] ::-p-text(Delete product)').click();
    await path(page, /^\/vendor\/catalogue$/);
    await text(page, '16 of 250 products');
  });

  await flow('m-plan limit (v1.1): notice, Add disabled, request already waiting', async (page) => {
    await login(page, 'ivan@cleanpro.rs');
    await openCatalogue(page);
    await text(page, '10 of 10 products on Starter');
    await text(page, "You've reached your plan's product limit");
    await page.waitForFunction(() => document.querySelector('[aria-label="Add product"]')?.getAttribute('aria-disabled') === 'true');
    await shot(page, 'm-plan-limit');
    await (await page.$$('[role=button] ::-p-text(Subscription & billing)')).at(-1).click();
    await path(page, /^\/vendor\/plan$/);
    await text(page, 'Your request for Growth is waiting for review');
    await text(page, 'Waiting for review');
  });
}
