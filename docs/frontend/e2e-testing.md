# e2e

Browser checks of both apps against the **local synthetic backend** — real HTTP, real sessions, no mocks. Driven by `puppeteer-core` with an installed Chrome (set `CHROME_PATH` if it isn't at the Windows default).

| Script | What it does |
|---|---|
| `seed.mjs <ready.json>` | Adds demo data through the public API: taxonomy, 12 priced products per country, a promotion, an agreed price, order stages, favorites, a draft and orders in every lifecycle state. |
| `screens.mjs <ready.json>` | Logs in as vendor, buyer and platform admin and opens every web route (plus public pages); reports page errors, console errors, failed API calls and error alerts. Read-only. `ONLY=/stats` limits the routes, `SHOTS=<dir>` saves screenshots. |
| `flows.mjs <ready.json>` | Clicks through the core workflow and confirms each result through the API: create + activate a product → add to cart → review → place order → messages both ways → accept → dispatch → deliver → save a shared draft. |
| `mobile-screens.mjs <ready.json>` | Opens the main mobile screens of the Expo web export with the native bearer transport. |
| `browser-transport-check.mjs` | Low-level check of the browser cookie/CSRF session contract. |
| `api-proxy.mjs [--native]` | Local HTTPS front for the backend (see below). |

`<ready.json>` is the `SYNTHETIC_DEVELOPMENT_READY` line printed by the backend runner (synthetic emails and ids; the fixed synthetic password is a test fixture, never a real credential).

## Running

```sh
# 1. Backend (pinned JDK in ../../.tools, Docker running); keep the READY line in a file
LOCAL_SYNTHETIC_SERVE_SECONDS=28800 LOCAL_SYNTHETIC_API_PORT=18080 \
LOCAL_SYNTHETIC_BROWSER_ORIGINS=https://localhost:3000,https://localhost:3103 \
python ../../BE/operations/local_development.py serve        # → ready.json

# 2. HTTPS proxies (once: pnpm dev:cert)
node e2e/api-proxy.mjs              # https://localhost:18443 — browser transport (web)
node e2e/api-proxy.mjs --native     # https://localhost:18444 — native transport (Expo web export)

# 3. Apps
pnpm dev:web                         # https://localhost:3000
cd apps/mobile && EXPO_PUBLIC_API_BASE_URL=https://localhost:18444/api/v1 npx expo export -p web --output-dir ../../e2e/.mobile-web
node e2e/serve-static.mjs e2e/.mobile-web 3200

# 4. Checks
node e2e/seed.mjs ready.json
node e2e/screens.mjs ready.json
node e2e/flows.mjs ready.json
node e2e/mobile-screens.mjs ready.json
```

## Backend limits the checks respect

- **Reads:** 120 per minute per account. The scripts pace page visits (`PACE_MS`, default 3000) and poll the API at most every 1.5 s.
- **Logins:** 30 browser logins per 15 minutes per source address, and 30 per account. Each script logs every role in once; restart the backend (fresh database) if repeated runs hit `Too many attempts`.
- **Reports:** one at a time per organization (parallel report reads get 503 under the organization lock); the apps queue them.

## Limits of these checks

- Email/push providers are off, so invitation, setup, reset and email-change links are not followed.
- Image processing and CSV exports don't complete in the local harness.
- The mobile check runs the web export, not a device: no SecureStore, Hermes `Intl` or push.
- Flows assert English labels: `flows.mjs` sets the RS test accounts' language to English first.
- `fixtures/` holds an image and a non-image file for manual upload checks.
