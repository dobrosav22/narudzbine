# P1.1 planning review

Current authority: P1.1 approved for backend/infrastructure implementation on 2026-10-16; VS-00 is locally verified; VS-01 is in progress. See [PROJECT_STATUS.md](status.md). Historical candidate/authorization statements below describe the pre-approval record.
**Independently reviewed candidate updated 2026-10-16. Backend and infrastructure only. No application implementation is authorized.**

The assistant and a specialized independent agent performed the detailed review; [the review report](#independent-findings) records the defects and corrections. The user is not expected to manually audit the full package.

The remaining routine design choices have been selected under your delegation in D-GOV-005. The plan preserves the full approved release scope and permanent account/organization/country boundaries. It uses one Java modular backend with PostgreSQL and managed services, and specifies reproducible checks/runbooks for predominantly AI-led development and operations.

## Review evidence
| Document | Purpose |
|---|---|
| [Detailed design](../architecture/design-spec.md) | Permissions, domain/storage, transactions, retries, security, catalogue, reporting, retention |
| [OpenAPI](../../openapi.yaml) and [API index](../architecture/api-contract.md) | Concrete operation/request/response contracts and authorization |
| [Implementation sequence](implementation-plan.md) | Small vertical slices, prerequisites and pass criteria |
| [Operations](../operations/runbook.md) | Providers/costs, configuration, deployment, rollback, backup/restore and incident procedures |
| [Dependencies](../architecture/dependencies.md) | Version choices and first-build artifact verification |
| [Traceability](traceability.md) | Every recorded requirement mapped to implementation/verification |
| [Frontend handoff](../frontend/backend-handoff.md) | Client contract changes and externally owned acceptance |
| [Decision register](decisions.md) | Direct user decisions versus25 new delegated selection bundles |

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
[PROJECT_STATUS.md](status.md) records passed planning checks:208 operations,204 schemas and543 requirement mappings, with no broken internal references or local document links. There is no assertion that every possible future question has been discovered or that the application already works.

## Approval boundary
The independent review of P1.1 is complete and its identified findings are corrected; the listed external and empirical gates remain. To start development, the user must explicitly approve this concrete revision and authorize implementation, for example: **“I approve planning revision P1.1 and authorize implementation, starting with VS-00.”** Record that approval in PROJECT_STATUS.md and update AGENTS.md phase before code/scaffolding/dependency installation.
This approval would not itself authorize provider purchases, production deployments, frontend application work, PR merges or silent changes to earlier explicit business decisions. Routine newly discovered design refinements remain delegated and must be recorded.

## Research references
Primary sources reviewed2026-10-15: [FusionAuth cloud regions](https://fusionauth.io/docs/cloud/reference/regions), [password hashing](https://fusionauth.io/docs/reference/password-hashes), [tenant validation](https://fusionauth.io/docs/apis/tenants/update-a-tenant), [authenticated login configuration](https://fusionauth.io/docs/apis/applications/create-an-application), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Render networking](https://render.com/docs/private-network), [health-check behavior](https://render.com/docs/health-checks), [R2 jurisdiction](https://developers.cloudflare.com/r2/reference/data-location/), [Resend idempotency](https://resend.com/blog/engineering-idempotency-keys), [FCM platforms](https://firebase.google.com/products/cloud-messaging). Price/version sources are adjacent to their tables.
Rejected compatibility directions: [Cognito AdminSetUserPassword](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminSetUserPassword.html) documents a non-whitespace pattern; [Auth0 maximum password length](https://support.auth0.com/center/s/article/customize-max-password-length) documents its bcrypt limit. These findings motivate the selected provider capability tests; no provider has been provisioned.

## Independent findings

_Originally `PLANNING_REVIEW_REPORT.md`: Independent planning review report._

Current authority: P1.1 approved for backend/infrastructure implementation on 2026-10-16; VS-00 is locally verified; VS-01 is in progress. See [PROJECT_STATUS.md](status.md). Historical candidate/authorization statements below describe the pre-approval record.
2026-10-16 — P1.1, backend and infrastructure only.

The user requested a specialized agent review rather than a manual document audit. An independent read-only specialist inspected approved requirements, design, OpenAPI, recovery operations and traceability. The primary agent checked its findings against the original decisions, corrected the package, and added a complementary session-rotation correction. A second specialist pass caught two further contract details, which were also corrected. This is a design review; no application or infrastructure was implemented.

### Findings and corrections
| ID | Priority | Concrete defect in P1.0 | P1.1 correction / verification case |
|---|---|---|---|
| REVIEW-01 | P1 | Unlink allowed generic recent authentication even through the method being removed, contradicting R-SEC-032. | Retained-method proof provenance, credential generation/epoch and account-lock validation; DESIGN_SPEC §4 / unlinkExternalIdentity. |
| REVIEW-02 | P1 | A public mailbox proof could complete a credential change hours after initial authentication; owner-transfer initiation lacked the five-minute contract condition. | Proofs only verify mailboxes. New completeEmailChange requires fresh same-account authentication, both proofs and current revision. Owner initiation explicitly checks freshness. |
| REVIEW-03 | P1 | Replenishing to the stock maximum could leave no space for an obligatory cancellation credit. | available + outstanding pre-dispatch credit quantities <=1,000,000,000, enforced on all manual/reconciliation writes; dispatch releases headroom and cancellation converts it to available once. |
| REVIEW-04 | P2 | StockDelta forbade zero despite R-CAT-083 requiring a successful no-op. | Zero accepted, original keyed success retained, unchanged initialized count preserves stock revision/history. |
| REVIEW-05 | P2 | TERMS_CHANGED did not return current terms required by R-ORD-002. | Typed currentTerms/unavailableLines, fresh receipt when valid, null plus safe issues otherwise. No order, stock deduction or draft consumption; explicit resubmission. |
| REVIEW-06 | P1 | Buyers received taxonomy/promotion IDs without usable names/effective promotion prices; relevant lookup APIs were vendor-only. | Buyer-safe named taxonomy, promotion summaries, effective prices at defined quantity and a scoped taxonomy filter route; no delivery prerequisite or target-list leak. |
| REVIEW-07 | P2 | Reconciliation arrays capped at5000 although archived products do not count against the plan cap and retain stock obligations. | Server snapshot of every vendor product, paged lines and explicit bounded acknowledgement batches, one atomic complete confirmation; no lifetime5000-product assumption. |
| REVIEW-08 | P1 | A daily archive cannot prove reconciliation of all recent acknowledged state after PITR, and independent deletion evidence lacked a write protocol. | Verified immutable external deletion intent before redaction; restored ordinary access/login/delivery stays closed if authorization/deletion/order evidence is incomplete. RTO includes reconciliation and may be missed. |
| REVIEW-09 | P2 | Session rotation on another user’s elevation did not define safe delivery of the replacement secret. | Revoke the elevated user’s sessions and require fresh login; never return their secret to the administrator. |
| REVIEW-10 | P2 | First correction bound reconciliation cursors to the acknowledgement revision; acknowledging a page invalidated its next-page cursor. | Traverse immutable snapshot/source generation; use separate mutable revision for acknowledgement/final writes. |
| REVIEW-11 | P2 | OrderReview omitted resolved inherited delivery instructions, leaving a changed-terms receipt incomplete. | Explicit nullable deliveryInstructions contains the resolved frozen value in both initial and refreshed receipts. |

### Review limits and disposition
The original user’s business rules are preserved; D-PLAN-025 records delegated corrections. Requirement/operation counts are an index, not evidence that behavior works. REVIEW-01..11 in [TRACEABILITY.md](traceability.md) now supply concrete regression cases instead of relying on counts.

Provider assumptions remain explicit G-01..04 gates, not newly discovered provider failures. No provider sandbox, build, application security/load test or restore drill ran. External ownership, budget, domains, legal and client inputs remain X-01..06. None requires the user to manually audit every document.

Final specialist disposition: all identified findings corrected, no remaining blocker in this reviewed set; suitable for separately authorized implementation with X-01..06 and G-01..07 preserved. The specialist checked the final cursor and delivery-instruction changes after the second pass.

Structural checks passed:208 operations,204 schemas,2,949 resolved references;543 requirements/545 decisions/625 question IDs with no duplicate/unknown references or broken local links. Targeted semantic contract assertions and10,000 mathematical stock-transition reference checks passed. Application behavior remains untested. [PROJECT_STATUS.md](status.md) records the evidence and limits.

P1.1 remains a planning candidate; authorization to implement is separate.
