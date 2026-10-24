# VS-01 login boundary verification

Historical login-boundary increment. The subsequent [HTTP implementation](AUTH_HTTP_IMPLEMENTATION.md) and [verification](AUTH_HTTP_VERIFICATION.md) supersede its current schema/artifact and unfinished-HTTP statements.

2026-10-17, Europe/Budapest. Executed local evidence for the [login boundary increment](LOGIN_IMPLEMENTATION.md). This supersedes the current-artifact/count statements in the earlier identity/session record; it does not complete VS-01 or enable public authentication.

## Executed checks

Final Maven Wrapper verify passed: **51 tests, zero failures, zero errors, zero skips**. Thirteen unit/contract/architecture tests and38 PostgreSQL integration tests ran. PasswordLoginIT adds eight database tests; FusionAuthPasswordVerifierTest adds five provider-fixture tests; SessionTransportPolicyTest adds four server-side request-policy tests. Existing34 tests also passed against schema marker4. The first attempt found a test-only generic type inference error, corrected before the passing runs. The final run includes the modern provider email-identity handling.

| Area | Observed result |
|---|---|
| Provider boundary | Email-only login request, tenant/application headers and noJWT flag, unchanged password bytes, expected success/denial/configuration statuses, no retry, sanitized errors, wrong tenant/user identity, unexpected tokens, modern verified email matching and legacy fallback behavior tested using fixtures. Oversized response subscriber cancels. |
| Login orchestration | Provider executes outside a database transaction; only an existing matching local identity receives a session. Unknown/wrong-subject/deactivated identities fail generically. Epoch/generation/pending-barrier/email changes during verification prevent session issuance. |
| Rollback | Email drift after a successful provider result rolls back new session issuance and the oldest-session eviction together. Existing sessions are denied while the credential-operation barrier is set. |
| Throttling |40 concurrent attempts sharing a source admit exactly30. Exact15-minute window expiry permits retry. Failed completion is idempotent; account cooldown grows and caps at30 seconds, then expires. Provider outages consume source allowance without becoming bad-password failures. Stored throttle records contain HMAC keys, not raw email/source values. |
| Mapping and input | Database prohibits provider-subject reassignment/deletion. Invalid login inputs do not reach the provider. Coordinator refuses an ambient transaction. Tests use restricted runtime database grants. |
| Transport policy | Repeated cookies/Authorization headers and mixed credentials denied; exact Origin required for unsafe browser requests; browser Origin cannot select native bearer; malformed bearer rejected; cookie attributes and secret redaction tested. Session CSRF validation remains covered by SessionServiceIT. |
| Runtime | Controlled packaged migration and read-only nonroot startup passed. Private readiness200, public diagnostics404 and unimplemented business route404. Disposable database/application/network removed. |

Build used workspace Temurin25.0.4.1+1, Maven3.10.0 and the pinned wrapper, with Boot4.1.1/Tomcat11.0.26/Jackson3.1.7 unchanged. PostgreSQL18.6 integration tests used pinned disposable Docker containers; no missing-Docker skips or in-memory substitute. The packaged smoke test used UID10001, a read-only filesystem, bounded temporary filesystem, dropped capabilities and no-new-privileges.

## Artifacts and scanning

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `e34b7fbb08819c81c3da8600f9f4199c0a07cd6a0bb1a3c52621de6db5c5236f` |
| Local image narudzbine-backend:vs01-login | `1920d8493b19b13daa5ff50003b4daccc42f51ebb0657452ab234a4f36eb9d9c` |

Trivy0.76.0 source scan: zero secrets. Runtime SBOM and independent container scan: zero Java advisories. Container: zero HIGH/CRITICAL,26 MEDIUM and4 LOW findings in the unchanged Ubuntu24.04 base. No suppression. The97 runtime components all have license metadata; no dependency was added. Existing base-image follow-up is recorded in [foundation evidence](FOUNDATION_VERIFICATION.md).

Generated reports: BE/target/login-secrets.json, login-dependency-vulnerabilities.json, login-container-vulnerabilities.json, bom.json and Surefire/Failsafe reports. Local build/smoke logs are in ignored .tools. These logs are evidence, not design authority. No repeat-build reproducibility claim is made for this increment. Scanner SBOM/hash and CycloneDX annotation warnings remain as previously documented; the independent image scan was also inspected.

## Remaining work and limits

Provider tests use deterministic exchange fixtures; they are not live FusionAuth authentication, TLS/timeout measurements, breach enforcement or tenant conformance. The five-second whole-response deadline and HTTPS/no-redirect policy are implemented but real-provider verification remains X-02/G-02. No provider resources were provisioned.

The new services and transport policy are internal and not enabled by default configuration. Public routes remain denied. Pre-auth nonce lifecycle, CSRF bootstrap, CORS and strict request/error mapping, authenticated HTTP transactions/activity classification, retention cleanup and trusted hosting proxy configuration must be completed before exposure. No HTTP endpoint is declared complete by these tests.

Credential reset/change/email/link/recovery, account/organization setup and management, owner transfer, profiles/locations and audit/outbox remain VS-01 work. The pending barrier is enforced, but the durable workflow that installs/resolves it is unfinished. No application MFA or frontend application work was introduced. No deployment, remote CI run, purchase, merge or production security/restore/client acceptance test was performed.
