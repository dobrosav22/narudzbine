# VS-01 own profile verification

2026-10-17, Europe/Budapest. Local evidence for [own profile editing](PROFILE_IMPLEMENTATION.md). PUT /api/v1/me extends the implemented configured surface to19 operations. VS-01 remains in progress.

## Executed verification

Maven Wrapper verify passed: **117 tests, zero failures/errors/skips**. Fifteen unit/contract/architecture/MockMvc tests and102 real PostgreSQL integration tests: FoundationIT11, AuthHttpIT43, IdentityBoundariesIT11, PasswordLoginIT15 and SessionServiceIT22.

Seven new real-HTTP scenarios cover every business role/type/country and platform own-name editing; duplicate person names within one organization; identity/preferences preservation; staff default selection/clearing; foreign/unknown/archived location denial; organization suspension; NFC normalization and code-point bounds; explicit null versus missing members; safe independent validation; normalized no-ops; stale and foreign-domain revisions; lost-response refetch; simultaneous profile/profile and language/profile saves; archive/default races; audit-insertion rollback; browser CSRF/Origin/CORS; management isolation and no cookie rotation. Language and organization stale conflicts now return their current authorized revisions. Account/profile/default/activity effects roll back together if audit insertion fails.

Concurrent profile and archive HTTP commands were run three times with distinct locations. Archive succeeds; selection either precedes it or fails with409, and the final home default is always null. Restore never reinstates it. This is a real database/HTTP race test, not a claim about unfinished order submission. The existing organization-before-account lock-order regression remains passing after reuse of that guard for profiles.

An additional schema9-to10 upgrade regression preserves existing account preferences, browser/native sessions and prior audit history; repeated migration and readiness pass. The migration changes only the audit action constraint and schema marker. Separate code review checked own-account derivation, platform versus business locking, current authorization and revision before no-op, location scope/state checks under the organization guard, profile/audit atomicity, minimal audit contents and immutable identity fields. No provider request or historical-order update is introduced.

## Artifacts and checks

Schema marker10 requires controlled migration; runtime grants and dependencies are unchanged. Approved Tomcat11.0.26/Jackson BOM3.1.7 overrides remain. Generated inventory contains97 runtime components.

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `ea3678fcd34fee221be42a463a2c2115e1c5300dd5bd94afca4835d7a0486344` |
| Local narudzbine-backend:vs01-profile image | `04cc8abee7a4a1b4e880b3443388255c13695a13a174839787b69bebbedde48c` |

Final packaged controlled migration and Linux read-only nonroot startup passed. Private readiness200; public diagnostics and default-disabled business/location routes404. Disposable containers/network were removed. Enabled profile API behavior is tested through the loopback JVM HTTP server with restricted runtime grants and a test-only provider; actual browser/native clients and the real provider remain external gates.

Trivy0.76.0 found zero source secrets and zero Java advisories in both generated SBOM and independent image scans. The scanned image ID matches the digest above. Zero HIGH/CRITICAL findings; existing Ubuntu24.04 findings remain26 MEDIUM/4 LOW, with no suppressions. Scans use the cached database updated2026-10-16 and downloaded2026-10-17; no refreshed-feed claim. All97 runtime inventory components have license metadata. Final contract/register/link/whitespace checks passed:208 operations,204 schemas,2,970 references,625 questions,545 decisions and543 requirements/trace rows; no errors. Evidence record finalized2026-10-18.

Ignored detailed evidence: .tools/vs01-profile-verify.log, profile-image-build.log, profile scanner logs and vs01-profile-container-smoke-result.json; BE/target Surefire/Failsafe reports, bom.json, profile-secrets.json, profile-dependency-vulnerabilities.json and profile-container-vulnerabilities.json. Contract/register/link/whitespace checks are separate from live integration and full OpenAPI meta-schema validation.

## Remaining scope

Default HTTP/provider activation remains off. Business contacts, member/setup/admin/credential/recovery workflows, transactional outbox/security notices, order attribution/location snapshots and full audit readers/archive/retention remain unfinished. Live provider/hosting/client/restore gates remain open. No purchase, provisioning, deployment, remote CI, push, merge or frontend application change occurred.
