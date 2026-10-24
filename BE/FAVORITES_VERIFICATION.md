# Shared buyer favorites verification

2026-10-19. Backend/infrastructure only; local synthetic resources, no provider provisioning, deployment or frontend changes.

Focused .tools/favorites-focused-final.log passed15 real-HTTP/transaction groups, one schema31-to32 upgrade and3 architecture/contract checks, zero failures/errors/skips. Two deterministic page-churn unit checks subsequently passed with the full suite unit phase.

Distinct primary review covered buyer-owned desired state, current authority on repeat, browser CSRF, sorted page/party locks before session/account, bounded page rediscovery, retained null projection, current safe offer/price resolution, optional partner lookup, least runtime grants and migration invariants.

The initial focused run exposed a normal suspended-partner lookup throwing inside a transactional port and marking rollback-only. Corrected with optional lookup; corrected synthetic platform-account migration fixture and strict no-body expectation, then focused checks passed. The first full run identified the extracted offer mapper requiring HTTP-only revision configuration while HTTP was disabled; stopped that run, applied the same default-off HTTP condition and restarted all checks. No failed run is acceptance evidence.

Final unfiltered .tools/favorites-final-verify-2.log passed520 tests, zero failures/errors/skips, BUILD SUCCESS. Surefire57; Failsafe463: Foundation33/AuthHttp382/IdentityBoundaries11/PasswordLogin15/SessionService22. Fresh XML totals agree with the log. This includes15 favorites HTTP/database groups, two bounded-page race unit cases and the schema31 upgrade alongside prior regressions. The final startup condition correction was reviewed and the entire gate rerun. No executable/schema/test/build change followed this successful gate. Rebuilt artifact results are recorded below.

## Artifact checks already executed

Corrected final artifact: image narudzbine-backend:vs09-favorites, ID sha256:ccfa0db7974e8238b13b4973c659b663b5be4595ece19c33466e7d669acf98be. JAR SHA256 7e9a36a7ab1a25dea26619812035ee3796858021bc2871dd3494e5fe4656fb92. Host JAR, stored hash, image JAR, built image, smoke and scan identities match. .tools/favorites-image-build.log, .tools/favorites-smoke.log, .tools/vs09-favorites-container-smoke-result.json and .tools/favorites-scanned-jar.sha256 contain local evidence.

.tools/vs09_favorites_container_smoke.py passed controlled schema32 migration, nonroot read-only packaged Linux startup, private readiness200/public diagnostics404 and default-disabled favorites routes404 with prior routes. Disposable resources were removed. The first pre-fix image failed readiness; its log is .tools/favorites-smoke-before-startup-fix.log, not acceptance evidence.

Trivy0.76.0 BE/target/favorites-container-vulnerabilities.json reports Java/HIGH/CRITICAL0, unchanged Ubuntu24.04 base26 MEDIUM/4 LOW. Scan used offline existing cache: vulnerability DB updated2026-10-16/downloaded17; Java DB updated18/downloaded19. This is not fresh production advisory status. SBOM110 components all have license metadata; dependencies/build resolution did not change, so earlier separate dependency/license/advisory evidence is reused within the same cache limits. No suppression was added.

Final backend/root-document secret scan BE/target/favorites-secrets.json found0 secrets. Structural/link/whitespace/register checks passed:209 operations/204 schemas/3046 references,625 question IDs/545 decisions/543 requirements and543 trace rows. No executable/schema/test/build changes followed the final successful gate.

## Remaining gates

Shared drafts, order review/submission/original stock credits/reorder, CSV/bulk/media, load/query-plan evidence, real providers/hosted CI/restore/operator/client/full-slice/release acceptance remain unfinished. These tests do not prove frontend integration or guaranteed checkout terms. See [refinement](FAVORITES_IMPLEMENTATION.md), [handoff](../FRONTEND_HANDOFF.md), [status](../PROJECT_STATUS.md).
