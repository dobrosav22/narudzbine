// Phase 7 — locations, team, company settings, plan, account profile, notifications (web).
export async function adminFlows({ flow, text, url, login, shot }) {
  const nav = (page, href) => page.locator(`[data-sidebar=menu] a[href="${href}"]`).click();
  const section = async (page, label, href) => {
    await page.locator(`nav[aria-label="${label}"] a[href="${href}"]`).click();
    await url(page, new RegExp(`^${href.replace(/\//g, '\\/')}$`));
  };
  const menu = async (page, item) => {
    await page.locator('[aria-label="Account menu"]').click();
    await page.locator(`[role=menuitem] ::-p-text(${item})`).click();
    await page.waitForFunction(() => !document.querySelector('[role=menu]'));
  };
  const toast = (page, t) => text(page, t);
  const dialogGone = (page) => page.waitForFunction(() => !document.querySelector('[role=dialog], [role=alertdialog]'));
  // Same-tab user switch: login() reloads, which resets the in-memory mock DB.
  const switchUser = async (page, email, password = 'demo') => {
    await menu(page, 'Log out');
    await url(page, /^\/login/);
    await page.waitForSelector('#email');
    await page.$eval('#email', (e) => (e.value = ''));
    await page.type('#email', email);
    await page.type('#password', password);
    await page.locator('button[type=submit]').click();
  };

  await flow('admin locations: add, edit, delete a warehouse', async (page) => {
    await login(page, 'marko@papirko.rs');
    await nav(page, '/vendor/locations');
    await url(page, /^\/vendor\/locations$/);
    await page.waitForSelector('table[aria-label="Warehouses"] tbody tr');
    await text(page, '2 warehouses');
    await page.locator('button ::-p-text(Add warehouse)').click();
    await page.locator('[role=dialog] button[type=submit]').click();
    await text(page, 'Give the location a name');
    await page.locator('#location-name').fill('Zemun depot');
    await page.locator('#location-address').fill('Prvomajska 3, Zemun');
    await page.locator('[role=dialog] button[type=submit]').click();
    await toast(page, 'Added Zemun depot');
    await dialogGone(page);
    await text(page, '3 warehouses');
    await page.locator('[aria-label="Actions for Zemun depot"]').click();
    await page.locator('[role=menuitem] ::-p-text(Edit)').click();
    await page.locator('#location-name').fill('Zemun depot 2');
    await page.locator('[role=dialog] button[type=submit]').click();
    await toast(page, 'Saved Zemun depot 2');
    await dialogGone(page);
    await shot(page, 'admin-locations');
    await page.locator('[aria-label="Actions for Zemun depot 2"]').click();
    await page.locator('[role=menuitem] ::-p-text(Delete)').click();
    await page.locator('[role=alertdialog] button ::-p-text(Delete)').click();
    await toast(page, 'Deleted Zemun depot 2');
    await text(page, '2 warehouses');
  });

  await flow('admin team (buyer settings): invite → withdraw; remove a teammate; not yourself', async (page) => {
    await login(page, 'milica@aurora-hotels.rs');
    await nav(page, '/buyer/settings');
    await url(page, /^\/buyer\/settings$/);
    await section(page, 'Settings sections', '/buyer/settings/team');
    await page.waitForSelector('table[aria-label="Team members"] tbody tr');
    await page.waitForSelector('[aria-label^="Can\'t remove Milica"]');
    await text(page, 'luka@aurora-hotels.rs'); // seeded pending invite
    await page.locator('button ::-p-text(Invite teammate)').click();
    await page.locator('#team-invite-email').fill('stefan@aurora-hotels.rs');
    await page.locator('[role=dialog] button[type=submit]').click();
    await text(page, 'This person is already on your team');
    await page.locator('#team-invite-email').fill('mina@aurora-hotels.rs');
    await page.locator('[role=dialog] button[type=submit]').click();
    await text(page, "We've invited mina@aurora-hotels.rs");
    await text(page, 'Invite link');
    await page.locator('[role=dialog] button ::-p-text(Done)').click();
    await dialogGone(page);
    await page.waitForFunction(() => document.querySelector('[aria-label="Pending invites"]')?.innerText.includes('mina@aurora-hotels.rs'));
    await page.locator('[aria-label="Withdraw invite to mina@aurora-hotels.rs"]').click();
    await toast(page, 'Withdrew the invite to mina@aurora-hotels.rs');
    await page.waitForFunction(() => !document.querySelector('[aria-label="Pending invites"]')?.innerText.includes('mina@'));
    await page.locator('[aria-label="Remove Jovana Marković"]').click();
    await page.locator('[role=alertdialog] button ::-p-text(Remove)').click();
    await toast(page, 'Removed Jovana Marković');
    await page.waitForFunction(() => !document.querySelector('table[aria-label="Team members"]')?.innerText.includes('Jovana'));
    await shot(page, 'admin-team');
  });

  await flow('admin company: rename shows in the shell; turning on stock tracking lights up low stock', async (page) => {
    await login(page, 'ivan@cleanpro.rs');
    await nav(page, '/vendor/settings');
    await url(page, /^\/vendor\/settings$/);
    await page.waitForSelector('#company-name');
    await page.locator('#company-name').fill('CleanPro Chemicals d.o.o.');
    await page.locator('button[form=company-form]').click();
    await toast(page, 'Company name saved');
    await page.waitForFunction(() => document.querySelector('[aria-label="Account menu"]')?.innerText.includes('CleanPro Chemicals d.o.o.'));
    await page.locator('#tracks-inventory').click();
    await toast(page, 'Inventory tracking is on');
    await nav(page, '/vendor');
    await url(page, /^\/vendor$/);
    await page.waitForSelector('[aria-label="Low stock products"]'); // every product starts at 0
    await text(page, 'Out of stock');
  });

  await flow('subscription (v1.1): no self-serve change — request a plan; smaller plan warns; one pending at a time', async (page) => {
    await login(page, 'marko@papirko.rs');
    await nav(page, '/vendor/settings');
    await section(page, 'Settings sections', '/vendor/settings/plan');
    await text(page, 'Declined'); // seeded history: a dismissed Pro request
    await page.locator('[aria-label="Starter plan"] button').click();
    await text(page, "You'd be over this plan's limits");
    await text(page, 'You have 17 products; Starter allows 10.');
    await page.locator('[role=dialog] button ::-p-text(Cancel)').click();
    await dialogGone(page);
    await page.locator('button ::-p-text(Request Pro)').click();
    await page.locator('#upgrade-note').fill('Adding a hospital line next quarter.');
    await page.locator('[role=dialog] button[type=submit]').click();
    await toast(page, 'Request for Pro sent');
    await dialogGone(page);
    await text(page, 'Your request for Pro is waiting for review');
    await page.waitForFunction(() => document.querySelector('[aria-label="Growth plan"]')?.innerText.includes('Current')); // unchanged
    if (!(await page.$eval('[aria-label="Starter plan"] button', (b) => b.disabled))) throw new Error('second request allowed');
    await text(page, 'Waiting for review');
    await shot(page, 'admin-plan');
  });

  await flow('admin account: rename, wrong current password, change it and log in with the new one', async (page) => {
    await login(page, 'nikola@cafelipa.rs');
    await menu(page, 'Profile');
    await url(page, /^\/buyer\/account$/);
    await page.locator('#profile-name').fill('Nikola Đ.');
    await page.locator('button[form=profile-form]').click();
    await toast(page, 'Profile saved');
    await page.waitForFunction(() => document.querySelector('[aria-label="Account menu"]')?.innerText.includes('Nikola Đ.'));
    await page.locator('#password-current').fill('nope');
    await page.locator('#password-new').fill('secret1');
    await page.locator('#password-confirm').fill('secret2');
    // Submit with Enter: the "Profile saved" toast sits right over the Change password button.
    const submitPasswords = async () => {
      await page.focus('#password-confirm');
      await page.keyboard.press('Enter');
    };
    await submitPasswords();
    await text(page, "The passwords don't match");
    await page.locator('#password-confirm').fill('secret1');
    await submitPasswords();
    await text(page, 'Your current password is incorrect');
    await page.locator('#password-current').fill('demo');
    await submitPasswords();
    await toast(page, 'Password changed');
    await switchUser(page, 'nikola@cafelipa.rs', 'secret1');
    await url(page, /^\/buyer$/);
    await page.waitForFunction(() => document.querySelector('[aria-label="Account menu"]')?.innerText.includes('Nikola Đ.'));
  });

  await flow('admin notifications: a toggle persists; low stock is off without tracking', async (page) => {
    await login(page, 'ivan@cleanpro.rs');
    await menu(page, 'Notifications');
    await url(page, /^\/vendor\/account\/notifications$/);
    await page.waitForSelector('table[aria-label="Notification preferences"]');
    if (!(await page.$eval('[aria-label="Low stock alert by push"]', (b) => b.disabled))) throw new Error('low stock enabled without tracking');
    await text(page, 'Turn on inventory tracking');
    const sw = '[aria-label="New order placed by email"]';
    await page.waitForFunction((sw) => document.querySelector(sw)?.getAttribute('aria-checked') === 'true', {}, sw);
    await page.locator(sw).click();
    await page.waitForFunction((sw) => document.querySelector(sw)?.getAttribute('aria-checked') === 'false', {}, sw);
    await section(page, 'Account sections', '/vendor/account');
    await section(page, 'Account sections', '/vendor/account/notifications');
    await page.waitForFunction((sw) => document.querySelector(sw)?.getAttribute('aria-checked') === 'false', {}, sw);
    await shot(page, 'admin-notifications');
  });
}
