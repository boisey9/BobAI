import { randomBytes } from "node:crypto";
import { readFile, realpath, stat, open, rm } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Pool } from "@neondatabase/serverless";
import { isOutsideDirectory, postgresEnvironment } from "./lib/backup.mjs";
import { provisionBackupRole } from "./lib/backup-role.mjs";

process.umask(0o077);
const { values } = parseArgs({ options: {
  "admin-url-file": { type: "string" }, role: { type: "string" }, output: { type: "string" },
} });
for (const name of ["admin-url-file", "output"])
  if (!values[name] || !isAbsolute(values[name])) throw new Error(`An absolute --${name} is required.`);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const adminFile = await realpath(values["admin-url-file"]);
const outputParent = await realpath(dirname(values.output));
if (!isOutsideDirectory(repo, adminFile) || !isOutsideDirectory(repo, outputParent) ||
    ((await stat(adminFile)).mode & 0o077)) throw new Error("Keep private credential files outside the repository.");
const connectionString = (await readFile(adminFile, "utf8")).trim();
postgresEnvironment(connectionString);
const output = await open(values.output, "wx", 0o600);
const pool = new Pool({ connectionString, max: 1 });
let commitAttempted = false;
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const password = randomBytes(36).toString("base64url");
    await provisionBackupRole(client, values.role, password);
    const backup = new URL(connectionString);
    backup.username = values.role;
    backup.password = password;
    await output.writeFile(backup.toString());
    await output.sync();
    const parent = await open(outputParent, "r");
    try { await parent.sync(); } finally { await parent.close(); }
    commitAttempted = true;
    await client.query("COMMIT");
    console.log(JSON.stringify({ event: "backup.credential.created", role: values.role, credentialWrittenPrivately: true }));
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
} catch (error) {
  console.error(JSON.stringify({ event: "backup.credential.failed", error: error.name }));
  process.exitCode = 1;
} finally {
  await output.close(); await pool.end();
  // Keep the private artifact if the COMMIT response is lost. The operator can
  // reconcile the named role without losing its only credential copy.
  if (!commitAttempted) await rm(values.output, { force: true });
}
