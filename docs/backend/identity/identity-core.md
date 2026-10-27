# VS-01 implementation record

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/IDENTITY_IMPLEMENTATION.md`: VS-01 implementation record._

2026-10-16. In progress under approved P1.1 and D-GOV-005. This first increment implements identity persistence and transactional business authorization; it does not enable login or business HTTP routes.

### Persistence refinement

Use an internal account_identity registry for globally unique current normalized emails and immutable BUSINESS/PLATFORM_ADMIN identity kinds. Separate business_account and platform_account rows reference that registry through kind-checked composite foreign keys. Every registry entry must have exactly its matching subtype at commit. This implements R-SEC-030 without duplicate email columns or a user moving between account kinds. Pending email-change reservations and provider mappings will be added with their credential workflows.

Business accounts retain an immutable organization_id. Completed organizations require their first owner in the same transaction, with immutable country/type and matching currency/address country. No provisional organization is persisted here; setup intents belong to the invitation/provider workflow. A deferred unique constraint and commit-time owner validation preserve exactly one active owner while allowing an atomic transfer. These constraints do not themselves authorize a transfer: acceptance, fresh authentication, audit and session revocation remain required in the future command service.

Hard deletion of these identity records is denied by database triggers; deactivation/closure preserves attribution and identifiers. Privacy redaction must use a separately reviewed procedure, not delete/reinsert to bypass permanent binding. Database normalization of registration identifiers uses ASCII-only grammar and lowercase under explicit C collation, independent of host locale; full API text/email validation remains in the owning workflow.

### Authorization refinement

BusinessAccess requires an existing writable transaction. The authenticated account ID is supplied only by trusted server authentication, never treated as a public authentication mechanism. Organization membership is resolved from that ID. Lock organization FOR SHARE, then its business_account row, then account_identity FOR SHARE. Check current organization state, account state/email verification and role under these locks; all are retained until transaction completion. Validate requested organization/country against the derived context before returning a scope. Missing/inaccessible scope has a uniform denial.

No authorization cache or session-role snapshot grants access. Future management commands take exclusive locks in the same order, including account rows in UUID order for multi-account commands. Commercial services consume the returned scope within that same transaction; no HTTP endpoint or provider authentication bypass is exposed by this increment. The role capability check is only one layer: object access, relationship state, ownership acceptance, fresh proof, auditing and operation-specific conditions remain mandatory.

Implementation uses explicit parameterized SQL for the locking reads and Flyway constraints. JPA remains available for ordinary aggregate persistence; repositories/entities stay module-private. No dependency or provider is added.

Primary references for the selected mechanism: [PostgreSQL row locks](https://www.postgresql.org/docs/18/explicit-locking.html) and [deferred constraint triggers](https://www.postgresql.org/docs/18/trigger-definition.html). Actual race and commit-failure evidence is recorded in [IDENTITY_VERIFICATION.md](#verification).

### Remaining VS-01 work

The internal opaque session store is implemented below. The subsequent [login increment](login.md#implementation) adds the provider port/adapter, local login coordinator/throttling and transport policy. Full HTTP CSRF/browser/native integration, credential/reset/email/link/recovery workflows, own profiles/locations, management commands with audit/outbox and ownership acceptance remain unfinished. Real-provider conformance additionally depends on X-02/G-02. No application MFA, account switching, self-registration or personal permission toggles are introduced.

### Session increment,2026-10-17

Implement the local session store before exposing authentication endpoints. Internal password-proof input represents a successfully verified provider result, bound to account/security epoch/credential generation; it is never a public request DTO. Accept it for at most60 seconds, reject future/stale proof, and recheck active verified account and organization under locks before issuing or rotating. No provider adapter or callable login route is supplied by this increment.

Session operations lock the original organization and membership, then the account registry exclusively, then session rows. This serializes caps, revocation and rotation for an account. It deliberately trades per-account concurrency for correctness at pilot scale. Session authentication and business authorization must join the same command transaction; only a successfully completed qualifying command records activity, in that transaction. Polling/background classification is a server responsibility in the later HTTP adapter.

Persist only SHA-256 digests of independently generated32-byte session and browser-CSRF secrets. Redact credential objects' string representations. Equality at idle/absolute expiry means expired; background requests do not extend either lifetime. Reauthentication keeps logical session ID/creation/absolute expiry, replaces both secrets without grace and records fresh password proof. Stable cap eviction order is createdAt then ID ascending; validate proof before any eviction. Only current active, unexpired, current-epoch/current-generation sessions count toward caps.

UUIDv7 IDs use the RFC9562 timestamp/random layout with SecureRandom; secrets are independent random values, not UUIDs. See [RFC9562 section5.7](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.7). HTTP cookie/Origin/CORS/pre-auth CSRF, external methods and credential-operation barriers remain subsequent work; all HTTP business/auth routes stay denied in this increment.

The local session list uses createdAt descending/ID ascending; eviction independently uses oldest-created/ID ascending. Both timestamps and verified-proof comparisons use millisecond precision. Session services currently issue password-authenticated sessions only; EXTERNAL storage is reserved for the later verified external-link workflow and is not an authentication shortcut. Request correlation now uses the same approved UUIDv7 primitive.

### Runtime grants and schema compatibility

Current compatibility marker is5 after the [HTTP authentication increment](auth-http.md#implementation). Apply all appended identity/session/login/bootstrap migrations through the controlled migration command; ordinary startup rejects older markers. Existing migration files were not rewritten after a release (there has been no backend release). The tests also exercise upgrade from the VS-00 foundation migration.

The current HTTP shell still needs only the VS-00 read grants. Before invoking identity services with the restricted runtime role, grant SELECT/UPDATE on organization, business_account and account_identity (PostgreSQL row-locking reads require UPDATE privilege), plus SELECT/INSERT/UPDATE on application_session. Runtime still does not own tables/schema or receive DDL. DELETE on identity tables remains prohibited; future retention uses separately scoped grants for expired sessions. Real environment role names/grant automation belong to the controlled deployment setup, not hard-coded migration users. Tests execute authorization and session services with these limited roles, and exercise the Spring-managed JPA transaction boundary as well as direct JDBC transactions.

## Verification

_Originally `BE/IDENTITY_VERIFICATION.md`: VS-01 identity and session increment verification._

2026-10-17, Europe/Budapest. This is historical executed evidence for the identity/session increment, not completion of VS-01 or acceptance of live authentication. The subsequent [login verification](login.md#verification) records the current build and supersedes the unfinished-provider/barrier statements below. The approved P1.1 contract remains the target. [Implementation boundaries](#implementation) explain the refinements and unfinished workflows.

### Executed results

Final Maven Wrapper verify passed with **34 tests, zero failures, zero errors and zero skips**: four unit/architecture/contract tests, five FoundationIT tests, eleven IdentityBoundariesIT tests and fourteen SessionServiceIT tests. A clean build also passed before the final session-list ordering correction; the final verify recompiled/repackaged that correction and reran the full suite. PostgreSQL18.6 was exercised in disposable Docker containers, with no H2 substitution.

| Area | Tested behavior |
|---|---|
| Permanent identity | Business-account organization and ID cannot change or be deleted/recreated; platform identities cannot become business memberships; incomplete subtype creation fails at commit. |
| Country and organization | Country/type stay immutable, currency/address country must agree, closed organizations cannot ordinarily reopen, registration uniqueness is scoped by country/type and retained after closure. |
| Owner coherence | Setup needs one verified active same-organization owner; extra/missing/inactive owners fail; atomic same-organization pointer/role swap succeeds. This tests the invariant, not the unimplemented acceptance workflow. |
| Global current email | Business/platform collisions and reuse of an inactive account's current email fail. Two concurrent claims yield one committed account and one unique-constraint rejection. |
| Current authorization | Wrong organization/country, unknown/platform account, deactivated/pending account and suspended/closed organization are denied. Vendor staff edit capabilities are uniform; buyer staff restriction applies to all staff while preparation remains allowed. Owner/admin/staff management differences are checked. |
| Revocation concurrency | A successful authorization transaction holds organization/account/membership locks. Concurrent state/role changes hit the test lock deadline; after commit, the same changes succeed and subsequent authorization rejects the removed permission. |
| Opaque sessions | Independent random session/CSRF secrets, digest-only storage and redacted credential string representations; transport mismatch, missing/malformed credential and invalid CSRF denied. UUIDv7 version/variant/timestamp verified. |
| Lifetimes and activity | Exact seven-day/30-day business and30-minute/12-hour platform boundaries; background authentication/listing does not extend activity; successful activity is monotonic and rolls back with failed business work. Absolute lifetime never extends. |
| Rotation and caps | Secret/CSRF rotation preserves session identity/creation/absolute expiry and immediately rejects old secrets. Concurrent rotation has one winner. Business cap10/platform cap3, oldest eviction only after valid proof, expired rows excluded, concurrent platform logins keep cap3. |
| Revocation and current state | Current logout leaves other devices active; revoke-all affects only the authenticated account; cross-account target revocation is denied. Epoch/generation/account/organization changes invalidate existing sessions. Database rejects session reassignment, lifetime extension and revocation reversal. |
| Spring wiring | The real Spring-managed service requires an existing transaction; its JDBC session write rolls back with the JPA-managed command transaction, using a restricted runtime database role. |
| Migration/runtime | Upgrade from the VS-00 foundation migration, clean/repeated migration, rejection before schema upgrade, incompatible/empty/unavailable database startup failure, runtime readiness loss and private/public listener separation. Current schema marker3. |

Review corrections included explicit C collation for ASCII uniqueness, authorization under restricted database roles, millisecond proof-time comparison, session-list ordering, UUIDv7 request IDs, concurrent rotation and Spring/JPA transaction coverage. No provider proof is fabricated as a live result: tests construct synthetic server-side password proofs solely to exercise the local store. Authentication/provider HTTP routes remain denied.

### Build, container and scans

Final build from BE: `./mvnw.cmd -B -ntp -s .mvn/settings.xml verify`, with workspace Temurin25.0.4.1+1 and Maven3.10.0. Local invocation also set JAVA_HOME and ignored workspace caches. Boot4.1.1, approved Tomcat11.0.26 and Jackson BOM3.1.7 remain; no dependency was added. Runtime CycloneDX inventory still contains97 components, all with license metadata. Effective POM/dependency tree were captured during the reviewed clean build; dependency inputs did not change afterward.

Built `narudzbine-backend:vs01-identity` from the tested JAR. An isolated packaged smoke test ran migrations and started the runtime as UID10001:10001 with read-only filesystem, bounded tmpfs, dropped capabilities and no-new-privileges. Private readiness returned200; public diagnostics and unimplemented business routes returned404. Test containers and network were removed.

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `9a2939b9b73ae27b91e5e038002171cbb231849b3655abb49d4774cc0b8adb9a` |
| Local VS-01 increment image | `52435a4d725320cb530cb06c7c4818950ad2828c7ce3a71108e24a1f72e1305e` |

Trivy0.76.0: source secret scan had zero findings; runtime SBOM and independent image scan had zero Java advisories. Container findings remain26 MEDIUM and4 LOW in the pinned Ubuntu24.04 base, zero HIGH/CRITICAL. No suppression was added. The two advertised medium-severity package fixes and production follow-up remain recorded in [foundation evidence](../platform/foundation.md#verification). Detailed generated reports are in BE/target; local logs/smoke results are in ignored .tools. No cross-platform reproducibility or repeat-build hash claim is made for this increment.

### Not yet verified or delivered

There is no live login, provider adapter, browser cookie/Origin/CORS/pre-auth CSRF integration, native HTTP authentication adapter, external-method login/linking, credential-change barrier, reset/email/recovery workflow, owner acceptance endpoint, own-profile/location API or complete audit/outbox pipeline. These remain VS-01 work. Internal CSRF digest tests are not browser CSRF acceptance. Managed identity conformance additionally requires X-02/G-02; MFA remains outside launch scope.

No hosted deployment, GitHub workflow run, provider sandbox, production security/load test, restore drill or frontend integration was performed. No PR merge/purchase/provisioning is implied. The543 requirement index and208 operation contract are still planned full-release coverage; none of those operations is declared complete solely by this internal increment.
