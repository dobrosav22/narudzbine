# Vendor taxonomy implementation

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/TAXONOMY_IMPLEMENTATION.md`: Vendor taxonomy implementation._

2026-10-19, delegated implementation refinements under D-GOV-005; these are assistant selections, not new user answers. Implements R-CAT-002/008/015/016/020/021/024/025/028/029 and R-API-049 within the existing twelve list/create/update/delete contracts.

- One internal taxonomy table distinguishes CATEGORY, TAG and UNIT. Names use existing NFC/strip/code-point validation and Locale.ROOT lowercase comparison, scoped to vendor and kind. Active names may be reused after deletion under a new UUID; deleted UUIDs and original creation receipts remain tombstones. No restore endpoint. Category/tag names cap100; units50.
- Delete retains the row internally, advances its revision once, hides it from lists and releases its normalized name. Repeating deletion with the revision used for that successful deletion returns204; other revisions conflict. Names can change before unit freeze, including case-only changes. Exact no-ops keep revision/audit unchanged. Creation returns201, original creator's normalized original request replays200 for7 days, including after rename/deletion; other creators/scopes/kinds get404. Expiry returns409 REPLAY_EXPIRED. Minimal immutable bindings remain; snapshots can be compacted after expiry.
- Own active vendor owner/admin/staff uses uniform EDIT_CATALOGUE capability for reads and writes. Browser mutation requires CSRF; platform/buyer/foreign resources cannot gain commercial access. Organization-first exclusive command guard coordinates permission changes, name races and reference mutation. Revisions use separate category/tag/unit domains.
- Schema24 extends the existing real product identity with optional unit/category references and a product-tag association. A minimal promotion identity and category/tag associations establish real foreign-key reference guards; no product/promotion APIs or catalogue usage are invented. Reference triggers lock the vendor guard before the taxonomy row, reject deleted/wrong-kind/foreign references and preserve archived-product blockers. Future product/promotion commands must write these tables atomically; promotion archival explicitly removes operative references while retaining its frozen definition elsewhere.
- Units have a monotonic nameFrozen flag. The internal catalogue port freezes referenced units under the same vendor guard and advances revision. Future successful order submission must call this port in its transaction, after locking organizations and before order snapshots/commit. No submitted-order producer exists yet; tests of this prerequisite are synthetic and do not prove order integration. This batch must not claim R-CAT-017/024/026 end-to-end completion.
- Audits record taxonomy kind/action and changed field names only, in the same transaction. Lists implement literal normalized substring search, fixed NAME_ASC/CREATED_DESC sorting, ID tie-break and optional total from one SQL snapshot. No translation/conversion or client implementation.

Runtime needs SELECT/INSERT/UPDATE on catalogue_taxonomy, SELECT/INSERT plus UPDATE(original_snapshot) on taxonomy_creation, and SELECT on reference tables. Future product/promotion/order writers require separately reviewed least-privilege grants. Existing organization/account/session/audit grants remain. Migration owner alone performs schema changes; runtime receives no DELETE on taxonomy/history.

Verification evidence and remaining integration work will be recorded in TAXONOMY_VERIFICATION.md after execution.

## Verification

_Originally `BE/TAXONOMY_VERIFICATION.md`: Vendor taxonomy verification._

2026-10-19. Backend/infrastructure only; no frontend source change, provisioning, deployment, push or merge. Local uncommitted workspace evidence is not a remote backup or hosted release.

### Executed checks

- Pinned wrapper unit/contract/architecture checks passed. Focused final taxonomy run `.tools/taxonomy-focused-3.log` passed15 PostgreSQL integration scenarios (14 real HTTP groups plus schema23-to24 preservation), with zero failures/errors/skips. Earlier runs caught missing route admission and two test-fixture transaction-manager mistakes; these were corrected, not skipped.
- Real HTTP checks exercise all twelve operations in Serbia/Bosnia scopes; trim/NFC/case-local uniqueness, separate kind/vendor namespaces, uniform staff permissions, creator/context-bound original replay after rename/deletion, mismatched payload, seven-day expiry/compaction and retained tombstones; literal wildcard search, sorting/paging/total; strict fields/queries/UUIDs/code-point limits; browser CSRF and buyer/platform/anonymous/foreign denial; opaque revision domains/no-ops; archived-product and operative-promotion reference blockers, foreign/wrong-kind/deleted references; freeze prerequisite; response-loss retries, stale writes, real database waiters and permission removal; audit/receipt failure rollback.
- Schema23 fixture retains an actual archived product identity, pinned plan and frozen partner history across24, repeated migration and schema readiness; new reference fields startnull and taxonomy starts empty. Clean migrations are also required by the full suite.
- Distinct review checked authorization at final action, organization-before-resource guards, current revision/replay binding, deletion/name reuse, literal query parameters, JSON shape, failure rollback and future producer boundaries. Review tightened frozen normalized-name protection, added reference lookup indexes and explicit UUID ordering before the full gate.

- Final unfiltered wrapper verify: **357 tests, zero failures/errors/skips**, `.tools/taxonomy-final-verify.log` BUILD SUCCESS. Surefire40; Failsafe317 (Foundation25/AuthHttp244/IdentityBoundaries11/PasswordLogin15/SessionService22). The final gate includes the reviewed SQL indexes/frozen-name guard/UUID ordering. No executable/test/schema/build changes followed it.
- Final JAR SHA256: `3a8c40cfff1fd3c9267728302775a532feb1d9273f295d845c139a019e85b475`. Local image `narudzbine-backend:vs03-taxonomy`, image ID `sha256:1fbc6a512e9d0718e6b49179e5ce9ffcbdccbffb66f3a03b2ef475b086f1f88a`. Packaging checks ran independently while regression tests finished; final host and image-side JAR SHA256 matched, proving the same artifact was checked. Local IDs are not published registry digests.
- Packaged schema24 migration and nonroot read-only Linux startup passed; private readiness200, public diagnostics404, all12 new default-disabled method/path combinations404 plus earlier routes. Disposable resources were removed in finally. Script `.tools/vs03_taxonomy_container_smoke.py`, result `.tools/vs03-taxonomy-container-smoke-result.json`. No provider provisioning/deployment or hosted conformance implied.
- Trivy0.76.0 changed-source scan:0 secrets (`BE/target/taxonomy-secrets.json`). New image cached vulnerability scan:0 Java vulnerabilities and0 HIGH/CRITICAL; existing Ubuntu24.04 findings remain26 MEDIUM/4 LOW (`BE/target/taxonomy-container-vulnerabilities.json`), with scanned Metadata.ImageID matching the built image. No suppression. Advisory DB updated2026-10-16/downloaded17; Java identification DB updated18/downloaded19. Both were reused offline without refresh. This does not prove fresh production advisory status.
- SBOM110 runtime components, all with license metadata; dependency set unchanged. Separate prior dependency/SBOM scan evidence reused, not rerun against the same advisory DB. New image received its own scan.
- Structural checks:209 operations/204 schemas/3037 internal references,625 questions/545 decisions/543 requirements and trace rows; JSON/YAML agree, links and whitespace checked. Same baseline register counts; delegated refinements are recorded in the implementation note, not misrepresented as new user answers.

### Limits

Product identity/reference and promotion identity/target fixtures are synthetic persisted prerequisites, not implemented product/promotion workflows. Unit freeze tests call the internal port or simulate its committed database transition; actual submitted orders, immutable product unit/pack snapshots and ordering invocation remain unimplemented. No unit conversion, buyer offer taxonomy, pricing, stock, import, media or client integration is claimed. VS-03 and all provider/operator/client/release gates remain open. Provider-dependent checks remain blocked by the already recorded external inputs.

See [implementation](#implementation) for runtime grants, transaction/replay contracts and future integration obligations; existing foundation/runbook evidence supplies toolchain/scanner commands. Dependencies did not change in this batch; do not infer fresh advisory checks from reused evidence.
