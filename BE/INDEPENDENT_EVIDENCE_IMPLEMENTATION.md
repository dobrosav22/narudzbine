# Independent encrypted evidence storage foundation

Selected2026-10-22 under D-GOV-005 / D-PLAN-018 before dependent code, following verified complete JSON schema72. Dependency-first local construction: implement the independent object boundary before redaction preview/intent/commit/completion or daily audit producers. No new REST route, database mutation, redaction or completed recovery is authorized by a stored object alone.

## Boundary and identities

An internal audit API accepts typed family/resource UUIDv7/positive sequence identities: deletion intent, deletion completion, audit part and audit manifest. Object paths are fixed from that identity. Create-if-absent, bounded read and bounded identity listing only; no overwrite/delete/presign/public URL API. Producers remain responsible for verified source/authority and typed payloads. Completion may be produced only after actual database commit; this foundation cannot establish that semantic fact by itself.

Ciphertext is purpose/resource/family/sequence/key-version bound with a versioned explicit256-bit key ring. Retain old keys for old/held/recovery objects; do not alias one key under another version or reuse CSV/portable-artifact keys. Versioned binary framing is bounded before allocation. Max16MiB plaintext; no raw deleted content in later deletion intents. Read back and verify actual retained ciphertext, authenticate/decrypt and compare the expected payload before issuing a stable verified receipt. Same identity/content returns the retained original receipt; conflicting/malformed/wrong-key content fails closed. An uncertain create is resolved by reading that same identity. No guessed completion, overwrite or blind replacement.

Provider/file I/O is prohibited inside a database transaction. The S3/R2 adapter uses a separate supplied client/bucket, conditional If-None-Match create, bounded GET with actual digest verification and bounded list. SDK attempts are single and time-bounded. No media credential/bucket/delete authority is reused. Hosted account/bucket EU separation, conditional/retention behavior and key custody need actual future conformance; local mocked requests do not prove them.

## Local adapter and limits

The local file adapter is explicitly for local tools/tests. It writes and forces a private prepared file, then conditionally publishes a hard link; competing creators cannot replace an existing final object. Only prepared filenames owned by that operation are removed. Paths are canonical, contain validated identity segments and reject traversal, non-regular objects and redirected parent directories. The operator owns the private root; hostile co-owners/administrators and filesystem power loss are outside this adapter's claim. No ordinary HTTP bean activates it or creates directories on application startup.

Observed local probe `.tools/independent-file-probe-result.json`: actual NTFS concurrent conditional publication and retained bytes passed; directory force is unsupported here. This does not prove power-loss durability, WORM retention, independent host/account protection or hosted recovery. Tests must preserve this distinction. A production protected R2 bucket remains a separately gated configuration.

## Acceptance and next producers

Verify encryption isolation/versioned reads, same-content replay/conflict, corrupt/wrong-key/AAD/size rejection, response-loss read-back, unknown/missing reads, transaction exclusion, actual file publication races, redirected directories, bounded complete listings and S3 request/digest/error semantics. Then full wrapper, distinct review and change-triggered artifact gates. No source/fixture contents in logs.

A later daily archive must account for late commits: occurredAt/UUID order is not a safe committed high-water mark. Use pending source identities, verified per-object outcomes and explicit bounded run manifests; do not declare an old UTC day permanently complete while a transaction can commit an older event later. Outside-PITR objects do not fill an unknown recent restore window. Ordinary traffic/login/delivery stays contained until authoritative source/operator/provider/business reconciliation is complete.


Binary format1: ASCII `NZEV1` (5 bytes), unsigned one-byte key-version length, canonical ASCII `v1`..`v999999`, then the resource-bound AES-GCM envelope. The complete object is bounded before allocation, authenticates the full typed object path and key version, and has no plaintext payload/header fields beyond its key version. Provider metadata carries only format and ciphertext digest. Invalid response streams are aborted instead of drained; streaming reads have a15s checked deadline in addition to socket/call bounds. A blocked socket may reach its configured socket timeout before the next deadline check; no15s end-to-end delivery guarantee is inferred.
