"""Run a test-classpath-only synthetic backend with disposable local data and provider doubles."""
from pathlib import Path
import argparse, json, os, subprocess, sys, time, urllib.parse, xml.etree.ElementTree as ET, uuid, re

def stop(message):
    raise SystemExit(message)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--java-home", type=Path)
    parser.add_argument("mode", choices=["check", "serve"])
    args = parser.parse_args()
    repository = Path(__file__).resolve().parents[2]
    backend = repository / "BE"
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
    launched = time.time()
    harness = subprocess.Popen([str(java), "-Xmx1g", "-cp", classpath,
            "com.narudzbine.identity.AuthHttpIT$LocalDevelopment", "--" + args.mode],
            cwd=str(backend), env=environment)
    deadline = launched + (900 if args.mode == "check" else int(os.environ.get("LOCAL_SYNTHETIC_SERVE_SECONDS", "3600")) + 120)
    owned = lambda: subprocess.run(["docker", "ps", "-a", "--filter", "label=com.narudzbine.synthetic-run=" + run_id, "--format", "{{.ID}}"], capture_output=True, text=True, timeout=15, env=environment)
    try:
        # Poll instead of a blocking wait so an interrupt is noticed while the harness runs.
        while harness.poll() is None:
            if time.time() > deadline:
                harness.kill()
                stop("Synthetic development harness exceeded its bounded run.")
            time.sleep(0.5)
    except KeyboardInterrupt:
        # The harness received the same interrupt; its shutdown hook closes the app and then the owned
        # database. Killing it here would skip that cleanup.
        try: harness.wait(timeout=120)
        except subprocess.TimeoutExpired: harness.kill()
        remaining = owned()
        stop("Interrupted; owned synthetic database " + ("remains for run label " + run_id if remaining.returncode or remaining.stdout.strip() else "closed") + ".")
    if harness.returncode: stop("Synthetic development harness did not complete successfully.")
    evidence_path = backend / "target" / ("local-development-" + run_id + ".json")
    if not evidence_path.is_file() or evidence_path.stat().st_mtime < launched: stop("Fresh run-bound developer evidence missing.")
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    expected = {"runId": run_id, "syntheticOnly": True, "countryIsolationVerified": True, "externalDeliveryEnabled": False, "providerConformanceClaim": False, "portableJsonWorkerEnabled": True, "portableJsonDownloadsVerified": 4}
    if any(evidence.get(k) != v for k, v in expected.items()): stop("Synthetic harness postconditions failed.")
    def expand(route):
        match = re.search(r"\{[^{}:]+:([A-Za-z0-9_-]+(?:\|[A-Za-z0-9_-]+)+)\}", route)
        if match is None: return [route]
        return [item for alternative in match.group(1).split("|") for item in expand(route[:match.start()] + alternative + route[match.end():])]
    normalize = lambda route: re.sub(r"\{[^}]+\}", "{}", route)
    actual = {normalize(item) for route in evidence["routes"] for item in expand(route)}
    contract = json.loads((repository / "openapi.yaml").read_text(encoding="utf-8"))
    wanted = {normalize(method.upper() + " /api/v1" + path) for path, item in contract["paths"].items() for method in item if method in {"get", "post", "put", "patch", "delete", "head", "options"}}
    if actual != wanted: stop("Contract route presence mismatch: " + json.dumps({"missing": sorted(wanted-actual), "extra": sorted(actual-wanted)}))
    remaining = owned()
    if remaining.returncode or remaining.stdout.strip(): stop("Owned synthetic database remains; no clean completion claim.")
    print(json.dumps({"syntheticDevelopment": "passed", "runId": run_id, "contractOperationsPresent": len(wanted), "requesterJsonDownloads": 4, "ownedDatabaseRemaining": False, "report": str(evidence_path)}))


if __name__ == "__main__":
    main()
