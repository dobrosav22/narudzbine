# Connection lifecycle implementation

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/CONNECTION_LIFECYCLE_IMPLEMENTATION.md`: Connection lifecycle implementation._

Implementation refinement under D-GOV-005 / D-PLAN-025, 2026-10-19. Backend only.

The bounded batch implements administrative direct connection and ordinary/admin disconnection. Direct connection uses natural vendor/buyer identity; a currently active pair returns its current relationship without another audit or invitation side effect. A real activation/reconnection closes pending TRADING invitations for the exact pair atomically. Administrative reason is private audit context; disconnection reason is shared through the relationship response, never an external notice parameter. Existing domestic/capacity rules apply; no user changes organization.

Disconnect requires the current relationship revision, then applies a desired-state no-op if already disconnected. A stale revision conflicts, including after reconnect, preventing an old command from disconnecting a new generation. No-op never replaces the first reason or emits another audit/notification. Organization guards are locked in database UUID order before actor/session/relationship locks; final role and session checks apply after waiting. Staff and unrelated parties cannot write. Plan quota counts only ACTIVE rows. No orders, credits, drafts, favorites or prices are edited.

The minimum ordinary-notification prerequisite is durable recipient/channel intent in separate ordinary tables, atomically with the transition. Active owner/admin recipients on both sides exclude the actor; locale is captured from account override or organization default. Three channel intents are queued for future send-time evaluation, NOT proof of delivery or enabled preferences. Workers must evaluate current access, current ordinary per-event/channel preferences (defaults IN_APP=true, EMAIL/PUSH=false), destination/device permission, deadlines and restricted payload before delivery; no worker is enabled by this batch. This deliberately does not reuse mandatory security_notice/outbox policy. Payload contains only the safe source organization display name and relationship reference, never reason or account details. Actual preference API, delivery workers and G-04 remain pending.

getPartner is deferred to a separate projection batch: ordinary contacts have no designated public contact and no shared orders/messages exist yet. Do not invent public contact selection or manufacture historical order/contact snapshots. Current relationship metadata routes remain available; disconnected live directory access is not added. Future partner projection/order integration remains explicitly unverified.

Verification results and runtime grants are recorded after execution in CONNECTION_LIFECYCLE_VERIFICATION.md.

### Configuration and review

Schema21 migration V20261019110000__connection_lifecycle.sql preserves existing relationships/generations, invitation acceptance receipts and account/setup state; it creates no historical notifications. Readiness requires21. Runtime adds SELECT/INSERT on ordinary_notice and ordinary_delivery; no UPDATE/DELETE/schema privileges or worker credentials are granted. Existing trading/account/session/setup/audit privileges remain. No dependency, provider, secret or activation flag change. Both identity.http.enabled and identity.setup.http.enabled remain required and off by default.

Distinct review reread command authorization/guard ordering, current revision/no-op behavior, pair invitation closure, audit/notice privacy, schema constraints/runtime grants and rollback/race tests. It added explicit simultaneous administrative final-slot contention, beyond invitation capacity tests. No frontend or hosted/provider acceptance is inferred. Administrative activation records both the ordinary transition event and a private reason-bearing TRADING_ADMIN_CONNECTED audit context; unchanged active pairs record neither again.

Subsequent increment: [partner details](partner.md#implementation) implements the formerly deferred projection/contact prerequisite; the preceding deferral describes this lifecycle batch only. PROJECT_STATUS remains current authority.

## Verification

_Originally `BE/CONNECTION_LIFECYCLE_VERIFICATION.md`: Connection lifecycle verification._

2026-10-19, local backend/infrastructure only. [Implementation and grants](#implementation).

Focused wrapper checks passed40 unit/contract/architecture/MockMvc tests and12 targeted PostgreSQL integration checks (11 HTTP groups plus schema20-to21 preservation). The first focused run found two assertions expecting STALE_WRITE while the existing approved revision response is REVISION_CONFLICT; assertions were corrected and passed. Distinct review added simultaneous platform-admin last-slot contention before the final full gate.

Scenarios cover domestic administrative activation in RS/BA without ownership changes; atomic pending invitation supersession; natural active-pair no-op; country/type/status/plan/role boundaries; current-revision disconnect/no-op/stale conflicts; reconnect identity/generation; manager/actor eligibility, locale capture and reason-free ordinary delivery parameters; rollback on notice/outbox/audit failures; real simultaneous disconnects; role demotion while blocked on actual organization guards; strict reason/revision/unknown-field validation; browser CSRF/CORS; and retained relationship/receipt state across migration with no fabricated notices. The full gate also includes existing invitation/new-buyer, provider ambiguity, identity/session/account/location/contact/member/ownership/password/email/external/recovery regressions.

Notification checks prove durable recipient/channel intent only. No preference API, ordinary worker, real email/push delivery or hosted/client/provider acceptance is claimed. getPartner/public contact/historical projection, current administrative read workflows, plan administration and commercial modules remain pending. X-01..06/G-01..07 retain their separately documented scope; actual provider/operator/client/delivery inputs and checks remain open. No frontend edits, provisioning, purchases, deployment, push or merge.

Final unfiltered gate and artifact evidence follow.

### Final gate and artifact evidence

Final unfiltered Maven Wrapper verify passed **314 tests, zero failures/errors/skips**:40 unit/contract/architecture/MockMvc plus274 real PostgreSQL IT (Foundation22, AuthHttp204, IdentityBoundaries11, PasswordLogin15, SessionService22). Command uses the approved bundled JDK25/Maven3.10 wrapper/settings/cache and no test filter; final local log .tools/connection-final-verify.log. No executable/schema/test/build changes followed this gate.

The first full gate had one failure in the new two-waiter contention observer: it counted only direct PostgreSQL blockers. PostgreSQL may queue a second waiter behind the first, so the observer now follows the real recursive blocking chain. This test-only correction preserves the actual simultaneous contention assertion; it does not change application capacity behavior. Both contention scenarios passed focused checks before this final full rerun.

Packaged schema21 migration and nonroot read-only Linux startup passed with disposable private PostgreSQL/application containers: readiness200, public diagnostics and default-disabled previous/new routes404; containers/network removed. Local script .tools/vs02_connection_container_smoke.py and result JSON. Local image narudzbine-backend:vs02-connection; actual image ID sha256:2c48d276a7920240287ef22c5639fc468d687230ad6454084c64fcda97a84f6e; JAR SHA-256 8429e52ca48729f722d20acdf6563ed6a61311c37f3e3763e48a0d6adc4feb9e. Image scan metadata matches the built image and recorded JAR hash.

Trivy0.76.0 changed-source secret scan0. New image cached scan Java/HIGH/CRITICAL0; existing base-image26 MEDIUM/4 LOW remain, no suppressions. Cached vulnerability advisory DB updated2026-10-16/downloaded2026-10-17, not fresh online advisory evidence. Trivy refreshed its separate Java artifact-identification DB (updated2026-10-18, downloaded2026-10-19); that is not a vulnerability advisory refresh. Final SBOM110 licensed runtime components; dependencies/base image unchanged, prior separate dependency/SBOM resolution/scan evidence reused. No claim of hosted delivery, independent clean reproducibility build or production release readiness. Structural contract/register/local-link/whitespace checks remain208 operations/204 schemas/3017 references,625 questions/545 decisions/543 requirement and trace rows.
