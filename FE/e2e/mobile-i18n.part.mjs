// Bilingual UI on mobile (01 §12 / 05 §6): guest language on the login screen, per-user
// preferredLocale, switching from the Account tab. Headless Chrome reports "en-US", so the
// device language is English unless a flow picks otherwise.
export async function i18nFlows({ flow, BASE, text, path, fill, login, shot }) {
  const radio = (page, label) => page.locator(`[role=radio] ::-p-text(${label})`).click();

  await flow('m-i18n: a guest switches the login screen to Srpski; it sticks after a reload', async (page) => {
    await page.goto(`${BASE}/login`);
    await text(page, 'Order from your suppliers');
    await radio(page, 'Srpski');
    await text(page, 'Naručujte od svojih dobavljača');
    await page.reload();
    await text(page, 'Naručujte od svojih dobavljača');
    await shot(page, 'm-i18n-login-sr');
    await radio(page, 'English');
    await text(page, 'Order from your suppliers');
  });

  await flow('m-i18n: Stefan works in Serbian; switching to English in Account is saved on his login', async (page) => {
    await login(page, 'stefan@aurora-hotels.rs');
    await text(page, 'Svi proizvodi');
    await text(page, 'Korpa');
    await text(page, ' KM'); // money keeps the regional format
    await shot(page, 'm-i18n-buyer-sr');
    await page.locator('[role=tab] ::-p-text(Nalog)').click();
    await text(page, 'JEZIK'); // section titles are CSS-uppercased
    // The Home tab stays mounted underneath: click the last (visible) match.
    await (await page.$$('[role=radio] ::-p-text(English)')).at(-1).click();
    await text(page, 'Log out');
    // Log out and back in within the tab (a reload would reset the in-memory mock DB).
    await (await page.$$('[role=button] ::-p-text(Log out)')).at(-1).click();
    await path(page, /^\/login$/);
    await fill(page, 'Email', 'stefan@aurora-hotels.rs');
    await fill(page, 'Password', 'demo');
    await page.locator('[role=button] ::-p-text(Log in)').click();
    await text(page, 'All products');
  });

  await flow('m-i18n: Ana (vendor, Serbian) sees the starter statuses in Serbian', async (page) => {
    await login(page, 'ana@papirko.rs');
    await text(page, 'Prihod · 30 dana');
    await page.locator('[role=tab] ::-p-text(Narudžbine)').click();
    // Papirko kept the starter statuses, so they're system text: "Placed" reads "Primljena".
    await text(page, 'Primljena');
  });
}
