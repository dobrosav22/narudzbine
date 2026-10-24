# VS-01 login boundary increment

Historical login-boundary increment. The subsequent [HTTP implementation](AUTH_HTTP_IMPLEMENTATION.md) and [verification](AUTH_HTTP_VERIFICATION.md) supersede its current schema/artifact and unfinished-HTTP statements.

2026-10-17. Authorized P1.1 implementation under D-GOV-005. This increment implements the credential-provider adapter, login coordinator/throttle and browser/native transport policy. It does not yet expose public authentication controllers or provision provider resources.

## Provider and transaction boundary

FusionAuth password verification sends email-only loginIdTypes, applicationId and noJWT=true to the configured HTTPS /api/login endpoint with a tenant-scoped API key and tenant header. No redirect, credential retry, returned provider token, MFA challenge or on-the-fly signup is accepted. Bound response bytes and total call duration. Only a successful active user in the configured tenant/application can produce a verified subject. Unknown/wrong-password and other non-admissible user states fail generically; API-key/configuration/network/malformed-response failures are dependency failures. A password-change-required response never creates an ordinary session; the later reset/change workflow must handle recovery.

Source: [FusionAuth authenticate API](https://fusionauth.io/docs/apis/login/authenticate), checked 2026-10-17. Its404 is invalid credentials;401 is an invalid API key.202/203/212/213 are not ordinary completed login.242 is incompatible MFA configuration, not permission to add MFA or bypass it. Require the returned primary email identity to match the normalized login email and be verified. Prefer identities[].verified; only when identities is absent use the documented legacy email/verified fields. A legacy flag never overrides an unverified modern identity. Real tenant behavior, breach enforcement, residency and provider-side bypass controls still require G-02.

Persist an immutable managed_password_identity mapping from existing local account to tenant/provider-user ID. Lookup the normalized current email and capture security epoch/generation before verification. Call the provider outside any database transaction. Then issue the session in a short transaction with current-state locks, matching the returned immutable subject and checking the current mapping/email/epoch again before commit. Revocation/credential changes while the provider is working prevent issuance. Unknown, unmapped, disabled and wrong-password cases use the same public denial. No password enters a table, outbox or ordinary log.

The five-second future deadline includes response-body completion; the subscriber cancels above65,536 bytes, and the HTTP client has a two-second connection timeout with redirects disabled. No live-provider latency or network conformance result is implied by local fixture tests. The credential_operation_pending barrier denies both session and business authorization while set; the durable credential-change workflow that installs/resolves it remains subsequent work.

## Throttle refinement

Use HMAC-SHA256 keys with a dedicated deployment secret for normalized email and source address. Counters include unknown accounts. A durable attempt reservation counts against the30/source/15-minute rolling limit before any provider call. Five completed failed attempts per address in15 minutes start a1-second cooldown; subsequent failures double it to a30-second maximum. Failed-attempt completion is idempotent. Account/source bucket locks are sorted by hash within their separate throttle transaction; no provider call holds them.429 includes a bounded positive Retry-After. Provider outage consumes the network attempt but does not count as a bad password. No permanent lockout.

The source is the trusted connection address supplied by the server adapter, never a client-provided forwarded header. Hosted proxy normalization/allowlisting remains G-03 before enabling a real listener. Counter retention and cleanup must be wired before exposure; stored keys cannot reveal raw email/IP without the separate HMAC key.

## Transport policy

Reject cookie+Authorization ambiguity, repeated session cookies/Authorization headers, malformed bearer syntax and browser-origin attempts to use the native path. Browser unsafe requests need an exact configured Origin plus session CSRF proof; native requests use a bearer token and no cookie. Session cookies use __Host-narudzbine_session, Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain. Do not return browser session secrets in a JSON body or native session cookies. Secrets in transport objects have redacted string representations.

This policy is tested with server-side request fixtures; it is not a frontend test or proof of a fully wired HTTP endpoint. Pre-auth nonce lifecycle, authenticated CSRF bootstrap, CORS/strict DTO/error mapping and controllers remain subsequent work. Production configuration must provide separate immutable provider IDs, API key, exact origins and throttle key; no fake/default provider or key is supplied by main code.

## Wiring and schema

Schema marker4 appends the immutable provider mapping, credential-operation barrier, HMAC throttle buckets and durable attempts. Ordinary startup rejects older markers; apply the controlled migration first. Existing HTTP routing remains denied. Construct PasswordLoginService, LoginThrottle and FusionAuthPasswordVerifier only after configuration validation in the later security wiring; none is a default Spring bean. The real SessionService and BusinessAccess already honor the pending barrier.

In addition to existing identity/session runtime grants, this coordinator needs SELECT on managed_password_identity and SELECT/INSERT/UPDATE on login_throttle_bucket and login_attempt. It does not need mapping writes or schema ownership. Provisioning and retention grants remain separate. Runtime-role tests exercise these exact boundaries. No extra dependency was introduced.
