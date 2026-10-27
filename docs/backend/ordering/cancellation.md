# Ordinary cancellation refinement

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/CANCELLATION_IMPLEMENTATION.md`: Ordinary cancellation refinement._

Selected under D-GOV-005 on2026-10-19 before dependent code. Implements cancelOrder under D-ORD-004/006/010/011/012/017/021/025, original stock-credit rules and D-NOT-002. This is an assistant implementation selection, not a new user answer.

Current buyer owner/admin or unrestricted staff may cancel AWAITING_ACCEPTANCE only. Current vendor owner/admin/staff may cancel ACCEPTED only; vendors reject an awaiting order through rejection. No buyer direct cancellation after acceptance, terminal reopen, dispatch, stage or cancellation-request producer is inferred. Future stage/request migrations must explicitly extend these guards and resolve pending requests atomically. Original parties remain actionable after disconnection or counterpart suspension, but own active verified account/session/organization/current role and browser CSRF are mandatory on execution and replay. Pair organizations lock in UUID order before account/session, then vendor control, order advisory resource lock and sorted product balances.

Reason is NFC/strip nonblank<=1000 code points using existing strict input rules. Natural identity is order plus original expected revision and initiating organization; normalized reason must match. An exact original cancellation response replays permanently after current authorization, including frozen order/fulfillment response tokens; contradictory intent or another party cannot claim the original command. No separate retry key. A new stale command returns current revision; a fresh terminal/unauthorized transition fails. Existing acceptance/rejection and direct/draft submission replays retain their original successes after later cancellation.

Schema39 adds immutable order_cancellation referencing a real appended CANCELLED event at prior revision+1. Existing order headers/submission snapshots and schema38 response receipts stay unchanged. Actual latest event supplies current detail/list/history. Cancellation freezes all source commercial fields and any accepted fulfillment unchanged. One unique original-deduction credit per order/product is reused across rejection/cancellation: credit only deducted obligations, even tracking off/archived/stale; preserve confirmation/mode/headroom and invalidate reconciliation generation. No retroactive credit for original untracked orders. Receipt, event, all credits/balances, audit and notice intent commit or roll back together; deferred checks verify completeness.

Cancellation status intent targets active verified buyer original submitter plus current owner/admin, suppressing initiating actor. For buyer-initiated cancellation, also target all active verified vendor members so the counterpart learns the order is cancelled (delegated status-event recipient refinement); vendor-initiated cancellation does not broadcast to vendor colleagues. Recipients deduplicate per actual event. Three existing channel intents remain queued subject to future provider/preferences workers; no delivery claim. Reason stays in scoped history/audit, never external previews. Schema38 old initial/response rows remain default-compatible; runtime adds SELECT/INSERT only on order_cancellation and readiness39, without audit SELECT or immutable-header UPDATE authority.

Verification must use genuine submitted/accepted orders, both countries/roles/strict input/CSRF/privacy, exact replay/rotation/retention, competing cancellation/acceptance/rejection and revocation/restriction races, all-line original credits and headroom/rollback, legacy migration and prior regressions. Distinct review, full wrapper and packaged artifact/secret/document gates are required before completion.

Executed results and limits: [verification](#verification). This refinement alone is not executed evidence.

## Verification

_Originally `BE/CANCELLATION_VERIFICATION.md`: Ordinary cancellation verification._

2026-10-19. Completed locally; full-slice/provider/operator/client/hosted/CI/release gates remain open.

### Separate primary review

Reviewed original-party routing versus final buyer SUBMIT_OR_CANCEL/current restriction or vendor FULFILL authority, CSRF on replay, organization-first sorted guards/control/advisory/balance order, immutable initial header/submission/acceptance receipts and latest real-event projections. Checked buyer-only awaiting versus vendor-only accepted semantics; no terminal reopen; normalized required reason and initiating-organization exact natural response identity/object-lifetime references before token validation; frozen accepted fulfillment and private history actors. Existing unique original obligation credits now require actual rejected response or cancellation, with all-line credit/event/balance/deferred checks and unchanged mode/confirmation/headroom/generation. Buyer-status targets suppress actor, vendor-member targets only on buyer-initiated cancellation, event deduplication and atomic audit/notice production. No audit SELECT/header UPDATE/SECURITY DEFINER, no provider calls, no invented stage/request/dispatch history.

Review tightened history tests to use actual ownActorAccountId/ownActorDisplayName fields and added a second-line credit failure proving earlier line rollback. Existing initial/response SQL/default compatibility is preserved. Previous-schema upgrade preserves real identity/plan configuration; it is not evidence of hosted rollback or migration of a previously deployed commercial dataset.

### Execution

.tools/cancellation-initial.log passed3 architecture/contract checks and compilation; a mismatched selector executed0 HTTP tests, so it is not HTTP/database scenario evidence. Authoritative focused/full/artifact execution follows. Dependencies unchanged; final new artifact still requires its own checks. X/G/provider/operator/client/CI/full-slice/release gates remain open.

.tools/cancellation-focused.log passed9 unit/contract/retry checks and1 previous-schema upgrade;37 HTTP groups had1 assertion failure (old privacy field names, already corrected) and1 fixture error (attempt to deactivate a sole owner, corrected to deactivate a genuine staff actor). These are retained failures, not passing evidence. Second-line rollback scenario added before rerun.

.tools/cancellation-focused-2.log: BUILD SUCCESS,9 unit/architecture/contract/retry checks and39 real PostgreSQL IT checks (18 cancellation HTTP groups,20 prior vendor-response groups,1 schema38 upgrade), zero failures/errors/skips. Separate primary review completed after final executable/schema/test changes; verified final scope/current permission checks, receipt/event source and normalized exact identity, common credits including second-line rollback, actor privacy/suppression, immutable original success and default-off allowlist. At focused-run completion, the full/artifact gates were pending; their authoritative results follow.

### Authoritative final gate and artifact

.tools/cancellation-final-verify.log: 700 tests passed, zero failures/errors/skips, BUILD SUCCESS (85 unit;615 real PostgreSQL IT: Foundation40/AuthHttp527/IdentityBoundaries11/PasswordLogin15/SessionService22). Includes final source/schema/test/build state and18 new cancellation HTTP groups plus1 schema38 upgrade, with all prior regressions. XML totals/classes and tested/built/smoked/scanned identities cross-checked in .tools/cancellation-final-evidence.json. No executable/schema/test/build changes followed this successful full gate.

Image narudzbine-backend:vs04-cancellation: `sha256:9e64d4bd53ec3c2c1dbfb2d46311e18d79a0e26c03a19a8f59b25fb8237e9c4e`; JAR SHA256 `9cff30fc4bd88ffef9f571ed3f5cf1c654b7a170786780fc5382e058e6608748`. .tools/vs04_cancellation_container_smoke.py/.tools/vs04-cancellation-container-smoke-result.json passed schema39 migration, Linux nonroot read-only startup, private readiness200/public diagnostics404 and default-disabled business routes including cancellation. Temporary task resources cleaned.

Trivy0.76 offline BE/target/cancellation-container-vulnerabilities.json: Java/HIGH/CRITICAL0; base-image findings {'MEDIUM': 26, 'LOW': 4}. Existing advisory cache updated2026-10-16/downloaded17; Java cache updated18/downloaded19. This is not fresh production advisory status. Dependencies/build resolution unchanged; prior dependency evidence reused with those limits. Current SBOM110 components all have license metadata.

### Final repository checks

Final offline Trivy backend/root-document secret scan BE/target/cancellation-secrets.json found0 secrets; .tools, .git, FE and BE/target excluded. Disposable narudzbine-vs01 smoke container/network inventory empty. python .tools/verify_planning.py passed209 operations/204 schemas/3046 references,625 questions/545 decisions/543 requirements and543 trace rows, local links and source/document whitespace; git diff --check passed. Frontend application files remain outside this batch. No provider delivery, provisioning, hosted CI, client integration, merge or production deployment was performed.
