# AI-led development and operations

Current authority: P1.1 approved for backend/infrastructure implementation on 2026-10-16; VS-00 is locally verified; VS-01 is in progress. See [PROJECT_STATUS.md](PROJECT_STATUS.md). Historical candidate/authorization statements below describe the pre-approval record.
P1.1 review candidate — 2026-10-15. No implementation authorization.

Current operating specification: [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) supplies concrete provider/configuration/cost/command/recovery procedures; [DEPENDENCIES.md](DEPENDENCIES.md) supplies exact build choices; [TRACEABILITY.md](TRACEABILITY.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) supply evidence gates and delivery order. [PLANNING_REVIEW.md](PLANNING_REVIEW.md) identifies external inputs and unexecuted checks. The foundational policy below remains in effect; earlier “remaining work” notes are refined by these P1.1 documents.

Revision P0.48 — 2026-10-15. Selected planning policy under D-GOV-005/006, D-ENG-034 and D-INF-023. No application code, scripts, CI workflows or infrastructure have been implemented by this document.

## Authority and operating assumptions
The user expects approximately 99% of future development and DevOps work to be performed by AI. Design for a new AI session to understand, verify and operate the system from repository records and observable state. Treat this as an operating constraint, not an availability guarantee or a reason to weaken verification.

[AGENTS.md](AGENTS.md) is the concise entry point; [PROJECT_STATUS.md](PROJECT_STATUS.md) records phase, authority, progress and remaining work. Detailed [decisions](DECISIONS.md) and [requirements](REQUIREMENTS.md) retain business meaning and supersessions. Frontend application implementation and testing remain externally owned.

The assistant chooses remaining recommendations and documents them under D-GOV-005. Do not reopen routine interviews. Preserve already-decided requirements. External facts, such as actual account ownership, domains, budget authority and business/legal circumstances, must be obtained or marked unknown; estimates must state assumptions. Neither delegation nor this document authorizes implementation, purchases, external communications or a production deployment.

## Delivery model
- Keep one modular Java backend and PostgreSQL-backed workers. Use managed hosting, database, object storage, secrets and identity services. Add a new operational component only for an evidenced requirement with a recorded tradeoff.
- Prefer supported, well-documented interfaces and ordinary explicit code over custom frameworks or clever abstractions. Preserve the approved handwritten mapping, no-Lombok and module conventions.
- Record configuration and infrastructure definitions in version control, without secrets. Exact infrastructure-as-code tool and provider adapters remain delegated selections.
- Use small PRs tied to requirements, with a distinct review pass for correctness, denied access, races and failure behavior. Keep the existing explicit user approval before merge.
- Build/test once and promote the same immutable container artifact, identified by digest. Environment configuration is external to it. Automatic staging follows approved merges and passing checks/migrations; production requires approval of that release.
- Treat generated code and automation as unverified until the selected checks pass. Never convert a failing required check into a silent skip to claim completion.

## Agent session procedure
1. Read current instructions/status and relevant decisions/requirements. Inspect the real checkout and active change scope; historical chat/log claims are not proof of current state.
2. Identify the authorized phase and task. During PLANNING, edit instructions/specifications only. After separate implementation authorization, deliver one agreed vertical slice at a time.
3. Resolve routine new choices through research and recorded delegated decisions. Separate a new design choice from a missing external fact or a conflict with explicit user requirements.
4. Before changing state, verify the target environment/resource and intended effect. Use scoped credentials and documented repeat-safe commands. Stop a workflow on failed preconditions rather than guessing which environment was meant.
5. Run relevant checks and inspect their results. Review sensitive negative cases and actual database behavior, not only a successful demonstration.
6. Update durable status, decisions, contract examples, operational notes and verification evidence before handoff. Include unresolved inputs, failures and next actions so another session can resume.

## Implementation cadence

User instruction2026-10-21: after finishing and verifying one functionality batch, continue directly with the next authorized batch without asking for another continuation prompt. Keep one coherent batch under implementation at a time, record completed evidence and the next scope, and preserve external-fact/provisioning/merge/production approval boundaries.

Selected on 2026-10-18 under D-GOV-005 in response to the user's request to improve pace and subscription efficiency. This refines local execution, not business scope, acceptance requirements or action authority.

- **Batch by outcome.** At the start, name one bounded feature within the current vertical slice and its acceptance scenarios. Implement its related endpoints, persistence, permissions and tests together. Complete that batch without stopping after every endpoint to request “continue”. Keep changes reviewable; do not combine unrelated slices or attempt the entire remaining backend in one batch. If interrupted, record exact unfinished work instead of claiming completion.
- **Read selectively.** Start with AGENTS/status and the approved review record, then retrieve the complete relevant decision/requirement/design/contract sections. Use requirement IDs and targeted searches; do not reread every historical register or reopen settled choices. Reuse already-read context unless changes or uncertainty justify another read.
- **Check earlier endpoint placeholders.** When enabling an approved route, inspect historical tests that expected it to be unimplemented. Replace only the enabled-route placeholder with meaningful contract assertions; retain default-disabled and unauthorized404 checks.
- **Verify in stages.** During editing, run affected tests and failure/race scenarios. At batch completion run full Maven-wrapper verify, review the final diff separately for permissions, transactions, failures and contract consistency, and fix findings. Rerun affected checks after fixes; rerun the full gate after final executable/test/build changes before declaring the batch verified. Documentation-only changes need relevant document checks, not another application build. Never silently skip required infrastructure or scenarios.
- **Repeat artifact checks for a reason.** Run packaged migration/startup checks when migrations, schema compatibility, runtime configuration/grants, packaging or startup behavior change, and at required slice/release acceptance. Rerun dependency inventory/license/vulnerability checks when dependencies/build resolution change, and image checks when the base image/container/runtime changes, new advisory evidence warrants a refresh, or CI/slice/release gates require them. Scan changed content for secrets before handoff. Do not repeatedly rescan unchanged dependencies against the same advisory database after each endpoint. Existing CI and release gates remain unchanged. Every new packaged artifact must receive its required checks; historical evidence never proves a new image or fresh advisory status.
- **Keep documentation proportional.** Record new delegated decisions before dependent implementation. Update changed contracts/requirements and operational instructions when their meaning changes. Maintain one concise batch evidence record and handoff delta; link existing commands and evidence instead of copying inventories and historical totals into many documents. Preserve historical evidence and identify checks actually run, prior evidence reused, and remaining gates.
- **Make continuation explicit.** PROJECT_STATUS must identify the next bounded batch, its completion criteria, current blockers and authoritative evidence. Use brief progress updates while working, not artificial approval checkpoints. Missing provider inputs block only the work that needs them. No new subagents, provisioning, merges or releases are authorized by this cadence.

Business-contact batch completed locally on2026-10-18; see [evidence](BE/CONTACT_VERIFICATION.md). PROJECT_STATUS is authoritative for the next bounded batch. Derive its exact operations and acceptance scenarios from the approved contract before editing; do not invent endpoints or business rules for batch size.

## Verification and evidence
D-TST-001–020 define the selected tools and initial gates: JUnit Jupiter, AssertJ, Mockito, Testcontainers/PostgreSQL, ArchUnit, MockMvc plus real HTTP checks, Surefire/Failsafe and *Test/*IT names. The future Maven-wrapper verify command must cover the required checks; no wrapper exists yet in BE.

Use synthetic ordinary fixtures and staging business data. Keep real-provider checks in controlled sandbox runs with the correct environment identities and permitted test recipients. Capture the command/check version, code/artifact revision, environment, result and significant limitations. Avoid secret values, authentication tokens and unnecessary customer data in evidence.

Critical behavior requires explicit scenarios: country/organization denial, current permissions and revocation races, price calculations, stock/quota concurrency, duplicate requests, transaction rollback/unknown commit, notification/provider failure and restore effects. Coverage reports support review; a percentage does not replace those cases.

A separate review pass may use available authorized review tooling or a fresh deliberate review of the diff. This policy does not authorize spawning additional agents, sending messages, or bypassing the user's merge gate.

## Operational automation contract
For every future deploy, migrate, reconcile, clean up, rotate or restore command, document:
- Purpose, owner, environment/resource identifiers and required credential scope.
- Read-only preflight checks, prerequisites, estimated effects and any maintenance impact.
- Exact inputs, repeat/retry semantics, bounded timeouts, concurrency protection and cancellation behavior.
- Expected outputs and postconditions that distinguish success, definitive failure and unknown outcome.
- Failure evidence, allowed recovery, rollback compatibility and the point where execution must stop.
- A tested example in a disposable environment and the date/artifact of that test.

These are requirements for later scripts/runbooks, not claims that those commands already exist. Prefer a small consistent command surface over unrelated one-off shell snippets. Where previews are meaningful, provide them before mutation. Record out-of-band console changes and reconcile them into versioned configuration.

## Release and recovery
The future release runbook must identify the immutable artifact, approved migration set, compatibility evidence, staging results, release approval and rollback plan. Serialize migrations and retain database-level locking. Runtime credentials cannot change schema.

If a migration fails, stop rollout and diagnose actual state before a retry. AI may investigate and prepare recovery; do not automatically reverse migrations or assume a timeout means no commit. Application rollback is allowed only when current schema/data compatibility is verified; otherwise fix forward.

Backup restoration is a distinct procedure. It must establish recovery point, target isolation, effects on external deliveries, sessions, retry metadata and business invariants, then verify the restored system before traffic resumes. Exact recovery targets, retention, commands and approval scope remain design work. Do not claim backups are proven until a restore exercise provides evidence.

## Observability and incident handoff
Design structured redacted logs, request correlation, actionable health/readiness checks and alerts with a linked diagnosis/runbook. Record symptoms, time, affected artifact/environment, last known good state, actions already attempted and their results. Never let an AI repeatedly retry an uncertain production mutation without reconciliation.

Management endpoints are private; provider email/push failure is separate from core API readiness. Choose exact metrics, thresholds, retention and alert routing during remaining operational design. Actual accountable contacts and support availability must be supplied; the AI-work expectation does not establish an on-call roster.

## Boundaries and remaining completion work
Current approval gates remain concrete-package approval plus implementation authorization, explicit user PR merge approval and explicit production-release approval. Routine planning choices no longer need user confirmation. Avoid adding extra approval gates merely because AI performs the work.

Complete provider/cost/version research, detailed schemas/contracts/security/transaction mechanisms, operational targets, runbooks and full requirement-to-verification coverage before presenting implementation readiness. The end of questionnaires is not the end of planning.

Per-slice backend handoff includes contracts/examples/limitations and backend test evidence. Frontend app changes and browser/native verification remain the frontend owner's responsibility. The operating model introduces no customer-facing AI feature.


2026-10-21 verification pacing follow-through: [test fixture pooling evidence](BE/VERIFICATION_PACING.md). All1277 checks remain, including947 HTTP cases; observed full wrapper14:58 min versus18:51 baseline. A bounded shared fixture pool replaces per-query connections only in test setup/assertions; real database/HTTP/race/failure gates stay intact. Timing varies; preserve separate review and full verification. Packaged checks were reused only after proving exact JAR/application/native identity, not because test-only intent was assumed sufficient.
