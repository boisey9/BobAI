import { createHash, randomUUID } from "node:crypto";
import { BackupCoverageError } from "./backup-coverage.mjs";

export const INTEGRITY_ALGORITHM = "sha256-jsonb-row-multiset-v1";
export const BACKUP_INTEGRITY_LIMITS = Object.freeze({
  tables: 10_000, rowsPerTable: 10_000_000, totalRows: 100_000_000,
  constraints: 100_000, notNull: 100_000, definitionBytes: 100 * 1024, evidenceBytes: 16 * 1024 * 1024,
});
const fail = code => { throw new BackupCoverageError(code); };
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const quote = value => `"${value.replaceAll('"', '""')}"`;
const identifier = value => typeof value === "string" && value.isWellFormed() &&
  Buffer.byteLength(value) > 0 && Buffer.byteLength(value) <= 63 && !/[\x00-\x1f\x7f]/.test(value);
const schema = value => identifier(value) && !value.startsWith("pg_") && value !== "information_schema";
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const tableKey = t => `${t.schema}\0${t.name}`;
const tableOrder = (a, b) => compare(a.schema, b.schema) || compare(a.name, b.name);
const constraintKey = c => [c.schema, c.targetKind, c.targetSchema, c.targetName, c.name].join("\0");
const notNullKey = n => [n.targetKind, n.schema, n.name, n.column ?? ""].join("\0");
const constraintFlags = ["deferrable", "initiallyDeferred", "validated", "enforced", "isLocal", "noInherit", "period"];
const constraintKeys = ["schema", "targetKind", "targetSchema", "targetName", "name", "type", "definition",
  ...constraintFlags, "inheritanceCount", "parent"];

function normalizeTables(tables, withHash) {
  if (!Array.isArray(tables) || tables.length === 0 || tables.length > BACKUP_INTEGRITY_LIMITS.tables)
    fail("integrity_invalid");
  const seen = new Set();
  let total = 0;
  const normalized = tables.map(t => {
    if (!exactKeys(t, withHash ? ["schema", "name", "rows", "sha256"] : ["schema", "name", "rows"]) ||
        !schema(t.schema) || !identifier(t.name) || typeof t.rows !== "string" ||
        !/^(0|[1-9][0-9]{0,7})$/.test(t.rows) || (withHash && !hash(t.sha256))) fail("integrity_invalid");
    const rows = Number(t.rows);
    total += rows;
    if (rows > BACKUP_INTEGRITY_LIMITS.rowsPerTable || total > BACKUP_INTEGRITY_LIMITS.totalRows)
      fail("integrity_bound_exceeded");
    const key = tableKey(t);
    if (seen.has(key)) fail("integrity_invalid");
    seen.add(key);
    return { schema: t.schema, name: t.name, rows: t.rows, ...(withHash ? { sha256: t.sha256 } : {}) };
  });
  return normalized.sort(tableOrder);
}

function normalizeConstraint(c, tables) {
  if (!exactKeys(c, constraintKeys) || !schema(c.schema) || !["table", "domain"].includes(c.targetKind) ||
      !schema(c.targetSchema) || !identifier(c.targetName) || !identifier(c.name) ||
      !["c", "f", "n", "p", "u", "t", "x"].includes(c.type) ||
      typeof c.definition !== "string" || !c.definition.isWellFormed() || !c.definition.trim() || c.definition.includes("\0") ||
      constraintFlags.some(k => typeof c[k] !== "boolean") ||
      !Number.isInteger(c.inheritanceCount) || c.inheritanceCount < 0 || c.inheritanceCount > 32767)
    fail("integrity_invalid");
  if (Buffer.byteLength(c.definition) > BACKUP_INTEGRITY_LIMITS.definitionBytes) fail("integrity_bound_exceeded");
  if (!c.validated || !c.enforced) fail("integrity_unvalidated_constraint");
  if (c.initiallyDeferred && !c.deferrable) fail("integrity_invalid");
  if (c.period && !["p", "u", "f"].includes(c.type)) fail("integrity_invalid");
  if (c.targetKind === "domain" && (!["c", "n"].includes(c.type) || c.parent !== null)) fail("integrity_invalid");
  if (c.targetKind === "table" && !tables.has(`${c.targetSchema}\0${c.targetName}`)) fail("integrity_invalid");
  let parent = null;
  if (c.parent !== null) {
    if (!exactKeys(c.parent, ["schema", "targetSchema", "targetName", "name"]) ||
        !schema(c.parent.schema) || !schema(c.parent.targetSchema) || !identifier(c.parent.targetName) ||
        !identifier(c.parent.name) || !tables.has(`${c.parent.targetSchema}\0${c.parent.targetName}`)) fail("integrity_invalid");
    parent = { schema: c.parent.schema, targetSchema: c.parent.targetSchema,
      targetName: c.parent.targetName, name: c.parent.name };
  }
  return { schema: c.schema, targetKind: c.targetKind, targetSchema: c.targetSchema, targetName: c.targetName,
    name: c.name, type: c.type, definition: c.definition,
    ...Object.fromEntries(constraintFlags.map(k => [k, c[k]])), inheritanceCount: c.inheritanceCount, parent };
}

function normalizeNotNull(n, tables) {
  if (!exactKeys(n, ["targetKind", "schema", "name", "column"]) || !["column", "domain"].includes(n.targetKind) ||
      !schema(n.schema) || !identifier(n.name) || (n.targetKind === "domain" ? n.column !== null :
        !identifier(n.column) || !tables.has(`${n.schema}\0${n.name}`))) fail("integrity_invalid");
  return { targetKind: n.targetKind, schema: n.schema, name: n.name, column: n.column };
}

// Definitions are encrypted manifest content, never diagnostics. Bounds are a
// conservative first-format limit, not permission to increase capture timeouts.
export function validateBackupIntegrity(evidence, tables) {
  if (!exactKeys(evidence, ["version", "algorithm", "tables", "constraints", "notNull"]) || evidence.version !== 1 ||
      evidence.algorithm !== INTEGRITY_ALGORITHM || !Array.isArray(evidence.constraints) ||
      evidence.constraints.length > BACKUP_INTEGRITY_LIMITS.constraints || !Array.isArray(evidence.notNull) ||
      evidence.notNull.length > BACKUP_INTEGRITY_LIMITS.notNull) fail("integrity_invalid");
  const expected = normalizeTables(tables, false), actual = normalizeTables(evidence.tables, true);
  if (actual.length !== expected.length || actual.some((t, i) => tableKey(t) !== tableKey(expected[i]) || t.rows !== expected[i].rows))
    fail("integrity_invalid");
  const tableNames = new Set(actual.map(tableKey)), seen = new Set();
  let bytes = 0;
  const constraints = evidence.constraints.map(c => {
    const normalized = normalizeConstraint(c, tableNames), key = constraintKey(normalized);
    if (seen.has(key)) fail("integrity_invalid");
    seen.add(key);
    bytes += Buffer.byteLength(JSON.stringify(normalized));
    if (bytes > BACKUP_INTEGRITY_LIMITS.evidenceBytes) fail("integrity_bound_exceeded");
    return normalized;
  }).sort((a, b) => compare(constraintKey(a), constraintKey(b)));
  // A parent reference must identify a captured constraint, not merely a table.
  for (const c of constraints) if (c.parent && !seen.has(constraintKey({ ...c.parent, targetKind: "table" })))
    fail("integrity_invalid");
  const notNullSeen = new Set();
  const notNull = evidence.notNull.map(n => {
    const normalized = normalizeNotNull(n, tableNames), key = notNullKey(normalized);
    if (notNullSeen.has(key)) fail("integrity_invalid");
    notNullSeen.add(key);
    bytes += Buffer.byteLength(JSON.stringify(normalized));
    if (bytes > BACKUP_INTEGRITY_LIMITS.evidenceBytes) fail("integrity_bound_exceeded");
    return normalized;
  }).sort((a, b) => compare(notNullKey(a), notNullKey(b)));
  const result = { version: 1, algorithm: INTEGRITY_ALGORITHM, tables: actual, constraints, notNull };
  if (Buffer.byteLength(JSON.stringify(result)) > BACKUP_INTEGRITY_LIMITS.evidenceBytes) fail("integrity_bound_exceeded");
  return result;
}

export function compareBackupIntegrity(actual, expected) {
  const inventory = evidence => Array.isArray(evidence?.tables)
    ? evidence.tables.map(t => ({ schema: t?.schema, name: t?.name, rows: t?.rows })) : null;
  const a = validateBackupIntegrity(actual, inventory(actual));
  const b = validateBackupIntegrity(expected, inventory(expected));
  if (JSON.stringify(a) !== JSON.stringify(b)) fail("integrity_mismatch");
  return true;
}

async function withCursor(client, sql, consume) {
  const name = quote(`bob_integrity_${randomUUID().replaceAll("-", "")}`);
  let opened = false;
  try {
    // WITHOUT HOLD errors outside a transaction block even when session defaults
    // misleadingly advertise read-only/repeatable-read. No new snapshot is opened.
    await client.query(`DECLARE ${name} NO SCROLL CURSOR WITHOUT HOLD FOR ${sql}`);
    opened = true;
    return await consume(async count => {
      const result = await client.query(`FETCH FORWARD ${count} FROM ${name}`);
      if (!Array.isArray(result?.rows) || result.rows.length > count) fail("integrity_invalid");
      return result.rows;
    });
  } finally {
    if (opened) await client.query(`CLOSE ${name}`);
  }
}

// pg_get_constraintdef(..., false) with catalog-only search_path gives qualified,
// non-pretty definitions. JSON field lookup supports both PG17 and PG18 catalogs:
// PG18 adds table/domain not-null rows, conenforced and conperiod. Domains are included even
// when unused by a captured table; no information_schema privilege filter applies.
// https://www.postgresql.org/docs/18/catalog-pg-constraint.html
// Domain NOT NULL storage: REL_18_STABLE/src/backend/commands/typecmds.c,
// domainAddNotNullConstraint (the catalog documentation's domain prose lags it).
const constraintSql = `SELECT n.nspname AS schema,
  CASE WHEN c.conrelid<>0 AND c.contypid=0 THEN 'table'
       WHEN c.contypid<>0 AND c.conrelid=0 THEN 'domain' ELSE NULL END AS "targetKind",
  COALESCE(rn.nspname,tn.nspname) AS "targetSchema",COALESCE(r.relname,t.typname) AS "targetName",
  c.conname AS name,c.contype AS type,
  CASE WHEN octet_length(pg_get_constraintdef(c.oid,false))<=${BACKUP_INTEGRITY_LIMITS.definitionBytes}
       THEN pg_get_constraintdef(c.oid,false) ELSE NULL END AS definition,
  c.condeferrable AS deferrable,c.condeferred AS "initiallyDeferred",c.convalidated AS validated,
  COALESCE((to_jsonb(c)->>'conenforced')::boolean,true) AS enforced,c.conislocal AS "isLocal",
  c.coninhcount::integer AS "inheritanceCount",c.connoinherit AS "noInherit",
  COALESCE((to_jsonb(c)->>'conperiod')::boolean,false) AS period,
  CASE WHEN c.conparentid=0 THEN NULL ELSE jsonb_build_object('schema',pn.nspname,
    'targetSchema',prn.nspname,'targetName',pr.relname,'name',p.conname) END AS parent
  FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
  LEFT JOIN pg_class r ON r.oid=c.conrelid LEFT JOIN pg_namespace rn ON rn.oid=r.relnamespace
  LEFT JOIN pg_type t ON t.oid=c.contypid LEFT JOIN pg_namespace tn ON tn.oid=t.typnamespace
  LEFT JOIN pg_constraint p ON p.oid=c.conparentid LEFT JOIN pg_namespace pn ON pn.oid=p.connamespace
  LEFT JOIN pg_class pr ON pr.oid=p.conrelid LEFT JOIN pg_namespace prn ON prn.oid=pr.relnamespace
  WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
  ORDER BY n.nspname COLLATE "C",c.conname COLLATE "C",c.oid
  LIMIT ${BACKUP_INTEGRITY_LIMITS.constraints + 1}`;

// PG17 does not store NOT NULL in pg_constraint. Inventory both catalog flags
// on both majors, including empty tables and unused domains, so null-free data
// cannot conceal a dropped constraint. The strict capture profile has already
// refused partitions/foreign storage; unknown table membership still fails here.
const notNullSql = `SELECT 'column' AS "targetKind",n.nspname AS schema,c.relname AS name,a.attname AS "column"
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped AND a.attnotnull
    AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
  UNION ALL
  SELECT 'domain' AS "targetKind",n.nspname AS schema,t.typname AS name,NULL::name AS "column"
  FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE t.typtype='d' AND t.typnotnull AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
  LIMIT ${BACKUP_INTEGRITY_LIMITS.notNull + 1}`;

export async function captureBackupIntegrity(client, tables) {
  const inventory = normalizeTables(tables, false);
  if (typeof client?.query !== "function") fail("integrity_unavailable");
  try {
    const status = (await client.query(`SELECT current_setting('transaction_read_only') AS "readOnly",
      current_setting('transaction_isolation') AS isolation,current_setting('server_version_num') AS version`))?.rows;
    if (!Array.isArray(status) || status.length !== 1 || status[0]?.readOnly !== "on" ||
        status[0]?.isolation !== "repeatable read") fail("integrity_snapshot_required");
    if (!/^(17|18)[0-9]{4}$/.test(status[0].version)) fail("integrity_version_unsupported");
    await withCursor(client, "SELECT 1", async () => {});
    // Both source and restored evidence use these transaction-local settings.
    // JSONB's type output is only compared within the same PostgreSQL major;
    // arbitrary user-defined output functions are not certified by this format.
    for (const setting of ["search_path = pg_catalog", "TimeZone = 'UTC'", "DateStyle = 'ISO, YMD'",
      "IntervalStyle = 'iso_8601'", "extra_float_digits = 3", "bytea_output = 'hex'",
      "lc_monetary = 'C'", "standard_conforming_strings = on"])
      await client.query(`SET LOCAL ${setting}`);
    const constraints = [], notNull = [], tableNames = new Set(inventory.map(tableKey));
    let metadataBytes = 0;
    await withCursor(client, constraintSql, async fetch => {
      for (;;) {
        const rows = await fetch(100);
        if (rows.length === 0) break;
        for (const row of rows) {
          if (constraints.length >= BACKUP_INTEGRITY_LIMITS.constraints) fail("integrity_bound_exceeded");
          const c = normalizeConstraint(row, tableNames);
          metadataBytes += Buffer.byteLength(JSON.stringify(c));
          if (metadataBytes > BACKUP_INTEGRITY_LIMITS.evidenceBytes) fail("integrity_bound_exceeded");
          constraints.push(c);
        }
      }
    });
    await withCursor(client, notNullSql, async fetch => {
      for (;;) {
        const rows = await fetch(1000);
        if (rows.length === 0) break;
        for (const row of rows) {
          if (notNull.length >= BACKUP_INTEGRITY_LIMITS.notNull) fail("integrity_bound_exceeded");
          const n = normalizeNotNull(row, tableNames);
          metadataBytes += Buffer.byteLength(JSON.stringify(n));
          if (metadataBytes > BACKUP_INTEGRITY_LIMITS.evidenceBytes) fail("integrity_bound_exceeded");
          notNull.push(n);
        }
      }
    });
    const captured = [];
    for (const table of inventory) {
      const digest = createHash("sha256");
      let count = 0, previous = "";
      // Only fixed-size digests cross the client boundary. Sorting hashes rather
      // than rows avoids locale/row-order dependence and preserves duplicates.
      // https://www.postgresql.org/docs/18/functions-binarystring.html
      const sql = `SELECT row_hash FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS row_hash
        FROM ONLY ${quote(table.schema)}.${quote(table.name)} AS t) AS hashes ORDER BY row_hash COLLATE "C"`;
      await withCursor(client, sql, async fetch => {
        for (;;) {
          const rows = await fetch(1000);
          if (rows.length === 0) break;
          for (const row of rows) {
            if (!exactKeys(row, ["row_hash"]) || !hash(row.row_hash) || row.row_hash < previous) fail("integrity_invalid");
            if (++count > Number(table.rows)) fail("integrity_row_count_mismatch");
            digest.update(`${row.row_hash}\n`, "ascii");
            previous = row.row_hash;
          }
        }
      });
      if (count !== Number(table.rows)) fail("integrity_row_count_mismatch");
      captured.push({ ...table, sha256: digest.digest("hex") });
    }
    return validateBackupIntegrity({ version: 1, algorithm: INTEGRITY_ALGORITHM, tables: captured, constraints, notNull }, inventory);
  } catch (error) {
    if (error instanceof BackupCoverageError) throw error;
    // Driver errors may contain row data, SQL literals or connection details.
    fail("integrity_unavailable");
  }
}
