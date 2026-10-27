# Buyer offers

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/OFFERS_IMPLEMENTATION.md`: Buyer offers._

Delegated selections under D-GOV-005,2026-10-19, recorded before dependent code. Preserve domestic active trading, sole buyer membership, explicit publication, current-generation agreements, exact tier/promotion rounding and no reservation/cart rules. These are assistant refinements, not new user answers.

- Three read-only business routes: listOffers/getOffer/listOfferTaxonomy. Admission authenticates the buyer and throttles; final reads acquire both organization guards in UUID order before current actor/session/member authority, recheck active domestic relationship and live vendor status, then capture one millisecond pricing instant. No platform support bypass is added. All buyer roles may read; the staff submission restriction does not prohibit offer preparation.
- Catalogue list uses actual ACTIVE rows, literal current-SKU/name search, contract offset/sort/category/tag/featured filters and coherent totals. Zero-stock active products remain visible. When tracking is off, or confirmation is stale, availableQuantity is null; retained/unreviewed counts are not disclosed as current availability. A stale confirmation does not silently deactivate or initialize products. Submission eligibility still requires its later current-stock checks. Detail validates quantity minimum/step and permits requests above available stock.
- Normal price is base or reached all-unit tier, independently shown alongside the current confirmed agreed price. Agreement always wins before one best promotion. reachedTierThreshold describes ordinary tier resolution even when an agreement overrides it. Dormant unconfirmed agreements are omitted and ordinary pricing applies; confirming one product enables only that agreement even when others remain pending.
- Promotions use one explicit pricing instant, scope/window checks, rounded half-up unit savings, earliest creation/UUID tie order and no equality/increase attribution. Buyer summaries contain only strictly saving eligible candidates for that requested quantity, in creation/UUID order, never target IDs/labels, revision, author or history. Applied snapshot includes only ID/name/kind/value. Unit rounding precedes exact quantity multiplication; no tax/fees/conversion added.
- Taxonomy returns only category/tag summaries referenced by currently ACTIVE offers, UUID ascending with25/default100/max signed pages. Cursors bind vendor, buyer, relationship ID/generation, page size, last ID and24-hour deadline; reconnect invalidates earlier traversal, current disconnect/status/authority is always checked. Ordinary catalogue changes between pages may change membership; this is not a frozen snapshot. Cursor rotation uses the existing bounded previous-key policy with a separate purpose signature.
- Narrow catalogue published-list/taxonomy ports, safe inventory availability and target-free buyer-pricing DTOs preserve the existing module graph. No schema changes or new business writes/replay keys are needed. Session activity/throttle remain the approved technical writes. No live cart, order/review/reservation or frontend work is delivered.

Schema/readiness31 and existing grants remain unchanged. Three routes join122 earlier configured operations (125 overall), all default-off under identity.http.enabled. Optional offers.cursor.previous-key / offers.cursor.previous-until follow the24-hour absolute-retirement policy; current key is identity.http.revision-key with its own signature purpose. [Verification](#verification) records executed checks and limitations. Client/provider/order/workspace/bulk/media acceptance remains unfinished.

## Verification

_Originally `BE/OFFERS_VERIFICATION.md`: Buyer offers verification._

2026-10-19, local backend/infrastructure work. No frontend changes, purchases/provisioning, push/merge or deployment. Local uncommitted artifacts are not a remote backup.

### Focused checks and review

.tools/offers-focused-final.log:14 real-HTTP/transaction groups and8 unit/contract/architecture checks (including5 new cursor cases) passed, zero failures/errors/skips, BUILD SUCCESS.

- RSD/BAM actual ACTIVE catalogue, required money/null/typed response fields, explicit NET_EXCLUDING_VAT basis, coherent totals/filter/page/literal search and named category/tags. Inactive products disappear without stock writes. Current desired publication/price prerequisites remain owner-module rules.
- Product minimum/step and all-unit tier resolution, agreement precedence even above ordinary price, current per-product confirmation after reconnect, no other buyer price/promotion target exposure. Restricted staff can read; buyer/vendor/platform/foreign/nonconnected scope denial and suspended vendor denial hold. Browser GET and strict queries/types apply.
- Rounded50% of2.01 gives1.01 then quantity3 gives3.03; ordinary tier and agreed-price precedence; earliest creation/UUID tie; exact promotion start/end; no rounded-equality attribution or summary;100% zero and maximum quantity;999999999.99 times1000000000 yields exact string999999999990000000.00. These reads are not order acceptance.
- Tracking-on confirmed zero products remain visible and over-stock quantities can be read without deductions/reservations. Off-mode and stale confirmation expose null instead of retained/unreviewed count; explicit stock confirmation restores current quantity. Count/history state is preserved by reads.
- Taxonomy excludes unused/private names, traverses101 referenced category/tag names100+1, and pages only current ACTIVE products. Two-product page shares one pricing timestamp. Scope/page size/signature/relationship generation/expiry binding; reconnect invalidates old cursors, cross-buyer reuse rejects, exact24-hour expiry. Five cursor unit cases cover signature/context/ID-generation binding, expiry and bounded previous-key retirement.
- Actual PostgreSQL-blocked reads see a committed vendor price change, committing disconnection and committing buyer removal. The first focused run exposed an invalid synthetic disconnect fixture holding only vendor before acquiring buyer against the globally sorted read locks. Corrected fixture to lock both organizations in approved UUID order; production lock order was retained. No failure was skipped.

Distinct primary review covered admission versus final scoped pair authority, current live partner/country checks, safe owner-port composition, one price instant, all-unit tier/current agreement/promotion precedence and rounding, safe nested DTO/null mappings, current stock semantics, filtered coherent list/taxonomy queries and cursor context/reconnect/rotation rules. Promotion evaluate continues validating inputs before calculating; both old evaluation and new safe buyer projection retain the shared candidate rules. Existing module graph remains unchanged.

### Full gate and packaged/security checks

Final unfiltered .tools/offers-final-verify.log passed **502 tests, zero failures/errors/skips**, BUILD SUCCESS: Surefire55, Failsafe447 (Foundation32/AuthHttp367/IdentityBoundaries11/PasswordLogin15/SessionService22). Fresh XML totals agree with the log. Fourteen new offer groups and five cursor cases ran with prior regressions. No executable/schema/test/build changes followed the successful full gate. Schema remains31; no migrations/grants/dependency changes.

Packaged schema31 migration/nonroot read-only Linux startup/private readiness200/public diagnostics404 and three new default-disabled offer method/path checks passed, plus prior routes. Disposable resources removed. .tools/vs04_offers_container_smoke.py / .tools/vs04-offers-container-smoke-result.json bind actual schema/image/JAR. Final tested host JAR/built/smoked/scanned identities match, rechecked after full verify.

Local image narudzbine-backend:vs04-offers, ID sha256:4fd86ab22506773367f1eb90d4a5ca9cd90f421f3e4cbe43f55ebe1ba2a11891; packaged JAR SHA256 307c124fa6c2cc095f5f3ff32fa710ac511bb02348fb8fafbee3e318f04f47f1. These are local identities, not published registry digests. Cached Trivy0.76.0 scan BE/target/offers-container-vulnerabilities.json matches that image: Java/HIGH/CRITICAL0, unchanged26 MEDIUM/4 LOW Ubuntu24.04 findings, no suppressions. Advisory DB updated2026-10-16/downloaded17; Java DB updated18/downloaded19 reused offline without refresh. Not fresh production advisory status. Dependencies unchanged; prior separate dependency/SBOM advisory evidence reused. Current SBOM110 licensed runtime components. Final backend/root-document secret scan0; structural/link/whitespace checks pass:209 operations/204 schemas/3046 references,625 questions/545 decisions/543 requirements/trace rows, JSON/YAML agree.

### Limits

Order review/submission/deduction/original-credit/dispatch, shared buyer drafts/favorites, CSV/bulk/media, large-catalogue load/query-plan evidence, retention scheduling, general replay/revision-key rotation, real provider/client/hosted CI/recovery/operator/full-slice/release acceptance remain unfinished. Current offers are not guaranteed checkout quotes. [Implementation](#implementation), [handoff](../../frontend/backend-handoff.md), [status](../../project/status.md).
