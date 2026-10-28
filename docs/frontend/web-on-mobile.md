# Adjusting the web app for mobile

Planned work, not done yet (user request, 2026-10-28). The web app (`FE/apps/web`) is responsive, but on phone-sized screens some things overflow, are too small to read or tap, or behave in surprising ways. The goal is to tighten every web screen at phone width without forking the UI. The native app (`FE/apps/mobile`) is a separate product and out of scope here, though [QA exploration](qa-exploration.md) covers it.

This document has three parts: what's already known, how to find the rest, and how to fix it consistently. Findings from exploring go into the [QA findings register](qa-findings.md) under area `WEB-MOBILE`, so fixing and retesting follow the same loop as every other finding.

## Known issues (reported by the user)

| Issue | Where it comes from | Direction |
|---|---|---|
| The side menu on mobile is too small | [sidebar.tsx](../../FE/apps/web/src/components/ui/sidebar.tsx): the mobile sheet is 18rem wide, and menu buttons use the `default` size `h-8 text-sm` (32 px rows, below a comfortable touch target) | On mobile: larger rows (at least 44 px), larger text and icons, and a visible close button (the sheet currently hides its own with `[&>button]:hidden`) |
| The side menu stays open after picking a page | [app-shell.tsx](../../FE/apps/web/src/features/shell/app-shell.tsx): nav links never call `setOpenMobile(false)` | Close the mobile sheet on navigation, either in the link's `onClick` or with an effect on `pathname` |
| Some content overflows | Not yet located | Find with the steps below |
| Some interactions are counter-intuitive | Not yet located | Find with the steps below |

## Target sizes

Test at least these widths, in portrait, plus one landscape phone:

| Width × height | Represents |
|---|---|
| 360 × 740 | Small Android (the narrowest supported target) |
| 390 × 844 | Typical iPhone |
| 430 × 932 | Large phone |
| 768 × 1024 | Tablet portrait. `useIsMobile` switches at 768 px, so this is where the sidebar changes from sheet to rail. Check 767 px and 768 px both. |

Serbian (`sr-Latn`) labels are often longer than English ones. Check every screen in both languages, and in both light and dark themes.

## How to explore

1. **Start the stack**: `python dev.py --mobile none` from the repository root (Docker must be running). Log in with the synthetic accounts the script prints.
2. **Chrome DevTools device mode** (Ctrl+Shift+M) at the sizes above. Turn on touch simulation. Also try a real phone browser on the same network only if the stack is made reachable; by default everything listens on loopback.
3. **Screenshot sweep**: `FE/e2e/screens.mjs` opens every route for every role and saves screenshots with `SHOTS=<dir>`. It currently uses Puppeteer's default 800 × 600 viewport. The first task of this work is adding a `VIEWPORT=390x844` option (with `isMobile`/`hasTouch`), so one run captures every route at phone width. Save screenshots under `.dev/` (gitignored), never in the repository.
4. **Automatic overflow check**: in the same script, after each route loads, report any element wider than the viewport. A good test is `document.documentElement.scrollWidth > innerWidth`, then list elements whose `getBoundingClientRect().right` is past the viewport. Report it like the existing console-error findings.
5. **Walk the flows by hand**, not just the routes. Open every dialog, sheet, dropdown, select, date picker, tooltip and toast. Fill forms with the on-screen keyboard in mind, and open the longest content you can find (long product names, many order lines, long notes, large money values).

## What to look for

- **Horizontal overflow**: tables, long words or SKUs, money values, button rows, tab lists, filters and badges that push the page wider than the screen. Page-level horizontal scroll is never acceptable. Scrolling inside a clearly scrollable container (a wide table, a tab strip) is acceptable only when it's visibly scrollable.
- **Tap targets** smaller than about 44 × 44 px, or too close together: icon buttons, row actions, pagination, checkboxes, steppers.
- **Text too small to read**: anything under 12 px, and muted text on muted backgrounds. Inputs need at least a 16 px font, or iOS Safari zooms the page on focus.
- **Layouts that don't adapt**: multi-column grids that stay multi-column, sticky side panels that become long scrolls (checkout's total card, for example), actions far below the content they apply to.
- **Navigation surprises**: menus that stay open, back behavior that loses entered work, active-page indication missing in the menu, screens reachable on desktop but not obviously reachable on mobile.
- **Dialogs and sheets**: content taller than the screen without its own scroll, close buttons off-screen, the keyboard covering the field being edited or the submit button.
- **Fixed and sticky elements** covering content, and overlap with browser chrome and safe areas (`env(safe-area-inset-*)`).
- **Tables**: decide per table whether it becomes a stacked card list, hides secondary columns, or scrolls inside its own container.
- **Feedback**: toasts covering actions, loading states that shift the layout, errors scrolled out of view (checkout now scrolls to its error; other screens may not).

## How to fix

- Mobile-first Tailwind: base classes for the phone, `sm:`/`md:`/`lg:` for larger screens. Don't add a parallel mobile component tree. Use the `useIsMobile` hook only where behavior differs (sheet vs rail), not for layout that CSS can handle.
- Stay within the shadcn components in `FE/apps/web/src/components/ui` and the design tokens. Use the web app's `shadcn` skill when composing or changing components. Prefer variants (for example a larger mobile `SidebarMenuButton` size) over one-off overrides.
- Shared patterns first: if many tables overflow, make one responsive table pattern and apply it everywhere, instead of patching each screen differently. Record any new pattern in the [build log](build-log.md).
- Don't change wording, flows or business behavior while fixing layout. If a fix needs a behavior change (for example a different back behavior), log it as a finding marked "needs decision".
- Keep accessibility intact: labels, focus order, `aria-current`, focus return after closing sheets and dialogs.

## Screen inventory

All web routes, grouped by shell. Every one gets checked at phone width. Starred areas are the most likely problem spots: wide tables, dense forms and sticky panels.

| Shell | Routes |
|---|---|
| Public / auth | `/login`, `/forgot-password`, `/reset-password`, `/recovery`, `/setup`, `/accept-invitation`, `/email-change` |
| Buyer | `/buyer` (catalogue), `/buyer/products/[id]`, `/buyer/cart`\*, `/buyer/checkout`\*, `/buyer/drafts`, `/buyer/favorites`, `/buyer/orders`\*, `/buyer/orders/[id]`\*, `/buyer/vendors`, `/buyer/vendors/[id]`, `/buyer/stats`\*, `/buyer/notifications`, `/buyer/account` (+ `/notifications`, `/security`), `/buyer/settings` (+ `/team`, `/locations`, `/contacts`, `/audit`\*, `/privacy`) |
| Vendor | `/vendor` (dashboard), `/vendor/catalogue`\* (+ `/[id]`, `/new`, `/featured`, `/import`\*, `/inventory`\*, `/promotions`\*, `/taxonomy`), `/vendor/orders`\*, `/vendor/orders/[id]`\*, `/vendor/buyers` (+ `/[id]`\*), `/vendor/locations`, `/vendor/team`, `/vendor/stats`\*, `/vendor/notifications`, `/vendor/account` (+ `/notifications`, `/security`), `/vendor/settings` (+ `/plan`, `/stages`, `/contacts`, `/audit`\*, `/privacy`) |
| Platform admin | `/admin`, `/admin/organizations`\* (+ `/[id]`), `/admin/plan-requests`, `/admin/audit`\*, `/admin/invitations/[id]`, `/admin/privacy-cases/[id]`, `/admin/recovery-cases/[id]`, `/admin/account` (+ `/security`) |

The shell itself (header, sidebar sheet, buyer vendor switcher, user menu, cart badge) is the first thing to fix, because every screen sits inside it.

## Done means

- No page-level horizontal scroll on any route at 360 px, in either language.
- Every interactive element has a comfortable tap target, and the side menu closes on navigation.
- The screenshot sweep at phone width runs clean for every role, including the overflow check, and its screenshots have been reviewed.
- Every `WEB-MOBILE` finding in the register is `RETESTED` or explicitly deferred.
- Desktop layouts are unchanged: re-run the default-viewport sweep and `flows.mjs`.
- Frontend checks pass: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm --filter web build`.
