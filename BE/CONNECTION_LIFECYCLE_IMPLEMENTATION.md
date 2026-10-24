# Connection lifecycle implementation

Implementation refinement under D-GOV-005 / D-PLAN-025, 2026-10-19. Backend only.

The bounded batch implements administrative direct connection and ordinary/admin disconnection. Direct connection uses natural vendor/buyer identity; a currently active pair returns its current relationship without another audit or invitation side effect. A real activation/reconnection closes pending TRADING invitations for the exact pair atomically. Administrative reason is private audit context; disconnection reason is shared through the relationship response, never an external notice parameter. Existing domestic/capacity rules apply; no user changes organization.

Disconnect requires the current relationship revision, then applies a desired-state no-op if already disconnected. A stale revision conflicts, including after reconnect, preventing an old command from disconnecting a new generation. No-op never replaces the first reason or emits another audit/notification. Organization guards are locked in database UUID order before actor/session/relationship locks; final role and session checks apply after waiting. Staff and unrelated parties cannot write. Plan quota counts only ACTIVE rows. No orders, credits, drafts, favorites or prices are edited.

The minimum ordinary-notification prerequisite is durable recipient/channel intent in separate ordinary tables, atomically with the transition. Active owner/admin recipients on both sides exclude the actor; locale is captured from account override or organization default. Three channel intents are queued for future send-time evaluation, NOT proof of delivery or enabled preferences. Workers must evaluate current access, current ordinary per-event/channel preferences (defaults IN_APP=true, EMAIL/PUSH=false), destination/device permission, deadlines and restricted payload before delivery; no worker is enabled by this batch. This deliberately does not reuse mandatory security_notice/outbox policy. Payload contains only the safe source organization display name and relationship reference, never reason or account details. Actual preference API, delivery workers and G-04 remain pending.

getPartner is deferred to a separate projection batch: ordinary contacts have no designated public contact and no shared orders/messages exist yet. Do not invent public contact selection or manufacture historical order/contact snapshots. Current relationship metadata routes remain available; disconnected live directory access is not added. Future partner projection/order integration remains explicitly unverified.

Verification results and runtime grants are recorded after execution in CONNECTION_LIFECYCLE_VERIFICATION.md.

## Configuration and review

Schema21 migration V20261019110000__connection_lifecycle.sql preserves existing relationships/generations, invitation acceptance receipts and account/setup state; it creates no historical notifications. Readiness requires21. Runtime adds SELECT/INSERT on ordinary_notice and ordinary_delivery; no UPDATE/DELETE/schema privileges or worker credentials are granted. Existing trading/account/session/setup/audit privileges remain. No dependency, provider, secret or activation flag change. Both identity.http.enabled and identity.setup.http.enabled remain required and off by default.

Distinct review reread command authorization/guard ordering, current revision/no-op behavior, pair invitation closure, audit/notice privacy, schema constraints/runtime grants and rollback/race tests. It added explicit simultaneous administrative final-slot contention, beyond invitation capacity tests. No frontend or hosted/provider acceptance is inferred. Administrative activation records both the ordinary transition event and a private reason-bearing TRADING_ADMIN_CONNECTED audit context; unchanged active pairs record neither again.

Subsequent increment: [partner details](PARTNER_IMPLEMENTATION.md) implements the formerly deferred projection/contact prerequisite; the preceding deferral describes this lifecycle batch only. PROJECT_STATUS remains current authority.
