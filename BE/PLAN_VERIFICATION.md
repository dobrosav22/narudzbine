# Vendor plan verification

2026-10-19, local backend/infrastructure. [Implementation/decisions/grants](PLAN_IMPLEMENTATION.md).

Reviewed focused wrapper gate passed40 unit/contract/architecture/MockMvc checks and16 PostgreSQL IT (15 plan HTTP groups plus schema22-to23 preservation). Scenarios exercise RS/BA entitlements with no billing fields; exact usage from persisted identity/archival and active connections; same pending target natural identity, different-target conflict, withdrawal/history; approval/rejection/current-revision no-ops; supersession/private direct reason isolation; both downgrade caps, archived restoration and immediate new limits; retirement/pinned assignments; audit/late supersession failure rollback; true duplicate/request-versus-direct/usage-lock races and current manager demotion; suspended platform management without business reactivation; browser CSRF/CORS, scoped queue and strict queries. Migration preserves pinned assignments and partner snapshots, introduces revision1, and fabricates no products/requests.

The first contract check correctly detected the new209th management operation against its old208 inventory. A test HTTP helper then misrouted queried /plans URLs under /auth; it now handles the new prefix consistently. Reviewed focused checks passed after these test corrections and explicit suspended-management/late rollback refinements. No test-infrastructure skip or weakening of cap/authority assertions.

Catalogue identity/archival rows are a genuine persistence prerequisite; no product/SKU/unit/price/activation HTTP or complete catalogue acceptance is claimed. Existing account/provider/setup/trading/order-history integrations, delivery workers, hosted/client/operator acceptance and separately scoped X/G gates remain as documented. No frontend source changes, purchase/provisioning, deployment, push or merge.

Final full gate and packaged artifact evidence follow.

## Final gate and packaged evidence

Final unfiltered Maven Wrapper verify passed **342 tests, zero failures/errors/skips**:40 unit/contract/architecture/MockMvc plus302 real PostgreSQL IT (Foundation24, AuthHttp230, IdentityBoundaries11, PasswordLogin15, SessionService22). Approved bundled JDK25/Maven3.10 wrapper/settings/cache, no filters; local final log .tools/plan-final-verify.log. All earlier identity/account/session, setup/member, partner/contact, password/email/external/recovery and trading checks ran. No executable/schema/test/build changes followed this gate.

Packaged schema23 migration, nonroot read-only Linux startup, private readiness200 and public diagnostics/default-disabled prior and all ten new routes404 passed in disposable private PostgreSQL/application containers, removed afterward. Local script .tools/vs02_plan_container_smoke.py and result JSON. Image narudzbine-backend:vs02-plan; actual ID sha256:05f59ff70a6b001951beb2fe00b4ea86d55ac1dc65108eacf684b9e9395beb62; final JAR SHA-256 6b87ce6f3b36befdefc7c3ac3e2d705d96a7bb2b114e6924f7832054f26b7fe0. Scan metadata matches the image; image-side sha256sum independently matched the final JAR.

Trivy0.76.0 changed-source secret findings0. New image cached scan Java/HIGH/CRITICAL0; existing Ubuntu24.04 base26 MEDIUM/4 LOW remain, no suppressions. Advisory DB updated2026-10-16/downloaded2026-10-17, separate Java identification DB updated2026-10-18/downloaded2026-10-19; neither refreshed for this batch. No fresh online advisory claim. Final SBOM110 licensed runtime components; dependencies/base unchanged, prior separate dependency/SBOM resolution/scan evidence reused. No hosted/provider/delivery/client acceptance or independent clean reproducibility build is inferred.

Structural contract/register/local-link/whitespace checks209 operations,204 schemas,3031 references,625 questions,545 decisions and543 requirement/trace rows passed. Local/uncommitted changes are not remote backup; actual external/empirical gates and full catalogue/slice acceptance remain open.
