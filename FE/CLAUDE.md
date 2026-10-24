# Project memory — read in full before doing any work

## Backend planning and business-rule approval (2026-10-12)

The [root project instructions](../AGENTS.md) govern project phase, backend
decisions, and business-rule approval. The build-log precedence rule below
records historical frontend implementation guidance only: it does not approve
backend behavior or resolve business-rule conflicts. Mocks, logs, and previous
proposals are evidence. Under the user's 2026-10-15 delegation (D-GOV-005),
the backend/infrastructure assistant chooses and records remaining recommendations
without routine questionnaires. Existing approved requirements still govern;
escalate only indispensable missing facts or irreconcilable requirement conflicts.
This supersedes the earlier ask-every-choice rule, not frontend ownership.
Application implementation awaits
explicit planning-package approval and authorization. See
[D-GOV-001](../DECISIONS.md#d-gov-001) for the user's approved clarification.
See [AI operations](../AI_OPERATIONS.md) for the expected AI-led backend and
infrastructure workflow. Historical frontend guidance below remains scoped to FE.

This is a frontend-only build. The backend lives in `../BE/` and is out of
scope — build against the mocked service layer described below, never
against a real network call.

## Planning docs (current version: v1.1)

@../docs/01-product-overview-v1.1.md
@../docs/02-frontend-agent-instructions-v1.1.md
@../docs/03-frontend-screens-and-flows-v1.1.md
@../docs/04-data-contract-api-outline-v1.1.md
@../docs/05-visual-design-system-v1.1.md

The non-suffixed files (`01-product-overview.md`, etc.) are v1.0 — kept for
history only. Always read the highest version number present in `/docs`;
if a future v1.2 (etc.) shows up, that supersedes v1.1 the same way v1.1
supersedes v1.0.

## Build log (what's actually happened since)

@BUILD_LOG.md

**The build log takes precedence over the planning docs wherever the two
disagree** — the docs are the original plan, the log is what actually got
built and decided since. If a docs file describes something the log later
overrode, follow the log.

## Your responsibility as you work

Whenever you make a decision the planning docs didn't cover, deviate from
what they say, resolve one of the open questions listed in
`01-product-overview-v1.1.md` §13, or finish a meaningful chunk of work —
append a dated entry to `BUILD_LOG.md` before ending your turn. See that
file's own header for the entry format. Don't wait to be asked.
