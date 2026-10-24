# Agreed buyer-price verification

2026-10-19, local backend/infrastructure evidence. No frontend changes, provider provisioning, purchase, push, merge or deployment. Local uncommitted files are not a remote backup.

## Executed checks

Focused `.tools/agreed-focused-4.log` passed14 new HTTP/transaction groups plus actual schema26-to27 migration preservation, zero failures/errors/skips. Two later aggregate-revision/empty-review-audit groups are included in the unfiltered gate. Earlier test-declaration syntax/encoding errors were fixed without skipping checks.

Tests cover both countries, positive two-decimal strings/maximum and invalid money, absent/create versus current update revisions, normalized no-ops, deletion tombstones/new recreation identity, immutable history, vendor staff scope, buyer/platform/foreign denial, strict queries/JSON, pages/totals and browser CSRF/CORS. Agreements persist without base prices and do not activate products.

Actual persisted disconnect/reconnect generations make retained prices dormant again. Selected review confirms only selected products; same-value active saving confirms only that product. Invalid/duplicate/missing selections fail atomically; empty review is permitted only for an empty current set. Stale relationship/aggregate tokens reject. An intervening price edit invalidates aggregate review even without a relationship revision change. Final dormant removal clears the summary flag.

Real PostgreSQL blocking exercises same-revision writes, confirmation versus edit, and committing staff removal. History/audit INSERT failures roll back agreement values/generations/tombstones/aggregate revision; confirmation/empty-review audit failure leaves required relationship state unchanged. SQL guards reject zero/excess-precision/future-generation values, destructive history changes and tombstone revival.

Schema26 fixture contains a genuine domestic relationship after actual disconnect/reconnect; migration27 preserves its exact state/generation/required flag, initializes only an empty aggregate revision and invents no agreement/history/confirmed terms. Repeated controlled migration/readiness and clean startup are checked.

Distinct primary review checked scope/current authority, sorted pair guards before actor/session locks, generation and selected-set freshness, null-create/recreation identity, decimal constraints, atomic history/audit, module API boundaries and endpoint feature gating. Review corrected preliminary lock order and added explicit empty-review audit. The first unfiltered run caught conditional trading-bean registration in HTTP-disabled contexts (Foundation and SessionService); domain registration was decoupled from endpoint flags. The initial packaged readiness check consequently failed and was repeated against the corrected artifact.

Final unfiltered wrapper `.tools/agreed-final-verify-2.log`: **411 tests, zero failures/errors/skips**, BUILD SUCCESS. Surefire40; Failsafe371 (Foundation28/AuthHttp295/IdentityBoundaries11/PasswordLogin15/SessionService22). All16 new HTTP/transaction groups and the schema26-to27 preservation fixture run alongside prior regressions. Both HTTP-enabled and HTTP-disabled contexts pass. Final host JAR hash matches built/smoked/scanned image identities. No executable/schema/test/build change followed this gate.

## Packaged artifact and scans

- Corrected local image narudzbine-backend:vs04-agreed-prices, image ID sha256:8908b6bc6ad84797b4fa85723a67b016c3d1a34e91ac766ae0c7a2524a780a67; JAR SHA256 162e24ac3dddcc2c0c583e77afe889bd16109e711bd24022415d6950b4ec638a. These are local identities, not published registry digests.
- Packaged schema27 migration, nonroot read-only Linux startup, private readiness200/public diagnostics404 and all four new default-disabled route/method combinations404 passed, plus earlier smoke routes. Disposable test resources were removed. `.tools/vs04_agreed_prices_container_smoke.py` and `.tools/vs04-agreed-prices-container-smoke-result.json` bind schema/image/JAR; corrected run `.tools/agreed-smoke-2.log`.
- Trivy0.76.0 corrected-image scan reports Java/HIGH/CRITICAL0 and existing Ubuntu24.04 findings26 MEDIUM/4 LOW; no suppression. BE/target/agreed-container-vulnerabilities.json Metadata.ImageID matches the corrected image. Advisory DB updated2026-10-16/downloaded17; Java identification DB updated18/downloaded19; both reused offline without refresh. Not fresh production advisory status.
- SBOM110 components, all licensed; dependencies unchanged, so separate prior dependency/SBOM advisory evidence is reused against the same database. Changed-source secret scan0. Structural/link/whitespace checks pass with209 operations/204 schemas/3041 resolved references,625 questions/545 decisions/543 requirements and543 trace rows; JSON/YAML agree.

## Limits

No actual ACTIVE/activation, inventory, promotions, buyer offer/review/submission or order producer exists in this increment. Storage/confirmation does not establish R-PRI-004 offer precedence, ordinary-price deletion fallback or promotional outcomes end to end; these remain later integrations. No actual client/provider/hosted CI/load/operator/recovery acceptance is claimed. Full VS-04 remains unfinished. [Implementation](AGREED_PRICE_IMPLEMENTATION.md) and [handoff](../FRONTEND_HANDOFF.md) define the backend boundary.
