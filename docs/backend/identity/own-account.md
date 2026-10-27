# VS-01 own account and language increment

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/OWN_ACCOUNT_IMPLEMENTATION.md`: VS-01 own account and language increment._

2026-10-17. Delegated refinement under D-GOV-005/P1.1. Implement GET /api/v1/me and PATCH /api/v1/me/language from the approved contract. PUT /me remains disabled until home-location selection can be validated against implemented location support; no partial display-name-only replacement is exposed.

Both operations resolve the account solely from the current session and enforce current account/organization state. Share existing account read/write throttles. Browser mutations require exact Origin and session CSRF; native bearer rejects browser credentials/Origin. Only these method/path combinations enter the enabled security chain. Existing explicit activation remains required.

Language patch requires the account's current authenticated revision. Compare under the same account lock used for mutation, before no-op comparison; wrong-account, forged and stale revisions fail409 REVISION_CONFLICT without revealing current data. No separate retry key: after response loss, GET /me and compare current state before an explicit fresh-revision save. Omitted languageOverride preserves its value; explicit null resets inheritance. Supported tags are case-insensitive ASCII inputs, returned/stored in canonical form; whitespace, short aliases and underscore aliases are rejected. Unchanged/omitted values preserve account revision/update time and create no change audit.

Successful changes update language_override, increment account revision and append ACCOUNT_LANGUAGE_CHANGED with changed field name only, in one transaction. Audit failure rolls back everything. Preserve identity/email/role/country/currency/security epoch and sessions. GET /me is background-safe bootstrap and does not extend idle activity. An explicit successful language command, including a valid no-op, records qualifying activity; failure does not. Absolute session expiry never changes.

Schema7 expands audit action/resource constraints and replaces the fixed database locale enumeration with bounded tag syntax (64 characters). The reviewed launch roster remains en, sr-Latn-RS, bs-Latn-BA in a version-controlled resource. All locale writes must validate that roster. Adding a language requires configuration/resources and corresponding contract review, not another domain/schema change. This corrects the foundation's enum constraint to honor R-LOC-001. Existing values remain canonical and unchanged. Locale resolution/rendering, notification preference endpoints and outbound queues remain later work; saved null represents inheritance and does not silently become English.

Validation targets include revision/no-op/null semantics, two simultaneous edits with one winner, audit rollback, tenant/current-state isolation, CSRF/CORS/transport restrictions, strict bodies and safe field errors, idle behavior, schema6-to7 preservation and an additional configured locale accepted without schema alteration. Runtime grants remain unchanged from schema6.

## Verification

_Originally `BE/OWN_ACCOUNT_VERIFICATION.md`: VS-01 own account and language verification._

Historical increment evidence; [organization settings verification](../organizations/organization.md#verification) records the subsequent current build and schema8 checks.

2026-10-17, Europe/Budapest. Executed local evidence for the [own-account/language increment](#implementation). GET /api/v1/me and PATCH /api/v1/me/language bring the implemented identity/session/account surface to ten operations. VS-01 remains in progress.

### Executed verification

Clean Maven Wrapper verify passed: **89 tests, zero failures, zero errors, zero skips**. Fifteen unit/contract/architecture/MockMvc tests and74 real PostgreSQL integration tests: FoundationIT8, AuthHttpIT19, IdentityBoundariesIT11, PasswordLoginIT15 and SessionServiceIT21.

Eight added real-HTTP/integration scenarios cover own-account projection, canonical language input, omission versus null, unchanged revision/update time, stale and foreign revisions, bounded independent validation errors, strict JSON, payload bounds, unknown fields and unsupported locale aliases. Browser tests exercise exact Origin, CSRF, PATCH preflight, management-listener denial and retained cookies. Concurrent edits using one revision produce exactly one200 and one409, with one change audit. Audit insertion failure rolls back preference/revision/activity. Background account reads do not extend idle expiry; account deactivation and organization suspension deny access.

Every owner/admin/staff role is exercised for buyer and vendor organizations in both RS and BA. Language changes preserve account/email/organization/role/currency and record original country scope. An additional configured fr-FR locale is accepted and stored by a test-only expanded roster without schema alteration; the actual launch roster still rejects it. This proves configuration extensibility, not French translation availability or launch support.

One additional foundation scenario upgrades schema6-to7 while preserving the saved language, both session transports and existing audit history; repeated migration remains safe. Earlier upgrade, audit immutability/lock-order, provider, session, throttle and authorization scenarios continue to pass. Review confirmed that final authorization, revision comparison, preference/audit writes, qualifying activity and response projection share the command transaction; provider calls are not involved in these two operations.

### Artifacts and checks

Schema marker7 requires controlled migration; runtime grants are unchanged from schema6. No dependencies changed. Temurin25.0.4.1+1, Maven3.10.0, Boot4.1.1 and approved Tomcat11.0.26/Jackson BOM3.1.7 remain unchanged. CycloneDX inventory contains97 runtime components, all with license metadata.

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `bc6d9a4757d1fb01627754668f4420e957a4a7b8f3eb276a1b72576d6fa64b3e` |
| Local narudzbine-backend:vs01-account image | `9caf208fa77c7c4f9ed88975e657e9be0db8d0a7dfed325c409f4a17aca4a6b2` |

Packaged controlled migration and Linux read-only nonroot startup passed. Private readiness200; public diagnostics404; unimplemented business route404. Disposable containers/network were removed. Packaged smoke uses default configuration; enabled endpoints are tested through the real loopback JVM HTTP server with restricted database grants and a test-only password-provider fixture.

Trivy0.76.0 found zero source secrets and zero Java advisories in both generated SBOM and independent image scans. The image has zero HIGH/CRITICAL findings; the unchanged Ubuntu24.04 base retains26 MEDIUM and4 LOW findings without suppressions. Scans use the cached vulnerability database updated2026-10-16, downloaded2026-10-17; a newly refreshed feed is not claimed.

Generated evidence: BE/target/account-secrets.json, account-dependency-vulnerabilities.json, account-container-vulnerabilities.json, bom.json and Surefire/Failsafe reports. Ignored .tools contains vs01-account-verify.log, account scanner/image-build logs and vs01-account-container-smoke-result.json. OpenAPI descriptions and413/415 references were refined after its Maven contract check; separate final structural/register/link checks cover those documentation changes.

### Remaining scope

Default HTTP/provider activation remains off. PUT /me, home-location selection, display-name editing, organization/location management, notification preferences, outbound locale resolution/rendering, credential workflows and outbox delivery remain unfinished. Account.homeLocationId remains null. Full audit readers/archive/retention and live-provider/hosting/client/restore gates remain open. No provider provisioning, purchase, deployment, remote CI, push, merge or frontend application change occurred.
