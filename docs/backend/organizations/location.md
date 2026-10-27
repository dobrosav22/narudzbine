# VS-01 saved locations increment

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/LOCATION_IMPLEMENTATION.md`: VS-01 saved locations increment._

2026-10-17. Delegated refinement under D-GOV-005/D-PLAN-005. Implement the six approved list/get/create/update/archive/restore operations for the current business organization. Staff may read; owner/admin may manage. Platform and foreign-organization references return404. No permanent deletion or client implementation.

All commands acquire the exclusive organization guard before account/session authorization. Reads hold its shared guard, keeping list rows and optional totals consistent with command writers. List defaults page0/size25; maximum page10000/size100; optional state accepts ACTIVE or ARCHIVED, omission includes both. Reject repeated/unknown query parameters and unsupported sort/filter fields. Order createdAt descending, ID ascending. Read/write successes qualify as session activity.

Create accepts a canonical UUIDv7 resource identity. Normalize complete input before hashing; one immutable creation receipt records creator, organization, SHA-256 digest, original database snapshot and seven-day expiry. Same creator/context/intent replays the original response with200; new creation is201 with Location. Different intent conflicts; foreign creator/context returns404; expired replay returns409 REPLAY_EXPIRED with the authorized resource ID. A unique location ID and INSERT ON CONFLICT serialize cross-organization collisions; no separate Idempotency-Key. Receipt and audit commit with creation. Lifetime tombstone remains; a minute worker compacts at most1000 expired snapshots per transaction, retaining creator/context/hash/expiry tombstones. Stored snapshot is business data subject to the same restricted runtime access as locations.

Updates and lifecycle actions compare a location-domain signed revision after current authorization. Stale revisions return409 with currentRevision, even when desired values already match. Current-revision no-ops preserve revision/time and emit no audit. Archived locations remain readable/editable; only restore makes them active. D-ORG-031/R-ORG-031 require name uniqueness across all retained locations within the organization, including archived records. Use NFC/trim plus Java Locale.ROOT lowercase as a materialized database unique key; accents remain distinct and cross-organization reuse is allowed. Check creation replay before current name availability, so later rename/name reuse cannot destroy the original replay. Collisions return409 DUPLICATE_NAME. Buyer contact required; vendor contact may be null; supplied contact has name/phone and explicit nullable email. Country must match organization. Reuse organization address validation/exact decimals. Plain names are NFC/trimmed; instructions additionally permit newline/tab, normalize CRLF to LF, retain internal formatting, limit2000 code points. Phone follows the approved3..30 character pattern; email uses existing canonical email validation. No geocoding/provider calls.

Schema9 adds locations, immutable creation receipts and nullable business-account home_location_id with a same-organization foreign key. Archive atomically clears affected defaults and increments affected account revisions/timestamps; restore never reinstates defaults. Account projection reads the stored default, while its editing endpoint remains the next increment. Organization locking serializes account changes and archive; future selection must take the same guard and check ACTIVE. Location audit records only allowlisted changed field names; archive also records a homeLocationId field marker when defaults clear. Location/receipt/default/activity/audit failures roll back together. No order tables are changed; snapshot/submission integration remains future work.

Verify both country/type/role boundaries, retries after response loss/edit/archive/expiry, same-ID races, stale writes, no-ops, strict validation/pagination, archive/default clearing, restore identity, permission changes, audit rollback, schema8-to9 preservation, browser CSRF/CORS and default-off/management denial. Profile selection, order snapshots and live provider/client gates remain unfinished.

## Verification

_Originally `BE/LOCATION_VERIFICATION.md`: VS-01 saved locations verification._

Historical increment evidence; [own profile verification](../identity/profile.md#verification) records the subsequent current build and schema10 checks.

2026-10-17, Europe/Budapest. Local evidence for the [saved locations increment](#implementation). Six list/get/create/update/archive/restore routes bring the implemented surface to18 operations. VS-01 remains in progress.

### Executed tests and review

Final Maven Wrapper verify: **109 tests, zero failures/errors/skips**. Fifteen unit/contract/architecture/MockMvc tests and94 real PostgreSQL integration tests: FoundationIT10, AuthHttpIT36, IdentityBoundariesIT11, PasswordLoginIT15 and SessionServiceIT22. The initial integration attempt failed because Docker was stopped; the installed local engine was started and all required tests ran. No test was skipped or weakened.

Ten additional HTTP scenarios cover both countries, buyer/vendor types and owner/admin/staff scope; foreign/platform denial; strict address/contact/query validation; native/browser transports; CSRF/CORS and management denial; stable offset ordering and optional totals; same-ID simultaneous creation and same-revision update races; original replay after edit/archive; payload mismatch/expiry and bounded snapshot compaction; current role/suspension denial; archive/default clearing and restore identity; no-op preservation; and audit-insertion rollback of location/receipt/default/account-revision effects. The schema8-to9 upgrade test preserves existing preferences, sessions and audit history; repeated migration/readiness pass. Existing organization-first lock-order tests remain green.

The separate review caught a missing R-ORG-031 organization-local name uniqueness rule after the first108-test run. Before acceptance, the implementation gained a materialized NFC/trim/Locale.ROOT-lowercase database unique key across active and archived records. The added regression verifies case/Unicode-equivalent concurrent name collision, archived-name reservation, rename conflict, cross-organization reuse and original creation replay after rename/name reuse. Final109-test verification includes this correction. Review also checked authorization before replay, scoped lookup before revision disclosure, organization-before-account/default locks, original-snapshot cleanup locking, audit atomicity and strict path/query/body handling.

These tests do not claim future order snapshot/submission behavior or a live client/provider integration. Home selection is seeded by fixtures to verify archive clearing; its ordinary profile API remains next work.

### Artifact and runtime evidence

Schema marker9; controlled migration required. Runtime adds SELECT/INSERT/UPDATE on organization_location, SELECT/INSERT and UPDATE(original_snapshot) on location_creation; other grants are unchanged. No dependencies changed; approved Tomcat11.0.26/Jackson BOM3.1.7 overrides remain. The generated inventory contains97 runtime components.

| Artifact | SHA-256 |
|---|---|
| Verified JAR | `14aeb67ad3ff5af55687b3968ee9bbfc4af1cf39484fc26be180ba030839e023` |
| Local narudzbine-backend:vs01-location image | `316c1c056745c91670afb3cbcb5ad67f8bb55df8d044dfc08f99c97b9c10d3da` |

Final image controlled migration and Linux read-only nonroot startup passed. Private readiness200, public diagnostics404 and default-disabled business/location routes404. Disposable smoke containers/network were removed. Enabled API behavior is verified through the loopback JVM server with restricted runtime grants and a test-only provider, not a live provider/browser application.

Trivy0.76.0 found zero source secrets and zero Java advisories in both SBOM and independent final-image scans. Image ID in the report matches the final digest above. Zero HIGH/CRITICAL findings; unchanged Ubuntu24.04 base findings remain26 MEDIUM/4 LOW, with no suppressions. The cached database was updated2026-10-16 and downloaded2026-10-17; no refreshed-feed claim. All97 inventory components have license metadata. Final document checks passed:208 operations,204 schemas,2,968 resolved references,625 questions,545 decisions and543 requirements/trace rows; no link/whitespace/register errors.

Detailed ignored evidence: .tools/vs01-location-final-verify.log, location-image-build.log, scanner logs and vs01-location-container-smoke-result.json; BE/target Surefire/Failsafe reports, bom.json, location-secrets.json, location-dependency-vulnerabilities.json and location-container-vulnerabilities.json. Final structural/register/link checks cover the updated contract and documentation; these are not full OpenAPI meta-schema or live integration validation.

### Remaining scope

Default HTTP/provider activation remains off. PUT /me profile/home-location selection, business contacts, member/setup/admin/credential/recovery workflows, outbox/security notice delivery, order/location snapshots and full audit readers/archive/retention remain unfinished. Live provider/hosting/client/restore gates remain open. No purchase, provisioning, deployment, remote CI, push, merge or frontend application changes occurred.
