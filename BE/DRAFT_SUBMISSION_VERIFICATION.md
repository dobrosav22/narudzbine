# Shared draft submission verification

2026-10-19. Completed locally; hosted/operator/provider/client/full-slice/release gates remain open.

## Distinct primary review

Reviewed the final HTTP routing/CSRF/current authorization and sorted pair guards; natural original request identity without signing-key coupling; replay-before-expiry/current revision checks; shared member/own-country privacy; same-draft review/current numeric revision/exact intent; normal changed-term receipt transaction; common direct/draft order production; exactly-once stock and current permissions; reciprocal unique source/order/receipt/event linkage and deferred completeness; terminal intent/line retention; runtime grants and schema upgrade compatibility. Only definite PostgreSQL rollback is automatically retried; unknown commit is reconciled with the identical natural request. Existing direct-key replay stays distinct.

Review tightened PostgreSQL nullable CHECK expressions: draft-sourced orders require a nonnull positive source revision, and DISCARDED requires nonnull discarded_from_revision. Tests reject a falsely discarded record with missing source revision. Historical stock/obligation completeness checks remain. No new dependencies or module edges.

## Execution record

Initial focused run .tools/draft-submit-focused.log exposed the missing explicit HTTP route allowlist entry (404); corrected. Second .tools/draft-submit-focused-2.log passed the genuine schema36 upgrade and12/13 HTTP checks; one assertion expected403 for a suspended own organization, whose established session policy correctly returns401 INVALID_SESSION; assertion corrected without weakening production authorization. Expanded focused .tools/draft-submit-focused-3.log passed6 architecture/contract/retry checks and58 real PostgreSQL checks (57 HTTP/regression groups plus1 previous-schema migration), zero failures/errors/skips, BUILD SUCCESS. The reviewed nonnull DISCARDED-source check and its extra assertion were added afterward; the successful full unfiltered gate verified that final change. Final execution is recorded below.

New17 AuthHttpIT.draftSubmissions* groups cover both countries, shared authority, exact request conflicts, stale/discarded/foreign/expired binding, browser CSRF/strict bodies, tracked stock/lost response, permanently retained original order after purge/disconnection/counterparty suspension, current restriction/session invalidation, real competing submits and committing edit/discard/revocation/restriction races, producer/deferred rollback, database immutability, signing-token continuity and MockMvc. FoundationIT.draftSubmissionUpgrade* genuinely starts from schema36 with OPEN/DISCARDED intent and old creation receipts, preserves all old values, verifies new linkage null and migration repeatability. Listing/history/fulfillment/cancellation/credits/dispatch/replacements, actual provider/client/operator/hosted/CI/full release gates remain open.

## Authoritative final gate and artifact

.tools/draft-submission-final-verify.log: 617 tests passed, zero failures/errors/skips, BUILD SUCCESS (67 unit;550 real PostgreSQL IT: Foundation38/AuthHttp464/IdentityBoundaries11/PasswordLogin15/SessionService22). The full gate includes the final nonnull source checks and extra database assertion. No executable/schema/test/build changes followed this successful run. XML totals/classes and tested/built/smoked/scanned identities were independently cross-checked in .tools/draft-submission-final-evidence.json.

Image narudzbine-backend:vs04-draft-submission: `sha256:37dd09ccda1d5d723f2d6bf44eeaf120e7682f718a4c3f08bcca82dcb9662f48`; JAR SHA256 `07aab0e445ea5a2ad474558a782e23ae36b78d0cc70a8fa3371c24f0eef597f1`. .tools/vs04_draft_submission_container_smoke.py / .tools/vs04-draft-submission-container-smoke-result.json passed packaged schema37 migration, nonroot read-only Linux startup, private readiness200/public diagnostics404 and default-disabled business routes, including submission. Temporary task resources were cleaned.

Trivy0.76 offline BE/target/draft-submission-container-vulnerabilities.json: Java/HIGH/CRITICAL0; unchanged Ubuntu24.04 base26 MEDIUM/4 LOW. Existing advisory cache updated2026-10-16/downloaded17 and Java cache updated18/downloaded19; this is not fresh production advisory status. Dependency/build resolution unchanged; prior dependency evidence reused with those cache limits. Current SBOM110 components all have license metadata.

Final offline backend/root secret scan:0 findings (BE/target/draft-submission-secrets.json; .tools/draft-submission-secrets-final.log). Structural/local-link/contract/register and git diff whitespace checks passed:209 operations/204 schemas/3046 references,625 questions/545 decisions/543 requirements and trace rows. Read-only Docker inventory confirmed no remaining task-prefixed packaged-check containers/networks. No provider provisioning, PR merge, production deployment or frontend application change was performed.
