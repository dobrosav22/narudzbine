# VS-01 saved locations verification

Historical increment evidence; [own profile verification](PROFILE_VERIFICATION.md) records the subsequent current build and schema10 checks.

2026-10-17, Europe/Budapest. Local evidence for the [saved locations increment](LOCATION_IMPLEMENTATION.md). Six list/get/create/update/archive/restore routes bring the implemented surface to18 operations. VS-01 remains in progress.

## Executed tests and review

Final Maven Wrapper verify: **109 tests, zero failures/errors/skips**. Fifteen unit/contract/architecture/MockMvc tests and94 real PostgreSQL integration tests: FoundationIT10, AuthHttpIT36, IdentityBoundariesIT11, PasswordLoginIT15 and SessionServiceIT22. The initial integration attempt failed because Docker was stopped; the installed local engine was started and all required tests ran. No test was skipped or weakened.

Ten additional HTTP scenarios cover both countries, buyer/vendor types and owner/admin/staff scope; foreign/platform denial; strict address/contact/query validation; native/browser transports; CSRF/CORS and management denial; stable offset ordering and optional totals; same-ID simultaneous creation and same-revision update races; original replay after edit/archive; payload mismatch/expiry and bounded snapshot compaction; current role/suspension denial; archive/default clearing and restore identity; no-op preservation; and audit-insertion rollback of location/receipt/default/account-revision effects. The schema8-to9 upgrade test preserves existing preferences, sessions and audit history; repeated migration/readiness pass. Existing organization-first lock-order tests remain green.

The separate review caught a missing R-ORG-031 organization-local name uniqueness rule after the first108-test run. Before acceptance, the implementation gained a materialized NFC/trim/Locale.ROOT-lowercase database unique key across active and archived records. The added regression verifies case/Unicode-equivalent concurrent name collision, archived-name reservation, rename conflict, cross-organization reuse and original creation replay after rename/name reuse. Final109-test verification includes this correction. Review also checked authorization before replay, scoped lookup before revision disclosure, organization-before-account/default locks, original-snapshot cleanup locking, audit atomicity and strict path/query/body handling.

These tests do not claim future order snapshot/submission behavior or a live client/provider integration. Home selection is seeded by fixtures to verify archive clearing; its ordinary profile API remains next work.

## Artifact and runtime evidence

Schema marker9; controlled migration required. Runtime adds SELECT/INSERT/UPDATE on organization_location, SELECT/INSERT and UPDATE(original_snapshot) on location_creation; other grants are unchanged. No dependencies changed; approved Tomcat11.0.26/Jackson BOM3.1.7 overrides remain. The generated inventory contains97 runtime components.

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `14aeb67ad3ff5af55687b3968ee9bbfc4af1cf39484fc26be180ba030839e023` |
| Local narudzbine-backend:vs01-location image | `316c1c056745c91670afb3cbcb5ad67f8bb55df8d044dfc08f99c97b9c10d3da` |

Final image controlled migration and Linux read-only nonroot startup passed. Private readiness200, public diagnostics404 and default-disabled business/location routes404. Disposable smoke containers/network were removed. Enabled API behavior is verified through the loopback JVM server with restricted runtime grants and a test-only provider, not a live provider/browser application.

Trivy0.76.0 found zero source secrets and zero Java advisories in both SBOM and independent final-image scans. Image ID in the report matches the final digest above. Zero HIGH/CRITICAL findings; unchanged Ubuntu24.04 base findings remain26 MEDIUM/4 LOW, with no suppressions. The cached database was updated2026-10-16 and downloaded2026-10-17; no refreshed-feed claim. All97 inventory components have license metadata. Final document checks passed:208 operations,204 schemas,2,968 resolved references,625 questions,545 decisions and543 requirements/trace rows; no link/whitespace/register errors.

Detailed ignored evidence: .tools/vs01-location-final-verify.log, location-image-build.log, scanner logs and vs01-location-container-smoke-result.json; BE/target Surefire/Failsafe reports, bom.json, location-secrets.json, location-dependency-vulnerabilities.json and location-container-vulnerabilities.json. Final structural/register/link checks cover the updated contract and documentation; these are not full OpenAPI meta-schema or live integration validation.

## Remaining scope

Default HTTP/provider activation remains off. PUT /me profile/home-location selection, business contacts, member/setup/admin/credential/recovery workflows, outbox/security notice delivery, order/location snapshots and full audit readers/archive/retention remain unfinished. Live provider/hosting/client/restore gates remain open. No purchase, provisioning, deployment, remote CI, push, merge or frontend application changes occurred.
