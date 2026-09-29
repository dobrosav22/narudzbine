// Phase 4 — cart location, draft carts, checkout, order history & detail (web).
export async function orderFlows({ flow, BASE, text, url, login, shot }) {
  const h1Is = (page, t) => page.waitForFunction((t) => document.querySelector('h1')?.textContent === t, {}, t);
  const switchVendor = async (page, name) => {
    await page.locator('[aria-label="Switch vendor"]').click();
    await page.locator(`[role=menuitemradio] ::-p-text("${name}")`).click();
    await h1Is(page, name);
    await page.waitForSelector('[role=menu]', { hidden: true });
  };
  const milicaOn = async (page, vendor) => {
    await login(page, 'milica@aurora-hotels.rs');
    await page.waitForSelector('[aria-label="Switch vendor"]');
    await page.waitForFunction(() => document.querySelector('h1')?.textContent);
    if ((await page.$eval('h1', (h) => h.textContent)) !== vendor) await switchVendor(page, vendor);
  };
  const pickSelect = async (page, triggerLabel, option) => {
    await page.locator(`[aria-label="${triggerLabel}"]`).click();
    await page.locator(`[role=option] ::-p-text("${option}")`).click();
  };

  await flow('o-checkout: change location, place order, land on it, appears in history', async (page) => {
    await milicaOn(page, 'Papirko Wholesale');
    await page.locator('[aria-label="Search products"]').fill('Z-fold');
    await text(page, 'Results 1');
    await page.locator('[aria-label^="Add 1 Z-fold"]').click();
    await page.locator('a[href="/buyer/cart"]').click();
    await url(page, /^\/buyer\/cart$/);
    await text(page, 'Knez Mihailova 12'); // Milica's home location (Aurora Central) is the default
    await pickSelect(page, 'Delivery location', 'Aurora Riverside');
    await text(page, 'Karađorđeva 48');
    await page.locator('button ::-p-text(Checkout)').click();
    await url(page, /^\/buyer\/checkout$/);
    if (!(await page.$eval('#loc-loc_aurora_river', (r) => r.getAttribute('aria-checked') === 'true' || r.getAttribute('data-state') === 'checked'))) {
      throw new Error('checkout did not keep the chosen location');
    }
    await shot(page, 'checkout');
    await page.locator('button ::-p-text(Place order)').click();
    await page.waitForFunction(() => /^\/buyer\/orders\/ord_/.test(location.pathname) && location.search === '?placed=1');
    await text(page, 'Order placed');
    await text(page, 'Aurora Riverside');
    await page.waitForSelector('[aria-current="step"]');
    if ((await page.$eval('[aria-current="step"]', (e) => e.innerText)).trim().split('\n').pop() !== 'Placed') throw new Error('tracker not at Placed');
    await shot(page, 'order-placed');
    await page.locator('[aria-label="Back to orders"]').click();
    await url(page, /^\/buyer\/orders$/);
    await page.waitForSelector('tbody tr');
    const first = await page.$eval('tbody tr', (r) => r.innerText);
    if (!first.includes('Placed') || !first.includes('Aurora Riverside')) throw new Error(`newest order row: ${first}`);
    if (await page.$('[aria-label$=" in cart"]')) throw new Error('cart not cleared after ordering');
  });

  await flow('o-drafts: mine first; park, resume a teammate’s, discard', async (page) => {
    await milicaOn(page, 'Papirko Wholesale');
    await page.locator('a[href="/buyer/cart"]').click();
    await text(page, 'Saved carts');
    const firstDraft = await page.$eval('[aria-label="Saved carts"] li', (li) => li.innerText);
    if (!firstDraft.startsWith('You')) throw new Error(`own draft not first: ${firstDraft}`);
    await page.locator('a ::-p-text(Browse the catalogue)').click();
    await page.locator('[aria-label="Search products"]').fill('sanitizer');
    await text(page, 'Results 1');
    await page.locator('[aria-label="Add 6 Hand sanitizer gel, 1 L to cart"]').click();
    await page.locator('a[href="/buyer/cart"]').click();
    await page.locator('button ::-p-text(Save for later)').click();
    await text(page, 'Cart saved');
    await text(page, 'Your cart is empty');
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Saved carts"] li').length === 3);
    await page.locator('[aria-label="Saved carts"] li:nth-child(3) button ::-p-text(Resume)').click(); // Stefan's (oldest-updated teammate draft)
    await text(page, 'Saved cart loaded');
    await text(page, 'Editing a saved cart');
    await text(page, 'Karađorđeva 48'); // the draft's location came with it
    await shot(page, 'drafts');
    const before = await page.$$eval('[aria-label^="Discard "]', (b) => b.length);
    await page.locator('[aria-label^="Discard "]').click();
    await text(page, 'Saved cart discarded');
    await page.waitForFunction((n) => document.querySelectorAll('[aria-label^="Discard "]').length === n - 1, {}, before);
  });

  await flow('o-history filters use the vendor’s own statuses (CleanPro)', async (page) => {
    await milicaOn(page, 'CleanPro Chemicals');
    await page.locator('a[href="/buyer/orders"]').click();
    await page.waitForSelector('tbody tr');
    await page.locator('[aria-label="Filter by status"]').click();
    await page.locator('[role=option] ::-p-text(Out for delivery)').wait();
    await page.locator('[role=option] ::-p-text(Delivered)').click();
    await page.waitForFunction(() => [...document.querySelectorAll('tbody tr')].every((r) => r.innerText.includes('Delivered')));
    await page.locator('tbody tr a').click();
    await page.waitForSelector('[aria-label="Order progress"]');
    const steps = await page.$eval('[aria-label="Order progress"]', (ol) => ol.innerText.replace(/\d\n?/g, '').replace(/\s+/g, ' ').trim());
    if (!steps.includes('Received') || !steps.includes('Picking') || !steps.includes('Out for delivery') || !steps.includes('Delivered')) {
      throw new Error(`tracker steps: ${steps}`);
    }
  });

  await flow('o-detail messages: vendor thread shows, send a reply', async (page) => {
    await milicaOn(page, 'Papirko Wholesale');
    await page.locator('a[href="/buyer/orders"]').click();
    await page.waitForSelector('tbody tr a');
    await page.locator('tbody tr a').click(); // newest Aurora/Papirko order carries the seeded thread
    await text(page, 'Thursday morning');
    await text(page, 'Papirko Wholesale');
    await page.locator('#order-message').fill('Perfect, thank you!');
    await page.keyboard.press('Enter');
    await text(page, 'Perfect, thank you!');
    await shot(page, 'order-messages');
  });

  await flow('o-reorder: replaces the cart after confirming, lands on cart', async (page) => {
    await milicaOn(page, 'Papirko Wholesale');
    await page.locator('[aria-label="Search products"]').fill('gloves');
    await text(page, 'Results 1');
    await page.locator('[aria-label^="Add 1 Nitrile gloves"]').click();
    await page.locator('a[href="/buyer/orders"]').click();
    await page.waitForSelector('tbody tr a');
    await page.locator('tbody tr:nth-child(2) a').click();
    await page.locator('button ::-p-text(Reorder)').click();
    await text(page, 'Replace your current cart?');
    await page.locator('[role=alertdialog] button ::-p-text(Replace cart)').click();
    await url(page, /^\/buyer\/cart$/);
    await text(page, 'products to your cart');
  });

  await flow('o-guard: another organization’s order is not shown', async (page) => {
    await login(page, 'nikola@cafelipa.rs');
    await h1Is(page, 'Papirko Wholesale');
    await page.goto(`${BASE}/buyer/orders/ord_1000`); // seed ids start at ord_1000 — the first plan is Aurora's
    await text(page, 'Order not found');
  });
}
