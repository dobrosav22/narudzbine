# P1.1 planning review

Current authority: P1.1 approved for backend/infrastructure implementation on 2026-10-16; VS-00 is locally verified; VS-01 is in progress. See [PROJECT_STATUS.md](PROJECT_STATUS.md). Historical candidate/authorization statements below describe the pre-approval record.
**Independently reviewed candidate updated 2026-10-16. Backend and infrastructure only. No application implementation is authorized.**

The assistant and a specialized independent agent performed the detailed review; [the review report](PLANNING_REVIEW_REPORT.md) records the defects and corrections. The user is not expected to manually audit the full package.

The remaining routine design choices have been selected under your delegation in D-GOV-005. The plan preserves the full approved release scope and permanent account/organization/country boundaries. It uses one Java modular backend with PostgreSQL and managed services, and specifies reproducible checks/runbooks for predominantly AI-led development and operations.

## Review evidence
| Document | Purpose |
|---|---|
| [Detailed design](DESIGN_SPEC.md) | Permissions, domain/storage, transactions, retries, security, catalogue, reporting, retention |
| [OpenAPI](openapi.yaml) and [API index](API_CONTRACT.md) | Concrete operation/request/response contracts and authorization |
| [Implementation sequence](IMPLEMENTATION_PLAN.md) | Small vertical slices, prerequisites and pass criteria |
| [Operations](OPERATIONS_RUNBOOK.md) | Providers/costs, configuration, deployment, rollback, backup/restore and incident procedures |
| [Dependencies](DEPENDENCIES.md) | Version choices and first-build artifact verification |
| [Traceability](TRACEABILITY.md) | Every recorded requirement mapped to implementation/verification |
| [Frontend handoff](FRONTEND_HANDOFF.md) | Client contract changes and externally owned acceptance |
| [Decision register](DECISIONS.md) | Direct user decisions versus25 new delegated selection bundles |

## Material newly selected choices
- Net goods prices **exclude VAT** explicitly; no tax invoice or tax computation in this ordering release. Subscription APIs expose entitlements/usage, with no unneeded billing amounts.
- Managed Render Frankfurt + separate PostgreSQL environments, EU R2 storage, Resend, FCM and FusionAuth Cloud Germany; Google/Apple external identity links remain explicit.
- Initial operating estimate **$343–393/month** under stated assumptions; proposed planning ceiling$450. FusionAuth price is an annual-billing equivalent; actual quote/tenant capacity may raise cost. No purchase authorized.
- Strong opaque server-state sessions, fixed permissions and current authorization checks, targeted idempotency, atomic reviewed orders and stock effects; no application MFA.
- Explicit data retention/redaction controls and private support reads. Statutory/commercial retention still needs the real operator's legal facts before production.

## External facts still needed
These are not another design questionnaire. They cannot be truthfully invented or established by writing code. They do not block reviewing P1.1 or authorizing the independent foundation slice.
| ID | Missing fact / accountable input | Blocks / revisit trigger |
|---|---|---|
| X-01 | Legal owner of GitHub/cloud/provider accounts, billing authority, actual approved monthly/annual budget and provider quote | Account creation/purchases/provisioning; resolve before first external setup |
| X-02 | Owned domain/API/web origins, sender domain, native bundle/package IDs, Google/Apple/FCM/APNs registrations | Real OAuth/mail/push/CORS/DNS integration; resolve before sandbox integrations |
| X-03 | Service operator/controller identity, applicable contracts/privacy/retention/deletion obligations and review of net-price/non-invoicing scope for RS/BA | Production personal/commercial data and automatic commercial purge; no legal compliance claim made |
| X-04 | Pilot date, responsible incident owner/contact and staffed response hours | Launch schedule, support promise and RTO commitment; technical targets remain test assumptions |
| X-05 | Two distinct named platform recovery reviewers and accepted evidence/independent verification channel | Exceptional owner/email recovery in production; no automated identity-proof guessing |
| X-06 | Frontend owner, supported app versions and actual browser/Android/iOS integration evidence | Whole-product release; frontend implementation/testing remains externally owned |

## Empirical gates after implementation authorization
These are planned verification activities, **not completed checks**. They require code/tooling/accounts which planning explicitly prohibits creating.
| Gate | Required evidence | Blocks |
|---|---|---|
| G-01 | Resolve approved dependencies/effective POM; verify binaries/digests/licenses/SBOM/scans, Java25 build, image codecs and Postgres18.6 compatibility; reproducible artifact | Foundation completion and use of unverified artifacts |
| G-02 | FusionAuth cloud quote/tenant isolation/passwordUnicode+spaces+length/no truncation/breach checks, no alternate reset bypass; provider mutation reconciliation; Google/Apple sandbox linking | Identity integration release; if capability fails, record revised provider design first |
| G-03 | Render private DB/environment isolation, actual18.6 patch, startup port gating/private management, immutable digest deployment and rollback | Staging/production topology acceptance |
| G-04 | Resend signed callback/dedupe/manual invite resend, FCM platform isolation, R2 EU/private media, decoder limits/metadata/transparency, real-provider sandbox failures | Technical integration release |
| G-05 | Complete automated business/access/price/race/crash/contract/migration/load/security scenarios in TRACEABILITY; no hidden skipped required tests | Each dependent slice and full backend release |
| G-06 | Monthly-style isolated restore drill, measured RPO/RTO, outbox/replay/session/deletion reconciliation; deploy/rollback rehearsal and operator handover | Production release |
| G-07 | Frontend owner's staging acceptance for web/Android/iOS and current API version | Whole-product launch |

## Review findings and limits
The design explicitly prevents account moves, cross-country trades, per-person vendor grants, backend live carts, platform commercial writes, stale silent overwrites, duplicate stock credits, implicit acceptance of changed prices and automatic failed-invitation resends. Bulk catalogue edits and custom-stage retirement are included; provider integrations are part of full release.
Recovery across PostgreSQL and an external identity provider is a reconciled operation, not a distributed transaction. External email/push delivery is at-least-once/best effort with deduplication where supported. Restores can lose writes inside the stated RPO and require reconciliation before resuming; AI operation does not establish staffing or a service guarantee.
Provider selection is researched, not tested. Exact immutable image hashes and transitive inventories must be generated from actual authorized builds rather than fabricated in a plan. Render health checks are a specifically identified platform risk; G-03 must prove private management and readiness behavior. Legal retention is a named production dependency, not silently treated as settled.
[PROJECT_STATUS.md](PROJECT_STATUS.md) records passed planning checks:208 operations,204 schemas and543 requirement mappings, with no broken internal references or local document links. There is no assertion that every possible future question has been discovered or that the application already works.

## Approval boundary
The independent review of P1.1 is complete and its identified findings are corrected; the listed external and empirical gates remain. To start development, the user must explicitly approve this concrete revision and authorize implementation, for example: **“I approve planning revision P1.1 and authorize implementation, starting with VS-00.”** Record that approval in PROJECT_STATUS.md and update AGENTS.md phase before code/scaffolding/dependency installation.
This approval would not itself authorize provider purchases, production deployments, frontend application work, PR merges or silent changes to earlier explicit business decisions. Routine newly discovered design refinements remain delegated and must be recorded.

## Research references
Primary sources reviewed2026-10-15: [FusionAuth cloud regions](https://fusionauth.io/docs/cloud/reference/regions), [password hashing](https://fusionauth.io/docs/reference/password-hashes), [tenant validation](https://fusionauth.io/docs/apis/tenants/update-a-tenant), [authenticated login configuration](https://fusionauth.io/docs/apis/applications/create-an-application), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Render networking](https://render.com/docs/private-network), [health-check behavior](https://render.com/docs/health-checks), [R2 jurisdiction](https://developers.cloudflare.com/r2/reference/data-location/), [Resend idempotency](https://resend.com/blog/engineering-idempotency-keys), [FCM platforms](https://firebase.google.com/products/cloud-messaging). Price/version sources are adjacent to their tables.
Rejected compatibility directions: [Cognito AdminSetUserPassword](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminSetUserPassword.html) documents a non-whitespace pattern; [Auth0 maximum password length](https://support.auth0.com/center/s/article/customize-max-password-length) documents its bcrypt limit. These findings motivate the selected provider capability tests; no provider has been provisioned.
