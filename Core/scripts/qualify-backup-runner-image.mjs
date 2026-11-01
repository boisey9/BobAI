// Explicit local invocation only; no build, pull, publication or activation.
import { readFile } from "node:fs/promises";
import { BackupRunnerImageError, parseBackupRunnerImageArguments, qualifyBackupRunnerImage } from "./lib/backup-runner-image.mjs";

process.umask(0o077);
const controller = new AbortController();
const handlers = new Map(["SIGINT", "SIGTERM", "SIGHUP"].map(name => [name, () => controller.abort(name)]));
for (const [name, handler] of handlers) process.on(name, handler);
try {
  if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.VERCEL) throw new BackupRunnerImageError("runner_image_local_only");
  const input = parseBackupRunnerImageArguments(process.argv.slice(2));
  const bytes = await readFile(new URL("../containers/backup-runner/toolchain.json", import.meta.url));
  if (bytes.length > 32_768) throw new BackupRunnerImageError("runner_image_manifest_invalid");
  const result = await qualifyBackupRunnerImage({ ...input, manifest: JSON.parse(bytes.toString("utf8")), signal: controller.signal });
  console.log(JSON.stringify(result));
} catch (error) {
  const code = error instanceof BackupRunnerImageError ? error.code : "runner_image_failed";
  console.error(JSON.stringify({ event: "backup.runner_image_qualification_failed", code }));
  process.exitCode = ({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 })[controller.signal.reason] || 1;
} finally {
  for (const [name, handler] of handlers) process.removeListener(name, handler);
}
