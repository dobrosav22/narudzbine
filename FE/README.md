# FE — B2B ordering frontend

pnpm workspaces + Turborepo. Planning docs live in `../docs`, decisions since then in `BUILD_LOG.md`.

```
apps/web        Next.js 16 + shadcn/ui (Radix, Zinc + violet)
apps/mobile     Expo SDK 57 + expo-router + NativeWind (APK via `eas build -p android`)
packages/core   types · service interfaces · mocks · services/real stubs · pricing · serviceProvider
packages/ui     design tokens (tokens.cjs) + the Tailwind preset both apps extend
e2e             browser flow tests for both apps (see e2e/README.md)
```

```sh
pnpm install
pnpm dev:web              # http://localhost:3000
pnpm dev:mobile           # Expo dev server
pnpm typecheck && pnpm lint && pnpm test
pnpm verify:real-stubs    # proves USE_MOCKS=false fails loudly for every unimplemented service
```

Env (each app has a `.env.example`; web uses `NEXT_PUBLIC_*`, mobile `EXPO_PUBLIC_*`):
- `USE_MOCKS` — on by default; `false` routes calls to the real services.
- `CURRENCY` — ISO 4217 code for all prices, default `BAM`.
- `LOCALE` — number/money/date formatting, default `bs-BA` ("19,60 KM"). This is the regional format and is the
  same in both UI languages.

UI language: English and Serbian (Latin), from the shared `packages/core/i18n/en.json` and `sr-Latn.json` (ICU
messages; next-intl on web, i18next on mobile). It's each user's `preferredLocale`, switched under
Account → Profile (web) or the Account tab (mobile). Before login it follows the browser or device language, and the
language picker on the login screen overrides that. Add a string to both files; `pnpm test` fails if the two files
drift apart.

Demo logins (mocks only, password `demo`; also listed on the login screen): `marko@papirko.rs`, `ivan@cleanpro.rs`,
`milica@aurora-hotels.rs`, `nikola@cafelipa.rs`, `stefan@aurora-hotels.rs` (a buyer whose UI is in Serbian), and the Platform Admin `admin@narudzbine.rs` (web only, `/admin`) —
full list in `packages/core/mocks/seed.ts`. Subscription tiers live in `packages/core/config/subscriptionTiers.ts`.

## Android APK

Build profiles live in `apps/mobile/eas.json`:

| Profile | Output | Data |
|---|---|---|
| `preview` | installable `.apk`, shared by link (internal distribution) | mocks **on** — a self-contained demo |
| `production` | `.aab` for Google Play | mocks **off** — needs the real backend |

**Before sharing any build, set the real Android package id** (`expo.android.package` in `apps/mobile/app.json`, currently the placeholder `rs.narudzbine.app`). Once installed on phones or uploaded to Play, it can't be changed.

Cloud build (needs a free Expo account):

```sh
npm install -g eas-cli
cd apps/mobile
eas login
eas init                                      # first time only: links the project to your Expo account
eas build -p android --profile preview        # prints a download link / QR code for the APK
```

Local build (no Expo account, but needs Android Studio / the Android SDK and **JDK 17**):

```sh
cd apps/mobile
npx expo prebuild -p android                  # generates android/ (not committed)
cd android && ./gradlew assembleRelease       # APK in android/app/build/outputs/apk/release/
```

The preview APK's mock data resets every time the app restarts, same as a browser reload on web.
