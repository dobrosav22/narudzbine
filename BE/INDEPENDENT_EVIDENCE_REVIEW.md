# Independent evidence foundation: separate review

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
