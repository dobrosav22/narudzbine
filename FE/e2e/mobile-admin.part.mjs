// Phase 7 — company admin and account on mobile (Expo web export).
export async function adminFlows({ flow, text, path, fill, login, byLabel, shot }) {
  const tab = (page, name) => page.locator(`[role=tab] ::-p-text(${name})`).click();
  const row = (page, title) => page.locator(`[role=link] ::-p-text(${title})`).click();
  const button = (page, label) => page.locator(`[role=button] ::-p-text(${label})`).click();

  await flow('m-admin locations: add a delivery location, then delete it', async (page) => {
    await login(page, 'milica@aurora-hotels.rs');
    await text(page, 'All products');
    await tab(page, 'Account');
    await row(page, 'Delivery locations');
    await path(page, /^\/buyer\/locations$/);
    await text(page, '3 LOCATIONS'); // section titles are CSS-uppercased
    await button(page, 'Add location');
    await fill(page, 'Location name', 'Aurora Kopaonik');
    await fill(page, 'Address', 'Suvo Rudište bb, Kopaonik');
    // Home tab's quick-add "Add" buttons stay mounted underneath: the form's own button is the last match.
    await (await page.$$('[role=button] ::-p-text(Add)')).at(-1).click();
    await text(page, '4 LOCATIONS');
    await byLabel(page, 'Delete Aurora Kopaonik').click();
    await (await page.$$('[role=button] ::-p-text(Delete)')).at(-1).click();
    await text(page, '3 LOCATIONS'); // section titles are CSS-uppercased
    await shot(page, 'm-admin-locations');
  });

  await flow('m-admin team: invite shows the link, then withdraw it', async (page) => {
    await login(page, 'marko@papirko.rs');
    await path(page, /^\/vendor\/?$/);
    await tab(page, 'Account');
    await row(page, 'Team');
    await path(page, /^\/vendor\/team$/);
    await text(page, 'Ana Jovanović');
    await fill(page, "Teammate's email", 'ana@papirko.rs');
    await button(page, 'Send invite');
    await text(page, 'already on your team');
    await fill(page, "Teammate's email", 'novi@papirko.rs');
    await button(page, 'Send invite');
    await text(page, "We've invited novi@papirko.rs");
    await text(page, 'Invite link: /invite/');
    await byLabel(page, 'Withdraw invite to novi@papirko.rs').click();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Withdraw invite to novi@papirko.rs"]'));
    await shot(page, 'm-admin-team');
  });

  await flow('m-admin profile + notifications: rename; a switch flips', async (page) => {
    await login(page, 'nikola@cafelipa.rs');
    await text(page, 'All products');
    await tab(page, 'Account');
    await row(page, 'Profile');
    await path(page, /^\/buyer\/profile$/);
    await fill(page, 'Your name', 'Nikola Đ.');
    await button(page, 'Save profile');
    await text(page, 'Profile saved.');
    await page.goBack();
    await text(page, 'Nikola Đ.'); // the Account tab reads the refreshed session
    await row(page, 'Notifications');
    await path(page, /^\/buyer\/notifications$/);
    const sw = '[aria-label="New message on an order by email"]';
    await page.waitForSelector(sw);
    const before = await page.$eval(sw, (e) => e.checked ?? e.getAttribute('aria-checked') === 'true');
    await page.locator(sw).click();
    await page.waitForFunction((sw, before) => (document.querySelector(sw)?.checked ?? null) !== before, {}, sw, before);
    await shot(page, 'm-admin-notifications');
  });

  await flow('m-admin company + subscription: stock tracking on; plan request is waiting', async (page) => {
    await login(page, 'ivan@cleanpro.rs');
    await path(page, /^\/vendor\/?$/);
    await tab(page, 'Account');
    await row(page, 'Company');
    await path(page, /^\/vendor\/company$/);
    await page.locator('[aria-label="Track stock"]').click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Track stock"]')?.checked === true);
    await page.goBack();
    await row(page, 'Subscription & billing');
    await path(page, /^\/vendor\/plan$/);
    await text(page, 'Your request for Growth is waiting for review');
    await shot(page, 'm-admin-plan');
  });

  await flow('m-admin: the Platform Admin is web-only — mobile explains and offers log out', async (page) => {
    await login(page, 'admin@narudzbine.rs');
    await text(page, 'The admin panel is only in the web app');
    await page.locator('[role=button] ::-p-text(Log out)').click();
    await path(page, /^\/login$/);
    if ((await page.evaluate(() => document.body.innerText)).includes('admin@narudzbine.rs')) throw new Error('admin demo account listed on mobile');
  });
}
