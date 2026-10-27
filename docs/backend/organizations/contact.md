# VS-01 business contacts

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/CONTACT_IMPLEMENTATION.md`: VS-01 business contacts._

2026-10-18. Batch scope: listContacts, createBusinessContact, getBusinessContact, updateBusinessContact, archiveBusinessContact and restoreBusinessContact. Implemented and locally verified; see [executed evidence](#verification). VS-01 remains in progress.

### Implementation refinements

Selected under D-GOV-005 before dependent code: ordinary contact labels and person names may repeat; there is no approved uniqueness rule for business-contact labels. Required label/name/phone and explicit nullable email follow ContactInput/ContactUpdate and the shared text/email rules. These records do not select a delivery contact or alter location contacts. Archived contacts remain readable/editable and may be restored; there is no ordinary delete operation.

Use the established organization-before-account write guard, current owner/admin permission checks, contact-specific revision domain contact/v1, normalized no-op preservation and atomic minimal audit. Reads stay organization-scoped; platform administrative correction/support is a separate future workflow. Lists default to all states, with optional ACTIVE/ARCHIVED filtering, createdAt DESC/id ASC and optional same-snapshot total.

Client UUIDv7 creates retain the original normalized response for seven days, bound to actor/organization/id. Replay returns 200 (new creation 201); payload mismatch conflicts, inaccessible IDs return 404, expired replay returns 409 with the authorized resource reference. Use a domain-separated HMAC-SHA256 create digest with the existing configured revision key, without storing full original intent in tombstones. Compaction clears only expired snapshots in bounded batches and retains identity/digest. The revision key therefore also protects these receipts; rotation must preserve replay comparison capability or wait for receipt expiry and handle retained tombstones explicitly before rotating. No key rotation is implemented by this batch.

Migration adds business_contact/contact_creation and immutable binding/receipt triggers, extends audit action validation and advances schema marker to11. Runtime grants and packaged migration/startup evidence must be updated. Default API/provider activation remains off. Dependencies and provider configuration are unchanged.

## Verification

_Originally `BE/CONTACT_VERIFICATION.md`: VS-01 business-contact verification._

2026-10-18, Europe/Budapest. Local evidence for [business contacts](#implementation). Six new contact operations extend the configured API surface from19 to25 operations. Default HTTP/provider activation remains off; VS-01 is unfinished.

### Executed checks

Final Maven Wrapper verify passed: **129 tests, zero failures/errors/skips**. Fifteen unit/contract/architecture/MockMvc tests plus114 real PostgreSQL integration tests: FoundationIT12, AuthHttpIT54, IdentityBoundariesIT11, PasswordLoginIT15, SessionServiceIT22. Command uses the same approved local toolchain/cache/settings as previous verification: `BE/mvnw.cmd -f BE/pom.xml -B -ntp -s BE/.mvn/settings.xml -Dmaven.repo.local=<workspace>/.tools/m2 verify`. Detailed results: ignored .tools/vs01-contact-final-verify.log and BE/target Surefire/Failsafe XML reports.

Eleven new real-HTTP scenario groups cover both countries, buyer/vendor and owner/admin/staff; full lifecycle, duplicate labels, explicit nullable contact email, normalization and Unicode code-point limits; strict body/query/media parsing; ordered paging and empty-page totals; foreign/platform denial; creator-bound normalized replay with original snapshots after edits/archive; payload mismatch; exact seven-day expiry, compaction and retained tombstones; concurrent duplicate creates and update/archive stale-write conflicts; currentRevision and revision-domain isolation; audit failure rolling back create/receipt/update/archive/activity; CSRF/Origin/CORS and management isolation. A real held organization lock proves a waiting contact command observes a concurrent admin-to-staff reduction before mutation. Response loss is exercised by resubmitting the identical command after disregarding its first result; no network fault proxy is claimed.

Schema10-to11 upgrade regression retains prior account preferences, browser/native sessions and audit history, rejects old-schema readiness, then passes repeat migration and current readiness. Existing clean and older-schema migration tests also pass. The initial verification run had one compaction test-fixture error: setup and application transaction managers were different. It was corrected to use the application's manager; the final full suite passed. No required test was disabled or skipped.

### Separate review

Reviewed the final contact controller, parser, service, migration, audit adapter, security routing and test changes against the six contract operations. Checked server-derived scope, final current-role authorization, organization-before-account locks, normalized revision/no-op behavior, concurrent ID conflict handling, receipt share-lock versus compaction, minimal audit contents, cross-organization 404s and mutation/audit/activity atomicity. Contact-specific validation now collects safe independent ID/revision and ordinary-field errors. List items and optional total are returned by one SQL statement, including empty pages. No remaining blocker was identified in this review; provider, client and full-release acceptance are still unexecuted. This was a separate primary-agent review, not an independent-agent review.

| Operation | Executed evidence |
|---|---|
| listContacts | AuthHttpIT role/scope matrix, state filter, ordered/empty paging, strict query tests; single SQL snapshot reviewed |
| createBusinessContact | AuthHttpIT matrix, replay/expiry, concurrent creates, validation, creator binding, permission race and audit rollback |
| getBusinessContact | AuthHttpIT lifecycle, staff read, foreign/platform denial and browser/management boundaries |
| updateBusinessContact | AuthHttpIT revision/no-op, Unicode/email validation, update/archive race, denied writes and rollback |
| archiveBusinessContact | AuthHttpIT lifecycle/no-op, stale/racing archive, denial, browser CSRF and rollback |
| restoreBusinessContact | AuthHttpIT lifecycle/no-op, stale revision and staff denial |

### Packaged artifact and security evidence

- JAR SHA-256: `d12dba75c885682de20b2743dea4a0e6bfc5168773ae2f31e934f13104d38e79`.
- Local image narudzbine-backend:vs01-contact ID: `sha256:529fb93e5c510a781af2fbb9c6dcf7d4ef22db5dae2f37a29f5ea822a4bd29a3`. Trivy Metadata.ImageID matches docker image inspect. No registry RepoDigest exists; this is a local image identity, not a published release digest.
- Docker build and disposable packaged migration passed. Schema marker11 was asserted; Linux read-only/nonroot startup passed with a separate read-only runtime role and prior readiness restrictions. Private readiness200, public diagnostics404, default-disabled contact routes404. Disposable containers/network were removed by the script. Enabled contact behavior and its minimal runtime DML grants are tested by the real-HTTP suite. Evidence: ignored .tools/contact-image-build.log and .tools/vs01-contact-container-smoke-result.json.
- Trivy0.76.0 source-secret scan: zero findings. New image vulnerability scan: zero Java advisories and zero HIGH/CRITICAL; existing Ubuntu24.04 findings remain26 MEDIUM/4 LOW. Cached advisory DB UpdatedAt2026-10-16, DownloadedAt2026-10-17; no fresh-feed claim. Reports: BE/target/contact-secrets.json and contact-container-vulnerabilities.json; detailed scanner logs under ignored .tools.
- Generated runtime SBOM still contains97 components, all with license metadata. Dependency/build/base-image declarations are unchanged, including approved Tomcat11.0.26/Jackson BOM3.1.7. A separate repeated SBOM vulnerability scan was not run; the new image scan above includes its Java packages. Prior reproducibility evidence is historical; this batch does not claim two-build reproducibility verification.

Contract/register/local-link/whitespace checks are recorded in current project status. They do not prove live integration. Runtime grant/key/compaction instructions are in [operations](../../operations/runbook.md). Real provider/hosting/restore/client gates remain open. No frontend application changes, purchases, provisioning, deployment, push or merge occurred.
