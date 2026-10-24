# Atomic catalogue bulk edits — 2026-10-20

Refinement under D-GOV-005 of D-CAT-054/D-PLAN-024 and DESIGN_SPEC §11. Backend only; no new dependency, schema, provider or client implementation.

The existing POST `/api/v1/catalogue/bulk-edits` accepts 1–100 unique targets with current product and pricing revisions. Check every revision before any write under the committing vendor organization/account guard. Execute in canonical product UUID order; return request order. Existing catalogue/pricing owner ports retain validation, history and body-free audits in one transaction. Any failure rolls back everything.

Common optional actions: positive absolute base price or percentage greater than −100 and at most 1000 (at most two decimals), category set/explicit-null clear, unique disjoint tag additions/removals, activation/deactivation. Null price/active mean unchanged. Omitted arrays mean empty. Reject empty commands. Tier corrections replace a unique targeted product's whole schedule; empty removes tiers. Corrections can occur without a common price action. Resulting tag sets remain at most50. Unknown fields, duplicate targets/tags/corrections and corrections for non-targets fail validation. No SKU/unit/pack/stock/media/featured/archive changes.

Percentage: current base × (100 + percentage)/100, half-up to two decimals. Absent base, zero/negative rounded result or overflow fails. Preserve tiers unless explicitly corrected; normal minimum/step and strictly decreasing prices apply. All commands require EDIT_CATALOGUE; price/corrections also require EDIT_PRICES. Deactivate before changes; activate after price/metadata changes with normal unit/stock checks. Archived products retain single-product behavior: metadata/prices editable, publication commands invalid.

No new retry key/receipt. Original expected revisions must match. Successful changes make exact retries stale before writes; true no-ops may repeat without new audit/history. Clients refetch both resources after conflict/uncertain outcome. Late invalid targets can fail after earlier internal writes; transaction rollback prevents partial persistence.

Planned checks: both currencies, combined changes, rounding/bounds, tier corrections, no-op/stale retry, scope/CSRF/current membership, concurrent requests, late validation/persistence rollback and actual100-target execution. Executed evidence is recorded separately.

Request bodies are bounded to512KiB to accommodate100 targets and up to5000 corrected tiers, exceeding the ordinary16KiB single-resource limit. All supplied category/tag references, including removals, must be current same-vendor records of the right kind; unknown/deleted/foreign references fail422 without disclosure.

Executed checks and limits: [verification](BULK_VERIFICATION.md).
