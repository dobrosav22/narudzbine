// Phase 3 — buyer browsing / detail / favorites / cart on mobile (Expo web export).
export async function buyerFlows({ flow, text, path, fill, login, byLabel, shot }) {
  const openProduct = (page, name) => page.locator(`[aria-label="Open ${name}"]`).click();
  const tab = (page, name) => page.locator(`[role=tab] ::-p-text(${name})`).click();

  await flow('m-b browse: shelves, all products, search', async (page) => {
    await login(page, 'nikola@cafelipa.rs');
    await path(page, /^\/buyer\/?$/);
    await text(page, 'Featured by Papirko Wholesale');
    await text(page, 'Your most ordered');
    await text(page, 'All products · 16');
    await shot(page, 'm-buyer-browse');
    await fill(page, 'Search products', 'napkins');
    await text(page, 'Results · 3');
  });

  await flow('m-b quick add inside a row adds without opening the product', async (page) => {
    await login(page, 'nikola@cafelipa.rs');
    await fill(page, 'Search products', 'sanitizer');
    await text(page, 'Results · 1');
    await byLabel(page, 'Add 6 Hand sanitizer gel, 1 L to cart').click();
    await text(page, '6 in cart · add');
    await path(page, /^\/buyer\/?$/); // still on Home — the row press didn't fire
  });

  await flow('m-b detail: price follows quantity, add to cart, tab badge, cart total', async (page) => {
    await login(page, 'nikola@cafelipa.rs');
    await text(page, 'All products');
    await openProduct(page, 'Z-fold hand towels, 20 × 200 sheets');
    await path(page, /^\/buyer\/product\/p_tw_zfold$/);
    await text(page, 'Buy more, pay less');
    await text(page, '42,37 KM');
    await fill(page, 'Quantity of Z-fold hand towels, 20 × 200 sheets', '10');
    await page.keyboard.press('Enter');
    await text(page, '400,00 KM');
    await page.locator('[role=button] ::-p-text(Add to cart)').click();
    await text(page, 'Added 10 × Z-fold hand towels');
    await shot(page, 'm-buyer-detail');
    await page.goBack();
    await tab(page, 'Cart');
    await path(page, /^\/buyer\/cart$/);
    await text(page, '400,00 KM');
    await byLabel(page, 'Increase Quantity of Z-fold hand towels, 20 × 200 sheets').click();
    await text(page, '440,00 KM');
    await shot(page, 'm-buyer-cart');
    await byLabel(page, 'Remove Z-fold hand towels, 20 × 200 sheets').click();
    await text(page, 'Your cart is empty');
  });

  await flow('m-b favorites for the active vendor; unfavorite empties the list', async (page) => {
    await login(page, 'milica@aurora-hotels.rs');
    await text(page, 'All products');
    await tab(page, 'Favorites');
    await path(page, /^\/buyer\/favorites$/);
    // Tabs stay mounted: wait for THIS screen to finish loading, then click its heart (the last match in DOM order).
    await page.waitForSelector('[aria-label="Loading favorites…"]', { hidden: true });
    const hearts = await page.$$('[aria-label="Remove Dishwasher detergent, 12 kg from favorites"]'); // CleanPro is the default vendor
    await hearts.at(-1).click();
    await text(page, 'No favorites yet');
  });

  await flow('m-b negotiated price after switching vendor', async (page) => {
    await login(page, 'milica@aurora-hotels.rs');
    await text(page, 'All products');
    await byLabel(page, 'Switch vendor').click();
    await path(page, /^\/switch-vendor$/);
    await page.locator('[role=radio] ::-p-text(Papirko Wholesale)').click();
    await text(page, 'Featured by Papirko Wholesale');
    await openProduct(page, 'Foam hand soap, 5 L');
    await text(page, 'Your negotiated price');
    await text(page, 'Your price');
  });
}
