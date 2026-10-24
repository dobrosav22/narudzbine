# VS-01 business contacts

2026-10-18. Batch scope: listContacts, createBusinessContact, getBusinessContact, updateBusinessContact, archiveBusinessContact and restoreBusinessContact. Implemented and locally verified; see [executed evidence](CONTACT_VERIFICATION.md). VS-01 remains in progress.

## Implementation refinements

Selected under D-GOV-005 before dependent code: ordinary contact labels and person names may repeat; there is no approved uniqueness rule for business-contact labels. Required label/name/phone and explicit nullable email follow ContactInput/ContactUpdate and the shared text/email rules. These records do not select a delivery contact or alter location contacts. Archived contacts remain readable/editable and may be restored; there is no ordinary delete operation.

Use the established organization-before-account write guard, current owner/admin permission checks, contact-specific revision domain contact/v1, normalized no-op preservation and atomic minimal audit. Reads stay organization-scoped; platform administrative correction/support is a separate future workflow. Lists default to all states, with optional ACTIVE/ARCHIVED filtering, createdAt DESC/id ASC and optional same-snapshot total.

Client UUIDv7 creates retain the original normalized response for seven days, bound to actor/organization/id. Replay returns 200 (new creation 201); payload mismatch conflicts, inaccessible IDs return 404, expired replay returns 409 with the authorized resource reference. Use a domain-separated HMAC-SHA256 create digest with the existing configured revision key, without storing full original intent in tombstones. Compaction clears only expired snapshots in bounded batches and retains identity/digest. The revision key therefore also protects these receipts; rotation must preserve replay comparison capability or wait for receipt expiry and handle retained tombstones explicitly before rotating. No key rotation is implemented by this batch.

Migration adds business_contact/contact_creation and immutable binding/receipt triggers, extends audit action validation and advances schema marker to11. Runtime grants and packaged migration/startup evidence must be updated. Default API/provider activation remains off. Dependencies and provider configuration are unchanged.
