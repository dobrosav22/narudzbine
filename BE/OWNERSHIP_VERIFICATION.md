# VS-01 ordinary ownership-transfer verification

2026-10-18, Europe/Budapest. [Implementation/refinements](OWNERSHIP_IMPLEMENTATION.md). Four transfer operations extend the locally implemented configured surface from29 to33. Default API/provider activation remains off; VS-01 is unfinished.

## Executed verification

Final Maven Wrapper verify passed: **151 tests, zero failures/errors/skips**. Fifteen unit/contract/architecture/MockMvc tests and136 real PostgreSQL integration tests: FoundationIT14, AuthHttpIT74, IdentityBoundariesIT11, PasswordLoginIT15, SessionServiceIT22. Same approved local Java25/Maven3.10/settings/cache wrapper command as [member evidence](MEMBER_VERIFICATION.md). Final detailed log: ignored .tools/vs01-ownership-release-verify.log; Surefire/Failsafe XML under BE/target.

Ten new real-HTTP groups cover both countries/types and staff/admin recipients; eligible-recipient/same-organization/current-owner safeguards; fresh authentication at the five-minute boundary; exact seven-day expiry and expiry precedence during member changes; one pending request, explicit replacement and repeat revocation; request identity replay/mismatch/stale organization revision; current owner/recipient-only reads and foreign/platform/wrong-actor denial; member deactivation/reactivation and role-change invalidation; atomic owner/role/account revision/epoch/session changes; two mandatory localized security records and queued email intents; accepted terminal replay without duplicate effects; strict request/CSRF/CORS/management boundaries; browser actual-transition cookie clearing and fresh-session replay preservation.

Actual concurrent HTTP commands verify duplicate request201/200 with one request audit; duplicate acceptance200/401 after session revocation with one accepted outcome; accept versus revoke, replacement and member deactivation; exactly one owner and either two or zero notice rows according to the winning transition. New recipient sessions remain retired after accepted response loss; fresh-login replay returns the consumed transfer metadata without issuing a token or repeating notices. This models response loss through resubmission; no network fault proxy or arbitrary process-crash injection is claimed.

Independently revoked INSERT grants on audit_event, security_notice and outbox_event force acceptance failures. Each rolls back owner/role/transfer/epoch/session effects and all notice rows; a subsequent authorized retry succeeds. Tests also reject deletion or binding changes to transfer history. The security-notice trigger uses the already tested append-only audit protection; its binding was checked in review. Locale-at-creation resolves to each recipient override or organization default; no provider send is performed.

Schema12-to13 upgrade preserves prior account preferences, browser/native sessions and audit history; old-schema readiness is rejected, repeated migration/current readiness pass. Existing clean/older-schema upgrades remain passing. The expanded run exposed a pre-existing member lock-order fixture that assumed same-millisecond UUIDv7 values sort by creation order. It now advances injected Clock between participant creation, guaranteeing the intended order without a runtime ID change, sleep or skipped assertion. Final full verification passed after this fix and the reviewed replay/expiry changes.

## Separate review

A separate primary-agent review checked final current authority and freshness, organization-before-sorted-participant/session guards, revision domains and natural request identity, immutable recipient/epoch binding, terminal action replay, virtual expiry revisions, one-owner deferred constraints, role/session revocation, mandatory no-opt-out/no-actor-suppression notice production, queue locale pinning and rollback boundaries. Review corrected cookie clearing on fresh-session accepted replay, added an affected-row assertion before transition audit, collected independent request validation errors, and preserved EXPIRED when member changes retire an already-expired request. ArchUnit allows only identity-to-notifications.api for the new producer port. No remaining blocker was found in this reviewed set; this was not an independent-agent or exhaustive review.

| Operation | Local acceptance evidence |
|---|---|
| requestOwnershipTransfer | Owner/freshness/recipient scope, organization revision, request replay/race, replacement, pending barrier and expiry |
| getOwnershipTransfer | Owner/recipient visibility, terminal/expired/invalidated projection, foreign/platform denial and activity |
| revokeOwnershipTransfer | Current-owner permission, repeat204, terminal denial, accept/revoke race and CSRF routing |
| acceptOwnershipTransfer | Recipient/freshness/revision/epoch, one-owner atomicity, device revocation, rollback, duplicate/racing actions, queued mandatory notices and safe terminal replay |

## Artifact and security evidence

- JAR SHA-256: `759106914d16e3f453c022563ae8ef6e983a7b062f3877bf4dd35e16276982a9`.
- Local narudzbine-backend:vs01-ownership image ID: `sha256:a1afacc7df8b9389c37d82c51b49b5fdbfb850109d42a3f6e003bd55f24f709e`. Scanner Metadata.ImageID matches the built/inspected image. No published registry RepoDigest exists.
- Packaged controlled migration asserts schema13; read-only/nonroot Linux startup passed. Private readiness200, public diagnostics404 and default-disabled transfer route404. Disposable containers/network were cleaned up. Real enabled HTTP tests use restricted runtime ownership DML, notice/outbox INSERT and append-only audit grants. Ignored detailed evidence: .tools/ownership-image-build.log and .tools/vs01-ownership-container-smoke-result.json.
- Trivy0.76.0 source secrets0; new image Java advisories0 and HIGH/CRITICAL0. Existing Ubuntu24.04 findings remain26 MEDIUM/4 LOW, no suppressions. Cached advisory DB updated2026-10-16/downloaded2026-10-17; no fresh-feed claim. Reports: BE/target/ownership-secrets.json and ownership-container-vulnerabilities.json; scanner logs under .tools.
- SBOM97 runtime components, all with license metadata; dependency/build/base-image declarations and approved Tomcat/Jackson overrides are unchanged. Separate repeated SBOM vulnerability and two-build reproducibility checks were not run; the new image scan includes Java packages. Historical evidence is not represented as new execution.

Structural contract/register/link/whitespace results are recorded in PROJECT_STATUS. These do not prove client/provider integration. OWNER_CHANGED security records and email intents are durable, but workers/rendering/provider delivery, notification-list APIs and full retention handling remain VS-07/G-04 work. Exceptional recovery remains X-05. No actual email/push was sent; no frontend application change, purchase, provisioning, deployment, remote CI, push or merge occurred. See [operations](../OPERATIONS_RUNBOOK.md) for schema/grants and activation boundaries.
