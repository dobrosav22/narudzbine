# VS-01 member lifecycle verification

2026-10-18, Europe/Budapest. [Implementation/refinements](MEMBER_IMPLEMENTATION.md). Four member operations extend the locally implemented configured surface from25 to29. Default activation remains off; VS-01 is unfinished.

## Executed verification

Final Maven Wrapper verify passed: **140 tests, zero failures/errors/skips**. Fifteen unit/contract/architecture/MockMvc tests and125 real PostgreSQL integration tests: FoundationIT13, AuthHttpIT64, IdentityBoundariesIT11, PasswordLoginIT15, SessionServiceIT22. Same approved local toolchain/settings/cache and wrapper verify command as [contact verification](CONTACT_VERIFICATION.md); detailed final log is ignored .tools/vs01-member-final-verify.log, with Surefire/Failsafe XML under BE/target.

Ten new real-HTTP scenario groups cover both countries/types and the fixed owner/admin/staff authority matrix; current-owner protection, staff self-deactivation, owner-only role changes and former-admin reactivation; same identity/preferences/createdAt preservation; staff reactivation followed by a separate promotion; current-revision no-ops/stale conflicts; inactive-role edit denial; state/role filters and ordered/empty pagination; foreign/platform denial; multi-device browser/native revocation and fresh login; retired epoch proof rejection; atomic rollback of role/state/epoch/revocations/audit/actor activity; strict input and pending credential/setup barriers; browser CSRF/CORS, management isolation and self-deactivation cookie clearing.

Three explicit concurrency checks use real PostgreSQL locks and asynchronous HTTP requests. With a smaller target identity held, the member command waits before locking its larger actor identity; an independent NOWAIT probe confirms that actor remains unlocked. Concurrent update/deactivation of one revision yields one200 and one409 with currentRevision. A contact creation and member deactivation are both observed waiting on the same held organization guard, then released: creation may commit first or be rejected after revocation; no subsequent write with the revoked session succeeds. This proves the tested lock/commit boundaries, not every future business command.

Schema11-to12 upgrade regression preserves prior account preferences, browser/native sessions and audit history, rejects old-schema readiness, then passes repeat migration/current readiness. Existing clean/older-schema migration tests also pass. The first verification run passed member scenarios but exposed an older cleanup-test assumption: one1000-row pass could no longer remove all expired synthetic login attempts in the larger suite. The test now verifies the1000-row bound and drains the known remaining batches before asserting only the fresh attempt remains. Runtime cleanup behavior was unchanged; no required checks were disabled.

## Separate review and contract evidence

A separate primary-agent review checked current server-derived scope, target visibility before action checks, immutable bindings, former-role authority, pending barriers, account-domain revisions, no-op ordering, own-organization-only sorted identity locks, self-deactivation activity ordering, and atomic audit/session/epoch changes. Removed a proposed redundant member index before verification because the existing organization/member unique index already covers that key. The reviewed deactivation contract metadata now explicitly includes approved D-ORG-048 staff self-deactivation. No remaining blocker was found in this reviewed set; no independent-agent or exhaustive review is claimed.

| Operation | Local acceptance evidence |
|---|---|
| listMembers | Role/country/type and own-scope tests, state/role filter, stable ordering and empty-page totals; same-statement snapshot reviewed |
| changeMemberRole | Owner-only matrix, owner/inactive/pending protection, multi-device revocation, stale/no-op, concurrency and audit rollback |
| deactivateMember | Staff self/manager hierarchy, sole owner protection, epoch/session effects, guarded write race, browser clearing and rollback |
| reactivateMember | Former-admin owner-only authority, STAFF return, permanent identity, no session/proof revival, active no-op and suspension denial |

Mandatory notice events in DESIGN_SPEC section9 cover credential/recovery/ownership changes. No new ordinary-member notice type or empty outbox subsystem was added. Actual credential/ownership producers must atomically record their required notices in their consuming batches. Future transfer acceptance must bind recipient epoch; there is no implemented transfer request to invalidate yet, so no pending-transfer acceptance test is claimed here.

## Packaged artifact and security checks

- JAR SHA-256: `d32c1e7cfb5b186869b4f20e23600e7e6b169c083a726cd9b8f865e2551fb199`.
- Local narudzbine-backend:vs01-member image ID: `sha256:6c6e25b4dea5682a1fecae689812939daa7bc44b7acddf961b6ed7a0e5b9cefe`; scanner Metadata.ImageID matches the built artifact. It has no published registry RepoDigest.
- Packaged controlled migration asserted schema12 and passed; Linux read-only/nonroot startup passed. Private readiness200, public diagnostics404 and default-disabled member route404. Disposable test containers/network were cleaned up. Enabled member HTTP behavior uses restricted existing runtime grants in AuthHttpIT. Detailed ignored evidence: .tools/member-image-build.log and .tools/vs01-member-container-smoke-result.json.
- Trivy0.76.0: source secrets0; new image Java advisories0, HIGH/CRITICAL0, existing Ubuntu24.04 MEDIUM26/LOW4. Cached DB updated2026-10-16/downloaded2026-10-17; no fresh-feed claim. Reports: BE/target/member-secrets.json and member-container-vulnerabilities.json; scanner logs under .tools.
- Generated SBOM97 runtime components, all with license metadata. Dependency/build/base-image declarations and approved Tomcat/Jackson overrides are unchanged. A duplicate SBOM vulnerability scan and two-build reproducibility check were not repeated; the new image scan includes Java packages. Historical evidence is linked, not represented as a new run.

Current contract/register/link/whitespace results are in PROJECT_STATUS. These do not prove client/provider integration. Provider/hosting/restore/client gates remain open; runtime grants and remaining transfer/notice dependencies are in [operations](../OPERATIONS_RUNBOOK.md). No frontend application changes, purchases, provisioning, deployment, push or merge occurred.
