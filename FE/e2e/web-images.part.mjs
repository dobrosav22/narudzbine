// Phase 8 — product images (web).
import { fileURLToPath } from 'node:url';

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

export async function imageFlows({ flow, text, url, login, shot }) {
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
  const cardImages = (page) =>
    page.$$eval('[data-slot=card] [data-slot=product-image]', (els) => ({
      pictures: els.filter((e) => e.querySelector('img')).length,
      placeholders: els.filter((e) => !e.querySelector('img')).length,
    }));

  await flow('images: buyer cards show pictures, and a placeholder where there is none', async (page) => {
    await login(page, 'nikola@cafelipa.rs');
    await url(page, /^\/buyer$/);
    await page.waitForSelector('section[aria-labelledby="all-products"] [data-slot=product-image]');
    await page.waitForFunction(() => document.querySelectorAll('[data-slot=product-image] img').length > 0);
    const { pictures, placeholders } = await cardImages(page);
    if (!pictures || !placeholders) throw new Error(`expected both: ${pictures} pictures, ${placeholders} placeholders`);
    // Every picture actually decodes (data: URLs, no network).
    await page.waitForFunction(() => [...document.querySelectorAll('[data-slot=product-image] img')].every((i) => i.complete && i.naturalWidth > 0));
    await shot(page, 'images-browse');
  });

  await flow('images: vendor uploads a picture (non-image refused) → buyer sees it; remove clears it', async (page) => {
    await login(page, 'marko@papirko.rs');
    await page.locator('[data-sidebar=menu] a[href="/vendor/catalogue"]').click();
    await url(page, /^\/vendor\/catalogue$/);
    await page.locator('tbody a ::-p-text(Nitrile gloves size M)').click();
    await url(page, /^\/vendor\/catalogue\/p_glv_nitrile$/);
    await text(page, 'Upload image');
    const input = await page.waitForSelector('input[type=file]');
    await input.uploadFile(fixture('not-an-image.txt'));
    await text(page, 'Use a JPG, PNG or WebP image');
    await input.uploadFile(fixture('product.png'));
    await text(page, 'Replace image');
    await page.waitForSelector('[data-slot=product-image] img[alt^="Image of"]');
    await page.locator('button[type=submit]').click();
    await text(page, 'Changes saved');
    await shot(page, 'images-editor');

    await switchUser(page, 'nikola@cafelipa.rs');
    await page.locator('[aria-label="Search products"]').fill('Nitrile');
    await text(page, 'Results');
    await page.waitForFunction(() => document.querySelectorAll('section[aria-labelledby] [data-slot=product-image] img').length === 1);

    await switchUser(page, 'marko@papirko.rs');
    await page.locator('[data-sidebar=menu] a[href="/vendor/catalogue"]').click();
    await page.locator('tbody a ::-p-text(Nitrile gloves size M)').click();
    await text(page, 'Replace image');
    await page.locator('button ::-p-text(Remove)').click();
    await text(page, 'Upload image');
    await page.locator('button[type=submit]').click();
    await text(page, 'Changes saved');
  });
}
