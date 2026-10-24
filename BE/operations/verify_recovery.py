"""Run only the synthetic local recovery exercise; never restores or opens a real environment."""
from pathlib import Path
import argparse, json, os, subprocess, sys, time, urllib.parse, re

def stop(message):
    raise SystemExit(message)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--java-home", type=Path)
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
    environment["JAVA_HOME"] = str(java_home.resolve())
    environment["PATH"] = str(java.parent.resolve()) + os.pathsep + environment.get("PATH", "")
    maven_home = repository / ".tools" / "maven-home"
    if maven_home.is_dir(): environment["MAVEN_USER_HOME"] = str(maven_home)
    wrapper = backend / ("mvnw.cmd" if os.name == "nt" else "mvnw")
    command = [str(wrapper), "-B", "-ntp", "-s", str(backend / ".mvn" / "settings.xml"),
               "-Dtest=RecoveryContainmentTest,RecoveryContainmentConfigurationTest,RecoveryFeatureRegistryTest,BackupEnvelopeTest,BackupEnvelopeCommandTest,BootstrapCommandTest,ScopedRedactionSettingsTest",
               "-Dit.test=AuthHttpIT#isolatedEncryptedRestoreStaysContainedForAcknowledgedIntervalAbsentFromArchive", "verify"]
    local_m2 = repository / ".tools" / "m2"
    if local_m2.is_dir(): command.insert(1, "-Dmaven.repo.local=" + str(local_m2))
    started = time.time()
    completed = subprocess.run(command, cwd=str(backend), env=environment, timeout=900)
    if completed.returncode: stop("Synthetic recovery verification failed; no restore/reopening claim is authorized.")
    report = backend / "target" / "recovery-contained-restore-evidence.json"
    if not report.is_file() or report.stat().st_mtime < started: stop("Fresh executed recovery evidence is missing.")
    evidence = json.loads(report.read_text(encoding="utf-8"))
    expected = {"syntheticOnly": True, "actualVerifiedArchiveMissingAcknowledgedOrder": True, "lostDeactivationAndOrderRequireReconciliation": True, "sourceRemainsAuthoritative": True, "ordinaryAccessMayResume": False, "privateLiveness": 200, "privateReadiness": 503, "scheduledWorkers": 0, "reconciledRtoOrHostedPitrClaim": False}
    if any(evidence.get(key) != value for key, value in expected.items()) or evidence["sourceClusterId"] == evidence["restoredClusterId"]:
        stop("Recovery postconditions were not verified; ordinary access remains unauthorized.")
    print(json.dumps({"syntheticRecoveryExercise": "passed", "ordinaryAccessMayResume": False, "report": str(report), "applicationProviderEnvironmentExcluded": True}))

if __name__ == "__main__":
    main()
