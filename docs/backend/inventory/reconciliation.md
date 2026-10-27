# Tracking reconciliation implementation

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/RECONCILIATION_IMPLEMENTATION.md`: Tracking reconciliation implementation._

Delegated selections under D-GOV-005, recorded before implementation on2026-10-19. Preserve D-CAT-030–047/081–086 and P1.1 all-product review; these are assistant refinements, not new user answers.

- Preparation is a safely repeatable, server-generated UUIDv7 preview while tracking is off. It freezes every genuine product/balance, including archived and absent counts, with current inventory generation and epoch. Absent counts propose zero. No active-plan or lifetime-product limit applies. Preview lifetime is exactly24 hours.
- Each page sorts product UUID ascending. Signed cursors bind vendor, preview, source generation, page size and preview deadline, never acknowledgement revision. Acknowledgements accept1..100 distinct candidates with the immutable source stock revision and bounded count; they change preview state only. Body limit64KiB accommodates the maximum bounded batch.
- Unapplied previews reject reads/edits/finalization after expiry or source-generation changes. Applied preview snapshots remain readable until their original deadline; no further edits. Finalization requires every line acknowledged and rechecks complete scope, balance revisions and cancellation-credit headroom under the current organization guard. Counts, events, audit, tracking mode and receipt commit atomically.
- Actual mode transitions advance confirmation epoch and tracking revision. Disable preserves all counts/credit obligations and does not wait for orders. Enable advances epoch then explicitly initializes/sets/confirms every reviewed balance, including archived products; it never activates products. An already-off disable is a replayable no-op.
- Disable, acknowledgement and confirmation use actor/operation/full-intent natural receipts, not new header keys. Acknowledgement intent is canonical product-ID order. Original successful results survive7 days, with permanent expired tombstones; current locked authority is checked before replay. A completed preview can never enable tracking again after a later disable. Preparation itself can safely create a new preview. No automatic cleanup or provider calls are introduced.
- Existing stock events record INITIALIZED/SET/CONFIRMED for applied counts; separate TRACKING and RECONCILIATION audits record lifecycle/progress. Synthetic credit fixtures test preservation/headroom only; real order deductions/cancellation/dispatch remain later integrations.

Runtime grants for schema30: SELECT/INSERT/UPDATE on inventory_preview and inventory_preview_line; SELECT/INSERT on inventory_lifecycle_replay and UPDATE(original_result) only for expired payload compaction. Keep schema29 control/balance/history/audit grants. No preview/source/event/receipt deletion or source-snapshot mutation is authorized. The migration owner applies V20261019200000; runtime readiness expects30. Tables are internal, with no platform commercial-write route. CompactExpiredReplay remains an internal operation; scheduler/retention execution is not delivered.

Six added operations: disableTracking, prepareReconciliation, getReconciliation, listReconciliationLines, acknowledgeReconciliationLines, enableTracking. All use existing default-off identity.http.enabled configuration and uniform own-vendor stock authority; browser writes require current CSRF/origin. No separate Idempotency-Key is added. One hundred and twenty operations are now configured when explicitly enabled.

[Verification](#verification) records executed checks and remaining limits. Product activation, actual order accounting, large lifetime-catalogue performance/provider/operator/client/full-slice/release gates remain unfinished.

## Verification

_Originally `BE/RECONCILIATION_VERIFICATION.md`: Tracking reconciliation verification._

2026-10-19, local backend/infrastructure work. No frontend application changes, purchase/provisioning, push/merge or deployment. Local uncommitted evidence is not a remote backup.

### Executed focused checks and review

.tools/reconciliation-focused-final.log:13 HTTP/transaction groups, one schema29-to30 upgrade-preservation case and eight unit/contract/architecture checks (five reconciliation cursor cases) passed, zero failures/errors/skips, BUILD SUCCESS.

- RSD/BAM absent-to-zero and retained archived counts; explicit all-product acknowledgement; no stock effects until final application; no product activation. Empty vendor enablement adds no fictitious products/events. A102-product fixture exceeds the active plan limit and spans100+2 candidates, proving page traversal after acknowledgement, no premature finalization and complete atomic initialization. This is not a production lifetime-catalogue performance result.
- Scope/signature/preview/page-size/source-generation/deadline cursor binding; five unit cases include exact24-hour expiry and previous signing-key retirement. Unapplied stale source snapshots reject reads/finalization after count/catalogue/archive/credit changes. A real PostgreSQL-blocked finalization sees a source change committed before its guard acquisition and rejects without overwriting it.
- Bounded whole counts/candidate uniqueness/source revisions and credit headroom; failed mixed acknowledgement rolls back earlier candidate writes. Synthetic credit3 survives enable/disable/re-enable with available count999999997 allowed and1000000000 rejected. No real order deduction/cancellation/dispatch is represented by this fixture.
- Incomplete/fresh/stale progress revisions; acknowledgement no-op does not double-count. Disable advances epoch, retains count/credit and invalidates older product tokens. Natural original-success replay for finalization/disable never repeats a mode change after later disable/re-enable. Exact24-hour preview/seven-day receipt boundaries, payload compaction and retained tombstones are exercised.
- Actual PostgreSQL blocking: simultaneous identical finalizations return one successful result with one count event; pending staff finalization rechecks committing removal. Removed staff cannot replay previous success. Current scoped authority and browser CSRF apply. Strict bodies/queries/candidate types and immutable source/preview bindings reject malformed/destructive operations.
- Preview-line/audit failure rolls back preparation; receipt failure rolls back acknowledgements. Count-event/audit/receipt failure at finalization rolls back control epoch/generation, counts, preview application and history together, leaving retry possible. No positive receipt survives failed business commit.
- Schema29 fixture preserves exact control/count/credit/epoch/event/replay data across repeated migration30, creates no previews or completed review, and passes readiness. Other clean/upgrade/fail-closed startup regressions run in the full gate.

Distinct primary review after focused checks covered organization/actor/session guard order and current authority, full source scope/revision/headroom rechecks, epoch semantics, applied-preview non-reuse, actor/full-intent receipts and seven-day expiry, immutable snapshot cursor binding, SQL scope/immutability and atomic history/audit/receipt failure. It found a nested candidate revision error was reported at the root field. Corrected to /lines/{index}/expectedRevision and added a targeted unit regression. Initial focused compilation also found a test helper name collision; renamed without changing application behavior. No failing scenario was skipped.

### Final gate and artifact

Initial full .tools/reconciliation-final-verify.log passed471 tests, zero failures/errors/skips. That run preceded the nested-field review fix. Final unfiltered .tools/reconciliation-final-verify-2.log passed **472 tests, zero failures/errors/skips**, BUILD SUCCESS: Surefire50, Failsafe422 (Foundation31/AuthHttp343/IdentityBoundaries11/PasswordLogin15/SessionService22). XML totals agree with the build log. This run includes the correction and its new nested-field regression. No executable/schema/test/build edits followed the successful final gate.

New local image narudzbine-backend:vs05-reconciliation, ID sha256:14f5d415e6d763d1eb4cc40ec6950ce29f3bce656c4d27c36a87cca983530f71; packaged JAR SHA256 ed3bf034460f274d51174b248360aead8615d48b586d8432366c96d7fa650f71. These are local identities, not published registry digests. BE/target/reconciliation-container-vulnerabilities.json matches that image ID: cached Trivy0.76.0 Java/HIGH/CRITICAL0, unchanged26 MEDIUM/4 LOW Ubuntu24.04 findings, no suppressions. Advisory DB updated2026-10-16/downloaded17 and Java DB updated18/downloaded19 reused offline without refresh; this is not fresh production advisory status. Dependencies/build resolution are unchanged, so prior separate dependency/SBOM advisory evidence is reused. Current SBOM110 runtime components, all licensed.

Packaged schema30 migration/nonroot read-only Linux startup/private readiness200/public diagnostics404 and six new default-disabled reconciliation method/path combinations404 passed, plus earlier smoke routes. Disposable resources were removed. .tools/vs05_reconciliation_container_smoke.py and .tools/vs05-reconciliation-container-smoke-result.json bind actual schema/image/JAR. Host JAR, built/smoked/scanned image IDs and image-side JAR hashes match. Final source/document secret scan0 and structural/link/whitespace checks passed:209 operations/204 schemas/3046 references;625 questions/545 decisions/543 requirements/trace rows. JSON/YAML agree. Final tested host JAR, packaged image and smoke/scan identities were rechecked after full verify.

### Limits

Actual product activation, order submission/deduction/original-credit/dispatch integration, large lifetime-catalogue load acceptance, retention scheduling, general replay/revision-key rotation, real provider conformance, client integration, hosted CI/recovery/operator/full-slice/release acceptance remain unfinished. Previous cursor-key tests are not proof of production key rotation. [Implementation](#implementation), [handoff](../../frontend/backend-handoff.md), [status](../../project/status.md).

Publication follow-up: activation/deactivation and combined pricing deactivation are subsequently delivered at schema31 in [activation implementation](../catalogue/activation.md#implementation)/[evidence](../catalogue/activation.md#verification). Earlier batch limitations above describe their original verification boundary. Buyer/order and external acceptance remain unfinished.
