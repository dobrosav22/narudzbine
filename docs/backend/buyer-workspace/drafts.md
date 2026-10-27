# Shared draft persistence refinement

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/DRAFTS_IMPLEMENTATION.md`: Shared draft persistence refinement._

2026-10-19, assistant selections under D-GOV-005, R-BUY-001/003/007/008/011, D-PLAN-024 and DESIGN_SPEC sections6/11. VS-08 persistence only: no order creation/submission/consumption implementation is claimed.

Buyer owner/admin/staff share explicit saved drafts, including staff under submission restriction. Lists contain OPEN work only, createdAt DESC/id ASC; own terminal records remain readable, with no restore. Vendor is fixed for the draft; use a new draft for another vendor. Current authority and browser CSRF precede every write/replay. Reads return saved intent only, no live catalogue/prices/address resolution.

Draft POST/PUT bodies are bounded to131072 bytes to support the approved500 lines plus Unicode preparation fields; generic small auth-body limits do not apply. Empty lines and null delivery location are allowed. Positive bounded whole line quantities are structural validation only; current minimum/step, prices, stock and checkout completeness are deferred to review/submission. Duplicate lines reject. New line references require a genuine currently published product of the selected domestic connected/live vendor. Retained lines survive inactivity/archival. In unavailable/disconnected mode only existing line removal/reduction is permitted; new disconnected drafts can be empty and preserve own preparation metadata. A retained relationship authorizes preserving work, never commercial access or submission. New drafts need a real current/former domestic association. Vendor suspension also removes live catalogue access. New/changed delivery location must be active and buyer-owned; unchanged archived locations remain saved. Contact overrides are complete or null; INHERIT/CLEAR require null instructionsOverride, OVERRIDE requires nonblank text. Replacement order IDs remain untrusted preparation references until the future order review validates actual same-party cancelled-order authority; saving does not expose orders or reserve replacement capacity.

Client UUIDv7 creation identity binds creator/buyer/normalized original intent, including array order and nulls. Same creation returns original201 body/location for7 days after current buyer authorization, without rerunning changed business dependencies. Changed payload409 IDEMPOTENCY_MISMATCH, inaccessible identity404, expired409 REPLAY_EXPIRED with own resource reference. Receipt payload may be compacted, tombstone persists; original replay does not restore discarded work and GET gives current state. No extra key.

PUT compares opaque revision under buyer/vendor guards, then validates changed references. Stale409 returns currentRevision only; current equal intent is a no-op. Discard increments revision and retains source/event history; exact repeat with the original discard revision or current terminal revision succeeds204. Other stale requests conflict, no ordinary restore/update of terminal work. Creator/editor/action attribution stays in internal immutable events; the approved public Draft shape has no new actor fields.

Schema33: buyer_draft owns metadata, buyer_draft_line normalized unique product references/ordered lines, draft_creation bounded original-result receipt and draft_event immutable attribution. Domestic party/type, product/vendor references, nonnegative revision progression/immutable binding and no physical purge are enforced. SUBMITTED is reserved in the contract and will require the real ordering migration/transaction later; this batch can only produce OPEN/DISCARDED. Business, attribution and creation receipt commit atomically. No notification event is required for saving work. Identity uses buyerworkspace.api, organizations.api, trading.api and catalogue.api only. Pair guards sorted before account/session, draft then line/receipt writes; read/discard need only own buyer. No provider calls.

Local [verification](#verification) records executed checks and remaining gates.

## Verification

_Originally `BE/DRAFTS_VERIFICATION.md`: Shared draft persistence verification._

2026-10-19, local synthetic backend/infrastructure work. No provider purchase/provisioning, deployment, merge or frontend application change.

.tools/drafts-focused-final.log passed18 real HTTP/transaction groups, one previous-schema migration and6 unit/contract/architecture checks (including3 DraftRequestsTest cases), zero failures/errors/skips, BUILD SUCCESS. Initial focused run found the generic16KB body cap incompatible with the500-line contract and a synthetic contact fixture using the same source/override name. Corrected with bounded131072-byte draft bodies,500-line/Unicode/digest tests and a distinct fixture, then reran. No failed run is acceptance evidence.

Distinct primary review covered current buyer authority/CSRF on every write and replay; immutable parties, saved-intent-only reads and live access only for new line references; retained inactive/disconnected work and bounded reductions; own active new locations versus retained archived location; complete contact/INHERIT/OVERRIDE/CLEAR; scoped creator/body creation identity with original201 replay7 days/tombstones; stale revisions, no-op saves, discard source/event retention and no restore; sorted pair/buyer guards before actor/session/draft writes; atomic source/lines/attribution/receipt failure rollback; JDBC normalized references and schema constraints. The public persistence port also rejects changing vendor. Actual order references remain untrusted preparation until real review, and no SUBMITTED producer exists.

Final unfiltered .tools/drafts-final-verify.log passed542 tests, zero failures/errors/skips, BUILD SUCCESS. Surefire60; Failsafe482: Foundation34/AuthHttp400/IdentityBoundaries11/PasswordLogin15/SessionService22. Fresh XML totals agree with the log. This includes18 draft HTTP/database groups,3 request-boundary/digest unit cases and previous-schema migration with a genuinely retained favorite, alongside prior regressions. Controlled PostgreSQL barriers exercise competing saves, save/discard, disconnection and member removal. No executable/schema/test/build change followed this successful gate. This is not whole VS-08 or order-submission acceptance.

### Executed packaged checks

Final JAR SHA25621951e6d2f9cad964fb576e711669837ca19697dc3412cdba2974c3583c044a9; local image narudzbine-backend:vs08-drafts IDsha256:db1a36a0f4e95cd1ccf2fb3a49ddcae6cbde38f6420e4ed2e1dc443363bd3892. Host JAR/stored hash/image JAR and built/smoked/scanned image identities match. Evidence: .tools/drafts-image-build.log, .tools/drafts-scanned-jar.sha256, .tools/drafts-built-image-id.txt, .tools/drafts-smoke.log, .tools/vs08-drafts-container-smoke-result.json.

.tools/vs08_drafts_container_smoke.py passed schema33 controlled migration, nonroot read-only Linux startup, private readiness200/public diagnostics404, five new default-disabled persistence routes404 and still-unimplemented submission404 with previous routes. Disposable resources were removed.

Trivy0.76.0 BE/target/drafts-container-vulnerabilities.json: Java/HIGH/CRITICAL0; unchanged Ubuntu24.04 base26 MEDIUM/4 LOW. Offline existing advisory cache: vulnerability DB updated2026-10-16/downloaded17, Java DB updated18/downloaded19. This is not fresh production advisory status. Dependencies/build resolution are unchanged; previous separate dependency/license/advisory evidence is reused within these cache limits. SBOM110 components all have license metadata. No suppressions added.

Final source/root-document secret scan BE/target/drafts-secrets.json found0 secrets. Structural/link/whitespace/register checks passed:209 operations/204 schemas/3046 references,625 question IDs/545 decisions/543 requirements and543 trace rows. No executable/schema/test/build changes followed the successful full gate.

### Limits

Order review/submission and draft one-time consumption/SUBMITTED state, original stock credit/fulfillment/reorder, CSV/bulk/media, large-dataset load/query-plan work, hosted CI/real providers/restore/operator/client/full-slice/release acceptance remain unfinished. A saved replacement reference is not a validated commercial order link; a draft is not a quote, stock hold or accepted order. [Refinement](#implementation), [handoff](../../frontend/backend-handoff.md), [status](../../project/status.md).
