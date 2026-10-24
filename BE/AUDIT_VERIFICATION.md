# VS-01 session audit verification

Historical session audit increment. [Own-account verification](OWN_ACCOUNT_VERIFICATION.md) records current artifacts, schema and test counts.

2026-10-17, Europe/Budapest. Executed local evidence for the [session audit increment](AUDIT_IMPLEMENTATION.md). Eight existing identity/session HTTP operations remain implemented; no new endpoint or notification was added. VS-01 remains in progress.

## Tests and review

Final Maven Wrapper verify passed: **80 tests, zero failures, zero errors, zero skips**. Fifteen unit/contract/architecture/MockMvc tests and65 real PostgreSQL integration tests: FoundationIT7, AuthHttpIT11, IdentityBoundariesIT11, PasswordLoginIT15 and SessionServiceIT21. The earlier audit build passed79 tests; review then removed an unnecessary organization foreign key and added a regression before the final80-test run.

New coverage verifies original business organization/country and separate platform attribution, safe metadata without secrets/contact/device content, transaction requirements, rollback of session creation/cap eviction/rotation/revocation when audit insertion fails, and outer rollback of both session and audit. Restricted runtime cannot read audit records; UPDATE/DELETE/TRUNCATE remain rejected even after accidental broader DML grants. Reads, failed commands and no-op revocations create no success event. Cap eviction and revoke-all cover every changed session. Concurrent logout records one change. The real HTTP suite additionally checks audit correlation against the server response's request ID.

Separate review identified that an organization foreign key could acquire a parent lock after logout had locked its account, opposing the approved organization-before-account order. Audit stores the immutable organization/country snapshot resolved by its producer without that live foreign key. A concurrent test holds the organization FOR UPDATE and proves logout/audit still completes before that lock is released.

The schema5-to6 upgrade rejects old readiness, preserves existing browser/native sessions, creates no fabricated historical audit and is repeat-safe. Earlier schema/startup, session races, provider boundaries, CSRF, throttling and authorization regressions continue to pass. Provider verification uses a fixture; no live provider or browser/mobile client acceptance is claimed.

## Packaged evidence

Schema marker6; no dependency changes. Temurin25.0.4.1+1, Maven3.10.0, Boot4.1.1 and approved Tomcat11.0.26/Jackson BOM3.1.7 remain unchanged. CycloneDX inventory contains97 runtime components, all with license metadata.

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `0da23b69d99639a14a3234663a965147dd3c08fbd0383c10bfdd6b9d549f68ee` |
| Local narudzbine-backend:vs01-audit image | `986195af9656c890f22378acd875509b5eef48d8178389f7cae57becc9c77d9e` |

Packaged controlled migration and Linux read-only nonroot startup passed. Private readiness200; public diagnostics404; unimplemented business route404. Disposable containers/network were removed. Packaged smoke uses default configuration; enabled identity routes are covered by JVM integration tests with the restricted runtime role and INSERT-only audit grant.

Trivy0.76.0 source scan found zero secrets. Generated SBOM and independent image scans found zero Java advisories; image findings remain26 MEDIUM and4 LOW Ubuntu24.04 issues, with zero HIGH/CRITICAL. No suppression was added. These scans used the existing vulnerability database updated2026-10-16, downloaded2026-10-17; they are not a claim of a newly refreshed vulnerability feed. The first source scan encountered Maven HTTP429 during unnecessary dependency analysis; the completed source scan used offline mode. Separate SBOM/image scans cover the packaged dependencies.

Reports: BE/target/audit-secrets.json, audit-dependency-vulnerabilities.json, audit-container-vulnerabilities.json, bom.json and Surefire/Failsafe results. Ignored .tools contains vs01-audit-final-verify.log, audit scanner/image-build logs and vs01-audit-container-smoke-result.json. Structural/register/link and whitespace checks are recorded in project status.

## Remaining work

Default HTTP/provider activation stays off. Apply controlled migration and INSERT-only audit grant before enabling this version. Audit readers, additional business producers, failure-event pipeline, protected archive, retention/legal-hold/redaction, outbox and delivery remain unfinished. Existing credential/profile/location/account-management and live-provider/hosting/client gates remain open. No provider provisioning, purchase, deployment, remote CI, push, merge or frontend application change occurred.
