import { createHash } from "node:crypto";

// Selectively reconciled from the October 19 recovery candidate. This module
// inspects caller-supplied clients; it never discovers credentials or grants access.
export class BackupCoverageError extends Error {
  constructor(code) {
    super(`backup_coverage_${code}`);
    this.name = "BackupCoverageError";
    this.code = code;
  }
}
const fail = code => { throw new BackupCoverageError(code); };
const identifier = value => typeof value === "string" && Buffer.byteLength(value) > 0 &&
  Buffer.byteLength(value) <= 63 && !/[\x00-\x1f\x7f]/.test(value);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const roleFlags = ["superuser", "bypassRls", "createRole", "createDb", "replication", "ownsDatabase", "databaseCreate", "hasMembership", "readOnly", "largeObjectsPresent"];
const relationFlags = ["schemaUsage", "schemaCreate", "select", "anySelect", "insert", "update", "otherWrite", "rls", "forceRls", "owns", "rowSecurityActive", "partition"];

function normalizeCatalog(input) {
  const role = input?.role;
  if (!role || roleFlags.some(k => typeof role[k] !== "boolean") ||
      typeof role.isolation !== "string" || !Array.isArray(input.relations) ||
      input.relations.length > 10000) fail("invalid_catalog");
  if (input.relations.length === 0) fail("empty_catalog");
  const seen = new Set();
  const relations = input.relations.map(r => {
    if (!r || !identifier(r.schema) || !identifier(r.name) || r.schema.startsWith("pg_") ||
        r.schema === "information_schema" || !["r", "p", "S", "v", "m", "f"].includes(r.kind) ||
        relationFlags.some(k => typeof r[k] !== "boolean") ||
        !Array.isArray(r.columns) || r.columns.length > 1600 ||
        typeof r.definition !== "string" || r.definition.length > 100000) fail("invalid_catalog");
    const key = `${r.schema}\0${r.name}`;
    if (seen.has(key)) fail("invalid_catalog");
    seen.add(key);
    const columnNames = new Set(), positions = new Set();
    const columns = r.columns.map(c => {
      if (!c || !identifier(c.name) || !Number.isInteger(c.position) || c.position < 1 || c.position > 1600 ||
          typeof c.type !== "string" || !c.type || c.type.length > 1024 ||
          typeof c.notNull !== "boolean" || typeof c.default !== "string" || c.default.length > 100000 ||
          !["", "a", "d"].includes(c.identity) || !["", "s", "v"].includes(c.generated) ||
          columnNames.has(c.name) || positions.has(c.position)) fail("invalid_catalog");
      columnNames.add(c.name); positions.add(c.position);
      return { position: c.position, name: c.name, type: c.type, notNull: c.notNull,
        default: c.default, identity: c.identity, generated: c.generated };
    }).sort((a, b) => a.position - b.position);
    return { schema: r.schema, name: r.name, kind: r.kind,
      ...Object.fromEntries(relationFlags.map(k => [k, r[k]])), columns, definition: r.definition };
  }).sort((a, b) => compare(a.schema, b.schema) || compare(a.name, b.name));
  return { role: { ...Object.fromEntries(roleFlags.map(k => [k, role[k]])), isolation: role.isolation }, relations };
}

// The digest pins schema shape, not data, grants, ownership or an approval. It
// deliberately excludes visibility so repairing access cannot approve schema drift.
export function backupSchemaDigest(input) {
  const { relations } = normalizeCatalog(input);
  const schema = relations.map(({ schema, name, kind, columns, definition, rls, forceRls, partition }) =>
    ({ schema, name, kind, columns, definition, rls, forceRls, partition }));
  return createHash("sha256").update(JSON.stringify({ version: 1, schema })).digest("hex");
}

function validateRestrictedRole(role) {
  if (!role.readOnly || !["repeatable read", "serializable"].includes(role.isolation)) fail("snapshot_required");
  if (["superuser", "bypassRls", "createRole", "createDb", "replication", "ownsDatabase", "databaseCreate", "hasMembership"].some(k => role[k]))
    fail("restricted_role_required");
}

export function validateBackupCoverage(input, { expectedSchemaDigest, strictCapture = false } = {}) {
  const catalog = normalizeCatalog(input), { role, relations } = catalog;
  validateRestrictedRole(role);
  if (role.largeObjectsPresent) fail("large_objects_unsupported");
  for (const r of relations) {
    // The existing archive's count manifest does not represent partition parents,
    // foreign storage or materialized contents. Require a separate contract for them.
    if (!["r", "S", "v"].includes(r.kind) || r.partition) fail("relation_kind_unsupported");
    if (strictCapture && r.kind !== "r") fail("capture_relation_unsupported");
    if (!r.schemaUsage || !r.select) fail("read_privilege_required");
    if (r.rowSecurityActive || r.rls || r.forceRls) fail("rls_review_required");
    if (r.schemaCreate || r.owns || r.otherWrite ||
        ((r.insert || r.update) && (strictCapture || !(r.schema === "public" && r.name === "bob_backup_runs" && r.kind === "r"))))
      fail("excess_privilege");
  }
  if (!relations.some(r => r.kind === "r")) fail("empty_catalog");
  const schemaDigest = backupSchemaDigest(catalog);
  if (expectedSchemaDigest !== undefined && (!/^[a-f0-9]{64}$/.test(expectedSchemaDigest) || expectedSchemaDigest !== schemaDigest))
    fail("schema_changed");
  return { version: 1, profile: "restricted-complete-database-v1", schemaDigest,
    completeVisibility: true, relationCount: relations.length,
    tableCount: relations.filter(r => r.kind === "r").length, catalog };
}

// A ledger connection has no authority to capture project or authentication rows.
export function validateBackupLedgerCoverage(input) {
  const { role, relations } = normalizeCatalog(input);
  validateRestrictedRole(role);
  let ledger = false;
  for (const r of relations) {
    if (r.owns || r.schemaCreate || r.otherWrite) fail("ledger_privilege_mismatch");
    if (r.schema === "public" && r.name === "bob_backup_runs") {
      if (r.kind !== "r" || r.partition || r.rls || r.forceRls || r.rowSecurityActive ||
          !r.schemaUsage || !r.select || !r.insert || !r.update) fail("ledger_privilege_mismatch");
      ledger = true;
    } else if (r.select || r.anySelect || r.insert || r.update) fail("ledger_privilege_mismatch");
  }
  if (!ledger) fail("ledger_privilege_mismatch");
}

// Catalog queries see unreadable user relations too. No information_schema filter
// is used to conceal denied tables, and no user rows/password hashes are selected.
export async function readBackupCatalog(client) {
  let roles, relations;
  try {
    roles = (await client.query(`SELECT r.rolsuper AS superuser, r.rolbypassrls AS "bypassRls",
      r.rolcreaterole AS "createRole", r.rolcreatedb AS "createDb", r.rolreplication AS replication,
      pg_has_role(d.datdba,'USAGE') AS "ownsDatabase",has_database_privilege(d.oid,'CREATE') AS "databaseCreate",
      EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS "hasMembership",
      current_setting('transaction_read_only')='on' AS "readOnly",
      current_setting('transaction_isolation') AS isolation,
      EXISTS(SELECT 1 FROM pg_largeobject_metadata) AS "largeObjectsPresent"
      FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`)).rows;
    relations = (await client.query(`SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,
      has_schema_privilege(n.oid,'USAGE') AS "schemaUsage",has_schema_privilege(n.oid,'CREATE') AS "schemaCreate",
      CASE WHEN c.relkind='S' THEN has_sequence_privilege(c.oid,'SELECT') ELSE has_table_privilege(c.oid,'SELECT') END AS "select",
      CASE WHEN c.relkind='S' THEN has_sequence_privilege(c.oid,'SELECT') ELSE has_any_column_privilege(c.oid,'SELECT') END AS "anySelect",
      CASE WHEN c.relkind='S' THEN false ELSE has_table_privilege(c.oid,'INSERT') OR has_any_column_privilege(c.oid,'INSERT') END AS "insert",
      CASE WHEN c.relkind='S' THEN false ELSE has_table_privilege(c.oid,'UPDATE') OR has_any_column_privilege(c.oid,'UPDATE') END AS "update",
      CASE WHEN c.relkind='S' THEN has_sequence_privilege(c.oid,'USAGE,UPDATE')
        ELSE has_table_privilege(c.oid,'DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(c.oid,'REFERENCES') END AS "otherWrite",
      c.relrowsecurity AS rls,c.relforcerowsecurity AS "forceRls",pg_has_role(c.relowner,'USAGE') AS owns,
      CASE WHEN c.relkind IN ('r','p') THEN row_security_active(c.oid) ELSE false END AS "rowSecurityActive",
      c.relispartition AS partition,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname,
        'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
        'default',COALESCE(pg_get_expr(ad.adbin,ad.adrelid),''),'identity',a.attidentity,'generated',a.attgenerated) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb) AS columns,
      CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE '' END AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('r','p','S','v','m','f') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      ORDER BY n.nspname,c.relname LIMIT 10001`)).rows;
  } catch { fail("catalog_unavailable"); }
  if (!Array.isArray(roles) || roles.length !== 1) fail("invalid_catalog");
  return normalizeCatalog({ role: roles[0], relations });
}

export async function inspectBackupCoverage(client, options) {
  return validateBackupCoverage(await readBackupCatalog(client), options);
}
