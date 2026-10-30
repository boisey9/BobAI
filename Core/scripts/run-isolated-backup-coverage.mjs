// Owns a new synthetic cluster: installed native PostgreSQL or an immutable cached
// Docker image. No existing database URL, image pull, host port or credential input.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, realpath, stat, writeFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { trackOwnedChild, cleanupOwnedResources } from "./lib/owned-child-lifecycle.mjs";

const execute = promisify(execFile), args = process.argv.slice(2);
const native = args.length === 1 && args[0].startsWith("--pg-bin=");
const image = args.length === 1 && args[0].startsWith("--docker-image=") ? args[0].slice(15) : undefined;
if (process.env.VERCEL || (!native && !/^sha256:[a-f0-9]{64}$/.test(image ?? "")) ||
    (native && !isAbsolute(args[0].slice(9)))) throw new Error("Supply --pg-bin=/absolute/installed/bin or --docker-image=sha256:<cached-image-id> locally.");
const core = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { PATH: [dirname(process.execPath), "/usr/local/bin", "/usr/bin", "/bin"].join(":"),
  LC_ALL: "C", CI: "1", PGPASSFILE: "/nonexistent/bob-backup-fixture", PGSERVICEFILE: "/dev/null" };
await execute("age", ["--version"], { env, timeout: 10000 });
await execute("age-keygen", ["--version"], { env, timeout: 10000 });
process.umask(0o077);
const root = await mkdtemp("/tmp/bob-backup-coverage-run-"), socket = "/tmp/bob-workflow-pg-" + randomUUID();
await mkdir(socket, { mode: 0o700 });
const bin = native ? await realpath(args[0].slice(9)) : join(root, "pg-bin");
const data = native ? join(root, "pg-data") : "/var/lib/postgresql/bob-backup-fixture";
let initialized = false, child, testResult, container, dockerHost, version;
const label = randomUUID();
const docker = async parameters => execute("/usr/local/bin/docker", ["--host", dockerHost, ...parameters], { env, timeout: 20000, maxBuffer: 1048576 });
async function inspectedContainer() {
  const found = JSON.parse((await docker(["inspect", container])).stdout)[0];
  if (found.Id !== container || found.Image !== image || found.Config.Labels?.["bob.backup.fixture"] !== label ||
      found.HostConfig.NetworkMode !== "none" || !found.HostConfig.ReadonlyRootfs ||
      Object.keys(found.HostConfig.PortBindings ?? {}).length || found.Mounts.some(m => m.Type !== "tmpfs"))
    throw new Error("owned_container_isolation_mismatch");
  return found;
}
try {
  if (native) {
    for (const name of ["initdb", "pg_ctl", "psql", "pg_dump", "pg_restore"]) {
      if (!(await stat(join(bin, name))).isFile()) throw new Error("installed_postgres_required");
      const result = await execute(join(bin, name), ["--version"], { env, timeout: 10000 });
      if (!/\b(?:17|18)\./.test(result.stdout)) throw new Error("reviewed_postgres17_or18_required");
      version = result.stdout.trim();
    }
    await execute(join(bin, "initdb"), ["-D", data, "-U", "bob_workflow_test_admin", "--auth-local=trust",
      "--auth-host=reject", "--encoding=UTF8", "--no-locale"], { env, timeout: 30000 });
    initialized = true;
    await execute(join(bin, "pg_ctl"), ["-D", data, "-l", join(root, "server.log"), "-o",
      `-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700 -c fsync=on`,
      "-w", "start"], { env, timeout: 30000 });
  } else {
    // Explicit local socket: never inherit a remote Docker context/host.
    const dockerSocket = join(homedir(), ".docker/run/docker.sock");
    if (!(await stat(dockerSocket)).isSocket()) throw new Error("local_docker_socket_required");
    dockerHost = "unix://" + dockerSocket;
    const cached = JSON.parse((await docker(["image", "inspect", image])).stdout)[0];
    if (cached.Id !== image) throw new Error("exact_cached_image_required");
    await mkdir(bin, { mode: 0o700 });
    // The image's initialization psql explicitly uses its default internal socket.
    // Both sockets stay inside the network-isolated container with mode 0700.
    const startup = `mkdir -p '${socket}' && chown postgres:postgres '${socket}' && exec /usr/local/bin/docker-entrypoint.sh postgres -c listen_addresses='' -c unix_socket_directories='/var/run/postgresql,${socket}' -c unix_socket_permissions=0700 -c fsync=on`;
    container = (await docker(["run", "--detach", "--pull=never", "--network=none", "--read-only",
      "--tmpfs", "/var/lib/postgresql:rw,nosuid,noexec,size=256m", "--tmpfs", "/tmp:rw,nosuid,noexec,size=64m",
      "--tmpfs", "/var/run/postgresql:rw,nosuid,noexec,size=16m", "--label", "bob.backup.fixture=" + label,
      "-e", "PGDATA=" + data, "-e", "PGHOST=" + socket, "-e", "POSTGRES_USER=bob_workflow_test_admin", "-e", "POSTGRES_DB=postgres",
      "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "--entrypoint", "/bin/sh", image, "-c", startup])).stdout.trim();
    if (!/^[a-f0-9]{64}$/.test(container)) throw new Error("container_identity_required");
    await inspectedContainer();
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        await docker(["exec", container, "pg_isready", "-h", socket, "-U", "bob_workflow_test_admin", "-d", "postgres"]);
        const logs = await docker(["logs", container]);
        if (!(logs.stdout + logs.stderr).includes("PostgreSQL init process complete")) throw new Error("fixture_initializing");
        ready = true; break;
      }
      catch { await new Promise(r => setTimeout(r, 300)); }
    }
    if (!ready) throw new Error("fixture_readiness_timeout");
    version = (await docker(["exec", container, "psql", "--version"])).stdout.trim();
    if (!/\b18\./.test(version)) throw new Error("postgres18_fixture_required");
    // Fixed-container psql transport; pg_restore streams the owned host artifact
    // through stdin. No bind mount, network listener or production adapter override.
    for (const command of ["psql", "pg_dump", "pg_restore"]) {
      const source = `#!${process.execPath}\nconst {spawn}=require('node:child_process');const fs=require('node:fs');\n` +
        `const args=process.argv.slice(2),command=${JSON.stringify(command)},root=${JSON.stringify(root)};let input;\n` +
        `if(command==='pg_restore'&&!args.includes('--version')){const file=args.pop();if(!file||!file.startsWith(root+'/'))throw Error('owned_fixture_archive_required');input=fs.createReadStream(file);}\n` +
        `const options=process.env.PGOPTIONS?['-e','PGOPTIONS='+process.env.PGOPTIONS]:[];\n` +
        `const child=spawn('/usr/local/bin/docker',${JSON.stringify(["--host", dockerHost, "exec", "-i"])}.concat(options,${JSON.stringify([container, command])},args),{env:${JSON.stringify(env)},stdio:[input?'pipe':'inherit','inherit','inherit']});\n` +
        `if(input)input.pipe(child.stdin);child.on('error',()=>{process.exitCode=1;});child.on('close',code=>{process.exitCode=code??1;});\n`;
      await writeFile(join(bin, command), source, { mode: 0o700 });
    }
  }
  await writeFile(join(root, "SYNTHETIC-ONLY.json"), JSON.stringify({ kind: "owned-backup-coverage-fixture",
    executor: native ? "native" : "docker", data, socket, bin, ...(container ? { container, image } : {}) }), { mode: 0o600 });
  const processHandle = spawn(process.execPath, [join(core, "node_modules/vitest/vitest.mjs"), "run",
    "tests/backup-coverage-postgres.test.mjs", "--reporter=json", "--hookTimeout=30000"], { cwd: core,
    env: { ...env, BOB_LOCAL_WORKFLOW_TEST_SOCKET: socket, BOB_LOCAL_WORKFLOW_PG_BIN: bin,
      BOB_BACKUP_COVERAGE_TEST_ROOT: root }, stdio: ["ignore", "pipe", "pipe"] });
  child = trackOwnedChild(processHandle);
  let stderr = ""; processHandle.stderr.on("data", data => { stderr += data.toString(); });
  const code = await new Promise((yes, no) => {
    const timer = setTimeout(() => no(new Error("synthetic_coverage_timeout")), 240000);
    processHandle.once("error", error => { clearTimeout(timer); no(error); });
    processHandle.once("close", code => { clearTimeout(timer); yes(code); });
  });
  await writeFile(join(root, "vitest.json"), child.output, { mode: 0o600 });
  await writeFile(join(root, "vitest.stderr"), stderr, { mode: 0o600 });
  testResult = JSON.parse(child.output);
  if (code !== 0 || !testResult.success || testResult.numPassedTests !== 17 ||
      testResult.numPendingTests !== 0 || testResult.numFailedTests !== 0) throw new Error("synthetic_coverage_cases_not_verified");
} finally {
  await cleanupOwnedResources(child, async () => {
    if (initialized) await execute(join(bin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { env, timeout: 15000 });
    if (container) {
      const state = await inspectedContainer();
      await writeFile(join(root, "container-isolation.json"), JSON.stringify({ id: state.Id, image: state.Image,
        network: state.HostConfig.NetworkMode, ports: state.HostConfig.PortBindings, mounts: state.Mounts, readonly: state.HostConfig.ReadonlyRootfs }), { mode: 0o600 });
      const logs = await docker(["logs", container]);
      await writeFile(join(root, "server.log"), logs.stdout + logs.stderr, { mode: 0o600 });
      await docker(["rm", "--force", container]);
    }
  });
  await rm(join(root, "archive-fixture"), { recursive: true, force: true });
  await rm(join(root, "integration-fixtures"), { recursive: true, force: true });
  await rm(socket, { recursive: true, force: true });
  await writeFile(join(root, "cleanup.json"), JSON.stringify({ clusterStopped: true, tcpDisabled: true,
    containerRemoved: !!container, syntheticArchiveAndKeyRemoved: true, socketRemoved: true }), { mode: 0o600 });
}
console.log(JSON.stringify({ syntheticOnly: true, passed: testResult.numPassedTests, skipped: 0, version,
  receipts: root, clusterStopped: true, tcpDisabled: true, containerRemoved: !!container }));
