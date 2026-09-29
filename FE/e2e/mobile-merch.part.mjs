// Phase 6 — dashboard, stats, featured & promotions on mobile (Expo web export).
export async function merchFlows({ flow, text, path, login, shot }) {
  const tab = (page, name) => page.locator(`[role=tab] ::-p-text(${name})`).click();
  const link = (page, name) => page.locator(`[role=link] ::-p-text(${name})`).click();

  await flow('mv-dashboard: tiles, low stock, promotions; Stats by product → by buyer', async (page) => {
    await login(page, 'marko@papirko.rs');
    await path(page, /^\/vendor\/?$/);
    await text(page, 'Revenue · 30 days');
    await text(page, 'LOW STOCK'); // section titles are CSS-uppercased
    await text(page, 'Out of stock');
    await text(page, '10% off'); // live Napkins promotion
    await shot(page, 'm-dashboard');
    await link(page, 'Stats');
    await path(page, /^\/vendor\/stats$/);
    await text(page, 'Nitrile gloves size M');
    await page.locator('[role=radio] ::-p-text(By buyer)').click();
    await text(page, 'Hotel Aurora Group');
    await page.locator('[role=radio] ::-p-text(All time)').click();
    await text(page, 'Kindergarten Sunce');
    await shot(page, 'm-stats');
  });

  await flow('mv-merch: reorder featured + save; pause a live promotion', async (page) => {
    await login(page, 'marko@papirko.rs');
    await path(page, /^\/vendor\/?$/);
    await link(page, 'Featured & promotions');
    await path(page, /^\/vendor\/merchandising$/);
    await text(page, 'Scheduled');
    await page.locator('[aria-label^="Move Recycled toilet paper"][aria-label$=" up"]').click();
    await page.locator('[role=button] ::-p-text(Save order)').click();
    await text(page, 'Featured products saved.');
    // The Napkins promotion's switch; RN-web renders Switch as role=switch.
    await page.locator('[role=switch][aria-label*="Napkins"]').click();
    await text(page, 'Paused — not applied');
    await shot(page, 'm-merch');
  });

  await flow('mb-stats: Orders header → Your stats; period and location chips', async (page) => {
    await login(page, 'milica@aurora-hotels.rs');
    await text(page, 'All products');
    await tab(page, 'Orders');
    await page.locator('[aria-label="Your stats"]').click();
    await path(page, /^\/buyer\/stats$/);
    await text(page, 'SPEND BY MONTH');
    await text(page, 'Total spend');
    await page.locator('[role=radio] ::-p-text(All time)').click();
    // The Orders tab underneath stays mounted with its own location chips: click the last (visible) match.
    // Location chips render once locations load; wait before picking the visible one.
    await page.waitForSelector('[role=radio] ::-p-text(Aurora Riverside)');
    await (await page.$$('[role=radio] ::-p-text(Aurora Riverside)')).at(-1).click();
    await page.waitForFunction(() => /Total spend|No orders in this period/.test(document.body.innerText));
    await shot(page, 'm-buyer-stats');
  });
}
