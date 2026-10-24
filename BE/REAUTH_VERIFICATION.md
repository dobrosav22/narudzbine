# VS-01 password reauthentication verification

Historical reauthentication increment. [Session audit verification](AUDIT_VERIFICATION.md) records subsequent current artifacts and test counts.

2026-10-17, Europe/Budapest. Local evidence for the [reauthentication increment](REAUTH_IMPLEMENTATION.md). This is the eighth implemented identity/session HTTP operation; VS-01 remains in progress. Earlier coverage is recorded in [HTTP verification](AUTH_HTTP_VERIFICATION.md).

## Executed checks

Maven Wrapper verify passed: **72 tests, zero failures, zero errors, zero skips**. Fifteen unit/contract/architecture/MockMvc tests and 57 PostgreSQL integration tests: FoundationIT 6, AuthHttpIT 11, IdentityBoundariesIT 11, PasswordLoginIT 15 and SessionServiceIT 14.

Ten new scenarios verify:

- Password verification occurs outside database transactions and uses the current session's account/email. Rotation preserves session identity, device metadata, activity and absolute expiry; other sessions survive.
- Invalid tokens, transport, browser CSRF and ambient transactions cannot reach password verification.
- Provider outage and wrong passwords leave the session unchanged. Wrong passwords share login throttling; provider outages do not count as wrong passwords.
- Concurrent security-epoch, credential-generation, pending-barrier, account-state or email changes prevent rotation.
- Revocation and exact idle expiry during verification cannot resurrect a session.
- Two simultaneous rotations produce exactly one success; the competing request cannot reuse the old token.
- A different verified provider subject cannot reauthenticate the current account.
- Browser rotation replaces the cookie and CSRF proof, invalidates old credentials and permits a guarded operation using fresh authentication.
- Native rotation returns a bearer token without cookies. A lost successful response requires ordinary login; other devices remain valid.
- Extra fields, invalid password input and wrong passwords produce safe errors without secret echo or unintended rotation.

Integration tests use PostgreSQL18.6 and a test-only identity-provider fixture. HTTP checks use a real loopback application listener; they do not exercise an actual browser/mobile application or live FusionAuth.

## Artifacts and security checks

Temurin25.0.4.1+1, Maven3.10.0 and Boot4.1.1 with the approved Tomcat11.0.26/Jackson BOM3.1.7 overrides remain unchanged. No dependency or schema change; current schema marker remains5. CycloneDX lists97 runtime components, all with license metadata.

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `c8410125f78060275edd403a5d7422ddad401fe306bbae6112ca2dd05cd41e32` |
| Local narudzbine-backend:vs01-reauth image | `18d472e570e7c2484d0485e55e5c1a2d9d9a33b4284009f8368039bfa4b826c8` |

The packaged image passed explicit migration and read-only nonroot startup. Private readiness returned200; public diagnostics and an unimplemented business route returned404. Disposable containers/network were removed. Packaged smoke uses default configuration; enabled authentication routes are covered by the JVM integration suite.

Trivy0.76.0 found zero source secrets, zero Java advisories in both SBOM and independent image scans, and zero HIGH/CRITICAL image findings. The unchanged Ubuntu24.04 base retains26 MEDIUM and4 LOW findings, without suppressions; production follow-up remains required. Reports are generated under BE/target as reauth-secrets.json, reauth-dependency-vulnerabilities.json, reauth-container-vulnerabilities.json and bom.json. Test reports are in Surefire/Failsafe directories. Ignored .tools holds vs01-reauth-verify.log, scanner logs and vs01-reauth-container-smoke-result.json.

Contract descriptions and413/415 responses were refined after the passing Maven run. Separate structural verification of the updated contract passed:208 operations,204 schemas,2,953 internal references;625 questions,545 decisions,543 requirements and trace rows. This is not full OpenAPI meta-schema validation or proof that all described endpoints are implemented.

## Remaining scope and gates

HTTP/provider activation remains off by default. Live provider conformance, hosted TLS/proxy/source-address behavior, actual web/mobile integration, remote CI and production operations remain unverified. No provisioning, purchase, deployment, push or merge occurred.

Audit/outbox, profile/location/account-management and password-reset/change/email/external-link/recovery workflows remain unfinished. Account.homeLocationId remains null until location support is delivered. No MFA, organization switching or frontend application changes were introduced.
