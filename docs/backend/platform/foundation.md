# VS-00 implementation refinements

One record per backend feature: Decisions, Verification. Domain index: [backend](../README.md).

## Decisions

_Originally `BE/FOUNDATION_DECISIONS.md`: VS-00 implementation refinements._

2026-10-16. Selected under D-GOV-005 and approved P1.1 implementation authority; these refine D-PLAN-020/021/025 without changing business rules.

- Use Maven Wrapper3.3.4 only-script, Enforcer3.6.2 and CycloneDX2.9.1. Their artifacts were resolved from Maven Central. Boot4.1.1 manages compiler3.15.0, Surefire/Failsafe3.5.6, Flyway12.4.0 and Testcontainers2.0.5. Wrapper distribution SHA-256 is verified against the downloaded Maven3.10.0 archive, itself checked against published SHA-512. Restrict resolution to Maven Central through committed settings; transitive POM repositories are not trusted implicitly.
- Runtime schema marker plus Flyway checksum/pending-migration validation runs before Tomcat factory setup. Ordinary startup never calls migrate. PostgreSQL18.6 is the verified baseline; an upgrade needs recorded compatibility evidence. Use a distinct explicit --migrate entry mode with migration-only environment credentials. It starts no Spring/HTTP context.
- Default management binds loopback, not all interfaces. The actual hosted private network/monitoring arrangement remains G-03. A small per-request DB/schema gate fails business requests closed during outages; private readiness reflects schema state, and liveness remains separate. Measure overhead before changing to the proposed periodic-monitor optimization.
- Foundation business security denies every route until VS-01. No placeholder users/default password/provider JWT access is introduced. Request correlation IDs are server-generated; logs contain status/duration and safe event identifiers only, never submitted headers/URI/query/body. Authentication transports and external-provider ports will be implemented in their owning slice rather than speculative unused interfaces.
- Runtime JAR is compiled/tested once, then copied into a multi-stage assembly image. The runtime is nonroot and designed for a read-only filesystem plus bounded temporary mount. Temurin Linux AMD64 manifests are pinned. ImageMagick belongs to VS-11; its build/codec evidence remains blocked until that slice.
- GitHub Actions checkout/setup-java/upload-artifact revisions are pinned to verified immutable commits. CI verifies and stores evidence; it neither publishes nor deploys. G-01/G-03/G-04/G-06 are not globally completed by foundation tests. No prior-release upgrade test can run before a first release exists; clean install and repeat migration are tested now.
- Use Trivy0.76.0 from the official release, verify its archive checksum, and scan the dependency SBOM, backend source for secrets and the assembled image. Findings require triage; a scanner download or database failure must not be called a clean scan. Real security/provider/load/restore acceptance remains later work.
- Explicit user approval under D-ENG-017 permits only the targeted Tomcat11.0.26 and Jackson BOM3.1.7 security overrides; Boot stays4.1.1. Resolution, repeat clean builds and both scans verified the change; remaining base-image findings are recorded in [verification evidence](#verification).

Sources: [Maven Central](https://repo.maven.apache.org/maven2/), [Trivy0.76.0 release](https://github.com/aquasecurity/trivy/releases/tag/v0.76.0), [Spring Boot dependency coordinates](https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html). Actual artifact checksums/results are recorded in FOUNDATION_VERIFICATION.md when available.

## Verification

_Originally `BE/FOUNDATION_VERIFICATION.md`: VS-00 verification evidence._

2026-10-16. P1.1 implementation baseline. VS-00 is locally verified; the full backend and production release remain unfinished. This record supersedes the earlier foundation results before the security patches.

### Executed checks

| Check | Actual result |
|---|---|
| Two clean Maven Wrapper builds | Both passed on Windows with Temurin25.0.4.1+1, Maven3.10.0 and Boot4.1.1. Each ran eight tests: four unit/architecture/contract tests and four PostgreSQL integration tests; zero failures, errors or skips. |
| Database integration | PostgreSQL18.6 in Docker; clean and repeated migration, restricted runtime role, schema mismatch/empty/unavailable database startup failure, Hibernate type validation, runtime readiness loss and separate liveness. |
| Boundaries and safe logging | Forbidden package dependencies rejected; allowed dependency example accepted; OpenAPI structural/reference assertions passed; synthetic request secrets excluded from safe request logs. |
| Resolved dependency overrides | All three embedded Tomcat artifacts11.0.26; Jackson core/databind3.1.7; Boot remains4.1.1. Jackson annotations2.21 is the version selected by the Jackson3 BOM. |
| Reproducible JAR | Two clean builds produced identical SHA-256, shown below. Same timestamp and toolchain; this does not claim byte identity across different operating systems. |
| Dependency inventory | CycloneDX contains97 runtime components; every component has license metadata. Metadata presence is not a legal review or fulfillment of distribution notices. |
| Dependency vulnerability scan | Trivy0.76.0 found zero advisories in the patched runtime SBOM. The original inventory had three CRITICAL, five HIGH and two MEDIUM findings. |
| Container verification | Linux AMD64 image built from the tested JAR. Packaged migration succeeded; runtime started as UID10001:10001 with read-only filesystem, bounded tmpfs, dropped capabilities and no-new-privileges. Private readiness200; public diagnostics and unimplemented business routes404. Disposable containers/network were removed. |
| Container vulnerability scan | Zero HIGH/CRITICAL findings and zero Java advisories. Ubuntu24.04 base retains26 MEDIUM and4 LOW findings; see follow-up below. |
| Backend source secret scan | Zero findings. Offline source-only scan excludes generated target files; it is not a substitute for dependency scanning. |

Build command from BE: `./mvnw.cmd -B -ntp -s .mvn/settings.xml clean verify help:effective-pom -Doutput=target/effective-pom.xml dependency:tree -DoutputFile=target/dependency-tree.txt`. Local runs additionally set JAVA_HOME and ignored workspace Maven caches. Both builds generated a fresh SBOM online. Container command from root: `docker build --platform linux/amd64 -t narudzbine-backend:vs00 BE`.

Scanner commands from root, using the verified Trivy executable and local cache:

```text
trivy sbom --format json --output BE/target/dependency-vulnerabilities.json BE/target/bom.json
trivy image --scanners vuln --format json --output BE/target/container-vulnerabilities.json narudzbine-backend:vs00
trivy filesystem --offline-scan --scanners secret --skip-dirs BE/target BE
```

Local detailed reports are generated/ignored. CI retains test reports, inventory, effective POM, dependency tree and vulnerability reports for14 days and fails on HIGH/CRITICAL findings or scanner errors. The committed GitHub workflow has not run remotely yet.

### Artifact identity

| Artifact | Verified SHA-256 |
|---|---|
| Patched executable JAR, both clean builds | `5a39a98c81a4ef0846142fb238a75cafdd74174419e262b95d3bbf97d3dfbf20` |
| Local patched image | `29bd709be29c586728edf1318a3d9270c1b5678889222f72890d813e71eecf2a` |
| Windows Temurin25.0.4.1+1 archive | `00c847d804f4a78e9f04f2683faf14fed898535b177b7fc704486cb0284e9283` |
| Maven3.10.0 distribution archive | `1f6d9909266510f039f59aa0e13dcd2c66da85f043e56276e41f2918f8bddaff` |
| Trivy0.76.0 Windows archive | `7b4762a5a5326cb4b83dfd2bb5d9aaf15a1ed867c75cad7dd8b38840a28e7be6` |

The Dockerfile pins separate Linux Temurin build/runtime manifests; the PostgreSQL integration test pins its18.6 image digest. The Maven distribution was also checked against its published SHA-512; scanner archives against official release checksums. No floating artifact is substituted for these pins.

### Remaining follow-up and limits

- Base-image findings remain visible and unsuppressed. Two MEDIUM findings have advertised Ubuntu fixes: CVE-2026-95512 in libfreetype6 (`2.13.2+dfsg-1ubuntu0.2`) and CVE-2026-46675 in libpng16-16t64 (`1.6.43-5ubuntu0.7`). The other28 findings have no fixed version in this scan. Before production, rebuild from a verified updated base or record explicit disposition and rescan; a passing HIGH/CRITICAL gate does not mean zero vulnerabilities or proven non-exploitability.
- Reviewed nonfatal tool warnings: Mockito/Byte Buddy dynamic-agent loading on Java25; CycloneDX schema annotations not recognized by its validator; Trivy ignores unsupported SHA-384/SHA3 SBOM hashes and warns about third-party inventory. The independent image scan also found no Java advisories. These warnings were not counted as failed tests or suppressed security findings.
- No hosted provider calls, infrastructure provisioning, production deployment, GitHub workflow execution, full OpenAPI meta-schema validation, load/penetration tests, previous-release migration test or restore drill has run. No previous backend release exists yet.
- G-01 evidence covers the installed foundation artifacts only. Media codec/ImageMagick and future slice dependencies still need their own inventory/compatibility checks; G-02..07 remain open as applicable. Provider interfaces/fakes belong to their consuming slices, as recorded in FOUNDATION_DECISIONS.md.
- This verifies the foundation only. It does not establish authentication, country/organization authorization, order correctness or completion of the543 requirement assertions. Business routes remain denied until their slices are implemented.
