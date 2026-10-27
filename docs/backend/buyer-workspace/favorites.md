# Shared buyer favorites implementation

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/FAVORITES_IMPLEMENTATION.md`: Shared buyer favorites implementation._

VS-09 favorites increment (the preceding status called this VS-06 in error; VS-06 is cancellation in IMPLEMENTATION_PLAN).

2026-10-19, delegated refinements under D-GOV-005; R-BUY-005/006/010/013 and existing contract govern.

Favorites are buyer-owned desired membership, unique by buyer/product. PUT requires current domestic offer access even for an existing reference; repeats preserve createdAt. DELETE succeeds for an absent reference and works after disconnection. Remove followed by add is a fresh membership with a new save time. Concurrent opposite actions serialize on the buyer organization; last committed desired state wins. No retry key, revision or response receipt is introduced. No catalogue snapshot or user ownership is stored.

Listing orders createdAt DESC/productId ASC, with optional total and strict existing pagination bounds. Available means current published offer access, not sufficient stock. All available offers use minimum quantity and one pricing instant. Unavailable references return only productId/createdAt, available=false and offer=null, including suspended vendors and disconnections. Reconnection recalculates current safe offers.

Transport composes a buyerworkspace.api persistence port and the existing buyer-safe offer projection. Identity gains an explicit public buyerworkspace edge; buyerworkspace imports no other business implementation. Catalogue exposes only a product-to-vendor routing lookup, which never grants access. Final current authorization remains mandatory.

For list reads, discover only page vendor IDs before final authorization, acquire those organization guards plus buyer in database UUID order before account/session, then reread the page under the buyer guard. If the current page needs an undiscovered vendor, roll back this read and repeat discovery (maximum three attempts, then503). No business mutation is retried. This prevents lock inversion and stale vendor projections without locking every favorite vendor. PUT locks both parties; DELETE needs only the buyer guard. Current membership, browser CSRF and throttling are checked on all committing actions.

Normal unavailable live-partner lookup uses an optional trading projection, not an exception caught after a transactional port has marked rollback-only. Genuine retained product identities remain readable through catalogue ownership.

Schema32 stores immutable buyer/vendor/product/save-time bindings with domestic buyer/vendor validation, product foreign key and no expiry. Deletion is explicit desired absence. Existing references survive product state/connection changes. Favorites do not reserve stock, create carts/drafts or submit orders.

Local verification and limits are recorded in [evidence](#verification).

## Verification

_Originally `BE/FAVORITES_VERIFICATION.md`: Shared buyer favorites verification._

2026-10-19. Backend/infrastructure only; local synthetic resources, no provider provisioning, deployment or frontend changes.

Focused .tools/favorites-focused-final.log passed15 real-HTTP/transaction groups, one schema31-to32 upgrade and3 architecture/contract checks, zero failures/errors/skips. Two deterministic page-churn unit checks subsequently passed with the full suite unit phase.

Distinct primary review covered buyer-owned desired state, current authority on repeat, browser CSRF, sorted page/party locks before session/account, bounded page rediscovery, retained null projection, current safe offer/price resolution, optional partner lookup, least runtime grants and migration invariants.

The initial focused run exposed a normal suspended-partner lookup throwing inside a transactional port and marking rollback-only. Corrected with optional lookup; corrected synthetic platform-account migration fixture and strict no-body expectation, then focused checks passed. The first full run identified the extracted offer mapper requiring HTTP-only revision configuration while HTTP was disabled; stopped that run, applied the same default-off HTTP condition and restarted all checks. No failed run is acceptance evidence.

Final unfiltered .tools/favorites-final-verify-2.log passed520 tests, zero failures/errors/skips, BUILD SUCCESS. Surefire57; Failsafe463: Foundation33/AuthHttp382/IdentityBoundaries11/PasswordLogin15/SessionService22. Fresh XML totals agree with the log. This includes15 favorites HTTP/database groups, two bounded-page race unit cases and the schema31 upgrade alongside prior regressions. The final startup condition correction was reviewed and the entire gate rerun. No executable/schema/test/build change followed this successful gate. Rebuilt artifact results are recorded below.

### Artifact checks already executed

Corrected final artifact: image narudzbine-backend:vs09-favorites, ID sha256:ccfa0db7974e8238b13b4973c659b663b5be4595ece19c33466e7d669acf98be. JAR SHA256 7e9a36a7ab1a25dea26619812035ee3796858021bc2871dd3494e5fe4656fb92. Host JAR, stored hash, image JAR, built image, smoke and scan identities match. .tools/favorites-image-build.log, .tools/favorites-smoke.log, .tools/vs09-favorites-container-smoke-result.json and .tools/favorites-scanned-jar.sha256 contain local evidence.

.tools/vs09_favorites_container_smoke.py passed controlled schema32 migration, nonroot read-only packaged Linux startup, private readiness200/public diagnostics404 and default-disabled favorites routes404 with prior routes. Disposable resources were removed. The first pre-fix image failed readiness; its log is .tools/favorites-smoke-before-startup-fix.log, not acceptance evidence.

Trivy0.76.0 BE/target/favorites-container-vulnerabilities.json reports Java/HIGH/CRITICAL0, unchanged Ubuntu24.04 base26 MEDIUM/4 LOW. Scan used offline existing cache: vulnerability DB updated2026-10-16/downloaded17; Java DB updated18/downloaded19. This is not fresh production advisory status. SBOM110 components all have license metadata; dependencies/build resolution did not change, so earlier separate dependency/license/advisory evidence is reused within the same cache limits. No suppression was added.

Final backend/root-document secret scan BE/target/favorites-secrets.json found0 secrets. Structural/link/whitespace/register checks passed:209 operations/204 schemas/3046 references,625 question IDs/545 decisions/543 requirements and543 trace rows. No executable/schema/test/build changes followed the final successful gate.

### Remaining gates

Shared drafts, order review/submission/original stock credits/reorder, CSV/bulk/media, load/query-plan evidence, real providers/hosted CI/restore/operator/client/full-slice/release acceptance remain unfinished. These tests do not prove frontend integration or guaranteed checkout terms. See [refinement](#implementation), [handoff](../../frontend/backend-handoff.md), [status](../../project/status.md).
