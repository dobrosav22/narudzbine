# API contract

## Safe audit read contract - 2026-10-21

Existing listOrganizationAudit/adminListAudit are implemented (182 configured/209 planned, schema54). Current role/scope, safe original business history vs named-platform metadata, nullable reason privacy, strict action filters and signed24-hour cursors are explicit.205 schemas/3051 references unchanged. [Handoff](FRONTEND_HANDOFF.md), [refinement](BE/AUDIT_READ_IMPLEMENTATION.md), [verification](BE/AUDIT_READ_VERIFICATION.md).

## CSV exports contract - 2026-10-21

Existing requestExport/getExport/downloadExport are implemented (180 configured/209 planned, schema53). Requester-only current authority, natural resource replay7 days, explicit asynchronous failures, bounded UTF-8 CSV and private audited24-hour downloads; response headers/descriptions now explicit.205 schemas/3051 references remain unchanged. [Handoff](FRONTEND_HANDOFF.md), [refinement](BE/EXPORT_IMPLEMENTATION.md), [verification](BE/EXPORT_VERIFICATION.md).

## Business reporting contract - 2026-10-20

Existing getReportSummary/getProductReport/getBuyerReport are implemented (177 configured/209 planned; schema52 unchanged). Report adds explicit nullable activeBuyerCount for the approved current connection metric;205 schemas/3051 references remain unchanged. Inclusive country dates, required summary grouping, tabular60-month bound, stable historical labels and snapshot/count semantics are explicit. [Handoff/examples](FRONTEND_HANDOFF.md), [refinement](BE/REPORTING_IMPLEMENTATION.md), [verification](BE/REPORTING_VERIFICATION.md).

## Notification preferences/inbox contract - 2026-10-20

Four existing operations bring configured total170 over schema50; planned209 operations/204 schemas remain unchanged. Six effective ordinary events default true/false/false; PUT omits events to reset defaults, requires current preferences revision, and does not mutate language. Inbox is recipient-only, plain localized,90-day visible and cursor-bound; mark-read is desired true. [Handoff](FRONTEND_HANDOFF.md), [refinement](BE/INBOX_IMPLEMENTATION.md). [974-test full/artifact evidence](BE/INBOX_VERIFICATION.md).

## Processed image content - 2026-10-20

Existing downloadImage is configured (total166), schema49. The existing binary response now explicitly lists JPEG/PNG/WebP and private response headers; current vendor/buyer authority is rechecked after the verified bounded fetch. Existing209 operations/204 schemas remain unchanged; no new retry header. [Refinement](BE/IMAGE_DELIVERY_IMPLEMENTATION.md), [handoff](FRONTEND_HANDOFF.md). [Verified batch evidence](BE/IMAGE_DELIVERY_VERIFICATION.md).

## Image upload and metadata — 2026-10-20

Existing uploadImage/getAsset add2 configured operations (total165), schema47. Streaming aliases now explicit; existing Asset schema unchanged.209 operations/204 schemas/3048 references unchanged. No new retry header. [Boundary](BE/UPLOAD_IMPLEMENTATION.md), [handoff](FRONTEND_HANDOFF.md); [Verification](BE/UPLOAD_VERIFICATION.md): full batch/artifact gates passed.


## Catalogue gallery implementation — 2026-10-20

Existing setProductGallery uses Product.revision and returns Product with ordered current IDs. No new operation/schema;209/204 unchanged. Configured total163, schema46. [Boundary](BE/GALLERY_IMPLEMENTATION.md), [handoff](FRONTEND_HANDOFF.md); [Verification](BE/GALLERY_VERIFICATION.md): full batch/artifact gates passed. Upload/status/content remain unimplemented.


## Atomic bulk catalogue implementation — 2026-10-20

The existing bulkEditProducts operation implements1..100 paired-revision targets, supported metadata/prices/publication and whole-tier corrections. No new schema/operation;209 operations/204 schemas unchanged. Configured total162, database schema45. [Boundary](BE/BULK_IMPLEMENTATION.md), [handoff](FRONTEND_HANDOFF.md); [Verification](BE/BULK_VERIFICATION.md):858 tests/full/artifact gates passed.


## CSV import implementation — 2026-10-20

Existing three import contracts are implemented; Problem gains optional typed importErrors[] (max100000) for full stale confirmation errors, separate from ordinary field errors. Preview product IDs are stable server UUIDv7 resources, not a retry key. Configured total161/schema45; operation/schema totals209/204 unchanged. [Boundary](BE/CSV_IMPORT_IMPLEMENTATION.md), [handoff](FRONTEND_HANDOFF.md); [Verification](BE/CSV_IMPORT_VERIFICATION.md):837 tests/full/artifact gates passed. Client work remains external.


## Replacement-order linkage implementation — 2026-10-20

Existing optional replacementForOrderId fields now have actual same-party CANCELLED/unused-target validation and unique successful submission semantics. UnavailableReviewLine gains REPLACEMENT_UNAVAILABLE for the existing normal409 TERMS_CHANGED path; no operation/schema count changes (209/204). Configured total158/schema44. [Boundary](BE/REPLACEMENTS_IMPLEMENTATION.md), [handoff](FRONTEND_HANDOFF.md); [Verification](BE/REPLACEMENTS_VERIFICATION.md):803 tests/full/artifact gates passed. Client implementation remains external.


## Order messages implementation — 2026-10-20

Existing createMessage/listOrderMessages contracts now specify concrete plain-text/privacy/pagination/replay rules in [OpenAPI](openapi.yaml) and [handoff](FRONTEND_HANDOFF.md). Configured total158 over schema43. [Boundary](BE/MESSAGES_IMPLEMENTATION.md); [Verification](BE/MESSAGES_VERIFICATION.md):787 tests/full/artifact gates passed. Client implementation remains external.


## Whole-order dispatch/delivery implementation — 2026-10-20

The existing dispatchOrder/deliverOrder RevisionCommand operations now have concrete whole-order transition, pending-cancellation and original-success semantics in [OpenAPI](openapi.yaml) and [handoff](FRONTEND_HANDOFF.md). Configured total156 over schema42; [boundary](BE/DISPATCH_IMPLEMENTATION.md). [Verification](BE/DISPATCH_VERIFICATION.md):768 tests/full/artifact gates passed; client work remains external.

Current authority: P1.1 approved for backend/infrastructure implementation on 2026-10-16; VS-00 is locally verified; VS-01 is in progress. See [PROJECT_STATUS.md](PROJECT_STATUS.md). Historical candidate/authorization statements below describe the pre-approval record.
P1.1 review candidate — 2026-10-16. Selected designs under D-GOV-005; not authorized for implementation.

[openapi.yaml](openapi.yaml) is the P1.1 OpenAPI3.1.0 specification (208 operations). JSON syntax is valid YAML1.2. Its explicit schemas, parameters, response codes and x-authorization/x-retry-policy metadata are selected planning contracts, not running endpoints. Cross-field rules and transactions are normative in [DESIGN_SPEC.md](DESIGN_SPEC.md). [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) supplies integration examples; frontend implementation/testing remains external.

All paths below have /api/v1 prefix. Browser cookie + CSRF and native bearer transports are distinct. Platform routes never impersonate business accounts. Separate Idempotency-Key appears only on direct order submission, stock delta, message creation and invitation resend; other operations use explicit resource identities/revisions.

## Operation index
| Operation ID | Method and route | Authorization |
|---|---|---|
| listLocales | GET /locales | public |
| createPreAuthNonce | GET /auth/bootstrap | allowed browser origin |
| login | POST /auth/login | verified managed credential; local active/verified account |
| getCsrfToken | GET /auth/csrf | current cookie session and allowed origin |
| reauthenticate | POST /auth/reauthentication | current account plus fresh credential proof |
| logout | POST /auth/logout | current session |
| listSessions | GET /auth/sessions | own account |
| revokeSession | DELETE /auth/sessions/{sessionId} | own account/session |
| revokeAllSessions | POST /auth/sessions/revoke-all | own account, recent authentication |
| requestPasswordReset | POST /auth/password-reset-requests | public generic response |
| completePasswordReset | POST /auth/password-resets | latest valid reset token |
| changePassword | POST /auth/password-changes | current account, authentication <=5 minutes |
| requestEmailChange | POST /auth/email-changes | current account, authentication <=5 minutes |
| getEmailChange | GET /auth/email-changes/{changeId} | own account |
| cancelEmailChange | DELETE /auth/email-changes/{changeId} | own account |
| verifyEmailChangeAddress | POST /auth/email-change-proofs | valid latest old/new proof |
| startExternalAuthentication | POST /auth/external/challenges | public login; link/reauth require current session |
| completeExternalCallback | GET /auth/external/{provider}/callback | one-use provider challenge |
| completeExternalFormCallback | POST /auth/external/{provider}/callback | one-use signed provider challenge |
| exchangeExternalLogin | POST /auth/external/exchanges | one-use code plus matching native PKCE |
| listExternalIdentities | GET /auth/external-identities | own account |
| unlinkExternalIdentity | DELETE /auth/external-identities/{identityId} | own account; <=5-minute proof through a different retained verified usable method, validated under account lock |
| getMe | GET /me | current account |
| updateProfile | PUT /me | own account |
| updateLanguage | PATCH /me/language | own account |
| deactivateSelf | POST /me/deactivation | own staff account; owner/admin removal follows management rules |
| getOrganization | GET /organization | active business account, own organization |
| updateOrganization | PUT /organization | own organization owner/admin |
| closeOrganization | POST /organization/closure | own owner; no nonterminal orders |
| listMembers | GET /organization/members | active business account, own organization |
| changeMemberRole | PUT /organization/members/{accountId}/role | own owner; no current-owner demotion |
| deactivateMember | POST /organization/members/{accountId}/deactivation | owner can manage nonowner; admin staff only |
| reactivateMember | POST /organization/members/{accountId}/reactivation | owner/admin for former staff; owner for former admin; same account returns STAFF |
| requestOwnershipTransfer | POST /organization/ownership-transfers | current owner authenticated <=5 minutes; existing same-org active recipient |
| getOwnershipTransfer | GET /organization/ownership-transfers/{transferId} | own owner or recipient |
| revokeOwnershipTransfer | DELETE /organization/ownership-transfers/{transferId} | current owner |
| acceptOwnershipTransfer | POST /organization/ownership-transfers/{transferId}/acceptance | designated same-org recipient with recent authentication |
| listLocations | GET /organization/locations | active business account, own organization |
| createLocation | POST /organization/locations | own organization owner/admin |
| getLocation | GET /organization/locations/{resourceId} | active business account, own organization |
| updateLocation | PUT /organization/locations/{resourceId} | own organization owner/admin |
| archiveLocation | POST /organization/locations/{resourceId}/archive | own organization owner/admin |
| restoreLocation | POST /organization/locations/{resourceId}/restore | own organization owner/admin |
| listContacts | GET /organization/contacts | active business account, own organization |
| createBusinessContact | POST /organization/contacts | own organization owner/admin |
| getBusinessContact | GET /organization/contacts/{resourceId} | active business account, own organization |
| updateBusinessContact | PUT /organization/contacts/{resourceId} | own organization owner/admin |
| archiveBusinessContact | POST /organization/contacts/{resourceId}/archive | own organization owner/admin |
| restoreBusinessContact | POST /organization/contacts/{resourceId}/restore | own organization owner/admin |
| listInvitations | GET /invitations | own organization owner/admin |
| inviteMember | POST /invitations/members | own organization owner/admin |
| inviteBuyer | POST /invitations/buyers | vendor owner/admin |
| getInvitation | GET /invitations/{invitationId} | authorized sender or verified intended recipient |
| revokeInvitation | DELETE /invitations/{invitationId} | authorized sender |
| resendInvitation | POST /invitations/{invitationId}/resends | authorized sender |
| requestInvitationEmailProof | POST /invitations/email-proofs | valid intended setup/member invitation |
| completeOrganizationSetup | POST /setup/organizations | intended recipient with valid invitation and verified email proof |
| completeMemberSetup | POST /setup/members | intended recipient with valid invite/proof; globally unused current email |
| acceptTradingInvitation | POST /invitations/trading/acceptance | intended existing buyer owner/admin verified email |
| listRelationships | GET /relationships | active business account, own organization |
| getRelationship | GET /relationships/{relationshipId} | either organization party |
| disconnectRelationship | POST /relationships/{relationshipId}/disconnect | owner/admin of either party |
| getPartner | GET /partners/{organizationId} | active connection; disconnected shared-history projection only |
| listCategories | GET /catalogue/categories | active vendor owner/admin/staff, own vendor |
| createCategory | POST /catalogue/categories | active vendor owner/admin/staff, own vendor |
| updateCategory | PUT /catalogue/categories/{resourceId} | active vendor owner/admin/staff, own vendor |
| deleteCategory | DELETE /catalogue/categories/{resourceId} | active vendor owner/admin/staff, own vendor |
| listTags | GET /catalogue/tags | active vendor owner/admin/staff, own vendor |
| createTag | POST /catalogue/tags | active vendor owner/admin/staff, own vendor |
| updateTag | PUT /catalogue/tags/{resourceId} | active vendor owner/admin/staff, own vendor |
| deleteTag | DELETE /catalogue/tags/{resourceId} | active vendor owner/admin/staff, own vendor |
| listUnits | GET /catalogue/units | active vendor owner/admin/staff, own vendor |
| createUnit | POST /catalogue/units | active vendor owner/admin/staff, own vendor |
| updateUnit | PUT /catalogue/units/{resourceId} | active vendor owner/admin/staff, own vendor |
| deleteUnit | DELETE /catalogue/units/{resourceId} | active vendor owner/admin/staff, own vendor |
| listProducts | GET /catalogue/products | active vendor owner/admin/staff, own vendor |
| createProduct | POST /catalogue/products | active vendor owner/admin/staff, own vendor |
| getProduct | GET /catalogue/products/{productId} | active vendor owner/admin/staff, own vendor |
| updateProduct | PUT /catalogue/products/{productId} | active vendor owner/admin/staff, own vendor |
| activateProduct | POST /catalogue/products/{productId}/activate | active vendor owner/admin/staff, own vendor |
| deactivateProduct | POST /catalogue/products/{productId}/deactivate | active vendor owner/admin/staff, own vendor |
| archiveProduct | POST /catalogue/products/{productId}/archive | active vendor owner/admin/staff, own vendor |
| restoreProduct | POST /catalogue/products/{productId}/restore | active vendor owner/admin/staff, own vendor |
| setFeatured | PUT /catalogue/products/{productId}/featured | active vendor owner/admin/staff, own vendor |
| listOffers | GET /vendors/{vendorId}/offers | active connected buyer owner/admin/staff; only own buyer pricing and currently accessible offers |
| getOffer | GET /vendors/{vendorId}/offers/{productId} | active connected buyer; only own resolved pricing |
| getPricing | GET /catalogue/products/{productId}/pricing | active vendor owner/admin/staff, own vendor |
| updatePricing | PUT /catalogue/products/{productId}/pricing | active vendor owner/admin/staff, own vendor |
| listAgreedPrices | GET /relationships/{relationshipId}/agreed-prices | vendor party including dormant relationships |
| setAgreedPrice | PUT /relationships/{relationshipId}/agreed-prices/{productId} | vendor party; creates or changes current price |
| removeAgreedPrice | DELETE /relationships/{relationshipId}/agreed-prices/{productId} | vendor party |
| confirmAgreedPrices | POST /relationships/{relationshipId}/agreed-prices/confirmation | vendor party, active relationship |
| listPromotions | GET /promotions | active vendor owner/admin/staff, own vendor |
| createPromotion | POST /promotions | active vendor owner/admin/staff, own vendor |
| getPromotion | GET /promotions/{promotionId} | active vendor owner/admin/staff, own vendor |
| updatePromotion | PUT /promotions/{promotionId} | active vendor owner/admin/staff, own vendor |
| stopPromotion | POST /promotions/{promotionId}/stop | active vendor owner/admin/staff, own vendor |
| getTracking | GET /inventory/tracking | active vendor owner/admin/staff, own vendor |
| disableTracking | POST /inventory/tracking/disable | active vendor owner/admin/staff, own vendor |
| prepareReconciliation | POST /inventory/reconciliations | active vendor owner/admin/staff, own vendor |
| enableTracking | POST /inventory/reconciliations/{previewId}/confirmation | active vendor owner/admin/staff, own vendor |
| getStock | GET /inventory/products/{productId} | active vendor owner/admin/staff, own vendor |
| setStock | PUT /inventory/products/{productId} | active vendor owner/admin/staff, own vendor |
| adjustStock | POST /inventory/products/{productId}/adjustments | active vendor owner/admin/staff, own vendor |
| confirmStock | POST /inventory/products/{productId}/confirmation | active vendor owner/admin/staff, own vendor |
| listStockEvents | GET /inventory/events | active vendor owner/admin/staff, own vendor |
| reviewOrder | POST /order-reviews | active buyer owner/admin/staff, own buyer |
| submitOrder | POST /orders | authorized buyer submitter, active domestic connection |
| listOrders | GET /orders | active business account, own organization |
| getOrder | GET /orders/{orderId} | either party to shared order, subject to relationship/state action policy |
| acceptOrder | POST /orders/{orderId}/acceptance | vendor party, awaiting acceptance |
| rejectOrder | POST /orders/{orderId}/rejection | vendor party, awaiting acceptance |
| cancelOrder | POST /orders/{orderId}/cancellation | vendor predispatch or buyer permitted before acceptance |
| setOrderStage | POST /orders/{orderId}/stage | vendor party, accepted with optional processing stage |
| dispatchOrder | POST /orders/{orderId}/dispatch | vendor party; no pending cancellation request |
| deliverOrder | POST /orders/{orderId}/delivery | vendor party, dispatched |
| requestCancellation | POST /orders/{orderId}/cancellation-requests | buyer allowed submitter, accepted predispatch |
| getCancellationRequest | GET /orders/{orderId}/cancellation-requests/{requestId} | either party to shared order, subject to relationship/state action policy |
| withdrawCancellation | POST /orders/{orderId}/cancellation-requests/{requestId}/withdrawal | buyer allowed submitter |
| approveCancellation | POST /orders/{orderId}/cancellation-requests/{requestId}/approval | vendor party |
| rejectCancellation | POST /orders/{orderId}/cancellation-requests/{requestId}/rejection | vendor party |
| listOrderEvents | GET /orders/{orderId}/events | either party to shared order, subject to relationship/state action policy |
| listOrderMessages | GET /orders/{orderId}/messages | either party to shared order, subject to relationship/state action policy |
| createMessage | POST /orders/{orderId}/messages | party; connected any state or disconnected nonterminal order |
| listOrderStages | GET /organization/order-stages | active vendor owner/admin/staff, own vendor |
| createOrderStage | POST /organization/order-stages | vendor owner/admin |
| updateOrderStage | PUT /organization/order-stages/{stageId} | vendor owner/admin |
| reorderStages | PUT /organization/order-stages/order | vendor owner/admin |
| listDrafts | GET /drafts | active buyer owner/admin/staff, own buyer |
| createDraft | POST /drafts | active buyer owner/admin/staff, own buyer |
| getDraft | GET /drafts/{draftId} | active buyer owner/admin/staff, own buyer |
| updateDraft | PUT /drafts/{draftId} | active buyer owner/admin/staff, own buyer |
| discardDraft | DELETE /drafts/{draftId} | active buyer owner/admin/staff, own buyer |
| submitDraft | POST /drafts/{draftId}/submission | buyer allowed submitter; current draft revision/review |
| previewReorder | GET /orders/{orderId}/reorder-preview | original buyer |
| listFavorites | GET /favorites | active buyer owner/admin/staff, own buyer |
| addFavorite | PUT /favorites/{productId} | buyer with current offer access |
| removeFavorite | DELETE /favorites/{productId} | active buyer owner/admin/staff, own buyer |
| listMostOrdered | GET /suggestions/most-ordered | active buyer owner/admin/staff, own buyer |
| listPlans | GET /plans | active business account, own organization |
| getVendorPlan | GET /organization/plan | active vendor owner/admin/staff, own vendor |
| requestPlanChange | POST /organization/plan-requests | vendor owner/admin |
| listPlanRequests | GET /organization/plan-requests | vendor owner/admin |
| withdrawPlanRequest | DELETE /organization/plan-requests/{requestId} | vendor owner/admin |
| getNotificationPreferences | GET /me/notification-preferences | own account |
| updateNotificationPreferences | PUT /me/notification-preferences | own account |
| listNotifications | GET /me/notifications | own account |
| markNotificationRead | PUT /me/notifications/{notificationId}/read | own recipient |
| registerDevice | POST /me/devices | own current session/environment |
| listDevices | GET /me/devices | own account |
| removeDevice | DELETE /me/devices/{deviceId} | own account |
| getAsset | GET /media/assets/{assetId} | active vendor owner/admin/staff, own vendor |
| downloadImage | GET /media/assets/{assetId}/content | vendor owner or buyer with current offer access |
| setProductGallery | PUT /catalogue/products/{productId}/gallery | active vendor owner/admin/staff, own vendor |
| previewCsvImport | POST /catalogue/import-previews | active vendor owner/admin/staff, own vendor |
| getImportPreview | GET /catalogue/import-previews/{previewId} | active vendor owner/admin/staff, own vendor |
| confirmCsvImport | POST /catalogue/import-previews/{previewId}/confirmation | active vendor owner/admin/staff, own vendor |
| getReportSummary | GET /reports/summary | active business account, own organization |
| getProductReport | GET /reports/products | active business account, own organization |
| getBuyerReport | GET /reports/buyers | active vendor owner/admin/staff, own vendor |
| requestExport | POST /exports | active business account, own organization |
| getExport | GET /exports/{exportId} | requester with current original scope |
| downloadExport | GET /exports/{exportId}/content | requester with current original scope |
| listOrganizationAudit | GET /organization/audit | own organization owner/admin |
| requestPrivacyCase | POST /organization/privacy-cases | own organization owner/admin |
| getPrivacyCase | GET /organization/privacy-cases/{caseId} | own organization owner/admin |
| adminListOrganizations | GET /admin/organizations | named active platform administrator |
| adminGetOrganization | GET /admin/organizations/{organizationId} | named active platform administrator |
| adminCorrectOrganization | PUT /admin/organizations/{organizationId} | named active platform administrator |
| adminSuspendOrganization | POST /admin/organizations/{organizationId}/suspend | named active platform administrator |
| adminReactivateOrganization | POST /admin/organizations/{organizationId}/reactivate | named active platform administrator |
| adminCloseOrganization | POST /admin/organizations/{organizationId}/close | named active platform administrator |
| adminInviteOrganization | POST /admin/setup-invitations | named active platform administrator |
| adminConnectOrganizations | POST /admin/connections | named active platform administrator |
| adminDisconnect | POST /admin/relationships/{relationshipId}/disconnect | named active platform administrator |
| adminAssignPlan | PUT /admin/vendors/{vendorId}/plan | named active platform administrator |
| adminListPlanRequests | GET /admin/plan-requests | named active platform administrator |
| adminApprovePlanRequest | POST /admin/plan-requests/{requestId}/approval | named active platform administrator |
| adminRejectPlanRequest | POST /admin/plan-requests/{requestId}/rejection | named active platform administrator |
| createSupportAccess | POST /admin/support-access | named active platform administrator |
| adminReadReport | GET /admin/support/organizations/{organizationId}/reports | named active platform administrator |
| adminReadOrder | GET /admin/support/orders/{orderId} | named active platform administrator |
| adminReadProducts | GET /admin/support/organizations/{organizationId}/products | named active platform administrator |
| adminReadMessages | GET /admin/support/orders/{orderId}/messages | named active platform administrator |
| createRecoveryCase | POST /admin/recovery-cases | named active platform administrator |
| getRecoveryCase | GET /admin/recovery-cases/{caseId} | named active platform administrator |
| reviewRecoveryCase | POST /admin/recovery-cases/{caseId}/review | second distinct named platform admin |
| acceptRecovery | POST /recovery-cases/{caseId}/acceptance | intended existing member/account with fresh proof |
| adminListAudit | GET /admin/audit | named active platform administrator |
| adminGetPrivacyCase | GET /admin/privacy-cases/{caseId} | named active platform administrator |
| receiveEmailWebhook | POST /provider-callbacks/email | valid provider signature and deduplicated provider event identity |
| uploadImage | PUT /media/assets/{assetId}/upload | active vendor owner/admin/staff, own vendor |
| retireOrderStage | POST /organization/order-stages/{stageId}/retirement | vendor owner/admin; unused/current references guarded |
| bulkEditProducts | POST /catalogue/bulk-edits | vendor owner/admin/staff; all changes atomic |
| adminListMembers | GET /admin/organizations/{organizationId}/members | platform admin; administrative projection only |
| adminDeactivateStaff | POST /admin/organizations/{organizationId}/members/{accountId}/deactivation | platform admin with reason; staff only, never owner/admin role bypass |
| adminReactivateStaff | POST /admin/organizations/{organizationId}/members/{accountId}/reactivation | platform admin with reason; staff only, never owner/admin role bypass |
| adminReadPricing | GET /admin/support/products/{productId}/pricing | platform admin with target-vendor support context |
| adminReadStock | GET /admin/support/products/{productId}/stock | platform admin with target-vendor support context |
| adminReadPromotions | GET /admin/support/organizations/{organizationId}/promotions | platform admin with target-vendor support context |
| adminReadAgreedPrices | GET /admin/support/organizations/{organizationId}/agreed-prices | platform admin with target-vendor support context |
| adminGetSummary | GET /admin/summary | named active platform administrator |
| archivePromotion | POST /promotions/{promotionId}/archive | active vendor owner/admin/staff, own vendor |
| completeEmailChange | POST /auth/email-changes/{changeId}/completion | own account authenticated <=5 minutes; both current mailbox proofs, unexpired request and current revision |
| listOfferTaxonomy | GET /vendors/{vendorId}/offer-taxonomy | active connected buyer; taxonomy referenced by own accessible offers only |
| getReconciliation | GET /inventory/reconciliations/{previewId} | active vendor member; own vendor preview |
| listReconciliationLines | GET /inventory/reconciliations/{previewId}/lines | active vendor member; own vendor preview |
| acknowledgeReconciliationLines | PUT /inventory/reconciliations/{previewId}/lines | active vendor member with stock role authority; own vendor preview |

## Contract validation scope
Planning verification checks parseability, internal references, unique operation IDs, path parameters, schema required-field consistency and operation-to-slice coverage. Full request execution, security behavior and real-provider integration require implemented contract tests in G-01..05. Error and semantic boundaries remain in DESIGN_SPEC §§6/8; schema validation alone cannot prove country isolation or transaction correctness.

<details>
<summary>Historical planning notes through P0.48 (later selections above and in D-PLAN-001–025 govern)</summary>

Earlier “open/unapproved” notes below are historical where P1.1 explicitly resolves them. They do not reopen user answers or supersede current contracts. External facts and empirical gates remain in PLANNING_REVIEW.md.

Revision P0.48 — approved transport/wire direction plus operation design worksheet. REST/JSON and /api/v1 are selected; individual routes, DTO fields, remaining status mappings, provider protocols and OpenAPI version remain unapproved; D-SEC-001–038 settle authentication direction, session transport/lifetimes, stated recovery lifecycle and no-MFA scope.

Current authority (D-GOV-005/006, 2026-10-15): remaining choices are delegated to the assistant, with AI expected to perform approximately 99% of future development/DevOps. Historical “unapproved”, “ask” and “requires approval” notes identify unfinished selections unless a later recorded decision resolves them; they no longer require routine user interviews. Preserve explicit prior requirements and the separate planning-package/implementation, merge, production-release and external-action authorization gates. Unrecorded specifics remain unfinished, not implicitly selected. See [AI operations](AI_OPERATIONS.md).

Our responsibility is the backend API, infrastructure and their verification (D-GOV-002). We deliver contracts, examples, error/retry/authentication semantics, compatibility notes and backend integration evidence. The frontend owner implements adapters, screens and client behavior and supplies browser/native acceptance evidence. Record discovered client changes as handoff items, not tasks for us.

The old data-contract documents are frontend proposals. The API will be designed from confirmed business actions and authorization boundaries, not mapped one-for-one from frontend service methods. openapi.yaml is intentionally not created yet: a fabricated executable contract would conceal unresolved choices.

## Approved scope and country inputs
The API covers implemented frontend capabilities for both client categories and countries. Include technical integration flows; exclude payments and ERP/accounting/shipping integrations. Domestic-only trade and frozen per-order vendor currency (RSD/BAM; no conversion) are approved. Requests containing a country/org ID must not establish authorization by themselves. Country policy follows D-CTR-001–005: each organization has one country; each user belongs to one organization under D-ORG-016; global administrator geography does not grant unrestricted actions. Validate domestic party/location relationships and vendor currency by country (Serbia RSD; Bosnia and Herzegovina BAM). Context transport, error mapping and exact field permissions remain open. Locale identifiers must support configured additions without an API/schema enum release; client-rendered errors use stable codes/parameters under delegated D-LOC-001. D-LOC-002–006 settle the launch roster, user preferences, setup default and English template fallback. D-LOC-017–027 settle locale IDs/resource conventions, reset semantics, failure direction and country-date mapping. Exact remaining fields, error codes, loader/template details and provider flows remain open.

## Approved organization access — D-ORG-001–005
Buyer and vendor organization records are separate, including within one country; each user belongs to exactly one organization. Derive ordinary business context from the authenticated user's organization; no organization-picker/switch API. Fixed owner/admin/staff roles govern actions; they do not restrict members to home locations. Partner projections expose only authorized catalogue/prices, shared orders/messages and relevant business/delivery contacts.

Global platform administrators may manage organization metadata/memberships/plans/trading links and read orders/messages/private prices in both countries. Commercial-content access is read-only and excludes impersonation. Exact management commands/fields, exports, audit and support workflow remain open. Enforce projections and mutations at the backend API boundary; frontend hiding is insufficient. See the approved baseline matrix in [DOMAIN_MODEL.md](DOMAIN_MODEL.md) (D-ORG-006–015) and the answered Batch 6 in [QUESTIONS.md](QUESTIONS.md). Plan policy-management for the buyer-wide restriction and role-derived effective permissions. D-ORG-019 removes individual vendor edit toggles/endpoints; the enabled edit baseline now applies uniformly to the vendor staff role. Buyer restriction remains organization-wide and off by default. Exact fields/routes remain unselected; returning role-derived effective permissions is a contract design task, not frontend-authorized enforcement. Authorize all fields in combined catalogue/price/stock writes; granting catalogue editing must not silently grant prices or stock. Restricted buyers save shared drafts for owner/admin review and submission; no formal approval-request lifecycle is selected (D-ORG-013). Preserve prepared work on policy changes, check current authority on next action and never auto-submit when restrictions lift (D-ORG-015). D-BUY-001/002 approve conflict/current revision for stale saves and consume-on-success exactly once; exact version/consume contract remains Q-BUY-003/Q-API. Owner transfer requires acceptance and exactly-one-owner protection; membership revocation affects subsequent checks while retaining historical attribution. D-ORG-016 supersedes preservation of other memberships because a user has only one organization.

## Approved onboarding inputs
D-INV-001–003 and D-ORG-017 require platform-invited vendors, vendor/platform-invited buyers, verified intended-recipient setup ownership, seven-day single-use invitations, authorized revocation and invalidating resend with renewed seven-day expiry. No public organization signup is selected. Design distinct commands for onboarding, team invitation and trading connection; existing user organization is not a caller-selectable list.

The original organization-picker question is withdrawn by D-ORG-016. D-INV-004 approves existing-buyer owner/admin acceptance to create only the vendor–buyer trading connection. Acceptance must preserve buyer/user/owner identity and must not create memberships. Check the actor's current owner/admin role in their sole buyer organization and the approved domestic boundary; D-INV-005 requires verified-owner/admin reissue and old-link invalidation for misaddressed invitations. D-INV-006 requires duplicate pending creates to return the existing invite without email/expiry mutation. D-SUB-001 checks active-connection capacity at acceptance; pending invites reserve no slots. D-INV-009 settles already-connected responses and pending-invitation closure; exact uniqueness keys and concurrency remain open. Account conflict handling, verification transport, token storage, duplicate/rate/quota rules and exact DTOs remain open.

## Invitation recovery and platform direct linking
D-INV-007 requires explicit sender resend after invitation delivery failure, not an automatic application retry. Resend invalidates the previous link and restarts seven days; duplicate-create is not a resend. Failure reporting and timeout ambiguity remain Q-INV-004-B.

D-INV-008 authorizes a distinct platform-admin direct-link action without buyer acceptance. It preserves domestic/type/user invariants and existing organizations/users/owner. It does not grant ordinary organization admins the consent bypass. D-SUB-004 forbids cap exceptions even for platform admin; exact audit/reason fields and notifications remain Q-ORG-005-A/Q-DAT-003/Q-NOT.

## Approved subscription inputs
D-SUB-002–006 require platform-admin initial assignment; non-archived product counting (including inactive); strict product/buyer caps on every actor; rejected downgrades below current usage; and a single pending vendor request, resolved by platform admin or withdrawn by vendor owner/admin before resolution. Recheck current usage when changing plan, not merely when requesting it. D-SUB-007–010 select exact shared-country caps, configuration-owned definitions, pinned assignment revisions and immediate application. Exact fields/IDs/errors and request replacement concurrency remain open. Subscription UI display is outside our responsibility; whether the backend must store/serve subscription monetary metadata remains Q-SUB-004-E. Do not introduce hard-coded prices, zero placeholders or remove existing client expectations without a contract decision. Payments remain deferred.

## Approved catalogue inputs
D-CAT-001–034 require independent sellable SKUs and flat categories. Every product must have a SKU unique within its vendor after trimming surrounding whitespace and ignoring case; codes on archived products remain reserved. Different vendors may reuse codes. Catalogue-authorized edits reserve previous codes for that same product. Trimmed codes permit 1–64 ASCII letters/digits or -, _, . and /; internal spaces and other characters are invalid. Only current codes participate in catalogue SKU search/lookup. Previous codes remain reserved and cannot reactivate, even for their original product; no alias fallback. Restoring an archived product with an unchanged current code remains permitted. Trim details, case-preserving storage, no-op/case-only changes and exact responses remain open.

A product may have zero or one category and zero or more tags. Taxonomy references belong to its vendor. D-CAT-029 requires trimmed, case-insensitive names to be unique within each vendor, separately for categories and tags. Different vendors may reuse names; a category and tag may share a name. References still use IDs. Reject removal while any product/promotion reference exists; authorized actors must explicitly remove references first. Do not detach, merge or rewrite references by name. Exact name/rename/field/count and historical reference details remain open.

Order quantities must be whole numbers equal to minimum + n × step for an integer n >= 0; minimum and step are positive whole numbers, both defaulting to 1. Reject fractions and minimum/step violations without rounding. Vendors define units; no shared platform list or conversion is selected. Products reference reusable vendor-owned unit records; cross-vendor references are forbidden. Owner/admin and catalogue-authorized staff manage unit definitions within approved lifecycle rules. Pack contents are optional descriptive text with no calculations/conversion. D-CAT-028 requires unit names unique within each vendor after trim/case-insensitive comparison; different vendors may reuse names. References use IDs. A unit name freezes once a product using it has appeared in a submitted order. Deletion is blocked by any product reference, including archived products; referenced units remain available. Exact fields/wire values, pre-trigger validation and numeric maxima remain open. After a product's first submitted order, deny changes to its selling unit/pack size; a new product/SKU is required. Code renaming does not reset this invariant. Freeze the full pack text after first submission, including absence; reject cosmetic edits as well. Before-first-order edits, normalization and transaction mechanics remain open.

Catalogue-authorized vendor members may save incomplete non-orderable products missing price and/or unit within capacity. Price writes require price authority; absent pricing must not silently become zero. Adding pricing does not activate the product. Explicit activation requires catalogue authority, valid pricing and a valid unit owned by the same vendor; a combined price-and-activation operation requires both grants. D-PRI-002 requires a positive base before activation and positive entered base/tier/buyer-specific prices. D-PRI-009–011 settle monetary precision/rounding; additional required fields, other validation, retained-price behavior after base removal under D-PRI-020 and transaction semantics remain open.

Catalogue-authorized restoration retains the original product identity/SKU, checks capacity and returns the product as inactive. Explicit activation when eligible is required before new ordering. Restoration confers no price/stock write rights. Capacity includes all non-archived incomplete and inactive products.

New-order submission, including reorder, rejects inactive/archived products and products without required pricing. Historical orders remain readable; exact projections and existing-order changes remain separate decisions. No endpoint, DTO field name, error code or schema enum is approved by these policies.

## Approved stock inputs — D-CAT-030–047
Stock scope is one available-to-order count per vendor/product in whole sellable units. One vendor-wide switch covers all products and defaults off; current stock authority is required to change tracking/counts. No pack-text conversion or physical/reserved inventory split is selected.

Authorized disabling is immediate even with outstanding orders whose stock was deducted. It retains counts as inactive information; pending deductions are not a reason to deny disabling. On enable/re-enable, stock-authorized confirmation/update is required for retained values; products without any count are treated as zero. This operation does not activate products. New products created while tracking is already on may lack stock and remain incomplete/non-orderable; a stock-authorized member supplies a count before explicit catalogue-authorized activation. Other price/unit/capacity rules remain applicable.

With tracking on, reject submission if any line lacks availability; successful submission immediately deducts ordered quantities. Dispatch does not deduct those quantities again. Unsubmitted carts/shared drafts do not hold stock; saving/reviewing/handing off a draft changes no count. Actual submission revalidates availability. With tracking off, missing counts do not block ordering.

Manual count commands may set an absolute available count or apply whole-unit increases/decreases under stock authority. Reject negative resulting counts without clamping; record actor/time/product/before-after, with optional reason, including initial entry and reconciliation. Automatic order movements link to their order. D-CAT-047 permits these manual edits while tracking is off; editing neither enables tracking nor waives required re-enable confirmation/update. Exact event fields, upper bounds, stale-write and retry conventions remain open.

Product archive retains counts/history. While tracking is on, stock-authorized confirmation/update is required before reactivation; capacity, inactive restoration, catalogue authority and other activation requirements remain in force. Count confirmation freshness and existing-order interactions remain open.

A valid cancellation before any dispatch automatically restores the original deduction exactly once. Do not credit stock when the order never deducted it. D-CAT-045 applies the credit immediately to retained counts while tracking is off, keeping tracking off. D-CAT-046 permits re-enable with older unfulfilled orders after confirming available counts that already exclude all their commitments. Preserve original deduction/credit obligations through reconciliation: confirming 5 available while an older deducted order of 3 is pending, then validly cancelling it before dispatch, yields 8 once. Orders submitted while off receive no retroactive deduction or automatic cancellation credit; later cancellation may require an authorized manual adjustment. Missing counts still initialize to zero under D-CAT-035. D-ORD-006–015 approve core states, vendor cancellation/rejection, required reasons, request dispatch blocking and no launch returns. D-ORD-021/022 settle buyer cancellation authority and withdrawal; remaining request details and confirmation freshness remain open; D-ORD-005 excludes partial dispatch. Failed submissions, retries and concurrent last-unit requests must preserve the approved effects without double deduction/credit; concrete transaction/idempotency/error conventions remain Q-API. No endpoint/schema/status code is selected.

## Operation candidates
| Business capability | Information to determine | Authorization / failures to specify | Questions |
|---|---|---|---|
| Establish/recover/end session | Identity proof, session transport, active membership, recovery challenge | Expiry/revocation, enumeration resistance, recovery failure, membership removal | Q-SEC-001–005 |
| Onboard organization / accept invite | Business identity, recipient proof, explicit target, acceptance result | Actor eligibility, consumed/revoked/expired invite, duplicate org, plan limit | Q-ORG-001–003, Q-INV-001–004 |
| Maintain and browse catalogue | Product edit command versus display projection; taxonomy/media/price visibility | Own-vendor writes; separate catalogue/price authority; permitted buyer view; invalid quantity/foreign reference/quota; non-orderable incomplete products | D-CAT-001–005; Q-CAT-001–008, Q-ORG-004 |
| Review commercial offer / submit order | Line quantities, delivery choice, price confirmation, resulting order snapshot | Own buyer + authorized vendor relation; unavailable line/changed price/stock/retry | Q-PRI-001–005, Q-ORD-001/002/005 |
| Progress or cancel order / message | Target transition, reason, expected revision, message content | Party and role checks; forbidden transition/stale revision/removed relationship | Q-ORD-003/004/006/007 |
| Collaborate on drafts / reorder / favorites | Ownership, explicit desired state, revision, missing-line results | Teammate permissions, already-consumed draft, unavailable product | Q-BUY-001–004 |
| Manage entitlements and connections | Requested vs applied tier, justification, relation lifecycle | Platform admin scope, vendor limits, duplicate resolution | Q-SUB-001–004, Q-ORG-005/006 |
| Preferences and reporting | Recipient/person scope, metric period/timezone, redacted projections | No counterpart leakage; definition and freshness of aggregates | Q-NOT-001–004, Q-LOC-001/002, Q-STA-001/002 |

## Contract questions that must precede concrete specifications
Q-API-001 transport/versioning; Q-API-002 identifier/naming/date/money representation; Q-API-003 errors and validation; Q-API-004 pagination/search/filter/sort; Q-API-005 idempotency; Q-API-006 transaction/bulk semantics; Q-API-007 optimistic concurrency/cache; Q-API-008 real-time delivery/client compatibility. Per-field requiredness, lengths, null-versus-absent behavior, precision, enums, examples and limits remain explicit choices.

## Example scenario to turn into an approved contract
A buyer reviews quantity 10, then the price changes before submit. The client times out after the server commits and retries. D-ORD-002 requires explicit reconfirmation of changed terms; it must also define the retry key's scope/lifetime/payload mismatch and the response used to find the committed order. No HTTP method/path or DTO has been selected for this scenario.

## Frontend handoff implications discovered (external implementation)
- Existing calls carry createdByUserId and senderUserId; the backend actor should come from authenticated context under the proposed authorization policy.
- Product and price-tier saves currently happen separately; user intent may warrant a single command.
- Historical labels are fetched from live catalogue/team/location lists; approved snapshots/projections may replace these reads and reduce counterpart-data exposure.
- D-BUY-013 approves desired-state favorite add/remove; repeated requests preserve the requested state. Opposing concurrent writes and exact idempotency conventions remain Q-API-005/007.
- Lists currently return complete arrays. Pagination will require frontend state/adapter changes.
- Clearing optional fields cannot rely on JavaScript undefined over JSON. Null/removal conventions require Q-API-002.
- Web/native credentials, refresh/recovery, price confirmation and API errors will require frontend work; existing stubs do not limit the new design.

## Completion checklist for each approved operation
Record operation ID and requirement/decision links; actor and field visibility; request/response with examples; validation and business errors; ownership checks; transaction and concurrency semantics; idempotency and retries; pagination/filtering where relevant; event/notification effects; retention implications; and acceptance/negative tests. Select and generate openapi.yaml only after transport and those choices are approved, then validate it and reconcile examples with REQUIREMENTS.md.

## Approved price inputs and calculation — D-PRI-002–006
D-PRI-002–006 require a positive base price before activation and positive manually entered base/tier/buyer-specific prices. The highest reached volume tier prices every unit; an agreed buyer-specific price overrides base/tier even when higher. Apply eligible promotions after that selection, including on agreed prices, and choose only the single promotion yielding the lowest result. No stacking. D-PRI-007–011 define fixed promotions as final replacement unit prices, not amounts off. Promotional outcomes may be zero, with negative calculated results floored at zero; this does not relax positive base/tier/buyer-specific input rules or authorize invalid promotion input. Monetary inputs allow at most two decimal places, rejecting excess precision. Round final promotional unit results to two decimals using exact round-half-up, compare rounded candidates, then multiply by whole quantity and sum goods line amounts. Computed 1.005 becomes 1.01; entered 1.005 is invalid. D-PRI-012–016 forbid promotion price increases, constrain percentages to greater than 0 and at most 100 with at most two decimal places, resolve equal rounded promotion results by earliest creation then stable ID order, and require tier prices to decrease strictly below base and preceding tiers. Edits preserve promotion creation order. D-PRI-017–021 require distinct per-product tier thresholds that are allowed order quantities strictly above minimum; reject duplicate product lines; reject invalidating base-price edits unless affected tiers are explicitly corrected/removed in the same save; require explicit deactivation before/together with active-product base removal, with both grants for a combined command; and allow at most one current agreed price per product/buyer, without buyer-specific tiers. D-PRI-022–036 settle targeting/time direction, baseline-equality attribution and quantity/pricing preparation rules. Exact time/target validation, history/connection lifecycle, fixed-price bounds, tax/fees/refunds and technical representation remain open. Remaining eligibility validation and lifecycle details require approval.

Reject entered zero/negative prices; distinguish an omitted base on incomplete preparation from a priced product. Activation requires a positive base even when tiers or an agreed buyer price exist. Price changes require price authority; activation requires catalogue authority, and combined actions require both. Applicable promotions still use promotion authority. No endpoint, field name, response projection or automatic activation is implied.

Contract examples before tax/fees: with base 100 and threshold 10 at 90, quantity 12 resolves to 1080; an agreed buyer unit price 95 overrides ordinary 90; agreed 80 with an eligible 10% promotion becomes 72. Two eligible percentage discounts 10% and 20% on resolved 100 yield 80, without stacking. Preserve these examples in eventual offer/order verification. D-PRI-010 compares rounded final unit outcomes. D-PRI-012 rejects price-increasing candidates and D-PRI-015 resolves promotion ties. D-PRI-032 resolves baseline equality as no applied promotion; decimal-string money follows D-API-004; D-API-009/010 settle monetary output/input grammar; exact snapshot fields remain unresolved.

### Monetary validation and examples — D-PRI-007–011
Fixed promotion amounts represent final unit prices. Validating 12.345 as a monetary input must fail rather than store 12.35. Up to two fractional digits are allowed for base/tier/buyer-specific and fixed promotional prices; JSON number versus string, normalization and numeric bounds remain unselected. D-PRI-013/014 require percentage values greater than 0 and at most 100, with up to two decimal places and rejection of excess precision. Computed intermediates retain precision until final unit rounding.

Before tax/fees, resolved price 100 plus fixed promotion 20 yields 20, and a promotional zero is permitted. A percentage candidate producing 0.045 rounds half-up to 0.05; quantity 3 then totals 0.15. A computed 1.005 rounds to 1.01 even though 1.005 is invalid as entered monetary input. Sum the resulting goods line amounts for subtotal. The negative-outcome floor does not authorize negative fixed promotional input or out-of-range percentages. D-API-004 selects monetary decimal strings; exact DTO fields/error codes, tax/refund rules and frontend behavior are not selected by these pricing examples.

### Promotion and tier validation — D-PRI-012–016
D-PRI-012–016 forbid promotion price increases, constrain percentages to greater than 0 and at most 100 with at most two decimal places, resolve equal rounded promotion results by earliest creation then stable ID order, and require tier prices to decrease strictly below base and preceding tiers. Edits preserve promotion creation order. D-PRI-017–021 require distinct per-product tier thresholds that are allowed order quantities strictly above minimum; reject duplicate product lines; reject invalidating base-price edits unless affected tiers are explicitly corrected/removed in the same save; require explicit deactivation before/together with active-product base removal, with both grants for a combined command; and allow at most one current agreed price per product/buyer, without buyer-specific tiers. D-PRI-022–036 settle targeting/time direction, baseline-equality attribution and quantity/pricing preparation rules. Exact time/target validation, history/connection lifecycle, fixed-price bounds, tax/fees/refunds and technical representation remain open.

Acceptance examples: agreed 80 plus only fixed promotion 90 retains 80; an eligible fixed 70 reduces it to 70. Percentage 12.25 is accepted; 0, negative values, 100.01 and 12.345 are rejected. On resolved 100, fixed 90 and 10% both yield 90; record earliest creation, then stable ID for an equal timestamp. Editing a promotion does not change its tie priority. Base 100, tier 10 at 90, tier 20 at 95 or 90 is invalid; 20 at 80 is valid. Exact request/error fields, ID comparison, snapshot attribution and save atomicity remain unselected.

### Tier and pricing lifecycle inputs — D-PRI-017–021
D-PRI-017–021 require distinct per-product tier thresholds that are allowed order quantities strictly above minimum; reject duplicate product lines; reject invalidating base-price edits unless affected tiers are explicitly corrected/removed in the same save; require explicit deactivation before/together with active-product base removal, with both grants for a combined command; and allow at most one current agreed price per product/buyer, without buyer-specific tiers.

For minimum 5/step 5, accept distinct thresholds 10/15 and reject 5/7 or duplicate 10 within that product. Reject repeated product lines in both order review and submission; no silent merge, partial order or separate tier calculation for each duplicate. Changing base 100 to 80 while retaining tier 90 fails without mutation; explicitly correcting that tier to 70 or removing it in the same authorized save may succeed if the final schedule is valid. Explicit deactivation/removal together checks both catalogue and price authority from the current role; unauthorized or implicit deactivation is rejected. One agreed price may vary between buyers but no buyer-specific quantity schedule is selected. Exact endpoints/errors, concurrent replacement behavior, retained prices after base removal and stale-draft handling remain open.

## Approved promotion and order integration — D-PRI-022–036, D-ORD-001–005
D-PRI-022–032 approve independent product/category and buyer targeting with both dimensions required, live category membership, exact date/time schedules in the vendor country's local timezone, inclusive start/exclusive end and mandatory end. Definitions freeze once started; stop permanently and create a new promotion to change/resume an offer. No coupons or redemption caps at launch. A rounded promotion yielding no saving is not recorded as applied.

D-PRI-033–036 require explicit same-save tier corrections/removals when quantity-rule changes invalidate thresholds, with catalogue and price grants for combined edits. Base removal requires explicit tier removal while agreed prices may remain on the non-orderable product. Deleting an agreed price falls back to base/tier plus eligible promotions. A valid base is required before tiers can be saved.

D-ORD-001–005 create an order awaiting vendor acceptance/rejection on submission, still deducting tracked stock immediately. Changed reviewed commercial terms reject submission and require explicit reconfirmation. Vendors cannot amend submitted products/quantities/prices; authorized cancellation and buyer-submitted replacement are required. Buyer may cancel before acceptance; afterward request vendor cancellation before dispatch. Launch fulfillment/dispatch covers the whole order, with no partial dispatch.

Live category selection does not modify a started promotion definition. A replacement promotion receives new creation identity/order for tie selection. Stop, expiry or category changes can change a reviewed offer, requiring reconfirmation before successful submission; existing orders keep their submitted terms. No-change rounded offers record no promotion. Targeting never bypasses vendor ownership, relationship visibility or country boundaries.

D-ORD-006–015 approve the core lifecycle Awaiting acceptance → Accepted → Dispatched → Delivered, with Rejected/Cancelled terminal outcomes. Optional vendor stages fit only between acceptance and dispatch and may be skipped; vendor owner/admin/staff perform routine permitted transitions and mark Delivered. No terminal reopening or automatic pending-order expiry. Vendors may reject pending orders or cancel accepted/pre-dispatch orders; completed rejection/cancellation restores the original stock deduction exactly once, including retained off-mode counts. Orders without an original deduction receive no automatic credit. Rejection, cancellation and cancellation requests require reasons. A pending buyer cancellation request blocks dispatch until vendor resolution or authorized buyer withdrawal (D-ORD-022), and alone creates no credit. Post-dispatch returns are outside launch. D-ORD-021/022 settle buyer staff cancellation restrictions and pending-request withdrawal; remaining transitions/configuration and transaction mechanisms remain open.

D-ORD-016–020 require submission snapshots of product name/current SKU/unit/pack, quantity, resolved prices/applied promotion/currency/totals, party business details, delivery/contact details and submitting actor; tax/fees are included only if separately approved. Append every transition with actor/time/from/to/applicable reason and historical status label/configuration version. Source edits do not rewrite submitted snapshots or event history. Sent messages are text-only and immutable to ordinary users; corrections are new messages. Connected authorized partners may message terminal orders without reopening them. D-ORD-025 selects organization-only partner author attribution; D-ORG-024/026 settle disconnected order/thread access. Exact fields, exceptional correction/moderation and retention remain open.

D-BUY-001–005 require stale shared-draft saves to fail with a conflict/current revision and successful submission to consume the draft exactly once. Failed/stale submission leaves it available; saved drafts never expire automatically. Reorder preparation uses current terms, explicitly identifies unavailable/changed lines and requires resolution before submission, with no silent omission or automatic submission. Favorites belong to one buyer-organization-shared list (Q-BUY-001-A: B), not personal lists. D-BUY-006–013 settle unavailable/disconnected favorite retention, disconnected drafts, discard/no ordinary restore, read-only reorder preparation, desired-state favorites and no backend live carts; exact concurrency/idempotency and projections remain open.

Contract examples: drinks scope AND buyers A/B excludes food and buyer C. At exact start a matching offer applies; at exact end it does not. A started-price edit and resume of a stopped promotion are rejected. Coupon redemption/usage-cap contracts are outside launch. Removing agreed 80 falls back to current ordinary 90 before promotions. A stale submitted offer returns updated commercial terms for reconfirmation without an order/stock side effect. Successful fresh submission yields pending vendor acceptance; actor/date/price projections and endpoints remain unselected. No whole-order status convention should accept a partial line dispatch implicitly.

## Account, role and relationship corrections — P0.30
D-ORG-018 permanently binds each user account to its original organization. No reassignment, switching, transfer to another organization or reuse in another organization after removal is permitted; platform administrators do not gain a reassignment bypass. Owner-role transfer is only between existing users of that same organization. D-ORG-046–048 approve original-account reactivation as staff, bounded reactivation authority and staff self-deactivation; exact identity/session/state contracts remain open. No alternate-account workaround is inferred.

D-ORG-019 supersedes individual vendor staff edit toggles (D-ORG-007/012). Fixed roles determine permissions: the latest approved enabled catalogue, price, promotion and stock baseline is uniform for vendor staff; owner/admin retain their approved management powers. Admin-to-staff changes apply the staff role immediately on subsequent checks, without copying/resetting personal grants. Category checks still apply to combined operations, but no per-user grant configuration or editable role builder is selected. The buyer-wide owner/admin-only submission setting remains and also restricts cancellation/request actions under D-ORD-021.

D-ORG-020/021 require same-organization owner-transfer acceptance within seven days, one pending request, and current-owner revoke/replace with old-request invalidation. D-ORG-022 adds no common-legal-ownership check or restriction. D-ORG-023–026 allow either partner's owner/admin or platform administrator to disconnect, including with open orders. Disconnection blocks live catalogue/prices and new orders but preserves shared order history and normal completion/open-order messaging. It does not cancel existing orders or itself adjust stock. Disconnected terminal threads are read-only; reconnection restores normal messaging. Retained agreed prices become inactive and require vendor price-authorized review/confirmation after reconnection; normal base/tier pricing plus eligible promotions applies meanwhile. Country, type, authorization and quota rules still apply.

D-ORD-021–025 apply buyer submission restrictions to cancellation and cancellation requests; allow one pending request, withdrawable by a currently cancellation-authorized buyer member with history and no stock effect; use per-vendor/year human order-number sequences; retire stages without moving orders already in them, while preventing new assignments; and expose organization-only author attribution to trading partners. Keep individual authenticated actor attribution internally for authorized use. Exact numbering format/year boundary, role projections, retry/race conventions and configuration details remain open.

D-BUY-006–009 retain inactive/archived-product favorites as unavailable, allow any authorized buyer member to discard an unsubmitted shared draft, and provide no ordinary restore of discarded drafts. Discard is not a decision to physically erase audit data. Live carts are client/device-owned: the backend does not store or synchronize them and has no live-cart entity/endpoints. Explicit shared drafts, offer review/reorder and order submission remain backend capabilities. Frontend cart storage/merging/offline behavior remains outside our responsibility.

## Order configuration, saved work and notifications — P0.31
D-ORD-026–030 approve vendor-local trimmed/case-insensitive custom-stage name uniqueness (including reserved core names), cross-vendor reuse, movement between active accepted/pre-dispatch stages including back to Accepted, and renaming used custom stages while preserving historical event labels. No move undoes acceptance or returns from dispatch; retired stages reject new assignments. Cancellation-request denial requires a reason, and a currently authorized buyer may make a new reasoned request after denial before dispatch, with one pending request and the normal dispatch block.

D-BUY-010–013 retain disconnected-vendor favorite references as unavailable without live catalogue/prices and retain shared drafts with submission blocked. Reconnection requires current access/term validation. Reorder preparation returns current terms and changed/unavailable lines without saving a shared draft; save is a separate explicit action. Favorites use desired-state add/remove: repeats do not toggle. No live-cart persistence is introduced.

D-NOT-001–010 select new-order recipients as all active vendor members; buyer status recipients as the still-active original submitter plus current owner/admin; message recipients as all active members of the other organization. Suppress ordinary alerts to the acting user; security/account notices remain separate. Preserve organization-only counterpart author attribution and current authorized access. Support in-app/push/email, with user-owned event/channel preferences: ordinary in-app defaults on, push/email off until enabled and push additionally requires device permission. No promotion announcements at launch. Valid order actions commit independently of provider availability with durable notification work. Ordinary order/message delivery retries automatically within bounds then records/reports final failure. Failed invitations remain manual-resend only.

Exact stage text validation/configuration representation, cancellation abuse limits, retained-data projections, event keys, recipient/preference evaluation timing, notification payloads, attempt/backoff limits, delivery deduplication, providers and detailed queue/outbox mechanisms remain unapproved; D-ENG-009 now selects the database-backed worker direction. No implementation or frontend work is authorized.

Contract examples: repeated favorite add remains saved; repeated reorder preparation creates no drafts/orders. Disconnected favorite/draft responses cannot fetch live vendor prices; saved references/prepared content do not bypass revoked trading access. Stage rename responses may use the new current label while prior history keeps its captured label. A denial command without a reason is invalid. Notification preference mutation affects only the caller's approved preference scope; ordinary email/push stays disabled until enabled. Invitation failure must not enter the ordinary automatic retry flow. Message author projection stays organization-only even in notification payloads.

## Media, location and import constraints — P0.32
D-INV-009 settles the ordinary vendor-to-buyer trading invitation: an already-connected pair returns already connected with no email or duplicate link. Creating the connection consumes/closes its pending trading invitation, including authorized direct linking. Reconnection requires a fresh invitation or authorized platform-admin link, with normal country/type/consent/cap checks. Exact pending-target keys and race/response conventions remain open.

D-NOT-011–014 allow personal per-event/channel opt-out of ordinary in-app notifications; order/message history and separate security notices remain intact. Push targets all currently authorized, enabled devices of an eligible opted-in user. Ordinary email/push payloads contain only event type, organization and order reference; details require authenticated access, and amounts, message excerpts and individual counterpart authors are excluded. Launch has no quiet-hours feature; normal durable delivery/retry scheduling still applies. Exact device registration, templates/links, queued-preference behavior and retry limits remain open.

D-CAT-048–052 approve an ordered product gallery of up to five current images; JPEG/PNG/WebP uploads; a 5 MiB (5,242,880-byte) limit per file; and optional images for activation. Historical orders do not freeze product images; optional current media must still satisfy current access, including disconnection restrictions, while submitted text/commercial snapshots remain authoritative. Image attachment never implicitly activates a product. D-CAT-066–070 settle first-image primary, orientation/metadata handling, decoded bounds, processed-only retention and 24-hour detached-file eligibility; D-CAT-076–080 settle animation rejection, format preservation, stale-gallery conflict, single-product assets and temporary cleanup eligibility. Codec settings and provider/access/cleanup mechanisms remain open.

D-ORG-027–030 require an active buyer-owned saved delivery location at submission, with no one-off unsaved-address path. Vendor fulfillment location is optional; a supplied reference must satisfy ownership/domestic authorization without creating warehouse stock. Locations may be archived while referenced by open orders: prevent new use, preserve snapshots, and let orders finish. Archiving a home/default location clears that default without choosing a replacement; require an explicit valid location when needed. D-ORD-031 disallows direct submitted delivery/contact amendments before dispatch: use authorized cancellation and a fresh buyer-submitted replacement. D-ORG-031–035 settle basic location/contact requiredness, naming and same-ID restoration; exact field formats, fulfillment assignment timing, deletion and transaction rules remain open.

D-CAT-053–057 add manual CSV product import at launch, require all-or-nothing bulk product edits, allow capitalization-only current-SKU edits without a separate retired-code reservation, retain featured flags on inactive/archived products while excluding those products from buyer featured offers, and make completed never-attached uploads eligible for cleanup after 24 hours only if no product/history references exist. Do not apply that cleanup duration to formerly attached files, unfinished uploads or backups. D-CAT-058–065 settle create-only mode, required preview/confirmation, whole-file atomicity, 1,000-row bound, existing references and stock exclusion; exact columns/syntax/file bounds/preview lifecycle, featured limits and cleanup mechanisms remain open; no ERP integration or automatic product activation is inferred.

Contract examples: already-connected invitation requests send no email; product gallery attach number six fails; an uploaded file exceeding 5,242,880 bytes fails; image omission alone does not prevent activation. A new order with an archived/foreign buyer delivery location is invalid; a missing vendor fulfillment location is permitted. A submitted-address edit command is not a launch capability. Bulk edits return failure without modifying earlier valid items. Case-only SKU edit preserves normalized identity and cannot claim a genuinely retired different code. Historical-order media must not fetch unauthorized live catalogue assets. CSV routes/fields/formats and gallery DTOs remain unselected and await the frontend-owner handoff after approval.

## Create-only CSV, processed media and location data — P0.33
D-CAT-058–065 make CSV create-only: no updates or upserts, so Q-CAT-007-D's conditional A has no effect and Q-CAT-007-F confirms no updates. Require validation preview and explicit confirmation; commit the entire file atomically after current authority, cap, identity, reference and lifecycle revalidation. Exclude stock writes. Explicit activation may be requested only when every prerequisite passes; new products created while tracking is on cannot bypass missing-count completion, so import inactive and complete stock separately. Require existing vendor-owned unit/category/tag references. Limit to 1,000 data rows excluding header; reject duplicate normalized SKUs for the whole file and report row/column errors across a parsable bounded file. No catalogue changes or reservations occur during preview. D-CAT-071–075 now select column scope, basic syntax, 5 MiB bound, 30-minute confirmation and successful-result replay. Exact headers/reference encoding, parser details, preview identity/clock/replay retention and commit protocol remain open.

D-CAT-066–070 make the first gallery image primary, with no separate selector. Formerly attached files become deletion-eligible 24 hours after losing their final reference, only if still unreferenced; this is separate from completed never-attached files and backup retention. Normalize visual orientation and remove embedded metadata, including location/camera information. Enforce each dimension <=6,000 pixels AND total <=20,000,000 pixels in addition to the 5,242,880-byte upload limit; reject oversized decoded images rather than silently repair them. Keep only processed images after successful processing/safe replacement, not raw originals. D-CAT-076–080 select static input-format-preserving media, stale-edit conflicts, one-product asset scope and one-hour inactive failed/abandoned raw cleanup eligibility. Codec settings, revision/reference/deletion mechanics, worker leases and providers remain open.

D-ORG-031–035 approve location names unique within each organization after trimming/ignoring case, with cross-organization reuse. Restore archived locations with the same record/ID without changing order snapshots or restoring cleared defaults. Coordinates are optional; textual address is sufficient. Orders require delivery contact name and phone; email is optional. Saved locations require address line 1, city and postal code; line 2 is optional and country follows the organization. D-ORG-036–040 select saved buyer contact defaults, one contact per location, last-active archive, future-only address edits and instruction snapshots. D-ORG-041/042 approve preparation overrides. Exact lengths/normalization/validation, override clearing/draft freshness, exceptional retention/privacy lifecycle and coordinate schema remain open. These relevant delivery contact fields do not authorize disclosure of individual message/event authors.

Acceptance examples: matching an existing SKU never updates it through CSV; unknown referenced unit/category/tag and repeated normalized SKU rows are errors. Preview creates no product; a concurrent cap/SKU conflict before confirmation rejects the whole commit. Explicit activation with missing required tracked stock fails; omission of stock does not mean zero. Primary image equals gallery position one. 6,000 × 3,000 passes the pixel bounds, while 6,000 × 4,000 or 6,001 × 1 fails regardless of file bytes. Processed delivery strips embedded metadata and does not expose raw originals. Location restore preserves ID and leaves cleared defaults unset; location without postal code and order without phone fail their respective required-field checks. Concrete endpoint/error/format conventions remain unselected.

## P0.34 confirmed refinements
These approved refinements supersede earlier pending notes only for the stated choices. No provider, dependency, schema or application implementation is selected.

D-CAT-071–075 approve create-only CSV columns for SKU/name/description/unit/pack text/category/tags/minimum/step/base price/activation. Only SKU/name are required for inactive creation; omitted minimum/step are 1 and omitted activation means inactive. Exclude stock, images, tiers, agreed prices, promotions and featured flags. Use UTF-8, a header, comma separators, dot decimals, double-quoted fields/escaped double quotes, no thousands separators and existing monetary precision. Maximum 5 MiB (5,242,880 bytes) and 1,000 data rows. Preview confirmation lasts 30 minutes and revalidates; repeat confirmation of a successful preview returns the original result without another creation. Exact headers/encoding details, preview clocks/replay retention and authorization/result contracts remain open.

D-CAT-076–080 reject animated PNG/WebP; preserve JPEG/PNG/WebP input format after approved processing; reject stale gallery edits with a conflict/current revision; and limit each asset to at most one product, with no cross-vendor attachment. Abandoned/failed temporary raw uploads become cleanup-eligible after one hour without progress, excluding actively processed files and retained valid assets. Keep successful raw removal and completed unreferenced asset 24-hour policies separate. Decoder/encoder settings, lease/race/cleanup mechanisms, detached asset reassignment and result formats remain open.

D-ORG-036–040 require saved buyer delivery contact name/phone (email optional), one contact record per location, and use it as the initial order contact. Last-active buyer location archival is allowed but blocks new submission until a valid location exists; existing orders finish from snapshots. Saved addresses may change for future orders without rewriting past snapshots. Optional saved delivery instructions are copied into submitted snapshots. D-ORG-041–045 settle order-specific contact/instruction overrides, optional vendor contact, stale-edit conflicts and ordinary archive-only management. Draft freshness, override clearing, field limits and exact revision/transaction mechanics remain open.

D-LOC-002–006 approve English, Serbian Latin (Ekavian), and Bosnian Latin for backend-generated launch text. Users choose their supported language, initially using the organization default explicitly selected by owner/admin at setup. Missing non-English templates fall back to English with internal reporting, without changing preferences. Vendor catalogue names/descriptions have one authored value and no backend automatic translation. Frontend resources remain externally owned. D-LOC-007–011 settle inherited-default changes, explicit setup-invitation language, recorded queued language, invalid-preference rejection and single authored stage labels. Exact identifiers, resource/review details, template versions, resend/reset semantics and fallback failure mechanisms remain open.

Contract examples to verify after authorization: repeated successful preview confirmation returns the original import result; expired uncommitted preview cannot create; a stale gallery update cannot overwrite; a saved buyer delivery location without a phone is invalid; editing a saved location does not amend an order; D-LOC-010 requires unsupported locale preference saves to fail without changing the preference. These are semantic examples, not approved endpoint paths, DTO shapes or error codes.

## P0.35 confirmed location, language and reporting refinements
The following approvals supersede earlier pending notes on these points only. Technical implementation and remaining conventions are still unapproved.

D-ORG-041–045 allow contact/instruction overrides during order preparation without changing the saved location; contact name/phone remain required and submitted snapshots stay immutable. Vendor fulfillment contact is optional, but supplied contacts require name/phone with optional email. Reject stale saved-location writes with a conflict/current revision. Ordinary authorized organization management uses archive/restore, not permanent deletion; role permissions remain unchanged. Exact override clearing/draft freshness, field bounds, revision/transaction contracts and exceptional retention/privacy deletion remain open.

D-LOC-007–011 make users without a personal choice follow the current organization default, while explicit choices stay unchanged. Authorized senders explicitly select supported language for new-organization setup invitations. Resolve and record each notification recipient's language when notification work is created; retries retain it subject to English missing-template fallback. Language changes do not waive current authorization/channel eligibility or manual invitation resend rules. Reject unsupported saved preferences without mutation. Custom vendor stage labels have one authored value; fixed system statuses use translations and historical labels remain preserved. D-LOC-013–016 settle inheritance reset, setup-resend language, first-attempt rendering/retry reuse and required-English release validation. Exact identifiers/resources, rendering/failure/retention conventions and review/tooling remain open.

D-STA-001–010 select delivered-only main goods-value/order-count statistics, bucketed by submission date, using frozen goods line amounts after promotions and excluding separate tax/fees. This does not decide whether catalogue prices contain tax or establish payments/revenue accounting. Older submission periods can increase on later delivery. Active buyers means current active connections. Keep authorized disconnected-partner history and inactive/archived-product historical lines. Group by stable product ID; label from the most recent included order snapshot. Most-ordered ranking is distinct order count descending, total units descending, stable product ID ascending. Requested-range totals/counts/series reconcile and include zero buckets; current-state metrics are separately timestamped. Each response uses a consistent read of committed data when generated, without selecting storage/isolation/cache mechanisms. D-STA-011–019/D-LOC-012 now settle custom-only dates, selectable daily/monthly grouping, country reporting timezone, organization-only scope and all-history active-product suggestions. Exact date boundaries/limits, named zones, labels/tie-breaks, permissions, pagination and exports remain open.

Future contract examples: order preparation can carry an order-specific receiver without modifying the location; location updates require a fresh revision; unsupported language saves leave stored preference unchanged. Statistical example: submitted September/delivered October contributes to September only after delivery. A report response must not combine a total from before delivery with buckets from after delivery. Exact DTO/endpoint/error codes, as-of representation and query semantics remain unapproved.

## P0.36 confirmed reporting, commercial scope and order-reference refinements
These decisions supersede earlier candidate/pending text on these points only. No frontend implementation or technical stack choice is authorized.

D-STA-011–019 and D-LOC-012 require explicit custom start/end dates only, selectable daily/monthly totals, and the reporting organization's country timezone. Named presets and preset-duration interpretations are not approved. Reports are organization-wide only: no location filters or breakdowns. Under explicit user delegation, include orders without vendor fulfillment locations in organization totals without an unassigned group. Per-buyer rows contain active connections with zero orders plus disconnected buyers with qualifying period orders; last-order is the latest qualifying submission date within that range, absent if none. Most-ordered suggestions use all qualifying pair history and omit inactive/archived products while historical reports retain them. Preserve delivered-only frozen-goods metrics, submission-date assignment, consistent reads and zero-filled same-range totals. D-STA-020–025 settle inclusive/current-date validation, explicit grouping, submission-recency labels and own-org role access. Range/result limits, exact query contracts/named zones, equal-timestamp tie-breaks and platform-admin/export scope remain open.

D-PRI-037–042 exclude separate delivery/service charges, refundable-packaging deposits, credit-limit enforcement and dedicated payment-term/due-date fields from the first release. There is no minimum total goods value per order; existing product minimum/step and all other validation still apply. This does not promise free delivery or decide external commercial agreements, subscription monetary metadata, whether prices include tax or tax calculations. The phrase launch orders meant ordinary orders in the first released version, not a separate order type.

D-ORD-032–035 select vendor/year-scoped human numbers in unpadded YYYY/N form, permit gaps and prohibit reuse including after cancellation. Use the vendor country's business timezone for the annual sequence year; exact named-zone mappings/allocation boundaries remain open. A new replacement may explicitly reference a cancelled order for the same buyer/vendor; the link does not copy, submit or cancel automatically, and normal validation still applies. D-ORD-036–039 settle successful-submission allocation starting at 1, one successful direct replacement, chains and frozen submitted links. Numeric limits, clock/retry/transaction/wire conventions remain open.

Contract consequences: reporting requests carry actual start/end dates and a daily/monthly selection, with required/default grouping still pending. No backend named range preset, location selector or unassigned-location report group is selected. Human references preserve the slash form (for example 2026/7) and vendor context; technical IDs remain separate. Optional replacement references must not accept a foreign buyer/vendor or non-cancelled target. Exact schemas/errors/null/omission and operation identity remain unapproved.

## P0.37 confirmed report, order, stock and language conventions
These approvals supersede earlier pending notes only on their stated points. No schema, endpoint, library/provider or implementation is approved.

D-STA-020–025 require inclusive start/end calendar dates, reject future or reversed ranges, allow today using the response as-of time, and require an explicit daily/monthly choice. Reporting uses the organization's country timezone; exact named-zone/DST conversion remains open. Product-row labels use the latest submission timestamp among included orders, with equal-timestamp tie-break still open. Owner/admin/staff may read their own organization's reports; platform-admin reporting/export scope stays unresolved.

D-ORD-036–039 assign human numbers only on successful submission, with each vendor/year sequence starting at 1; shared drafts have no human order number. Gaps remain allowed and numbers cannot be reused. Permit at most one successfully submitted direct replacement per cancelled order; draft references consume no allowance. A cancelled replacement may itself be replaced, forming a chain. Replacement references freeze on submission. Exact allocation/retry/clock/numeric/constraint and retrieval contracts remain open.

D-CAT-081–086 reject stale absolute stock writes with the current count revision; deltas apply to the current count under nonnegative rules. Identified adjustment retries return the original result without reapplying. Valid no-change edits add no business stock-history entry; initializing an absent count is not a no-op. Stale re-enable confirmation requires fresh review instead of a review-session lock. Active vendor owner/admin/staff may read their own stock history. Failed attempts are excluded from business count-change history; security/request/audit failure logging remains separately unresolved. Exact revision/operation identities, retention, transactions, scope/versioning and platform access remain open.

D-LOC-013–016 allow resetting a personal language to inherited organization default; already-queued language stays fixed. Explicit setup-invitation resend retains prior language unless an authorized sender supplies another supported language, without changing token/expiry rules. Render a notification on its first delivery attempt using the current template, then reuse the rendered content for retries while still checking current authorization/channel eligibility. Missing required English backend templates block release through validation. Exact rendering/failure/channel/retention boundaries, template inventory, resource tools and review ownership remain open.

Semantic examples for later contract verification: a single-date range is inclusive; tomorrow/reversed dates or missing grouping fail. Order submission consumes the direct-replacement allowance atomically with success, never at draft preparation. Identified stock replays return the original result, stale absolute writes fail, and no-op results do not create business stock events. Exact permission/revision/idempotency error mapping, payload fields and recovery endpoints remain unapproved.

## P0.38 confirmed account, country, plan and trading rules
All 20 Batch 34 answers are A, including country immutability although B was recommended. These refine earlier pending notes; unresolved implementation details remain open.

- **Accounts and ownership:** D-ORG-046–052: same-account reactivation is limited to the original organization and returns as staff; elevated promotion is separate. Only owner reactivates former admins; owner/admin reactivates former staff. Staff may self-deactivate. Users may edit their own non-unique display names without rewriting historical snapshots. Recipient removal invalidates pending owner transfer permanently. Exceptional platform-assisted recovery requires a verified, audited request accepted by an active same-organization member; completion makes the former owner an inactive admin and preserves exactly one owner. Verification, recovery authority, timing and safeguards remain approval blockers.
- **Platform support and country:** D-ORG-053/054 require a reason before private commercial support reads, recorded with access audit, and exclude dedicated platform-admin commercial exports in the first release. Read-only/no-impersonation limits remain; organization-owned exports are a separate unresolved choice. D-CTR-006 makes country immutable after setup, even for an empty organization. Use separate organization records for another country without moving users. No country/currency correction exception is approved; setup-completion/pre-completion correction and mistaken-record handling remain open.
- **Plan revisions:** D-SUB-011–015 forbid ordinary new assignments of retired revisions while preserving existing pinned assignments. Pin the initial revision when the vendor setup invitation is created; a still-valid invitation may complete with that revision after retirement, a bounded exception. A compliant direct platform-admin plan change closes any pending request as superseded, preserving history. Request rejection requires a recorded reason. Exact revision/configuration format, resend/reissue handling, no-op/race semantics and reason visibility remain open.
- **Trading relationships:** D-ORG-055–058 require a disconnect reason. Vendors may edit dormant agreed prices while disconnected, keeping them inactive without pre-confirmation. After reconnection, explicitly confirm individual prices or an explicitly selected reviewed set; an explicit new/revised price save confirms only that product for an active reconnected relationship. Bulk atomicity, stale-review handling and reason visibility remain open. D-NOT-015 sends an ordinary disconnect event to active owner/admin users of both organizations, excluding the actor, using existing channel preferences and limited external payloads. It does not add platform-admin recipients or automatically expose the reason externally.

Contract work still blocked: reactivation/current-role checks; owner-recovery evidence and approval controls; reason-gated support reads and audit coverage; immutable country at the approved setup boundary; pinned-plan invitation/resend semantics; superseded-request race outcomes; dormant-price confirmation versions/bulk results; disconnect event fields and reason visibility. Those business decisions alone approve no route/DTO; D-API-001/002 now select REST/JSON and the /api/v1 business prefix.

## P0.39 approved API foundation and handoff
D-API-001–008 approve REST/JSON business operations under /api/v1, RFC 9457 Problem Details with stable machine-code/validation extensions, decimal-string money, UUID v7 public resource IDs, UTC ISO timestamps ending Z plus date-only YYYY-MM-DD, rejecting unknown JSON request fields, cursors for orders/messages/history and offsets for catalogue/tabular report lists. D-API-009–028 resolve the stated wire/error/list conventions; individual routes/fields, remaining codes/statuses, value maxima, internal IDs, primary sorts/cursor protection and concrete provider integration remain open.

These conventions are backend contract requirements for both web and mobile consumers, not permission to change frontend code. Prepare eventual examples of monetary strings, UUID v7 IDs versus YYYY/N order references, UTC instants versus calendar dates, strict request validation and list traversal. Do not expose persistence entities or unapproved fields merely because ORM/JSON tooling exists; D-ENG-027/028 now select record DTOs and handwritten mapping, never entity serialization; exact field/projection contracts remain open. Authentication and authorization are mandatory independent of resource-ID shape. openapi.yaml remains blocked by specification version and operation/schema/security decisions, not by unresolved primary transport.

## P0.40 implementation-facing contract conventions
D-ENG-027–030 require record DTOs separate from entity classes, handwritten mappings, no Lombok, UpperCamelCase Java types, lowerCamelCase Java fields/methods and JSON fields, lower_snake_case SQL tables/columns, and UPPER_SNAKE_CASE closed Java/JSON enums. Locale identifiers stay extensible, not a closed enum. Exact fields, values, pluralization, null/omission, validation and migration-file names remain open.

Spring MVC serves the approved REST/JSON API. Response construction must use explicit DTO data fetched/mapped within service transaction boundaries, with Open EntityManager in View disabled. This framework choice does not select routes or entity fields. D-API-019–024 separately approve specified status distinctions and page bounds; the remaining status map and concrete Spring Security configuration remain open. D-SEC-001–018 now settle the Batch 37 non-MFA direction/lifecycle and explicit MFA exclusion; D-SEC-019–038 settle stated session and recovery choices; exact provider proof and implementation mechanisms remain open; frontend implementation stays externally owned. No OpenAPI file is created until its version and the actual operation/schema/security contracts are approved.

## P0.41 approved identity, session and recovery contracts
D-SEC-001–005 approve managed authentication with verified email/password and explicitly linked verified external identities. Email comparison trims surrounding whitespace and ignores case across the whole address without removing dots/plus-tags. External issuer/subject identifies the linked identity; matching email alone never auto-links an existing account. Backend-owned original-organization binding/current roles remain authoritative after provider authentication. Specific provider, protocols, cost/residency and exact synchronization remain open.

D-SEC-006 explicitly excludes MFA from the first release for business users and platform administrators alike. Do not add required or optional factor enrollment, second-factor challenges, MFA-related passkey/security-key/OTP management, MFA recovery or MFA-change notifications. Preserve the accepted non-MFA portions of mixed questions: reset revocation/fresh sign-in, credential/ownership reauthentication and other security notices. No later MFA scope is approved.

D-SEC-007–018 approve 15–128-character passwords with spaces/Unicode, no forced mixtures/scheduled expiry, common/compromised-password rejection and change on confirmed compromise; generic login/recovery outcomes; progressive temporary account/network throttling without permanent automatic lockout; concurrent independently revocable sessions with own-session list/individual/all revocation; 30-minute single-use password-reset links; reset revoking all sessions/fresh sign-in; normal email change with recent authentication and both-address verification; authenticated password change revoking other sessions while retaining the freshly authenticated current one; mandatory email/in-app security notices; five-minute credential/owner-transfer authentication freshness without background refresh counting; separate named platform-admin accounts outside buyer/vendor membership and no public admin signup. D-SEC-019–038 settle session architecture/transports/lifetimes/caps, current-email namespace and stated recovery behavior. Exact provider, session store/secret/rotation, numeric throttle limits, former-email reuse, audit/retention and recovery safeguards remain open.

Design future operations for explicit verified credential linking, own-session inspection/revocation, single-use reset, dual-address email change, recent-authentication proof and security-notice records. Their route/DTO/status/token/transaction details are not selected. Email verification during setup/change and password reauthentication are the approved single-factor lifecycle steps, not permission to add launch MFA. Organization-scoped business APIs and platform-support APIs must distinguish identity classes without treating a business account as an organization-switching identity. Authentication/security scheme choices still block OpenAPI completion and implementation.

## P0.42 approved session and account-recovery contracts
D-SEC-019–029 select backend-issued opaque application sessions with server-side state; browser transport is a Secure, HttpOnly cookie with CSRF protection, and native transport is Authorization: Bearer with the application-session credential. Business accounts use seven-day idle and 30-day absolute expiry; separate platform-admin accounts use 30-minute idle and 12-hour absolute expiry. Only successful authenticated business/support operations count as qualifying activity; background polling, heartbeats and token refresh do not. Active unexpired session caps are ten per business account and three per platform-admin account; a verified new login replaces the oldest-created active session when needed. Failed login never evicts a session. Ordinary logout revokes only the current session; explicit revoke-all remains separate. Current account/role checks remain mandatory and no MFA is added.

D-SEC-030–038 make current normalized login email globally unique across business and platform-admin accounts, including deactivated accounts. Unlinked external sign-in outside authorized setup is denied without an access-request workflow. Users may unlink an external method after recent proof through another usable verified method that remains; never remove the last usable method. A new password-reset request invalidates older unused links and creates one new 30-minute link; deactivated accounts receive no reset link and cannot use existing links while deactivated. Normal email-change requests last 24 hours for both address proofs; an explicit new request replaces the pending request and invalidates its proofs. Completed email changes notify both old and new addresses, plus the already-approved in-app record when accessible. Verified, audited lost-email assistance recovers the same existing account without changing its organization; evidence, approvers, delays/notices and provider controls still require approval before implementation.

Remaining security choices include provider/cost/residency/protocol, session store and secret generation/storage/rotation, cookie scope/SameSite and exact CSRF/CORS policy, qualifying-route list and clock/write/race rules, provider synchronization and logout, former-email reuse, throttle limits, notification delivery/retention and assisted-recovery safeguards. Session lifetime/cap/transport direction and current-email uniqueness are approved, not open defaults. No MFA at launch, including platform administrators; no complete planning-revision approval or implementation authorization.

## Batch 39 resolution
D-API-009–028 approve the stated API conventions below. No application implementation or complete operation/schema/security specification is authorized.

## Retry design clarification — proposals still unapproved
D-API-029 remains the targeted-idempotency direction. D-API-030–045, D-ENG-031–033 and D-SEC-039 now approve all Batch 41 choices including the initial operation mapping. Earlier references to the carried 19 questions being unanswered are historical. Unlisted operation coverage, precise claim/recovery/locking mechanisms, metadata retention and complete endpoint schemas remain open.

## P0.43 approved API conventions
D-API-009–015 approve exactly two-decimal money output strings; digit-based money inputs with optional one/two decimal digits and no signs, spaces or exponent notation; integer JSON quantities without fractions/exponents and field-specific zero/negative rules; UTC Z output with exactly milliseconds and input with zero to three fractional digits; lowercase hyphenated canonical resource UUIDs; null for authorized absent optional resource values and [] for empty collections; explicit distinction between omitted input and null, with clearing only where declared. Date-only values remain YYYY-MM-DD. No internal storage precision/types, maxima, generic PATCH format or undocumented field defaults are selected.

D-API-016–022 approve Problem Details extension names code/errors/requestId; location plus path with JSON Pointer for body fields and parameter names elsewhere; bounded collection of independent authorized validation errors; 422 for invalid values in well-formed requests versus 400 for malformed JSON; 409 with specific codes for business-state conflicts; 404 for inaccessible direct object lookup versus possible 403 for a forbidden action on a visible object; and no submitted-value echo or internal diagnostics in errors. Full field schemas, codes/type URIs, safe parameter allowlists, correlation-ID format, validation count/order and remaining status mappings stay open.

D-API-023–028 approve ordinary list default 25/maximum 100 with rejection of oversized/invalid page sizes; opt-in total counts on offset lists and no total counts on cursor lists; ascending public resource ID as final sort tie-breaker while preserving already-approved business rankings; rejection of cursors whose filter/sort/authorized-scope context changes; and rejection of unsupported filters/sort fields. Report time buckets, exports and imports keep their separate rules. No cross-page snapshot is promised. Endpoint fields/primary sorts, UUID comparison, cursor protection/expiry, count/page consistency and query execution remain open.

D-API-030–045, D-ENG-031–033 and D-SEC-039 now settle the stated retry/revision/isolation and access-race conventions. Exact storage columns, locking/claim design, cursor cryptography, dependencies and provider configuration remain open. Frontend implementation stays external; backend examples and compatibility contracts form the handoff.

## P0.44 targeted idempotency direction
D-API-029 remains the targeted-idempotency direction. D-API-030–045, D-ENG-031–033 and D-SEC-039 now approve all Batch 41 choices including the initial operation mapping. Earlier references to the carried 19 questions being unanswered are historical. Unlisted operation coverage, precise claim/recovery/locking mechanisms, metadata retention and complete endpoint schemas remain open.

## Approved initial operation mapping — D-API-030
This is the reviewed subset of operations, not blanket key coverage. The selected header/format/scope/replay conventions apply to the separate-key rows. Other creates/actions still require explicit mapping.

| Operation | Approved duplicate-effect protection |
|---|---|
| Direct new-order submission without a shared draft | Separate key for that submission intent |
| Stock increase/decrease | Separate key for that adjustment intent |
| New order message | Separate key for that send intent |
| Explicit invitation resend | Separate key for that resend intent |
| Favourite state | Existing organization/product favourite identity and explicit desired state with current authorization |
| Shared-draft submission | Existing draft ID, atomic single consumption and successful-result lookup/replay |
| CSV import confirmation | Existing preview ID, atomic commit and approved successful-result replay |
| Order transitions/cancellation | Order identity, allowed state/revision and unique transition/stock-credit effects |
| Ordinary edits, including absolute stock setting | Existing resource identity and stale-write/revision protection |

Use the Idempotency-Key header with client-generated UUID v4 for the selected key rows. Do not infer client-generated business resource IDs from the rejected mapping alternative. Preserve explicit invitation resend and manual failed-delivery policy. Identity/state/version protection must also prevent duplicate associated stock/job effects; provider delivery semantics are separately designed. No-op ordinary writes preserve revisions. Exact claim/transaction/constraint details, unlisted coverage and natural-identity result retention remain open.

## P0.45 approved retry and concurrency contracts
D-API-030–040 approve the initial targeted mapping: separate keys only for direct new-order submission without a draft, stock delta adjustments, new messages and explicit invitation resends among the reviewed operations. Favourites, draft submission, CSV preview confirmation, order transitions/cancellation and ordinary edits use existing identity/state/revision protection. Selected keys use the Idempotency-Key header and client-generated lowercase hyphenated UUID v4, scoped to account plus organization/support context and operation kind, independent of device/session. Match parsed validated command and target, ignoring object-key order/JSON whitespace but preserving array order, null/omission and expected revision. Mismatched retained keys and concurrent in-progress duplicates return distinct 409 outcomes with no second effect. Successful replay results last seven days from completion; known completed keys are rejected after result expiry rather than reused. Replay original success status/business body after current authorization, with fresh per-request correlation/security headers. Retain successes only; definitive failures with no committed effect release claims, but uncertain outcomes must be reconciled rather than retried blindly. Used-key metadata retention, exact canonicalization/errors/claims, other operation coverage and natural-identity result retention remain open.

D-API-041/042 approve one PostgreSQL transaction for the business write, applicable successful replay record and required durable delivery/job intent. Business-triggered provider delivery runs afterward through durable workers; no provider network call while holding the business transaction. Manual failed-invitation resend remains unchanged; initial queued delivery is not automatic resend. D-ENG-031–033 select Read Committed plus explicit reviewed locks/constraints, at most two seconds per ordinary business lock-acquisition wait, and at most three total attempts for deadlock/serialization failures with authorization/business checks repeated. These are not a whole-request deadline or permission to retry validation/stale input/unknown commits. Exact lock matrices, claim recovery, retry delays, request deadlines and worker/migration limits remain open.

D-API-043–045 select opaque revision strings in resource reads and expectedRevision in edit commands, with unchanged revisions on valid no-op saves. Initialization of a previously absent value remains a change. Generic stale-edit errors return the current revision and require refetch; preserve approved specific data such as current stock count/revision. D-SEC-039 serializes final write authorization with relevant deactivation/permission reduction: revocation committed first prevents the write; a write committed first remains valid. Exact aggregate/version encoding, missing-revision handling, authorization lock/version protocol and response projections remain open. No frontend implementation or MFA scope is added.

## P0.46 approved localization, date and text contracts
- D-LOC-017: Use en, sr-Latn-RS and bs-Latn-BA as the enabled launch locale IDs. Serbian content remains Latin Ekavian by translation policy; the region tag alone does not encode dialect.
- D-LOC-018: Accept case variations of supported locale IDs and store/return their canonical casing. Reject unconfigured aliases, short forms such as sr, and underscore forms; unsupported updates preserve the prior preference.
- D-LOC-019: Expose a read-only backend endpoint returning enabled locale IDs.
- D-LOC-020: Use explicitly UTF-8 .properties files through Spring message resources for backend message text.
- D-LOC-021: Name backend translation keys using lowercase dot-separated segments, such as order.created.subject.
- D-LOC-022: Use Java MessageFormat indexed placeholders such as {0} for simple backend text templates, with a documented parameter contract per key.
- D-LOC-023: Block release if any present backend locale resource violates its syntax or parameter contract. Missing non-English translations continue to use approved English fallback; required English completeness remains mandatory.
- D-LOC-024: Reset a user language preference to organization inheritance by sending languageOverride: null in the preference update; omission leaves it unchanged.
- D-LOC-025: When no usable template exists even after English fallback, fail the affected delivery attempt, record/alert the rendering failure and follow that delivery type’s existing retry or manual-resend policy. Do not fabricate generic content, roll back a committed business action or change preferences.
- D-LOC-026: Map Serbia business dates to Europe/Belgrade and Bosnia and Herzegovina business dates to Europe/Sarajevo. Apply these country mappings to approved reporting, promotion local-time rules and annual order numbering.
- D-LOC-027: Convert inclusive report dates to an instant interval including local start-of-day on the first date and excluding local start-of-day on the day after the last date. Do not assume every local day is 24 hours.

- D-API-046: Render stored instants with greater precision by truncating to the preceding millisecond. This is API output conversion only.
- D-API-047: Normalize human-authored business text to Unicode NFC before initial storage or an authorized edit, and before applicable length/uniqueness checks. Do not transliterate, remove accents or introduce additional trimming. Exclude passwords, emails, identifiers, URLs and opaque values. Do not rewrite frozen history or bypass editing locks.
- D-API-048: Count business-text limits as Unicode code points after approved NFC normalization and already-required trimming.
- D-API-049: Limit product and organization display names to 200 characters; category, tag, location, custom-stage, member-display and contact names to 100; unit names to 50. Count using the approved business-text normalization/code-point convention.
- D-API-050: Limit product descriptions to 5,000 characters under the approved business-text normalization/code-point convention.
- D-CAT-087: Limit descriptive pack contents to 200 characters under the approved business-text normalization/code-point convention.
- D-ORD-040: Limit order notes to 2,000 characters under the approved business-text normalization/code-point convention.
- D-ORD-041: Limit each order message to 4,000 characters under the approved business-text normalization/code-point convention.
- D-API-051: Limit existing human-entered rejection, cancellation, disconnect, stock-adjustment, plan-rejection and support-access reasons to 1,000 characters under the approved business-text normalization/code-point convention.

The locale-list route/access/cache/schema, preference response/revision schema, field-by-field presence/clearing rules, exact case folding/whitespace handling, template inventory/HTML escaping and promotion DST ambiguity handling remain unresolved. Text limits do not select rich text, new required fields or new edit rights. Existing malformed/invalid/conflict error conventions still apply; exact field codes/DTOs remain to define. Idempotency command matching must respect approved parsed/validated text semantics, but canonicalization implementation is not selected. Frontend receives these contracts as integration guidance.

## P0.47 approved API verification and handoff
D-TST-007/010 require MockMvc coverage plus real-server HTTP checks for transport-sensitive behavior and mandatory backend integration verification in PR checks. D-TST-012/013 separate normal local provider simulations from controlled sandbox compatibility checks. D-TST-015/016 require actual database concurrency and commit/response-loss/worker failure evidence for approved command behavior. These choices do not alter business rules, API routes, error codes, authentication mechanisms or idempotency coverage.

D-TST-020 requires per-completed-slice contracts, examples, limitations and backend test evidence for frontend integration. The frontend owner implements client changes and verifies browser/mobile behavior. No messaging authorization, concrete frontend owner or product-launch acceptance is implied. Individual DTOs/routes and exact tooling configuration remain unapproved; openapi.yaml is still subsequent work when relevant contract choices are approved.

## P0.48 delegated contract completion and environment constraints
D-GOV-005 authorizes the assistant to choose/document remaining routes, schemas, validation, security mechanisms, versions and compatibility conventions from confirmed requirements without further routine questions. Their absence remains incomplete design, not approval to invent undocumented behavior during implementation. Create OpenAPI after recording concrete contract choices. Preserve no MFA, permanent single-organization accounts, domestic boundaries and the scoped idempotency policy.

D-INF-011–014 require separate staging provider identities/credentials, synthetic business data and bounded test delivery. Backend handoff must identify environment base URLs, identity/push registration boundaries and safe test accounts; actual client app configuration/testing remains external. D-INF-020/021 require readiness and private management access; exact management routes are a separate operational contract from business APIs. D-TST-020 per-slice handoff remains.

</details>

## Local HTTP authentication implementation,2026-10-17
Seven identity/session operations are locally implemented behind explicit default-off configuration; see [HTTP evidence](BE/AUTH_HTTP_VERIFICATION.md) and [client handoff](FRONTEND_HANDOFF.md). openapi.yaml now describes cookie-bound one-use pre-auth bootstrap, provider-outside-transaction login, stable CSRF bootstrap, repeat logout and login413/415 errors. Live provider, hosted security and client acceptance remain gated. Remaining operations are planned contracts, not delivered endpoints.

## Password reauthentication implementation,2026-10-17
The eighth local identity operation, POST /auth/reauthentication, accepts only the current password and derives identity from the existing session. openapi.yaml records the out-of-transaction provider call, current-state rotation,413/415 responses and no-grace response-loss behavior. See [reauthentication implementation](BE/REAUTH_IMPLEMENTATION.md). Live-provider/hosted/client acceptance and remaining operations are not completed by this increment.

## Own-account/language local implementation

GET /me and PATCH /me/language are the ninth/tenth locally implemented operations. Browser CSRF/Origin, native transport, current-state authorization and shared throttles apply. The patch uses locked account revisions, omission-versus-null semantics, canonical supported language tags and atomic audit; unchanged saves preserve resource revision. Request413/415 errors are documented in OpenAPI. Profile PUT remains pending location support. See [implementation](BE/OWN_ACCOUNT_IMPLEMENTATION.md).

## Own organization settings local implementation

GET and PUT /organization are the eleventh/twelfth locally implemented operations. GET derives sole organization scope; PUT requires owner/admin, organization-specific current revision, complete approved fields, matching address country and vendor restriction=false. Organization guard precedes account/session locks. Settings/audit/activity commit together; no-op preserves resource revision.413/415 and retry details are recorded in OpenAPI. Location/admin routes remain unavailable. See [implementation](BE/ORGANIZATION_IMPLEMENTATION.md).

## Saved locations implementation, 2026-10-17

The six list/get/create/update/archive/restore routes under /organization/locations extend the local surface to18 operations. [Location implementation](BE/LOCATION_IMPLEMENTATION.md) specifies organization-first transactions, strict query/body parsing, creator/context-bound seven-day original creation replay, currentRevision conflicts and atomic default clearing. [Handoff](FRONTEND_HANDOFF.md) supplies payload and retry examples. No ordinary permanent deletion or frontend work is included; order/location snapshots and profile default selection remain unfinished.

## Own profile implementation, 2026-10-17

PUT /me extends the local configured surface to19 operations. [Profile implementation](BE/PROFILE_IMPLEMENTATION.md) defines active same-organization home selection, platform null-only defaults, current-revision/no-op behavior and archive-safe atomic updates. Shared language/organization stale conflicts now include currentRevision per R-API-045. [Handoff](FRONTEND_HANDOFF.md) includes request and recovery guidance. No frontend implementation or live-provider acceptance is implied.


2026-10-21 D-PLAN-018/R-PLAN-018 intake and existing three privacy request/read contracts: [local execution evidence](BE/PRIVACY_CASE_VERIFICATION.md).1213 checks passed; schema59,209/209 configured operations. Initial REQUESTED metadata/creator replay and bounded response cleanup do not establish assisted fulfillment, legal holds, deletion/recovery ledger, wider retention or external release gates.


2026-10-22: schema69 case-linked evidence holds locally verified;213 operations,1,374 full checks, zero failures/errors/skips. [Execution evidence and limits](BE/RETENTION_HOLDS_VERIFICATION.md). Local synthetic checks do not establish legal applicability, real operator/provider/recovery or production acceptance. Assisted fulfillment/ledger/archive/restore and final local acceptance remain in the serial work order.


2026-10-22: schema70 portable JSON storage/status/encoding foundation locally verified,1,383 full checks passed;213 operations unchanged. [Exact execution and unfinished data path](BE/PORTABLE_JSON_VERIFICATION.md). Existing case reads derive current workflow state while original intake/creation replay remain immutable; metadata remains readable with export actions off. Apply [safe metadata grant](BE/audit/privacy-fulfillment-grants.sql). Qualified approval/source generation/requester download routes and worker are not yet implemented; keep their flags off. No actual file/legal/provider/recovery/production acceptance is inferred.

2026-10-22 complete JSON delta under schema72 frozen verification: six operations added (219 total). [Selected flow](BE/PORTABLE_JSON_IMPLEMENTATION.md), [source map](BE/PORTABLE_JSON_SOURCE_MAP.md), [separate review](BE/PORTABLE_JSON_REVIEW.md), [current evidence](BE/PORTABLE_JSON_COMPLETE_VERIFICATION.md). Qualified operator metadata/approval, original requester latest/status/download, complete explicit manifest, restricted worker pool/grants and retained-ciphertext/expiry behavior. Full/artifact acceptance remains pending. Private case request/legal context is excluded with restricted operator/support context; portable JSON is the declared owned/shared dataset, not a raw internal database dump. Client implementation remains external.

2026-10-22 D-GOV-005 / D-PLAN-018 / R-PLAN-018 selection before dependent read-only preview code: [current assessment contract](BE/REDACTION_PREVIEW_IMPLEMENTATION.md),220 operations/schema74 draft. Qualified committed purpose permit, one consistent non-content count snapshot, explicit retained/unknown families and blockers; no executable plan, case progress or source mutation. This query refines the earlier persistent-preview draft before implementation; actual intent/commit/completion remains separate. Verification pending.

2026-10-22 D-GOV-005 / D-PLAN-018 / R-PLAN-018: read-only redaction preview locally verified, schema74 /220 operations;1,475 full checks passed (204 unit/1,271 integration), zero failures/errors/skips,629 frozen inputs unchanged. [Exact evidence and limits](BE/REDACTION_PREVIEW_VERIFICATION.md). Current source-based attribution, explicitly scoped inventories/unknowns and blockers do not constitute a prepared executable plan, actual redaction or whole-case legal fulfillment. Continue with independent verified intent/committing supported action/completion and remaining local acceptance.


2026-10-23 schema78 draft /225 operations: recordPrivacyCaseDisposition and readPrivacyCaseDisposition add qualified immutable ten-family reviews. Explicit retained/pending scope, source-bound applied-job references and allDataErased=false distinguish assisted resolution from universal erasure. Complete current role/source/revision/hold/pending-work guards, natural review identity and immutable original replay; default-off authenticated routes. BE/CASE_DISPOSITION_IMPLEMENTATION.md records selection; execution pending. Frontend application work remains external.
