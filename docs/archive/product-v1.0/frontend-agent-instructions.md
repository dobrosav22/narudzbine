# Frontend Build Instructions (for a coding agent)

**Read `01-product-overview.md` first** for the product shape. This document
tells you *how* to build the frontend so it survives contact with a real
backend later. **Read `04-data-contract-api-outline.md`** for the exact
entity shapes and assumed endpoints you should build against, and **read
`05-visual-design-system.md`** for the color/type/shape tokens before
writing any UI.

## Getting started from a blank repo

This assumes a project root already split into `FE/` and `BE/` (backend
left empty for another team to fill in later, possibly in a different
stack entirely — nothing here should assume Node on the backend side).
**Everything below happens inside `FE/`.** The root itself needs no build
tooling of its own; `FE/` is a fully self-contained monorepo.

```
/ (project root)
  /docs   the 5 planning docs (this file included)
  /FE     everything below lives here
  /BE     left empty — another team's stack, untouched by FE tooling
```

`cd FE` before running any command in this section. Assume nothing exists
yet inside it. Set up in this order:

1. **Package manager & monorepo tool:** pnpm workspaces + Turborepo.
   ```
   pnpm init
   pnpm add -Dw turbo typescript
   ```
   Add a `pnpm-workspace.yaml` covering `apps/*` and `packages/*`, and a
   `turbo.json` with `dev`/`build`/`lint` pipelines. (Paths like `apps/web`
   below are relative to `FE/`, i.e. the real path is `FE/apps/web`.)

2. **Create the folder structure** exactly as described below (empty
   `packages/core` subfolders included) before writing any feature code —
   scaffolding the shape first makes the "no direct fetch in components"
   rule easy to enforce from commit one.

3. **`packages/core` first, apps second.** Write the entity types, service
   interfaces, and mock implementations before touching `apps/web` or
   `apps/mobile`. The apps should have nothing to do except render what
   `packages/core` gives them.

4. **`apps/web`:** `pnpm create next-app` (TypeScript, Tailwind, App
   Router), then wire it to `packages/core` as a workspace dependency.
   Immediately after, initialize shadcn/ui and its agent skill:
   ```
   npx shadcn@latest init
   pnpm dlx skills add shadcn/ui
   ```
   The skill installs into the project and is auto-loaded by any
   shadcn-aware coding agent (Claude Code included) from then on — it reads
   `components.json` and makes the agent use `shadcn add`/`shadcn search`
   to pull real components rather than hand-writing approximations, and
   enforces shadcn's own composition patterns (e.g. `FieldGroup` for forms,
   `ToggleGroup` for option groups, semantic color tokens). Do this before
   building any screen so every component from the first one onward goes
   through the CLI, not ad-hoc JSX. During `shadcn init`, apply the color/
   radius tokens from `05-visual-design-system.md` (Zinc or Neutral base,
   violet accent) rather than accepting shadcn's default monochrome theme.

5. **`apps/mobile`:** `pnpm create expo-app` (TypeScript template), wire it
   to `packages/core` the same way. Expo is the reason an APK is easy to
   produce (`eas build -p android`). shadcn/ui itself is web-only — its
   skill and CLI don't apply here. **Mobile styling: NativeWind**, sharing
   the same Tailwind-based tokens as `apps/web` (see
   `05-visual-design-system.md` §5) — style mobile screens to match the
   visual direction from the start, this is no longer deferred.

6. Confirm both apps can import from `@repo/core` (or whatever the package
   is named) and render one mocked screen end-to-end before building out
   the rest — that round-trip proves the wiring works.

## Guiding principle

The backend does not exist yet and will be built by someone else, later,
possibly making different decisions than the ones assumed in the data
contract. Every screen and component you write must be able to have its
data source swapped without being rewritten. Concretely:

> **No component, hook, or screen may call `fetch`, `axios`, or any network
> client directly.** All data access goes through the service layer
> described below. If you find yourself writing a URL string in a
> component, stop — that logic belongs in a service.

## Monorepo structure

All paths below are relative to `FE/` (i.e. `apps/web` really means
`FE/apps/web`). `BE/` sits alongside `FE/` at the project root and is out
of scope for this document entirely.

```
FE/
  /apps
    /web        Next.js app (React, TypeScript, Tailwind)
    /mobile     Expo / React Native app (buildable to APK)
  /packages
    /core       Shared, platform-agnostic code
      /types        TypeScript interfaces for every entity (mirrors 04-data-contract)
      /services     Service interfaces (e.g. OrdersService, CatalogueService)
        /real       One file per service, real implementations — stubbed
                    with "not implemented" throws until the backend exists
      /mocks        In-memory mock implementations of every service
      /pricing      Shared price-resolution logic (see below)
      serviceProvider.ts   Single wiring point, mock/real switch (see below)
    /ui         Shared design tokens / cross-platform primitives if feasible
                (web and native often can't share components directly —
                don't force it; share types and logic, not JSX)
```

Each app also gets an `.env.example` with `USE_MOCKS=true` committed, so
"how do I turn mocks off" is discoverable without reading this doc.

Both `apps/web` and `apps/mobile` import from `packages/core` and never
duplicate a type or a piece of business logic. If web and mobile need
slightly different data (e.g. pagination shape), that difference lives in
the service interface, not by each app inventing its own version of the
entity.

## The service layer pattern

For each functional area, define:

1. **An interface** in `packages/core/services`, e.g.:

```ts
export interface OrdersService {
  listOrders(params: { vendorOrgId: string; buyerOrgId?: string; locationId?: string }): Promise<Order[]>;
  getOrder(orderId: string): Promise<Order>;
  createOrder(input: CreateOrderInput): Promise<Order>;
  updateOrderStatus(orderId: string, statusKey: string): Promise<Order>;
  addOrderMessage(orderId: string, text: string): Promise<OrderMessage>;
}
```

2. **A mock implementation** in `packages/core/mocks`, backed by in-memory
   arrays and seed data, with realistic artificial delay
   (`await delay(200)`) so loading states get built and tested honestly.

3. **A single wiring point** (`packages/core/serviceProvider.ts`) that
   decides which implementation to hand out, driven by an **environment
   variable**, not a hardcoded constant — so each app can flip mocks off
   independently, and CI/preview builds can choose per-environment:

```ts
// packages/core/serviceProvider.ts
const USE_MOCKS = process.env.USE_MOCKS !== 'false'; // default ON until real backend exists

import * as mocks from './mocks';
import * as real from './services/real'; // stub folder — see below

export const services: AppServices = {
  orders: USE_MOCKS ? mocks.ordersService : real.ordersService,
  catalogue: USE_MOCKS ? mocks.catalogueService : real.catalogueService,
  buyers: USE_MOCKS ? mocks.buyersService : real.buyersService,
  // ... one line per service, same pattern
};
```

Each app reads this through its own env convention (`NEXT_PUBLIC_USE_MOCKS`
in `apps/web`, `EXPO_PUBLIC_USE_MOCKS` in `apps/mobile`), both feeding into
the same underlying `USE_MOCKS` check in `packages/core`. Default is
**mocks on** — a fresh clone of the repo should run fully standalone with
zero backend, zero env setup.

**Real implementations are stubbed from day one, not added later.** Create
`packages/core/services/real/` now, one file per service, each function
throwing `Not implemented — see 04-data-contract-api-outline.md`. This
means:
- The `AppServices` type-checks against both mock and real implementations
  from the start — a real implementation can never silently drift from
  what components actually call.
- Turning off mocks is a one-line env change (`USE_MOCKS=false`), and
  whatever real service isn't finished yet fails loudly instead of silently
  falling back to fake data.
- Backend work can happen **service by service** — e.g. once `OrdersService`
  is real, `real.ordersService` gets implemented and everything else can
  stay mocked, since each entry in `services` is switched independently if
  you replace the single global flag with a per-service one (worth doing
  once the backend starts landing piecemeal; start with the single global
  flag for simplicity).

Components/screens only ever import `services` and call
`services.orders.listOrders(...)` — never a mock or real implementation
directly.

## State/context you'll need

- **Session context** — current logged-in user, which org(s) they belong to,
  and (for buyers) which org+vendor+location is currently "active."
- **Active vendor context** (buyer side only) — drives which catalogue,
  cart, and orders are shown. Switching it should be a single, obvious
  action (not scattered logic).
- **Cart context** — scoped to the active vendor + a location. Keep this
  separate from "draft carts" (which are persisted via the service layer);
  the live cart context can sync to a draft cart but isn't the same thing.
- **Notification preferences** — fetched once, edited via its own settings
  screen, not something every screen needs to know about.

Avoid a single giant global store. Prefer feature-scoped contexts/hooks that
each talk to one service.

## Handling entities the backend might reshape

Some things in the data contract are genuinely guesses (see the "Open
questions" section of `01-product-overview.md` and any field in
`04-data-contract-api-outline.md` marked **[assumed]**). For these:

- Keep the *type* in one place (`packages/core/types`) so a shape change is
  a one-file edit, not a find-and-replace across the app.
- Prefer deriving display logic (e.g. price resolution, order status
  progression) from data rather than hardcoding it, since these are the
  parts most likely to change shape.
- Don't over-invest in edge-case UI for a feature whose data shape is
  marked uncertain — get the common path working, note the uncertainty in
  a code comment referencing this doc, and move on.

## Mock data

Seed the mocks with a small but *realistic* dataset that exercises every
branch of the plan:

- At least one vendor with inventory tracking ON and one with it OFF.
- At least one buyer org connected to 2+ vendors.
- At least one buyer org with 2+ locations and 2+ users.
- At least one product with quantity price tiers and one with a per-buyer
  override.
- At least one active promotion.
- Orders in multiple different statuses (including a vendor with a
  customized, non-default status list).
- At least one draft cart, one favorite, and some order history to power
  the "most ordered" view.

## Conventions

- TypeScript strict mode, no `any` in shared `packages/core` code.
- One folder per screen/feature under each app, colocating the screen,
  its local components, and its hook(s) that call the service layer.
- Loading, empty, and error states are not optional — every service call in
  a screen needs all three handled, since the real backend will have real
  latency and real failures that the mocks should approximate.

## When this document should be updated

Treat this file as living documentation. Update it when:
- A new shared pattern is introduced (e.g. a second cross-cutting context).
- The mock-to-real swap actually happens for a given service — note which
  services are "real" vs "still mocked" so it's obvious what's left.
- A decision in `01-product-overview.md`'s open-questions list gets
  resolved — reflect the resolution here and in the data contract doc.

In practice, day-to-day decisions and deviations shouldn't require editing
this doc directly — that's what `BUILD_LOG.md` (at the `FE/` root) is for.
Edit these planning docs themselves only for changes significant enough
that a future reader should see them reflected in the plan, not just the
log — e.g. an open question getting permanently resolved, not a one-off
implementation detail.

## Persisting context across sessions

`FE/CLAUDE.md` and `FE/BUILD_LOG.md` exist for this. `CLAUDE.md` is the
auto-loaded entry point (if using Claude Code) that imports all five
planning docs plus the build log. `BUILD_LOG.md` is where you record, as
you go: decisions the planning docs didn't cover, deliberate deviations
from what they say, and anything discovered mid-build that a future
session shouldn't have to rediscover. Read `BUILD_LOG.md` at the start of
every session — it takes precedence over the planning docs wherever the
two disagree, since it reflects what actually happened. Append to it
before ending a session that made any such decision; don't wait to be
asked, and don't edit past entries — add a new one if something gets
superseded again later.
