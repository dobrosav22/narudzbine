# VS-01 organization settings verification

Historical increment evidence; [saved locations verification](LOCATION_VERIFICATION.md) records the subsequent current build and schema9 checks.

2026-10-17, Europe/Budapest. Executed local evidence for the [organization settings increment](ORGANIZATION_IMPLEMENTATION.md). GET and PUT /api/v1/organization bring the implemented identity/session/account/organization surface to twelve operations. VS-01 remains in progress.

## Executed verification

Maven Wrapper verify passed: **98 tests, zero failures, zero errors, zero skips**. Fifteen unit/contract/architecture/MockMvc tests and 83 real PostgreSQL integration tests: FoundationIT9, AuthHttpIT26, IdentityBoundariesIT11, PasswordLoginIT15 and SessionServiceIT22. An initial test compilation error from ambiguous AssertJ/generic transaction-result inference was corrected with explicit result types before the successful run; no runtime assertion was weakened.

Seven added real-HTTP scenarios cover organization reads and owner/admin updates for every business role, buyer/vendor type and both countries; platform-account denial; immutable-field rejection; exact decimal coordinates; bounded nested validation; locale canonicalization; normalized no-ops; stale/foreign revisions; concurrent edits; current role and suspension enforcement; buyer staff submission restrictions; CSRF/Origin/CORS and management-listener isolation. Account bindings, personal preferences and account revisions remain unchanged. Concurrent saves with one organization revision produce exactly one200 and one409 and one change audit. Audit insertion failure rolls back settings and session activity. No-op saves preserve organization revision/update time and append no change audit.

An additional lock-order integration test holds the account row while organization-write authentication waits. A separate connection cannot acquire an organization shared lock (PostgreSQL55P03), proving that the command already holds the exclusive organization lock before waiting for the account. Releasing the account permits successful authorization. This verifies the organization-before-account ordering without relying only on code inspection.

An additional foundation test upgrades schema7-to8 while preserving preferences, both session transports and an existing audit event; repeated migration and readiness pass. Separate self-review checked derived organization scope, current-role enforcement, organization-first locking, revision/no-op ordering, decimal normalization and atomic audit/activity behavior. These checks do not claim verification of unfinished order or location workflows.

## Artifacts and checks

Schema marker8 requires controlled migration; runtime grants and dependencies are unchanged. Temurin25.0.4.1+1, Maven3.10.0, Boot4.1.1 and approved Tomcat11.0.26/Jackson BOM3.1.7 remain unchanged. CycloneDX inventory contains 97 runtime components, all with license metadata.

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `72962678afaf4d04a99721e4ec2b8115005f0086040dc5eee11787f8dadd7182` |
| Local narudzbine-backend:vs01-organization image | `7c3b5c10bd867be322b24e1abf4ac9281bfc0bd00e4caaa188a38db36a4a8a01` |

Packaged controlled migration and Linux read-only nonroot startup passed. Private readiness200; public diagnostics404; unimplemented business route404. Disposable containers/network were removed. Packaged smoke uses default configuration; enabled HTTP operations are exercised through the loopback JVM server with restricted database grants and a test-only password-provider fixture.

Trivy0.76.0 found zero source secrets and zero Java advisories in both generated SBOM and independent image scans. The image has zero HIGH/CRITICAL findings; the unchanged Ubuntu24.04 base retains 26 MEDIUM and 4 LOW findings without suppressions. Scans use the cached vulnerability database updated2026-10-16, downloaded2026-10-17; a newly refreshed feed is not claimed.

Generated evidence: BE/target/organization-secrets.json, organization-dependency-vulnerabilities.json, organization-container-vulnerabilities.json, bom.json and Surefire/Failsafe reports. Ignored .tools contains vs01-organization-final-verify.log, organization scanner/image-build logs and vs01-organization-container-smoke-result.json. OpenAPI descriptions and413/415 references were refined after the Maven contract check; final structural/register/link checks separately cover those documentation changes.

## Remaining scope

Default HTTP/provider activation remains off. Location management, PUT /me display-name/home-location editing, setup/admin/account-management workflows, credential changes and transactional outbox/notice delivery remain unfinished. Account.homeLocationId remains null. Full audit readers/archive/retention and live-provider/hosting/client/restore gates remain open. No provider provisioning, purchase, deployment, remote CI, push, merge or frontend application change occurred.
