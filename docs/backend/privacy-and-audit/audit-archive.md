# Independent daily audit archive

One record per backend feature: Implementation, Review, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/AUDIT_ARCHIVE_IMPLEMENTATION.md`: Independent daily audit archive._

Selected2026-10-22 under D-GOV-005 / D-PLAN-018 before dependent code, after locally verified independent encrypted storage. No new customer/admin export route, raw archive download, purge, redaction or recovery release.

### Source and publication

A protected source spool is inserted atomically with every audit_event and backfilled from actual existing events during migration. Rollback leaves neither event nor spool. Pending membership is selected from committed visible rows, not a timestamp/UUID high-water mark. A late transaction with yesterday's occurredAt remains pending and is included in a later run. Never declare a UTC day permanently complete from one snapshot.

Each bounded run has one fixed part (at most250 audit records) plus a completion manifest under AUDIT_PART/AUDIT_MANIFEST with run UUIDv7/sequence1. Identity, UTC archive date, cutoff, creation time, policy version and source membership are immutable. Explicit record DTOs preserve actual audit fields/nullable scope, including private reason only inside encrypted archive bytes. No account credentials, raw message tables or arbitrary database dump is read. Source data is append-only today; a future privacy exception must coordinate with pending archives and independent deletion evidence.

The part and manifest are each conditional-created and read-back verified outside database transactions. Only after verification does the dedicated worker acknowledge the matching receipt in PostgreSQL. A response/commit loss inspects the same run/object identity; no duplicate membership, guessed success, overwrite or new replacement object. Concurrent workers may converge on the same immutable object and receipt. Run manifests prove the captured membership, not absence of later old-dated commits or completeness of an unknown PITR window.

### Technical authority

Archive policy is controlled configuration, not impersonation of a platform user. Versioned policy history records the actual database session/effective principal and reviewed configuration reference. No fictional SYSTEM audit actor is introduced; technical source/run transitions have their own immutable events. New runs require an enabled policy; disabled acceptance may still reconcile its known pending objects. A dedicated role has fixed approved-run source views and narrow claim/acknowledgement functions, no raw audit/account/credential SELECT, commercial DML, schema ownership or evidence deletion. Normal HTTP runtime only invokes its existing audit INSERT; the source trigger performs spool insertion.

Default-off driver, separate two-connection worker pool/credential, one bounded coordinator, explicit isolated versioned evidence keys and local-versus-R2 configuration. LOCAL_SYNTHETIC storage is only for local construction and cannot prove protected hosted custody. Real R2 activation needs an actual independent EU bucket/credential/retention/conformance reference and reviewed release; no purchases/provisioning are performed here.

Eligibility is events before the current UTC midnight. The driver checks continuously for catch-up and emits a verified empty snapshot once per archive date when needed. A later old-dated commit can produce another run for that date; no permanent day-finality claim. All source audit rows remain in PostgreSQL; this adds no365-day purge or legal schedule conclusion. Limits are complete-or-fail technical bounds, never silent truncation. Oversized/corrupt/unavailable sources leave observable pending work for operator resolution.

### Gates

Real PostgreSQL source rollback/late commit, exact membership, duplicate/concurrent claim/ack, no raw worker/runtime access, immutable history and helper attachment, response/commit loss, provider/read-back failure, empty/date/DST, body bounds, key-version replay, actual local persistent objects, clean/populated72/repeated migration, default-off/misconfiguration, separate review/full wrapper/image/source-secret/provenance/cleanup gates. No local file, daily archive or session revocation establishes a complete recent restore window; ordinary service stays contained until actual reconciliation evidence exists.

Source-commit refinement selected before dependent guards: spool/run identities carry their actual creating xid8. Claim/source reads/acknowledgements reject the current transaction's uncommitted identities, in addition to normal visibility, so a claim cannot publish an uncommitted membership or acknowledge its own uncommitted creation. Source triggers retain original-table/depth checks; public trigger EXECUTE and base-table worker DML remain denied.

## Review

_Originally `BE/AUDIT_ARCHIVE_REVIEW.md`: Daily audit archive: distinct review._

2026-10-22; deliberate review after the initial focused PostgreSQL run. Backend/infrastructure only. No new subagent, frontend work, external message, provisioning or release.

Reviewed the complete migration, worker, independent storage protocol, separate pool/configuration, grants and test transaction boundaries. The first draft's PL/pgSQL CASE condition syntax was corrected after actual migration failure. No failed run was counted as acceptance.

Review refinements before final gate:
- Replace timestamp/high-watermark progress with atomic source spool and fixed membership, retaining old-dated late commits. Current-transaction source and run identities are excluded; uncommitted run work cannot be read or acknowledged.
- Scope trigger helpers to their original tables, revoke PUBLIC execution, derive immutable policy/run events from actual database principals, and guard member insertion against uncommitted audit sources. Membership counts and eligibility are checked at commit.
- Serialize claims, bind runs to historical worker/policy identity, and permit disabled-policy reconciliation of known pending objects. A fixed UTC cutoff never implies day finality or a complete PITR window.
- Complete database transactions before every provider operation. Stable part/manifest payloads use original creation time, membership and verified part receipt; receipt updates do not alter plaintext. Actual rollback and lost commit-response checks converge on the retained object identity.
- Preflight source size before loading rows and bound the resulting complete body. An oversized source retains its entire pending membership without a part receipt; no truncation or silent discard.
- Reject application/schema-owner credentials, broad base/view/function access, artifact-key reuse and duplicate/invalid key-ring configuration. Parser errors deliberately omit input/cause excerpts. Explicit LOCAL_SYNTHETIC mode cannot establish hosted independence; real R2 activation retains its separate reviewed conformance/custody gate.
- Use a separate one-task coordinator and two-connection pool; blocking independent I/O does not occupy the common scheduling thread. Default disabled configuration creates no worker/storage/pool. The exact new packaged artifact still needs its migration/startup/configuration/provenance/scan gates.

The narrow SQL acknowledgement is a trusted worker receipt, not a cryptographic proof inside PostgreSQL that a remote object exists. Actual storage read-back is enforced by the worker/protocol; protect that separate credential and independent keys. No purge or source redaction is introduced. Privacy exceptions must coordinate with pending and previously published archives before any mutation.

Focused/full/artifact results are recorded separately in AUDIT_ARCHIVE_VERIFICATION.md only after execution.

## Verification

_Originally `BE/AUDIT_ARCHIVE_VERIFICATION.md`: Daily audit archive: local verification._

2026-10-22; schema73,219 API operations unchanged. [Implementation](#implementation), [distinct review](#review). No audit purge, redaction or recovery release is supplied by this batch.

Reviewed focus34 passed (21 unit/13 real PostgreSQL), zero failures/errors/skips: `.tools/audit-archive-reviewed-focus.log`. Includes populated72/repeated migration, actual atomic source rollback and late commit, exact part/manifest, real receipt rollback/lost commit response, provider response loss, concurrent convergence, disabled-policy reconciliation, UTC daily/empty behavior,250+1 bounded catch-up, persistent file reopen/key rotation, actual dedicated login/two-connection pool, denied raw access/helper reattachment, immutable derived history and oversized complete-or-fail source membership. Earlier adjacent session/portable-flow regression checks also passed: `.tools/audit-archive-focus3.log` (19 unit/49 integration).

New packaged image migration/schema73 startup, non-root/read-only behavior, default-off/misconfiguration and actual archive policy enable/noop/disable/noop/re-enable passed. `.tools/vs12-audit-archive-container-smoke-result.json`. Image `sha256:3b1d815f340d240cf08362ab9964b3dc68997d2a9044f5b520b4684111c82ec7`; JAR SHA256 `2c1765c2f7cd5250802202c7a26e0db57a5216adaed0b36e5444cb305d0aae71`. Exact provenance matched959 application classes/78 resources and the unchanged native processor. Cached detected-package scan:25 MEDIUM/4 LOW, no HIGH/CRITICAL or detected Java findings. The manually built ImageMagick publisher-review limitation remains. Source-secret scan and shipping-class pinned Linux conditional publication/replay/reopen probe passed; local files do not establish hosted independence or power-loss survival.

Full wrapper passed **1,451 checks** (200 unit/1,251 integration), including973 HTTP and30 native image-processing scenarios, zero failures/errors/skips, in23:20 min. All620 frozen executable/test/build/grant/contract inputs matched. `.tools/audit-archive-final-verify.log`, `.tools/audit-archive-frozen-source.json`, `.tools/audit-archive-final-evidence.json`. Actual UTC-midnight/DST-fallback SQL probe passed10 cases across Belgrade/Sarajevo; its claims were rolled back and do not constitute verified archive/recovery evidence. Final owned container/network inventory is empty. One recorded Ryuk helper exited automatically after the first immediate post-JVM cleanup check; no unrelated resource was removed. Final acceptance passed after rechecking that inventory.

Provider calls are outside database transactions. PostgreSQL receipt acknowledgement trusts the restricted worker after real storage verification; it cannot itself cryptographically prove a remote object exists. Preserve that credential and independent key custody. No real provider conformance, EU bucket/retention qualification, legal/operator identity, recent PITR completeness, restore/client acceptance, merge or production deployment was performed. All source audit rows remain; manifests deliberately state dayFinal=false.
