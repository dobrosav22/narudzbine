# Order review receipts refinement

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/ORDER_REVIEWS_IMPLEMENTATION.md`: Order review receipts refinement._

2026-10-19, assistant refinements under D-GOV-005 for bounded VS-04 reviewOrder. Preserve R-ORD-002/016/031, R-PRI pricing decisions, delivery-contact/instruction decisions, R-BUY shared-draft rules and DESIGN_SPEC sections6/11. No order, stock deduction, draft consumption, guaranteed price or quota hold is introduced.

POST requires complete normalized OrderIntent (1..500 unique positive whole lines, nonnull own active delivery location) plus paired nullable draftId/draftRevision. Reuse strict draft preparation parsing with131072-byte cap, then enforce checkout completeness. For a draft, require current same-buyer OPEN draft, exact opaque revision and exact saved normalized intent; save changes before review. All current buyer roles may prepare reviews even under staff submission restriction. Browser CSRF/native bearer and throttling/current authority apply.

Final sorted buyer/vendor guards precede actor/session, current active domestic relationship/live vendor checks, active same-vendor products, minimum/step checks, current stock eligibility and prices. Narrow inventory.api.ReviewStock exposes status only (READY/CONFIRMATION_REQUIRED/INSUFFICIENT), never private stock obligations or writes. Off-mode ignores retained count. Confirmation-required tracked products reject409; shortage rejects409 INSUFFICIENT_STOCK; invalid quantity422. No lines are silently dropped. Location/contact/instructions resolve inside this scope: null contact inherits; INHERIT current saved text, OVERRIDE explicit text, CLEAR null. Saved location remains unchanged.

ordering.api.OrderReviews owns immutable15-minute receipt persistence, normalized intent hash and commercial terms hash. Hash comparison excludes receipt ID/time/expiry and stock counts; it includes normalized intent, resolved line identities/prices/promotion attribution, delivery address/contact/instructions, currency and total. Relationship generation and draft revision are separately bound metadata. Capture one injected business instant for all line pricing and receipt timestamps. New review safely gets a new server UUIDv7; no additional retry key or original-success replay. Exact money uses two-decimal unit-before-quantity pricing and bounded NUMERIC(24,2) total, explicit NET_EXCLUDING_VAT, no taxes/fees/deposits/payment fields.

No actual order history exists yet. Nonnull replacementForOrderId therefore returns404; no fixture-only commercial identity/table is fabricated. Positive replacement-history validation and changed-term recomputation/actual submission require the subsequent genuine ordering transaction and remain explicitly unfinished. This is not rejection of the approved replacement capability in the full release.

Schema34 receipt binds domestic parties, actor, real relationship/generation, optional real draft/revision and immutable intent/result hashes/snapshot. Scoped internal reads enforce exact expiry and permit another authorized same-buyer member, with authorization owned by the caller. No new GET route is added;201 Location identifies the receipt. UPDATE is prohibited. Technical expiry purge uses a bounded1000-row indexed deletion batch and a transaction-local injected-clock cutoff checked by the DELETE trigger. Concurrent purge attempts are repeat-safe; existing2-second lock waits bound contention and a definitive rollback is retried by the next scheduled maintenance run. Row-locking SELECT is unnecessary and would require UPDATE privilege, which remains ungranted. The existing independent maintenance transaction invokes purge each minute; scoped expiry still rejects reads if cleanup lags. Test-only maintenance initial delay avoids nondeterministic purges while testing exact expiry; worker invocation is exercised explicitly. Monitor backlog/worker failures before release; no untested24/7 operations claim.

Identity adds only ordering.api dependency. Ordering consumes existing owner APIs, not implementations. Default-off HTTP must still start without revision secrets. Record exact executed evidence separately; full submission/provider/client/release gates stay open.

Local [verification](#verification) records executed results and remaining gates.

## Verification

_Originally `BE/ORDER_REVIEWS_VERIFICATION.md`: Order review receipt verification._

2026-10-19, local synthetic backend/infrastructure work only. No provider provisioning, production deployment, merge or frontend changes.

Focused .tools/order-reviews-focused-final-2.log passed17 HTTP/transaction/authorized-service groups, one previous-schema migration and9 unit/contract/architecture checks (including3 new ReviewRequestsTest cases), zero failures/errors/skips, BUILD SUCCESS. Prior runs caught a receipt-trigger mismatch with trading_relationship.connection_generation and an expiry SELECT FOR UPDATE that required UPDATE privilege. Corrected the new trigger and selected bounded indexed repeat-safe deletion under SELECT/INSERT/DELETE grants. Routine compile wiring issues were corrected. Failed runs are retained and are not acceptance evidence.

Distinct primary review covers current pair/buyer authorization/CSRF, public module edges, one business pricing instant, current all-unit tiers/agreement/single promotion and exact rounding, no stock hold, own active delivery/contact/instruction resolution, exact current saved-draft intent/revision binding, safe snapshot DTOs, scoped immutable receipt hashes/15-minute expiry, guarded technical purge and unchanged default-disabled startup. Actual order/replacement history, changed-term recomputation and submission are subsequent work; no fake commercial identities are used.

Final unfiltered .tools/order-reviews-final-verify.log passed563 tests, zero failures/errors/skips, BUILD SUCCESS. Surefire63; Failsafe500: Foundation35/AuthHttp417/IdentityBoundaries11/PasswordLogin15/SessionService22. Fresh XML totals agree with the log. This includes17 new review HTTP/transaction/authorized-service groups,3 ReviewRequestsTest cases and previous-schema migration with prior regressions. Real PostgreSQL barriers covered committing price/disconnection/member changes; actual deferred commit failure rolled back receipt creation. Exact expiry/immutable update/delete guards and manual maintenance invocation passed. No executable/schema/test/build change followed the successful full gate.

### Executed packaged checks

Final JAR SHA2568d9c6444493ca8fd86ea6fb2759b73ca2a3f713b6f58f42ba653977e23b93a14; local image narudzbine-backend:vs04-order-reviews IDsha256:9a353e48d7c3cf265090c301fd5aa0a047d769cb18b1aa5e5e7a945684a76c70. Host/stored/image JAR and built/smoked/scanned image identities match. Evidence: .tools/order-reviews-image-build.log, .tools/order-reviews-scanned-jar.sha256, .tools/order-reviews-built-image-id.txt, .tools/order-reviews-smoke.log, .tools/vs04-order-reviews-container-smoke-result.json.

.tools/vs04_order_reviews_container_smoke.py passed controlled schema34 migration, nonroot read-only Linux startup, private readiness200/public diagnostics404 and new default-disabled POST order-reviews404 with prior routes. Disposable resources were removed. This does not prove hosted provider topology or production readiness.

Trivy0.76.0 BE/target/order-reviews-container-vulnerabilities.json: Java/HIGH/CRITICAL0; existing Ubuntu24.04 base26 MEDIUM/4 LOW. Offline cache: vulnerability DB updated2026-10-16/downloaded17; Java DB updated18/downloaded19. This is not fresh production advisory status. Dependencies/build resolution are unchanged; earlier separate dependency/license/advisory evidence is reused with these cache limits. Final SBOM110 components all have license metadata; no suppressions added.

Final source/root-document secret scan BE/target/order-reviews-secrets.json found0 secrets. Structural/link/whitespace/register checks passed:209 operations/204 schemas/3046 references,625 question IDs/545 decisions/543 requirements and543 trace rows. No executable/schema/test/build changes followed the successful full gate.

### Remaining gates

Direct/draft submission, genuine order/replacement history, changed-terms recomputation and explicit resubmission, original stock accounting/credits/fulfillment, large-data load/query plans/maintenance backlog behavior, hosted CI/providers/restore/operator/client/full-slice/release acceptance remain unfinished. Exact local expiry rejection and manual scheduled-method invocation do not prove a continuously operating production scheduler or purge SLA. No fake commercial identity or replacement-success claim is used. [Refinement](#implementation), [handoff](../../frontend/backend-handoff.md), [status](../../project/status.md).
