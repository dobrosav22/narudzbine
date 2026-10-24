# Dependency security patch proposal

2026-10-16. APPROVED AND VERIFIED under D-ENG-017: user answered “Approve the two security overrides (recommended).” Applied to pom.xml; both clean builds, eight tests per build, packaged container smoke test and dependency/container scans passed their foundation gates. See [verification evidence](FOUNDATION_VERIFICATION.md).

The resolved Boot4.1.1 baseline includes Tomcat11.0.24 and Jackson3.1.5. Trivy0.76.0 found three CRITICAL, five HIGH and two MEDIUM dependency advisories. Scanner severity is not an exploitability assessment: Apache rates some Tomcat findings lower and affected features vary. Upstream patch releases are available, so the recommendation is to update before enabling real business traffic.

Spring Boot4.1.1, Java25 and PostgreSQL18.6 are unchanged. These approved properties now align all Tomcat artifacts and the complete Jackson3 BOM:

```xml
<tomcat.version>11.0.26</tomcat.version>
<jackson-bom.version>3.1.7</jackson-bom.version>
```

Post-change scans found zero Java dependency advisories and zero HIGH/CRITICAL container findings. The base image retains26 MEDIUM and4 LOW findings, recorded without suppression in the verification evidence for follow-up before production. The patched artifact remains local-only; this is not production-release acceptance.

Evidence: [Apache Tomcat security advisories](https://tomcat.apache.org/security-11.html) document fixes through11.0.26; [Jackson3.1.7 release](https://github.com/FasterXML/jackson/wiki/Jackson-Release-3.1.7) documents the parser/cache/allocation fixes. Local detailed inventory/scan: target/bom.json and target/dependency-vulnerabilities.json (generated, not committed).

Authority: DECISIONS.md D-ENG-017 explicitly says “require approval for overrides.” This is a specific override of the previously approved dependency-management convention, not a new routine business questionnaire. No provider purchase, deployment or framework-major upgrade is proposed.
