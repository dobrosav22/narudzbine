# FE — B2B ordering frontend

pnpm workspaces + Turborepo. Web and mobile clients for the Narudžbine backend (`../BE`), integrated with the real API — there is no mock mode. Start with [INTEGRATION_GUIDE.md](integration-guide.md); known backend gaps are in [BACKEND_GAPS.md](backend-gaps.md).

```
apps/web        Next.js 16 + shadcn/ui — vendor, buyer and platform-admin consoles (browser cookie + CSRF session)
apps/mobile     Expo SDK 57 + expo-router + NativeWind — vendor and buyer apps (bearer session in SecureStore)
packages/core   typed API client generated from ../openapi.yaml, session store, formatting, i18n, query factories
packages/ui     design tokens (tokens.cjs) + the Tailwind preset both apps extend
e2e             browser checks against the local backend (see e2e/README.md)
```

```sh
pnpm install
pnpm typecheck && pnpm lint && pnpm test   # test = core unit tests + translation parity
pnpm --filter @repo/core gen:api           # after openapi.yaml changes: regenerate the typed client
pnpm --filter web build
```

## Configuration

| App | Variable | Meaning |
|---|---|---|
| web | `NEXT_PUBLIC_API_BASE_URL` | Backend base incl. `/api/v1`. Must be https on the same site as the web origin (SameSite cookies), and the web origin must be in the backend's `identity.http.origins`. |
| web | `NEXT_PUBLIC_EXTERNAL_LOGIN_PROVIDERS` | Optional: narrows the Google/Apple sign-in buttons. |
| mobile | `EXPO_PUBLIC_API_BASE_URL` | Absolute backend base incl. `/api/v1`. |
| mobile | `EXPO_PUBLIC_EXTERNAL_AUTH_RETURN_URL` | Optional: the app link for native Google/Apple sign-in; unset hides those buttons. |

Each app has a `.env.example`. Real hosts are external inputs (X-02); `eas.json` carries `.invalid` placeholders.

## Local development against the backend

```sh
# Backend: pinned JDK 25 in ../.tools, Docker running (see ../BE/operations/README.md)
LOCAL_SYNTHETIC_SERVE_SECONDS=28800 LOCAL_SYNTHETIC_API_PORT=18080 \
LOCAL_SYNTHETIC_BROWSER_ORIGINS=https://localhost:3000 \
python ../BE/operations/local_development.py serve

pnpm dev:cert                 # once: self-signed localhost certificate (gitignored)
pnpm dev:api-proxy            # https://localhost:18443 → backend (browser transport)
pnpm dev:web                  # https://localhost:3000
pnpm dev:api-proxy:native     # https://localhost:18444 (Expo web preview, native transport)
pnpm dev:mobile               # set EXPO_PUBLIC_API_BASE_URL first (Android emulator: http://10.0.2.2:18080/api/v1)
```

The backend's READY line lists synthetic vendor/buyer/admin accounts for both countries (fixed synthetic test password, never a real credential); `node e2e/seed.mjs <ready.json>` adds realistic demo data. New organizations are created only by a platform admin's setup invitation — there is no self-serve signup.

## Languages and regions

UI resources: English and Serbian Latin (`packages/core/i18n/messages/<language>/<namespace>.json`, ICU). Accounts can choose `en`, `sr-Latn-RS` or `bs-Latn-BA`; Bosnian currently renders with the Serbian Latin resources (see BACKEND_GAPS U-1/§7). Money, numbers and dates follow the organization's country (RS: RSD, Europe/Belgrade; BA: BAM, Europe/Sarajevo); all prices are net, excluding VAT.

## Android builds

`apps/mobile/eas.json`: `preview` builds an installable APK, `production` an AAB. Both need a real `EXPO_PUBLIC_API_BASE_URL` (replace the `.invalid` placeholders) and the real Android package id in `app.json` (`rs.narudzbine.app` is a placeholder and can't change after release). Store releases need separate approval.
