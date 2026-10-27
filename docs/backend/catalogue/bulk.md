# Atomic catalogue bulk edits — 2026-10-20

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/BULK_IMPLEMENTATION.md`: Atomic catalogue bulk edits — 2026-10-20._

Refinement under D-GOV-005 of D-CAT-054/D-PLAN-024 and DESIGN_SPEC §11. Backend only; no new dependency, schema, provider or client implementation.

The existing POST `/api/v1/catalogue/bulk-edits` accepts 1–100 unique targets with current product and pricing revisions. Check every revision before any write under the committing vendor organization/account guard. Execute in canonical product UUID order; return request order. Existing catalogue/pricing owner ports retain validation, history and body-free audits in one transaction. Any failure rolls back everything.

Common optional actions: positive absolute base price or percentage greater than −100 and at most 1000 (at most two decimals), category set/explicit-null clear, unique disjoint tag additions/removals, activation/deactivation. Null price/active mean unchanged. Omitted arrays mean empty. Reject empty commands. Tier corrections replace a unique targeted product's whole schedule; empty removes tiers. Corrections can occur without a common price action. Resulting tag sets remain at most50. Unknown fields, duplicate targets/tags/corrections and corrections for non-targets fail validation. No SKU/unit/pack/stock/media/featured/archive changes.

Percentage: current base × (100 + percentage)/100, half-up to two decimals. Absent base, zero/negative rounded result or overflow fails. Preserve tiers unless explicitly corrected; normal minimum/step and strictly decreasing prices apply. All commands require EDIT_CATALOGUE; price/corrections also require EDIT_PRICES. Deactivate before changes; activate after price/metadata changes with normal unit/stock checks. Archived products retain single-product behavior: metadata/prices editable, publication commands invalid.

No new retry key/receipt. Original expected revisions must match. Successful changes make exact retries stale before writes; true no-ops may repeat without new audit/history. Clients refetch both resources after conflict/uncertain outcome. Late invalid targets can fail after earlier internal writes; transaction rollback prevents partial persistence.

Planned checks: both currencies, combined changes, rounding/bounds, tier corrections, no-op/stale retry, scope/CSRF/current membership, concurrent requests, late validation/persistence rollback and actual100-target execution. Executed evidence is recorded separately.

Request bodies are bounded to512KiB to accommodate100 targets and up to5000 corrected tiers, exceeding the ordinary16KiB single-resource limit. All supplied category/tag references, including removals, must be current same-vendor records of the right kind; unknown/deleted/foreign references fail422 without disclosure.

Executed checks and limits: [verification](#verification).

## Verification

_Originally `BE/BULK_VERIFICATION.md`: Atomic bulk edit verification._

2026-10-20. Completed locally; provider/client/operator/hosted/CI/full-slice/release acceptance remains open. [Refinement](#implementation). Existing schema45, no new dependency or runtime grants. No provider/client/operator/hosted/CI/full-slice/release acceptance claim.

### Separate primary review

Reviewed the complete new request/controller against D-CAT-054, D-PLAN-024, DESIGN_SPEC §11 and existing BulkChange/BulkResult. Strict bounded body/arrays/UUIDs/revisions/money, paired revision preflight, current organization/account authority and browser CSRF, scoped taxonomy references including removals, canonical product order, request-order output and ordinary owner validation preserve the approved invariants. All resource edits, price history and body-free per-product audits share one transaction. No independent commit, provider call, receipt, stock write, SKU change or unit mutation. Existing vendor guard serializes parallel writers and permission revocation; no new reverse module dependency. Lost successful response conflicts after a real change; actual no-op preserves both revision domains. Percentage calculation uses decimal arithmetic with half-up rounding once, bounded positive result; tiers need explicit corrections if incompatible. Archived publication cannot implicitly restore; tracked activation requires ordinary stock confirmation. Ordered snapshots are not edited.

### Focused execution

Initial focused command stopped at a Java test-string syntax error before tests. Corrected run passed9 unit/architecture/contract checks and11 of12 real PostgreSQL HTTP groups; membership-race fixture referenced a nonexistent table, corrected to account_identity.state without implementation/policy change. The final focused and full results below supersede that intermediate state. No failed run is counted as a completed gate.

### Authoritative execution

.tools/bulk-focused-final.log:9 parser/architecture/contract checks and15 real PostgreSQL HTTP groups passed with zero failures/errors/skips. The actual100-target scenario (synthetic plan assignment, CSV preparation, all100 price writes and101-target rejection) took2.996 seconds locally (.tools/bulk-focused-times.json); this is not hosted/production latency or capacity certification. Both currencies, input ordering, combined prices/category/tags/publication, explicit category clearing, percentage half-up/stale retry, correction/removal of tiers, stale catalogue and pricing revisions, true no-op, foreign/buyer/platform/reference denial, browser CSRF on execution/stale retry, concurrent percentage requests, committing staff deactivation, required-audit failure and second-history-row failure rollback all passed. Archived publication and unconfirmed tracked activation fail without leaking price changes; ordered unit/pack/stock and order snapshots remain unchanged. Source/contract review found no new module edge/schema/dependency/provider action. No executable/test/build edits followed the final full gate.

.tools/bulk-final-verify.log: 858 tests passed, zero failures/errors/skips, BUILD SUCCESS (102 unit;756 PostgreSQL IT: Foundation46/AuthHttp662/IdentityBoundaries11/PasswordLogin15/SessionService22). All15 new HTTP groups and6 new parser/arithmetic unit checks ran alongside existing foundation clean/prior-schema migration and previous feature regressions. Exact XML totals/classes and artifact identity checks are in .tools/bulk-final-evidence.json. No required infrastructure was skipped.

Image narudzbine-backend:vs11-bulk: `sha256:af4412af87050d5d6c87ff2e297c29bb1bfcecc9f2f0dddff9aa17c4e6d36a58`; JAR SHA256 `a9c8ff780ff5f78656ef127d5125a9900b7570d040d25175453b3133f8f2ccca`. .tools/vs11_bulk_container_smoke.py/.tools/vs11-bulk-container-smoke-result.json passed packaged schema45 migration, Linux nonroot/read-only startup, private readiness200/public diagnostics404 and default-disabled bulk route (alongside earlier route checks). Full-gate package/build/smoke/scan image/JAR identities match; disposable resources cleaned. No new migration was needed.

Trivy0.76 offline BE/target/bulk-container-vulnerabilities.json: Java/HIGH/CRITICAL0; base-image findings {'MEDIUM': 26, 'LOW': 4}. Existing advisory cache updated2026-10-16/downloaded17; Java cache updated18/downloaded19. Not fresh production advisory status. Dependencies unchanged; prior dependency decisions/inventory reused with cache limits. Regenerated SBOM110 components all have license metadata. No provider sends/provisioning/hosted CI/client integration/merge/deployment is claimed.

### Final repository checks

Final offline secret scan BE/target/bulk-secrets.json:0 findings after implementation/handoff/status/evidence finalization (excluding .tools/.git/FE/BE/target). Disposable narudzbine-vs01-* container and network inventories empty. Planning/contract/local-link/source checks passed:209 operations,204 schemas,3048 references,625 questions/545 decisions/543 requirements/543 trace rows; mappings remain separate from executed tests. git diff --check passed. This final result paragraph is documentation only; no executable/schema/test/build edits followed the full gate.
