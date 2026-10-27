# Dependency and build specification

## External delivery adapter implementation - 2026-10-20

The schema52 delivery batch adds no Java/native dependency or BOM override. Fixed-endpoint JDK HTTP and JCA RSA/HMAC/AES support the explicit FCM/Resend adapters, with bounded wire/protocol/cryptographic tests. Google recommends client libraries; [the recorded choice](../backend/notifications/external-delivery.md#implementation) keeps this narrow flow and credential discovery explicit. Existing approved Java/Boot/Tomcat/Jackson/SDK/native pins remain unchanged; real provider conformance stays G-04.

## In-app inbox artifact - 2026-10-20

No Java/native dependency or native worker-role changes. Rebuilt schema50 image/JAR matched tests, source resources, smoke and cached scan; [batch evidence](../backend/notifications/inbox.md#verification) records exact identities and145 licensed Java/13 declared native components. Cache-age/manually built ImageMagick detection limits remain explicit; this is not fresh release-advisory status.

## Processed image delivery artifact - 2026-10-20

No Java/native dependency, native policy/build source or processing-role grant changes. New schema49 image/JAR were rebuilt and matched across tests, packaged smoke and cached scan; [batch evidence](../backend/media/image-delivery.md#verification) records identities,145 licensed Java/13 declared native components and scanner/cache limitations. Native source/publisher evidence remains in [native verification](../backend/media/native-processing.md#verification). A cached scanner is not fresh release/advisory conformance.

## Native image dependency execution delta — 2026-10-20

ImageMagick7.1.2-34 publisher source SHA-25655fe0ec246245b46c429f9e6bc65294ad4a78a66b88abd9817971ca157856323 verified; pinned Linux Temurin builder, Q8/non-HDRI/static Magick libraries, JPEG/PNG/WebP/lcms codecs and libseccomp, no OpenMP/modules/utilities/other optional delegates. Versioned [build lock](../../BE/native/build-packages.lock), [runtime lock](../../BE/native/runtime-packages.lock), [native inventory](../../BE/native/bom.json) and retained copyright paths are separate from the unchanged145 Java components. Failed official snapshot qualification and authenticated archive fallback, actual kernel confinement, publisher advisory review and scanner coverage limits are in [verification](../backend/media/native-processing.md#verification). No checksum or fresh scanner coverage is inferred from a version string. CI timeout35 minutes accommodates native source compilation and existing regression gates; no remote CI execution claim.

## Upload SDK execution delta — 2026-10-20

Approved AWS BOM2.55.13 is now consumed by s3 and url-connection-client; Apache/Netty clients explicitly excluded. Maven Central pinned mirror resolution passed. Runtime SBOM145 components all have license metadata; metadata is not legal distribution review. New SDK wire tests use a local HTTP service; no real R2 credentials/requests. Cached image/dependency vulnerability results belong to [upload evidence](../backend/media/upload.md#verification). Native ImageMagick/codec supply chain remains pending.


Current authority: P1.1 approved for backend/infrastructure implementation on 2026-10-16; VS-00 is locally verified; VS-01 is in progress. See [PROJECT_STATUS.md](../project/status.md). Historical candidate/authorization statements below describe the pre-approval record.
P1.1 review candidate — reviewed2026-10-16. No dependency installed or resolved in this planning phase. Selection is distinct from a successful build/security scan.

## Executed foundation evidence
The foundation artifacts have now been resolved, built, tested and scanned; see [VS-00 verification](../backend/platform/foundation.md#verification). Selection of later-slice dependencies below does not claim they are installed or verified. The security overrides are recorded in [patch approval](../backend/platform/security-patches.md#proposal).

## External authentication dependency increment, 2026-10-18

The authorized external-authentication batch adds the already-selected Boot-managed spring-boot-starter-security-oauth2-client4.1.1 (Boot module spring-boot-security-oauth2-client4.1.1), resolving Spring Security oauth2-client/core/jose7.1.1, Nimbus oauth2-oidc-sdk11.38.2/nimbus-jose-jwt10.9.1/content-type2.3/lang-tag1.7 and json-smart/accessors-smart2.6.0. No override to this graph was added. The resolved CycloneDX inventory has110 runtime components with license metadata; these OIDC libraries report Apache-2.0 and their ASM9.7.1 transitive reports BSD-3-Clause. Final full build, source/dependency/image scans and artifact identities are in [external verification](../backend/identity/external-login.md#verification). Cached advisory DB produced zero dependency/Java/HIGH/CRITICAL findings;26 MEDIUM/4 LOW base-image findings remain. This is local artifact evidence, not real-provider compatibility or current-feed certification.

## Runtime and build
| Component | Selected version/rule | Source and verification boundary |
|---|---|---|
| Eclipse Temurin |25.0.4.1+1, Java25LTS|[Official releases](https://github.com/adoptium/temurin25-binaries/releases/); use Linux x64 in deployment/CI, Windows x64 developer build |
| Spring Boot parent/BOM/plugin |4.1.1|[Compatibility](https://docs.spring.io/spring-boot/system-requirements.html) includes Java25; [managed coordinates](https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html) |
| Apache Maven |3.10.0|[Release](https://maven.apache.org/docs/3.10.0/release-notes.html); only-script wrapper, no wrapper JAR |
| PostgreSQL |18.6|[Release](https://www.postgresql.org/docs/release/18.6/); identical target for Testcontainers and provider preflight |
| ImageMagick |7.1.2-34|[Changelog](https://imagemagick.org/changelog/); JPEG/PNG/WebP only, restrictive policy and codec SBOM required |
| ArchUnit JUnit5 integration |1.4.2|[Official release](https://github.com/TNG/ArchUnit/releases/tag/v1.4.2); test scope |
| Apache Commons CSV |1.14.1|[Release notes](https://commons.apache.org/proper/commons-csv/changes.html); runtime import parser |
| AWS SDK Java v2 BOM |2.55.13|[Official releases](https://github.com/aws/aws-sdk-java-v2/releases); s3 + url-connection-client only for R2; no AWS hosting implied |

Maven groupId com.narudzbine, artifactId narudzbine-backend, initial version0.1.0-SNAPSHOT, one BE/pom.xml. Named modules are Java packages, not Maven submodules. Source encodingUTF-8; release25, no preview features; English identifiers. Class suffixes Request/Response/Entity/Repository/Service/Controller; tables singular snake_case, FK <entity>_id, constraint names uk_/fk_/ck_/ix_. Flyway names V<UTCyyyyMMddHHmmss>__<description>.sql; append-only immutable migration files after release. UTC build output timestamp supplied from commit for reproducible archives.
Use Boot-managed versions for selected starters/transitives, except the explicitly user-approved Tomcat11.0.26 and Jackson BOM3.1.7 security overrides (D-ENG-017,2026-10-16): spring-boot-starter-webmvc (Tomcat), validation, security, oauth2-client, data-jpa, actuator, flyway integration; PostgreSQL driver, Flyway core + PostgreSQL module, Jackson3, Hibernate, HikariCP, Micrometer, SLF4J/Logback. Include only needed starters; no reactive server, messaging broker, Lombok, generated mapper or Spring Data REST. Test starters for MVC/security/JPA plus spring-boot-starter-test, Testcontainers PostgreSQL/JUnit integration, JUnit Jupiter, AssertJ, Mockito. Boot parent manages compiler/Surefire/Failsafe/repackage plugin versions where supplied; G-01 must capture effective POM, not assume a plugin is managed.
Use Spring RestClient/JDK HttpClient for Resend/FusionAuth/FCM adapters; no third-party provider convenience SDK needed. FCM service-account OAuth JWT is signed with Spring Security's maintained JOSE library; token exchange with fixed Google audience/endpoint, cached until5 minutes before expiry. No custom JWT verification implementation. AWS SDK handles S3 signing, explicit bounded retry/timeouts. Provider DTOs stay private to adapters.
Use Java built-in cryptographic randomness/HMAC/SHA-256, injected Clock, immutable copied record collections, Bean Validation for structural validation plus named domain validators for cross-field rules. Null only at explicit DTO/persistence boundaries, Optional for optional return values, never Optional fields/JPA entities. No broad exception swallowing or reflection-based DTO mapping. Use SLF4J structured key/value logging with redaction tests.
No formatter dependency initially: commit EditorConfig conventions (UTF8/LF, four Java spaces,120column guidance) after implementation approval; check whitespace/import order in review. Required static checks are compiler warnings review, architecture tests, secret scanning, dependency/container vulnerability review and SBOM. Exact security-action executable revisions/digests and license inventory are recorded from verified official release artifacts in G-01; do not invent SHA checksums in planning.
Docker/OCI: multi-stage build with pinned Temurin base digest, nonroot runtime, readonly filesystem except bounded tmp, no embedded build credentials. Image includes executableJAR and restricted image decoder; no runtime package downloads. Pin all base/codec/test image digests on first authorized build; tags alone are insufficient. OS package/codec versions are determined by that immutable base build and included in SBOM. This is a mechanical artifact-verification gate, not an unresolved choice to use floating latest.
Testcontainers uses postgres18.6 image pinned digest, no H2 substitute. Windows uses an already licensed compatible Docker engine if available; otherwise G-01 records developer runtime prerequisite before installing anything. CI Linux hosted runner provides disposable containers.
No dependency download, Maven resolution, compiler run or container build occurred while writing this specification. G-01 must prove managed artifact names/versions, Java25 compatibility, licenses, known vulnerabilities, checksums and reproducible build; discrepancies require a recorded delegated revision before adopting replacements.
