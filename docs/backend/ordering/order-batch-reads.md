# Transaction-scoped order batch reads

One record per backend feature: Implementation, Review, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/ORDER_BATCH_READS_IMPLEMENTATION.md`: Transaction-scoped order batch reads._

2026-10-23 delegated refinement under D-GOV-005, before dependent code. The synchronous PostgreSQL ten-order profile observed6,000 repeated product-rule reads,5,000 product projections,4,020 relationship reads and roughly2,000 each of unit/stock-control/balance/base/tier/agreement/promotion reads. This is an actual query-cardinality finding, not full design-load acceptance. [Load scope](../platform/local-load.md#implementation).

Add bounded internal batch ports for vendor-scoped product/rule/taxonomy/base/agreed/promotion/stock reads and buyer quote resolution. At most1,000 input IDs per internal batch (deduplicated for lookup); public checkout stays1..500 unique lines. Use parameterized IN bindings and per-call immutable maps. No cross-request cache. Existing single-item ports remain for compatibility and arithmetic is shared. Each owning module retains its own scoped SQL, current relationship generation, positive base/agreed prices, quantity rules, exact unit-before-quantity half-up pricing, eligible single-best promotion and stable tie order.

Order evaluation validates all products/quantities and stock statuses with original line-index error ordering, then resolves prices/units in batches at the single captured business instant. Keep final UUID-sorted organization/actor/session guards and later inventory guard, no stock reservation in review. All source values are read inside the committing transaction and re-evaluated at submission as before. Unit/pack freeze and line/obligation persistence may use JDBC batches, retaining sorted locks, one row per SKU, original deductions and atomic rollback/replay/outbox. Tracked balance/event mutation semantics remain unchanged unless separately measured/reviewed.

No schema, public DTO, HTTP operation, permission, currency, pricing or business-policy change. Preserve default-off features, expiry/replay/current-authority behavior and country masking. Add real mixed-line parity/permission/stock/changed-term/rollback coverage and use existing race/role/replay suites. Re-profile actual100-line flows and source query counts; full frozen wrapper and changed artifact gates remain mandatory. Broader approved-scale load and hosted/provider/production gates are not inferred.


Focused follow-through: all242 unit/architecture checks and236 selected real domain HTTP scenarios passed. The new100-SKU matrix passes for both countries: independent single-price parity, alternate units, tiers, agreed and buyer-specific promotions, all reconciliation pages, shortage/no partial receipt, other-buyer/foreign-SKU scope,100 immutable freezes/deductions and cancellation/replay credits exactly once. Test-only wrong package, partial-page acknowledgement and accidentally exclusive-ended promotion expectations were corrected; failed logs are retained. No runtime policy was weakened. Full gate and artifact acceptance remain pending.

## Review

_Originally `BE/ORDER_BATCH_READS_REVIEW.md`: Order batch reads — distinct review._

Reviewed the final production changes separately after242 unit/architecture and236 real domain HTTP scenarios passed, plus the two-country100-SKU matrix. The matrix covers old single-item pricing parity against batched evaluation, alternating units, quantity tiers, confirmed agreement, broad/targeted active promotions, other-buyer and foreign-SKU masking, paged stock reconciliation, shortage/no partial review, all100 immutable freezes/deductions and exactly-once original cancellation credits/replay. Test-only package/paging/exclusive-end expectations were corrected without changing runtime policy. A reduced owner/two-staff stock cohort avoids unrelated source-admission pressure while retaining normal authorization/limits.

Reviewed each owning-module batch SQL predicate and parameter binding: bounded input, vendor/relationship/current-generation scope, missing-row failure and no target-label leakage. No cross-request map/cache is stored. Existing single-item ports and exact shared arithmetic remain. Candidate ordering stays creation time/UUID; agreements override tiers before one saving promotion; unit rounding precedes quantity; all currencies stay vendor/country bound.

Reviewed original input-index error ordering and current delivery/replacement guards. Both organization/current actor/session authorities precede all reads and final submission still re-evaluates terms. Stock review does not reserve. Balance locks remain sorted under inventory/organization guards; all balances are validated before batched obligations. Tracked updates/events retain their order, original quantities, confirmation epoch/headroom and transaction. Batched line/obligation/freeze statements remain inside the same rollback/replay/outbox boundary, with no new uncertain-outcome retry. Taxonomy tag lookups chunk at1,000 IDs, including large shared tag sets.

No public schema/DTO/operation, business role, country rule, feature gate, provider or dependency changed. New byte-identical artifact reuse cannot be assumed: the production JAR must be rebuilt, packaged/scanned/provenance checked and fully verified. The synchronous tiny profile improved10 full100-line lifecycles from23.29s to4.87s; review p95 fell to142ms and submission p95 to278ms. This supports the observed roundtrip change but is not the approved full design-load acceptance.

Full frozen wrapper verification, current artifact checks and subsequent approved-scale workload remain mandatory. No frontend, hosted account/provider, purchase, merge or production action is authorized or claimed.

## Verification

_Originally `BE/ORDER_BATCH_READS_VERIFICATION.md`: Order batch reads — executed verification._

2026-10-23, schema78 /225 HTTP operations unchanged. Full pinned wrapper verify passed **1,571 tests:242 unit/1,329 integration**, including996 HTTP,48 foundation and30 native-processing cases; zero failures/errors/skips. Duration18:57 with two isolated JVMs and the explicit local Docker endpoint. All681 frozen inputs remained unchanged. Evidence: .tools/order-batch-reads-final-evidence.json, final-verify.log, frozen-source.json. [Distinct review](#review).

All242 units/architecture and236 selected real domain HTTP scenarios passed before the full gate. The new two-country100-SKU matrix independently compares single-item pricing with batched review/offer results, alternating units, tiers, agreements and active broad/targeted promotions. It checks paged reconciliation, stock shortage/no partial review, other-buyer/foreign-SKU masking,100 immutable freezes/deductions and original cancellation credits/replay exactly once. Earlier test-only package, paging and exclusive promotion-end expectation failures are retained. Runtime policy was not weakened.

A synchronous PostgreSQL profile of ten actual100-line submitted/accepted/dispatched/delivered orders improved23.2902307s to4.8704947s. Review p95 fell1,188ms to142ms; submission p95 fell1,368ms to278ms. Before/after result/statements/profile files are retained under .tools/order-batch-reads-*. This tiny profile is not full design-load acceptance and does not establish a hosting capacity claim.

New shipping JAR SHA256: `7871767d76f4e8252998abec311f5274b4342d36b41a3407fc8f96d7fe395260`. Local image narudzbine-backend:vs13-order-batch-reads: `sha256:d93b173752e5e916bc4da856074d3e48cc8506d78f7f13cafe3164a3f7704e95`. Exact1,015 application classes and83 source resources match the tested classes/resources. Native binary/class hashes remain the previously verified values. Fresh packaged migration/readiness/private diagnostics/default-off/misconfiguration/containment/native sandbox checks, Linux conditional publication/replay/persistence and both country UTC/DST checks passed. Fresh full-run restore remained contained with acknowledged lost state; no ordinary reopening was inferred.

Cached image scanning recorded25 MEDIUM/4 LOW findings, no detected HIGH/CRITICAL or Java-package vulnerability.145 licensed application BOM entries and13 native inventory entries remain. Cached databases do not prove current advisory coverage; manually built ImageMagick still requires publisher review. The first unprivileged scanner attempt could not read Docker configuration; the authorized local scanner completed with the required access, without changing user-wide configuration. Source-secret, planning/reference, diff-format and exact49 owned-resource cleanup checks passed. No unrelated prototype resource was removed.

Continue approved-scale local load and final requirement/slice acceptance. Prototype synthetic-history checks are separate evidence and are not shipping functionality or full-load acceptance. No frontend, real provider, hosted registry/custody, legal/client, merge or production acceptance is claimed.
