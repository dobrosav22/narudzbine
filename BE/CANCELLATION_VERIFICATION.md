# Ordinary cancellation verification

2026-10-19. Completed locally; full-slice/provider/operator/client/hosted/CI/release gates remain open.

## Separate primary review

Reviewed original-party routing versus final buyer SUBMIT_OR_CANCEL/current restriction or vendor FULFILL authority, CSRF on replay, organization-first sorted guards/control/advisory/balance order, immutable initial header/submission/acceptance receipts and latest real-event projections. Checked buyer-only awaiting versus vendor-only accepted semantics; no terminal reopen; normalized required reason and initiating-organization exact natural response identity/object-lifetime references before token validation; frozen accepted fulfillment and private history actors. Existing unique original obligation credits now require actual rejected response or cancellation, with all-line credit/event/balance/deferred checks and unchanged mode/confirmation/headroom/generation. Buyer-status targets suppress actor, vendor-member targets only on buyer-initiated cancellation, event deduplication and atomic audit/notice production. No audit SELECT/header UPDATE/SECURITY DEFINER, no provider calls, no invented stage/request/dispatch history.

Review tightened history tests to use actual ownActorAccountId/ownActorDisplayName fields and added a second-line credit failure proving earlier line rollback. Existing initial/response SQL/default compatibility is preserved. Previous-schema upgrade preserves real identity/plan configuration; it is not evidence of hosted rollback or migration of a previously deployed commercial dataset.

## Execution

.tools/cancellation-initial.log passed3 architecture/contract checks and compilation; a mismatched selector executed0 HTTP tests, so it is not HTTP/database scenario evidence. Authoritative focused/full/artifact execution follows. Dependencies unchanged; final new artifact still requires its own checks. X/G/provider/operator/client/CI/full-slice/release gates remain open.

.tools/cancellation-focused.log passed9 unit/contract/retry checks and1 previous-schema upgrade;37 HTTP groups had1 assertion failure (old privacy field names, already corrected) and1 fixture error (attempt to deactivate a sole owner, corrected to deactivate a genuine staff actor). These are retained failures, not passing evidence. Second-line rollback scenario added before rerun.

.tools/cancellation-focused-2.log: BUILD SUCCESS,9 unit/architecture/contract/retry checks and39 real PostgreSQL IT checks (18 cancellation HTTP groups,20 prior vendor-response groups,1 schema38 upgrade), zero failures/errors/skips. Separate primary review completed after final executable/schema/test changes; verified final scope/current permission checks, receipt/event source and normalized exact identity, common credits including second-line rollback, actor privacy/suppression, immutable original success and default-off allowlist. At focused-run completion, the full/artifact gates were pending; their authoritative results follow.

## Authoritative final gate and artifact

.tools/cancellation-final-verify.log: 700 tests passed, zero failures/errors/skips, BUILD SUCCESS (85 unit;615 real PostgreSQL IT: Foundation40/AuthHttp527/IdentityBoundaries11/PasswordLogin15/SessionService22). Includes final source/schema/test/build state and18 new cancellation HTTP groups plus1 schema38 upgrade, with all prior regressions. XML totals/classes and tested/built/smoked/scanned identities cross-checked in .tools/cancellation-final-evidence.json. No executable/schema/test/build changes followed this successful full gate.

Image narudzbine-backend:vs04-cancellation: `sha256:9e64d4bd53ec3c2c1dbfb2d46311e18d79a0e26c03a19a8f59b25fb8237e9c4e`; JAR SHA256 `9cff30fc4bd88ffef9f571ed3f5cf1c654b7a170786780fc5382e058e6608748`. .tools/vs04_cancellation_container_smoke.py/.tools/vs04-cancellation-container-smoke-result.json passed schema39 migration, Linux nonroot read-only startup, private readiness200/public diagnostics404 and default-disabled business routes including cancellation. Temporary task resources cleaned.

Trivy0.76 offline BE/target/cancellation-container-vulnerabilities.json: Java/HIGH/CRITICAL0; base-image findings {'MEDIUM': 26, 'LOW': 4}. Existing advisory cache updated2026-10-16/downloaded17; Java cache updated18/downloaded19. This is not fresh production advisory status. Dependencies/build resolution unchanged; prior dependency evidence reused with those limits. Current SBOM110 components all have license metadata.

## Final repository checks

Final offline Trivy backend/root-document secret scan BE/target/cancellation-secrets.json found0 secrets; .tools, .git, FE and BE/target excluded. Disposable narudzbine-vs01 smoke container/network inventory empty. python .tools/verify_planning.py passed209 operations/204 schemas/3046 references,625 questions/545 decisions/543 requirements and543 trace rows, local links and source/document whitespace; git diff --check passed. Frontend application files remain outside this batch. No provider delivery, provisioning, hosted CI, client integration, merge or production deployment was performed.
