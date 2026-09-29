// Phase 5 — vendor orders & buyers on mobile (Expo web export).
export async function vendorFlows({ flow, text, path, fill, login, byLabel, shot }) {
  const tab = (page, name) => page.locator(`[role=tab] ::-p-text(${name})`).click();
  const firstOrder = async (page) => {
    await page.waitForSelector('[aria-label^="Order "]');
    await (await page.$$('[aria-label^="Order "]'))[0].click();
    await path(page, /^\/vendor\/order\/ord_/);
  };

  await flow('mv-orders: Placed filter → Mark as Confirmed → reply', async (page) => {
    await login(page, 'marko@papirko.rs');
    await path(page, /^\/vendor\/?$/); // lands on Home (dashboard)
    await tab(page, 'Orders');
    await path(page, /^\/vendor\/orders$/);
    await page.locator('[role=radio] ::-p-text(Placed)').click();
    await firstOrder(page);
    await page.locator('[role=button] ::-p-text(Mark as Confirmed)').click();
    await text(page, 'is now “Confirmed”');
    // The composer is labelled with this order's buyer, whoever it is.
    await page.waitForSelector('[aria-label^="Message "]');
    const label = await page.$eval('[aria-label^="Message "]', (e) => e.getAttribute('aria-label'));
    await fill(page, label, 'On its way tomorrow.');
    await page.locator('[role=button] ::-p-text(Send)').click();
    await text(page, 'On its way tomorrow.');
    await shot(page, 'm-vendor-order');
  });

  await flow('mv-cancel: inline confirm, then the cancelled banner', async (page) => {
    await login(page, 'marko@papirko.rs');
    await path(page, /^\/vendor\/?$/); // lands on Home (dashboard)
    await tab(page, 'Orders');
    await page.locator('[role=radio] ::-p-text(Open)').click();
    await firstOrder(page);
    await page.locator('[role=button] ::-p-text(Cancel order)').click();
    await text(page, 'will see it as “Cancelled”');
    await (await page.$$('[role=button] ::-p-text(Cancel order)')).at(-1).click();
    await text(page, 'is now “Cancelled”');
    await text(page, "This order won't be delivered");
  });

  await flow('mv-buyers: usage, conflict, invite shows the link', async (page) => {
    await login(page, 'ivan@cleanpro.rs');
    await path(page, /^\/vendor\/?$/); // lands on Home (dashboard)
    await tab(page, 'Buyers');
    await path(page, /^\/vendor\/buyers$/);
    await text(page, '2 of 5 buyers on Starter');
    await fill(page, "Buyer's email", 'milica@aurora-hotels.rs');
    await page.locator('[role=button] ::-p-text(Send invite)').click();
    await text(page, 'already connected');
    await fill(page, "Buyer's email", 'a@novi.ba');
    await page.locator('[role=button] ::-p-text(Send invite)').click();
    await text(page, "We've invited a@novi.ba");
    await text(page, 'Invite link: /invite/');
    await text(page, '3 of 5 buyers on Starter');
    await shot(page, 'm-vendor-buyers');
  });

  await flow('mv-buyer detail: prices, then disconnect', async (page) => {
    await login(page, 'marko@papirko.rs');
    await path(page, /^\/vendor\/?$/); // lands on Home (dashboard)
    await tab(page, 'Buyers');
    await byLabel(page, 'Open Hotel Aurora Group').click();
    await path(page, /^\/vendor\/buyer\/bo_aurora$/);
    await text(page, 'Negotiated prices');
    await text(page, '19,90 KM');
    await page.locator('[role=button] ::-p-text(Disconnect buyer)').click();
    await page.locator('[role=button] ::-p-text(Disconnect)').click();
    await path(page, /^\/vendor\/buyers$/);
    await page.waitForFunction(() => !document.querySelector('[aria-label="Open Hotel Aurora Group"]'));
  });
}
