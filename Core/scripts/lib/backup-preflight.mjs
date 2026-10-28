import { BackupCoverageError, inspectBackupCoverage } from "./backup-coverage.mjs";
import { quoteIdentifier, isOutsideDirectory } from "./backup.mjs";
import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fail = code => { throw new BackupCoverageError(code); };
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);

export function validateBackupPreflightPlan(plan) {
  if (!plan || plan.enabled === false || plan.enabled === undefined) fail("disabled");
  if (!exactKeys(plan, ["version", "enabled", "environment", "target", "project", "expectedSchemaDigest"]) ||
      plan.version !== 1 || plan.enabled !== true || !["testing", "production"].includes(plan.environment) ||
      !exactKeys(plan.target, ["host", "port", "database", "role", "postgresMajor"]) ||
      typeof plan.target.host !== "string" || !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(plan.target.host) ||
      plan.target.host.includes("-pooler.") || plan.target.port !== 5432 ||
      typeof plan.target.database !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(plan.target.database) ||
      typeof plan.target.role !== "string" || !/^bob_backup_[a-z0-9_]{1,40}$/.test(plan.target.role) ||
      ![17, 18].includes(plan.target.postgresMajor) ||
      (plan.environment === "production" && plan.target.postgresMajor !== 18) ||
      !exactKeys(plan.project, ["key", "id", "ownerId", "repository"]) || plan.project.key !== "bobai" ||
      !uuid(plan.project.id) || typeof plan.project.ownerId !== "string" ||
      !plan.project.ownerId.trim() || plan.project.ownerId.length > 200 || /[\x00-\x1f\x7f]/.test(plan.project.ownerId) ||
      plan.project.repository !== "boisey9/BobAI" ||
      typeof plan.expectedSchemaDigest !== "string" || !/^[a-f0-9]{64}$/.test(plan.expectedSchemaDigest)) fail("invalid_plan");
  return structuredClone(plan);
}

export function validateBackupPreflightTarget(raw, input) {
  const plan = validateBackupPreflightPlan(input);
  let url;
  try { url = new URL(raw); } catch { fail("target_mismatch"); }
  let user, database;
  try { user = decodeURIComponent(url.username); database = decodeURIComponent(url.pathname.slice(1)); }
  catch { fail("target_mismatch"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.password || url.hash ||
      url.hostname !== plan.target.host || Number(url.port || 5432) !== plan.target.port ||
      user !== plan.target.role || database !== plan.target.database) fail("target_mismatch");
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length || keys.some(k => !["sslmode", "channel_binding"].includes(k)) ||
      !["require", "verify-full"].includes(url.searchParams.get("sslmode")) ||
      (url.searchParams.has("channel_binding") && !["prefer", "require"].includes(url.searchParams.get("channel_binding")))) fail("target_mismatch");
  return raw;
}

export async function readPrivateBackupInput(path, maximum) {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  if (typeof path !== "string" || !isAbsolute(path)) fail("private_input_required");
  const canonical = await realpath(path);
  if (canonical !== path || !isOutsideDirectory(repository, canonical)) fail("private_input_required");
  const file = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || (info.mode & 0o077) || info.size < 1 || info.size > maximum ||
        (process.getuid && info.uid !== process.getuid())) fail("private_input_required");
    const bytes = await file.readFile();
    if (bytes.length > maximum) fail("private_input_required");
    return bytes.toString("utf8").trim();
  } finally { await file.close(); }
}

export async function checkBackupConnectionIdentity(client, target) {
  const identity = (await client.query(`SELECT current_database() AS database,current_user AS role,
    (current_setting('server_version_num')::int/10000)::int AS major`)).rows;
  if (identity.length !== 1 || identity[0].database !== target.database ||
      identity[0].role !== target.role || identity[0].major !== target.postgresMajor) fail("source_mismatch");
}

// The callback finishes before rollback. Export callers use strictCapture to deny
// every write privilege and lock ordinary tables throughout pg_dump's shared snapshot.
// Requires a dedicated idle client; the caller binds its URL before connecting.
export async function withBackupCoverageSnapshot(client, input, run, { strictCapture = false } = {}) {
  const plan = validateBackupPreflightPlan(input);
  let begun = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); begun = true;
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '1s'");
    await client.query(strictCapture ? "SET LOCAL idle_in_transaction_session_timeout = '7min'" : "SET LOCAL idle_in_transaction_session_timeout = '20s'");
    await client.query("SET LOCAL search_path = pg_catalog, public");
    await checkBackupConnectionIdentity(client, plan.target);
    const project = (await client.query(`SELECT id::text,owner_id,repository FROM public.bob_projects
      WHERE project_key=$1 AND id=$2::uuid AND owner_id=$3`, [plan.project.key, plan.project.id, plan.project.ownerId])).rows;
    if (project.length !== 1 || project[0].id !== plan.project.id || project[0].owner_id !== plan.project.ownerId ||
        project[0].repository !== plan.project.repository) fail("source_mismatch");
    const options = { expectedSchemaDigest: plan.expectedSchemaDigest, strictCapture };
    const evidence = await inspectBackupCoverage(client, options);
    if (strictCapture) {
      const names = evidence.catalog.relations.map(r => `ONLY ${quoteIdentifier(r.schema)}.${quoteIdentifier(r.name)}`);
      await client.query(`LOCK TABLE ${names.join(",")} IN ACCESS SHARE MODE`);
      await inspectBackupCoverage(client, options);
    }
    const result = await run(evidence);
    if (strictCapture) await inspectBackupCoverage(client, options);
    return result;
  } catch (error) {
    if (error instanceof BackupCoverageError) throw error;
    fail("source_unavailable");
  } finally {
    if (begun) {
      try { await client.query("ROLLBACK"); }
      catch { fail("rollback_unconfirmed"); }
    }
  }
}

// Standalone inspection never exports and does not let its snapshot escape.
export async function runBackupCoveragePreflight(client, input) {
  const plan = validateBackupPreflightPlan(input);
  return withBackupCoverageSnapshot(client, plan, evidence => ({
    event: "backup.coverage.checked", version: 1, environment: plan.environment,
    projectKey: plan.project.key, projectId: plan.project.id, schemaDigest: evidence.schemaDigest,
    relationCount: evidence.relationCount, tableCount: evidence.tableCount,
    completeVisibility: true, backupVerified: false,
  }));
}
