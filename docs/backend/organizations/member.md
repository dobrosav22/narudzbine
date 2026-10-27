# VS-01 member lifecycle

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/MEMBER_IMPLEMENTATION.md`: VS-01 member lifecycle._

2026-10-18. Batch scope: listMembers, changeMemberRole, deactivateMember, reactivateMember. Implemented and locally verified; see [executed evidence](#verification). VS-01 remains in progress.

### Refinements selected before implementation

Under D-GOV-005, preserve D-ORG-018/019/046/047/048 and the fixed role matrix. Only the owner changes ADMIN/STAFF roles; owner targets cannot be changed/deactivated through these endpoints. Owner may deactivate nonowners, admin may deactivate staff, and staff may deactivate themselves. Admin self-deactivation still requires the owner. Only owner may reactivate a former admin; owner/admin may reactivate former staff. Keep the inactive role until reactivation so this check cannot be bypassed; role edits require ACTIVE state. Reactivation changes the same account to ACTIVE/STAFF, preserves identity/preferences/history, and requires a separate promotion for elevated access. Pending setup accounts cannot be managed here.

Commands require the target account revision, checked before no-op detection; stale requests return the authorized current account revision. Actual role/state changes increment account revision and security epoch, revoke all target sessions and produce minimal atomic member audit. No-op commands preserve these values. Revoking on role reduction is a delegated conservative choice as well as the mandatory revocation on elevation; no replacement secret is returned. Reactivation never revives old sessions or pre-deactivation proofs. Refetch current members after response loss; self-deactivation invalidates the initiating session, so another authorized member must reactivate the account.

Acquire the organization exclusive guard, then actor/accessible target account identities in UUID order before authenticating/locking the actor session. Recheck current role and target state under this guard; foreign targets must never be prelocked. Record qualifying activity in the same transaction before a possible self-deactivation; roll it back if the command fails. Member list rows/totals use one statement snapshot, with state/role filters and the established bounded offset pagination.

Correction to the previous next-action wording: DESIGN_SPEC section9 and R-SEC-016 require security notices for credential/recovery/ownership events, not ordinary member role/deactivation/reactivation events. This batch therefore adds no invented notice event or empty delivery subsystem. Transactional outbox producers remain required with the actual credential/security-notice workflows. No owner-transfer requests exist yet; future transfer acceptance/proof records must bind the recipient security epoch so deactivation immediately invalidates them and reactivation cannot revive them (R-ORG-051). No pending-transfer integration is claimed here.

Schema12 adds member audit actions; the existing organization/member unique index is reused. Existing runtime DML grants suffice; no provider call/provisioning is required. Default activation remains off. Required schema migration/startup and current real-HTTP verification will be recorded in MEMBER_VERIFICATION.md.

## Verification

_Originally `BE/MEMBER_VERIFICATION.md`: VS-01 member lifecycle verification._

2026-10-18, Europe/Budapest. [Implementation/refinements](#implementation). Four member operations extend the locally implemented configured surface from25 to29. Default activation remains off; VS-01 is unfinished.

### Executed verification

Final Maven Wrapper verify passed: **140 tests, zero failures/errors/skips**. Fifteen unit/contract/architecture/MockMvc tests and125 real PostgreSQL integration tests: FoundationIT13, AuthHttpIT64, IdentityBoundariesIT11, PasswordLoginIT15, SessionServiceIT22. Same approved local toolchain/settings/cache and wrapper verify command as [contact verification](contact.md#verification); detailed final log is ignored .tools/vs01-member-final-verify.log, with Surefire/Failsafe XML under BE/target.

Ten new real-HTTP scenario groups cover both countries/types and the fixed owner/admin/staff authority matrix; current-owner protection, staff self-deactivation, owner-only role changes and former-admin reactivation; same identity/preferences/createdAt preservation; staff reactivation followed by a separate promotion; current-revision no-ops/stale conflicts; inactive-role edit denial; state/role filters and ordered/empty pagination; foreign/platform denial; multi-device browser/native revocation and fresh login; retired epoch proof rejection; atomic rollback of role/state/epoch/revocations/audit/actor activity; strict input and pending credential/setup barriers; browser CSRF/CORS, management isolation and self-deactivation cookie clearing.

Three explicit concurrency checks use real PostgreSQL locks and asynchronous HTTP requests. With a smaller target identity held, the member command waits before locking its larger actor identity; an independent NOWAIT probe confirms that actor remains unlocked. Concurrent update/deactivation of one revision yields one200 and one409 with currentRevision. A contact creation and member deactivation are both observed waiting on the same held organization guard, then released: creation may commit first or be rejected after revocation; no subsequent write with the revoked session succeeds. This proves the tested lock/commit boundaries, not every future business command.

Schema11-to12 upgrade regression preserves prior account preferences, browser/native sessions and audit history, rejects old-schema readiness, then passes repeat migration/current readiness. Existing clean/older-schema migration tests also pass. The first verification run passed member scenarios but exposed an older cleanup-test assumption: one1000-row pass could no longer remove all expired synthetic login attempts in the larger suite. The test now verifies the1000-row bound and drains the known remaining batches before asserting only the fresh attempt remains. Runtime cleanup behavior was unchanged; no required checks were disabled.

### Separate review and contract evidence

A separate primary-agent review checked current server-derived scope, target visibility before action checks, immutable bindings, former-role authority, pending barriers, account-domain revisions, no-op ordering, own-organization-only sorted identity locks, self-deactivation activity ordering, and atomic audit/session/epoch changes. Removed a proposed redundant member index before verification because the existing organization/member unique index already covers that key. The reviewed deactivation contract metadata now explicitly includes approved D-ORG-048 staff self-deactivation. No remaining blocker was found in this reviewed set; no independent-agent or exhaustive review is claimed.

| Operation | Local acceptance evidence |
|---|---|
| listMembers | Role/country/type and own-scope tests, state/role filter, stable ordering and empty-page totals; same-statement snapshot reviewed |
| changeMemberRole | Owner-only matrix, owner/inactive/pending protection, multi-device revocation, stale/no-op, concurrency and audit rollback |
| deactivateMember | Staff self/manager hierarchy, sole owner protection, epoch/session effects, guarded write race, browser clearing and rollback |
| reactivateMember | Former-admin owner-only authority, STAFF return, permanent identity, no session/proof revival, active no-op and suspension denial |

Mandatory notice events in DESIGN_SPEC section9 cover credential/recovery/ownership changes. No new ordinary-member notice type or empty outbox subsystem was added. Actual credential/ownership producers must atomically record their required notices in their consuming batches. Future transfer acceptance must bind recipient epoch; there is no implemented transfer request to invalidate yet, so no pending-transfer acceptance test is claimed here.

### Packaged artifact and security checks

- JAR SHA-256: `d32c1e7cfb5b186869b4f20e23600e7e6b169c083a726cd9b8f865e2551fb199`.
- Local narudzbine-backend:vs01-member image ID: `sha256:6c6e25b4dea5682a1fecae689812939daa7bc44b7acddf961b6ed7a0e5b9cefe`; scanner Metadata.ImageID matches the built artifact. It has no published registry RepoDigest.
- Packaged controlled migration asserted schema12 and passed; Linux read-only/nonroot startup passed. Private readiness200, public diagnostics404 and default-disabled member route404. Disposable test containers/network were cleaned up. Enabled member HTTP behavior uses restricted existing runtime grants in AuthHttpIT. Detailed ignored evidence: .tools/member-image-build.log and .tools/vs01-member-container-smoke-result.json.
- Trivy0.76.0: source secrets0; new image Java advisories0, HIGH/CRITICAL0, existing Ubuntu24.04 MEDIUM26/LOW4. Cached DB updated2026-10-16/downloaded2026-10-17; no fresh-feed claim. Reports: BE/target/member-secrets.json and member-container-vulnerabilities.json; scanner logs under .tools.
- Generated SBOM97 runtime components, all with license metadata. Dependency/build/base-image declarations and approved Tomcat/Jackson overrides are unchanged. A duplicate SBOM vulnerability scan and two-build reproducibility check were not repeated; the new image scan includes Java packages. Historical evidence is linked, not represented as a new run.

Current contract/register/link/whitespace results are in PROJECT_STATUS. These do not prove client/provider integration. Provider/hosting/restore/client gates remain open; runtime grants and remaining transfer/notice dependencies are in [operations](../../operations/runbook.md). No frontend application changes, purchases, provisioning, deployment, push or merge occurred.
