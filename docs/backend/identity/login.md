# VS-01 login boundary increment

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/LOGIN_IMPLEMENTATION.md`: VS-01 login boundary increment._

Historical login-boundary increment. The subsequent [HTTP implementation](auth-http.md#implementation) and [verification](auth-http.md#verification) supersede its current schema/artifact and unfinished-HTTP statements.

2026-10-17. Authorized P1.1 implementation under D-GOV-005. This increment implements the credential-provider adapter, login coordinator/throttle and browser/native transport policy. It does not yet expose public authentication controllers or provision provider resources.

### Provider and transaction boundary

FusionAuth password verification sends email-only loginIdTypes, applicationId and noJWT=true to the configured HTTPS /api/login endpoint with a tenant-scoped API key and tenant header. No redirect, credential retry, returned provider token, MFA challenge or on-the-fly signup is accepted. Bound response bytes and total call duration. Only a successful active user in the configured tenant/application can produce a verified subject. Unknown/wrong-password and other non-admissible user states fail generically; API-key/configuration/network/malformed-response failures are dependency failures. A password-change-required response never creates an ordinary session; the later reset/change workflow must handle recovery.

Source: [FusionAuth authenticate API](https://fusionauth.io/docs/apis/login/authenticate), checked 2026-10-17. Its404 is invalid credentials;401 is an invalid API key.202/203/212/213 are not ordinary completed login.242 is incompatible MFA configuration, not permission to add MFA or bypass it. Require the returned primary email identity to match the normalized login email and be verified. Prefer identities[].verified; only when identities is absent use the documented legacy email/verified fields. A legacy flag never overrides an unverified modern identity. Real tenant behavior, breach enforcement, residency and provider-side bypass controls still require G-02.

Persist an immutable managed_password_identity mapping from existing local account to tenant/provider-user ID. Lookup the normalized current email and capture security epoch/generation before verification. Call the provider outside any database transaction. Then issue the session in a short transaction with current-state locks, matching the returned immutable subject and checking the current mapping/email/epoch again before commit. Revocation/credential changes while the provider is working prevent issuance. Unknown, unmapped, disabled and wrong-password cases use the same public denial. No password enters a table, outbox or ordinary log.

The five-second future deadline includes response-body completion; the subscriber cancels above65,536 bytes, and the HTTP client has a two-second connection timeout with redirects disabled. No live-provider latency or network conformance result is implied by local fixture tests. The credential_operation_pending barrier denies both session and business authorization while set; the durable credential-change workflow that installs/resolves it remains subsequent work.

### Throttle refinement

Use HMAC-SHA256 keys with a dedicated deployment secret for normalized email and source address. Counters include unknown accounts. A durable attempt reservation counts against the30/source/15-minute rolling limit before any provider call. Five completed failed attempts per address in15 minutes start a1-second cooldown; subsequent failures double it to a30-second maximum. Failed-attempt completion is idempotent. Account/source bucket locks are sorted by hash within their separate throttle transaction; no provider call holds them.429 includes a bounded positive Retry-After. Provider outage consumes the network attempt but does not count as a bad password. No permanent lockout.

The source is the trusted connection address supplied by the server adapter, never a client-provided forwarded header. Hosted proxy normalization/allowlisting remains G-03 before enabling a real listener. Counter retention and cleanup must be wired before exposure; stored keys cannot reveal raw email/IP without the separate HMAC key.

### Transport policy

Reject cookie+Authorization ambiguity, repeated session cookies/Authorization headers, malformed bearer syntax and browser-origin attempts to use the native path. Browser unsafe requests need an exact configured Origin plus session CSRF proof; native requests use a bearer token and no cookie. Session cookies use __Host-narudzbine_session, Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain. Do not return browser session secrets in a JSON body or native session cookies. Secrets in transport objects have redacted string representations.

This policy is tested with server-side request fixtures; it is not a frontend test or proof of a fully wired HTTP endpoint. Pre-auth nonce lifecycle, authenticated CSRF bootstrap, CORS/strict DTO/error mapping and controllers remain subsequent work. Production configuration must provide separate immutable provider IDs, API key, exact origins and throttle key; no fake/default provider or key is supplied by main code.

### Wiring and schema

Schema marker4 appends the immutable provider mapping, credential-operation barrier, HMAC throttle buckets and durable attempts. Ordinary startup rejects older markers; apply the controlled migration first. Existing HTTP routing remains denied. Construct PasswordLoginService, LoginThrottle and FusionAuthPasswordVerifier only after configuration validation in the later security wiring; none is a default Spring bean. The real SessionService and BusinessAccess already honor the pending barrier.

In addition to existing identity/session runtime grants, this coordinator needs SELECT on managed_password_identity and SELECT/INSERT/UPDATE on login_throttle_bucket and login_attempt. It does not need mapping writes or schema ownership. Provisioning and retention grants remain separate. Runtime-role tests exercise these exact boundaries. No extra dependency was introduced.

## Verification

_Originally `BE/LOGIN_VERIFICATION.md`: VS-01 login boundary verification._

Historical login-boundary increment. The subsequent [HTTP implementation](auth-http.md#implementation) and [verification](auth-http.md#verification) supersede its current schema/artifact and unfinished-HTTP statements.

2026-10-17, Europe/Budapest. Executed local evidence for the [login boundary increment](#implementation). This supersedes the current-artifact/count statements in the earlier identity/session record; it does not complete VS-01 or enable public authentication.

### Executed checks

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

### Artifacts and scanning

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `e34b7fbb08819c81c3da8600f9f4199c0a07cd6a0bb1a3c52621de6db5c5236f` |
| Local image narudzbine-backend:vs01-login | `1920d8493b19b13daa5ff50003b4daccc42f51ebb0657452ab234a4f36eb9d9c` |

Trivy0.76.0 source scan: zero secrets. Runtime SBOM and independent container scan: zero Java advisories. Container: zero HIGH/CRITICAL,26 MEDIUM and4 LOW findings in the unchanged Ubuntu24.04 base. No suppression. The97 runtime components all have license metadata; no dependency was added. Existing base-image follow-up is recorded in [foundation evidence](../platform/foundation.md#verification).

Generated reports: BE/target/login-secrets.json, login-dependency-vulnerabilities.json, login-container-vulnerabilities.json, bom.json and Surefire/Failsafe reports. Local build/smoke logs are in ignored .tools. These logs are evidence, not design authority. No repeat-build reproducibility claim is made for this increment. Scanner SBOM/hash and CycloneDX annotation warnings remain as previously documented; the independent image scan was also inspected.

### Remaining work and limits

Provider tests use deterministic exchange fixtures; they are not live FusionAuth authentication, TLS/timeout measurements, breach enforcement or tenant conformance. The five-second whole-response deadline and HTTPS/no-redirect policy are implemented but real-provider verification remains X-02/G-02. No provider resources were provisioned.

The new services and transport policy are internal and not enabled by default configuration. Public routes remain denied. Pre-auth nonce lifecycle, CSRF bootstrap, CORS and strict request/error mapping, authenticated HTTP transactions/activity classification, retention cleanup and trusted hosting proxy configuration must be completed before exposure. No HTTP endpoint is declared complete by these tests.

Credential reset/change/email/link/recovery, account/organization setup and management, owner transfer, profiles/locations and audit/outbox remain VS-01 work. The pending barrier is enforced, but the durable workflow that installs/resolves it is unfinished. No application MFA or frontend application work was introduced. No deployment, remote CI run, purchase, merge or production security/restore/client acceptance test was performed.
