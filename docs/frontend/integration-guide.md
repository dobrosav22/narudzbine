# Frontend ↔ backend integration guide

Authority: the user's 2026-10-24 instruction ([D-GOV-007](../project/decisions.md#d-gov-007)) moved the frontend from mocks to the real backend. **[openapi.yaml](../../openapi.yaml) is the wire authority**; business rules are in [DESIGN_SPEC.md](../architecture/design-spec.md) and [REQUIREMENTS.md](../project/requirements.md); integration notes per endpoint are in [FRONTEND_HANDOFF.md](backend-handoff.md). The old mock layer, mock types and `services.*` are gone — never reintroduce mock data or invent fields the contract does not have. Missing backend capability goes into [BACKEND_GAPS.md](backend-gaps.md), not into fake client logic.

## Layout

```
packages/core            React-free, shared by both apps (consumed as TS source)
  api/schema.gen.ts      GENERATED from openapi.yaml (pnpm --filter @repo/core gen:api) — never edit
  api/models.gen.ts      GENERATED: one alias per schema (Product, Order, Offer, ...)
  api/client.ts          configureApi(), typed `api` (openapi-fetch), data(), download(), send()
  api/problem.ts         ApiError (RFC 9457), isApiError(e, 'CODE'), isUncertainOutcome()
  api/ids.ts             uuidv7() for client resource ids, uuidv4() for Idempotency-Key
  session/store.ts       createSessionStore: loading | signedOut | business | admin
  format.ts              formatMoney(amount, currency), formatDate(...) — country region
  i18n/                  messages/<language>/<namespace>.json, problemMsg(error)
  queries/<area>.ts      query keys + query option factories + mutation functions per area
apps/web                 Next.js 16, BROWSER transport (HttpOnly cookie + X-CSRF-Token)
apps/mobile              Expo, NATIVE transport (bearer in SecureStore)
```

## Calling the API

```ts
import { api, data, uuidv7, uuidv4, type Product } from '@repo/core';

const page = await data(api.GET('/catalogue/products', { params: { query: { size: 25, page: 0 } } }));
const created = await data(api.POST('/catalogue/products', { body: { id: uuidv7(), sku, name, /* ... */ } }));
await data(api.POST('/orders', { params: { header: { 'Idempotency-Key': key } }, body: { reviewId } }));
```

- Every non-2xx rejects with `ApiError` (`status`, `code`, `problem`, `fieldErrors`, `fieldCode('name')`). Network failures are `code === 'NETWORK_ERROR'`, status 0. Never parse `title`.
- Show errors with `useErrorText()(error)` (web `@/lib/i18n`, mobile `@/lib/i18n`) — it maps backend codes via `problems.codes.<CODE>`. Field errors: `fieldProblemMsg(error.fieldCode('name'))`. Field paths are JSON pointers (`/name`, `/lines/0/quantity`).
- CSRF, cookies, bearer and the base URL are handled by the client; screens never touch them.
- Binary/text payloads (image upload bytes, CSV import, export download): `send()` / `download()` return the raw `Response`.

## Contract rules screens must follow

- **Resource identity on create**: most creates take a client `id` (UUIDv7). Generate it once per *intent* (e.g. when the form opens) and reuse it on every retry of that same submission; a lost response then replays the original success (200) instead of duplicating. A new intent gets a new id.
- **Idempotency-Key (UUIDv4)** only for: direct order submission (`POST /orders`), stock deltas (`POST /inventory/products/{id}/adjustments`), new order messages, invitation resends. Keep the key with the pending intent; reuse it only to retry the *same* body after an uncertain outcome (`isUncertainOutcome(error)`); never auto-retry. A different body with the same key → 409 `IDEMPOTENCY_MISMATCH`.
- **Revisions**: edits send `expectedRevision` (opaque string from the last read; never decode). 409 `REVISION_CONFLICT` carries `problem.currentRevision`: keep the user's unsaved input, refetch, let them re-apply. Never silently merge or blindly resend with the new revision.
- **Money** is a decimal string (`"12.50"`); send strings, display with `formatMoney(amount, currency)`. Every price is `NET_EXCLUDING_VAT` — label it, never compute tax. Quantities are integers honouring `minimumQuantity`/`quantityStep`.
- **Strict inputs**: never send unknown fields or unsupported query params (422). Explicit `null` means clear; omission means keep — read each schema.
- **Pagination**: offset lists take `page`/`size` (≤100, default 25) and optional `includeTotal`; cursor lists (orders, messages, events, notifications, ...) take `cursor`/`size` and return `nextCursor`. Use `useInfiniteQuery` for cursor lists.
- **Timestamps** are UTC ISO with milliseconds; local calendar dates (`YYYY-MM-DD`) are country-local (Europe/Belgrade for RS, Europe/Sarajevo for BA) — use `localToday()`, `formatLocalDate()`.
- **No live carts on the backend**: the cart is local app state; drafts (`/drafts`) are organization-shared saved work with revisions. Order flow: `POST /order-reviews` → show the receipt → `POST /orders {reviewId}` with an Idempotency-Key. `TERMS_CHANGED` returns `currentTerms` (new receipt or null) + `unavailableLines`: show the changes and require explicit reconfirmation.
- **Counterparty people are anonymous**: show the partner organization, never another organization's employees.
- **Fixed roles** OWNER / ADMIN / STAFF; check `session.account.role` only to hide controls — the backend enforces authority on every call.
- **Guarded actions** return 403 `REAUTHENTICATION_REQUIRED`: wrap the call as `await guarded(() => mutation.mutateAsync(x))` with `useGuarded()` from `@/features/auth/reauth` (both apps). No MFA exists.
- **Images** are processed asynchronously: reserve asset → upload bytes → poll until `READY` → attach via gallery with expected revision. Image content needs authentication: web `<img src={assetContentUrl(id)}>` works with cookies (same site); native passes the bearer header to expo-image.
- **Locales**: backend `Locale` is `en | sr-Latn-RS | bs-Latn-BA`; UI resources are `en | sr-Latn`; `uiLocaleFor()` maps them (Bosnian uses Serbian Latin resources — gap).

## Queries pattern

Shared factories live in `packages/core/queries/<area>.ts`, React-free:

```ts
export const catalogueKeys = { all: ['catalogue'] as const, products: (q: ProductQuery) => ['catalogue', 'products', q] as const };
export const catalogueQueries = {
  products: (q: ProductQuery) => ({ queryKey: catalogueKeys.products(q), queryFn: () => data(api.GET('/catalogue/products', { params: { query: q } })) }),
};
export function createProduct(input: ProductInput) { return data(api.POST('/catalogue/products', { body: input })); }
```

Apps wrap them in `src/features/<area>/queries.ts`: `useQuery(catalogueQueries.products(q))`, `useMutation({ mutationFn: createProduct, onSuccess: () => qc.invalidateQueries({ queryKey: catalogueKeys.all }) })`. Use `placeholderData: keepPreviousData` for filtered lists. Invalidate by area prefix after mutations; patch the cache from mutation responses where the response is the full resource.

Shared app state: `useSession()` / `useBusiness()` / `useAdminSession()` (`@/lib/session`), `sessionStore.update({ account | organization })` after own-profile/organization edits, `sessionStore.selectVendor(id)` for the buyer's active vendor context.

## i18n

Namespaces are files: `packages/core/i18n/messages/en/<ns>.json` and `.../sr-Latn/<ns>.json` (Serbian Latin, Ekavian). Add keys to **both** languages. After adding a *new namespace file*, run `pnpm --filter @repo/core i18n:index`. `pnpm --filter @repo/core test` checks key parity, ICU validity and Serbian plural forms. Delete keys you no longer use.

## Local backend for development and tests

1. Backend (pinned JDK 25 in `.tools`, Docker running): `LOCAL_SYNTHETIC_SERVE_SECONDS=28800 LOCAL_SYNTHETIC_API_PORT=18080 LOCAL_SYNTHETIC_BROWSER_ORIGINS=https://localhost:3000,https://localhost:3103 python BE/operations/local_development.py serve`. The READY line lists synthetic RS/BA vendor and buyer owner emails and a platform admin; the password is the fixed synthetic test fixture `long synthetic password`. Data is fresh on each start.
2. `pnpm dev:cert` once (self-signed localhost cert, gitignored), then `pnpm dev:api-proxy` → https://localhost:18443 (browser transport) and/or `pnpm dev:api-proxy:native` → https://localhost:18444 (Expo web preview with the native transport).
3. Web: `pnpm dev:web` → https://localhost:3000 (`NEXT_PUBLIC_API_BASE_URL=https://localhost:18443/api/v1`). Mobile: `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:18080/api/v1` for the Android emulator.

Synthetic setup emails are not delivered locally (email provider off), so invitation/setup/reset links cannot be followed end-to-end in this harness; flows that need them are exercised up to the request and documented as such.
