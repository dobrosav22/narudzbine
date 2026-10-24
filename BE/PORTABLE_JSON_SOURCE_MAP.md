# Portable JSON source mapping

2026-10-22 during frozen schema70 foundation verification. This maps actual backend ports/sources, not frontend mocks. The original inventory preceded implementation; the schema72 implementation delta below distinguishes code from executed acceptance. [Selected fulfillment design](PORTABLE_JSON_IMPLEMENTATION.md) remains authoritative.

## Confirmed shared-data masks

`identity/infrastructure/web/OrderResponses.java` returns submittedByAccountId/submittedByDisplayName only when the viewer is the buyer. `OrdersController` event and message adapters return own actor/author account ID and display name only when actorOrganizationId/authorOrganizationId equals the viewer organization. Preserve exactly those masks in portable orders/events/messages; never serialize raw Orders.Snapshot/Event/Message records. Text and approved shared delivery/business contact snapshots follow the existing response projection. Do not export internal review receipts, expiry tokens, termsHash, relationship generations as authorization capabilities, or the raw SharedDrafts.Intent inside a submitted order.

`OrderReviewsController` formats all monetary price components and applied promotion values as strings and includes NET_EXCLUDING_VAT. Preserve approved immutable line prices, quantities, SKU/unit/pack meaning and original currency. No current-price recalculation or automatic conversion. Explicitly map timestamps to millisecond UTC strings; internal ports expose Instant and numeric revisions for adapters, not ready-made wire records.

## Existing sources and projection boundaries

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

## Remaining inventory work before claiming completeness

`SetupController.Invitation` is ordinary owned metadata (id/revision/purpose/recipientEmail/targetOrganizationId/state/deliveryState/dates), separate from invitation proofs/tokens. Map its actual visibility predicates before deciding the final invitation family. Ownership-transfer metadata likewise needs ordinary party/role visibility; guarded recovery/private evidence is excluded. Own plan requests and draft events need explicit bounded record forms, not an unbounded nested list. Declare applicability and each retained-history source, and extend the unpublished manifest roster deliberately if required. An empty source result must not disguise a missing query/grant or required requester/organization record.

Source queries must be fixed and bounded by the approved job's original organization/country and current requester; a separate worker role/pool may read only the approved source projections and publish derivatives, not mutate commercial data. The normal HTTP role has safe case metadata but no direct private requester/reference/artifact SELECT. Complete-or-fail snapshot generation, byte/record limits and current-publication/download authority remain required. No raw table dump or serialized internal domain record substitutes for this mapping.


## Schema72 implementation delta (full acceptance pending)

Fixed `privacy_source_*` views now bind every manifest query to an approved QUEUED job and its current original requester. Explicit PortableRows/PortableSnapshots records map all scalar and known stored-snapshot fields; PortableProjection emits every declared family or fails. No domain/table object is dumped. Separate families include invitations, ownershipTransfers, planRequests, draftEvents, partners and tracking. Partner details use the normal active connection projection or actual disconnect snapshot. Ownership-transfer visibility and effective expiry/invalidation match ordinary current owner/recipient access; no recipient epoch is exported. Invitations use exact ordinary organization/incoming-trading scope and safe delivery state, excluding proofs, tokens and private reasons. Empty required requester/organization projection fails.

Source snapshots use typed decoding and handwritten customer mapping; order review IDs/expiry/raw intent and opaque replay payloads are excluded. Product history is actual safe product audit markers. Global rows/UTF-8 bytes and snapshot time are bounded. Independent worker grants expose fixed approved-source views and technical transition functions, with no base-table/private-source/artifact SELECT or commercial writes. Focused real generation/disclosure and failure checks are underway; the full wrapper and packaged gates must pass before acceptance.
