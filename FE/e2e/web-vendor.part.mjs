// Phase 5 — vendor orders, status changes, status settings, buyers (web).
export async function vendorFlows({ flow, BASE, text, url, login, shot }) {
  const pickSelect = async (page, triggerLabel, option) => {
    await page.locator(`[aria-label="${triggerLabel}"]`).click();
    await page.locator(`[role=option] ::-p-text("${option}")`).click();
    await page.waitForSelector('[role=listbox]', { hidden: true });
  };
  const rowsText = (page) => page.$$eval('tbody tr', (rows) => rows.map((r) => r.innerText));
  // In-tab login (no page load) — the mock DB lives in the tab, so a reload would reset it.
  const loginInTab = async (page, email) => {
    await page.waitForSelector('#email');
    await page.$eval('#email', (e) => (e.value = ''));
    await page.type('#email', email);
    await page.type('#password', 'demo');
    await page.locator('button[type=submit]').click();
  };

  await flow('v-orders: open-orders and buyer filters', async (page) => {
    await login(page, 'marko@papirko.rs');
    await page.locator('a[href="/vendor/orders"]').click();
    await url(page, /^\/vendor\/orders$/);
    await page.waitForSelector('tbody tr');
    await pickSelect(page, 'Filter by status', 'Open orders');
    await page.waitForFunction(() => [...document.querySelectorAll('tbody tr')].every((r) => /Placed|Confirmed/.test(r.innerText)));
    await pickSelect(page, 'Filter by status', 'All statuses');
    await pickSelect(page, 'Filter by buyer', 'Café Lipa');
    await page.waitForFunction(() => {
      const rows = [...document.querySelectorAll('tbody tr')];
      return rows.length > 0 && rows.every((r) => r.innerText.includes('Café Lipa'));
    });
    await shot(page, 'vendor-orders');
  });

  await flow('v-loop: vendor advances status + replies → buyer sees both', async (page) => {
    await login(page, 'marko@papirko.rs');
    await page.locator('a[href="/vendor/orders"]').click();
    await page.waitForSelector('tbody tr');
    await pickSelect(page, 'Filter by buyer', 'Hotel Aurora Group');
    await pickSelect(page, 'Filter by status', 'Placed');
    await page.waitForSelector('tbody tr a');
    const number = await page.$eval('tbody tr a', (a) => a.textContent);
    await page.locator('tbody tr a').click();
    await url(page, /^\/vendor\/orders\/ord_/);
    await page.locator('button ::-p-text(Mark as Confirmed)').click();
    await text(page, `Order ${number} is now “Confirmed”`);
    await page.locator('#order-message').fill('Confirmed — on tomorrow’s truck.');
    await page.keyboard.press('Enter');
    await text(page, 'Confirmed — on tomorrow’s truck.');
    await shot(page, 'vendor-order-detail');
    // Log out and in as the buyer without reloading the tab.
    await page.locator('[aria-label="Account menu"]').click();
    await page.locator('::-p-text(Log out)').click();
    await url(page, /^\/login/);
    await loginInTab(page, 'milica@aurora-hotels.rs');
    await page.waitForSelector('[aria-label="Switch vendor"]');
    await page.waitForFunction(() => document.querySelector('h1')?.textContent);
    if ((await page.$eval('h1', (h) => h.textContent)) !== 'Papirko Wholesale') {
      await page.locator('[aria-label="Switch vendor"]').click();
      await page.locator('[role=menuitemradio] ::-p-text("Papirko Wholesale")').click();
      await page.waitForSelector('[role=menu]', { hidden: true });
    }
    await text(page, 'Your most ordered');
    await page.locator('a[href="/buyer/orders"]').click();
    await page.locator(`tbody a ::-p-text(${number})`).click();
    await text(page, 'Confirmed — on tomorrow’s truck.');
    await page.waitForFunction(() => document.querySelector('[aria-current="step"]')?.innerText.includes('Confirmed'));
  });

  await flow('v-cancel: confirm dialog, then the tracker shows cancelled', async (page) => {
    await login(page, 'marko@papirko.rs');
    await page.locator('a[href="/vendor/orders"]').click();
    await page.waitForSelector('tbody tr');
    await pickSelect(page, 'Filter by status', 'Open orders');
    await page.waitForSelector('tbody tr a');
    await page.locator('tbody tr a').click();
    await page.locator('button ::-p-text(Cancel order)').click();
    await text(page, 'will see it as “Cancelled”');
    await page.locator('[role=alertdialog] button ::-p-text(Cancel order)').click();
    await text(page, 'is now “Cancelled”');
    await text(page, "This order won't be delivered");
  });

  await flow('v-settings: add a status, rules block bad lists, in-use status can’t be removed', async (page) => {
    await login(page, 'ivan@cleanpro.rs');
    await page.locator('a[href="/vendor/settings"]').click();
    await url(page, /^\/vendor\/settings$/);
    // Phase 7: Settings opens on Company; order statuses are their own section.
    await page.locator('nav[aria-label="Settings sections"] a[href="/vendor/settings/statuses"]').click();
    await url(page, /^\/vendor\/settings\/statuses$/);
    await page.waitForSelector('#new-status');
    await page.type('#new-status', 'Packed');
    await page.keyboard.press('Enter');
    const names = await page.$$eval('[aria-label^="Name of status"]', (els) => els.map((e) => e.value));
    if (names.join(',') !== 'Received,Picking,Out for delivery,Packed,Delivered,Cancelled') throw new Error(`order: ${names}`);
    // Unticking the cancelled status breaks a rule → Save disabled.
    await page.locator('[aria-label="Cancelled means cancelled"]').click();
    await text(page, 'Keep a cancelled status');
    if (!(await page.$eval('button ::-p-text(Save statuses)', (b) => b.disabled))) throw new Error('save enabled with problems');
    await page.locator('[aria-label="Cancelled means cancelled"]').click();
    await page.locator('button ::-p-text(Save statuses)').click();
    await text(page, 'Order statuses saved');
    await shot(page, 'status-settings');
    // Picking is used by existing orders — only the service knows that.
    await page.locator('[aria-label="Remove Picking"]').click();
    await page.locator('button ::-p-text(Save statuses)').click();
    await text(page, 'Existing orders still use: picking');
  });

  await flow('v-buyers: list, invite (link shown), conflict; at 5 buyers Invite is disabled (v1.1)', async (page) => {
    await login(page, 'ivan@cleanpro.rs'); // Starter: max 5 buyers; Aurora (active) + Lipa (invited) = 2
    await page.locator('a[href="/vendor/buyers"]').click();
    await url(page, /^\/vendor\/buyers$/);
    await text(page, '2 of 5 buyers on Starter');
    await page.waitForSelector('tbody tr'); // usage can arrive before the table
    const rows = await rowsText(page);
    if (!rows[0].includes('Hotel Aurora Group') || !rows[0].includes('Connected')) throw new Error(`first row: ${rows[0]}`);
    const invite = async (email) => {
      await page.locator('button ::-p-text(Invite buyer)').click();
      await page.waitForSelector('#invite-email');
      await page.type('#invite-email', email);
      await page.locator('[role=dialog] button[type=submit]').click();
    };
    await invite('milica@aurora-hotels.rs');
    await text(page, 'already connected');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role=dialog]', { hidden: true });
    for (const email of ['a@novi.ba', 'b@novi.ba', 'c@novi.ba']) {
      await invite(email);
      await text(page, `We've invited ${email}`);
      if (email === 'a@novi.ba') await shot(page, 'invite-sent');
      await page.locator('[role=dialog] button ::-p-text(Done)').click();
      await page.waitForSelector('[role=dialog]', { hidden: true });
    }
    await text(page, '5 of 5 buyers on Starter');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Invite buyer') && b.disabled));
    await text(page, "You've reached your plan's buyer limit");
  });

  await flow('v-buyer detail: negotiated prices + orders; disconnect', async (page) => {
    await login(page, 'marko@papirko.rs');
    await page.locator('a[href="/vendor/buyers"]').click();
    await page.locator('tbody a ::-p-text(Hotel Aurora Group)').click();
    await url(page, /^\/vendor\/buyers\/bo_aurora$/);
    await text(page, 'Negotiated prices');
    await text(page, 'Foam hand soap, 5 L');
    await text(page, '19,90 KM');
    await shot(page, 'buyer-detail');
    await page.locator('button ::-p-text(Disconnect)').click();
    await page.locator('[role=alertdialog] button ::-p-text(Disconnect)').click();
    await url(page, /^\/vendor\/buyers$/);
    await text(page, 'Disconnected Hotel Aurora Group');
    await page.waitForFunction(() => ![...document.querySelectorAll('tbody tr')].some((r) => r.innerText.includes('Hotel Aurora Group')));
  });
}
