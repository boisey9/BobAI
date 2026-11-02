// Local, cached-image qualification only. This does not enable a workflow or bind
// a registry digest. Docker and all container tools receive no host credentials.
import { spawn } from "node:child_process";
import { chmod, lstat, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";

const imagePattern = /^sha256:[a-f0-9]{64}$/;
const containerPattern = /^[a-f0-9]{64}$/;
const checks = ["versions", "ca_bundle", "private_temporary_files", "synthetic_age_roundtrip", "corrupt_ciphertext_refused"];
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const empty = value => value == null || (typeof value === "object" && Object.keys(value).length === 0);
const active = signal => { if (signal?.aborted) fail("interrupted"); };

export class BackupRunnerImageError extends Error {
  constructor(code) { super(code); this.name = "BackupRunnerImageError"; this.code = code; }
}
const fail = code => { throw new BackupRunnerImageError(`runner_image_${code}`); };

export function validateBackupRunnerQualification(manifest) {
  const value = manifest?.qualification;
  if (!exact(value, ["version", "platform", "runtimeUser", "versions"]) || value.version !== 1 ||
      value.platform !== "linux/amd64" || value.runtimeUser !== "0:0" ||
      !exact(value.versions, ["node", "npm", "pgDump", "age"]) ||
      !["node", "npm", "pgDump", "age"].every(key => typeof value.versions[key] === "string") ||
      !/^v24\.\d+\.\d+$/.test(value.versions.node) || !/^\d+\.\d+\.\d+$/.test(value.versions.npm) ||
      typeof value.versions.pgDump !== "string" || value.versions.pgDump.length > 120 ||
      !/^pg_dump \(PostgreSQL\) (17|18)\.\d+(?: [\w .()+~-]+)?$/.test(value.versions.pgDump) ||
      !/^v1\.\d+\.\d+$/.test(value.versions.age)) fail("manifest_invalid");
  return structuredClone(value);
}

export function parseBackupRunnerImageArguments(args) {
  if (!Array.isArray(args) || args.length !== 2 || args.some(arg => typeof arg !== "string")) fail("arguments_invalid");
  const image = args.find(arg => arg.startsWith("--image="))?.slice(8);
  const socket = args.find(arg => arg.startsWith("--socket="))?.slice(9);
  validateInputs(image, socket);
  return { image, socket };
}

function validateInputs(image, socket) {
  if (typeof image !== "string" || !imagePattern.test(image) || image.endsWith("0".repeat(64)) ||
      typeof socket !== "string" || !isAbsolute(socket) || socket.length > 1024 || /[\x00-\x20\x7f]/.test(socket))
    fail("arguments_invalid");
}

async function inspectLocalSocket(socket) {
  const info = await lstat(socket);
  if (!info.isSocket() || info.isSymbolicLink() || await realpath(socket) !== socket ||
      ![0, process.getuid()].includes(info.uid) || (info.mode & 0o002)) fail("local_socket_required");
}

// A bounded Docker CLI process, not a shell. Killing the CLI alone does not prove
// container shutdown; the controller always reconciles/removes its exact owner ID.
export function executeBackupRunnerDocker(args, { env = {}, input, signal, timeoutMs = 10_000,
  spawnChild = spawn } = {}) {
  return new Promise((resolve, reject) => {
    let child, timer, killTimer, stopTimer, failure, size = 0, closed = false;
    const stdout = [], stderr = [];
    const finish = (error, result) => {
      if (closed) return;
      closed = true;
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(stopTimer);
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(result);
    };
    const stop = code => {
      if (failure || closed) return;
      failure = new BackupRunnerImageError(`runner_image_${code}`);
      try { child?.kill("SIGTERM"); } catch { /* bounded escalation below */ }
      killTimer = setTimeout(() => { try { child?.kill("SIGKILL"); } catch { /* stop deadline below */ } }, 1000);
      stopTimer = setTimeout(() => finish(new BackupRunnerImageError("runner_image_command_shutdown_failed")), 2000);
    };
    const abort = () => stop("interrupted");
    if (signal?.aborted) { finish(new BackupRunnerImageError("runner_image_interrupted")); return; }
    try {
      child = spawnChild(process.platform === "darwin" ? "/usr/local/bin/docker" : "/usr/bin/docker", args,
        { env, stdio: ["pipe", "pipe", "pipe"], shell: false });
      for (const [stream, output] of [[child.stdout, stdout], [child.stderr, stderr]]) stream.on("data", chunk => {
        size += chunk.length;
        if (size > 65_536) stop("output_limit");
        else if (!failure) output.push(Buffer.from(chunk));
      });
      child.once("error", () => {
        if (child.pid) stop("command_failed");
        else finish(new BackupRunnerImageError("runner_image_command_failed"));
      });
      child.once("close", code => finish(failure || (code !== 0 ? new BackupRunnerImageError("runner_image_command_failed") : null),
        { stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
      child.stdin.on("error", () => stop("command_failed"));
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => stop("command_timeout"), timeoutMs);
      if (signal?.aborted) abort();
      child.stdin.end(input ?? "");
    } catch { finish(new BackupRunnerImageError("runner_image_command_failed")); }
  });
}

function oneJSON(output) {
  try { const found = JSON.parse(output); if (Array.isArray(found) && found.length === 1) return found[0]; }
  catch { /* no raw Docker output reaches the caller */ }
  fail("inspection_invalid");
}

function checkImage(found, image, specification) {
  if (found.Id !== image || found.Os !== "linux" || found.Architecture !== "amd64" ||
      found.Config?.User !== specification.runtimeUser || !empty(found.Config.Volumes) || !empty(found.Config.ExposedPorts) ||
      !empty(found.Config.Entrypoint) || !empty(found.Config.OnBuild) ||
      (found.Config.Healthcheck && JSON.stringify(found.Config.Healthcheck.Test) !== '["NONE"]') ||
      !Array.isArray(found.Config.Cmd) || found.Config.Cmd.length !== 2 ||
      !["node", "/usr/local/bin/node"].includes(found.Config.Cmd[0]) || found.Config.Cmd[1] !== "--version")
    fail("image_mismatch");
}

function checkOwnership(found, { container, name, image, label }) {
  if (!containerPattern.test(found?.Id ?? "") || (container && found.Id !== container) || found.Name !== `/${name}` ||
      found.Image !== image || found.Config?.Labels?.["bob.backup.runner-qualification"] !== label)
    fail("ownership_mismatch");
}

function checkIsolation(found) {
  const host = found.HostConfig;
  if (!host || host.NetworkMode !== "none" || host.ReadonlyRootfs !== true || host.Privileged !== false ||
      !empty(host.PortBindings) || !empty(host.Binds) || !empty(host.Devices) || host.PidMode || host.IpcMode === "host" || host.UTSMode ||
      !Array.isArray(host.CapDrop) || !host.CapDrop.includes("ALL") ||
      !Array.isArray(host.SecurityOpt) || !host.SecurityOpt.includes("no-new-privileges") ||
      !exact(host.Tmpfs, ["/tmp"]) || host.Tmpfs["/tmp"] !== "rw,nosuid,nodev,noexec,size=64m,mode=1777" ||
      !Array.isArray(found.Mounts) || found.Mounts.some(mount => mount.Type !== "tmpfs" || mount.Destination !== "/tmp"))
    fail("isolation_mismatch");
}

export function backupRunnerQualificationProgram(specification) {
  // Only reviewed, validated version strings are interpolated; no host paths,
  // credentials, repository source, environment or private key enter this program.
  const approved = validateBackupRunnerQualification({ qualification: specification });
  return `import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,lstat,mkdtemp,chmod,writeFile,realpath,rm} from 'node:fs/promises';
import {X509Certificate} from 'node:crypto';
const approved=${JSON.stringify(approved)}, execute=promisify(execFile);
const env={PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C',LC_ALL:'C'};
const check=value=>{if(!value)throw Error('check_failed');};
const run=(path,args)=>execute(path,args,{env,timeout:5000,maxBuffer:8192,encoding:'buffer'});
let root,passed=false;
process.umask(0o077);
try {
 check(process.platform==='linux'&&process.arch==='x64'&&process.version===approved.versions.node);
 check(process.execPath==='/usr/local/bin/node'&&process.getuid()===0&&process.getgid()===0);
 for(const [path,version] of [['/usr/local/bin/npm',approved.versions.npm],['/usr/bin/pg_dump',approved.versions.pgDump],['/usr/local/bin/age',approved.versions.age],['/usr/local/bin/age-keygen',approved.versions.age]]) {
  const result=await run(path,['--version']);check(result.stderr.length===0&&result.stdout.toString().trim()===version);
 }
 const caPath='/etc/ssl/certs/ca-certificates.crt',caInfo=await lstat(caPath);
 check(caInfo.isFile()&&caInfo.size>100&&caInfo.size<=2097152);
 const ca=await readFile(caPath,'utf8'),match=ca.match(/-----BEGIN CERTIFICATE-----[\\s\\S]+?-----END CERTIFICATE-----/);
 check(match);new X509Certificate(match[0]);
 check(await realpath('/tmp')==='/tmp');root=await mkdtemp('/tmp/bob-runner-qualification-');await chmod(root,0o700);
 const rootInfo=await lstat(root);check(rootInfo.isDirectory()&&rootInfo.uid===0&&(rootInfo.mode&0o777)===0o700&&await realpath(root)===root);
 const shell=await run('/bin/sh',['-c','umask 077; directory="$(mktemp -d "$1/shell-XXXXXX")" && realpath "$directory"','--',root]);
 const shellRoot=shell.stdout.toString().trim();check(shell.stderr.length===0&&shellRoot.startsWith(root+'/shell-'));
 const shellInfo=await lstat(shellRoot);check(shellInfo.isDirectory()&&shellInfo.uid===0&&(shellInfo.mode&0o777)===0o700&&await realpath(shellRoot)===shellRoot);
 const plaintext=Buffer.from('BobCore synthetic runner acceptance\\0\\xff','latin1');
 const plain=root+'/synthetic.bin',identity=root+'/synthetic.age-key',cipher=root+'/synthetic.age',corrupt=root+'/corrupt.age';
 await writeFile(plain,plaintext,{flag:'wx',mode:0o600});
 const file=await lstat(plain);check(file.isFile()&&file.uid===0&&file.nlink===1&&(file.mode&0o777)===0o600);
 let exclusive=false;try{await writeFile(plain,'refused',{flag:'wx',mode:0o600});}catch(error){exclusive=error.code==='EEXIST';}check(exclusive);
 await run('/usr/local/bin/age-keygen',['-o',identity]);
 const keyInfo=await lstat(identity);check(keyInfo.isFile()&&keyInfo.uid===0&&(keyInfo.mode&0o777)===0o600);
 const recipient=(await run('/usr/local/bin/age-keygen',['-y',identity])).stdout.toString().trim();check(/^age1[0-9a-z]+$/.test(recipient));
 await run('/usr/local/bin/age',['-r',recipient,'-o',cipher,plain]);
 const decrypted=await run('/usr/local/bin/age',['-d','-i',identity,cipher]);check(decrypted.stdout.equals(plaintext));
 const bytes=await readFile(cipher);check(bytes.length>32);bytes[bytes.length-1]^=128;await writeFile(corrupt,bytes,{flag:'wx',mode:0o600});
 let refused=false;try{await run('/usr/local/bin/age',['-d','-i',identity,corrupt]);}catch(error){refused=Number.isInteger(error.code)&&error.code!==0;}check(refused);
 passed=true;
} catch { passed=false; }
finally {
 if(root){try{await rm(root,{recursive:true,force:true});let absent=false;try{await lstat(root);}catch(error){absent=error.code==='ENOENT';}check(absent);}catch{passed=false;}}
}
if(passed)console.log(JSON.stringify({event:'backup.runner_image_checks_passed',versions:approved.versions,uid:0,gid:0,checks:${JSON.stringify(checks)}}));
else{console.log(JSON.stringify({event:'backup.runner_image_check_failed',code:'qualification_check_failed'}));process.exitCode=1;}
`;
}

export async function qualifyBackupRunnerImage({ image, socket, manifest, signal,
  execute = executeBackupRunnerDocker, inspectSocket = inspectLocalSocket } = {}) {
  validateInputs(image, socket);
  const specification = validateBackupRunnerQualification(manifest);
  active(signal);
  try { await inspectSocket(socket); } catch { fail("local_socket_required"); }
  active(signal);
  let directory, attempted = false, container, result, failure;
  const label = randomUUID(), name = `bob-runner-qualification-${label}`;
  try {
    directory = await mkdtemp(join(await realpath("/tmp"), "bob-runner-docker-"));
    await chmod(directory, 0o700);
    await writeFile(join(directory, "config.json"), "{}\n", { flag: "wx", mode: 0o600 });
    const env = { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C", LC_ALL: "C", HOME: directory };
    const docker = (args, options = {}) => execute(["--host", `unix://${socket}`, "--config", directory, ...args],
      { env, signal, ...options });
    active(signal);
    checkImage(oneJSON((await docker(["image", "inspect", image])).stdout), image, specification);
    active(signal);
    attempted = true;
    container = (await docker(["create", "--name", name, "--label", `bob.backup.runner-qualification=${label}`,
      "--platform", "linux/amd64", "--pull=never", "--network=none", "--read-only", "--cap-drop=ALL",
      "--security-opt=no-new-privileges", "--pids-limit=64", "--memory=256m", "--cpus=1",
      "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=64m,mode=1777", "--interactive", "--entrypoint", "/usr/bin/env", image,
      "-i", "PATH=/usr/local/bin:/usr/bin:/bin", "LANG=C", "LC_ALL=C", "/usr/local/bin/node", "--input-type=module"])).stdout.trim();
    if (!containerPattern.test(container)) fail("inspection_invalid");
    const before = oneJSON((await docker(["inspect", "--type", "container", container])).stdout);
    checkOwnership(before, { container, name, image, label }); checkIsolation(before);
    if (before.State?.Running !== false || before.State?.Status !== "created") fail("state_mismatch");
    active(signal);
    const completed = await docker(["start", "--attach", "--interactive", container],
      { input: backupRunnerQualificationProgram(specification), timeoutMs: 60_000 });
    const expected = { event: "backup.runner_image_checks_passed", versions: specification.versions, uid: 0, gid: 0, checks };
    let reported;
    try { reported = JSON.parse(completed.stdout); } catch { fail("checks_failed"); }
    if (completed.stderr || JSON.stringify(reported) !== JSON.stringify(expected)) fail("checks_failed");
    const after = oneJSON((await docker(["inspect", "--type", "container", container])).stdout);
    checkOwnership(after, { container, name, image, label }); checkIsolation(after);
    if (after.State?.Running !== false || after.State?.Status !== "exited" || after.State?.ExitCode !== 0 ||
        after.State?.OOMKilled !== false || after.State?.Dead !== false || after.State?.Error) fail("state_mismatch");
    active(signal);
    result = { event: "backup.runner_image_qualified", image, platform: specification.platform,
      runtimeUser: specification.runtimeUser, versions: specification.versions, checks };
  } catch (error) {
    failure = error instanceof BackupRunnerImageError ? error : new BackupRunnerImageError("runner_image_failed");
  } finally {
    if (directory) {
      const cleanup = args => execute(["--host", `unix://${socket}`, "--config", directory, ...args],
        { env: { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C", LC_ALL: "C", HOME: directory }, timeoutMs: 10_000 });
      try {
        if (attempted) {
          const lookup = ["container", "ls", "--all", "--quiet", "--no-trunc", "--filter", `name=^/${name}$`];
          const found = (await cleanup(lookup)).stdout.trim();
          if (found) {
            if (!containerPattern.test(found)) fail("ownership_mismatch");
            const owned = oneJSON((await cleanup(["inspect", "--type", "container", found])).stdout);
            checkOwnership(owned, { container: containerPattern.test(container ?? "") ? container : undefined, name, image, label });
            await cleanup(["rm", "--force", found]);
            if ((await cleanup(lookup)).stdout.trim()) fail("cleanup_failed");
          }
        }
      } catch { failure = new BackupRunnerImageError("runner_image_cleanup_failed"); }
      try { await rm(directory, { recursive: true, force: true }); }
      catch { failure = new BackupRunnerImageError("runner_image_cleanup_failed"); }
    }
  }
  if (failure) throw failure;
  active(signal);
  return { ...result, cleanup: { containerRemoved: true, dockerConfigRemoved: true } };
}
