# Portable JSON fulfillment: read-only discovery

One record per backend feature: Discovery, Implementation, Source map, Review, Verification. Domain index: [backend](../README.md).

## Discovery

_Originally `BE/PORTABLE_JSON_DISCOVERY.md`: Portable JSON fulfillment: read-only discovery._

2026-10-22 during frozen schema69 verification. D-PLAN-018 / R-PLAN-018 and DESIGN_SPEC section10 remain authoritative. This is discovery for the next serial local batch, not implemented fulfillment, new route authority or a legal conclusion.

The current JdbcPrivacyCases creates immutable intake/creation receipts; both organization and administrative reads hard-code REQUESTED/revision1. A fulfillment workflow must add explicit separate state/evidence and deliberately reconcile metadata reads with immutable original creation replay. It must not update private intake, forge completion from an artifact row, or treat support access/private-request inspection as permission to create a platform commercial export.

Existing CSV ExportEngine provides a reusable transaction pattern: current requester authority locked before generation; separately bounded REPEATABLE_READ projection; atomically encrypted publication/audit; requester reauthorization and download audit;24-hour logical access expiry distinct from held bytes. Its current kinds/date-range/safe CSV projection are not a complete portable JSON manifest. Do not simply relabel ORDERS CSV as complete owned data or add PRIVACY_JSON to a public export-kind enum without case-linked authority.

The next design must enumerate an explicit versioned manifest: requester and allowed own-organization account metadata (never credentials/proofs/provider bindings); organization/settings/locations/contacts and authorized member metadata; vendor-owned catalogue/taxonomy/SKU reservations/pricing/promotions/stock data or buyer-owned saved intent; and shared orders/lines/messages through the same ordinary-access projection. Explicitly exclude counterpart private account/support/credential data, newly inaccessible vendor catalogue content and arbitrary technical-table dumps. Every included family needs country/original-organization membership, bounds and snapshot semantics; omitted/private/derived families must be stated rather than hidden behind an all-data claim.

No platform commercial download route is permitted. A qualified operator's audited case action can authorize assisted fulfillment; the original requester still requires current same-organization owner/admin authority for download. Response loss, expiry/regeneration, role/account/organization changes and snapshot/publication failures need natural identities/revisions and tests. Reuse existing key isolation/storage accounting deliberately; held nondownloadable artifacts still count. Do not send real email/push or require provider setup for synthetic local acceptance.

Redaction preview is a separate subsequent boundary. Actual redaction requires authenticated named operator/current requester and scope verification, containment, legal/hold review, dedicated restricted authority, independent conditional-created encrypted intent with read-back digest before writes, and completion after commit. Ledger/archive/local adapters and restore reconciliation are not satisfied by the CSV or media store. Commercial purge remains disabled pending X-03; actual external qualification is future launch work, not a blocker to local code.

## Implementation

_Originally `BE/PORTABLE_JSON_IMPLEMENTATION.md`: Case-linked portable JSON fulfillment._

Selected2026-10-22 under D-GOV-005 / D-PLAN-018 / R-PLAN-018 before dependent code. Follows locally verified schema69. Local-only construction, synthetic operator/requester/key/provider fixtures; no purchases, live enrollment, real messages, statutory conclusion or production approval.

### Authority and workflow

Only an original EXPORT privacy case may authorize this derivative. A currently qualified named platform operator, authentication younger than300 seconds and browser CSRF, approves a caller-created UUIDv7 export-job ID against the current case revision with reason/private case reference. This authorizes fulfillment, not platform access to commercial content. There is no platform download or arbitrary account/organization selector. The original requester must still be an active verified owner/admin in the same original active organization/country for generation/publication/download. Loss of authority fails closed; a different owner submits their own case rather than inheriting another person's download.

Keep original privacy_case and original creation receipt immutable. Add explicit fulfillment state/evidence. Normal case reads derive current revision/state from that evidence; original creation replay remains its exact historical REQUESTED response for seven days. Initial revision1; committed approval/publication/failure/expiry/first authorized download advance current case revision, never every poll or repeated download. QUEUED means REVIEWING; usable prepared artifact means READY; the first committed authorized disclosure means COMPLETED. This is server-side authorized disclosure, not proof that every response byte reached a person. Failed or never-downloaded expired work returns to REVIEWING for operator resolution, not automatic legal rejection. Completed cases retain COMPLETED even after derivative expiry. No automatic redaction, commercial purge or hold release follows.

At most one QUEUED/READY job per case; expiry/failure permits an explicitly approved new generation with a new job ID/current revision. Same job ID and original actor/context replay the original approval result for seven days, retaining used IDs/digest afterward. Current authority is rechecked on replay. Response loss requires current status inspection and the same natural command identity, not blind creation. No Idempotency-Key.

### Data manifest

A versioned explicit record/handwritten projection, never a generic database dump. Manifest1 includes requester profile and allowed own-organization metadata; owner/admin-visible member metadata; own settings, locations, business contacts and trading connections; vendor-owned taxonomy/products/reserved SKU identities/current pricing/agreed prices/promotions/inventory with approved commercial history, or buyer-owned shared favorites/draft intent; shared order/line/event/message projections through ordinary access; safe own business audit; requester notification preferences and currently visible inbox. Derived reports need not duplicate stored order data. Every family is bound to the original organization/country, with stable IDs/order, string money, whole quantities and millisecond UTC timestamps.

Exclude credentials/hashes/proofs/sessions/provider subjects and tokens, private operator/support/legal context, counterpart private accounts or agreements, unpublished foreign vendor data, newly inaccessible catalogue content, transient/replay/provider bookkeeping and raw media bytes/keys. Buyer saved intent does not fetch inaccessible vendor masters. Shared orders/messages use the same field visibility as ordinary organization access; do not serialize raw internal snapshot/history JSON without an explicit approved projection. The manifest declares included/excluded families and bounds; never label an incomplete subset as all data.

### Generation, artifact and access

One bounded local worker slot; current authority guards precede a separately bounded REPEATABLE_READ generation snapshot. Recheck current guards at publication. Complete-or-fail generation: max100,000 emitted resource records and16MiB UTF-8 JSON,25-second snapshot bound. No silent truncation/partial downloadable document. Explicit safe failures for row/size/deadline/capacity/access errors leave the case for operator resolution. Constraints are technical resource bounds, not organization caps.

Encrypted PostgreSQL derivative storage follows the existing CSV precedent but uses a separate explicit256-bit key and SecretEnvelope domain privacy-json/v1, with128MiB privacy-artifact budget. No extra provider/account dependency for local construction. Encryption/digest/byte length are verified before a response; no plaintext artifact or private payload in logs. Technical key drain/rotation follows reviewed releases. The artifact expires24 hours after publication; polling/downloading never extends expiry. Current requester authority and an atomic disclosure audit precede the response; retries reauthorize. Browser CSRF applies to approval; read transport/Origin follows existing policy. No-store, attachment disposition, nosniff and fixed JSON media type; no direct provider URL.

Schema69 preservation applies to disposal of the new artifact/cache fields: active PLATFORM_EVIDENCE_V1 retains encrypted bytes while logical access still expires, held bytes count toward capacity, and final release permits bounded cleanup. Ordinary runtime has no private source SELECT or arbitrary artifact selector; narrow source/download functions or restricted worker grants must validate original requester/session/scope and current state. Qualified operator state/reason reads remain separate from the requester data path. No real notification is sent; clients may poll.

### Gates

Separate default-off privacy export feature/worker flags, authenticated HTTP, isolated artifact key and restricted grants. Verify both countries/types, full manifest inclusions/exclusions and counterpart denial; original requester/role/session/account/org changes and actual lock races; current revisions/natural replay/key rotation; response loss, commit/worker/snapshot failure; bounds/capacity/encryption/expiry/hold preservation/resumed cleanup; populated69/repeated migration; strict HTTP and creation Location; default-off/misconfiguration/image provenance/full wrapper gates. A source document or manifest is not executed export evidence. Redaction/independent intent-completion ledger/archive/restore remain separate prerequisites and future serial batches.


Storage refinement selected before dependent schema work: add private-source-bound jobs, immutable per-job revision events and a derived case counter/metadata view. A fixed source trigger derives requester identity from original intake; ordinary runtime never supplies or selects that private column. An audit-module safe fulfillment-state port avoids a dependency from audit internals into reporting. The existing metadata view remains unchanged for historical snapshots; the optional reporting adapter exposes only current revision/state. No fabricated SYSTEM audit actor is added: operator approval and requester disclosure have real actor audits; worker transitions have immutable source-linked job events. Completed cases require a new intake case for a later copy; only never-disclosed failed/expired generations may be explicitly reapproved on the same case.


Metadata continuity refinement before dependent code: after schema70, safe derived case revision/state reads remain available even when new export approvals/worker/download routes are disabled. Turning off an export action flag must not make an already completed case appear REQUESTED again. Apply the narrow safe metadata view grant with the migration independently of export activation; private requester/context/artifact grants stay separate. Legacy direct test constructors may omit the optional projection only when they intentionally test intake without fulfillment rows.


Projection privilege refinement before worker/source code: use a separate narrowly granted local worker database pool/role for approved-job source reads and publication; normal HTTP runtime does not receive direct SELECT of the copied private requester binding, approval reference or encrypted artifact. Requester download uses a fixed narrow source function/current authenticated scope with a committing disclosure audit before plaintext response. The worker never exposes source rows through a platform route. Worker credentials/pool exist only when its explicit feature gate is enabled; synthetic local roles suffice for tests, with no hosted provider setup. Preserve the existing default application pool/autoconfiguration. The standalone manifest declares NET_EXCLUDING_VAT amounts explicitly, matching D-PLAN-002; no tax calculation is introduced.


Key-preservation refinement before rotation/source code: logical24-hour expiry never authorizes destruction of a key needed for held ciphertext. Before single-key replacement, stop acceptance, drain queued work, pause and prove all publishers stopped, and check retained ciphertext across every state (including EXPIRED/held) is zero using the read-only per-key-family preflight. Do not infer an empty inventory from live READY counts or elapsed time. Preserve existing key/decryptability while retained encrypted evidence exists; a future versioned-key/recovery migration needs separate reviewed verification. The generic90-day credential rotation procedure cannot silently crypto-erase held evidence.

### HTTP and expiry refinement selected2026-10-22 before dependent code

Approval uses POST `/api/v1/admin/privacy-cases/{caseId}/exports` with id, expectedCaseRevision, reason and caseReference. Qualified operators have metadata GET at `/exports/{exportId}` and latest `/export`; the original requester has corresponding organization metadata routes and `/exports/{exportId}/content`. Latest lookup allows recovery after approval response loss without exposing another requester's job. No operator content route exists. Content is bounded to two simultaneous in-process decryptions; saturation returns SERVICE_UNAVAILABLE without disclosure.

Logical expiry is independent of feature/worker flags: current case metadata executes a fixed narrowly granted technical expiry function using injected Clock. It locks due jobs before the derived case counter, increments each transition once and retains held ciphertext. Expiry reads commit normally; download failure is returned after the transaction so expiration is not rolled back by its HTTP error. Approval replay stays the exact original QUEUED response and never relabels current status. This is a selected implementation boundary, not executed acceptance evidence.

### Complete projection roster refinement2026-10-22

The version1 unpublished roster adds invitations, ownershipTransfers, planRequests and draftEvents as independent bounded families. Invitations follow existing business list scope (own MEMBER/BUYER_SETUP/TRADING invitations or incoming TRADING invitations); no setup proof, private platform reason or delivery token. Ownership-transfer metadata follows existing ordinary visibility: current owner or the original recipient only. Vendor plan requests and buyer draft events use separate record families so an unbounded nested history cannot bypass the record bound. Product history is retained product audit markers, not fabricated old product values. Shared order stock events mask ORDER_DEDUCTED actor IDs consistently with the normal inventory adapter. Fixed worker source views join only an approved queued job and its currently eligible original requester; base tables, identity capabilities and private operator references have no worker SELECT grant.

Generation failure refinement selected2026-10-22 before dependent error handling: a failed read-only projection snapshot (including source/grant/decoding/deadline errors) leaves no publishable bytes and records SERVICE_UNAVAILABLE in the independent guarded authority transaction. Publication/authority transaction failures remain distinct: never convert an uncertain publication commit into a guessed failure or blindly replace its job. The next inspection uses the same natural job identity. Partners and vendor-wide tracking have separate manifest families so empty catalogues still preserve their settings.

## Source map

_Originally `BE/PORTABLE_JSON_SOURCE_MAP.md`: Portable JSON source mapping._

2026-10-22 during frozen schema70 foundation verification. This maps actual backend ports/sources, not frontend mocks. The original inventory preceded implementation; the schema72 implementation delta below distinguishes code from executed acceptance. [Selected fulfillment design](#implementation) remains authoritative.

### Confirmed shared-data masks

`identity/infrastructure/web/OrderResponses.java` returns submittedByAccountId/submittedByDisplayName only when the viewer is the buyer. `OrdersController` event and message adapters return own actor/author account ID and display name only when actorOrganizationId/authorOrganizationId equals the viewer organization. Preserve exactly those masks in portable orders/events/messages; never serialize raw Orders.Snapshot/Event/Message records. Text and approved shared delivery/business contact snapshots follow the existing response projection. Do not export internal review receipts, expiry tokens, termsHash, relationship generations as authorization capabilities, or the raw SharedDrafts.Intent inside a submitted order.

`OrderReviewsController` formats all monetary price components and applied promotion values as strings and includes NET_EXCLUDING_VAT. Preserve approved immutable line prices, quantities, SKU/unit/pack meaning and original currency. No current-price recalculation or automatic conversion. Explicitly map timestamps to millisecond UTC strings; internal ports expose Instant and numeric revisions for adapters, not ready-made wire records.

### Existing sources and projection boundaries

| Family | Actual port/source | Mapping constraint |
| --- | --- | --- |
| requester | account_identity plus original business_account | Original case requester only; current own profile metadata. Exclude provider subjects, credential/security fields and live sessions/proofs. |
| organization | organizations.api.OrganizationRecord | Own immutable type/country/currency/registration plus permitted current values, owner ID and dates. Address coordinates are ordinary decimals, not money. |
| members | MemberController/MemberService public Account projection | Own owner/admin-visible member metadata only; no provider or session internals. |
| locations/contacts | LocationRecord and BusinessContactRecord | Own active/archived entries, exact address/contact/instructions fields and explicit nullable values; never a counterpart contact-table dump. |
| connections | TradingConnections.View/Partner | Own domestic relationship state/history context. Preserve ordinary approved partner fields; no unrelated counterpart members or private context. |
| plan | VendorPlans Assignment/Plan/Request | Actual assigned plan revision/limits and own change requests, not latest-plan substitution or invented subscription price. Buyer applicability is empty. |
| products/taxonomy | VendorProducts.Item/Values, VendorTaxonomy.Item | Vendor-owned data, including archived/deleted identity context where actually retained. Preserve featured, unit/pack freeze, whole minimum/step and vendor-local names. Buyer does not receive vendor master dumps. |
| skuReservations | product_sku_reservation | Own product/current-versus-historical code identity; exporting history does not make old codes searchable/current or reusable. |
| productHistory | no standalone product snapshot history table exists | Use retained safe own product audit markers and actual immutable order snapshots. Do not invent past values from expired product_creation cache bodies. |
| pricing/history | BasePricing and product_pricing_history | Base/tiers with null unpriced states and explicit money strings; history has product/revision/actor/base/typed tiers/time. Do not copy raw arbitrary JSON. |
| agreedPrices/history | AgreedPrices and agreed_price_history | Vendor-owned agreement configuration/history only in the vendor-owned branch. Buyer history comes from ordinary shared order snapshots; no other buyer agreements. |
| promotions/history | VendorPromotions Item/Values/Labels and promotion_history | Vendor-only explicit definition/target/label projection; distinguish fixed unit price and percentage while preserving ordinary formatted value precision. Raw internal JSON is not the file schema. |
| inventory/stockHistory | VendorInventory and stock_event | Available-to-order count/null initialization, current tracking/confirmation semantics, committed credit/headroom and actual events with optional reason. No invented warehouse stock or deductions. |
| favorites/drafts | SharedFavorites and SharedDrafts | Buyer organization-shared saved intent, including retained disconnected work. Never fetch newly inaccessible vendor master/price content. No backend live cart. |
| orderStages | OrderStages configuration | Vendor-owned stages and stable IDs; historical event stage names/revisions remain their actual snapshots. |
| orders/events/cancellations/messages | Orders API and the existing public adapters | Original participant scope and the masks above. Shared history stays readable after disconnect according to ordinary access. No stock-obligation/provider/replay tables in the customer document. |
| businessAudit | JdbcAuditReads safe organization projection | Business-only allowlists and allowed shared reasons, never platform/private support or credential context. Include the new safe PRIVACY_EXPORT_DOWNLOADED event. |
| preferences/inbox | Inbox.Preferences/Preference/Item | Original requester only, not every organization member. Preserve resolved ordinary preferences and currently visible inbox cutoff; never device tokens or delivery/provider metadata. |

### Remaining inventory work before claiming completeness

`SetupController.Invitation` is ordinary owned metadata (id/revision/purpose/recipientEmail/targetOrganizationId/state/deliveryState/dates), separate from invitation proofs/tokens. Map its actual visibility predicates before deciding the final invitation family. Ownership-transfer metadata likewise needs ordinary party/role visibility; guarded recovery/private evidence is excluded. Own plan requests and draft events need explicit bounded record forms, not an unbounded nested list. Declare applicability and each retained-history source, and extend the unpublished manifest roster deliberately if required. An empty source result must not disguise a missing query/grant or required requester/organization record.

Source queries must be fixed and bounded by the approved job's original organization/country and current requester; a separate worker role/pool may read only the approved source projections and publish derivatives, not mutate commercial data. The normal HTTP role has safe case metadata but no direct private requester/reference/artifact SELECT. Complete-or-fail snapshot generation, byte/record limits and current-publication/download authority remain required. No raw table dump or serialized internal domain record substitutes for this mapping.


### Schema72 implementation delta (full acceptance pending)

Fixed `privacy_source_*` views now bind every manifest query to an approved QUEUED job and its current original requester. Explicit PortableRows/PortableSnapshots records map all scalar and known stored-snapshot fields; PortableProjection emits every declared family or fails. No domain/table object is dumped. Separate families include invitations, ownershipTransfers, planRequests, draftEvents, partners and tracking. Partner details use the normal active connection projection or actual disconnect snapshot. Ownership-transfer visibility and effective expiry/invalidation match ordinary current owner/recipient access; no recipient epoch is exported. Invitations use exact ordinary organization/incoming-trading scope and safe delivery state, excluding proofs, tokens and private reasons. Empty required requester/organization projection fails.

Source snapshots use typed decoding and handwritten customer mapping; order review IDs/expiry/raw intent and opaque replay payloads are excluded. Product history is actual safe product audit markers. Global rows/UTF-8 bytes and snapshot time are bounded. Independent worker grants expose fixed approved-source views and technical transition functions, with no base-table/private-source/artifact SELECT or commercial writes. Focused real generation/disclosure and failure checks are underway; the full wrapper and packaged gates must pass before acceptance.

## Review

_Originally `BE/PORTABLE_JSON_REVIEW.md`: Complete portable JSON batch: separate review (2026-10-22)._

A deliberate pass over the final service/controller, source mappings, SQL state/privilege boundary, worker and contract was performed after the initial focused checks. This is distinct from writing the implementation; full and packaged acceptance remain pending.

Resolved findings:
- Security-chain/CORS registration must accompany the six routes; the real HTTP test caught the missing registration before acceptance.
- Latest administrative metadata must use generation order, not client UUID or equal injected timestamps. Same-natural-ID approvals serialize and cross-case reuse fails closed.
- Ownership transfers require ordinary current owner/recipient visibility and virtual expiry/invalidation/revision, not only their stored state. Source projection now matches those rules and excludes epochs.
- Worker startup must tolerate only the existing public hold-state column, while denying every other base source/identity/artifact column and all commercial DML. Separate restricted-role generation and overprivileged-role rejection are executed.
- The HTTP grant file includes qualification SELECT/locking directly; enabling JSON does not require granting private-case review disclosure capability.
- Snapshot failures fail the whole job after the read-only transaction; publication failures are outside that catch and retain their actual outcome. Deadline checks cover the final serialization step, not only rows.
- Held EXPIRED ciphertext counts toward capacity and key preservation. Logical expiry remains available through ordinary case metadata while action/worker flags are off.

Focused evidence: `.tools/portable-json-reviewed-focus.log` passed10 unit/19 integration, including2 actual HTTP scenarios and16 dedicated PostgreSQL cases. The latter exercises current requester, both countries/types, immutable approval replay, integrity rollback, real restricted views, populated pricing/history, held disposal/capacity, actual committing role reduction, source-grant loss, whole-document row/Unicode-byte bounds and an actual bounded PostgreSQL timeout. `.tools/portable-json-config-focus.log` passed3 independent configuration tests. Final direct-runtime raw-column denial assertions and default-off route coverage are included in the forthcoming full gate; do not claim those new assertions executed before it passes.

Remaining release limits: synthetic local identities/fixtures only; no live provider, legal/operator enrollment, client integration, independent recovery/restore or production acceptance. A complete portable JSON export does not authorize redaction or replace the independent encrypted deletion-intent/completion ledger.

## Verification

_Originally `BE/PORTABLE_JSON_VERIFICATION.md`: Portable JSON storage/status/encoding foundation: local verification._

2026-10-22. Schema70;213 existing operations. This verifies the foundation, not complete portable JSON fulfillment. [Selected design](#implementation), [source mapping for the next increment](#source-map).

Full wrapper passed **1383 checks** (162 unit/1221 integration, including972 HTTP), zero failures/errors/skips. All590 frozen executable/test/build/grant/contract inputs matched. Records: `.tools/portable-json-foundation-final-verify.log` and `.tools/portable-json-foundation-final-evidence.json`.

Implemented: private-source-bound export jobs; immutable per-job transition events and derived current case revision/state; guarded qualified approval/current requester publication/disclosure; queue/publication deadline and hold-aware encrypted-byte expiry/retirement; safe case metadata continuity independent of future export action flags; exact immutable intake/creation replay; a default-off port/key/worker configuration; and an internal bounded explicit-record JSON sink with complete family order, string money/Unicode/null preservation and NET_EXCLUDING_VAT manifest. No requester-data source projection, approval/status/download service/controller or generation worker is implemented yet. No real file or customer case was fulfilled.

Focused10 unit/34 PostgreSQL+HTTP checks passed, including populated69/repeated Flyway, existing privacy/private-review/hold scenarios and actual HTTP case progress through REVIEWING/READY/COMPLETED while action flags stay off and original creation replay stays unchanged. The synthetic metadata scenario uses a schema-valid fixture artifact to test state, not an end-to-end encrypted download. `.tools/portable-json-reviewed-foundation-focus.log`.

Separate disposable PostgreSQL source/transition probe confirmed derived requester identity, matched named approval/disclosure, wrong-session denial, unchanged intake, immutable events, held expiry/resumed disposal and late-publication rejection. The exact installed migration guard bodies match the tested draft hashes. Read-only key-drain counts included EXPIRED/held ciphertext and became empty only after actual disposal. `.tools/portable-json-schema-probe-result.json`. Scripted assertions are separate from JUnit totals and are not proof of the unfinished data manifest/worker.

Distinct review checked ordinary shared-order/event/message masks; safe optional state-port module boundaries; source/role/session/country/revision guards; nullable payload shapes; no invented SYSTEM actor; atomic derived transitions; complete-or-fail encoding limits; retained keys/ciphertext under holds; mandatory safe metadata grant; and default-off configuration. A key-drain procedure was corrected to count every retained ciphertext state, not just live READY artifacts. Counts alone do not prove writers stopped.

Packaged migration, nonroot read-only startup, unconfigured feature/worker/provider rejection, synthetic qualification script, native sandbox, matched tested classes/resources/JAR/image/native bytes, cached scan/source-secret/document checks and owned disposable-resource cleanup passed. A transient test-owned helper remained immediately after JVM completion and disappeared automatically before the final clean inventory. Image `sha256:59ca4905192281059240b1b7935aa6ddb40f6aa6b08eab39164a66b8755b6453`; JAR SHA256 `e079ee0a1e24be6a64c9a72dbc36cee9e12cc1c365bdd2023f1eea99f5b62ed1`; native binary `ff9918fb7448b86eb0935d6143ba1ab288eca4e9dd67b80c977387ebf994f61f`. Provenance checked866 application classes and75 source resources. Cached scan:25 MEDIUM/4 LOW, no HIGH/CRITICAL or detected Java findings. Manual ImageMagick publisher-review limitation remains.

Keep future export actions/workers off until source manifest, restricted role/pool and requester-only audited services/routes are implemented and verified. Apply the narrow safe metadata grant with schema70 independently of those flags. Readiness69 artifacts reject schema70; no compatible rollback to the previous image is asserted. No provisioning, real messages, operator enrollment/legal conclusion, independent recovery/restore/client integration or production release occurred. Actual redaction still requires its independent verified intent/completion ledger and reviewed legal/hold/containment procedure.
