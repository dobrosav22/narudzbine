# Direct order submission verification

2026-10-19. Completed locally; full-slice/provider/client/release gates remain open. Backend/infrastructure only.

## Separate primary review

Reviewed the final HTTP transaction/receipt engine/order persistence/inventory producer/schema/notifications/audit and response mapping separately from implementation. Scope: nonlocking admission versus current final authorization, sorted pair/account/session order, nonblocking scoped key lock, seven-day success/permanent tombstone, unknown-commit reconciliation and definite-rollback-only retries; all-line current terms, no commercial side effects on TERMS_CHANGED, refreshed receipt transaction outcome and purge coordination; genuine immutable party/delivery/price/actor/event snapshots and local-year numbering; whole quantities and available-to-credit movement, no retroactive untracked deduction, original obligation/event linkage and counterparty actor privacy; strict DTOs/money/time/nullability and default-off routes.

Review corrections: preserve the original stock-event delta equation while extending its separate transition constraint; use elapsed expiry arithmetic across DST and explicit JDBC UTC; hide buyer actors from vendor stock-event projections; coordinate valid receipt reads with technical purge without UPDATE grants; preserve direct key identity and original success revision across signing-key rotation. No frontend/provider/merge/deployment work. Later draft consumption/fulfillment/cancellation/credit release/replacement and notice delivery remain explicit unfinished work.

## Executed checks so far

.tools/orders-focused-5.log: BUILD SUCCESS,7 focused unit/architecture/contract tests and38 real PostgreSQL IT checks (37 HTTP/review/submission groups and1 previous-schema migration), no failures/errors/skips. Additional all-line and promotion-boundary acceptance plus final formatting are included in the following final full gate; do not treat the earlier focused result as final evidence. Failed diagnostic runs are retained separately; their synthetic SQL details are not public API output.

## Final executed full and artifact gates

.tools/orders-final-verify-3.log:590 tests passed, zero failures/errors/skips, BUILD SUCCESS. Surefire67; Failsafe523: Foundation36/AuthHttp439/IdentityBoundaries11/PasswordLogin15/SessionService22. Fresh XML totals agree. This includes22 new direct submission HTTP/transaction/MVC groups,3 retry-protocol unit checks,1 vendor local-year boundary check and1 prior-schema migration with all prior regressions. Real PostgreSQL barriers exercise concurrent same/different keys, shortage/permission/disconnection/price races, receipt reader/purge coordination and actual producer/deferred-commit rollback. Unit checks distinguish unknown connection outcome from definite rollback; no real provider/network commit-loss claim is made. Response-loss reconciliation is exercised by repeating an existing committed request, without creating another order.

Packaged evidence: .tools/orders-image-build.log, .tools/orders-smoke.log and .tools/vs04-direct-orders-container-smoke-result.json passed schema35 migration, read-only nonroot Linux startup, private readiness200/public diagnostics404 and default-disabled direct POST/order-detail GET404 with prior routes. Disposable resources were removed. The default-off internal plan bean assertion also passed. Host/tested/packaged/scanned JAR and built/smoked/scanned image IDs match; .tools/orders-final-evidence.json records the comparison. No executable/schema/test/build changes followed this successful full gate.

Trivy0.76.0 BE/target/orders-container-vulnerabilities.json: Java/HIGH/CRITICAL0, unchanged Ubuntu24.04 base26 MEDIUM/4 LOW. Existing offline vulnerability DB updated2026-10-16/downloaded17 and Java DB updated18/downloaded19; no fresh production advisory claim. Dependencies/build resolution are unchanged; earlier dependency/license/advisory evidence is reused with those cache limits. Current SBOM110 components all contain license metadata. Final source/root-document secret scan and structural checks are recorded below after document completion.

## Remaining gates

Shared draft submission/one-time consumption, list/history/fulfillment/cancellation/credit release/replacement workflows, actual notification preferences/workers/providers, large-data/load/query-plan/queue/purge SLA, hosted CI/provider/restore/operator/client/full-slice/release acceptance remain open. An earlier stock-delta fingerprint/signing-key rotation compatibility issue is recorded in PROJECT_STATUS for a separate bounded fix before real rotation/production; direct-order rotation tests do not prove that older path. No provisioning, deployment, merge or frontend changes.

First unfiltered run (.tools/orders-final-verify.log):67 unit checks and all439 HTTP checks passed; two Spring default-off startup cases failed because the new order producer eagerly injected the HTTP-conditional VendorPlans bean. Corrected to deferred provider lookup on actual submission with no fallback or skipped plan check. The following unfiltered rerun is authoritative; earlier failure is preserved.

Final review additionally removes the setup-HTTP condition from the internal JDBC plan owner bean and adds a default-off context assertion for that port; ordinary ordering must not depend on invitation endpoint enablement. Fulfillment location uses the explicit existing Location DTO (currently null before acceptance), not an untyped Object. A final full rerun after these changes and new packaged artifact are required.

The intermediate .tools/orders-final-verify-2.log run was deliberately cancelled after default-off Foundation36 passed because final review changed plan-bean availability and the typed nullable DTO. It is not a completed gate. .tools/orders-final-verify-3.log and its final artifact will be authoritative.

Final image sha256:2a6b85b3dc99e820c660f5c2178629171e7ff52d16ff5ebe87eb06d47b557fa2; JAR SHA256c39743a06bb50e200e53a61cb78b6b145c68edc9e177c0a8f00eed38b94c5f60.

Final secret/document checks: BE/target/orders-secrets.json contains0 findings across backend/root sources (excluding generated/tool/FE history), using offline secret-only scanning. The first scanner attempt unnecessarily resolved Maven metadata and hit HTTP429; it produced no successful report and was replaced by the offline run (.tools/orders-secrets-offline.log), not counted as a pass. Final structural/link/register/whitespace checks passed209 operations/204 schemas/3046 references,625 questions/545 decisions/543 requirements and trace rows. No source/schema/test/build edits followed the successful gate.
