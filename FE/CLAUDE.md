# Project memory — read in full before doing any work

## Real backend integration (2026-10-24, D-GOV-007) — read first

The frontend runs against the real backend; the mock layer, mock types and demo accounts were
removed. Authority, in order: [openapi.yaml](../openapi.yaml) (wire contract) and the backend
rules in [design spec](../docs/architecture/design-spec.md) / [requirements](../docs/project/requirements.md); then
[integration guide](../docs/frontend/integration-guide.md) (architecture, client usage, contract rules, i18n,
local backend); then this file. Missing backend capability goes into
[backend gaps](../docs/frontend/backend-gaps.md) — never into invented client data or mock fallbacks.

The [root project instructions](../AGENTS.md) govern phase, approvals and business rules. The
planning docs below are the original product intent; where they describe mock-era data shapes,
endpoints (`04-data-contract-api-outline`) or concepts the backend does not have (self-serve
signup, subscription tiers with prices, vendor-configured order statuses, org switching), the
contract wins. Mocks, logs and previous proposals are historical evidence only.

Checks before handing work back: `pnpm typecheck`, `pnpm lint`, `pnpm test` (core unit + i18n
parity), `pnpm --filter web build`, and against the local backend the e2e checks in
[e2e testing](../docs/frontend/e2e-testing.md).

## Planning docs (current version: v1.1)

@../docs/product/product-overview.md
@../docs/product/frontend-agent-instructions.md
@../docs/product/screens-and-flows.md
@../docs/product/data-contract-outline.md
@../docs/product/visual-design-system.md

These are the current (v1.1) product documents; v1.0 is kept for history in
`docs/archive/product-v1.0/`. A future revision replaces the files in
`docs/product/` and moves the previous version to the archive.
Index of all documentation: [docs/README.md](../docs/README.md).

## Build log (what's actually happened since)

@../docs/frontend/build-log.md

**The build log takes precedence over the planning docs wherever the two
disagree** (and the backend contract takes precedence over both) — the docs are the original plan, the log is what actually got
built and decided since. If a docs file describes something the log later
overrode, follow the log.

## Your responsibility as you work

Whenever you make a decision the planning docs didn't cover, deviate from
what they say, resolve one of the open questions listed in
`docs/product/product-overview.md` §13, or finish a meaningful chunk of work —
append a dated entry to `docs/frontend/build-log.md` before ending your turn. See that
file's own header for the entry format. Don't wait to be asked.
