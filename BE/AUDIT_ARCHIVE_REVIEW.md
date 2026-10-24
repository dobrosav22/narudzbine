# Daily audit archive: distinct review

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
