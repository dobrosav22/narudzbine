# VS-01 HTTP authentication verification

Historical seven-operation increment. [Reauthentication verification](REAUTH_VERIFICATION.md) records the subsequent eighth operation and current artifacts/test count.

2026-10-17, Europe/Budapest. Actual local evidence for the [HTTP implementation](AUTH_HTTP_IMPLEMENTATION.md), not completion of VS-01 or authorization for live activation. This supersedes the earlier login-boundary artifact/count statements.

## Executed checks

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

## Build and artifact checks

Workspace Temurin25.0.4.1+1 and Maven3.10.0; Boot4.1.1 with approved Tomcat11.0.26/Jackson3.1.7 unchanged. No new dependency. CycloneDX inventory remains97 runtime components, all with license metadata.

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `fd8e133be2e0d777f424d2d15e9228db6e08a29d1aef5e7f963015a1042af55c` |
| Local narudzbine-backend:vs01-http image | `3f4c718bd71505debb47e91dfcf5e7e0b46fae387ca658a2ec627290c8089611` |

The packaged image passed controlled migration and read-only nonroot startup with dropped capabilities, bounded temporary filesystem and no-new-privileges. Private readiness200, public diagnostics404 and unimplemented business route404. Disposable containers/network removed. The final test-only upgrade addition did not change the JAR hash, so the same packaged/scanned image remains applicable; no claim of cross-platform reproducibility.

Trivy0.76.0: zero source secrets, zero Java advisories in SBOM and independent image scans, zero HIGH/CRITICAL image findings. The unchanged Ubuntu24.04 base retains26 MEDIUM and4 LOW findings, unsuppressed, tracked in [foundation evidence](FOUNDATION_VERIFICATION.md). Generated reports are BE/target/http-secrets.json, http-dependency-vulnerabilities.json, http-container-vulnerabilities.json, bom.json and Surefire/Failsafe reports. Ignored .tools contains build/scanner/smoke logs. Existing tool warnings remain documented; no failing check was converted to a skip.

Contract/register verification:208 operations,204 schemas,2,951 resolved internal references,625 question IDs,545 decision IDs,543 requirement IDs/trace rows, zero structural/register/link errors. The two additional references describe login413/415 responses. This check is structural, not complete OpenAPI meta-schema or endpoint coverage.

## Remaining gates

Default HTTP/provider activation remains off. Live FusionAuth credentials, provider conformance G-02, hosted TLS/proxy/source-address conformance G-03 and actual web/mobile integration are not verified. The loopback fixture tests do not prove Secure-cookie handling by a browser or live managed-password behavior. No provider provisioning, deployment, purchase, merge or remote CI run occurred.

Only seven identity HTTP operations are locally implemented. Remaining reauthentication, password/reset/email/recovery/external-link workflows, own-profile/location/account-management operations, audit/outbox and the remaining business slices are unfinished. Account.homeLocationId is null until location support is delivered. Hosting edge abuse controls and operational monitoring/cleanup acceptance remain production gates. No MFA, organization switching or frontend application change was added.
