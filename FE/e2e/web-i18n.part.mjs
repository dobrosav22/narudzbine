// Bilingual UI (01 §12 / 05 §6): guest language on the auth pages, per-user preferredLocale,
// switching on Profile. User content stays as written; numbers keep the regional format.
export async function i18nFlows({ flow, BASE, text, url, login, shot }) {
  const pickLanguage = async (page, current, next) => {
    await page.locator(`[aria-label="${current}"]`).click();
    await page.locator(`[role=option] ::-p-text(${next})`).click();
  };
  // Same-tab user switch (login() reloads, which resets the in-memory mock DB).
  const switchUser = async (page, menuLabel, logOutLabel, email) => {
    await page.locator(`[aria-label="${menuLabel}"]`).click();
    await page.locator(`[role=menuitem] ::-p-text(${logOutLabel})`).click();
    await url(page, /^\/login/);
    for (let last = ''; ; ) {
      const now = await page.evaluate(() => location.href);
      if (now === last) break;
      last = now;
      await new Promise((res) => setTimeout(res, 400));
    }
    await page.waitForSelector('#email');
    await page.$eval('#email', (e) => (e.value = ''));
    await page.type('#email', email);
    await page.$eval('#password', (e) => (e.value = ''));
    await page.type('#password', 'demo');
    await page.keyboard.press('Enter');
  };

  await flow('i18n: a guest switches the login page to Srpski; it sticks after a reload', async (page) => {
    await page.goto(`${BASE}/login`);
    await text(page, 'Order from your suppliers');
    await pickLanguage(page, 'Language', 'Srpski');
    await text(page, 'Naručujte od svojih dobavljača');
    if ((await page.evaluate(() => document.documentElement.lang)) !== 'sr-Latn') throw new Error('html lang not updated');
    await page.reload();
    await text(page, 'Naručujte od svojih dobavljača');
    await shot(page, 'i18n-login-sr');
    await pickLanguage(page, 'Jezik', 'English');
    await text(page, 'Order from your suppliers');
  });

  await flow('i18n: Stefan works in Serbian; switching to English on Profile is saved on his login', async (page) => {
    await login(page, 'stefan@aurora-hotels.rs');
    await url(page, /^\/buyer\/?$/);
    await text(page, 'Svi proizvodi');
    await text(page, 'Korpa');
    // Money keeps the regional (bs-BA) format whatever the UI language.
    await text(page, ' KM');
    await shot(page, 'i18n-buyer-sr');
    // CleanPro named its own statuses, so they stay exactly as written (vendor content isn't translated).
    await page.goto(`${BASE}/buyer/orders`);
    await text(page, 'Dobavljač: CleanPro Chemicals');
    await text(page, 'Received');
    await page.goto(`${BASE}/buyer/account`);
    await text(page, 'Sačuvaj profil');
    await pickLanguage(page, 'Jezik', 'English');
    await text(page, 'Save profile');
    // Back in via the same tab (the mock DB lives in memory): the choice came with the login.
    await switchUser(page, 'Account menu', 'Log out', 'stefan@aurora-hotels.rs');
    await url(page, /^\/buyer\/?$/);
    await text(page, 'All products');
  });

  await flow('i18n: a new vendor registers in the language on screen', async (page) => {
    await page.goto(`${BASE}/register`);
    await pickLanguage(page, 'Language', 'Srpski');
    await text(page, 'Otvorite nalog dobavljača');
    await page.type('#orgName', 'Test Srpski d.o.o.');
    await page.type('#name', 'Jelena Test');
    await page.type('#email', 'jelena@test-srpski.rs');
    await page.type('#password', 'demodemo');
    await page.locator('button[type=submit]').click();
    await url(page, /^\/vendor\/catalogue$/);
    // Signed in, the account's preferredLocale decides (it wins over the guest choice) — so
    // Serbian here means the new account was saved as sr-Latn.
    await text(page, 'Još nema proizvoda');
  });

  await flow('i18n: the Platform Admin switches language from the user menu', async (page) => {
    await login(page, 'admin@narudzbine.rs');
    await url(page, /^\/admin\/?$/);
    await text(page, 'Every vendor and buyer on Narudžbine');
    await page.locator('[aria-label="Account menu"]').click();
    await page.locator('[role=menuitem] ::-p-text(Language)').click();
    await page.locator('[role=menuitemradio] ::-p-text(Srpski)').click();
    await text(page, 'Svi dobavljači i kupci na Narudžbinama');
    await shot(page, 'i18n-admin-sr');
  });
}
