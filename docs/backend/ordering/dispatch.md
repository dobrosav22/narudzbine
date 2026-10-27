# Whole-order dispatch and delivery refinement

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/DISPATCH_IMPLEMENTATION.md`: Whole-order dispatch and delivery refinement._

Selected under D-GOV-005 on2026-10-20 before dependent implementation; assistant selections, not additional user answers. Implements dispatchOrder/deliverOrder under R-ORD-005–010/013/016/017 and original stock-credit rules.

Current vendor owner/admin/staff may dispatch ACCEPTED orders directly or from any custom stage, including a retained retired assignment, only with no pending cancellation request. Vendor delivery requires actual DISPATCHED state. Both actions are whole-order RevisionCommand operations: no line quantities, shipping integration, buyer confirmation, returns or terminal reopening. Original goods, fulfillment and submission snapshots remain immutable. Stage identity remains descriptive metadata after dispatch/delivery; reads use current labels and actual transition events freeze the labels/configuration then used. Core state controls all eligibility.

Each action retains one immutable receipt per order/action referencing its actual event and source revision/original expected token. Exact retries return that original frozen success even after delivery, renaming or revision-key change, after current authority/CSRF. Changed source intent conflicts. No separate retry key. Original acceptance/creation successes remain unchanged. Both parties' guards precede account/session authority, vendor inventory control, stage configuration, order lock and sorted product balances. Pending-request, cancellation and dispatch contenders serialize; no provider call occurs inside the transaction.

Dispatch releases only originally deducted outstanding credit obligations, exactly once, using immutable per-order/product release evidence. Available count, confirmation epoch and tracking mode do not change. Credit quantity decreases and balance revision/generation advances, invalidating older reconciliation previews. This is not a stock count adjustment and creates no fabricated count-delta event. Off-mode and archived products still release their obligations; untracked orders have no release/retroactive deduction. Other orders' credit remains. Delivery performs no inventory write. Receipt/event/release evidence, mandatory audit and buyer status notice intent commit together; deferred database guards require the actual event, all original deducted lines and corresponding recipient delivery intents. Runtime grants remain narrow; schema42 is required.

Verify both countries/roles, strict whole-order input, current authorization/replay/CSRF, pending resolution and terminal rules, live/frozen labels and history privacy, tracked/off/archived/untracked/multiple obligations, reconciliation/headroom bounds, request/cancel/duplicate races, revocation, response loss, producer/deferred/all-line rollback, previous-schema migration and the separate review/full/artifact/secret/document gates. This document records design, not executed results. Provider/client/operator/CI/release gates remain open.

Executed results/limits: [verification](#verification). The refinement alone is not execution evidence.

## Verification

_Originally `BE/DISPATCH_VERIFICATION.md`: Whole-order dispatch/delivery verification._

2026-10-20. Completed locally; full-slice/provider/client/operator/hosted/CI/release gates remain open.

### Separate primary review

Reviewed explicit whole-order ACCEPTED→DISPATCHED→DELIVERED meaning, pending request exclusion, optional-stage skipping/retired assignment/current labels versus immutable labels/configuration, no terminal reopening/returns/partial inputs. Controller performs strict input/current original-party vendor scope/CSRF before original success reconciliation; action/source-token receipts preserve frozen successes independent of revision-key changes. Pair/account/session guards precede inventory/configuration/order/balances. Request/cancellation/dispatch and duplicate delivery serialize; no provider calls in transactions. Schema42 source guard binds actual previous event, current verified active vendor actor, same timestamp/source revision and pending absence. Event guard binds actual receipt/source/immutable commercial+fulfillment/stage identity. Original deducted obligations alone yield INSERT-only release evidence; balance update changes credit/revision/generation without count/epoch/tracking change. All-line deferred completeness and queued buyer submitter/owner/admin intent apply; recipient author privacy and no platform commercial write preserved. Mandatory audit has no new runtime read/update privileges. Delivery has no inventory writer. Added actual silent omitted-release/deferred rollback and platform/duplicate delivery tests following review; final full gate must include them.

### Execution and limitations

.tools/dispatch-focused.log: initial9 unit/architecture/contract/retry checks and16 IT checks (15 HTTP groups and1 previous-schema upgrade);4 test expectation failures, no errors/skips. Corrected expected opaque malformed-revision conflict, expired synthetic session, ownActorAccountId field and buyer/vendor route scope404; these were test expectation corrections, not weakened policies. Two-product rollback test was added after that compilation. Authoritative corrected focused/full evidence follows. Schema41 upgrade preserves identity/plan configuration, not proof of migrating a deployed commercial dataset. Dependencies unchanged; cached advisory bounds and actual new artifact gates remain required. Hosted/provider/client/operator/CI/full-release gates remain open.

Final separate source/schema/test review after the two additions:18 HTTP groups are present; verified exact inventory release before/after evidence and no count-event fabrication, old source-success immutability, unchanged balance confirmation/mode, natural replay reauthorization, conditional routes and least SELECT/INSERT receipt grants. No further executable edits selected. Full gate includes all final tests.

### Authoritative corrected focused/full/artifact execution

.tools/dispatch-focused-final.log:9 unit/architecture/contract/retry and17 real PostgreSQL integration checks (16 HTTP groups plus1 schema41 upgrade) passed with zero failures/errors/skips. The final separate-review additions (actual omitted-release deferred guard/platform denial and duplicate delivery) also passed in the full suite.

.tools/dispatch-final-verify.log: 768 tests passed, zero failures/errors/skips, BUILD SUCCESS (85 unit;683 real PostgreSQL IT: Foundation43/AuthHttp592/IdentityBoundaries11/PasswordLogin15/SessionService22). All18 new dispatch/delivery HTTP groups and1 schema41 upgrade ran with prior regressions. XML totals/classes and artifact identities cross-checked in .tools/dispatch-final-evidence.json. No executable/schema/test/build changes followed the final successful full gate. Two-line second-release failure, each required producer denial, deferred commit failure and silently missing original release all preserve prior state and permit exact retry. Real duplicate/request/cancellation/committing revocation races and original success continuity after delivery/revision-key changes/168 hours ran against PostgreSQL.

Image narudzbine-backend:vs04-dispatch: `sha256:46d0afd7f3a2961a6ede2be657d70835328f2457ff839c623daa27be6282126e`; JAR SHA256 `19c4d4090cec4b37b3ed785a3d90c3e83673367c41ada680dcdc43a9a01f2e75`. .tools/vs04_dispatch_container_smoke.py/.tools/vs04-dispatch-container-smoke-result.json passed packaged schema42 migration, Linux nonroot read-only startup, private readiness200/public diagnostics404 and default-disabled new dispatch/delivery routes. Temporary task resources cleaned. Build, smoke and scan all used the JAR produced by the final full invocation.

Trivy0.76 offline BE/target/dispatch-container-vulnerabilities.json: Java/HIGH/CRITICAL0; base-image findings {'MEDIUM': 26, 'LOW': 4}. Existing advisory cache updated2026-10-16/downloaded17; Java cache updated18/downloaded19. This is not fresh production advisory status. Dependencies unchanged; prior dependency evidence reused with those limits. SBOM110 components all have license metadata. Final repository secret/document gates follow.

### Final repository checks

Final offline Trivy backend/root-document secret scan BE/target/dispatch-secrets.json found0 secrets; .tools, .git, FE and BE/target excluded. Disposable narudzbine-vs01 container/network inventory was empty. python .tools/verify_planning.py passed209 operations/204 schemas/3047 references,625 questions/545 decisions/543 requirements and543 trace rows, local links and source/document whitespace; git diff --check passed. Frontend application files remain outside this batch. No provider sends, provisioning, hosted CI, client integration, merge or production deployment was performed.
