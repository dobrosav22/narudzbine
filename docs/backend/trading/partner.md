# Partner details implementation

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/PARTNER_IMPLEMENTATION.md`: Partner details implementation._

Delegated refinement under D-GOV-005/D-PLAN-025, 2026-10-19; assistant selections, not new user answers. Backend/infrastructure only.

GET /api/v1/partners/{organizationId} serves the exact approved Partner projection to current active business members of either party, including staff. Self, unrelated/cross-country organizations and platform accounts receive404. Active relationships require an active counterpart and return current approved organization fields plus only the explicitly selected active business contact. No directory, member identity, personal account mailbox, address list, contact label/ID, private administrative reason or commercial content is returned.

The existing organization GET/PUT gains required nullable partnerContactId. Owner/admin may explicitly select one active contact belonging to their organization or clear it; no contact is shared by default. Full PUT still requires current organization revision and every structured setting. Foreign/missing/archived contact selection fails generic422 at /partnerContactId without confirming foreign existence. Archived selected contacts are cleared atomically, increment organization revision and audit only field names; restoring never reshares. Selected contact edits intentionally change the live partner-facing contact, with ordinary current owner/admin permission and audit.

An actual ACTIVE-to-DISCONNECTED transition captures both parties' permitted fields and selected active contacts into immutable relationship-party snapshots, in the same transaction through a database trigger. This is genuine shared connection history, not an invented order/message. Disconnected getPartner reads only the snapshot at the current disconnect revision, even if current counterpart settings/contact/status changed. Reconnection serves current approved data; a later disconnect appends a new snapshot without rewriting older history. Original order/message snapshots will remain independent in later ordering work.

Migration never backfills current directory data as historical snapshots for earlier disconnected rows: absent historical evidence returns404. Existing active rows acquire truthful snapshots on their next real disconnection. Runtime needs SELECT/INSERT on partner_snapshot for the invoker trigger, with no UPDATE/DELETE or historical-backfill API. Organization guards serialize contact/settings/disconnect changes. Snapshot insert failure rolls back the transition/audit/notice. Defensive database checks prevent selecting foreign/archived contacts or archiving a still-selected contact outside the authorized clear-first application workflow.

Schema22 and current contract preserve all other boundaries. No new providers, dependencies, credentials, worker or frontend changes. Both existing identity HTTP/setup flags gate partner route; default off. Administrative current-revision metadata reads and plan management are separate future management work. Historical order integration, delivery workers/provider/client gates remain unverified.

### Distinct review and operational grants

Separate review reread party authorization, one-statement live/historical projections, fixed DTO fields, revision/selection/archive behavior, invoker trigger provenance, grants, rollback and concurrency tests. Selection validation now locks the active contact FOR SHARE defensively; application writes already acquire the organization guard first. The archive path uses one Clock timestamp for its contact/organization updates. Explicit PostgreSQL blocking-chain tests cover simultaneous selection/archive and an edit committed while disconnect waits. Focused checks passed after these refinements.

Schema22 V20261019120000__partner_details.sql preserves prior relationships/generations/acceptance receipts/notices and defaults every existing/new organization to no shared contact. Runtime adds SELECT/INSERT on partner_snapshot (INSERT is necessary for the invoker transition trigger); no UPDATE/DELETE, schema ownership or direct historical backfill is granted. Snapshot insert guard requires the actual nested transition trigger and matching current relationship revision/party/country/time. No SECURITY DEFINER privilege bypass. Existing organization/contact update privileges cover the explicit selection and archive clearing. Readiness requires22; prior binaries expecting21 require separately proven compatibility before rollback, otherwise use reviewed forward repair.

## Verification

_Originally `BE/PARTNER_VERIFICATION.md`: Partner details verification._

2026-10-19, local backend/infrastructure only. [Implementation, delegated choices and grants](#implementation).

Focused wrapper gate passed40 unit/contract/architecture/MockMvc checks plus12 real PostgreSQL IT:11 partner HTTP groups and schema21-to22 preservation. Tests cover active staff/admin/owner reads in RS/BA, exact projection field allowlist, explicit selected contact/default null, self/unrelated/foreign/platform/anonymous denial, suspended live counterpart denial, same-org active-contact validation, current revisions and no-op, full PUT field requirement, immutable disconnected contact/identity, reconnect/new disconnect generation, archive clearing/no auto-restore, audit and snapshot insertion rollback, defensive SQL guards, real contact-edit/disconnect and selection/archive contention, browser/CORS/strict GET validation, and legacy missing-history fail-closed behavior followed by a new truthful snapshot. An initial malformed-path assertion was corrected to use a malformed hexadecimal ID within the existing route allowlist; arbitrary unimplemented paths intentionally remain404. A migration fixture compile correction uses the real UUID generator.

Distinct review and refinements are recorded in the implementation note. Historical snapshots are real disconnection context; no orders/messages, privacy deletion procedure, commercial access, ordinary delivery workers, provider/client or hosted acceptance is implemented or inferred. Actual X-01..06/G-01..07 scope remains as recorded; no frontend edits, provider purchase/provisioning, deployment, push or merge.

Final unfiltered gate and packaged artifact evidence follow.

### Final gate and artifact evidence

Final unfiltered Maven Wrapper verify passed **326 tests, zero failures/errors/skips**:40 unit/contract/architecture/MockMvc plus286 real PostgreSQL IT (Foundation23, AuthHttp215, IdentityBoundaries11, PasswordLogin15, SessionService22). Command uses the approved bundled JDK25/Maven3.10 wrapper/settings/local cache without test filters; local final log .tools/partner-final-verify.log. All earlier connection, setup, identity, session/account, location/contact, member/ownership, password/email/external/recovery checks ran. No executable/schema/test/build changes followed the final gate.

Packaged schema22 migration, nonroot read-only Linux startup, private readiness200 and public diagnostics/unrelated/default-disabled routes404 passed in disposable private PostgreSQL/application containers, including getPartner. Containers/network removed. Local script .tools/vs02_partner_container_smoke.py and result JSON. Image narudzbine-backend:vs02-partner; actual image ID sha256:ad4424a08da9a7d6d0e40b2aa45650b1cb12bb69cd4c7c5355d28c3d7cb3cdd7; JAR SHA-256 42048bb267e7880cb37c6545f54f947ab719d1873276c473932f8c1768d787ee. Scan metadata and final JAR hash match the built image/artifact; an image-side sha256sum independently confirms the same JAR.

Trivy0.76.0 changed-content source secrets0. New image scan Java/HIGH/CRITICAL0 using cached databases; existing Ubuntu24.04 base26 MEDIUM/4 LOW remain without suppressions. Advisory database updated2026-10-16/downloaded2026-10-17; Java artifact-identification database updated2026-10-18/downloaded2026-10-19. Neither was refreshed for this batch; no fresh online advisory claim. SBOM110 licensed runtime components; dependencies/base unchanged, prior separate dependency/SBOM resolution/scan evidence reused. No claim of hosted delivery, client verification, clean independent reproducibility build or complete VS-01/02 acceptance.

Structural contract/register/local-link/whitespace checks208 operations,204 schemas,3019 resolved references,625 questions,545 decisions,543 requirement/trace rows passed. Local/uncommitted changes are not a remote backup. External inputs/empirical gates remain open as scoped in PROJECT_STATUS.
