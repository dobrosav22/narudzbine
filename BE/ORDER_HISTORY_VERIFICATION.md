# Order listing/history verification

2026-10-19. Completed locally; full-slice/provider/operator/client/hosted/CI/release gates remain open.

## Separate primary review

Reviewed membership-derived buyer/vendor SQL predicates and current organization/account/session authorization before data/cursor access; actor privacy matching order detail, frozen event attribution and no live catalogue/contact resolution; disconnected and counterparty-suspended read policy; state/partner/date allowlists and inclusive/exclusive country-local midnight conversion, DST and Gregorian validity; exact descending-time/ascending-UUID and ascending-event keyset predicates; normalized cursor view/organization/order/filter/size binding, distinct HMAC domain/key ID, original24-hour expiry and explicit bounded previous-key retirement; nullable initial history fields and actual immutable records; existing schema37 indexes/grants and default-off wiring. No new schema/dependencies or module edges. Reads make no commercial writes; authenticated activity retains existing behavior. No automatic retry/new provider path added.

All roles may read own history; buyer staff submission restriction intentionally does not deny reads. Removal/session invalidation/own suspension deny current access. Platform ordinary commercial reads remain404. Existing direct/draft submission and original response reconciliation remain separate and unchanged, except the formerly unimplemented GET orders regression now asserts200.

Current producer creates one actual initial event/order. Tests do not bypass unique event constraints or invent later lifecycle events to claim a multipage history integration. Event target/view/size cursor binding is tested at codec level; real event pages verify actual initial projection, permissions/privacy and terminal cursor. Multi-event traversal requires the future lifecycle producer and its integration tests. No load/provider/client/hosted/CI/full-release acceptance inferred.

## Focused execution

.tools/order-history-focused.log passed14 unit/contract/architecture/retry checks and14 real PostgreSQL HTTP integration groups (12 new history groups plus existing direct/draft regressions), zero failures/errors/skips, BUILD SUCCESS. Added one further event-target cursor unit check afterward; the final full verification includes it. Unit cases include Gregorian/date validation and23/25-hour DST days for both countries. Integration covers direct/draft orders, own/counterparty fields, active/disconnected/suspended contexts, empty foreign scopes/countries/platform denial, all state filters without fake transitions, partner/date boundaries, equal-time keyset order and same-org cursor sharing during actual concurrent submission, signed scope/filter/size/view/tamper denial, exact expiry without continuation extension, strict query/body/browser behavior, frozen names/prices, actual waiting member/own-organization revocation, database SELECT failure and MockMvc mapping.

Authoritative final execution and artifact evidence follow. Schema/dependencies remain unchanged; new artifact checks were executed.

Packaged checks completed while the final regression runs: schema37 migration/read-only nonroot startup/private readiness/default-disabled new routes passed; cached scan has Java/HIGH/CRITICAL0 and existing26 MEDIUM/4 LOW base findings. Record property-name sets for OrderPage/EventPage/EventResult exactly match required OpenAPI properties. The full/XML/immutable artifact comparison and final secret/document checks subsequently passed; see the final record below.

## Authoritative final gate and artifact

.tools/order-history-final-verify.log: 638 tests passed, zero failures/errors/skips, BUILD SUCCESS (76 unit;562 real PostgreSQL IT: Foundation38/AuthHttp476/IdentityBoundaries11/PasswordLogin15/SessionService22). Includes all final source/test changes and prior direct/draft/stock/identity regressions. XML classes/totals and final tested/built/smoked/scanned JAR/image identities were cross-checked in .tools/order-history-final-evidence.json. No executable/schema/test/build changes followed this successful full gate.

Image narudzbine-backend:vs04-order-history: `sha256:f0e82c95cec348243e50bee5e5e72c5a1bbf3aa1c6d2c2059b77bb3d9c046471`; JAR SHA256 `bcb6c59c8210b7e714abda170357890ec7ca57cfe00021ad2f1388b7a4bdfe03`. .tools/vs04_order_history_container_smoke.py and .tools/vs04-order-history-container-smoke-result.json passed schema37 migration, Linux nonroot read-only startup, private readiness200/public diagnostics404 and default-disabled business routes including list/events. Temporary task resources cleaned.

Trivy0.76 offline BE/target/order-history-container-vulnerabilities.json: Java/HIGH/CRITICAL0, unchanged Ubuntu24.04 base26 MEDIUM/4 LOW. Existing advisory cache updated2026-10-16/downloaded17; Java cache updated18/downloaded19. This is not fresh production advisory status. Dependencies/build resolution unchanged; prior dependency evidence reused with those limits. Current SBOM110 components all have license metadata.

Final offline backend/root secret scan:0 findings (BE/target/order-history-secrets.json; .tools/order-history-secrets-final.log). Structural/local-link/contract/register and git diff whitespace checks passed:209 operations/204 schemas/3046 references,625 questions/545 decisions/543 requirements and trace rows. Read-only Docker inventory confirmed no remaining task-prefixed packaged-check containers/networks. No provider provisioning, PR merge, production deployment or frontend application change was performed.
