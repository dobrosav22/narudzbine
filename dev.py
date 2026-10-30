#!/usr/bin/env python3
"""Run the whole local stack with one command.

Starts the synthetic backend (which owns a disposable PostgreSQL container), the HTTPS API proxy,
the web dev server and the Expo mobile dev server, then seeds demo data.

    python dev.py                    # backend + web + mobile (Android emulator)
    python dev.py --mobile ios       # iOS Simulator (macOS only)
    python dev.py --mobile web       # Expo web preview with the native bearer transport
    python dev.py --mobile none      # backend + web only
    python dev.py --no-web --no-seed --hours 2

Background services log to .dev/<name>.log. Expo runs in the foreground so its keys
(a = Android, i = iOS, w = web) and QR code work. Ctrl+C stops everything; the backend closes
its own database container first. Every start has fresh synthetic data; nothing is kept.
Local only: all services listen on loopback, so physical phones cannot reach the backend.
"""
import argparse, json, os, shutil, signal, socket, subprocess, sys, threading, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FE = ROOT / "FE"
LOGS = ROOT / ".dev"
CERTIFICATES = FE / "apps" / "web" / "certificates"
WINDOWS = os.name == "nt"

API_PORT, BROWSER_PROXY_PORT, NATIVE_PROXY_PORT, WEB_PORT, METRO_PORT = 18080, 18443, 18444, 3000, 8081
READY_MARKER = "SYNTHETIC_DEVELOPMENT_READY "
RUN_LABEL = "com.narudzbine.synthetic-run="
PASSWORD = "long synthetic password"  # fixed synthetic test fixture of the local harness, never a real credential
MOBILE_API = {
    "android": f"http://10.0.2.2:{API_PORT}/api/v1",  # the emulator's alias for the host loopback
    "ios": f"http://localhost:{API_PORT}/api/v1",     # the Simulator shares the host loopback
    "web": f"https://localhost:{NATIVE_PROXY_PORT}/api/v1",
}


def fail(message):
    raise SystemExit("dev.py: " + message)


class Service:
    """A background process whose output goes to .dev/<name>.log."""

    def __init__(self, name, command, cwd, env=None, marker=None):
        self.name, self.marker, self.marked = name, marker, None
        self.log = LOGS / (name + ".log")
        self.ready = threading.Event()
        self.process = subprocess.Popen(
            command, cwd=str(cwd), env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
            # POSIX: own process group so a stop can interrupt the whole tree (runner + JVM).
            start_new_session=not WINDOWS)
        threading.Thread(target=self._pump, daemon=True).start()

    def _pump(self):
        with self.log.open("w", encoding="utf-8") as out:
            for line in self.process.stdout:
                out.write(line)
                out.flush()
                if self.marker and self.marked is None and self.marker in line:
                    self.marked = line
                    self.ready.set()

    def alive(self):
        return self.process.poll() is None

    def tail(self, lines=30):
        try:
            return "".join(self.log.read_text(encoding="utf-8", errors="replace").splitlines(True)[-lines:])
        except OSError:
            return ""

    def interrupt(self):
        if self.alive() and not WINDOWS:
            try: os.killpg(self.process.pid, signal.SIGINT)
            except ProcessLookupError: pass

    def kill(self):
        if self.alive():
            kill_tree(self.process.pid, group=True)


def kill_tree(pid, group=False):
    if WINDOWS:
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
    else:
        try: os.killpg(pid, signal.SIGKILL) if group else os.kill(pid, signal.SIGTERM)
        except ProcessLookupError: pass


def port_open(port):
    # Node binds "localhost" to ::1 on some systems and the JVM binds 127.0.0.1, so probe both.
    for family, host in [(socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")]:
        with socket.socket(family) as probe:
            probe.settimeout(0.3)
            if probe.connect_ex((host, port)) == 0:
                return True
    return False


def wait_until(service, ready, timeout, what):
    deadline = time.time() + timeout
    while not ready():
        if not service.alive():
            print(service.tail())
            fail(f"{service.name} exited before {what}; full log: {service.log}")
        if time.time() > deadline:
            fail(f"{service.name} not {what} after {timeout}s; see {service.log}")
        time.sleep(0.5)


def check_prerequisites(args, ports):
    node = shutil.which("node")
    if not node:
        fail("node is not on PATH.")
    if not shutil.which("docker"):
        fail("docker is not on PATH.")
    if subprocess.run(["docker", "info", "--format", "{{.OSType}}"], capture_output=True, text=True).stdout.strip() != "linux":
        fail("Docker is not running (a local Linux engine is required; start Docker Desktop).")
    if not (ROOT / ".tools" / "jdk-25.0.4.1+1").is_dir() and not os.environ.get("JAVA_HOME"):
        fail("pinned JDK missing: expected .tools/jdk-25.0.4.1+1 (Temurin 25.0.4.1+1).")
    for app in ["web", "mobile"]:
        if not (FE / "apps" / app / "node_modules").is_dir():
            fail("frontend dependencies missing: run `pnpm install` in FE/.")
    if args.mobile == "ios" and sys.platform != "darwin":
        fail("the iOS Simulator needs macOS. On Windows use --mobile android or web.")
    busy = [port for port in ports if port_open(port)]
    if busy:
        fail(f"port(s) already in use: {', '.join(map(str, busy))}. Stop the other process (an earlier dev.py?) first.")
    if not (CERTIFICATES / "localhost-key.pem").is_file():
        if not shutil.which("openssl"):
            fail("no localhost dev certificate and no openssl to create one: run `pnpm dev:cert` in FE/.")
        print("Creating the self-signed localhost certificate (once)...")
        CERTIFICATES.mkdir(parents=True, exist_ok=True)
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "365",
                        "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
                        "-keyout", str(CERTIFICATES / "localhost-key.pem"), "-out", str(CERTIFICATES / "localhost.pem")],
                       check=True, capture_output=True)
    return node


def print_summary(ready, args, services):
    print("\n=== Local stack is up ===")
    print(f"  API (direct)      http://127.0.0.1:{API_PORT}/api/v1")
    if not args.no_web:
        print(f"  Web               https://localhost:{WEB_PORT}   (accept the self-signed certificate once)")
    if args.mobile != "none":
        print(f"  Mobile ({args.mobile:<7})  Expo below, API {MOBILE_API[args.mobile]}")
    print(f"  Password (all)    {PASSWORD}")
    for fixture in ready.get("fixtures", []):
        print(f"  {fixture['country']} vendor owner   {fixture['vendorEmail']}")
        print(f"  {fixture['country']} buyer owner    {fixture['buyerEmail']}")
    if ready.get("platformOperatorEmail"):
        print(f"  Platform admin    {ready['platformOperatorEmail']}")
    hours = ready.get("maximumServeSeconds", 0) / 3600
    print(f"  Logs              {LOGS}{os.sep}{{{','.join(s.name for s in services)}}}.log")
    print(f"  Backend stops itself after {hours:g} h. Ctrl+C stops everything.\n")


def shutdown(services, backend, expo, run_id, interrupted):
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    print("\nStopping (the backend closes its database first; this can take a minute)...")
    if expo is not None and expo.poll() is None:
        try: expo.wait(timeout=10 if interrupted else 0)
        except subprocess.TimeoutExpired: kill_tree(expo.pid)
    if not WINDOWS:
        # POSIX: each service has its own process group, so the terminal's Ctrl+C did not reach it.
        for service in services:
            service.interrupt()
    elif not interrupted:
        # Windows can only deliver Ctrl+C to the whole console, so without one the services are
        # killed; the run-label cleanup below (or Testcontainers' reaper) then removes the database.
        for service in services:
            service.kill()
    for service in services:
        try:
            service.process.wait(timeout=150 if service is backend else 15)
        except subprocess.TimeoutExpired:
            service.kill()
    if run_id:
        # A forced stop can skip the harness cleanup; remove only containers carrying this run's label.
        owned = subprocess.run(["docker", "ps", "-aq", "--filter", "label=" + RUN_LABEL + run_id], capture_output=True, text=True).stdout.split()
        if owned:
            subprocess.run(["docker", "rm", "-f", *owned], capture_output=True)
            print(f"Removed {len(owned)} leftover container(s) of synthetic run {run_id}.")
    print("Stopped.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mobile", choices=["android", "ios", "web", "none"], default="android",
                        help="which client the Expo dev server targets (default: android emulator)")
    parser.add_argument("--no-web", action="store_true", help="do not start the web dev server")
    parser.add_argument("--no-seed", action="store_true", help="skip the demo data seed (FE/e2e/seed.mjs)")
    parser.add_argument("--hours", type=int, default=8, choices=range(1, 9), metavar="1..8",
                        help="backend lifetime (default 8, the harness maximum)")
    args = parser.parse_args()
    # errors="replace": service log tails may hold characters the console/file encoding lacks
    # (cp1252 when redirected on Windows); a print must never abort before the shutdown.
    sys.stdout.reconfigure(line_buffering=True, errors="replace")

    ports = [API_PORT]
    if not args.no_web: ports += [BROWSER_PROXY_PORT, WEB_PORT]
    if args.mobile == "web": ports += [NATIVE_PROXY_PORT]
    if args.mobile != "none": ports += [METRO_PORT]
    node = check_prerequisites(args, ports)
    LOGS.mkdir(exist_ok=True)

    services, expo, run_id, interrupted = [], None, None, False
    try:
        env = dict(os.environ, LOCAL_SYNTHETIC_SERVE_SECONDS=str(args.hours * 3600),
                   LOCAL_SYNTHETIC_API_PORT=str(API_PORT), LOCAL_SYNTHETIC_BROWSER_ORIGINS=f"https://localhost:{WEB_PORT}")
        print("Starting backend + PostgreSQL (the first build can take several minutes)...")
        backend = Service("backend", [sys.executable, str(ROOT / "BE" / "operations" / "local_development.py"), "serve"],
                          ROOT, env, marker=READY_MARKER)
        services.append(backend)

        # The proxies and dev servers do not need the backend yet; start them while it builds.
        proxy = None
        if not args.no_web:
            proxy = Service("api-proxy", [node, "e2e/api-proxy.mjs"], FE)
            web = Service("web", [node, "node_modules/next/dist/bin/next", "dev", "--port", str(WEB_PORT), "--experimental-https",
                                  "--experimental-https-key", "./certificates/localhost-key.pem",
                                  "--experimental-https-cert", "./certificates/localhost.pem"],
                          FE / "apps" / "web", dict(os.environ, NEXT_PUBLIC_API_BASE_URL=f"https://localhost:{BROWSER_PROXY_PORT}/api/v1"))
            services += [proxy, web]
        if args.mobile == "web":
            services.append(Service("api-proxy-native", [node, "e2e/api-proxy.mjs", "--native"], FE))
        for service in services[1:]:
            port = {"api-proxy": BROWSER_PROXY_PORT, "web": WEB_PORT, "api-proxy-native": NATIVE_PROXY_PORT}[service.name]
            wait_until(service, lambda: port_open(port), 120, "listening")

        wait_until(backend, backend.ready.is_set, 1800, "ready")
        ready = json.loads(backend.marked.split(READY_MARKER, 1)[1])
        run_id = ready.get("runId")
        ready_file = LOGS / "ready.json"
        ready_file.write_text(json.dumps(ready), encoding="utf-8")  # synthetic emails/IDs only, for FE/e2e scripts

        if not args.no_seed:
            print("Seeding demo data...")
            with (LOGS / "seed.log").open("w", encoding="utf-8") as log:
                seeded = subprocess.run([node, "e2e/seed.mjs", str(ready_file)], cwd=str(FE), stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
            if seeded.returncode:
                print(f"  Seed failed (the stack still runs with the base fixtures); see {LOGS / 'seed.log'}")

        print_summary(ready, args, services)

        if args.mobile != "none":
            command = [node, "node_modules/expo/bin/cli", "start", "--port", str(METRO_PORT)]
            if args.mobile == "web": command.append("--web")
            expo = subprocess.Popen(command, cwd=str(FE / "apps" / "mobile"),
                                    env=dict(os.environ, EXPO_PUBLIC_API_BASE_URL=MOBILE_API[args.mobile]))
        while True:
            if expo is not None and expo.poll() is not None:
                print("Expo exited.")
                break
            dead = next((service for service in services if not service.alive()), None)
            if dead is not None:
                print(f"\n{dead.name} exited:\n{dead.tail()}")
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        interrupted = True
    finally:
        if services:
            shutdown(services, services[0], expo, run_id, interrupted)


if __name__ == "__main__":
    main()
