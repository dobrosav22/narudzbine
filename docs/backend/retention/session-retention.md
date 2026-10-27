# Session payload retention — selected 2026-10-21

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/SESSION_RETENTION_IMPLEMENTATION.md`: Session payload retention — selected 2026-10-21._

Delegated refinement under D-GOV-005 for the existing thirty-day session retention rule (DESIGN_SPEC section 10; R-SEC-011). This is technical credential/metadata expiry, not commercial or legal-case fulfillment.

Retain an immutable minimal session ID/account binding, backfilled only from actual session rows. Original credential-operation and OAuth references point to that binding; it never authenticates a request. New session insertion reserves its ID atomically and cannot reuse a retired ID. New session-dependent operations still require a live same-account session. Migration rejects inconsistent historical account bindings rather than inventing them.

An internal worker deletes at most 1,000 live payload rows, ordered by effective end then ID, using row locks with SKIP LOCKED. Effective end is the earliest absolute expiry, revocation or exact idle expiry (business 168 elapsed hours; platform administrator 30 minutes). The injected UTC millisecond clock supplies the thirty-elapsed-day cutoff. Recent or unfinished referenced credential operations and recent/CLAIMED OAuth challenges defer deletion. An operation that currently holds the session row makes cleanup skip it. Authentication, refresh and device authorization continue to require the live payload; a clock rollback cannot restore it.

The existing BEFORE DELETE trigger disables enabled push devices and clears their encrypted token while the source session still exists. That change and payload deletion commit or roll back together; retained installation/token ownership prevents reassignment. Devices can later bind to a newly authenticated same-account session through the normal registration flow.

Run as an independent ten-second REQUIRES_NEW maintenance job every minute. Fixed SQL, narrow table grants and an aggregate read-only preview; permission failure defers this job without rolling back other maintenance. No new API, ordinary account deletion, legal hold fulfillment or external provider activation. Minimal identity/source/audit records remain for reconciliation; inbox/delivery metadata and remaining OAuth/recovery token classes are separate work.

Verify exact cutoffs and idle windows, permanent ID reservation, original references/account integrity, pending/recent exclusions, bounded convergence, concurrent workers and live locks, transaction rollback with device invalidation, narrow privileges, populated64 migration/repeat, real HTTP credential rejection and independent maintenance failure. Full wrapper and change-triggered packaged migration/artifact checks remain required before claiming completion.

## Verification

_Originally `BE/SESSION_RETENTION_VERIFICATION.md`: Session payload retention verification._

2026-10-21. [Design](#implementation), [grants](../../../BE/retention/session-grants.sql), [aggregate preview](../../../BE/retention/session-preview.sql). Schema65;209 API operations unchanged. Backend/infrastructure only.

Full wrapper .tools/session-retention-final-verify.log: BUILD SUCCESS, **1,277 passed** (155 unit/1,122 PostgreSQL+native integration), zero failures/errors/skips. Reviewed focus155/16 passed: ten PostgreSQL behavior cases, two migration cases and four HTTP cases (two new session scenarios and two retained proof-reader scenarios). Distinct deliberate review: .tools/session-retention-review.md. The initial narrow-role focus correctly failed for missing PostgreSQL row-lock privilege; UPDATE(id) was added before the successful reviewed focus/freeze. No skip or weakened authentication assertion.

PostgreSQL checks cover exact thirty-day absolute/idle/revocation cutoffs, administrator/business windows, millisecond boundaries, elapsed hours across spring DST in a non-UTC transaction, unresolved and recent credential/OAuth exclusions, completed source preservation, immutable session ID/account reservation/no reuse, failed insert reservation rollback, same-account source insertion enforcement, 1,006-row convergence in 1,000 then six, two real competing workers and a locked target, device invalidation/deletion rollback and retry, absent-session push ineligibility, retained installation/token ownership, restricted-role denials and matching read-only preview. New live session insertion reserves its binding through a fixed definer trigger without direct binding-table DML grants. Existing device guard is unchanged.

Populated64-to65/repeated migration preserves all original session payload, credential/OAuth source, account and audit snapshots and backfills only actual original ID/account pairs. Original terminal references survive payload deletion. A separate inconsistent64 fixture proves migration fails atomically with schema64/data unchanged rather than inventing the mismatched binding. Five indexes are checked. Existing readiness/last-release migration scenarios pass; no production migration executed.

Real HTTP cases create browser/native sessions and a registered device, age them, run independent maintenance, reject old credentials even after clock rollback, retain disabled device ownership and register again through a fresh same-account session. Revoking DELETE defers only session-payloads; restoring the grant converges. The older proof-reader scenario retains its original live session through an unresolved credential operation to continue testing retired-code rejection itself.24 independent ten-second REQUIRES_NEW maintenance jobs now include fixed-SQL session deletion with SKIP LOCKED. No provider call, commercial write or new API.

Artifact narudzbine-backend:vs12-session-retention: sha256:4456f8aa262c09412e7b53bc594c8fcf62030a452a9ee97167c3064724461426; JAR SHA256 d169d7a98d76406534eeb4f48f7d3ddfe52e258aa664c7a263865d74f56cc3b4. All 829 application class files and 70 resources match the packaged JAR; native fixture/production class and binary match. 545 frozen inputs unchanged. Packaged migration65, nonroot/read-only startup, private readiness200/public diagnostics404/default-off business routes, unconfigured export/provider/processing startup rejection and native sandbox/root denial passed. Native integration includes existing49 actual Linux processor/watchdog checks.

Matched cached image scan: zero HIGH/CRITICAL or detected Java findings; remaining {'MEDIUM': 25, 'LOW': 4}. Advisory dates and manually built ImageMagick inventory limitations remain as in prior evidence; this is not a fresh/all-package safety claim.145 Java/13 declared native components retain licenses; source secret scan zero. Cleanup checked 27 recorded owned identities; none remain. Evidence: .tools/session-retention-* and .tools/vs12-session-retention-container-smoke-result.json. Provenance was rerun successfully after the smoke-result file became available; its earlier sequencing failure was not an application failure.

This removes aged live session payload, retaining minimal original source binding; it is not physical WAL/backup erasure. Restore must still invalidate credentials before reopening under RUN-03. Remaining OAuth state/browser/original-token/exchange/recovery bindings, inbox/delivery metadata, case-linked holds/assisted fulfillment/restricted tools, independent deletion/audit archive/restore and actual provider/hosted/client/operator/full-slice/release gates stay separate. Exact readiness requires a schema65-compatible rollback artifact or fix forward. No purchase/provisioning, merge or production deployment.
