# VS-01 password reauthentication increment

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/REAUTH_IMPLEMENTATION.md`: VS-01 password reauthentication increment._

2026-10-17. Delegated refinement under D-GOV-005/P1.1; backend/infrastructure only. Implement the existing POST /api/v1/auth/reauthentication password-only contract. Do not accept a client account ID, email, transport selection or provider proof. Resolve the account/email/provider binding exclusively from the current application session.

First authenticate the current session and browser CSRF in a short transaction and snapshot the immutable provider binding plus current email/security epoch/credential generation. Apply shared authenticated-write admission and the same credential throttle used by login. Verify the password outside every database transaction. Then, in a new transaction, recheck the original token, transport, browser CSRF, account/organization state, email, binding, epoch and generation before rotation. Concurrent revocation, credential changes, account suspension and successful competing rotation must deny stale requests. A correct provider result is not permission to resurrect or replace an invalid session.

Success rotates the current opaque session secret and its browser CSRF proof; preserve session ID, device label, creation time, idle activity and absolute expiry. Update authAt and password proof provenance only. Reauthentication is not qualifying business/support activity and cannot extend either expiry. Other sessions remain unchanged and no session-cap eviction occurs. Browser receives a new secure HttpOnly cookie and csrfToken with bearerToken=null; native receives bearerToken with csrfToken=null and no cookie. All current-state checks remain mandatory after reauthentication.

Wrong password or subject mismatch is a generic INVALID_LOGIN and counts as a failed credential attempt. Invalid current session, stale state or CSRF denial creates no new credential/session effect. Provider failure consumes admission but does not count as a wrong password and cannot rotate a secret. Only raw credentials from the request reach the provider; no clear password, provider response or secret enters a database/outbox/log. Inputs and response DTO string representations remain redacted.

No grace secret or replayed authentication secret is retained. If a successful response is lost, the old token is invalid and the client must perform ordinary login; never retry with a separate idempotency key or accept the retired token. This refines the operation retry description under the already-approved immediate-rotation/no-grace rule. Default HTTP/provider activation remains off; live provider/hosting/client gates and remaining credential/audit/account workflows remain open. No schema or dependency change is needed.

## Verification

_Originally `BE/REAUTH_VERIFICATION.md`: VS-01 password reauthentication verification._

Historical reauthentication increment. [Session audit verification](../privacy-and-audit/audit.md#verification) records subsequent current artifacts and test counts.

2026-10-17, Europe/Budapest. Local evidence for the [reauthentication increment](#implementation). This is the eighth implemented identity/session HTTP operation; VS-01 remains in progress. Earlier coverage is recorded in [HTTP verification](auth-http.md#verification).

### Executed checks

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

### Artifacts and security checks

Temurin25.0.4.1+1, Maven3.10.0 and Boot4.1.1 with the approved Tomcat11.0.26/Jackson BOM3.1.7 overrides remain unchanged. No dependency or schema change; current schema marker remains5. CycloneDX lists97 runtime components, all with license metadata.

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `c8410125f78060275edd403a5d7422ddad401fe306bbae6112ca2dd05cd41e32` |
| Local narudzbine-backend:vs01-reauth image | `18d472e570e7c2484d0485e55e5c1a2d9d9a33b4284009f8368039bfa4b826c8` |

The packaged image passed explicit migration and read-only nonroot startup. Private readiness returned200; public diagnostics and an unimplemented business route returned404. Disposable containers/network were removed. Packaged smoke uses default configuration; enabled authentication routes are covered by the JVM integration suite.

Trivy0.76.0 found zero source secrets, zero Java advisories in both SBOM and independent image scans, and zero HIGH/CRITICAL image findings. The unchanged Ubuntu24.04 base retains26 MEDIUM and4 LOW findings, without suppressions; production follow-up remains required. Reports are generated under BE/target as reauth-secrets.json, reauth-dependency-vulnerabilities.json, reauth-container-vulnerabilities.json and bom.json. Test reports are in Surefire/Failsafe directories. Ignored .tools holds vs01-reauth-verify.log, scanner logs and vs01-reauth-container-smoke-result.json.

Contract descriptions and413/415 responses were refined after the passing Maven run. Separate structural verification of the updated contract passed:208 operations,204 schemas,2,953 internal references;625 questions,545 decisions,543 requirements and trace rows. This is not full OpenAPI meta-schema validation or proof that all described endpoints are implemented.

### Remaining scope and gates

HTTP/provider activation remains off by default. Live provider conformance, hosted TLS/proxy/source-address behavior, actual web/mobile integration, remote CI and production operations remain unverified. No provisioning, purchase, deployment, push or merge occurred.

Audit/outbox, profile/location/account-management and password-reset/change/email/external-link/recovery workflows remain unfinished. Account.homeLocationId remains null until location support is delivered. No MFA, organization switching or frontend application changes were introduced.
