# Backend

Per-feature engineering records. Each file merges a feature's discovery, implementation decisions, review, verification evidence and operations notes (formerly separate `BE/*_IMPLEMENTATION.md`, `*_VERIFICATION.md`, … files). Wire contract: [openapi.yaml](../../openapi.yaml); rules: [design spec](../architecture/design-spec.md).

- [Increment log](increment-log.md) — chronological backend increment notes (formerly `BE/README.md`).

## Identity and sessions

Login, browser/native sessions, reauthentication, passwords, login-email change, Google/Apple, exceptional recovery, own account and language.

- [auth-http](identity/auth-http.md) — VS-01 HTTP authentication increment
- [exceptional-recovery](identity/exceptional-recovery.md) — Exceptional recovery implementation
- [external-login](identity/external-login.md) — External authentication implementation
- [identity-core](identity/identity-core.md) — VS-01 implementation record
- [locale-self](identity/locale-self.md) — Locale roster and staff self-deactivation
- [login-email-change](identity/login-email-change.md) — Login-email change implementation
- [login](identity/login.md) — VS-01 login boundary increment
- [own-account](identity/own-account.md) — VS-01 own account and language increment
- [password](identity/password.md) — Password lifecycle implementation
- [profile](identity/profile.md) — VS-01 own profile editing increment
- [reauth](identity/reauth.md) — VS-01 password reauthentication increment

## Organizations

Organization settings and state, closure, locations, business contacts, members, setup invitations, ownership transfer, admin directory, commercial support.

- [admin-directory](organizations/admin-directory.md) — Administrative directory and bounded staff management
- [commercial-support](organizations/commercial-support.md) — Reason-scoped commercial support
- [contact](organizations/contact.md) — VS-01 business contacts
- [location](organizations/location.md) — VS-01 saved locations increment
- [member-setup](organizations/member-setup.md) — Member invitations and setup
- [member](organizations/member.md) — VS-01 member lifecycle
- [organization-closure](organizations/organization-closure.md) — Organization closure
- [organization-state](organizations/organization-state.md) — Organization suspension and reactivation
- [organization](organizations/organization.md) — VS-01 own organization settings increment
- [ownership](organizations/ownership.md) — VS-01 ordinary ownership transfer
- [setup](organizations/setup.md) — Organization setup invitations

## Trading relationships and plans

Buyer invitations, connections and disconnection, partner details, vendor plans and plan requests.

- [connection-lifecycle](trading/connection-lifecycle.md) — Connection lifecycle implementation
- [partner](trading/partner.md) — Partner details implementation
- [trading](trading/trading.md) — Buyer invitations and domestic trading connections
- [vendor-plans](trading/vendor-plans.md) — Vendor plan implementation

## Catalogue

Taxonomy, products, activation, bulk edits, CSV import, buyer offers, featured products.

- [activation](catalogue/activation.md) — Product activation/deactivation
- [bulk](catalogue/bulk.md) — Atomic catalogue bulk edits — 2026-10-20
- [csv-batch](catalogue/csv-batch.md) — Bounded catalogue/import transaction batching
- [csv-import](catalogue/csv-import.md) — Create-only CSV import refinement
- [merchandising](catalogue/merchandising.md) — Featured products and most-ordered suggestions
- [offers](catalogue/offers.md) — Buyer offers
- [product](catalogue/product.md) — Inactive product and SKU implementation
- [taxonomy](catalogue/taxonomy.md) — Vendor taxonomy implementation

## Pricing

Base and tier pricing, agreed buyer prices, promotions.

- [agreed-price](pricing/agreed-price.md) — Agreed buyer prices and reconnection confirmation
- [pricing](pricing/pricing.md) — Base pricing and volume-tier implementation
- [promotion](pricing/promotion.md) — Vendor promotion lifecycle

## Inventory

Stock counts, adjustments and the reconciliation that turns tracking on.

- [inventory](inventory/inventory.md) — Inventory counts and history
- [reconciliation](inventory/reconciliation.md) — Tracking reconciliation implementation

## Media

Image upload, quarantine, native processing, delivery and product galleries.

- [gallery](media/gallery.md) — Catalogue gallery management — 2026-10-20
- [image-delivery](media/image-delivery.md) — Processed image delivery and cleanup refinement
- [native-processing](media/native-processing.md) — Native image processing refinement
- [upload](media/upload.md) — Image upload/private quarantine — 2026-10-20

## Ordering

Order review and submission, history, vendor responses, stages, cancellation, dispatch/delivery, messages, replacements, read performance.

- [cancellation-requests](ordering/cancellation-requests.md) — Cancellation request refinement
- [cancellation](ordering/cancellation.md) — Ordinary cancellation refinement
- [dispatch](ordering/dispatch.md) — Whole-order dispatch and delivery refinement
- [messages](ordering/messages.md) — Order messages refinement
- [order-batch-reads](ordering/order-batch-reads.md) — Transaction-scoped order batch reads
- [order-history](ordering/order-history.md) — Order listing and history refinement
- [order-lifecycle-guards](ordering/order-lifecycle-guards.md) — Narrow shared lifecycle party guards — selected prototype
- [order-page-decode](ordering/order-page-decode.md) — Per-page immutable order-line decoding — selected refinement
- [order-response](ordering/order-response.md) — Vendor order response refinement
- [order-reviews](ordering/order-reviews.md) — Order review receipts refinement
- [order-stages](ordering/order-stages.md) — Custom order stages refinement
- [order-submission](ordering/order-submission.md) — Direct order submission — implementation boundary
- [replacements](ordering/replacements.md) — Replacement-order linkage refinement

## Buyer workspace

Shared drafts and their submission, favorites, reorder preview.

- [draft-submission](buyer-workspace/draft-submission.md) — Shared draft submission refinement
- [drafts](buyer-workspace/drafts.md) — Shared draft persistence refinement
- [favorites](buyer-workspace/favorites.md) — Shared buyer favorites implementation
- [reorder](buyer-workspace/reorder.md) — Read-only reorder preview refinement

## Notifications

External delivery (email/push), devices, preferences and inbox.

- [devices](notifications/devices.md) — Session-bound push registrations
- [external-delivery](notifications/external-delivery.md) — Verified devices and external delivery
- [inbox](notifications/inbox.md) — Notification preferences and in-app inbox refinement

## Reporting

Business reports, report authority/indexing, CSV exports.

- [csv-exports](reporting/csv-exports.md) — Own-organization CSV export refinement — 2026-10-21
- [report-authority](reporting/report-authority.md) — Short report authority guards — selected implementation refinement
- [report-summary-index](reporting/report-summary-index.md) — Reporting summary covering index — selected performance batch
- [reporting](reporting/reporting.md) — Business reporting refinement — 2026-10-20

## Privacy and audit

Audit trail and archive, privacy cases, portable JSON, redaction, retention holds, case disposition, independent evidence.

- [assisted-privacy-discovery](privacy-and-audit/assisted-privacy-discovery.md) — Assisted privacy and hold dependency inventory
- [attribution-redaction](privacy-and-audit/attribution-redaction.md) — Historical attribution redaction — selected next increment
- [audit-archive](privacy-and-audit/audit-archive.md) — Independent daily audit archive
- [audit-read](privacy-and-audit/audit-read.md) — Safe audit reads refinement — 2026-10-21
- [audit](privacy-and-audit/audit.md) — VS-01 session audit increment
- [case-disposition](privacy-and-audit/case-disposition.md) — Reviewed redaction case disposition — selected next batch
- [email-redaction](privacy-and-audit/email-redaction.md) — Assisted email redaction — selected next increment
- [hold-enforcement-discovery](privacy-and-audit/hold-enforcement-discovery.md) — Hold enforcement entry-point inventory
- [independent-evidence](privacy-and-audit/independent-evidence.md) — Independent privacy/recovery evidence: next dependency discovery
- [portable-json-completion](privacy-and-audit/portable-json-completion.md) — Complete portable JSON: local verification
- [portable-json](privacy-and-audit/portable-json.md) — Portable JSON fulfillment: read-only discovery
- [privacy-case](privacy-and-audit/privacy-case.md) — Assisted privacy case request and metadata reads
- [privacy-catalogue-discovery](privacy-and-audit/privacy-catalogue-discovery.md) — Remaining privacy catalogue discovery — 2026-10-22
- [private-case-review](privacy-and-audit/private-case-review.md) — Restricted private-case review
- [redaction-preview](privacy-and-audit/redaction-preview.md) — Read-only redaction planning: next-batch discovery
- [retention-holds](privacy-and-audit/retention-holds.md) — Case-linked retention holds
- [scoped-redaction](privacy-and-audit/scoped-redaction.md) — Scoped redaction intent/commit/completion

## Retention

Technical retention of replays, deliveries, secrets, proofs, sessions and notifications.

- [creation-replay-retention](retention/creation-replay-retention.md) — Promotion and export creation replay retention
- [delivery-body-retention](retention/delivery-body-retention.md) — Bounded delivery-body retention
- [identity-secret-retention](retention/identity-secret-retention.md) — Identity delivery-secret retention
- [notification-retention](retention/notification-retention.md) — Notification content and metadata retention
- [proof-secret-retention](retention/proof-secret-retention.md) — Proof and challenge secret retention
- [remaining-capability-retention](retention/remaining-capability-retention.md) — Remaining OAuth and recovery capability retirement — selected 2026-10-21
- [replay-retention](retention/replay-retention.md) — Bounded scheduled replay-payload retention
- [replay-rotation](retention/replay-rotation.md) — Targeted retry compatibility under signing-key rotation
- [retention-discovery](retention/retention-discovery.md) — Remaining technical retention discovery
- [session-retention](retention/session-retention.md) — Session payload retention — selected 2026-10-21

## Platform and verification

Foundation, security patches, API/read admission, local development/release/infrastructure, load and capacity, recovery containment, acceptance.

- [api-admission](platform/api-admission.md) — API admission — one durable write-admission transaction
- [final-local-review](platform/final-local-review.md) — Final local review — local backend correctness and capacity accepted
- [foundation](platform/foundation.md) — VS-00 implementation refinements
- [linux-local-load](platform/linux-local-load.md) — Linux private-network local capacity — selected comparison
- [load-diagnostics](platform/load-diagnostics.md) — Full-scale load diagnostics and fixture qualification
- [local-acceptance-checklist](platform/local-acceptance-checklist.md) — Local backend completion evidence
- [local-database-profile](platform/local-database-profile.md) — Explicit local PostgreSQL load profile — selected next refinement
- [local-development](platform/local-development.md) — Local synthetic developer/provider harness — next selected work
- [local-infrastructure](platform/local-infrastructure.md) — Local infrastructure tooling — distinct review
- [local-load](platform/local-load.md) — Local load verification — selected next work
- [local-release](platform/local-release.md) — Local release and rollback exercise — next batch
- [read-activity-guards](platform/read-activity-guards.md) — Narrow read-activity authority guards — selected prototype
- [read-admission](platform/read-admission.md) — Nonlocking read admission — selected local refinement
- [recovery-containment](platform/recovery-containment.md) — Local recovery containment and isolated restore — next selected batch
- [security-patches](platform/security-patches.md) — Dependency security patch proposal
- [session-guard-query](platform/session-guard-query.md) — Ordered session-guard query — selected prototype
- [verification-pacing](platform/verification-pacing.md) — Fixture connection reuse — selected 2026-10-21
