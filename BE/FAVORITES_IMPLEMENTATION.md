# Shared buyer favorites implementation

VS-09 favorites increment (the preceding status called this VS-06 in error; VS-06 is cancellation in IMPLEMENTATION_PLAN).

2026-10-19, delegated refinements under D-GOV-005; R-BUY-005/006/010/013 and existing contract govern.

Favorites are buyer-owned desired membership, unique by buyer/product. PUT requires current domestic offer access even for an existing reference; repeats preserve createdAt. DELETE succeeds for an absent reference and works after disconnection. Remove followed by add is a fresh membership with a new save time. Concurrent opposite actions serialize on the buyer organization; last committed desired state wins. No retry key, revision or response receipt is introduced. No catalogue snapshot or user ownership is stored.

Listing orders createdAt DESC/productId ASC, with optional total and strict existing pagination bounds. Available means current published offer access, not sufficient stock. All available offers use minimum quantity and one pricing instant. Unavailable references return only productId/createdAt, available=false and offer=null, including suspended vendors and disconnections. Reconnection recalculates current safe offers.

Transport composes a buyerworkspace.api persistence port and the existing buyer-safe offer projection. Identity gains an explicit public buyerworkspace edge; buyerworkspace imports no other business implementation. Catalogue exposes only a product-to-vendor routing lookup, which never grants access. Final current authorization remains mandatory.

For list reads, discover only page vendor IDs before final authorization, acquire those organization guards plus buyer in database UUID order before account/session, then reread the page under the buyer guard. If the current page needs an undiscovered vendor, roll back this read and repeat discovery (maximum three attempts, then503). No business mutation is retried. This prevents lock inversion and stale vendor projections without locking every favorite vendor. PUT locks both parties; DELETE needs only the buyer guard. Current membership, browser CSRF and throttling are checked on all committing actions.

Normal unavailable live-partner lookup uses an optional trading projection, not an exception caught after a transactional port has marked rollback-only. Genuine retained product identities remain readable through catalogue ownership.

Schema32 stores immutable buyer/vendor/product/save-time bindings with domestic buyer/vendor validation, product foreign key and no expiry. Deletion is explicit desired absence. Existing references survive product state/connection changes. Favorites do not reserve stock, create carts/drafts or submit orders.

Local verification and limits are recorded in [evidence](FAVORITES_VERIFICATION.md).
