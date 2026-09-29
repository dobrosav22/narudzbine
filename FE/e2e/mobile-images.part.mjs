// Phase 8 — product images and vendor order filters on mobile (Expo web export).
import { fileURLToPath } from 'node:url';

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

export async function imageFlows({ flow, text, path, login, shot }) {
  const tab = (page, name) => page.locator(`[role=tab] ::-p-text(${name})`).click();

  await flow('m-images: buyer rows show pictures and placeholders', async (page) => {
    await login(page, 'nikola@cafelipa.rs');
    await text(page, 'All products');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=product-image] img').length > 0);
    const counts = await page.$$eval('[data-testid=product-image]', (els) => ({
      pictures: els.filter((e) => e.querySelector('img')).length,
      placeholders: els.filter((e) => !e.querySelector('img')).length,
    }));
    if (!counts.pictures || !counts.placeholders) throw new Error(JSON.stringify(counts));
    await shot(page, 'm-images-browse');
  });

  await flow('m-images: vendor picks a photo for a product without one', async (page) => {
    await login(page, 'marko@papirko.rs');
    await path(page, /^\/vendor\/?$/);
    await tab(page, 'Catalogue');
    await page.locator('[aria-label^="Edit Nitrile gloves size M"]').click();
    await path(page, /^\/vendor\/product\/p_glv_nitrile$/);
    // expo-image-picker opens the browser's file chooser on web.
    const [chooser] = await Promise.all([page.waitForFileChooser(), page.locator('[role=button] ::-p-text(Choose photo)').click()]);
    await chooser.accept([fixture('product.png')]);
    await text(page, 'Replace photo');
    await page.waitForSelector('[aria-label^="Image of"] img');
    await shot(page, 'm-images-editor');
  });

  await flow('m-orders filters: warehouse chips (Papirko has two) and date range', async (page) => {
    await login(page, 'marko@papirko.rs');
    await path(page, /^\/vendor\/?$/);
    await tab(page, 'Orders');
    await path(page, /^\/vendor\/orders$/);
    await page.waitForSelector('[aria-label^="Order "]');
    // FlatList renders in batches, so row counts are unreliable. Watch one older order instead:
    // seeded order 1022 is a fulfilled order from about a month ago.
    const old = '[aria-label="Order 1022"]';
    const gone = () => page.waitForFunction((sel) => !document.querySelector(sel), {}, old);
    await page.locator('[role=radio] ::-p-text(Fulfilled)').click();
    await page.waitForSelector(old);
    await page.locator('[role=radio] ::-p-text(Last 7 days)').click();
    await gone();
    await page.locator('[role=radio] ::-p-text(Novi Sad depot)').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[role=radio]')].some((r) => r.innerText.trim() === 'Novi Sad depot' && r.getAttribute('aria-checked') === 'true'),
    );
    await page.locator('[role=radio] ::-p-text(All time)').click();
    await page.locator('[role=radio] ::-p-text(All warehouses)').click();
    await page.waitForSelector(old);
    await shot(page, 'm-orders-filters');
  });
}
