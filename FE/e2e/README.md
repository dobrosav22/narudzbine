# e2e

Real-browser flow tests for both apps, driven by `puppeteer-core` against an
installed Chrome (set `CHROME_PATH` if it isn't at the Windows default). They
assume **mocks ON** and a fresh seed, so run them against a fresh server.

```sh
# web (Next.js production build)
pnpm --filter web build
pnpm --filter web exec next start -p 3103 &
pnpm --filter e2e web                       # BASE=http://localhost:3103 by default

# mobile (Expo web export of apps/mobile — same screens, rendered by react-native-web)
cd apps/mobile && npx expo export -p web --output-dir ../../e2e/.mobile-web && cd ../..
node e2e/serve-static.mjs e2e/.mobile-web 3200 &
pnpm --filter e2e mobile                    # BASE=http://localhost:3200 by default
```

`SHOTS=<dir>` saves screenshots (and a screenshot of any failing flow).

The mobile suite runs the Expo **web** export, not a device. It covers routing,
guards, session and forms, but not native-only behaviour (SecureStore, fonts on
Android, Hermes `Intl`).

Writing flows or ad-hoc debug scripts:
- Always use an incognito context (`browser.createBrowserContext()`, as `flow()`
  does). In Chrome's default profile a password-manager bubble after login
  silently swallows all mouse input, even across reloads.
- The mock DB lives in the tab's memory: `login()` (a `page.goto`) resets it. To
  hand off between users mid-flow, log out and type into the already-open login
  form (`switchUser` in `web-merch.part.mjs`).
- Flows assert English text. Headless Chrome reports `en-US`, so a guest sees
  English, and the seeded users the flows log in as have `preferredLocale: 'en'`.
  The Serbian UI is covered by the `*-i18n.part.mjs` flows (a guest switching
  language, and `stefan@aurora-hotels.rs`, whose UI is Serbian). If you log in
  as a Serbian-locale user (Stefan, Jovana, Ana), expect Serbian labels,
  including aria-labels.
