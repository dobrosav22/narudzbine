# Shared draft persistence verification

2026-10-19, local synthetic backend/infrastructure work. No provider purchase/provisioning, deployment, merge or frontend application change.

.tools/drafts-focused-final.log passed18 real HTTP/transaction groups, one previous-schema migration and6 unit/contract/architecture checks (including3 DraftRequestsTest cases), zero failures/errors/skips, BUILD SUCCESS. Initial focused run found the generic16KB body cap incompatible with the500-line contract and a synthetic contact fixture using the same source/override name. Corrected with bounded131072-byte draft bodies,500-line/Unicode/digest tests and a distinct fixture, then reran. No failed run is acceptance evidence.

Distinct primary review covered current buyer authority/CSRF on every write and replay; immutable parties, saved-intent-only reads and live access only for new line references; retained inactive/disconnected work and bounded reductions; own active new locations versus retained archived location; complete contact/INHERIT/OVERRIDE/CLEAR; scoped creator/body creation identity with original201 replay7 days/tombstones; stale revisions, no-op saves, discard source/event retention and no restore; sorted pair/buyer guards before actor/session/draft writes; atomic source/lines/attribution/receipt failure rollback; JDBC normalized references and schema constraints. The public persistence port also rejects changing vendor. Actual order references remain untrusted preparation until real review, and no SUBMITTED producer exists.

Final unfiltered .tools/drafts-final-verify.log passed542 tests, zero failures/errors/skips, BUILD SUCCESS. Surefire60; Failsafe482: Foundation34/AuthHttp400/IdentityBoundaries11/PasswordLogin15/SessionService22. Fresh XML totals agree with the log. This includes18 draft HTTP/database groups,3 request-boundary/digest unit cases and previous-schema migration with a genuinely retained favorite, alongside prior regressions. Controlled PostgreSQL barriers exercise competing saves, save/discard, disconnection and member removal. No executable/schema/test/build change followed this successful gate. This is not whole VS-08 or order-submission acceptance.

## Executed packaged checks

Final JAR SHA25621951e6d2f9cad964fb576e711669837ca19697dc3412cdba2974c3583c044a9; local image narudzbine-backend:vs08-drafts IDsha256:db1a36a0f4e95cd1ccf2fb3a49ddcae6cbde38f6420e4ed2e1dc443363bd3892. Host JAR/stored hash/image JAR and built/smoked/scanned image identities match. Evidence: .tools/drafts-image-build.log, .tools/drafts-scanned-jar.sha256, .tools/drafts-built-image-id.txt, .tools/drafts-smoke.log, .tools/vs08-drafts-container-smoke-result.json.

.tools/vs08_drafts_container_smoke.py passed schema33 controlled migration, nonroot read-only Linux startup, private readiness200/public diagnostics404, five new default-disabled persistence routes404 and still-unimplemented submission404 with previous routes. Disposable resources were removed.

Trivy0.76.0 BE/target/drafts-container-vulnerabilities.json: Java/HIGH/CRITICAL0; unchanged Ubuntu24.04 base26 MEDIUM/4 LOW. Offline existing advisory cache: vulnerability DB updated2026-10-16/downloaded17, Java DB updated18/downloaded19. This is not fresh production advisory status. Dependencies/build resolution are unchanged; previous separate dependency/license/advisory evidence is reused within these cache limits. SBOM110 components all have license metadata. No suppressions added.

Final source/root-document secret scan BE/target/drafts-secrets.json found0 secrets. Structural/link/whitespace/register checks passed:209 operations/204 schemas/3046 references,625 question IDs/545 decisions/543 requirements and543 trace rows. No executable/schema/test/build changes followed the successful full gate.

## Limits

Order review/submission and draft one-time consumption/SUBMITTED state, original stock credit/fulfillment/reorder, CSV/bulk/media, large-dataset load/query-plan work, hosted CI/real providers/restore/operator/client/full-slice/release acceptance remain unfinished. A saved replacement reference is not a validated commercial order link; a draft is not a quote, stock hold or accepted order. [Refinement](DRAFTS_IMPLEMENTATION.md), [handoff](../FRONTEND_HANDOFF.md), [status](../PROJECT_STATUS.md).
