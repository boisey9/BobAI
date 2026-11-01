import { captureInventory, sortBackupTables } from "./backup.mjs";
import { captureBackupIntegrity, compareBackupIntegrity } from "./backup-integrity.mjs";

// These helpers inspect only the supplied destination. They never discover a URL,
// restore an archive, update the ledger or change copied access.
export async function assertEmptyRestoreDestination(client) {
  const result = await client.query(`SELECT count(*)::int AS count FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','S','f')`);
  if (result.rows.length !== 1 || result.rows[0].count !== 0)
    throw new Error("Restore destination must be empty; nothing will be dropped.");
}

export async function assertRestoreVersion(client, manifest) {
  if (manifest.version !== 2) return; // Legacy acceptance is explicit in validateManifest.
  const major = Number(manifest.postgresVersion.split(".")[0]);
  const result = await client.query("SELECT (current_setting('server_version_num')::int/10000)::int AS major");
  if (![17, 18].includes(major) || result.rows.length !== 1 || result.rows[0].major !== major)
    throw new Error("Full-integrity restore requires the same supported PostgreSQL major.");
}

export async function verifyRestoredBackup(client, manifest) {
  if (![1, 2].includes(manifest?.version)) throw new Error("Unsupported restore verification version.");
  let begun = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); begun = true;
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '1s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '7min'");
    await assertRestoreVersion(client, manifest);
    const actual = await captureInventory(client);
    const expected = sortBackupTables(manifest.tables).map(({ schema, name, rows }) => ({ schema, name, rows }));
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error("Restored table inventory does not match.");
    if (manifest.version === 2) {
      const integrity = await captureBackupIntegrity(client, actual);
      compareBackupIntegrity(integrity, manifest.integrity);
      return { tablesVerified: actual.length, integrityLevel: "full-content-and-constraints",
        constraintsVerified: integrity.constraints.length };
    }
    const invalid = await client.query("SELECT count(*)::int AS count FROM pg_constraint WHERE contype='f' AND NOT convalidated");
    if (invalid.rows.length !== 1 || invalid.rows[0].count !== 0)
      throw new Error("Restored foreign keys must validate.");
    return { tablesVerified: actual.length, integrityLevel: "legacy-counts-only" };
  } finally {
    if (begun) await client.query("ROLLBACK");
  }
}
