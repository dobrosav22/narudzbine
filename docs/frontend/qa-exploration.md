# QA exploration

A playbook for exploratory QA of the whole frontend, as a tester would do it: every screen, every flow, every environment, against the real local backend. It produces findings, not fixes. Each finding goes into the [QA findings register](qa-findings.md), which a separate agent then uses to fix and retest.

Planned work (user request, 2026-10-28). The scripted checks in [e2e testing](e2e-testing.md) prove that routes load and the core order flow works. This exploration covers everything those scripts don't: usability, visual problems, edge cases, unclear wording, missing feedback and inconsistencies between web and mobile.

## Rules for the exploring agent

- **Explore and record. Don't fix.** Fixing during exploration hides what was found and mixes two reviews. The only exception is a blocker that stops exploration entirely. Log it, then fix it in a separate, clearly described change.
- **Every finding is reproducible**: environment, account, exact steps, expected and actual result. "Sometimes" is fine if you say how often.
- **Evidence goes under `.dev/qa/<date>/`** (gitignored): screenshots and short notes, named after the finding ID. Never commit screenshots, and never record passwords, tokens or session cookies in findings. The synthetic emails and IDs from `ready.json` are fine.
- **Find the source of a mismatch** before logging it:
  - If the backend lacks something the UI needs, log it as a finding and also add it to [backend gaps](backend-gaps.md).
  - If the contract or business rules say the UI is right, it isn't a bug. Log it as an enhancement only if it's still confusing.
  - The [contract](../../openapi.yaml) and the [requirements](../project/requirements.md) win over the planning docs.
- **Respect the backend limits** in [e2e testing](e2e-testing.md#backend-limits-the-checks-respect): about 120 reads per minute and 30 logins per 15 minutes. Restart the stack (fresh database) if logins lock out. That lockout is expected behavior, not a finding.
- **One finding per problem.** If the same problem shows up on many screens, log it once and list the screens.

## Setup

1. Docker running, then `python dev.py` from the repository root. Add `--mobile web` for the Expo web preview, or the default for the Android emulator. It seeds demo data and prints the accounts.
2. The web app runs at `https://localhost:3000`. The mobile app runs in the Android emulator (press `a` in the Expo terminal) and/or as the Expo web export (see [e2e testing](e2e-testing.md#running)).
3. Run the scripted checks first (`screens.mjs`, `flows.mjs`, `mobile-screens.mjs`). Log every failure they report as a finding before exploring by hand.

## Coverage matrix

Not every combination needs a full pass. Do one full pass in the **primary** column, then a targeted pass in each other column, focusing on what that dimension affects.

| Dimension | Primary | Also cover |
|---|---|---|
| App and form factor | Web, desktop (1440 × 900) | Web at phone width (see [web on mobile](web-on-mobile.md)); web tablet (768 × 1024); Android emulator; Expo web export. iOS Simulator only on macOS: record it as not covered otherwise. |
| Role | Buyer owner, vendor owner, platform admin (all in `ready.json`) | Owner/admin/staff differences, the buyer-wide staff restriction, and logged out / public pages. `ready.json` has owners only. Staff and admin accounts need team invitations, whose email delivery is off locally. Check [local tooling](../operations/local-tooling.md) for a supported way. If there is none, record the gap rather than editing the database. |
| Country | RS (RSD, Europe/Belgrade) | BA (BAM, Europe/Sarajevo): money, dates, country-specific labels |
| Language | English | `sr-Latn`: missing or untranslated strings, longer labels breaking layouts, plural forms, Latin script only |
| Theme | Light | Dark: contrast, invisible borders or icons, hard-coded colours |
| Data | Seeded demo data | Empty organization (no products, orders or locations); large lists (pagination, filters); very long names, notes and SKUs; zero and very large amounts; promotions and agreed prices |
| Network | Normal | Slow 3G throttling, offline mid-action, backend stopped (error states, retry), duplicate clicks, two tabs or devices acting on the same order or draft |

## Flow catalogue

Explore each flow end to end, then try to break it: go back mid-flow, double-submit, refresh, change data in another tab, lose the connection.

**Public and account.** Login (wrong password, lockout message, language); forgot and reset password; setup and invitation acceptance (as far as possible without email); email change; profile, password and security settings; notification preferences; sign out and an expired session.

**Buyer**
- Switch the active vendor.
- Browse the catalogue: search, filters, categories, product detail, images, promotions, agreed prices, minimum and step quantities.
- Favorites.
- Cart: change quantities, invalid quantities, remove lines, the estimate label.
- Checkout:
  - two steps, delivery location, contact override, instructions modes, note
  - review expiry after 15 minutes
  - changed prices at submission, an unavailable product, an uncertain outcome ("Check status")
  - placing the order
- Shared drafts: save, open, conflict with another editor, submit from a draft, staff-restricted mode.
- Orders list and detail: states, custom stages, messages, cancellation and cancel requests (reasons required), reorder, replacement order.
- Vendors list and relationship detail.
- Stats.
- Notifications and inbox.
- Settings: team, locations (archive, default), contacts, audit, privacy.

**Vendor**
- Dashboard.
- Catalogue: create a product, activate it, edit, images, featured products, CSV import (preview and confirm, invalid files), inventory (tracking on and off, adjustments), promotions, taxonomy (categories, tags, units).
- Orders: accept, reject, stages, dispatch, deliver, cancel, handling cancel requests, messages.
- Buyers list and relationship detail, including agreed prices and disconnect.
- Locations, team, stats, plan (request a change), stages, contacts, audit, privacy.
- Notifications.

**Platform admin.** Organizations list and detail, setup invitations, plan requests, audit, support reads with a reason, privacy and recovery cases, account security.

**Mobile app only.** Tab navigation, deep links (`/invitation`, `/email-proof`), Android hardware back, pull to refresh, keyboard handling in forms, offline and resume, bearer session after restarting the app.

## Per-screen checklist

On every screen, check:

- **Purpose**: is it clear what the screen is for and what to do next? Is the primary action obvious?
- **States**: loading, empty, error (with retry), partial data, permission denied.
- **Layout**: overflow, truncation without a way to see the full text, alignment, spacing, very small text.
- **Interaction**: tap targets, keyboard and focus order, Enter submits, Escape closes, disabled buttons explain why, double clicks are safe.
- **Feedback**: success and error messages appear where the user is looking, destructive actions ask to confirm, long actions show progress.
- **Data**: money (two decimals, currency), dates (local time zone), quantities and units, and that everything matches the backend after refresh.
- **Wording**: unclear or inconsistent terms between screens and between web and mobile, untranslated keys, raw error codes.
- **Accessibility**: labels on icon buttons, contrast, headings, screen-reader names for status changes.
- **Web vs mobile parity**: the same flow behaves the same way, or the difference is deliberate.

## Severity and type

| Severity | Meaning |
|---|---|
| S1 — blocker | Data loss, wrong order or price submitted, security or privacy exposure, or a core flow impossible |
| S2 — major | A flow is possible only with a workaround, wrong information shown, or a main screen broken on one environment |
| S3 — minor | Cosmetic or layout problem, confusing but recoverable behavior |
| S4 — enhancement | Works as designed but could be clearer, faster or friendlier |

Types: `BUG`, `UX`, `VISUAL`, `A11Y`, `I18N`, `PERF`, `PARITY` (web and mobile differ), `GAP` (backend capability missing).

## Output

- One entry per finding in the [QA findings register](qa-findings.md), in its format, with status `OPEN`.
- A short run summary at the top of the register:
  - date and commit
  - environments covered and not covered, with reasons
  - accounts used (by role, never passwords)
  - counts by severity
- Anything that's a product decision rather than a defect goes in with status `NEEDS-DECISION`. The fixing agent won't change it until the user decides.
