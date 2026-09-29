# Project memory — read in full before doing any work

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
