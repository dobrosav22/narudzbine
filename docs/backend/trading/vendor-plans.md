# Vendor plan implementation

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/PLAN_IMPLEMENTATION.md`: Vendor plan implementation._

2026-10-19, delegated selections under D-GOV-005/D-PLAN-025; assistant choices, not user answers. Backend only.

Implement the nine approved plan catalogue/own-plan/request/withdraw/admin assignment/review routes plus GET /admin/vendors/{vendorId}/plan, a management-only current-revision prerequisite. PlanRequest gains required vendorId so the administrative queue identifies the target. listPlans permits active business and named platform accounts; entitlements contain no billing amount or inferred free price. Assignments use vendor organization ID as natural resource ID, independent vendorplan/v1 revision. Missing assignment fails PLAN_REQUIRED; initial assignment stays authorized setup work.

One pending request per vendor. Same pending target returns the same201 result with no further audit; a different target conflicts until withdrawal/resolution. Requesting the current assigned revision is invalid. Requests pin the available revision; ordinary approval/direct assignment reject a retired target (setup's pinned invitation exception remains). Pending requests may be submitted before a downgrade fits; actual application checks current usage. Current-revision terminal same-action no-ops retain first resolution reason; stale revisions conflict and other terminal actions fail. Actual direct change supersedes pending requests with a generic shared explanation; a same-plan no-op does not resolve pending work. Approval/rejection reasons are shared vendor-safe resolution text; direct assignment reason stays private audit context. No new notification event is invented beyond the approved roster.

Add catalogue_product_identity(id,vendor_id,archived) as a real persisted catalogue identity/archival foundation, not a mock usage counter. No product HTTP, sellable product, SKU/unit/pricing or activation implementation is claimed. Later catalogue creates/restores must use this identity and guard; there are no preexisting products to invent or backfill. All non-archived identities count, regardless of future activation status. Database guards enforce vendor binding, retained identity, current assigned product caps on creation/restoration, and plan updates against real product and active trading counts. Existing active-connection checks remain. No hard-coded zero usage, admin bypass, deletion or forced downgrade.

All committing actions acquire vendor organization guard before actor/account/session/assignment/request locks; current roles/session and CSRF apply after waits. Definitions remain version-controlled immutable revisions; retirement keeps existing assignments pinned. Business/revision/audit effects commit atomically. Bounded pages use one read snapshot. Separate provider/operator/client/delivery gates remain open; default HTTP/setup flags remain off.

### Distinct review refinements

Separate review reread current authority/guard order, plan retirement/pins, both usage counts, pending/terminal request semantics, safe/private reasons, paging and rollback. Platform management is permitted for ACTIVE and SUSPENDED vendors, without reactivating organization/accounts or restoring business access; CLOSED targets are unavailable. Business reads/writes still require active own organization. Review added suspended-management verification and a failure after assignment/audit but before pending supersession, proving whole-transaction rollback. Existing trading fixtures now advance assignment revision for their explicit capacity-correction setup. Contract inventory is209 operations after the management-read prerequisite; the targeted retry-key roster is unchanged.

Schema23 runtime additions: SELECT on catalogue_product_identity; SELECT/INSERT/UPDATE on plan_change_request; UPDATE(revision) on organization_plan alongside existing UPDATE(plan_revision_id). Existing SELECT/UPDATE(retired) on plan_revision permits FOR SHARE row locking, not a new definition-edit API. Product identity has no runtime create/update/delete permission in this batch. Approved catalogue APIs must create its identity and all required SKU/details atomically in later work, and retain/restore using the same vendor guard/cap semantics. No existing product inventory is manufactured. Readiness requires23; binary rollback to an earlier required schema needs separate compatibility proof, otherwise reviewed forward repair. No dependency, provider, key, feature flag, purchase/provisioning or production release change.

## Verification

_Originally `BE/PLAN_VERIFICATION.md`: Vendor plan verification._

2026-10-19, local backend/infrastructure. [Implementation/decisions/grants](#implementation).

Reviewed focused wrapper gate passed40 unit/contract/architecture/MockMvc checks and16 PostgreSQL IT (15 plan HTTP groups plus schema22-to23 preservation). Scenarios exercise RS/BA entitlements with no billing fields; exact usage from persisted identity/archival and active connections; same pending target natural identity, different-target conflict, withdrawal/history; approval/rejection/current-revision no-ops; supersession/private direct reason isolation; both downgrade caps, archived restoration and immediate new limits; retirement/pinned assignments; audit/late supersession failure rollback; true duplicate/request-versus-direct/usage-lock races and current manager demotion; suspended platform management without business reactivation; browser CSRF/CORS, scoped queue and strict queries. Migration preserves pinned assignments and partner snapshots, introduces revision1, and fabricates no products/requests.

The first contract check correctly detected the new209th management operation against its old208 inventory. A test HTTP helper then misrouted queried /plans URLs under /auth; it now handles the new prefix consistently. Reviewed focused checks passed after these test corrections and explicit suspended-management/late rollback refinements. No test-infrastructure skip or weakening of cap/authority assertions.

Catalogue identity/archival rows are a genuine persistence prerequisite; no product/SKU/unit/price/activation HTTP or complete catalogue acceptance is claimed. Existing account/provider/setup/trading/order-history integrations, delivery workers, hosted/client/operator acceptance and separately scoped X/G gates remain as documented. No frontend source changes, purchase/provisioning, deployment, push or merge.

Final full gate and packaged artifact evidence follow.

### Final gate and packaged evidence

Final unfiltered Maven Wrapper verify passed **342 tests, zero failures/errors/skips**:40 unit/contract/architecture/MockMvc plus302 real PostgreSQL IT (Foundation24, AuthHttp230, IdentityBoundaries11, PasswordLogin15, SessionService22). Approved bundled JDK25/Maven3.10 wrapper/settings/cache, no filters; local final log .tools/plan-final-verify.log. All earlier identity/account/session, setup/member, partner/contact, password/email/external/recovery and trading checks ran. No executable/schema/test/build changes followed this gate.

Packaged schema23 migration, nonroot read-only Linux startup, private readiness200 and public diagnostics/default-disabled prior and all ten new routes404 passed in disposable private PostgreSQL/application containers, removed afterward. Local script .tools/vs02_plan_container_smoke.py and result JSON. Image narudzbine-backend:vs02-plan; actual ID sha256:05f59ff70a6b001951beb2fe00b4ea86d55ac1dc65108eacf684b9e9395beb62; final JAR SHA-256 6b87ce6f3b36befdefc7c3ac3e2d705d96a7bb2b114e6924f7832054f26b7fe0. Scan metadata matches the image; image-side sha256sum independently matched the final JAR.

Trivy0.76.0 changed-source secret findings0. New image cached scan Java/HIGH/CRITICAL0; existing Ubuntu24.04 base26 MEDIUM/4 LOW remain, no suppressions. Advisory DB updated2026-10-16/downloaded2026-10-17, separate Java identification DB updated2026-10-18/downloaded2026-10-19; neither refreshed for this batch. No fresh online advisory claim. Final SBOM110 licensed runtime components; dependencies/base unchanged, prior separate dependency/SBOM resolution/scan evidence reused. No hosted/provider/delivery/client acceptance or independent clean reproducibility build is inferred.

Structural contract/register/local-link/whitespace checks209 operations,204 schemas,3031 references,625 questions,545 decisions and543 requirement/trace rows passed. Local/uncommitted changes are not remote backup; actual external/empirical gates and full catalogue/slice acceptance remain open.
