# VS-01 HTTP authentication increment

2026-10-17. Implementation refinement under D-GOV-005 and approved P1.1. Backend/infrastructure only. Default HTTP activation remains off; live activation still requires G-02 provider and G-03 hosting conformance.

Implement browser bootstrap/login/current CSRF/logout and own-session listing/revocation through the existing opaque-session services. Provider verification stays outside database transactions. Browser requests require exact configured HTTPS Origins, strict JSON and session CSRF on mutations; native requests use bearer transport and cannot carry browser Origin or authentication cookies. Only the explicit implemented method/path set is reachable on the business listener. Management listener and remaining routes stay separate.

CSRF bootstrap refinement: derive a 32-byte HMAC-SHA256 output using the random session secret as the key and a fixed versioned CSRF domain label. Persist only SHA-256 of that output. Possessing CSRF proof does not reveal the random session credential. Bootstrap recomputes and verifies the stored digest without changing it or extending activity. Rotation replaces both tokens. This replaces independently generated random CSRF values solely to support the approved hash-only, stable bootstrap contract. Schema upgrade revokes prior browser sessions; native sessions remain unchanged.

Pre-auth bootstrap creates independent random nonce and HttpOnly __Host-narudzbine_preauth cookie binding, storing hashes only, with five-minute expiry and atomic one-use consumption before credential verification. Bootstrap requires allowed Origin and is throttled separately at30/source/15minutes. Explicit retries after a consumed nonce require another bootstrap. Native login rejects this cookie/nonce. Successful browser login clears it. No passwords or provider bodies enter persistence/logs. Cleanup removes expired nonce rows and throttle attempts older24hours in bounded batches; unused throttle buckets are subsequently removed.

The HTTP layer uses bounded16KiB strict JSON parsing (duplicates, unknown fields and coercion rejected), record DTOs, fixed millisecond UTC timestamp strings, explicit nulls and safe RFC9457 errors. Current account revisions use a separate configured HMAC key bound to account ID/counter. Untrusted forwarded addresses are ignored. Hosting must provide approved source normalization before activation behind a proxy. Invalid or incomplete enabled configuration fails startup. No default provider credential or HMAC secret is supplied.

Logout retry recognizes only an actual stored same-transport session secret, validates stored browser CSRF even after revocation, and repeats the desired revocation without extending activity. Session list/CSRF bootstrap are background reads; session-management commands do not extend session expiry. Revoke-all requires authentication within five minutes. Unknown/expired session secrets do not authorize other operations. Account/credential/organization checks remain in every ordinary authenticated transaction.

Real provider sandbox, complete account-management/audit/outbox workflows, hosted edge abuse controls and hosting configuration remain release gates; local HTTP verification uses a test-only provider fixture.

## Limits, cleanup and local activation

Authenticated session requests share120/account/minute and writes60/account/minute across devices. Admission is durable and precedes a second current-state check in the command transaction; a failed command may consume admission but never records qualifying activity. Logout also has120/source/minute. An already-retired credential can repeat only its stored revocation; this retry consumes the source allowance, not the active account allowance, so a revoked credential cannot exhaust another active session's budget. All source keys are derived from the server connection address, without trusting forwarded headers.

Enable identity.http.enabled only for an authorized configured environment. Required properties: identity.http.origins (exact HTTPS origins), identity.http.throttle-key and identity.http.revision-key (separate base64 secrets, each at least32 random bytes), plus a PasswordCredentialVerifier. Production provider configuration additionally needs identity.provider.enabled=true, identity.provider.endpoint (HTTPS /api/login), identity.provider.tenant, identity.provider.application and identity.provider.api-key. Do not put secret values in tracked files or command-line production arguments. No production provider/default secret bean is enabled implicitly. Tests inject a provider only from test sources. Defaults keep the HTTP routes denied.

Schema6 additionally requires INSERT only on audit_event for atomic session auditing; do not grant runtime audit SELECT/UPDATE/DELETE/TRUNCATE. Runtime grants add SELECT/INSERT/UPDATE/DELETE on pre_auth_nonce and DELETE on login_attempt/login_throttle_bucket to the login increment's grants. Cleanup runs once per minute in bounded batches of1000 with SKIP LOCKED. It removes only expired nonces and attempts older24hours, then unused throttle buckets. Failed work rolls back and a later scheduled run retries. No identity/session rows are deleted by this cleanup.

Review reference: [OWASP CSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). Session binding, unpredictable secrets, explicit Origin checks and rejection of simple/non-JSON login requests inform this implementation. The concrete HMAC derivation is this project's design refinement, not a claim that OWASP specifies this exact construction. Actual browser-client and hosted TLS/proxy acceptance remain external gates.

Current response projection returns homeLocationId=null because own-location management has not been implemented. The account revision is an authenticated resource-bound token; edit/verification workflows remain subsequent work. Supported local routes are seven operations: createPreAuthNonce, login, getCsrfToken, logout, listSessions, revokeSession and revokeAllSessions. Remaining API operations are still denied. Full VS-01 acceptance remains open for credentials/recovery/external links, audit/outbox and account-management workflows.

## Subsequent password reauthentication
[Reauthentication implementation](REAUTH_IMPLEMENTATION.md) adds the eighth local operation with current-session credential proof and immediate rotation. The original seven routes and their behavior above remain; the schema marker stays5. Current verification is in [reauthentication evidence](REAUTH_VERIFICATION.md).

## Subsequent saved locations increment

[Saved locations](LOCATION_IMPLEMENTATION.md) adds six operations, stored homeLocationId projection and bounded expired creation-snapshot compaction. It supersedes the earlier always-null home projection note. [Current verification](LOCATION_VERIFICATION.md) records schema9 and the eighteen-operation configured surface. Full profile selection and real provider/client gates remain unfinished.

## Subsequent profile increment

[Own profile editing](PROFILE_IMPLEMENTATION.md) adds PUT /me display-name/home-location selection with account revisions and archive-safe organization locking. [Current evidence](PROFILE_VERIFICATION.md) records the nineteen-operation configured surface and schema10; runtime grants/configuration are unchanged. Profile edits do not rotate credentials or call the provider.
