# Complete portable JSON batch: separate review (2026-10-22)

A deliberate pass over the final service/controller, source mappings, SQL state/privilege boundary, worker and contract was performed after the initial focused checks. This is distinct from writing the implementation; full and packaged acceptance remain pending.

Resolved findings:
- Security-chain/CORS registration must accompany the six routes; the real HTTP test caught the missing registration before acceptance.
- Latest administrative metadata must use generation order, not client UUID or equal injected timestamps. Same-natural-ID approvals serialize and cross-case reuse fails closed.
- Ownership transfers require ordinary current owner/recipient visibility and virtual expiry/invalidation/revision, not only their stored state. Source projection now matches those rules and excludes epochs.
- Worker startup must tolerate only the existing public hold-state column, while denying every other base source/identity/artifact column and all commercial DML. Separate restricted-role generation and overprivileged-role rejection are executed.
- The HTTP grant file includes qualification SELECT/locking directly; enabling JSON does not require granting private-case review disclosure capability.
- Snapshot failures fail the whole job after the read-only transaction; publication failures are outside that catch and retain their actual outcome. Deadline checks cover the final serialization step, not only rows.
- Held EXPIRED ciphertext counts toward capacity and key preservation. Logical expiry remains available through ordinary case metadata while action/worker flags are off.

Focused evidence: `.tools/portable-json-reviewed-focus.log` passed10 unit/19 integration, including2 actual HTTP scenarios and16 dedicated PostgreSQL cases. The latter exercises current requester, both countries/types, immutable approval replay, integrity rollback, real restricted views, populated pricing/history, held disposal/capacity, actual committing role reduction, source-grant loss, whole-document row/Unicode-byte bounds and an actual bounded PostgreSQL timeout. `.tools/portable-json-config-focus.log` passed3 independent configuration tests. Final direct-runtime raw-column denial assertions and default-off route coverage are included in the forthcoming full gate; do not claim those new assertions executed before it passes.

Remaining release limits: synthetic local identities/fixtures only; no live provider, legal/operator enrollment, client integration, independent recovery/restore or production acceptance. A complete portable JSON export does not authorize redaction or replace the independent encrypted deletion-intent/completion ledger.
