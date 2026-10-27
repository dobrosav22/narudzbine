# Cancellation request refinement

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/CANCELLATION_REQUESTS_IMPLEMENTATION.md`: Cancellation request refinement._

Selected under D-GOV-005 on2026-10-19 before dependent implementation. Implements requestCancellation/getCancellationRequest/withdrawCancellation/approveCancellation/rejectCancellation under D-ORD-004/010/012/013/017/021/022/029/030, original-credit rules and approved notification recipients. These refinements are assistant selections, not user answers.

Buyer owner/admin or unrestricted staff may create/withdraw an accepted/pre-dispatch order request. Vendor owner/admin/staff may approve or deny. All original-party reads survive disconnection/counterpart suspension; own active account/session/organization, current capability and browser CSRF apply to each execution/replay. Reads require ordinary order access, including restricted staff. Reasons use existing NFC/strip nonblank<=1000-code-point validation; creation and denial require reasons, approval/withdrawal use RevisionCommand with no invented optional input.

Schema40 retains immutable request headers and one immutable resolution per request, with a technical unique order_pending_cancellation pointer. Request creation binds original order expectedRevision; exact same normalized reason replays the original201 request permanently, even after resolution. A new request requires a new current Order revision after resolution; only one may be pending. Resolution binds the original request expectedRevision and exact action/denial reason/initiating organization, replays its original200 permanently after current authorization, and conflicts on contradictory outcomes. GET returns the current Request revision. No extra retry key, expiry or automatic resend/resolution.

Each real creation/resolution appends an order event and increments order revision. Pending, withdrawn and denied events retain ACCEPTED semantic state; approval/direct cancellation produces CANCELLED. OrderEvent gains explicit nullable cancellationRequestId/cancellationRequestState to distinguish these real events without invented core states; prior events return null. Latest Order.cancellationRequestId identifies only pending work, cleared atomically on resolution. Internal snapshot additions are backward-compatible with untouched old JSON; original direct/draft/acceptance/cancellation successes remain frozen. All commercial fields/accepted fulfillment remain unchanged.

Approval uses the common cancellation and original-deduction credit producer, with request reason as cancellation reason. Ordinary vendor cancellation resolves pending work as RESOLVED with its cancellation reason and the same actual cancellation event; no duplicate event/credit/notice. Rejection/withdrawal never credit stock. Direct cancellation supports current accepted revisions after request history, preserving its own exact original receipt. Existing unique credit ownership/deferred completeness remains. Organization pair/account/session, vendor control, order advisory and sorted stock lock order is unchanged. Request/pointer/resolution/order event/balance/audit/notice operations share one transaction; all-line and deferred failures roll back everything.

Opening targets active verified vendor members. Denial/approval/direct resolution targets active original order submitter plus current buyer owner/admin, suppressing actor. Withdrawal additionally informs active vendor members (delegated recipient refinement, matching buyer-origin cancellation). Event-scoped deduplication and existing channel intent are reused, with no provider delivery claim. Request actor identity is only in own-organization history/audit; counterparty reason/history remains shared.

The pending pointer is the dispatch block. An ordering owner guard rejects dispatch admission while pending, and event-level defense rejects a DISPATCHED event with pending work; the real dispatch producer remains a subsequent batch and must use these guards. No fabricated dispatch is used as positive evidence. Future stages must preserve accepted/pre-dispatch semantics. Runtime adds SELECT/INSERT on request/resolution and SELECT/INSERT/DELETE on the technical pending pointer; immutable headers/events/audit grants unchanged, no SECURITY DEFINER. Readiness40 requires controlled migration before runtime; older binaries refuse the new schema.

Verification includes both countries, genuine accepted orders, repeated requests after denial/withdrawal, exact retries/response loss/key continuity/current authority, scoped reads/privacy/strict input/CSRF, pending dispatch admission, approval/direct cancellation/withdraw/deny races, committing restrictions/removal, original credits off/archived/untracked/multiline and producer/deferred rollback, previous-schema upgrade, prior regressions, distinct review/full/container/secret/document checks. Hosted/provider/client/CI/operator/full-release gates remain open.

Executed results and limits: [verification](#verification). This refinement alone is not execution evidence.

## Verification

_Originally `BE/CANCELLATION_REQUESTS_VERIFICATION.md`: Cancellation requests verification._

Batch started2026-10-19; completed locally2026-10-20; full-slice/provider/operator/client/hosted/CI/release gates remain open.

### Separate primary review

Reviewed natural Order-revision creation versus Request-revision resolution, scoped permanent original responses and current buyer/vendor authority/CSRF/restriction; sorted pair/control/order/balance locking; immutable header/resolution/pointer consistency and actual chronological event metadata; frozen initial/accepted commercial/fulfillment/source successes. Approval/direct cancellation shares cancellation/credit production with one real cancellation event and one unique original credit; pending resolution/history/audit/notices remain atomic, denial/withdrawal never restore stock. Opening targets vendor members; resolution targets original buyer submitter/current owner-admin, suppressing actor; withdrawal also targets vendor. Pending owner admission and event defense exist; no actual dispatch producer/positive dispatch evidence inferred. Runtime grants remain bounded and audit INSERT-only. No provider calls/hosted/client integration inferred.

### Execution

.tools/cancellation-requests-initial.log compiled and passed3 architecture/contract tests but failed schema40 syntax in a CASE comparison before HTTP execution; parentheses corrected. Authoritative focused/full/artifact results follow. New upgrade starts at schema39 and preserves real identity/plan data; not a hosted rollback or previously deployed commercial dataset proof. Existing old JSON/event metadata are backward-compatible without rewriting original successes. X/G/provider/operator/client/CI/full-slice/release gates remain open.

.tools/cancellation-requests-focused.log passed9 unit/contract/retry checks,1 schema39 upgrade and18 ordinary cancellation HTTP groups;25 request groups failed at request creation because the new hyphenated revision domain violates the shared signer format. Replaced it with cancelrequest/v1 without relaxing the signer. Separate review bound deferred delivery checks to each triggering request/resolution event (not only the final event), and added pending-pointer DELETE denial rollback. These failed results are not completion evidence.

.tools/cancellation-requests-focused-2.log passed9 units and1 upgrade;42/43 HTTP groups passed. Creation rollback comparison used vendor acceptance response versus buyer detail (intentional own-attribution differences), corrected to compare buyer detail before/after failure. Expanded existing browser case to cover create/withdraw CSRF and deferred resolution case to assert tracked balance rollback. Final affected rerun and full gate follow.

.tools/cancellation-requests-focused-3.log: BUILD SUCCESS,9 unit/architecture/contract/retry checks and3 affected real HTTP groups, zero failures/errors/skips. Together with the unaffected focused-2 results, all25 request groups,18 ordinary-cancellation groups and1 schema39 upgrade have passing affected evidence. Separate primary review completed after final source/schema/test changes: current-party/restriction/CSRF guards, exact original identities, event/pointer completeness, actor privacy, common approval/direct cancellation credits, each-event notification intent and least grants checked. Full .tools/cancellation-requests-final-verify.log and packaged artifact gates follow; focused evidence is not a full gate.

### Authoritative final gate and artifact

.tools/cancellation-requests-final-verify.log: 726 tests passed, zero failures/errors/skips, BUILD SUCCESS (85 unit;641 real PostgreSQL IT: Foundation41/AuthHttp552/IdentityBoundaries11/PasswordLogin15/SessionService22). Final source/schema/test/build state includes25 new request HTTP groups and1 schema39 upgrade, with all prior regressions. XML totals/classes and tested/built/smoked/scanned identities cross-checked in .tools/cancellation-requests-final-evidence.json. No executable/schema/test/build changes followed this successful full gate.

Image narudzbine-backend:vs04-cancellation-requests: `sha256:d68c436cc5eed96668d6018ab587bd0288ded0cfda79f7819eb517c40b337e9a`; JAR SHA256 `c1ddd8071c1f5b8530c40c76745db97ec66ba1f65a869992067e3ffa76b35c09`. .tools/vs04_cancellation_requests_container_smoke.py/.tools/vs04-cancellation-requests-container-smoke-result.json passed schema40 migration, Linux nonroot read-only startup, private readiness200/public diagnostics404 and default-disabled five request routes. Temporary task resources cleaned.

Trivy0.76 offline BE/target/cancellation-requests-container-vulnerabilities.json: Java/HIGH/CRITICAL0; base-image findings {'MEDIUM': 26, 'LOW': 4}. Existing advisory cache updated2026-10-16/downloaded17; Java cache updated18/downloaded19. This is not fresh production advisory status. Dependencies/build resolution unchanged; prior dependency evidence reused with those limits. Current SBOM110 components all have license metadata.

### Final repository checks

Final offline Trivy backend/root-document secret scan BE/target/cancellation-requests-secrets.json found0 secrets; .tools, .git, FE and BE/target excluded. Disposable narudzbine-vs01 smoke container/network inventory empty. python .tools/verify_planning.py passed209 operations/204 schemas/3047 references,625 questions/545 decisions/543 requirements and543 trace rows, local links and source/document whitespace; git diff --check passed. Frontend application files remain outside this batch. No actual dispatch, provider delivery, provisioning, hosted CI, client integration, merge or production deployment was performed.
