# QA findings register

The working list between [QA exploration](qa-exploration.md), which finds problems, and the agent that fixes them. Each finding is fixed and then retested in the environment where it was found. Work from [web on mobile](web-on-mobile.md) logs its findings here too, under area `WEB-MOBILE`.

No exploration has run yet. The register is empty.

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

None yet.

## Findings

<!-- Append findings below, newest at the bottom. -->

None yet.
