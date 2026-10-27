# Independent privacy/recovery evidence: next dependency discovery

One record per backend feature: Discovery, Implementation, Review, Verification. Domain index: [backend](../README.md).

## Discovery

_Originally `BE/INDEPENDENT_EVIDENCE_DISCOVERY.md`: Independent privacy/recovery evidence: next dependency discovery._

2026-10-22, read-only follow-through during the frozen complete-JSON gate. D-PLAN-018, DESIGN_SPEC section10 and RUN-03 remain authoritative. This is not implementation or recovery acceptance. Continue locally without requesting hosted accounts/domains/legal contacts.

Current code has immutable database audit and case/job/source events, qualified private case review and global retention holds. It has no independent deletion-intent/completion store, independent daily audit archive or tested restore reconciliation. PostgreSQL rows and same-lineage snapshots cannot substitute for evidence outside PITR. R2Quarantine has provider deletion/tombstoning and media credentials; neither that authority nor its bucket may become the recovery evidence boundary.

Existing pinned AWS S3 SDK and conditional create/read-back patterns can support a separate adapter without a new dependency. The next foundation should expose create-if-absent plus bounded verified reads only, with no overwrite/delete API; use its own credential/bucket/key configuration and an independently protected encrypted format. Provider calls stay outside database transactions. Retry/unknown outcome must inspect the same object identity, never invent completion. Completion evidence comes only after an actual committed application outcome; no raw deleted content belongs in deletion intents. Daily audit archives are a distinct source/manifest and cannot fill an unknown restore window by assertion.

Local construction needs deterministic synthetic tests and a persistent local write-once adapter. Publication must be conditional and atomic: a crash cannot leave a partially written object which later code treats as verified. File paths must be fixed from validated namespace/UUID/sequence identifiers; reject traversal/symlink substitution, conflicting identity/content and truncated/malformed/wrong-key objects. Real power-loss durability, provider conditional semantics/retention protection, EU bucket/account separation and operator custody remain future empirical/external gates, not claims from a local adapter.

Before any redaction executor, specify requester/field scope, current authority/containment/owner constraints, hold/legal review, dedicated role, preview revision and independent verified intent/commit/completion recovery. A metadata-only preview may enumerate supported actions and blockers without exposing commercial values or authorizing deletion. Preserve original account-organization binding, commercial totals/history and existing immutable source identities. Do not call a partial profile change complete fulfillment of every retained/shared field. Commercial/statutory purge stays disabled pending X-03.

### Follow-through during the storage foundation gate

DESIGN_SPEC section8 explicitly permits a separately scoped privacy-redaction procedure to update otherwise append-only records while preserving amounts/identifiers and recording a redaction event. This is a privacy exception, not authority for ordinary runtime DML. Actual source triggers currently reject those changes; a dedicated guarded procedure and verified intent/commit/completion workflow are still needed.

Private case review already has a committed60s nonce/source permit, current named qualification/session guards and a second committing read audit. Its organization routing lock permits historical closed organizations, which matters for assisted cases after authentication containment. Reuse that authority boundary rather than granting general private-source SELECT. Normal owner transfer/reactivation rules remain; a sole active owner cannot be silently deactivated by the platform.

Current privacy_fulfillment metadata is export-specific (latest_job references an EXPORT job and its counter derives from export revisions). Do not force REDACTION cases into that table. Future redaction progress needs its own source-bound state/counter and a safe disjoint projection through the audit fulfillment port. Original intake and seven-day original creation replay stay unchanged; action-disabled metadata must remain truthful.

A field-level preview must distinguish account-only targets from organization-wide data, enumerate actual supported field actions/counts without returning raw values, name retained/unsupported/shared/provider sources and expose blockers. Authentication containment, owner constraints, pending/uncertain credential/provider work, current source revision, active holds and an accountable legal/requester-verification reference are prerequisites to execution, not invented facts. Commercial totals/IDs, original account-org/country binding and attribution remain. Do not equate one profile-field change with complete fulfillment of every retained source.

An eventual applied outcome and its external completion are separate: a crash after database commit keeps the immutable applied source and pending completion; it must not guess failure or repeat destructive work. Technical completion evidence may preserve a known committed outcome after the original operator's session expires, without inventing a SYSTEM audit actor or granting commercial writes to the evidence worker. Restore must inspect the same outside-PITR identities and remain contained on missing/conflicting/unknown evidence.

## Implementation

_Originally `BE/INDEPENDENT_EVIDENCE_IMPLEMENTATION.md`: Independent encrypted evidence storage foundation._

Selected2026-10-22 under D-GOV-005 / D-PLAN-018 before dependent code, following verified complete JSON schema72. Dependency-first local construction: implement the independent object boundary before redaction preview/intent/commit/completion or daily audit producers. No new REST route, database mutation, redaction or completed recovery is authorized by a stored object alone.

### Boundary and identities

An internal audit API accepts typed family/resource UUIDv7/positive sequence identities: deletion intent, deletion completion, audit part and audit manifest. Object paths are fixed from that identity. Create-if-absent, bounded read and bounded identity listing only; no overwrite/delete/presign/public URL API. Producers remain responsible for verified source/authority and typed payloads. Completion may be produced only after actual database commit; this foundation cannot establish that semantic fact by itself.

Ciphertext is purpose/resource/family/sequence/key-version bound with a versioned explicit256-bit key ring. Retain old keys for old/held/recovery objects; do not alias one key under another version or reuse CSV/portable-artifact keys. Versioned binary framing is bounded before allocation. Max16MiB plaintext; no raw deleted content in later deletion intents. Read back and verify actual retained ciphertext, authenticate/decrypt and compare the expected payload before issuing a stable verified receipt. Same identity/content returns the retained original receipt; conflicting/malformed/wrong-key content fails closed. An uncertain create is resolved by reading that same identity. No guessed completion, overwrite or blind replacement.

Provider/file I/O is prohibited inside a database transaction. The S3/R2 adapter uses a separate supplied client/bucket, conditional If-None-Match create, bounded GET with actual digest verification and bounded list. SDK attempts are single and time-bounded. No media credential/bucket/delete authority is reused. Hosted account/bucket EU separation, conditional/retention behavior and key custody need actual future conformance; local mocked requests do not prove them.

### Local adapter and limits

The local file adapter is explicitly for local tools/tests. It writes and forces a private prepared file, then conditionally publishes a hard link; competing creators cannot replace an existing final object. Only prepared filenames owned by that operation are removed. Paths are canonical, contain validated identity segments and reject traversal, non-regular objects and redirected parent directories. The operator owns the private root; hostile co-owners/administrators and filesystem power loss are outside this adapter's claim. No ordinary HTTP bean activates it or creates directories on application startup.

Observed local probe `.tools/independent-file-probe-result.json`: actual NTFS concurrent conditional publication and retained bytes passed; directory force is unsupported here. This does not prove power-loss durability, WORM retention, independent host/account protection or hosted recovery. Tests must preserve this distinction. A production protected R2 bucket remains a separately gated configuration.

### Acceptance and next producers

Verify encryption isolation/versioned reads, same-content replay/conflict, corrupt/wrong-key/AAD/size rejection, response-loss read-back, unknown/missing reads, transaction exclusion, actual file publication races, redirected directories, bounded complete listings and S3 request/digest/error semantics. Then full wrapper, distinct review and change-triggered artifact gates. No source/fixture contents in logs.

A later daily archive must account for late commits: occurredAt/UUID order is not a safe committed high-water mark. Use pending source identities, verified per-object outcomes and explicit bounded run manifests; do not declare an old UTC day permanently complete while a transaction can commit an older event later. Outside-PITR objects do not fill an unknown recent restore window. Ordinary traffic/login/delivery stays contained until authoritative source/operator/provider/business reconciliation is complete.


Binary format1: ASCII `NZEV1` (5 bytes), unsigned one-byte key-version length, canonical ASCII `v1`..`v999999`, then the resource-bound AES-GCM envelope. The complete object is bounded before allocation, authenticates the full typed object path and key version, and has no plaintext payload/header fields beyond its key version. Provider metadata carries only format and ciphertext digest. Invalid response streams are aborted instead of drained; streaming reads have a15s checked deadline in addition to socket/call bounds. A blocked socket may reach its configured socket timeout before the next deadline check; no15s end-to-end delivery guarantee is inferred.

## Review

_Originally `BE/INDEPENDENT_EVIDENCE_REVIEW.md`: Independent evidence foundation: separate review._

2026-10-22. Deliberate review after implementation/focused checks, separate from writing the code. Scope is internal encrypted object storage only, with no REST/schema/automatic runtime activation, redaction or archive producer.

Resolved findings before the final gate:
- File construction also performs I/O and must reject an active database transaction, not only create/read/list calls.
- Listing must bound empty resource directories as well as files and reject malformed resource names; otherwise a zero-object directory stream bypasses the count/deadline bound.
- Copy supplied bytes before file/provider publication so later caller mutation cannot change the prepared object.
- Abort rejected provider response streams instead of allowing close to drain an oversized/unverified body. Check an explicit streaming deadline as well as byte/socket/call bounds; document that a blocked socket can reach its timeout before the next check.
- Retained old-key objects are verified against the original key version. Active-key rotation never rewrites them, aliases one key or replaces an unknown/corrupt object.
- A conditional create and verified ciphertext receipt are not proof of requester/legal authorization, database commit, hosted independence, WORM protection or full restore reconciliation. Typed producers/authority remain separate prerequisites.

Executed `.tools/independent-evidence-reviewed-focus.log`:30 checks passed (12 protocol/encryption,8 actual local filesystem,8 actual SDK/loopback/abort,2 architecture), zero failures/errors/skips. Actual NTFS junction isolation/concurrent publication and persistent reopen were exercised. `.tools/independent-file-probe-result.json` records unsupported directory force and does not establish power-loss durability.

No new dependency, provider purchase/provisioning or real message/call was introduced. Separate provider client/bucket/permissions/key custody need future conformance. Full wrapper and exact new artifact checks remain pending.

## Verification

_Originally `BE/INDEPENDENT_EVIDENCE_VERIFICATION.md`: Independent evidence storage foundation: local verification._

2026-10-22; schema72 and219 API operations unchanged. [Design](#implementation), [distinct review](#review). This foundation does not supply a redaction executor, audit producer or completed recovery.

Focused30 checks passed (12 encrypted protocol/key/replay/failure,8 actual local file/path/race/reopen,8 actual S3 SDK/loopback/stream abort,2 architecture), zero failures/errors/skips. `.tools/independent-evidence-reviewed-focus.log`. Actual NTFS junction isolation was exercised; directory force is unsupported here, so power-loss durability is not claimed. The pinned Linux JDK also exercised the exact packaged classes in a read-only/network-isolated/non-root container: verified publication/replay, concurrent same-content receipts and persistent reopen passed. `.tools/independent-evidence-linux-probe-result.json`; this is separate from JUnit totals.

Packaged schema72 migration, non-root/read-only startup, existing default-off/misconfiguration/native/qualification checks passed. Image `sha256:8762c3e2e276af571244bb7db3cdcb12212b0c029a93b5b845c9df079739c3b7`; JAR SHA256 `22f23bb605034b469fe863e4e7ed56d8836a356452483b6c85f1713a2d75c120`. Cached image scan:25 MEDIUM/4 LOW, no HIGH/CRITICAL or detected Java findings; the manually built ImageMagick publisher-review limitation remains. Source-secret scan is clean. Full wrapper passed **1,431 checks** (193 unit/1,238 integration), including973 HTTP, zero failures/errors/skips, in23:09 min. All612 frozen executable/test/build/grant/contract inputs matched. `.tools/independent-evidence-final-verify.log`, `.tools/independent-evidence-final-evidence.json` and `.tools/independent-evidence-frozen-source.json`. Provenance matched947 application classes/77 resources and the unchanged native processor. Final owned container/network inventory is empty; one recorded Ryuk helper disappeared automatically after JVM exit before the successful final inventory. No unknown resource was removed.

The local adapter proves conditional API behavior and reopen, not hostile administrator protection, physical account/host independence, WORM retention or power-loss recovery. The loopback harness tests the pinned SDK request/response protocol; it is not real R2 conformance. No provider purchase/provisioning, live message, real legal/operator assertion, archive/redaction/restore/client acceptance, merge or production release occurred.
