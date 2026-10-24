# Independent daily audit archive

Selected2026-10-22 under D-GOV-005 / D-PLAN-018 before dependent code, after locally verified independent encrypted storage. No new customer/admin export route, raw archive download, purge, redaction or recovery release.

## Source and publication

A protected source spool is inserted atomically with every audit_event and backfilled from actual existing events during migration. Rollback leaves neither event nor spool. Pending membership is selected from committed visible rows, not a timestamp/UUID high-water mark. A late transaction with yesterday's occurredAt remains pending and is included in a later run. Never declare a UTC day permanently complete from one snapshot.

Each bounded run has one fixed part (at most250 audit records) plus a completion manifest under AUDIT_PART/AUDIT_MANIFEST with run UUIDv7/sequence1. Identity, UTC archive date, cutoff, creation time, policy version and source membership are immutable. Explicit record DTOs preserve actual audit fields/nullable scope, including private reason only inside encrypted archive bytes. No account credentials, raw message tables or arbitrary database dump is read. Source data is append-only today; a future privacy exception must coordinate with pending archives and independent deletion evidence.

The part and manifest are each conditional-created and read-back verified outside database transactions. Only after verification does the dedicated worker acknowledge the matching receipt in PostgreSQL. A response/commit loss inspects the same run/object identity; no duplicate membership, guessed success, overwrite or new replacement object. Concurrent workers may converge on the same immutable object and receipt. Run manifests prove the captured membership, not absence of later old-dated commits or completeness of an unknown PITR window.

## Technical authority

Archive policy is controlled configuration, not impersonation of a platform user. Versioned policy history records the actual database session/effective principal and reviewed configuration reference. No fictional SYSTEM audit actor is introduced; technical source/run transitions have their own immutable events. New runs require an enabled policy; disabled acceptance may still reconcile its known pending objects. A dedicated role has fixed approved-run source views and narrow claim/acknowledgement functions, no raw audit/account/credential SELECT, commercial DML, schema ownership or evidence deletion. Normal HTTP runtime only invokes its existing audit INSERT; the source trigger performs spool insertion.

Default-off driver, separate two-connection worker pool/credential, one bounded coordinator, explicit isolated versioned evidence keys and local-versus-R2 configuration. LOCAL_SYNTHETIC storage is only for local construction and cannot prove protected hosted custody. Real R2 activation needs an actual independent EU bucket/credential/retention/conformance reference and reviewed release; no purchases/provisioning are performed here.

Eligibility is events before the current UTC midnight. The driver checks continuously for catch-up and emits a verified empty snapshot once per archive date when needed. A later old-dated commit can produce another run for that date; no permanent day-finality claim. All source audit rows remain in PostgreSQL; this adds no365-day purge or legal schedule conclusion. Limits are complete-or-fail technical bounds, never silent truncation. Oversized/corrupt/unavailable sources leave observable pending work for operator resolution.

## Gates

Real PostgreSQL source rollback/late commit, exact membership, duplicate/concurrent claim/ack, no raw worker/runtime access, immutable history and helper attachment, response/commit loss, provider/read-back failure, empty/date/DST, body bounds, key-version replay, actual local persistent objects, clean/populated72/repeated migration, default-off/misconfiguration, separate review/full wrapper/image/source-secret/provenance/cleanup gates. No local file, daily archive or session revocation establishes a complete recent restore window; ordinary service stays contained until actual reconciliation evidence exists.

Source-commit refinement selected before dependent guards: spool/run identities carry their actual creating xid8. Claim/source reads/acknowledgements reject the current transaction's uncommitted identities, in addition to normal visibility, so a claim cannot publish an uncommitted membership or acknowledge its own uncommitted creation. Source triggers retain original-table/depth checks; public trigger EXECUTE and base-table worker DML remain denied.
