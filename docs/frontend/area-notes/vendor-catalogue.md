# Vendor catalogue, pricing, promotions, images, CSV import, inventory — gaps (agent B)

Scope: web `/vendor/catalogue/**` (list, new, [productId], featured, promotions, taxonomy, import, inventory); mobile vendor catalogue tab, `vendor/product/*`, `vendor/merchandising`, `vendor/inventory`; core `queries/catalogue.ts`, `queries/promotions.ts`, `queries/inventory.ts`.

## Backend capabilities the UI needs but does not have

1. **No price summary on the product list** (`listProducts`). The list shows base prices, and bulk edits need every target's pricing revision, so the client issues one `GET /catalogue/products/{id}/pricing` per row (25 per page). The inventory table does the same with `GET /inventory/products/{id}`. Impact: N+1 requests per page. A list-level pricing/stock summary (or a pricing batch read) would remove this.
2. **No featured filter or ordering on the vendor product list.** `listProducts` has no `featured` parameter and the featured flag has no position (contract: "No separate feature count cap", flag only). The featured screen reads every product (pages of 100) and filters on the client. The UI states that buyers see featured products in catalogue order. The old mock-era manual featured ordering was removed because the backend does not have it.
3. **No per-product agreed-price read.** Agreed prices can only be listed per relationship (`listAgreedPrices`). The product editor's buyer-prices card reads every active relationship's full agreement list and filters by product (one call per buyer, more pages if needed). This is fine for the pilot size and will not scale to hundreds of buyers.
4. **No "not archived" product filter.** The `state` filter accepts one value. "All statuses" therefore includes archived products (shown with an Archived badge).
5. **No single-record taxonomy GET and no taxonomy usage counts.** The UI can't show in advance whether a category, tag or unit is still used. Deletion reports `RESOURCE_REFERENCED` afterwards, and the UI explains it.

## Contract ambiguities and how they were resolved

- **Image reservation:** there is no separate reserve operation. The client generates a UUIDv7 asset id and `PUT /media/assets/{id}/upload` claims it (per the uploadImage description). Retries reuse the same id and bytes (web keeps the `File`, mobile keeps the `Blob`).
- **Promotion `buyerIds`** are buyer organization ids. Verified live: `targetLabels.buyers[].id` equals `Relationship.buyerId`.
- **Promotion schedule:** `startsAt`/`endsAt` are sent as `{localDateTime, offset}` in the organization's country zone (Europe/Belgrade or Europe/Sarajevo), with the DST-correct offset computed by `toCountryLocalTime`. The form shows the zone name.
- **Duplicate SKU** returns `SKU_RESERVED` (verified live), not `DUPLICATE_SKU`. The shared text ("belonged to a product with order history") was misleading, so `catProblems.SKU_RESERVED` overrides it.
- **Problem codes missing from the shared `problems` namespace:** `QUANTITY_RULE_CONFLICT`, `DEACTIVATION_REQUIRED`, `PRODUCT_UNIT_PACK_FROZEN`, `COUNT_REQUIRED`, `PREVIEW_STALE`, `PREVIEW_APPLIED`, `REVIEW_INCOMPLETE`, and the asset failure codes (`ANIMATED_IMAGE_NOT_ALLOWED`, `IMAGE_DIMENSIONS_EXCEEDED`, `IMAGE_OUTPUT_TOO_LARGE`, `IMAGE_PROCESSING_LIMIT`). They are phrased in the new `catProblems` namespace and used through `catalogueProblemMsg()`.
- **Product save:** catalogue and pricing edits made together go in one atomic `PUT /catalogue/products/{id}` with `pricingCorrection`. A pricing-only change uses `PUT …/pricing`. The form keeps the revisions it started from. It uses the latest revision only when the fields it edits are unchanged on the server (for example, after a status, featured or gallery change). Otherwise the stale revision returns `REVISION_CONFLICT`: the edits are kept and the user can "Reload latest".
- **New product:** `POST` creates it INACTIVE. If a base price was entered, the client then reads the empty pricing revision and `PUT`s the price. If that second step fails, the product exists without a price and the user is told.
- **Stock adjust:** each pending intent keeps its `Idempotency-Key`. The key is reused only to retry the identical body after an uncertain outcome. A changed body gets a new key. After success the client refetches instead of trusting the replayed response, which may not be the current balance.

## Operations intentionally left without UI

- `POST /relationships/{id}/agreed-prices/confirmation` belongs to the buyer side (D2). The vendor card only shows "Awaiting the buyer's review" when `confirmationRequired` is set.
- `PricingUpdate.deactivateProduct: true` is not offered. Removing the base price of an active product returns `DEACTIVATION_REQUIRED`, and the message tells the vendor to deactivate first.
- Admin support reads (`adminRead*`) are the admin area (E).
- **Mobile:** creating and editing promotions stays on web (target pickers and schedules). Mobile lists promotions and can stop or archive them. CSV import is web only.

## Local-test limitations

- **Image processing is not available in the local harness.** Uploaded assets stay `QUEUED` (verified: upload 202, identical replay 202, still QUEUED after polling). Attaching a non-READY asset returns 422 `VALIDATION_FAILED` (verified). The READY → attach → `assetContentUrl` display path is therefore untested end to end. The UI shows "still processing" with Check again / Discard.
- **Tracking was not switched on.** Live checks prepared a reconciliation, listed lines, acknowledged 3 of 15 and got `REVIEW_INCOMPLETE` on confirm. Tracking was never actually enabled, because that would change ordering behaviour for every agent's shared fixtures. For the same reason, disabling while on was not exercised; disable while off was a verified no-op.
- **Not tested in a browser:** web image display relies on the session cookie being sent with `<img src={assetContentUrl(id)}>` from https://localhost:3000 to the API proxy on :18443. Not verified in a browser; no UI runs were allowed in this stage.
- **Bearer path only:** live checks used the native bearer transport through core (`scratchpad/b/live.ts`). Browser CSRF on `send()` (CSV and image upload) relies on the shared client and was not exercised.

## Core change requests

- `packages/core/i18n/messages.test.ts` "keys named in shared code and apps exist in English" currently fails on its own sanity assertion (`found.length > 100`). The mock-era code that produced most matched literals was deleted, so the scan threshold needs updating. This is not caused by this area: its keys all exist.
- The shared test also reads `MESSAGES['sr-Latn'].promotions.scopeCount.product` (Serbian plural check), so the mock-era `promotions` namespace is kept although no screen uses it. Point the test at a live namespace (e.g. `vendorCatalogue.total`) so `promotions` can be deleted.
- Consider adding the codes listed above (`QUANTITY_RULE_CONFLICT`, `DEACTIVATION_REQUIRED`, …) to the shared `problems.codes`, and correcting `SKU_RESERVED` there, so other areas phrase them consistently.
- `problems.json` contains mis-encoded characters ("Your edits are kept � reload…", "15�128 characters") in the shared namespace.
