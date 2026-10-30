# QA findings register

The working list between [QA exploration](qa-exploration.md), which finds problems, and the agent that fixes them. Each finding is fixed and then retested in the environment where it was found. Work from [web on mobile](web-on-mobile.md) logs its findings here too, under area `WEB-MOBILE`.

One exploration run so far (2026-10-30). The user decided the four `NEEDS-DECISION` items on 2026-10-30, and the fixing loop is in progress.

## How the fixing agent uses this file

1. **Pick work in order**: severity first (S1 → S4), then group findings that share a cause or a screen into one coherent batch. Skip `NEEDS-DECISION` and `BACKEND-GAP` entries.
2. **Before changing code**, reproduce the finding. If it doesn't reproduce, set `CANNOT-REPRODUCE` with what you tried.
3. **Fix within the rules**: [frontend instructions](../../FE/CLAUDE.md), [integration guide](integration-guide.md) and the contract. A fix that would change business behavior or wording beyond the finding becomes `NEEDS-DECISION` instead.
4. **Set `FIXED`** with the commit and a one-line description of the change.
5. **Retest** with the finding's own steps, in its environment, plus a quick check that nearby flows still work. Also add an automated check where reasonable (core unit test, `screens.mjs` or `flows.mjs` assertion). Then set `RETESTED`, or reopen it as `OPEN` with a note.
6. **Batch done**: run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm --filter web build` and the e2e scripts against the local backend. Add a [build log](build-log.md) entry for any decision or pattern a future session needs.

Never delete entries. Superseded or duplicate findings get status `DUPLICATE` with a pointer to the kept one.

## Statuses

| Status | Meaning |
|---|---|
| `OPEN` | Found, not yet worked on |
| `FIXING` | Someone is working on it (say who and when, in Notes) |
| `FIXED` | Change made, not yet retested |
| `RETESTED` | Retested and passing: done |
| `NEEDS-DECISION` | Needs a user or product decision before any change |
| `BACKEND-GAP` | Needs backend capability. Also listed in [backend gaps](backend-gaps.md). |
| `CANNOT-REPRODUCE` | Steps didn't reproduce it; what was tried is noted |
| `WONTFIX` | Deliberately left, with the reason (for example, the contract requires it) |
| `DUPLICATE` | Same as another finding (link it) |

## Finding format

Copy this block for each finding. IDs are sequential and never reused.

```markdown
### QA-001 — <short title>

| Field | Value |
|---|---|
| Status | OPEN |
| Severity / type | S3 / VISUAL |
| Area | <e.g. buyer checkout, vendor catalogue, shell, WEB-MOBILE> |
| Environment | <web desktop / web 390×844 / Android emulator / Expo web export>, <en / sr-Latn>, <light / dark>, <RS / BA> |
| Account | <buyer owner / vendor staff / platform admin / logged out> |
| Found | <date>, commit <short sha> |
| Evidence | .dev/qa/<date>/QA-001*.png (local only) |

**Steps**
1. …

**Expected:** …
**Actual:** …
**Notes:** Suspected cause, related screens, related findings.

**Resolution:** <commit, what changed> · **Retest:** <date, environment, result>
```

## Run summaries

<!-- Newest first. One block per exploration run: date and commit, environments covered/not covered
     and why, roles used, counts by severity. -->

### 2026-10-30, commit 2d6c424 (plus the uncommitted Phase 0/1 changes: screens.mjs viewport and overflow check, phone menu fix)

**Covered**
- Web desktop at 1280 × 900 (scripted sweep, every route, every role) and 1440 × 900 (manual).
- Web phone at 390 × 844 and 360 × 740 (scripted sweep with the new overflow check, every route), and 430 × 932 and 767 × 1024 for the shell.
- Web tablet at 768 × 1024 (vendor screens).
- Both languages: buyer and vendor accounts ran in `sr-Latn` until `flows.mjs` switched the RS accounts to English; admin and public pages in English.
- Light theme, plus dark on the main buyer and vendor screens.
- Both countries: RS through the sweeps and flows, BA by hand (money in KM, dates, Europe/Sarajevo).
- Long content: a 180-character product name, a 64-character SKU, a 200-character pack text and a nine-digit price.
- Network: offline when placing an order, and a lost response after the server created it (both safe: exactly one order). Two editors on one shared draft (conflict dialog works). Expired session: redirects to `/login?next=…`, returns there after login, and ignores an external `next`.
- Scripted checks: `screens.mjs` (desktop: 2 of 61 routes overflow; 390: 2; 360: 3), `flows.mjs` (11 of 11 steps pass) and `mobile-screens.mjs` on the Expo web export (33 of 33 screens clean, on the third attempt, see QA-032).

**Not covered**
- Staff and admin roles, the buyer-wide staff restriction, setup and invitation acceptance: no local way to obtain invitation links (QA-030).
- Empty organization: needs a setup invitation, same reason.
- Android emulator: no Android SDK on this machine. iOS Simulator: needs macOS.
- Expo web export by hand: only the scripted screen check ran.
- Slow 3G throttling, and stopping the backend mid-session.

**Accounts:** RS and BA buyer owners, RS and BA vendor owners, the platform admin (all from `ready.json`), and logged out.

**Counts:** 32 findings: 0 × S1, 7 × S2, 15 × S3, 10 × S4. Two are already `RETESTED` (the phone menu, fixed before exploring, as agreed). 4 need a decision (QA-016, QA-022, QA-023, QA-029) and 2 are backend gaps (QA-030, QA-031). QA-016 is also listed in backend gaps.

**Not findings:** the dark "N" circle in screenshots is the Next.js dev-mode indicator. Seeded organizations are all named "Test", and the base fixture's unit is literally named `unit-<uuid>`. The light theme default is deliberate. "Too many attempts" after many logins is the documented backend limit.

## Findings

<!-- Append findings below, newest at the bottom. -->

Evidence for every finding below is under `.dev/qa/2026-10-30/` (local only), in files starting with the finding ID. The run also kept the full sweeps there (`sweep-desktop/`, `sweep-390/`, `sweep-360/` and `screens-*.txt`).

### QA-001 — Phone menu rows are too small and the menu has no visible close button

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S2 / UX |
| Area | WEB-MOBILE, shell |
| Environment | web 390×844 (also 360, 430, 767), sr-Latn and en, light, RS and BA |
| Account | vendor owner, buyer owner, platform admin |
| Found | 2026-10-30, commit 2d6c424 (reported by the user before the run) |
| Evidence | .dev/qa/2026-10-30/QA-001*.png (local only) |

**Steps**
1. Log in, set the window to 390 × 844 and tap the menu button.

**Expected:** Rows at least 44 px tall with readable text, and a visible way to close the menu.
**Actual:** Rows were 32 px tall, with 14 px text and 16 px icons. The sheet hid its own close button (`[&>button]:hidden`).
**Notes:** The [web-on-mobile](web-on-mobile.md) plan fixed the shell before exploring, so the problem wasn't logged again on every screen.

**Resolution:** uncommitted (no commits until the end of this work, per the user). `sidebar.tsx`: new `touch` size for `SidebarMenuButton`, used automatically in the phone sheet (44 px rows, 16 px text, 20 px icons); a new `SidebarClose` (44 px, translated label `nav.closeMenu`) placed in the sidebar header by `app-shell.tsx`; the sheet's own small close button switched off. · **Retest:** 2026-10-30, web at 360, 390, 430 and 767 px, all three roles: rows 44 px, close button 44 × 44 and visible, no console or API errors. Typecheck and lint pass.

### QA-002 — Phone menu stays open after choosing a page

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S2 / UX |
| Area | WEB-MOBILE, shell |
| Environment | web 390×844 (also 360, 430, 767), sr-Latn and en, light, RS |
| Account | vendor owner, buyer owner, platform admin |
| Found | 2026-10-30, commit 2d6c424 (reported by the user before the run) |
| Evidence | .dev/qa/2026-10-30/QA-002*.png (local only) |

**Steps**
1. At 390 × 844, open the menu and tap another page, for example Catalogue.
2. Open the menu and tap the page that's already open.

**Expected:** The menu closes and the page is visible.
**Actual:** The page changed behind the menu, which stayed open, in both cases.
**Notes:** Nav links never called `setOpenMobile(false)`.

**Resolution:** uncommitted. `app-shell.tsx`: nav links close the sheet on click (this also covers the page that's already open), and `CloseMobileMenuOnNavigation` closes it on any other route change, such as the brand link or the account menu. · **Retest:** 2026-10-30, same environments: the sheet is closed after both steps.

### QA-003 — Wide content makes the whole page scroll sideways next to the sidebar

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S2 / VISUAL |
| Area | shell (every screen with the sidebar rail) |
| Environment | web desktop 1280×900 and tablet 768×1024, sr-Latn and en, light, RS and BA |
| Account | vendor owner, platform admin |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-003*.png (local only) |

**Steps**
1. At 1280 × 900, open `/vendor/catalogue` as the vendor or `/admin/audit` as the admin.
2. At 768 × 1024, open `/vendor`, `/vendor/catalogue`, `/vendor/orders` or `/vendor/settings/plan`.

**Expected:** The page fits the window. Wide tables scroll inside their own box.
**Actual:** The page is wider than the window, by up to 256 px at 768. The header stretches with it, and the catalogue's "Dodaj proizvod" (Add product) button and Status column are cut off at 1280. At 768 the settings tab strip and the plan cards stick out.
**Notes:** Suspected cause: `SidebarInset` (`sidebar.tsx`) is a flex item without `min-w-0`, so its content can grow it and the tables' own `overflow-x-auto` never engages. At phone width, where the sidebar is a sheet, the same tables scroll inside their box. Fix once in the shell, then re-run the desktop and tablet sweeps.

**Resolution:** uncommitted. `SidebarInset` gets `min-w-0`, so wide tables scroll inside their own box. · **Retest:** 2026-10-30: `screens.mjs` at 768 × 1024, 61/61 routes, no overflow (was 4 of 5 vendor pages); at 1280 × 900 see the run summary.

### QA-004 — Long product names push the cart's controls out of view

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S2 / BUG |
| Area | buyer cart (and every table with product names) |
| Environment | web desktop 1440×900 and 390×844, sr-Latn, light, BA |
| Account | buyer owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-004*.png (local only) |

**Steps**
1. As the vendor, create and activate a product with a 180-character name (the contract allows 200) and a 64-character SKU.
2. As the buyer, add it to the cart and open `/buyer/cart`.

**Expected:** The name wraps. Price, quantity, total and remove stay visible.
**Actual:** At 1440 the row is one line wider than the table. Price, quantity, total and remove are hidden off to the right, and nothing shows the table can scroll. At 390 the page becomes 1833 px wide.
**Notes:** Table cells use `whitespace-nowrap` (`components/ui/table.tsx`). The same happens anywhere a product name sits in a table: checkout review, order lines, vendor catalogue and inventory. Product names and SKUs need to wrap or be truncated with the full text available.

**Resolution:** uncommitted. Shared `TableCell primary`: the name cell wraps (`min-w-40`, `overflow-wrap:anywhere`) and other columns stay in view. Used for product, order and name cells in the cart, checkout review, order lines, vendor catalogue, orders list and inventory. · **Retest:** 2026-10-30, BA cart with the 180-character product: 1440 shows price, stepper, total and remove; 390 has no overflow.

### QA-005 — Tables in the core flows don't fit a phone screen

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S2 / VISUAL |
| Area | WEB-MOBILE: buyer cart, checkout review, order detail, vendor catalogue |
| Environment | web 390×844, sr-Latn, light, RS and BA |
| Account | buyer owner, vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-005*.png (local only) |

**Steps**
1. At 390 × 844, with three normal products in the cart, open `/buyer/cart`, then `/buyer/checkout` and press "Pregledaj porudžbinu" (Review order).
2. Open any order detail (`/buyer/orders/[id]` or `/vendor/orders/[id]`) and `/vendor/catalogue`.

**Expected:** Each line can be read and changed without sideways scrolling.
**Actual:**
- Cart: the page is 607 px wide.
- Checkout review: the page is 453 px wide.
- Order detail: the lines table cuts off the line total ("25,20 R…") and wraps product names one word per line.
- Vendor catalogue: only SKU and name show. Price, status and actions are off to the side, with no sign that more columns exist.

**Notes:** The [web-on-mobile](web-on-mobile.md) plan asks for one decision per table and one shared pattern, rather than patching each screen. A likely split: stacked rows for cart, checkout review and order lines; a scroll container with a visible hint, or fewer columns, for the vendor catalogue. Related: QA-003, QA-004. The phone sweep missed the cart and checkout because its browser had an empty cart.

**Resolution:** uncommitted. New `Table stack` option: below md, rows become wrapped blocks with labelled values, and the name takes the full row. Used in the cart, checkout review, order lines, vendor catalogue, orders list and inventory. 28 responsive grids got a `grid-cols-1` base so a phone column can't grow wider than the screen. · **Retest:** 2026-10-30, 390 × 844: cart, checkout review, order detail and vendor catalogue have no overflow; `screens.mjs` at 390: 61/61 clean.

### QA-006 — Orders list date range buttons don't wrap on phones

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / VISUAL |
| Area | WEB-MOBILE: buyer orders, vendor orders |
| Environment | web 390×844 and 360×740, sr-Latn, light, RS |
| Account | buyer owner, vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-006*.png (local only) |

**Steps**
1. Open `/buyer/orders` or `/vendor/orders` at 390 or 360 px.

**Expected:** The filters fit the width.
**Actual:** The "Sve / 7 dana / 30 dana / 90 dana / Prilagođeno" toggle row doesn't wrap. The page is 413 px wide at 390, and 412 px at 360.

**Resolution:** uncommitted. Below sm the date range is a select with the same options and state; the button group stays on larger screens. · **Retest:** 2026-10-30: `screens.mjs` at 390 and 360, the orders lists no longer overflow.

### QA-007 — Product editor is slightly wider than a 360 px phone

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / VISUAL |
| Area | WEB-MOBILE: vendor product editor |
| Environment | web 360×740, sr-Latn, light, RS |
| Account | vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-007*.png (local only) |

**Steps**
1. Open `/vendor/catalogue/[id]` at 360 × 740.

**Expected:** No sideways scroll.
**Actual:** The page is 373 px wide. The cards ("Detalji", "Cene", "Dogovorene cene kupaca") stick out by 13 px.

**Resolution:** uncommitted. Fixed by the `grid-cols-1` base on the product editor grids (see QA-005). · **Retest:** 2026-10-30: `screens.mjs` at 360, the product editor no longer overflows.

### QA-008 — Page headers with actions don't stack on phones

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / VISUAL |
| Area | WEB-MOBILE: vendor buyer detail (and other detail headers with actions) |
| Environment | web 390×844, sr-Latn, light, RS |
| Account | vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-008*.png (local only) |

**Steps**
1. Open `/vendor/buyers/[id]` at 390 × 844.

**Expected:** Title and subtitle on their own lines, actions below or in a menu.
**Actual:** The back arrow, title block and both buttons ("Narudžbine", "Prekini saradnju") share one row. The subtitle "Povezan od 30. 10. 2026." wraps one word per line, and "Povezan" runs under the "Narudžbine" button.
**Notes:** Check every header with back plus actions: order detail, product detail and the admin organization page.

**Resolution:** uncommitted. Detail headers (order, buyer/vendor relationship, product editor, admin `PageHeader`) give the title block `basis-56`, so actions wrap below the title instead of squeezing it. · **Retest:** 2026-10-30, 390 × 844, `/vendor/buyers/[id]`: title and subtitle on their own lines, buttons below, no overflow.

### QA-009 — Catalogue tab strip opens scrolled, hiding the active tab

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / UX |
| Area | WEB-MOBILE: vendor catalogue tabs (also settings tabs) |
| Environment | web 390×844, sr-Latn, light, RS |
| Account | vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-009*.png (local only) |

**Steps**
1. Open `/vendor/catalogue` at 390 × 844.

**Expected:** The active tab is visible, and it's clear that the strip scrolls.
**Actual:** The strip starts at "Istaknuto". The active "Proizvodi" tab is hidden on the left, and "Kategorije i jedinic…" is cut on the right with no scroll hint.

**Resolution:** uncommitted. `SectionNav` starts at the left (`justify-start`; a centred overflowing strip hid its first tabs out of scroll reach) and scrolls the active tab into view. · **Retest:** 2026-10-30, 390 × 844: on `/vendor/catalogue` the active "Proizvodi" tab is visible; on `/vendor/catalogue/taxonomy` the active last tab is scrolled into view.

### QA-010 — Tap targets are far below 44 px on phones

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / A11Y |
| Area | WEB-MOBILE: every screen (shared button sizes) |
| Environment | web 390×844, sr-Latn, light, BA |
| Account | buyer owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-010*.png (local only) |

**Steps**
1. Open `/buyer/cart` with products at 390 × 844 and measure the interactive elements.

**Expected:** About 44 × 44 px, as [web on mobile](web-on-mobile.md) requires.
**Actual:**
- quantity −/+: 24 × 24
- remove: 28 × 28
- menu button: 28 × 28
- default buttons and inputs: 32 px tall
- pagination buttons: about 32 px

**Notes:** These are the shared `Button` sizes (`default` `h-8`, `icon` `size-8`, `icon-sm`). Fix with phone sizes in the shared components, not per screen.

**Resolution:** uncommitted. On touch screens (`pointer-coarse:`) the shared button, input, input-group, select, toggle and tab sizes grow to 44 px (40 px for the compact `xs` sizes and the stepper's inner buttons); section tabs to 48 px; checkbox hit areas to 44 px. · **Retest:** 2026-10-30, 390 × 844 (touch emulation reports `pointer: coarse`): no controls under 40 px on the cart, catalogue or stats pages. Remaining small items are inline text links.

### QA-011 — Messages: Enter always sends, so phone users can't write a new line

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / UX |
| Area | WEB-MOBILE: order messages (buyer and vendor) |
| Environment | web 390×844, sr-Latn, light, RS |
| Account | buyer owner, vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-011*.png (local only) |

**Steps**
1. Open an order at 390 × 844 and look at the message box.

**Expected:** On touch devices, Enter adds a line and the Send button sends.
**Actual:** The hint says "Enter za slanje · Shift+Enter za novi red" (Enter sends, Shift+Enter adds a line), and `order-thread.tsx` sends on Enter without Shift. Phone keyboards have no Shift+Enter.
**Notes:** Found from the hint and the code. Not typed on a real phone keyboard.

**Resolution:** uncommitted. `order-thread.tsx`: on touch screens Enter adds a line and the Send button sends; the keyboard hint is hidden there. · **Retest:** 2026-10-30, 390 × 844: typing a line, Enter, another line gives two lines and nothing is sent; the hint is hidden.

### QA-012 — Order progress on phones puts the labels far from their steps

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / VISUAL |
| Area | WEB-MOBILE: order detail (buyer and vendor) |
| Environment | web 390×844, sr-Latn, light, RS |
| Account | vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-012*.png (local only) |

**Steps**
1. Open an order detail at 390 × 844.

**Expected:** Each step label sits next to its circle.
**Actual:** The vertical step list has the circles on the left and the labels right-aligned at the far right edge.

**Resolution:** uncommitted. `order-progress.tsx`: the circle wrapper is full width only from sm up, so phone labels sit next to their circles. · **Retest:** 2026-10-30, 390 × 844, vendor order detail: labels beside their steps.

### QA-013 — Order lines: unit price sits higher than the rest of the row

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / VISUAL |
| Area | buyer and vendor order detail |
| Environment | web desktop 1280×900, sr-Latn, light, RS and BA |
| Account | buyer owner, vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-013*.png (local only) |

**Steps**
1. Open any order detail and look at the "Stavke" (lines) table.

**Expected:** All cells in a row align.
**Actual:** "Jedinična cena" (unit price) is top-aligned, while quantity and line total are vertically centred.

**Resolution:** uncommitted. Removed `align-top` from the unit price cell in `order-lines.tsx`. · **Retest:** 2026-10-30, 1440: all cells in a line have the same vertical centre.

### QA-014 — Cart quantity: a decimal separator is silently dropped (6.5 becomes 66)

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S2 / BUG |
| Area | buyer cart (check the catalogue and product quantity inputs too) |
| Environment | web desktop 1440×900, sr-Latn, light, BA |
| Account | buyer owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | — (reproduced with a script; values below) |

**Steps**
1. Put "Mineralna voda 0,5 l" (minimum 6, step 6) in the cart and open `/buyer/cart`.
2. Select the quantity, type `6.5` and press Tab.

**Expected:** The input rejects the value or explains that quantities are whole numbers. It never multiplies the amount.
**Actual:** The `.` is stripped, giving 65, which is then rounded up to the step: 66. The line total jumps from 5,10 KM to 49,50 KM. Serbian users type decimal commas, so "1,5" kg of coffee becomes 15 kg in the same way.
**Notes:** The order review shows the result before placing, so nothing is submitted silently, but a tenfold quantity is easy to miss. Related: QA-015, QA-016.

**Resolution:** uncommitted. New core `readTypedQuantity`: only plain digits count; decimals, separators, signs and letters are refused with "Enter a whole number, like 12." and the quantity is kept. Web and mobile steppers use it; unit tests in `cart/quantity.test.ts`. · **Retest:** 2026-10-30, BA cart: `6.5` and `1,5` are refused with the message (role alert) and the quantity stays.

### QA-015 — Cart quantity is silently corrected without saying why

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / UX |
| Area | buyer cart |
| Environment | web desktop 1440×900, sr-Latn, light, BA |
| Account | buyer owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-015*.png (local only) |

**Steps**
1. On the same min-6/step-6 line, type `7`, `0`, nothing, `-6` and `abc` in turn, pressing Tab after each.

**Expected:** The value is corrected with a short note, for example "Rounded up to 12: sold in steps of 6, minimum 6".
**Actual:** 7 becomes 12, and every other value becomes 6. Nothing marks the field and no message appears.

**Resolution:** uncommitted. An off-rule whole number is moved to the next valid quantity with a note ("Changed to 12: minimum 6, then in steps of 6.", role status). Web and mobile. · **Retest:** 2026-10-30, BA cart: `7` becomes 12 with the note.

### QA-016 — No upper limit on order quantity

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / GAP |
| Area | buyer cart and checkout, backend contract |
| Environment | web desktop 1440×900, sr-Latn, light, BA |
| Account | buyer owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-016*.png (local only) |

**Steps**
1. Set "Kafa u zrnu 1 kg" to 1,000,000,000 in the cart and review the order.

**Expected:** A sensible maximum, or at least a confirmation for unusual amounts.
**Actual:** The backend prices the review: 1.000.000.000 kg, 18.500.000.007,00 KM. It's ready to send (not sent in this run).
**Notes:** R-API-011 leaves "safe integer/value maxima" open, so this is a product decision first: a backend maximum, a per-product maximum, or a client-side confirmation for large quantities. Listed in [backend gaps](backend-gaps.md) C-QA-1.

**Decision:** user, 2026-10-30: ask for confirmation when amounts are large. Assistant detail: placing an order asks for confirmation when any line has a quantity of 1,000 or more. The dialog lists those lines and offers to go back. The backend maximum stays open in C-QA-1.

**Resolution:** uncommitted. Placing an order with any line of 1,000 or more asks for confirmation and lists those lines (web dialog, mobile alert). Core `isLargeQuantity`, unit-tested. The backend maximum stays open (C-QA-1). · **Retest:** 2026-10-30, BA checkout with 1,000 units: the dialog lists the line; "Nazad" closes it without placing.

### QA-017 — CSV import needs IDs the app never shows

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S2 / UX |
| Area | vendor catalogue import, taxonomy |
| Environment | web desktop 1440×900, sr-Latn, light, BA |
| Account | vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-017*.png (local only) |

**Steps**
1. Open `/vendor/catalogue/import` and read the format help.
2. Open `/vendor/catalogue/taxonomy` to find the IDs it mentions.

**Expected:** A vendor can find the unit, category and tag IDs the CSV needs, for example a copy button next to each, or a downloadable template.
**Actual:** The help says `unitId`, `categoryId` and `tagIds` hold IDs. The taxonomy page lists only names, so the only working import is SKU and name, followed by editing each product by hand.
**Notes:** The IDs are in the API responses the page already loads, so this can be fixed in the frontend.

**Resolution:** uncommitted. Each taxonomy row has a copy-ID button (toast on success; if the clipboard is unavailable, the toast shows the ID). The import help points to it. · **Retest:** 2026-10-30, 1440: copying "Higijena" puts its ID on the clipboard with the toast "ID za Higijena je kopiran".

### QA-018 — English screen-reader labels inside the Serbian UI

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / I18N |
| Area | shared UI components (every screen) |
| Environment | web desktop and 390×844, sr-Latn, light, RS and BA |
| Account | all |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | — (found in page text and source) |

**Steps**
1. With the UI in `sr-Latn`, inspect the menu button, any dialog close button, a loading spinner and the phone menu.

**Expected:** Translated accessible names.
**Actual:** Hard-coded English:
- "Toggle Sidebar": `sidebar.tsx` trigger `sr-only` and rail `aria-label`
- "Close": `dialog.tsx`, `sheet.tsx`
- "Loading": `spinner.tsx`
- "Sidebar" / "Displays the mobile sidebar.": the phone sheet's title and description in `sidebar.tsx`

**Resolution:** uncommitted. Dialog and sheet close buttons, the spinner, the sidebar trigger and rail, and the phone sheet title use translations (`common.close`, `states.loading`, `nav.toggleMenu`, `nav.menu`). The untranslated sheet description is removed. · **Retest:** 2026-10-30, sr-Latn: menu button "Prikaži ili sakrij meni", sheet title "Meni", dialog close "Zatvori".

### QA-019 — Closing the phone menu loses keyboard focus

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / A11Y |
| Area | WEB-MOBILE, shell |
| Environment | web 390×844, sr-Latn, light, RS |
| Account | vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | — (measured: `document.activeElement` after closing) |

**Steps**
1. At 390 × 844, open the menu with the menu button, then close it with its close button.

**Expected:** Focus returns to the menu button.
**Actual:** Focus goes to the page body.
**Notes:** Already the case before the QA-001 fix. The trigger isn't a Radix `Dialog.Trigger`, so Radix has nothing to return focus to.

**Resolution:** uncommitted. The phone sheet's `onCloseAutoFocus` focuses the menu button. · **Retest:** 2026-10-30, 390 × 844: after the close button, focus is on the menu button.

### QA-020 — The 404 page is the unbranded Next.js default

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / UX |
| Area | public, every shell |
| Environment | web desktop 1440×900, en, light |
| Account | logged out |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-020*.png (local only) |

**Steps**
1. Open `https://localhost:3000/does-not-exist`.

**Expected:** A branded, translated page with a way back into the app.
**Actual:** Black page "404 | This page could not be found.": English only, no app styling, no link.

**Resolution:** uncommitted. New `app/not-found.tsx`: translated empty state with a link to the start page. · **Retest:** 2026-10-30, 1440, `/does-not-exist`: "Page not found" with "Go to the start page".

### QA-021 — Disabled buttons don't say what's missing

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S4 / UX |
| Area | login; vendor reject order (likely other reason dialogs) |
| Environment | web desktop 1440×900, en and sr-Latn, light, BA |
| Account | logged out; vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-021*.png (local only) |

**Steps**
1. Open `/login` with empty fields.
2. As the vendor, open a pending order, press "Odbij" (Reject) and leave the reason empty.

**Expected:** The user can tell why the button can't be pressed, for example a "required" mark on the field.
**Actual:** "Log in" is pale and disabled until both fields have text. "Odbij" stays disabled with an empty reason, and only "0 / 1000" shows.

**Resolution:** uncommitted. The login button is no longer disabled; the fields' `required` lets the browser say what's missing. The order reason dialog says "Required, up to 1000 characters." while empty. Admin reason dialogs were not changed. · **Retest:** 2026-10-30: empty login submit reports the missing field; the buyer cancel dialog shows the hint.

### QA-022 — Orders list "Quantity" adds up different units

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S4 / UX |
| Area | buyer and vendor orders lists (also the drafts list) |
| Environment | web desktop 1440×900, sr-Latn, light, BA |
| Account | buyer owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-022*.png (local only) |

**Steps**
1. Open `/buyer/orders` and compare "Količina" with an order's lines.

**Expected:** A number that means something across mixed units.
**Actual:** Quantities are summed across units: 5 kg plus 12 pieces shows as 17. `orderItemCount` in `packages/core/queries/orders.ts` says it's for "N items" summaries, but the column is labelled "Quantity".
**Notes:** Decide: show the number of lines ("3 lines"), drop the column, or keep it with a different label.

**Decision:** delegated to the assistant by the user, 2026-10-30: the column shows the number of lines, labelled "Lines" / "Stavke". Adding up quantities across units has no meaning.

**Resolution:** uncommitted. Orders list column "Lines" / "Stavke" counts lines; the mixed-unit sum is gone from the orders list and from the drafts summary (web and mobile); `orderItemCount` removed from core. · **Retest:** 2026-10-30, BA vendor orders: header "Stavke", values are line counts.

### QA-023 — Inconsistent names for the same thing

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S4 / I18N |
| Area | vendor dashboard, settings, catalogue tabs |
| Environment | web desktop 1440×900, sr-Latn, light, BA |
| Account | vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | — (page text) |

**Steps**
1. Compare menu items and tabs with the titles of the pages they open.

**Expected:** One term per concept.
**Actual:**
- Menu "Pregled" opens a page titled "Kontrolna tabla".
- The settings tab "Plan" opens a page that says "Paket Pro" and "Zahtevi za paket".
- The tab "Kategorije i jedinice" opens "Kategorije, oznake i jedinice".

**Notes:** Wording choice, so it waits for a decision.

**Decision:** delegated to the assistant by the user, 2026-10-30: in Serbian, the vendor menu item becomes "Kontrolna tabla", matching the page title ("Pregled" stays for review/overview, where it already means that), and the plan is "Paket" everywhere, including the settings tab and the admin console. The catalogue tab uses the page's full title: "Categories, tags & units" / "Kategorije, oznake i jedinice".

**Resolution:** uncommitted. Serbian: menu "Kontrolna tabla"; "paket" in every plan string (38 strings, all forms; placeholders untouched). Both languages: the taxonomy tab uses the page title. · **Retest:** 2026-10-30, sr-Latn: menu "Kontrolna tabla", settings tab "Paket", catalogue tab "Kategorije, oznake i jedinice".

### QA-024 — "PDV-a" breaks at the hyphen

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S4 / VISUAL |
| Area | vendor dashboard stat cards (anywhere "PDV-a" wraps) |
| Environment | web desktop 1440×900, sr-Latn, light and dark, BA |
| Account | vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-024-025*.png (local only) |

**Steps**
1. Open `/vendor` and read the first stat card's footer.

**Expected:** "PDV-a" stays on one line.
**Actual:** "…neto bez PDV-" / "a".
**Notes:** A non-breaking hyphen (U+2011) in the translation, or `whitespace-nowrap` around the term.

**Resolution:** uncommitted. All 12 Serbian "PDV-a" use a non-breaking hyphen (U+2011); Geist has the glyph. · **Retest:** 2026-10-30, 1440: the dashboard card wraps "PDV‑a" as one word.

### QA-025 — Dark theme keeps light scrollbars

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S4 / VISUAL |
| Area | every screen in dark theme |
| Environment | web desktop 1440×900, sr-Latn, dark, BA |
| Account | vendor owner, buyer owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-024-025*.png (local only) |

**Steps**
1. Switch to the dark theme and open any long page.

**Expected:** Dark native scrollbars and form controls.
**Actual:** The page scrollbar stays light.
**Notes:** Suspected cause: the root never sets `color-scheme: dark`.

**Resolution:** uncommitted. `globals.css`: `color-scheme: light`, and `dark` under `html.dark`. · **Retest:** 2026-10-30: computed `color-scheme` is `dark` in the dark theme and `light` in the light theme.

### QA-026 — Uncertain order outcome shows the same message twice

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S4 / UX |
| Area | buyer checkout |
| Environment | web desktop 1440×900, sr-Latn, light, BA |
| Account | buyer owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-026*.png (local only) |

**Steps**
1. Review an order, go offline (or lose the response) and press "Pošalji porudžbinu" (Place order).

**Expected:** One clear message with "Proveri status" (Check status).
**Actual:** Two stacked alerts with nearly the same text: "Poslednje slanje nije potvrđeno" and "Status porudžbine nije poznat".
**Notes:** The behavior itself is correct. "Place order" is disabled, "Check status" resolves to the existing order, and exactly one order was created in both the offline and the lost-response cases.

**Resolution:** uncommitted. The uncertain-outcome alert is skipped while the pending alert (with "Proveri status") is shown. Web and mobile. · **Retest:** 2026-10-30, BA checkout offline: one alert; "Proveri status" afterwards gives exactly one order.

### QA-027 — "Too many attempts" doesn't say how long to wait

| Field | Value |
|---|---|
| Status | FIXED |
| Severity / type | S4 / UX |
| Area | login |
| Environment | web desktop 1440×900, en, light |
| Account | logged out (BA buyer email) |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-027*.png (local only) |

**Steps**
1. Use up the login budget (30 logins per 15 minutes per source address), then log in.

**Expected:** "Try again in about N minutes", using the backend's `Retry-After`.
**Actual:** "Too many attempts. Please wait a moment and try again."
**Notes:** The lockout itself is expected behavior. Only the wording is an enhancement.

**Resolution:** uncommitted. Core `problemMsg`: a 429 with `Retry-After` gives "Too many attempts. Try again in about N minutes." (both apps). Unit test `i18n/problem.test.ts`. · **Retest:** unit test only. Triggering a real 429 would lock this machine out of logins for 15 minutes; retest the next time the limit is hit.

### QA-028 — The 90-day chart on a phone shows no bars

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S3 / VISUAL |
| Area | WEB-MOBILE: buyer stats (likely vendor stats and the dashboard chart too) |
| Environment | web 390×844, sr-Latn, light, RS |
| Account | buyer owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-028*.png (local only) |

**Steps**
1. Open `/buyer/stats` (last 90 days, one delivered order on 30 October) at 1280 and at 390.

**Expected:** The bar for 30 October is visible at both widths.
**Actual:** At 1280 it shows. At 390 the chart is empty.
**Notes:** Suspected cause: 90 bars in about 300 px round down to nothing.

**Resolution:** uncommitted. Charts with more than 31 bars drop the corner radius and the gap between bars. · **Retest:** 2026-10-30, 390 × 844, buyer stats (90 days): the 30 October bar is 3 px wide and visible (was 1 px, unseen).

### QA-029 — Phone top bar shows only the menu button

| Field | Value |
|---|---|
| Status | RETESTED |
| Severity / type | S4 / UX |
| Area | WEB-MOBILE, shell |
| Environment | web 390×844, sr-Latn, light, RS |
| Account | buyer owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/QA-029*.png (local only) |

**Steps**
1. Open any page at 390 × 844 and look at the top bar.

**Expected:** Some orientation, for example the app or page name, and for buyers quick access to the cart.
**Actual:** The 48 px bar has only the menu button. Getting to the cart always takes two taps.
**Notes:** This adds UI, so it waits for a decision.

**Decision:** user, 2026-10-30: yes. Below 768 px the top bar shows the current section's name, and for buyers a cart button with the item count.

**Resolution:** uncommitted. Below md the top bar shows the current section name ("Account" on account pages) and, for buyers, a 44 px cart button with the item count. · **Retest:** 2026-10-30, 390 × 844: "Korpa" with a cart button labelled "2 stavke u korpi".

### QA-030 — No local way to accept invitations, so staff and admin roles can't be tested

| Field | Value |
|---|---|
| Status | BACKEND-GAP |
| Severity / type | S3 / GAP |
| Area | local tooling, team, setup |
| Environment | local stack (`python dev.py`) |
| Account | — |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | — |

**Steps**
1. Start the stack, then try to create a staff or admin member, or a new organization.

**Expected:** A supported local way to follow invitation links, for example the synthetic email stand-in keeping the last links for the local harness.
**Actual:** Email delivery is off and nothing records the links. `ready.json` has owners only, so the buyer-wide staff restriction, owner/admin/staff differences, setup and invitation acceptance, and an empty organization can't be explored.
**Notes:** Listed in [backend gaps](backend-gaps.md) C-QA-2. Editing the database was not used, as the exploration rules require.

**Resolution:** — · **Retest:** —

### QA-031 — Catalogue validation errors carry an authentication title

| Field | Value |
|---|---|
| Status | BACKEND-GAP |
| Severity / type | S4 / GAP |
| Area | backend problem details |
| Environment | local API |
| Account | vendor owner (BA) |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | — (response body below) |

**Steps**
1. `POST /api/v1/catalogue/products` with a 66-character SKU.

**Expected:** 422 `VALIDATION_FAILED` with a validation title.
**Actual:** 422 `VALIDATION_FAILED` with `"title": "Authentication request could not be completed"`.
**Notes:** The apps translate by `code`, so users don't see this title. Listed in [backend gaps](backend-gaps.md) C-QA-3.

**Resolution:** — · **Retest:** —

### QA-032 — `mobile-screens.mjs` crashes when the login budget is used up

| Field | Value |
|---|---|
| Status | FIXED |
| Severity / type | S4 / BUG |
| Area | e2e tooling |
| Environment | local stack, Expo web export at `http://localhost:3200` |
| Account | RS vendor owner |
| Found | 2026-10-30, commit 2d6c424 |
| Evidence | .dev/qa/2026-10-30/mobile-screens.txt (local only) |

**Steps**
1. Run `node e2e/mobile-screens.mjs ready.json` shortly after other scripts have used the per-source login budget.

**Expected:** A clear "login rate-limited, retry after N s" message, like the backend limit the other scripts pace for.
**Actual:** `TypeError: Cannot read properties of undefined (reading '0')` in `first()`, or a 30 s timeout waiting to leave `/login`. Run at a quiet moment, the same login and reads work.
**Notes:** It failed twice in this run and passed on the third attempt, after the budget had refilled.

**Resolution:** uncommitted. `mobile-screens.mjs` checks login and read responses and reports the status and `Retry-After`; a login that doesn't leave `/login` reports the page text. · **Retest:** pending.

### QA-033 — `dev.py` crashes when a stopped service's log holds a non-ASCII character

| Field | Value |
|---|---|
| Status | FIXED |
| Severity / type | S4 / BUG |
| Area | local tooling |
| Environment | Windows, `python dev.py` with output redirected to a file |
| Account | — |
| Found | 2026-10-30, commit 2d6c424, while fixing (not part of the exploration run) |
| Evidence | — (traceback below) |

**Steps**
1. Run `python dev.py --mobile none > out.txt` on Windows.
2. Stop one service, for example the web dev server.

**Expected:** "<service> exited", then the normal shutdown.
**Actual:** `UnicodeEncodeError: 'charmap' codec can't encode character '✓'` while printing the service's log tail (Python uses cp1252 for redirected output). The `finally` block still ran the shutdown and container cleanup, so nothing was left behind.

**Resolution:** uncommitted. `dev.py` reconfigures stdout with `errors="replace"`. · **Retest:** pending.
