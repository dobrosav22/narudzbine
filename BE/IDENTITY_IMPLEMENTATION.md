# VS-01 implementation record

2026-10-16. In progress under approved P1.1 and D-GOV-005. This first increment implements identity persistence and transactional business authorization; it does not enable login or business HTTP routes.

## Persistence refinement

Use an internal account_identity registry for globally unique current normalized emails and immutable BUSINESS/PLATFORM_ADMIN identity kinds. Separate business_account and platform_account rows reference that registry through kind-checked composite foreign keys. Every registry entry must have exactly its matching subtype at commit. This implements R-SEC-030 without duplicate email columns or a user moving between account kinds. Pending email-change reservations and provider mappings will be added with their credential workflows.

Business accounts retain an immutable organization_id. Completed organizations require their first owner in the same transaction, with immutable country/type and matching currency/address country. No provisional organization is persisted here; setup intents belong to the invitation/provider workflow. A deferred unique constraint and commit-time owner validation preserve exactly one active owner while allowing an atomic transfer. These constraints do not themselves authorize a transfer: acceptance, fresh authentication, audit and session revocation remain required in the future command service.

Hard deletion of these identity records is denied by database triggers; deactivation/closure preserves attribution and identifiers. Privacy redaction must use a separately reviewed procedure, not delete/reinsert to bypass permanent binding. Database normalization of registration identifiers uses ASCII-only grammar and lowercase under explicit C collation, independent of host locale; full API text/email validation remains in the owning workflow.

## Authorization refinement

BusinessAccess requires an existing writable transaction. The authenticated account ID is supplied only by trusted server authentication, never treated as a public authentication mechanism. Organization membership is resolved from that ID. Lock organization FOR SHARE, then its business_account row, then account_identity FOR SHARE. Check current organization state, account state/email verification and role under these locks; all are retained until transaction completion. Validate requested organization/country against the derived context before returning a scope. Missing/inaccessible scope has a uniform denial.

No authorization cache or session-role snapshot grants access. Future management commands take exclusive locks in the same order, including account rows in UUID order for multi-account commands. Commercial services consume the returned scope within that same transaction; no HTTP endpoint or provider authentication bypass is exposed by this increment. The role capability check is only one layer: object access, relationship state, ownership acceptance, fresh proof, auditing and operation-specific conditions remain mandatory.

Implementation uses explicit parameterized SQL for the locking reads and Flyway constraints. JPA remains available for ordinary aggregate persistence; repositories/entities stay module-private. No dependency or provider is added.

Primary references for the selected mechanism: [PostgreSQL row locks](https://www.postgresql.org/docs/18/explicit-locking.html) and [deferred constraint triggers](https://www.postgresql.org/docs/18/trigger-definition.html). Actual race and commit-failure evidence is recorded in [IDENTITY_VERIFICATION.md](IDENTITY_VERIFICATION.md).

## Remaining VS-01 work

The internal opaque session store is implemented below. The subsequent [login increment](LOGIN_IMPLEMENTATION.md) adds the provider port/adapter, local login coordinator/throttling and transport policy. Full HTTP CSRF/browser/native integration, credential/reset/email/link/recovery workflows, own profiles/locations, management commands with audit/outbox and ownership acceptance remain unfinished. Real-provider conformance additionally depends on X-02/G-02. No application MFA, account switching, self-registration or personal permission toggles are introduced.

## Session increment,2026-10-17

Implement the local session store before exposing authentication endpoints. Internal password-proof input represents a successfully verified provider result, bound to account/security epoch/credential generation; it is never a public request DTO. Accept it for at most60 seconds, reject future/stale proof, and recheck active verified account and organization under locks before issuing or rotating. No provider adapter or callable login route is supplied by this increment.

Session operations lock the original organization and membership, then the account registry exclusively, then session rows. This serializes caps, revocation and rotation for an account. It deliberately trades per-account concurrency for correctness at pilot scale. Session authentication and business authorization must join the same command transaction; only a successfully completed qualifying command records activity, in that transaction. Polling/background classification is a server responsibility in the later HTTP adapter.

Persist only SHA-256 digests of independently generated32-byte session and browser-CSRF secrets. Redact credential objects' string representations. Equality at idle/absolute expiry means expired; background requests do not extend either lifetime. Reauthentication keeps logical session ID/creation/absolute expiry, replaces both secrets without grace and records fresh password proof. Stable cap eviction order is createdAt then ID ascending; validate proof before any eviction. Only current active, unexpired, current-epoch/current-generation sessions count toward caps.

UUIDv7 IDs use the RFC9562 timestamp/random layout with SecureRandom; secrets are independent random values, not UUIDs. See [RFC9562 section5.7](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.7). HTTP cookie/Origin/CORS/pre-auth CSRF, external methods and credential-operation barriers remain subsequent work; all HTTP business/auth routes stay denied in this increment.

The local session list uses createdAt descending/ID ascending; eviction independently uses oldest-created/ID ascending. Both timestamps and verified-proof comparisons use millisecond precision. Session services currently issue password-authenticated sessions only; EXTERNAL storage is reserved for the later verified external-link workflow and is not an authentication shortcut. Request correlation now uses the same approved UUIDv7 primitive.

## Runtime grants and schema compatibility

Current compatibility marker is5 after the [HTTP authentication increment](AUTH_HTTP_IMPLEMENTATION.md). Apply all appended identity/session/login/bootstrap migrations through the controlled migration command; ordinary startup rejects older markers. Existing migration files were not rewritten after a release (there has been no backend release). The tests also exercise upgrade from the VS-00 foundation migration.

The current HTTP shell still needs only the VS-00 read grants. Before invoking identity services with the restricted runtime role, grant SELECT/UPDATE on organization, business_account and account_identity (PostgreSQL row-locking reads require UPDATE privilege), plus SELECT/INSERT/UPDATE on application_session. Runtime still does not own tables/schema or receive DDL. DELETE on identity tables remains prohibited; future retention uses separately scoped grants for expired sessions. Real environment role names/grant automation belong to the controlled deployment setup, not hard-coded migration users. Tests execute authorization and session services with these limited roles, and exercise the Spring-managed JPA transaction boundary as well as direct JDBC transactions.
