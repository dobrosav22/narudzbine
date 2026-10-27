# Local release and rollback exercise — next batch

One record per backend feature: Implementation. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/LOCAL_RELEASE_IMPLEMENTATION.md`: Local release and rollback exercise — next batch._

2026-10-23 delegated selection under D-GOV-005 before dependent implementation. Recovery code is frozen separately. Add a reproducible synthetic local Docker exercise using explicitly selected immutable local image IDs and pinned PostgreSQL. A local Docker config image ID is not a registry manifest digest: do not invent a registry promotion result.

Inspect the packaged JAR's declared schema and required operational capabilities without starting an unknown entrypoint. Reject a candidate missing recovery containment or authenticated backup commands. An older schema-compatible image may still lack required recovery capabilities and must not be accepted as a complete release rollback. Preserve the currently accepted image as the operational rollback when required capabilities differ; fix forward while containment stays active if no compatible predecessor exists.

Verify fresh controlled migration and repeat/concurrent migration against disposable source state, exactly one successful history per migration and no schema-clean/drop. Use explicit migrator credentials only for the separately invoked --migrate command. Ordinary server startup must not migrate. Start/readiness check the same immutable ID across two local environment configurations. Rehearse compatible normal API-only previous-image startup separately from whole-release compatibility. An incompatible schema image must be rejected before serving HTTP by the existing schema startup guard; never restore a database to simulate an application rollback.

Only fresh owned networks/containers and synthetic credentials/data. Network isolation, read-only non-root apps, dropped capabilities, private management probes and deterministic cleanup. No GHCR push, remote staging, provider provisioning, merge or production release. Record actual image/JAR identity, schema, observed results and operational limitations without bodies/secrets. Then local realistic load and developer/provider harness work; do not ask for another continuation prompt. Full release still requires approved registry/provider/operator/client/legal and empirical gates where applicable.
