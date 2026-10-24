# Targeted replay rotation verification

2026-10-19. Completed locally; hosted/operator/provider/client/full-release gates remain open.

## Reproduction and focused execution

.tools/replay-rotation-reproduction.log failed the regression as expected on the original code: replay of the same actor/key/body under a new revision-signing key applied the delta twice (10→12→14). This is an executed PostgreSQL defect reproduction, not an assumption.

.tools/replay-rotation-focused-2.log passed3 unit/architecture/contract checks and25 real PostgreSQL IT checks (24 stock/resend/rotation HTTP groups and1 previous-schema upgrade), no failures/errors/skips, BUILD SUCCESS. .tools/replay-rotation-legacy-resend.log additionally passed the genuine old-format resend producer/delivery/receipt scenario and original response reconstruction under rotation. Legacy fixtures exercise actual stock adjustment or invitation generation/delivery/audit transactions and old receipt column sets, never overwrite immutable receipt metadata. The migration test genuinely starts at schema35 and preserves its old resend row byte/field values through repeatable upgrade.

## Separate primary review

Reviewed the key split, startup lifecycle/transaction and singleton concurrent adoption, existing HMAC domain/payload bytes and unchanged advisory claim scope; current permission/CSRF and actor/product checks before replay; original response token preservation and nullable legacy fallback; permanent tombstone/expiry/rollback behavior; original resend UUID/payload identity and no provider call; read-only immutable binding and minimum runtime grants; default-off startup and schema alignment. No key values are stored/logged. Unknown historical keys cannot be recovered from hashes: the cutover runbook requires the actual original key and known-request evidence, and forbids blind regeneration/rehash/tombstone deletion.

No algorithm rewrite, bulk replay update or provider provisioning was introduced. The compatibility key is intentionally pinned; changing it requires a separately reviewed migration, not ordinary revision-key rotation. New direct orders already retain stable UUID fingerprints and original response revision; message submission remains unimplemented. Natural creation/deactivation/reconciliation replay still has separate revision-token/fingerprint coupling, recorded as a later compatibility gate before any real rotation; this batch does not claim every natural action is rotation-safe.

## Final executed full and artifact gates

.tools/replay-rotation-final-verify-2.log:599 tests passed, zero failures/errors/skips, BUILD SUCCESS. Surefire67; Failsafe532: Foundation37/AuthHttp447/IdentityBoundaries11/PasswordLogin15/SessionService22. Fresh XML totals agree. This includes8 new rotation HTTP/transaction groups and1 genuine schema35 upgrade/adoption check, with every prior regression. Current stock signature, legacy stock/resend receipt formats, permanent expired tombstones, changed-body denial, revoked authority, actual concurrent claim and producer rollback passed. Tests exercise real configured replacement controllers and signing objects in the shared synthetic application/database; actual hosted restart/secret-provenance/operator cutover remains a separate gate.

Packaged schema36 migration, nonroot read-only Linux startup, private readiness200/public diagnostics404 and default-disabled business endpoints passed (.tools/replay-rotation-smoke.log and .tools/vs04-replay-rotation-container-smoke-result.json). Final tested JAR equals the built/smoked/scanned image JAR; the later changes affected only migration test assertions. .tools/replay-rotation-final-evidence.json records the exact comparison. No executable/schema/test/build changes followed the final successful gate.

Trivy0.76.0 BE/target/replay-rotation-container-vulnerabilities.json: Java/HIGH/CRITICAL0; existing Ubuntu24.04 base26 MEDIUM/4 LOW. Offline advisory DB updated2026-10-16/downloaded17; Java DB updated18/downloaded19. This is not fresh production advisory status. Dependencies/build resolution are unchanged; prior dependency/license/advisory evidence is reused with those cache limits. Current SBOM110 components all have license metadata. Final source/root secret and document checks follow below.

## Remaining gates

Natural location/contact/taxonomy/product/promotion/draft creation and pricing-deactivation/reconciliation fingerprint/original-token compatibility remain a separate pass before any actual signing-key rotation. Pinned-key provenance, real secret backup/recovery, actual operator/hosted restart, provider/CI/client/full-slice/release acceptance remain open. No provisioning, production deployment, PR merge or frontend changes were performed. Next business implementation is genuine shared-draft submission/one-time consumption.

First full run was deliberately stopped after two old upgrade row-shape assertions failed solely on the added original_revision:null field. The tests now compare every prior field unchanged and independently require the new metadata to be null. No production source/schema change was needed; the final unfiltered rerun is authoritative. The already built/smoked/scanned image may be reused only if its JAR hash exactly matches that final tested artifact.

Final local image sha256:55f7439afc588513ab43660fe8d03299b263fe764e6f126493757291952bdbfd; JAR SHA2560bcb25c7d983063f62fc51989f16cc587cef456c3d2156882a07c19267ea1c78.

Final BE/target/replay-rotation-secrets.json:0 secret findings across backend/root sources, using offline secret-only scanning and excluding generated/tool/FE history. Structural/link/register/whitespace checks passed209 operations/204 schemas/3046 references,625 questions/545 decisions/543 requirements and trace rows. Packaged-check task-prefixed container/network inventories were empty after cleanup. No executable/schema/test/build changes followed the successful full gate.
