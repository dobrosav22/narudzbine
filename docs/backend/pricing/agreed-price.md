# Agreed buyer prices and reconnection confirmation

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/AGREED_PRICE_IMPLEMENTATION.md`: Agreed buyer prices and reconnection confirmation._

2026-10-19. Implements listAgreedPrices/setAgreedPrice/removeAgreedPrice/confirmAgreedPrices under existing D-PRI-004/021/034/035 and D-ORG-025/057/058. Transport/persistence refinements are assistant selections under D-GOV-005, recorded in DESIGN_SPEC before dependent implementation. No new interview or frontend implementation.

- Schema27 initializes an empty relationship_pricing revision for each real relationship and for future connections. No agreement, price or completed confirmation is backfilled. Existing relationship states/generations/flags remain intact. Each positive two-decimal current agreement is unique per relationship/product; vendor ownership is enforced in SQL and application scope. Country/currency follow the actual domestic vendor/buyer relationship. There are no buyer-specific tiers.
- Only current vendor owner/admin/staff with uniform EDIT_PRICES may use these four routes, including listing/editing retained agreements while disconnected. Buyer/platform/foreign organizations receive inaccessible404. Final reads and writes acquire both immutable party organization guards in database UUID order before actor/session locks, reauthorize current membership, and share lifecycle/revocation serialization. Preliminary discovery releases its own guard before final sorted pair locking. Browser mutations require CSRF/origin; strict JSON, query, UUIDv7 and money validation apply.
- PUT null expectedRevision creates only if no current agreement exists; updates require the current agreedprice/v1 token bound to that agreement identity. Normalize positive money to two places without rounding excess precision; accept no numeric JSON, sign, exponent or leading zero. A same-value active save confirms that product for the current generation if needed. A true no-op changes no revision/history/audit. Lost creation responses require list reconciliation; no separate retry keys.
- Removal retains an immutable tombstone and its history; explicit recreation gets a new UUID, so a previous agreement token cannot overwrite it. No endpoint exposes deleted prices as current. Stored agreements survive missing base price, inactive/archived products and disconnection; none activates a product or bypasses base/stock/order eligibility. Actual buyer resolution, deletion fallback to ordinary prices and promotional resolution are later offer integrations.
- GET returns a stable locked page (createdAt DESC/id ASC), optional total and required pricingRevision/relationshipRevision. These expose the previously missing review token. They do not promise a snapshot across separate pages; an intervening edit invalidates confirmation. Agreement create/change/removal/confirmation advances the persisted aggregate pricing revision.
- Confirmation requires current relationship/v1 and agreedpricing/v1 tokens and an active relationship. Up to1000 distinct selected current product agreements are validated before any write; invalid members fail the whole transaction. Empty selection is accepted only when there are no current agreements. Actual reconnect increments connection_generation; all retained agreements then require confirmation. Individual saves or explicit selection confirm only those products. The relationship flag clears when no current agreements remain dormant. Empty-set review has a relationship audit and invents no price/history. Reconfirmation with stale tokens fails409.
- Actual changed price/generation/deletion snapshots with actor/time are immutable; business data, aggregate revisions, relationship flag and audit commit together. Providers are not called. Trading domain registration is independent of HTTP/setup feature flags; controllers alone enforce exposure gates. Typed pricing/trading/catalogue API ports preserve module boundaries; pricing depends on trading.api, never its implementation.

Runtime additional privileges: SELECT/INSERT/UPDATE on relationship_pricing and agreed_price; SELECT/INSERT on agreed_price_history. No runtime DELETE on these tables or history UPDATE. New relationship creation needs INSERT on relationship_pricing because of its initialization trigger. Existing trading_relationship UPDATE is used for the confirmation summary flag. Migration owner alone changes schema.

See [verification](#verification), [handoff](../../frontend/backend-handoff.md) and [base pricing](pricing.md#implementation). This is local backend evidence; activation, promotions, inventory, offers/reviews/orders and external client/provider acceptance remain unfinished.

Schema28 promotion integration also corrects selected-confirmation JSON transport to a bounded128 KiB, allowing the already-approved1000 product IDs. Auth requests retain16 KiB. [Promotion evidence](promotion.md#verification) includes this regression; no agreed-price business semantics changed.

## Verification

_Originally `BE/AGREED_PRICE_VERIFICATION.md`: Agreed buyer-price verification._

2026-10-19, local backend/infrastructure evidence. No frontend changes, provider provisioning, purchase, push, merge or deployment. Local uncommitted files are not a remote backup.

### Executed checks

Focused `.tools/agreed-focused-4.log` passed14 new HTTP/transaction groups plus actual schema26-to27 migration preservation, zero failures/errors/skips. Two later aggregate-revision/empty-review-audit groups are included in the unfiltered gate. Earlier test-declaration syntax/encoding errors were fixed without skipping checks.

Tests cover both countries, positive two-decimal strings/maximum and invalid money, absent/create versus current update revisions, normalized no-ops, deletion tombstones/new recreation identity, immutable history, vendor staff scope, buyer/platform/foreign denial, strict queries/JSON, pages/totals and browser CSRF/CORS. Agreements persist without base prices and do not activate products.

Actual persisted disconnect/reconnect generations make retained prices dormant again. Selected review confirms only selected products; same-value active saving confirms only that product. Invalid/duplicate/missing selections fail atomically; empty review is permitted only for an empty current set. Stale relationship/aggregate tokens reject. An intervening price edit invalidates aggregate review even without a relationship revision change. Final dormant removal clears the summary flag.

Real PostgreSQL blocking exercises same-revision writes, confirmation versus edit, and committing staff removal. History/audit INSERT failures roll back agreement values/generations/tombstones/aggregate revision; confirmation/empty-review audit failure leaves required relationship state unchanged. SQL guards reject zero/excess-precision/future-generation values, destructive history changes and tombstone revival.

Schema26 fixture contains a genuine domestic relationship after actual disconnect/reconnect; migration27 preserves its exact state/generation/required flag, initializes only an empty aggregate revision and invents no agreement/history/confirmed terms. Repeated controlled migration/readiness and clean startup are checked.

Distinct primary review checked scope/current authority, sorted pair guards before actor/session locks, generation and selected-set freshness, null-create/recreation identity, decimal constraints, atomic history/audit, module API boundaries and endpoint feature gating. Review corrected preliminary lock order and added explicit empty-review audit. The first unfiltered run caught conditional trading-bean registration in HTTP-disabled contexts (Foundation and SessionService); domain registration was decoupled from endpoint flags. The initial packaged readiness check consequently failed and was repeated against the corrected artifact.

Final unfiltered wrapper `.tools/agreed-final-verify-2.log`: **411 tests, zero failures/errors/skips**, BUILD SUCCESS. Surefire40; Failsafe371 (Foundation28/AuthHttp295/IdentityBoundaries11/PasswordLogin15/SessionService22). All16 new HTTP/transaction groups and the schema26-to27 preservation fixture run alongside prior regressions. Both HTTP-enabled and HTTP-disabled contexts pass. Final host JAR hash matches built/smoked/scanned image identities. No executable/schema/test/build change followed this gate.

### Packaged artifact and scans

- Corrected local image narudzbine-backend:vs04-agreed-prices, image ID sha256:8908b6bc6ad84797b4fa85723a67b016c3d1a34e91ac766ae0c7a2524a780a67; JAR SHA256 162e24ac3dddcc2c0c583e77afe889bd16109e711bd24022415d6950b4ec638a. These are local identities, not published registry digests.
- Packaged schema27 migration, nonroot read-only Linux startup, private readiness200/public diagnostics404 and all four new default-disabled route/method combinations404 passed, plus earlier smoke routes. Disposable test resources were removed. `.tools/vs04_agreed_prices_container_smoke.py` and `.tools/vs04-agreed-prices-container-smoke-result.json` bind schema/image/JAR; corrected run `.tools/agreed-smoke-2.log`.
- Trivy0.76.0 corrected-image scan reports Java/HIGH/CRITICAL0 and existing Ubuntu24.04 findings26 MEDIUM/4 LOW; no suppression. BE/target/agreed-container-vulnerabilities.json Metadata.ImageID matches the corrected image. Advisory DB updated2026-10-16/downloaded17; Java identification DB updated18/downloaded19; both reused offline without refresh. Not fresh production advisory status.
- SBOM110 components, all licensed; dependencies unchanged, so separate prior dependency/SBOM advisory evidence is reused against the same database. Changed-source secret scan0. Structural/link/whitespace checks pass with209 operations/204 schemas/3041 resolved references,625 questions/545 decisions/543 requirements and543 trace rows; JSON/YAML agree.

### Limits

No actual ACTIVE/activation, inventory, promotions, buyer offer/review/submission or order producer exists in this increment. Storage/confirmation does not establish R-PRI-004 offer precedence, ordinary-price deletion fallback or promotional outcomes end to end; these remain later integrations. No actual client/provider/hosted CI/load/operator/recovery acceptance is claimed. Full VS-04 remains unfinished. [Implementation](#implementation) and [handoff](../../frontend/backend-handoff.md) define the backend boundary.
