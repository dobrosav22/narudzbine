# Read-only reorder preview refinement

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/REORDER_IMPLEMENTATION.md`: Read-only reorder preview refinement._

Selected under D-GOV-005 on2026-10-19 before dependent code; preserves R-BUY-004/009/012, R-CAT-004, original-buyer authorization and P1.1 projection/transactions.

GET /api/v1/orders/{orderId}/reorder-preview accepts no body/query and returns only originalOrderId and one entry per original immutable line in original order. Current original-buyer PREPARE authority and sorted buyer/vendor organization guards precede final source and live reads; owner/admin/staff may prepare, including staff restricted from submission. Nonlocking original-buyer order/vendor routing grants no authority. Vendor/platform/other buyer/country cannot use a readable counterparty order as their own reorder source.

Original is the frozen ReviewedLine, including historic quantities/prices. No order, draft, cart, review, stock hold/deduction, number, audit or notice is created; qualifying session activity/throttle retain existing technical behavior. No delivery/contact/note/replacement reference is automatically copied. Explicit draft save and current review/confirmation/submission remain separate.

Current active domestic connection and live vendor gate every product/price/stock projection. Disconnected/suspended counterparty still permits own source history: return all original lines with available=false, changes=[UNAVAILABLE], currentOffer=null, and do not read live product/price/stock data. Missing/inactive/archived product behaves the same. Reconnection reevaluates current generation/agreed-price confirmation using the existing exact pricing engine. All offers share one captured millisecond pricing instant; no historical price guarantee or quote receipt.

For a current published product, available means the original quantity satisfies current minimum/step and is currently orderable under tracking confirmation/available count; this is not a reservation. Insufficient or unconfirmed stock marks UNAVAILABLE while retaining the normally authorized safe Offer projection. Off-mode retained counts remain hidden. MINIMUM flags original quantity below current minimum; STEP flags a quantity at/above minimum outside the current step progression. Historical snapshots do not record prior minimum/step, so do not invent old values or claim to detect a rule change that leaves the quantity valid. Invalid quantities are never silently corrected: original stays intact, available=false, and currentOffer is explicitly priced at the current minimum (pricedQuantity identifies this). PRICE compares rounded final unit price only at the same valid original quantity; it is omitted for fallback quantities, which require quantity resolution first. Current Offer exposes full current base/agreed/tiers/promotion resolution. SKU/NAME/UNIT/PACK compare exact frozen text with current text, including nullable pack; normal ordered unit/pack immutability remains enforced and must not be bypassed to manufacture integration cases. Flags are deterministic in contract enum order, no duplicates; PRICE uses decimal numeric comparison, not scale or floating point.

Uses existing owner APIs and BuyerOfferProjection; no schema/dependency/module edge/grant change. Default-off identity HTTP remains. Named X/G/provider/client/release gates stay open. Verification planned: genuine orders both countries, multi-line preservation, changed current prices/agreements/promotions and quantities, inactive/archived/restored SKU/name, tracked shortage/stale/off counts, disconnection/suspension/reconnection with no live-read leak, permanent source authority/current revocation races, all-source read-only rollback/error/MockMvc behavior and full/artifact checks. Pure defensive UNIT/PACK comparison tests are not evidence that those frozen fields may be edited on real ordered products.

Executed results and limits: [verification](#verification). This refinement alone is not test execution.

## Verification

_Originally `BE/REORDER_VERIFICATION.md`: Read-only reorder preview verification._

2026-10-19. Completed locally; full-slice/provider/operator/client/hosted/CI/release gates remain open.

### Separate primary review

Reviewed original-buyer-only nonlocking routing versus final current PREPARE authority and sorted pair guards; every original frozen line retained in source order; no personal employee/contact/delivery/replacement copying; live domestic connection and current vendor gate before product/price/stock reads; safe null offers for inaccessible/inactive/archived products; current engine agreements/generation/promotions/rounding at one captured instant; original quantity validity/fallback price labeling and no invented historical minimum/step; numeric final-unit PRICE comparison only at comparable quantity; deterministic flags and frozen text; original stock orderability versus no reservation; strict GET/body/query/browser/default-off behavior; no new schemas/dependencies/grants/module edges or business writers. Existing direct/draft submissions/history and owner-port authorization invariants remain.

Ordered unit/pack cannot be changed through ordinary API; real HTTP tests prove denial and unchanged preview. Defensive UNIT/PACK comparison is a pure unit case, not fabricated commercial history. Confirmation-stale inventory metadata is injected synthetically on a genuine deducted order for the stale-read branch; this is not evidence of an operational reconciliation procedure. Normal shortage/off-mode changes use real inventory APIs. No load/provider/client/hosted/CI/full-slice/release acceptance inferred.

### Focused execution

.tools/reorder-focused.log passed9 unit/architecture/contract checks and15 real PostgreSQL HTTP groups (13 new reorder groups plus existing history/draft regressions), zero failures/errors/skips, BUILD SUCCESS. Six comparison groups and13 HTTP groups cover both countries; immutable originals; counts/balances/product/tracking unchanged on repeated previews; current base/tier/agreed generation/reconfirmation and promotion boundaries/half-up rounding; SKU/name corrections and unit/pack denial; deactivation/archive/restore/publication; explicit minimum/step fallback and valid rule changes; stock shortage/stale/off counts; disconnected/suspended no-live-read checks with table SELECT revoked; source owner/country/platform denial and restricted staff preparation; current waiting price/disconnect/removal races; multi-line mixed outcomes/order/time; strict GET/browser/database failure and MockMvc.

Authoritative final execution and artifact evidence follow. Schema37/dependencies unchanged; new artifact checks were executed.

Packaged checks completed while full regressions run: schema37 migration, nonroot read-only startup, private readiness and default-disabled preview route passed. Cached image scan has Java/HIGH/CRITICAL0 and unchanged26 MEDIUM/4 LOW base findings. Response record property-name sets exactly match required ReorderLine/ReorderPreview contract properties. The full/XML/artifact identity comparison and final secret/document checks subsequently passed; see the final record below.

### Authoritative final gate and artifact

.tools/reorder-final-verify.log: 657 tests passed, zero failures/errors/skips, BUILD SUCCESS (82 unit;575 real PostgreSQL IT: Foundation38/AuthHttp489/IdentityBoundaries11/PasswordLogin15/SessionService22). Includes every final source/test change and prior direct/draft/order-history/stock/identity regressions. XML classes/totals and final tested/built/smoked/scanned JAR/image identities were cross-checked in .tools/reorder-final-evidence.json. No executable/schema/test/build changes followed this successful full gate.

Image narudzbine-backend:vs04-reorder: `sha256:c3c7b42e42a935d46188a73a29193868e8fb331710ddb695c066005746a683e0`; JAR SHA256 `1c5a296f13bb5ed5d9cda417804761f2459193239a4f5dc3b162c98a38c43dc7`. .tools/vs04_reorder_container_smoke.py and .tools/vs04-reorder-container-smoke-result.json passed schema37 migration, Linux nonroot read-only startup, private readiness200/public diagnostics404 and default-disabled business routes including previewReorder. Temporary task resources cleaned.

Trivy0.76 offline BE/target/reorder-container-vulnerabilities.json: Java/HIGH/CRITICAL0, unchanged Ubuntu24.04 base26 MEDIUM/4 LOW. Existing advisory cache updated2026-10-16/downloaded17; Java cache updated18/downloaded19. This is not fresh production advisory status. Dependencies/build resolution unchanged; prior dependency evidence reused with those limits. Current SBOM110 components all have license metadata.

Final offline backend/root secret scan:0 findings (BE/target/reorder-secrets.json; .tools/reorder-secrets-final.log). Structural/local-link/contract/register and git diff whitespace checks passed:209 operations/204 schemas/3046 references,625 questions/545 decisions/543 requirements and trace rows. Read-only Docker inventory confirmed no remaining task-prefixed packaged-check containers/networks. No provider provisioning, PR merge, production deployment or frontend application change was performed.
