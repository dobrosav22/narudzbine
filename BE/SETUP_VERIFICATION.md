# Organization setup verification

2026-10-18, Europe/Budapest. [Implementation and configuration](SETUP_IMPLEMENTATION.md). Six setup-purpose operations extend configured coverage from51 to57. Shared invitation routes do not yet implement MEMBER/TRADING purposes or organization invitation lists. VS-01 and VS-02 are not declared complete; actual provider/delivery/operator/client gates remain open.

## Executed checks

Final unfiltered Maven Wrapper verify passed: **260 tests, zero failures/errors/skips**.40 unit/contract/architecture/MockMvc checks and220 real PostgreSQL integration tests: FoundationIT19, AuthHttpIT153, IdentityBoundariesIT11, PasswordLoginIT15 and SessionServiceIT22. The approved Java25/Maven3.10 wrapper/settings/local-cache command ran without test filters; final ignored log .tools/setup-release-verify.log and XML reports under BE/target. No executable/schema/test/build changes followed the final gate.

Focused setup/upgrade and unit checks passed before the full gate. The initial unfiltered run exercised260 tests and found four setup failures not reproduced in the focused run; a second unfiltered run found three and the targeted FoundationIT+AuthHttpIT reproduction found two. These exposed a missing runtime grant as explained below. The final gate result is recorded separately. No skipped infrastructure is treated as success.

Eighteen setup HTTP groups exercise RS/BA and BUYER/VENDOR creation; one original verified owner and usable managed-password mapping; pinned vendor plans and retirement; no setup session; unchanged-password replay; duplicate invitation intent; current sender authority; revocation and exact expiry; generic public proof with strict browser/native transport; latest-only mailbox proof/renewal; explicit keyed resend/generation invalidation/replay expiry; concurrent requests; actual email guard waits with Clock expiry; global email and registration claims including stale email reservations; unknown provider outcomes/read-only reconciliation; definitive rejection/fresh proof; atomic final rollback retaining APPLIED; and revoked/expired/deactivated authority retaining BLOCKED holds.

Four adapter unit groups check exact candidate/tenant/application/email/marker and registration confirmation, bounded response/no returned credentials, definitive policy rejection versus uncertainty and positive GET-only reconciliation. Envelope checks enforce delivery-ID/purpose separation. FoundationIT verifies schema17-to18 preservation, immutable plan seed limits and no fabricated plan assignments/intents for existing accounts. Synthetic provider fixtures prove local behavior only, not G-02.

## Separate review

A deliberate review of permissions, transaction boundaries, expiry, replay and contract scope found deadline checks needed after claim-lock waits and current account authorization needed in the concurrent completed-setup branch. Both were corrected and regression scenarios added. Shared route descriptions now state their implemented purpose scope. A further browser review found missing CORS mappings for the setup routes and the resend key header; explicit mappings and actual preflight/response-header assertions were added. The complete HTTP fixture passed on diagnostic rerun; temporary SQL diagnostics were removed. Broader reproduction identified the generic503 cause: missing runtime SELECT on platform_account in the existing deferred account-subtype constraint. SQL expression/plan evaluation can require that permission even for BUSINESS inserts. The runtime fixture and deployment grant instructions were corrected; temporary diagnostics were removed. No admin invitation list, default delivery location, external-first initial binding or provider verification fact was invented.

## Packaged artifact and security

The packaged schema18 migration and read-only, nonroot Linux startup passed against isolated PostgreSQL containers. Private readiness200; public diagnostics/unrelated API and default-disabled email/external/recovery/setup routes404. Temporary app/database/network were cleaned up. Local smoke script .tools/vs02_setup_container_smoke.py and result JSON are ignored local evidence, not deployed infrastructure.

Final local image narudzbine-backend:vs02-setup, ID sha256:c33d6ea0b59309ba100871b8b5d609fe782d8017d671f17fa6ab1a72933e82b1; packaged JAR SHA-256 4187a7778d734ad2a5718df98006b7c54baec7eaf00404ab5581c71f595b050b. Replacement image migration/startup/default-disabled-route checks passed after the CORS correction and removal of temporary diagnostics. Artifact identifiers match the image scan.

Trivy0.76.0 offline source-secret scan found0 secrets. New image scan matched that image ID:0 Java/HIGH/CRITICAL findings; existing Ubuntu26 MEDIUM/4 LOW remain. Cached advisory DB updated2026-10-16/downloaded2026-10-17; this is not fresh online advisory evidence. SBOM contains110 runtime components, all with license metadata. Dependencies/base image unchanged; prior separate SBOM vulnerability/resolution evidence is reused without claiming a new independent scan. No suppressions, purchases, publishing or deployments.

## Remaining acceptance

Delivery intents are QUEUED, not actual mail. Real provider setup conformance defaults false and must be proven alongside prior identity lifecycle checks. Protected-operation metadata, verified intended registration, common/compromised password policy, no unsolicited provider emails/tokens and read-only reconciliation remain G-02. Workers/rendering G-04, named operators X-05 and externally owned web/Android/iOS integration remain open. Unknown/blocked claim resolution is assisted and reviewed; no blind retry, automatic expiry/clear or remote deletion is authorized. External-only initial binding remains outstanding under the current password-required setup contract.

Final document/contract/register/local-link/whitespace checks passed:208 operations,204 schemas,3003 resolved references,625 question IDs,545 decision IDs and543 requirement/trace rows. These are structural checks, not provider/client acceptance or an independent full OpenAPI meta-schema validation. Changes remain local/uncommitted.
