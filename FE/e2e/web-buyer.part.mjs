// Phase 3 — buyer catalogue browsing, product detail, favorites, basic cart (web).
export async function buyerFlows({ flow, BASE, text, url, login, shot }) {
  const h1Is = (page, t) => page.waitForFunction((t) => document.querySelector('h1')?.textContent === t, {}, t);
  const switchVendor = async (page, name) => {
    await page.locator('[aria-label="Switch vendor"]').click();
    await page.locator(`[role=menuitemradio] ::-p-text(${name})`).click();
    await h1Is(page, name);
    await page.waitForSelector('[role=menu]', { hidden: true }); // closing menu overlay swallows the next click
  };

  await flow('b-browse: featured + most-ordered shelves, all products, search', async (page) => {
    await login(page, 'nikola@cafelipa.rs');
    await h1Is(page, 'Papirko Wholesale');
    await text(page, 'Featured by Papirko Wholesale');
    await text(page, 'Your most ordered');
    await text(page, 'Ordered ');
    await text(page, 'All products 16'); // 17 minus the inactive vinyl gloves
    await shot(page, 'buyer-browse');
    await page.locator('[aria-label="Search products"]').fill('napkins');
    await text(page, 'Results 3');
    if ((await page.evaluate(() => document.body.innerText)).includes('Your most ordered')) throw new Error('shelves shown while searching');
  });

  await flow('b-product detail: tier table, price follows quantity (tier + promo), add to cart', async (page) => {
    await login(page, 'nikola@cafelipa.rs');
    await h1Is(page, 'Papirko Wholesale');
    await page.goto(`${BASE}/buyer/products/p_tw_zfold`); // session restores from storage
    await h1Is(page, 'Z-fold hand towels, 20 × 200 sheets');
    await text(page, 'Buy more, pay less');
    await text(page, '% off'); // Café Lipa's 5% welcome promotion ("5%" or "5 %" depending on the runtime's locale data)
    await text(page, '42,37 KM'); // 44,60 − 5 %
    await page.locator('[aria-label="Quantity of Z-fold hand towels, 20 × 200 sheets"]').click();
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.type('10');
    await page.keyboard.press('Enter');
    await text(page, '400,00 KM'); // tier 42,10 − 5 % = 40,00 × 10
    await page.locator('button ::-p-text(Add to cart)').click();
    await text(page, 'Added 10 × Z-fold hand towels');
    await page.waitForSelector('[aria-label="10 items in cart"]');
    await shot(page, 'buyer-detail');
  });

  await flow('b-negotiated price hides tiers; another vendor’s product is not shown', async (page) => {
    await login(page, 'milica@aurora-hotels.rs');
    await page.waitForSelector('[aria-label="Switch vendor"]');
    const active = await page.$eval('h1', (h) => h.textContent);
    if (active !== 'CleanPro Chemicals') await switchVendor(page, 'CleanPro Chemicals');
    await page.goto(`${BASE}/buyer/products/p_soap_foam5`);
    await text(page, "This product isn't available");
    await page.goto(`${BASE}/buyer`);
    await switchVendor(page, 'Papirko Wholesale');
    await text(page, 'Your most ordered'); // the screen remounts on vendor switch; let it settle before clicking
    await page.locator('a ::-p-text("Foam hand soap, 5 L")').click(); // quoted: a comma splits selector lists
    await text(page, 'Your negotiated price');
    await text(page, 'Your price');
    if ((await page.evaluate(() => document.body.innerText)).includes('Buy more, pay less')) throw new Error('tier table shown despite negotiated price');
  });

  await flow('b-favorites: list for the active vendor, unfavorite removes it', async (page) => {
    await login(page, 'milica@aurora-hotels.rs');
    await page.waitForSelector('[aria-label="Switch vendor"]');
    if ((await page.$eval('h1', (h) => h.textContent)) !== 'Papirko Wholesale') await switchVendor(page, 'Papirko Wholesale');
    await page.locator('a[href="/buyer/favorites"]').click();
    await url(page, /^\/buyer\/favorites$/);
    await page.waitForFunction(() => document.querySelectorAll('[aria-label^="Remove "][aria-label$=" from favorites"]').length === 3);
    await page.locator('[aria-label="Remove Foam hand soap, 5 L from favorites"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[aria-label^="Remove "][aria-label$=" from favorites"]').length === 2);
  });

  await flow('b-cart: quick-add respects minimum order, qty re-prices, persists', async (page) => {
    await login(page, 'nikola@cafelipa.rs');
    await h1Is(page, 'Papirko Wholesale');
    await page.locator('[aria-label="Search products"]').fill('sanitizer');
    await text(page, 'Results 1');
    await page.locator('[aria-label="Add 6 Hand sanitizer gel, 1 L to cart"]').click();
    await text(page, 'Added 6 × Hand sanitizer gel, 1 L');
    await page.locator('a[href="/buyer/cart"]').click();
    await url(page, /^\/buyer\/cart$/);
    await text(page, 'Total');
    await text(page, '71,28 KM'); // 12,50 − 5 % = 11,88 per unit × 6
    // The minimum order is enforced by the stepper; + re-prices.
    if (!(await page.$eval('[aria-label="Decrease Quantity of Hand sanitizer gel, 1 L"]', (b) => b.disabled))) throw new Error('can go below minimum');
    await page.locator('[aria-label="Increase Quantity of Hand sanitizer gel, 1 L"]').click();
    await text(page, '83,16 KM');
    await page.reload();
    await text(page, '83,16 KM'); // cart persisted
    await page.waitForSelector('[aria-label="7 items in cart"]');
    await shot(page, 'buyer-cart');
    await page.locator('[aria-label="Remove Hand sanitizer gel, 1 L"]').click();
    await text(page, 'Your cart is empty');
  });

  await flow('b-cart is per vendor', async (page) => {
    await login(page, 'milica@aurora-hotels.rs');
    await page.waitForSelector('[aria-label="Switch vendor"]');
    if ((await page.$eval('h1', (h) => h.textContent)) !== 'Papirko Wholesale') await switchVendor(page, 'Papirko Wholesale');
    await page.locator('[aria-label="Search products"]').fill('Z-fold');
    await text(page, 'Results 1');
    await page.locator('[aria-label="Add 1 Z-fold hand towels, 20 × 200 sheets to cart"]').click();
    await page.waitForSelector('[aria-label="1 item in cart"]');
    await switchVendor(page, 'CleanPro Chemicals');
    await page.waitForFunction(() => !document.querySelector('[aria-label$=" in cart"]'));
    await switchVendor(page, 'Papirko Wholesale');
    await page.waitForSelector('[aria-label="1 item in cart"]');
  });
}
