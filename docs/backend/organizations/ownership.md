# VS-01 ordinary ownership transfer

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/OWNERSHIP_IMPLEMENTATION.md`: VS-01 ordinary ownership transfer._

2026-10-18. Scope: requestOwnershipTransfer, getOwnershipTransfer, revokeOwnershipTransfer, acceptOwnershipTransfer. Implemented and locally verified; see [executed evidence](#verification). VS-01 remains in progress.

### Delegated refinements before code

Under D-GOV-005, preserve D-ORG-009/020/021/051 and REVIEW-09. TransferRequest.expectedRevision is the current organization revision. Creating/replacing a request consumes that revision and increments it; (organization, initiating owner, original revision token) is the natural retry identity. Same recipient replays that request with200; different recipient conflicts. A fresh organization revision explicitly replaces the pending request with a new server UUIDv7/seven-day expiry. Replacement invalidates the prior request. New creation returns201/Location. This adds a replay response to the contract without a new key/header.

Only the current owner may request/revoke; only the designated recipient may accept. Own current owner or recipient may read; other same-organization users see404. Initiation/acceptance require authentication less than five minutes old, consistent with the existing authentication boundary; expiry is invalid at the exact seven-day deadline. Recipient must be an existing active, verified same-organization nonowner without pending credential work. Capture its security epoch. Member deactivation or role/epoch changes immediately invalidate pending transfers; reactivation never restores them. Expired reads derive terminal state without mutating it; new requests materialize previous terminal state. Member changes preserve EXPIRED for requests already past their deadline rather than relabeling them INVALIDATED. A current owner may repeat revoke with204. Accepted replay by its freshly authenticated original recipient returns terminal metadata without repeating any business effect, even when the original acceptance revision was used. No replacement session secret is returned.

Acceptance holds the organization guard and sorted actor/issuer/recipient identities before session/transfer rows. Change the former owner to active ADMIN and recipient to OWNER in the same transaction; update organization owner/revision and both account revisions/security epochs, revoke both participants' sessions, and retain identity/preferences/history. Revoke-on-demotion extends the member-batch conservative policy. Record qualifying activity before invalidating the accepting session; browser acceptance clears its cookie only on the actual transition; a fresh-session terminal replay preserves its cookie. Deferred database constraints enforce one active same-organization owner at commit.

Add a narrow notifications.api.SecurityNotices port consumed by identity. Its JDBC adapter atomically creates immutable OWNER_CHANGED security/in-app records and QUEUED email outbox rows for former and new owner, including the initiating recipient (no ordinary actor suppression/opt-out). Locale is resolved at creation from each account override/organization default. Payload references the transfer/organization/recipient; no auth tokens, provider credentials or submitted contact content. This batch provides durable producers, not worker/provider delivery or notification-list APIs; those remain VS-07/G-04. Acceptance must roll back if either audit or notice/outbox insertion fails. Later retention/worker migrations govern these records before production.

Schema13 adds ownership_transfer, immutable binding guards, a one-pending-per-organization constraint, security_notice/outbox_event producer tables and transfer audit actions. Runtime needs scoped ownership_transfer SELECT/INSERT/UPDATE plus security_notice/outbox_event SELECT/INSERT; no schema/delete/provider authority. The identity-to-notifications API edge is explicitly recorded in architecture checks. Exceptional owner/email recovery is separate and retains X-05. Default activation remains off.

## Verification

_Originally `BE/OWNERSHIP_VERIFICATION.md`: VS-01 ordinary ownership-transfer verification._

2026-10-18, Europe/Budapest. [Implementation/refinements](#implementation). Four transfer operations extend the locally implemented configured surface from29 to33. Default API/provider activation remains off; VS-01 is unfinished.

### Executed verification

Final Maven Wrapper verify passed: **151 tests, zero failures/errors/skips**. Fifteen unit/contract/architecture/MockMvc tests and136 real PostgreSQL integration tests: FoundationIT14, AuthHttpIT74, IdentityBoundariesIT11, PasswordLoginIT15, SessionServiceIT22. Same approved local Java25/Maven3.10/settings/cache wrapper command as [member evidence](member.md#verification). Final detailed log: ignored .tools/vs01-ownership-release-verify.log; Surefire/Failsafe XML under BE/target.

Ten new real-HTTP groups cover both countries/types and staff/admin recipients; eligible-recipient/same-organization/current-owner safeguards; fresh authentication at the five-minute boundary; exact seven-day expiry and expiry precedence during member changes; one pending request, explicit replacement and repeat revocation; request identity replay/mismatch/stale organization revision; current owner/recipient-only reads and foreign/platform/wrong-actor denial; member deactivation/reactivation and role-change invalidation; atomic owner/role/account revision/epoch/session changes; two mandatory localized security records and queued email intents; accepted terminal replay without duplicate effects; strict request/CSRF/CORS/management boundaries; browser actual-transition cookie clearing and fresh-session replay preservation.

Actual concurrent HTTP commands verify duplicate request201/200 with one request audit; duplicate acceptance200/401 after session revocation with one accepted outcome; accept versus revoke, replacement and member deactivation; exactly one owner and either two or zero notice rows according to the winning transition. New recipient sessions remain retired after accepted response loss; fresh-login replay returns the consumed transfer metadata without issuing a token or repeating notices. This models response loss through resubmission; no network fault proxy or arbitrary process-crash injection is claimed.

Independently revoked INSERT grants on audit_event, security_notice and outbox_event force acceptance failures. Each rolls back owner/role/transfer/epoch/session effects and all notice rows; a subsequent authorized retry succeeds. Tests also reject deletion or binding changes to transfer history. The security-notice trigger uses the already tested append-only audit protection; its binding was checked in review. Locale-at-creation resolves to each recipient override or organization default; no provider send is performed.

Schema12-to13 upgrade preserves prior account preferences, browser/native sessions and audit history; old-schema readiness is rejected, repeated migration/current readiness pass. Existing clean/older-schema upgrades remain passing. The expanded run exposed a pre-existing member lock-order fixture that assumed same-millisecond UUIDv7 values sort by creation order. It now advances injected Clock between participant creation, guaranteeing the intended order without a runtime ID change, sleep or skipped assertion. Final full verification passed after this fix and the reviewed replay/expiry changes.

### Separate review

A separate primary-agent review checked final current authority and freshness, organization-before-sorted-participant/session guards, revision domains and natural request identity, immutable recipient/epoch binding, terminal action replay, virtual expiry revisions, one-owner deferred constraints, role/session revocation, mandatory no-opt-out/no-actor-suppression notice production, queue locale pinning and rollback boundaries. Review corrected cookie clearing on fresh-session accepted replay, added an affected-row assertion before transition audit, collected independent request validation errors, and preserved EXPIRED when member changes retire an already-expired request. ArchUnit allows only identity-to-notifications.api for the new producer port. No remaining blocker was found in this reviewed set; this was not an independent-agent or exhaustive review.

| Operation | Local acceptance evidence |
|---|---|
| requestOwnershipTransfer | Owner/freshness/recipient scope, organization revision, request replay/race, replacement, pending barrier and expiry |
| getOwnershipTransfer | Owner/recipient visibility, terminal/expired/invalidated projection, foreign/platform denial and activity |
| revokeOwnershipTransfer | Current-owner permission, repeat204, terminal denial, accept/revoke race and CSRF routing |
| acceptOwnershipTransfer | Recipient/freshness/revision/epoch, one-owner atomicity, device revocation, rollback, duplicate/racing actions, queued mandatory notices and safe terminal replay |

### Artifact and security evidence

- JAR SHA-256: `759106914d16e3f453c022563ae8ef6e983a7b062f3877bf4dd35e16276982a9`.
- Local narudzbine-backend:vs01-ownership image ID: `sha256:a1afacc7df8b9389c37d82c51b49b5fdbfb850109d42a3f6e003bd55f24f709e`. Scanner Metadata.ImageID matches the built/inspected image. No published registry RepoDigest exists.
- Packaged controlled migration asserts schema13; read-only/nonroot Linux startup passed. Private readiness200, public diagnostics404 and default-disabled transfer route404. Disposable containers/network were cleaned up. Real enabled HTTP tests use restricted runtime ownership DML, notice/outbox INSERT and append-only audit grants. Ignored detailed evidence: .tools/ownership-image-build.log and .tools/vs01-ownership-container-smoke-result.json.
- Trivy0.76.0 source secrets0; new image Java advisories0 and HIGH/CRITICAL0. Existing Ubuntu24.04 findings remain26 MEDIUM/4 LOW, no suppressions. Cached advisory DB updated2026-10-16/downloaded2026-10-17; no fresh-feed claim. Reports: BE/target/ownership-secrets.json and ownership-container-vulnerabilities.json; scanner logs under .tools.
- SBOM97 runtime components, all with license metadata; dependency/build/base-image declarations and approved Tomcat/Jackson overrides are unchanged. Separate repeated SBOM vulnerability and two-build reproducibility checks were not run; the new image scan includes Java packages. Historical evidence is not represented as new execution.

Structural contract/register/link/whitespace results are recorded in PROJECT_STATUS. These do not prove client/provider integration. OWNER_CHANGED security records and email intents are durable, but workers/rendering/provider delivery, notification-list APIs and full retention handling remain VS-07/G-04 work. Exceptional recovery remains X-05. No actual email/push was sent; no frontend application change, purchase, provisioning, deployment, remote CI, push or merge occurred. See [operations](../../operations/runbook.md) for schema/grants and activation boundaries.
