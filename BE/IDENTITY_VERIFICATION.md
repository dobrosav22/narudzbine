# VS-01 identity and session increment verification

2026-10-17, Europe/Budapest. This is historical executed evidence for the identity/session increment, not completion of VS-01 or acceptance of live authentication. The subsequent [login verification](LOGIN_VERIFICATION.md) records the current build and supersedes the unfinished-provider/barrier statements below. The approved P1.1 contract remains the target. [Implementation boundaries](IDENTITY_IMPLEMENTATION.md) explain the refinements and unfinished workflows.

## Executed results

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

## Build, container and scans

Final build from BE: `./mvnw.cmd -B -ntp -s .mvn/settings.xml verify`, with workspace Temurin25.0.4.1+1 and Maven3.10.0. Local invocation also set JAVA_HOME and ignored workspace caches. Boot4.1.1, approved Tomcat11.0.26 and Jackson BOM3.1.7 remain; no dependency was added. Runtime CycloneDX inventory still contains97 components, all with license metadata. Effective POM/dependency tree were captured during the reviewed clean build; dependency inputs did not change afterward.

Built `narudzbine-backend:vs01-identity` from the tested JAR. An isolated packaged smoke test ran migrations and started the runtime as UID10001:10001 with read-only filesystem, bounded tmpfs, dropped capabilities and no-new-privileges. Private readiness returned200; public diagnostics and unimplemented business routes returned404. Test containers and network were removed.

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `9a2939b9b73ae27b91e5e038002171cbb231849b3655abb49d4774cc0b8adb9a` |
| Local VS-01 increment image | `52435a4d725320cb530cb06c7c4818950ad2828c7ce3a71108e24a1f72e1305e` |

Trivy0.76.0: source secret scan had zero findings; runtime SBOM and independent image scan had zero Java advisories. Container findings remain26 MEDIUM and4 LOW in the pinned Ubuntu24.04 base, zero HIGH/CRITICAL. No suppression was added. The two advertised medium-severity package fixes and production follow-up remain recorded in [foundation evidence](FOUNDATION_VERIFICATION.md). Detailed generated reports are in BE/target; local logs/smoke results are in ignored .tools. No cross-platform reproducibility or repeat-build hash claim is made for this increment.

## Not yet verified or delivered

There is no live login, provider adapter, browser cookie/Origin/CORS/pre-auth CSRF integration, native HTTP authentication adapter, external-method login/linking, credential-change barrier, reset/email/recovery workflow, owner acceptance endpoint, own-profile/location API or complete audit/outbox pipeline. These remain VS-01 work. Internal CSRF digest tests are not browser CSRF acceptance. Managed identity conformance additionally requires X-02/G-02; MFA remains outside launch scope.

No hosted deployment, GitHub workflow run, provider sandbox, production security/load test, restore drill or frontend integration was performed. No PR merge/purchase/provisioning is implied. The543 requirement index and208 operation contract are still planned full-release coverage; none of those operations is declared complete solely by this internal increment.
