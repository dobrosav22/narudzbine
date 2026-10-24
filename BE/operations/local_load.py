"""Exercise the backend design load with local disposable synthetic data; full mode takes at least35 minutes after fixture setup."""
from pathlib import Path
import argparse, json, os, subprocess, sys, time, urllib.parse, xml.etree.ElementTree as ET, uuid, re, hashlib, zipfile
from synthetic_load_runtime import load_profile, run_linux

def stop(message):
    raise SystemExit(message)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--java-home", type=Path)
    parser.add_argument("mode", choices=["check", "full"])
    parser.add_argument("--runtime", choices=["linux", "host"], default="linux")
    parser.add_argument("--image", default="narudzbine-backend:local", help="Preverified Linux image containing the current packaged JAR")
    args = parser.parse_args()
    repository = Path(__file__).resolve().parents[2]
    backend = repository / "BE"
    profile = load_profile(backend / "operations" / "local-load-postgres.json")
    if "OPERATIONS_RECOVERY_CONTAINED" in os.environ:
        stop("Use an unpinned isolated test environment; this exercise creates its own synthetic source and contained target. The launch marker is never bypassed.")
    endpoint = os.environ.get("DOCKER_HOST")
    if not endpoint:
        result = subprocess.run(["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], capture_output=True, text=True, timeout=15)
        if result.returncode:
            stop("Local Docker context inspection failed; no exercise started.")
        endpoint = result.stdout.strip()
    parsed = urllib.parse.urlparse(endpoint)
    local_pipe = re.fullmatch(r"npipe:/+\./pipe/[A-Za-z0-9_.-]+", endpoint) is not None
    local_unix = parsed.scheme == "unix" and not parsed.netloc and parsed.path.startswith("/")
    if not (local_pipe or local_unix or parsed.scheme == "tcp" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}):
        stop("Only a local Docker transport is supported; no remote resources are authorized.")
    transport_environment = dict(os.environ)
    transport_environment.pop("DOCKER_CONTEXT", None)
    transport_environment["DOCKER_HOST"] = endpoint
    info = subprocess.run(["docker", "info", "--format", "{{.OSType}}"], capture_output=True, text=True, timeout=15, env=transport_environment)
    if info.returncode or info.stdout.strip() != "linux":
        stop("A working local Linux Docker engine is required; the exercise is not skipped.")
    engine_info = subprocess.run(["docker", "info", "--format", "{{json .}}"], capture_output=True, text=True, timeout=15, env=transport_environment)
    if engine_info.returncode:
        stop("Local Docker resource inventory unavailable; no exercise started.")
    engine = json.loads(engine_info.stdout)
    engine_resources = {"id": engine.get("ID"), "memoryBytes": int(engine.get("MemTotal", 0)), "cpuCount": int(engine.get("NCPU", 0))}
    if not engine_resources["id"] or engine_resources["cpuCount"] <= 0:
        stop("Local Docker engine identity/resource inventory missing; no exercise started.")
    if engine_resources["memoryBytes"] < profile["minimumDockerMemoryBytes"]:
        stop("The explicit local PostgreSQL load profile requires at least8GiB of Docker-engine memory; no fixture started.")
    pinned = repository / ".tools" / "jdk-25.0.4.1+1"
    java_home = args.java_home or (pinned if pinned.is_dir() else Path(os.environ.get("JAVA_HOME", "__missing_java_home__")))
    java = java_home / "bin" / ("java.exe" if os.name == "nt" else "java")
    version = subprocess.run([str(java), "-version"], capture_output=True, text=True, timeout=15)
    if version.returncode or "Temurin-25.0.4.1+1" not in version.stdout + version.stderr:
        stop("The pinned Temurin25.0.4.1+1 runtime is required.")
    excluded = ("IDENTITY_", "MEDIA_", "NOTIFICATIONS_", "REPORTING_", "PRIVACY_", "AUDIT_", "DATABASE_", "OPERATIONS_", "REDACTION_WORKER_", "BACKUP_ENVELOPE_", "SPRING_", "SERVER_", "MANAGEMENT_", "LOGGING_", "AWS_", "GOOGLE_", "FIREBASE_", "RENDER_", "RESEND_", "FCM_", "R2_", "OTEL_", "NEW_RELIC_", "DD_")
    environment = {key: value for key, value in os.environ.items() if not key.startswith(excluded) and key not in {"JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS", "MAVEN_OPTS", "MAVEN_ARGS"}}
    environment.pop("DOCKER_CONTEXT", None)
    environment["DOCKER_HOST"] = endpoint
    environment.pop("LOCAL_SYNTHETIC_EXTERNAL_DATABASE", None)
    environment["LOCAL_SYNTHETIC_ACKNOWLEDGED"] = "true"
    run_id = str(uuid.uuid4())
    environment["LOCAL_SYNTHETIC_RUN_ID"] = run_id
    environment["JAVA_HOME"] = str(java_home.resolve())
    environment["PATH"] = str(java.parent.resolve()) + os.pathsep + environment.get("PATH", "")
    maven_home = repository / ".tools" / "maven-home"
    if maven_home.is_dir(): environment["MAVEN_USER_HOME"] = str(maven_home)
    wrapper = backend / ("mvnw.cmd" if os.name == "nt" else "mvnw")
    command = [str(wrapper), "-B", "-ntp", "-s", str(backend / ".mvn" / "settings.xml"),
               "-Dtest=BootstrapCommandTest", "test"]
    local_m2 = repository / ".tools" / "m2"
    if local_m2.is_dir(): command.insert(1, "-Dmaven.repo.local=" + str(local_m2))
    started = time.time()
    completed = subprocess.run(command, cwd=str(backend), env=environment, timeout=900)
    if completed.returncode: stop("Synthetic harness build failed; no server started.")
    report = backend / "target" / "surefire-reports" / "TEST-com.narudzbine.shared.infrastructure.recovery.BootstrapCommandTest.xml"
    if not report.is_file() or report.stat().st_mtime < started: stop("Fresh wrapper classpath evidence missing.")
    root = ET.parse(report).getroot()
    if any(int(root.attrib.get(k, 0)) for k in ["errors", "failures", "skipped"]): stop("Classpath check did not pass.")
    properties = {item.attrib["name"]: item.attrib.get("value", "") for item in root.find("properties")}
    classpath = properties.get("java.class.path", "")
    if not classpath or "testcontainers" not in classpath: stop("Verified test classpath missing.")
    runtime_inputs = sorted({path for directory in [backend / "src", backend / "operations", backend / ".mvn"] for path in directory.rglob("*") if path.is_file() and "__pycache__" not in path.parts} | {backend / "pom.xml", repository / "openapi.yaml"})
    frozen = {str(path.relative_to(repository)): hashlib.sha256(path.read_bytes()).hexdigest() for path in runtime_inputs}
    jar = backend / "target" / "narudzbine-backend-0.1.0-SNAPSHOT.jar"
    jar_digest = hashlib.sha256(jar.read_bytes()).hexdigest()
    checked = 0
    with zipfile.ZipFile(jar) as archive:
        for compiled in (backend / "target" / "classes").rglob("*.class"):
            entry = "BOOT-INF/classes/" + compiled.relative_to(backend / "target" / "classes").as_posix()
            if archive.read(entry) != compiled.read_bytes(): stop("Tested runtime class differs from packaged artifact.")
            checked += 1
        if any("AuthHttpIT" in name or "SyntheticOrderHistory" in name or "LocalLoadPostgresProfile" in name for name in archive.namelist()): stop("Synthetic fixture leaked into shipping artifact.")
    if checked == 0: stop("Packaged class provenance missing.")
    launched = time.time()
    resource_path = backend / "target" / ("local-load-resources-" + run_id + ".jsonl")
    samples = 0
    runtime_metadata = {"topology": "host-to-local-docker"}
    if args.runtime == "linux":
        process_exit, samples, runtime_metadata = run_linux(repository, backend, run_id, args.mode, args.image,
            classpath, jar_digest, profile, transport_environment, resource_path)
    else:
        command = [str(java), "-Xmx1g", "-cp", classpath, "com.narudzbine.identity.AuthHttpIT$LocalLoad", "--" + args.mode]
        process = subprocess.Popen(command, cwd=str(backend), env=environment)
        limit = 3600 if args.mode == "check" else 10800
        try:
            with resource_path.open("w", encoding="utf-8") as output:
                while process.poll() is None:
                    if time.time() - launched > limit: raise TimeoutError("Local load exceeded its bounded duration")
                    found = subprocess.run(["docker", "ps", "--filter", "label=com.narudzbine.synthetic-load=" + run_id, "--format", "{{.ID}}"], capture_output=True, text=True, timeout=15, env=environment)
                    identifiers = found.stdout.split() if found.returncode == 0 else []
                    if len(identifiers) == 1 and re.fullmatch(r"[0-9a-f]{12,64}", identifiers[0]):
                        stats = subprocess.run(["docker", "stats", "--no-stream", "--format", "{{json .}}", identifiers[0]], capture_output=True, text=True, timeout=15, env=environment)
                        if stats.returncode == 0:
                            output.write(json.dumps({"sampledAtEpoch": time.time(), "database": json.loads(stats.stdout)}) + "\n")
                            output.flush()
                            samples += 1
                    time.sleep(5)
        finally:
            if process.poll() is None:
                process.terminate()
                try: process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=15)
        process_exit = process.returncode
    if samples == 0: stop("Actual database resource samples missing.")
    evidence_path = backend / "target" / ("local-load-" + run_id + ".json")
    complete_report = evidence_path.is_file() and evidence_path.stat().st_mtime >= launched
    if not complete_report: evidence_path = backend / "target" / ("local-load-partial-" + run_id + ".json")
    if not evidence_path.is_file() or evidence_path.stat().st_mtime < launched: stop("Fresh run-bound load evidence missing.")
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    if evidence.get("runId") != run_id or evidence.get("syntheticOnly") is not True: stop("Synthetic load evidence binding failed.")
    expected = {"runId": run_id, "syntheticOnly": True, "organizations": 100, "accounts": 1000, "activeBusinessUsers": 100, "historyGeneratedWithConstraintsEnabled": True, "fixtureQualified": True, "allMeasuredTrafficActualHttp": True, "providersDisabled": True}
    if complete_report and any(evidence.get(k) != v for k, v in expected.items()): stop("Synthetic load postconditions failed.")
    if complete_report and not (evidence.get("maintenanceInitialDelayMs") == 60000 and evidence.get("maintenanceEligibleBeforeMeasurement") is True):
        stop("Normal maintenance eligibility was not verified before measurement.")
    for relative, digest in frozen.items():
        if hashlib.sha256((repository / relative).read_bytes()).hexdigest() != digest: stop("Frozen runtime input changed: " + relative)
    if hashlib.sha256(jar.read_bytes()).hexdigest() != jar_digest: stop("Packaged artifact changed during load.")
    metadata = {"runId": run_id, "applicationJarSha256": jar_digest, "packagedClassesMatched": checked, "frozenInputs": len(frozen), "sourceInventorySha256": hashlib.sha256(json.dumps(frozen, sort_keys=True).encode()).hexdigest(), "resourceSamples": samples, "fullMode": args.mode == "full", "externalProviderOrHostedClaim": False, "javaExitCode": process_exit, "completeReport": complete_report}
    metadata["localDockerEngine"] = engine_resources
    metadata["databaseProfile"] = evidence.get("databaseProfile")
    metadata["runtime"] = runtime_metadata
    (backend / "target" / ("local-load-provenance-" + run_id + ".json")).write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    remaining = subprocess.run(["docker", "ps", "-a", "--filter", "label=com.narudzbine.synthetic-load=" + run_id, "--format", "{{.ID}}"], capture_output=True, text=True, timeout=15, env=environment)
    if remaining.returncode or remaining.stdout.strip(): stop("Owned load database remains; no clean completion claim.")
    if process_exit or not complete_report: stop("Synthetic load failed; retained run-bound report/provenance/resource samples and verified owned cleanup. See " + str(evidence_path))
    if args.mode == "full" and not (evidence.get("designAcceptance") and evidence.get("products") == 250000 and evidence.get("historicalLines") == 10000000): stop("Full design-load acceptance failed.")
    print(json.dumps({"localLoad": "passed", "mode": args.mode, "runtime": args.runtime, "runId": run_id, "designAcceptance": evidence["designAcceptance"], "ownedDatabaseRemaining": False, "resourceSamples": samples, "resources": str(resource_path), "report": str(evidence_path)}))

if __name__ == "__main__":
    main()
