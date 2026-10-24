"""Local Linux fixture control. The application container never receives Docker access."""
from pathlib import Path
import json
import os
import re
import subprocess
import time
import uuid


class OwnershipMismatch(RuntimeError):
    pass


def load_profile(path):
    profile = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(profile, dict) or not isinstance(profile.get("settings"), dict):
        raise ValueError("Local database profile must contain an explicit settings object")
    allowed = {"fsync", "synchronous_commit", "full_page_writes", "wal_level", "shared_buffers", "wal_buffers",
               "max_wal_size", "min_wal_size", "checkpoint_timeout", "checkpoint_completion_target",
               "shared_preload_libraries", "pg_stat_statements.track", "pg_stat_statements.track_utility"}
    settings = profile.get("settings", {})
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,100}", profile.get("id", "")) or set(settings) != allowed:
        raise ValueError("Invalid versioned local database profile")
    if any(not isinstance(v, str) or not v for v in settings.values()):
        raise ValueError("Local database settings must be explicit strings")
    for key, expected in {"fsync": "on", "synchronous_commit": "on", "full_page_writes": "on",
                          "wal_level": "replica", "shared_preload_libraries": "pg_stat_statements"}.items():
        if settings[key] != expected:
            raise ValueError("Local load profile must preserve durability and bounded statistics configuration")
    for key, minimum in [("minimumDockerMemoryBytes", 8 * 1024 ** 3), ("sharedMemoryBytes", 64 * 1024 ** 2)]:
        if type(profile.get(key)) is not int or profile[key] < minimum:
            raise ValueError("Invalid local database resource allocation")
    return profile


def run_linux(repository, backend, run_id, mode, image, classpath, jar_sha, profile, environment, resource_path):
    label = "com.narudzbine.synthetic-load=" + run_id
    prefix = "narudzbine-load-"
    names = {role: prefix + role + "-" + run_id for role in ["jar", "java", "db", "guard", "app"]}
    network = prefix + "network-" + run_id
    control_path = backend / "target" / ("local-load-linux-control-" + run_id + ".json")
    control = {"runId": run_id, "topology": "linux-internal-network", "dockerSocketMounted": False,
               "publishedPorts": False, "guardChecks": {}, "ownedCleanupVerified": False}
    process = None
    samples = 0

    def docker(*arguments, timeout=30, check=True):
        result = subprocess.run(["docker", *arguments], env=environment, capture_output=True, text=True, timeout=timeout)
        if check and result.returncode:
            raise RuntimeError("Local Docker operation failed: " + arguments[0] + "; " + result.stderr[:500])
        return result

    def named_ids(name):
        return docker("ps", "-a", "--filter", "name=^/" + name + "$", "--format", "{{.ID}}").stdout.split()

    def remove_owned(name, expected_run):
        identifiers = named_ids(name)
        if len(identifiers) > 1:
            raise RuntimeError("Ambiguous synthetic resource identity")
        for identifier in identifiers:
            labels = json.loads(docker("inspect", "--format", "{{json .Config.Labels}}", identifier).stdout)
            if labels.get("com.narudzbine.synthetic-load") != expected_run:
                raise OwnershipMismatch("Synthetic container ownership mismatch; removal refused")
            docker("rm", "-f", "-v", identifier)

    def app_arguments(name, expected_run):
        return ["create", "--pull=never", "--name", name, "--network", network, "--label", label, "--cap-drop", "ALL",
                "--security-opt", "no-new-privileges", "--workdir", "/workspace/BE",
                "--mount", "type=bind,source=" + str(repository) + ",target=/workspace,readonly",
                "--mount", "type=bind,source=" + str(backend / "target") + ",target=/workspace/BE/target",
                "-e", "LOCAL_SYNTHETIC_ACKNOWLEDGED=true", "-e", "LOCAL_SYNTHETIC_EXTERNAL_DATABASE=true",
                "-e", "LOCAL_SYNTHETIC_RUN_ID=" + expected_run, "--entrypoint", "java", control["imageId"],
                "-Xmx1g", "-cp", linux_classpath, "com.narudzbine.identity.AuthHttpIT$LocalLoad", "--" + mode]

    try:
        image_info = json.loads(docker("image", "inspect", image).stdout)[0]
        control["imageId"] = image_info["Id"]
        if image_info["Config"]["User"] != "10001:10001" or image_info["Os"] != "linux" or image_info["Architecture"] != "amd64":
            raise ValueError("The verified non-root backend image is required")
        probe = ["run", "--pull=never", "--rm", "--read-only", "--network", "none", "--label", label,
                 "--cap-drop", "ALL", "--security-opt", "no-new-privileges"]
        observed_jar = docker(*probe, "--name", names["jar"], "--entrypoint", "sha256sum", control["imageId"],
                              "/app/application.jar").stdout.split()[0]
        if observed_jar != jar_sha:
            raise ValueError("Selected Linux image differs from the verified packaged JAR")
        version = docker(*probe, "--name", names["java"], "--entrypoint", "java", control["imageId"], "-version")
        if "Temurin-25.0.4.1+1" not in version.stdout + version.stderr:
            raise ValueError("Selected Linux image does not contain the pinned Java runtime")
        control["applicationJarSha256"] = observed_jar
        linux_classpath = ":".join("/workspace/" + Path(p).resolve().relative_to(repository).as_posix()
                                   for p in classpath.split(os.pathsep))
        docker("network", "create", "--internal", "--label", label, network)
        settings = dict(profile["settings"], **{"narudzbine.synthetic_run_id": run_id})
        arguments = ["run", "--pull=never", "--rm", "-d", "--name", names["db"], "--network", network,
                     "--network-alias", "synthetic-db", "--label", label,
                     "--shm-size=" + str(profile["sharedMemoryBytes"]), "-e", "POSTGRES_USER=test",
                     "-e", "POSTGRES_PASSWORD=test", "-e", "POSTGRES_DB=test",
                     "postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336", "postgres"]
        for key, value in sorted(settings.items()):
            arguments += ["-c", key + "=" + value]
        database_id = docker(*arguments).stdout.strip()
        deadline = time.monotonic() + 120
        while docker("exec", database_id, "pg_isready", "-h", "127.0.0.1", "-U", "test", "-d", "test", check=False).returncode:
            if time.monotonic() > deadline:
                raise RuntimeError("Owned private PostgreSQL did not become ready")
            time.sleep(1)
        try:
            remove_owned(names["db"], str(uuid.uuid4()))
        except OwnershipMismatch:
            control["guardChecks"]["wrongOwnerRemovalRefused"] = True
        else:
            raise RuntimeError("Synthetic ownership guard did not refuse removal")
        if docker("inspect", "--format", "{{.State.Running}}", database_id).stdout.strip() != "true":
            raise RuntimeError("Ownership check changed the database fixture")
        wrong_run = str(uuid.uuid4())
        guard_id = docker(*app_arguments(names["guard"], wrong_run)).stdout.strip()
        guard = docker("start", "-a", guard_id, timeout=120, check=False)
        (backend / "target" / ("local-load-linux-refusal-" + run_id + ".log")).write_text(guard.stdout + guard.stderr, encoding="utf-8")
        guard_state = json.loads(docker("inspect", "--format", "{{json .State}}", guard_id).stdout)
        if guard_state["Running"] or not guard_state["ExitCode"] or "Synthetic external database identity mismatch; no migration permitted" not in guard.stdout + guard.stderr:
            raise RuntimeError("Mismatched database identity did not fail at the required preflight")
        tables = docker("exec", database_id, "psql", "-X", "-A", "-t", "-U", "test", "-d", "test", "-c",
                        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'").stdout.strip()
        if tables != "0":
            raise RuntimeError("Refused synthetic database acquired schema changes")
        control["guardChecks"]["wrongRunRefusedBeforeMigration"] = True
        control["guardChecks"]["publicTablesAfterRefusal"] = 0
        remove_owned(names["guard"], run_id)
        application_id = docker(*app_arguments(names["app"], run_id)).stdout.strip()
        if docker("inspect", "--format", "{{.Image}}", application_id).stdout.strip() != control["imageId"]:
            raise RuntimeError("Running application image identity mismatch")
        control["applicationContainerId"] = application_id
        control["databaseContainerId"] = database_id
        print("Starting isolated Linux synthetic load runId=" + run_id, flush=True)
        process = subprocess.Popen(["docker", "start", "-a", application_id], env=environment, stderr=subprocess.STDOUT)
        limit = 3600 if mode == "check" else 10800
        deadline = time.monotonic() + limit
        with resource_path.open("w", encoding="utf-8") as output:
            while process.poll() is None:
                if time.monotonic() > deadline:
                    raise TimeoutError("Local Linux load exceeded its bounded duration")
                stats = docker("stats", "--no-stream", "--format", "{{json .}}", database_id, application_id,
                               check=False, timeout=20)
                if stats.returncode == 0:
                    for line in stats.stdout.splitlines():
                        output.write(json.dumps({"sampledAtEpoch": time.time(), "resource": json.loads(line)}) + "\n")
                        samples += 1
                    output.flush()
                time.sleep(5)
        application_state = json.loads(docker("inspect", "--format", "{{json .State}}", application_id).stdout)
        if application_state["Running"] or application_state["Status"] != "exited":
            raise RuntimeError("Synthetic application exit state unavailable")
        control["javaExitCode"] = application_state["ExitCode"]
        control["dockerAttachExitCode"] = process.returncode
        control["resourceSamples"] = samples
        return application_state["ExitCode"] or process.returncode, samples, control
    finally:
        for role in ["app", "guard", "db", "java", "jar"]:
            remove_owned(names[role], run_id)
        if process is not None and process.poll() is None:
            process.wait(timeout=30)
        for identifier in docker("network", "ls", "--filter", "label=" + label, "--format", "{{.ID}}").stdout.split():
            info = json.loads(docker("network", "inspect", identifier).stdout)[0]
            if info["Name"] != network or info["Labels"].get("com.narudzbine.synthetic-load") != run_id:
                raise OwnershipMismatch("Synthetic network ownership mismatch; removal refused")
            docker("network", "rm", identifier)
        if docker("ps", "-a", "--filter", "label=" + label, "--format", "{{.ID}}").stdout.strip():
            raise RuntimeError("Owned Linux load containers remain")
        if docker("network", "ls", "--filter", "label=" + label, "--format", "{{.ID}}").stdout.strip():
            raise RuntimeError("Owned Linux load network remains")
        control["ownedCleanupVerified"] = True
        control_path.write_text(json.dumps(control, indent=2) + "\n", encoding="utf-8")
