# Ordered session-guard query — selected prototype

One record per backend feature: Implementation. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/SESSION_GUARD_QUERY_IMPLEMENTATION.md`: Ordered session-guard query — selected prototype._

**Not promoted.** Reduced candidates did not meet all targets. Retain their source/result evidence, but do not implement these production changes as remaining features. The unchanged verified application passed the reduced [Linux private-network comparison](linux-local-load.md#implementation); continue infrastructure verification there.

2026-10-23, delegated D-GOV-005 refinement after complete default-profile run5f37f9f6 failed and explicit local database-profile reduced calibration also missed burst capacity. No new business policy or user answer. Preserve every earlier failure; do not launch another full dataset without a successful bounded candidate.

Current SessionService.lockSessionHash uses separate token/account-kind lookup, membership identity lookup, organization SHARE, membership SHARE, account UPDATE, session UPDATE and method validation. Successful activity intentionally authenticates again in the same transaction. This creates repeated client round trips while holding the same authority guards; normalized diagnostics show idle-in-transaction/client waits. This supports a query-consolidation prototype, not a proven initial timeout cause.

Keep both authentication passes and all current validation. Replace only the session guard acquisition query path: one preliminary immutable token/account-kind/organization-identity lookup, then one SQL statement with explicitly MATERIALIZED dependent guards in the existing order: organization SHARE, business membership SHARE, account UPDATE, session UPDATE. Platform accounts skip only organization/membership as before. A later guard depends on the earlier guard's actual row, so acquisition cannot be reordered across the dependency. Inactive organization must still stop before account locking; invalid account must stop before session locking. Fresh account/session fields are read under those guards, followed by the unchanged method-availability and injected-clock checks. Preserve all old locks, role protection, credential generations/epochs, pending-operation denial, verified/active state, transport, revocation and strict idle/absolute expiry boundaries.

No transaction/thread cache or authorization receipt, no cross-request state, no skipped final check, no deadline/durability/rate change, no provider call, no new migration/dependency/API/role/business scope. Original issue/account-changing paths keep their existing guard protocol. Immutable identity/binding prerequisites are already database-enforced; a concurrently rotated token still fails the final token lookup after locks.

Implement first as an isolated source-manifest-bound reduced prototype against the same v1 database profile/90-second burst used in calibration. If it succeeds, promote to maintained source, add meaningful real-database/HTTP lock-order and revocation checks, perform separate source review, required full frozen wrapper verification and fresh exact shipping-artifact gates. Only then run the unchanged full workload. A reduced pass or correct query shape is never full capacity or production acceptance.

Prototype2a5df499 completed all10,300 responses with no HTTP errors, but burst97.4393rps/200 drops/read p951039.253ms/write1247.936ms still failed; owned DB removed and shipping JAR unchanged. Compared v1 database baseline89.1475rps/900 drops, this supports shorter guard queries but is not accepted capacity. Next bounded calibration pairs the same prototype with the already-measured v2 durable group-commit profile at runtime32 versus64. Local PostgreSQL ceiling remains100 (plus owner-monitor2);64 is diagnostic only until separately justified. Do not change the maintained runtime32, authority/durability/targets or launch another full scenario merely for a closer failure.
