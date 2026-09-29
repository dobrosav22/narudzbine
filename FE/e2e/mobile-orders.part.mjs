// Phase 4 — cart location, draft carts, checkout, order history & detail (mobile / Expo web export).
export async function orderFlows({ flow, text, path, fill, login, byLabel, shot }) {
  const tab = (page, name) => page.locator(`[role=tab] ::-p-text(${name})`).click();

  await flow('m-o checkout: change location, place order, lands on it with the vendor’s first status', async (page) => {
    await login(page, 'milica@aurora-hotels.rs'); // CleanPro is her default vendor
    await text(page, 'All products');
    await fill(page, 'Search products', 'Dishwasher');
    await text(page, 'Results · 1');
    await byLabel(page, 'Add 1 Dishwasher detergent, 12 kg to cart').click();
    await tab(page, 'Cart');
    await path(page, /^\/buyer\/cart$/);
    await text(page, 'Knez Mihailova 12'); // home location = default
    await page.locator('[role=radio] ::-p-text(Aurora Novi Sad)').click();
    await text(page, 'Bulevar oslobođenja 5');
    await page.locator('[role=button] ::-p-text(Checkout)').click();
    await path(page, /^\/buyer\/checkout$/);
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[role=radio]')].some((r) => r.innerText.includes('Aurora Novi Sad') && r.getAttribute('aria-checked') === 'true'),
    );
    await shot(page, 'm-checkout');
    await page.locator('[role=button] ::-p-text(Place order)').click();
    await path(page, /^\/buyer\/order\/ord_/);
    await text(page, 'Order placed');
    await text(page, 'Received');
    await text(page, 'Aurora Novi Sad');
    await shot(page, 'm-order-placed');
  });

  await flow('m-o drafts: resume a teammate’s saved cart', async (page) => {
    await login(page, 'milica@aurora-hotels.rs');
    await text(page, 'All products');
    await tab(page, 'Cart');
    await text(page, 'Saved carts');
    await text(page, 'Jovana Marković · 6 items');
    await page.locator('[role=button] ::-p-text(Resume)').click();
    await text(page, 'Saved cart loaded');
    await text(page, 'Editing a saved cart');
    await text(page, 'Floor cleaner concentrate, 5 L');
  });

  await flow('m-o history: CleanPro status chips filter; message thread; reply', async (page) => {
    await login(page, 'milica@aurora-hotels.rs');
    await text(page, 'All products');
    await tab(page, 'Orders');
    await path(page, /^\/buyer\/orders$/);
    await text(page, 'Out for delivery'); // the vendor's own status list as chips
    await page.waitForSelector('[aria-label^="Order "]');
    await (await page.$$('[aria-label^="Order "]'))[0].click(); // newest first
    await path(page, /^\/buyer\/order\/ord_/);
    await text(page, 'Riverside service entrance'); // seeded message on the newest Aurora/CleanPro order
    await fill(page, 'Message CleanPro Chemicals', 'Thanks, noted.');
    await page.locator('[role=button] ::-p-text(Send)').click();
    await text(page, 'Thanks, noted.');
    await shot(page, 'm-order-messages');
  });

  await flow('m-o reorder fills the cart and opens it', async (page) => {
    await login(page, 'milica@aurora-hotels.rs');
    await text(page, 'All products');
    await tab(page, 'Orders');
    await page.waitForSelector('[aria-label^="Order "]');
    await (await page.$$('[aria-label^="Order "]'))[0].click(); // newest first
    await path(page, /^\/buyer\/order\/ord_/);
    await page.locator('[role=button] ::-p-text(Reorder)').click();
    await path(page, /^\/buyer\/cart$/);
    await text(page, 'Deliver to');
  });
}
