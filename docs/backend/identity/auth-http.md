# VS-01 HTTP authentication increment

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/AUTH_HTTP_IMPLEMENTATION.md`: VS-01 HTTP authentication increment._

2026-10-17. Implementation refinement under D-GOV-005 and approved P1.1. Backend/infrastructure only. Default HTTP activation remains off; live activation still requires G-02 provider and G-03 hosting conformance.

Implement browser bootstrap/login/current CSRF/logout and own-session listing/revocation through the existing opaque-session services. Provider verification stays outside database transactions. Browser requests require exact configured HTTPS Origins, strict JSON and session CSRF on mutations; native requests use bearer transport and cannot carry browser Origin or authentication cookies. Only the explicit implemented method/path set is reachable on the business listener. Management listener and remaining routes stay separate.

CSRF bootstrap refinement: derive a 32-byte HMAC-SHA256 output using the random session secret as the key and a fixed versioned CSRF domain label. Persist only SHA-256 of that output. Possessing CSRF proof does not reveal the random session credential. Bootstrap recomputes and verifies the stored digest without changing it or extending activity. Rotation replaces both tokens. This replaces independently generated random CSRF values solely to support the approved hash-only, stable bootstrap contract. Schema upgrade revokes prior browser sessions; native sessions remain unchanged.

Pre-auth bootstrap creates independent random nonce and HttpOnly __Host-narudzbine_preauth cookie binding, storing hashes only, with five-minute expiry and atomic one-use consumption before credential verification. Bootstrap requires allowed Origin and is throttled separately at30/source/15minutes. Explicit retries after a consumed nonce require another bootstrap. Native login rejects this cookie/nonce. Successful browser login clears it. No passwords or provider bodies enter persistence/logs. Cleanup removes expired nonce rows and throttle attempts older24hours in bounded batches; unused throttle buckets are subsequently removed.

The HTTP layer uses bounded16KiB strict JSON parsing (duplicates, unknown fields and coercion rejected), record DTOs, fixed millisecond UTC timestamp strings, explicit nulls and safe RFC9457 errors. Current account revisions use a separate configured HMAC key bound to account ID/counter. Untrusted forwarded addresses are ignored. Hosting must provide approved source normalization before activation behind a proxy. Invalid or incomplete enabled configuration fails startup. No default provider credential or HMAC secret is supplied.

Logout retry recognizes only an actual stored same-transport session secret, validates stored browser CSRF even after revocation, and repeats the desired revocation without extending activity. Session list/CSRF bootstrap are background reads; session-management commands do not extend session expiry. Revoke-all requires authentication within five minutes. Unknown/expired session secrets do not authorize other operations. Account/credential/organization checks remain in every ordinary authenticated transaction.

Real provider sandbox, complete account-management/audit/outbox workflows, hosted edge abuse controls and hosting configuration remain release gates; local HTTP verification uses a test-only provider fixture.

### Limits, cleanup and local activation

Authenticated session requests share120/account/minute and writes60/account/minute across devices. Admission is durable and precedes a second current-state check in the command transaction; a failed command may consume admission but never records qualifying activity. Logout also has120/source/minute. An already-retired credential can repeat only its stored revocation; this retry consumes the source allowance, not the active account allowance, so a revoked credential cannot exhaust another active session's budget. All source keys are derived from the server connection address, without trusting forwarded headers.

Enable identity.http.enabled only for an authorized configured environment. Required properties: identity.http.origins (exact HTTPS origins), identity.http.throttle-key and identity.http.revision-key (separate base64 secrets, each at least32 random bytes), plus a PasswordCredentialVerifier. Production provider configuration additionally needs identity.provider.enabled=true, identity.provider.endpoint (HTTPS /api/login), identity.provider.tenant, identity.provider.application and identity.provider.api-key. Do not put secret values in tracked files or command-line production arguments. No production provider/default secret bean is enabled implicitly. Tests inject a provider only from test sources. Defaults keep the HTTP routes denied.

Schema6 additionally requires INSERT only on audit_event for atomic session auditing; do not grant runtime audit SELECT/UPDATE/DELETE/TRUNCATE. Runtime grants add SELECT/INSERT/UPDATE/DELETE on pre_auth_nonce and DELETE on login_attempt/login_throttle_bucket to the login increment's grants. Cleanup runs once per minute in bounded batches of1000 with SKIP LOCKED. It removes only expired nonces and attempts older24hours, then unused throttle buckets. Failed work rolls back and a later scheduled run retries. No identity/session rows are deleted by this cleanup.

Review reference: [OWASP CSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). Session binding, unpredictable secrets, explicit Origin checks and rejection of simple/non-JSON login requests inform this implementation. The concrete HMAC derivation is this project's design refinement, not a claim that OWASP specifies this exact construction. Actual browser-client and hosted TLS/proxy acceptance remain external gates.

Current response projection returns homeLocationId=null because own-location management has not been implemented. The account revision is an authenticated resource-bound token; edit/verification workflows remain subsequent work. Supported local routes are seven operations: createPreAuthNonce, login, getCsrfToken, logout, listSessions, revokeSession and revokeAllSessions. Remaining API operations are still denied. Full VS-01 acceptance remains open for credentials/recovery/external links, audit/outbox and account-management workflows.

### Subsequent password reauthentication
[Reauthentication implementation](reauth.md#implementation) adds the eighth local operation with current-session credential proof and immediate rotation. The original seven routes and their behavior above remain; the schema marker stays5. Current verification is in [reauthentication evidence](reauth.md#verification).

### Subsequent saved locations increment

[Saved locations](../organizations/location.md#implementation) adds six operations, stored homeLocationId projection and bounded expired creation-snapshot compaction. It supersedes the earlier always-null home projection note. [Current verification](../organizations/location.md#verification) records schema9 and the eighteen-operation configured surface. Full profile selection and real provider/client gates remain unfinished.

### Subsequent profile increment

[Own profile editing](profile.md#implementation) adds PUT /me display-name/home-location selection with account revisions and archive-safe organization locking. [Current evidence](profile.md#verification) records the nineteen-operation configured surface and schema10; runtime grants/configuration are unchanged. Profile edits do not rotate credentials or call the provider.

## Verification

_Originally `BE/AUTH_HTTP_VERIFICATION.md`: VS-01 HTTP authentication verification._

Historical seven-operation increment. [Reauthentication verification](reauth.md#verification) records the subsequent eighth operation and current artifacts/test count.

2026-10-17, Europe/Budapest. Actual local evidence for the [HTTP implementation](#implementation), not completion of VS-01 or authorization for live activation. This supersedes the earlier login-boundary artifact/count statements.

### Executed checks

Final Maven Wrapper verify: **62 tests, zero failures, zero errors, zero skips**. Fifteen unit/contract/architecture/MockMvc tests and47 real PostgreSQL integration tests. AuthHttpIT has eight real-HTTP scenarios; AuthHttpValidationTest has two MockMvc/configuration scenarios. FoundationIT now has six cases including explicit marker4-to5 upgrade with existing browser/native sessions. Previous identity, provider, throttle, transport and session tests also passed.

| Area | Executed evidence |
|---|---|
| Browser login | Allowed-Origin bootstrap produces secure HttpOnly cookie plus nonce; login requires both; browser response has no bearer secret; session cookie and pre-auth clearing checked. Stable CSRF bootstrap returns the same proof across repeated requests. Missing CSRF rejects logout; original-credential logout retry succeeds and clears cookie. |
| Nonce safety | Missing cookie rejected; two simultaneous HTTP login requests using one nonce yield exactly one200 and one403, with one provider call. Exact five-minute expiry rejects reuse. |
| Native/session commands | Native returns bearer token, null CSRF and no Set-Cookie. Own-session pagination/optional total, cross-account denial, repeated target revocation, five-minute reauthentication boundary and revoke-all verified. |
| Request safety | Duplicate/malformed/trailing JSON400, independent invalid fields422 with ordered safe paths, size413, wrong media415, unknown fields422, mixed credentials400, bad Origin403 and allowed credentialed CORS preflight checked. Server request IDs are UUIDv7 and problems contain no submitted secrets. |
| Isolation and activity | Authentication route inaccessible on management listener; unimplemented route remains404. Background session reads do not extend expiry. Existing current-account/state/role/session tests continue to pass. |
| Abuse/retention |120 requests/account/minute shared across devices;60 writes/account/minute also covers active logout; rejected logout does not revoke. Exact rolling-window boundary permits retry. Bootstrap30/source/15minutes and Retry-After checked. Cleanup preserves fresh nonce/attempt while removing expired/old rows under a restricted runtime role. |
| Upgrade | Applying marker5 revokes prior browser sessions and preserves native sessions; repeated migration is harmless. Existing empty/schema-mismatch/unavailable-database startup checks remain passing. |

All HTTP traffic used a real loopback application listener and PostgreSQL18.6; the provider is a test-only fixture. MockMvc separately checks input rejection before provider/nonce calls. Browser cookie attributes and transport semantics are exercised through server HTTP responses, not an actual frontend or browser engine.

Separate review corrections: reject pre-auth cookies on bearer requests, apply shared per-account read/write limits, preserve source-limited logout replay without allowing retired credentials to exhaust active-account allowance, reject bodies on no-body commands and invalid Unicode surrogate password input. An explicit upgrade regression was added after the first passing HTTP suites because existing browser sessions must be revoked by this representation change. The final suite includes it.

### Build and artifact checks

Workspace Temurin25.0.4.1+1 and Maven3.10.0; Boot4.1.1 with approved Tomcat11.0.26/Jackson3.1.7 unchanged. No new dependency. CycloneDX inventory remains97 runtime components, all with license metadata.

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `fd8e133be2e0d777f424d2d15e9228db6e08a29d1aef5e7f963015a1042af55c` |
| Local narudzbine-backend:vs01-http image | `3f4c718bd71505debb47e91dfcf5e7e0b46fae387ca658a2ec627290c8089611` |

The packaged image passed controlled migration and read-only nonroot startup with dropped capabilities, bounded temporary filesystem and no-new-privileges. Private readiness200, public diagnostics404 and unimplemented business route404. Disposable containers/network removed. The final test-only upgrade addition did not change the JAR hash, so the same packaged/scanned image remains applicable; no claim of cross-platform reproducibility.

Trivy0.76.0: zero source secrets, zero Java advisories in SBOM and independent image scans, zero HIGH/CRITICAL image findings. The unchanged Ubuntu24.04 base retains26 MEDIUM and4 LOW findings, unsuppressed, tracked in [foundation evidence](../platform/foundation.md#verification). Generated reports are BE/target/http-secrets.json, http-dependency-vulnerabilities.json, http-container-vulnerabilities.json, bom.json and Surefire/Failsafe reports. Ignored .tools contains build/scanner/smoke logs. Existing tool warnings remain documented; no failing check was converted to a skip.

Contract/register verification:208 operations,204 schemas,2,951 resolved internal references,625 question IDs,545 decision IDs,543 requirement IDs/trace rows, zero structural/register/link errors. The two additional references describe login413/415 responses. This check is structural, not complete OpenAPI meta-schema or endpoint coverage.

### Remaining gates

Default HTTP/provider activation remains off. Live FusionAuth credentials, provider conformance G-02, hosted TLS/proxy/source-address conformance G-03 and actual web/mobile integration are not verified. The loopback fixture tests do not prove Secure-cookie handling by a browser or live managed-password behavior. No provider provisioning, deployment, purchase, merge or remote CI run occurred.

Only seven identity HTTP operations are locally implemented. Remaining reauthentication, password/reset/email/recovery/external-link workflows, own-profile/location/account-management operations, audit/outbox and the remaining business slices are unfinished. Account.homeLocationId is null until location support is delivered. Hosting edge abuse controls and operational monitoring/cleanup acceptance remain production gates. No MFA, organization switching or frontend application change was added.
