import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BackupCoverageError } from "../scripts/lib/backup-coverage.mjs";
import { BACKUP_INTEGRITY_LIMITS, INTEGRITY_ALGORITHM, captureBackupIntegrity,
  compareBackupIntegrity, validateBackupIntegrity } from "../scripts/lib/backup-integrity.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const digest = hashes => sha([...hashes].sort().map(h => `${h}\n`).join(""));
const table = (name = "items", rows = "0", schema = "public") => ({ schema, name, rows });
const constraint = (overrides = {}) => ({
  schema: "public", targetKind: "table", targetSchema: "public", targetName: "items", name: "items_pk",
  type: "p", definition: "PRIMARY KEY (id)", deferrable: false, initiallyDeferred: false,
  validated: true, enforced: true, isLocal: true, inheritanceCount: 0, noInherit: true, period: false,
  parent: null, ...overrides,
});
const columnNotNull = (overrides = {}) => ({ targetKind: "column", schema: "public", name: "items", column: "id", ...overrides });
const domainNotNull = (overrides = {}) => ({ targetKind: "domain", schema: "types", name: "required_text", column: null, ...overrides });
const evidence = (tables = [table()], constraints = [], notNull = []) => ({
  version: 1, algorithm: INTEGRITY_ALGORITHM,
  tables: tables.map(t => ({ ...t, sha256: sha("") })), constraints, notNull,
});
const clone = value => structuredClone(value);
const code = (fn, expected) => {
  try { fn(); throw new Error("Expected refusal"); }
  catch (error) { expect(error).toBeInstanceOf(BackupCoverageError); expect(error.code).toBe(expected); }
};

// This client models cursor framing, not PostgreSQL's SQL implementation. It
// receives only synthetic digests/catalog records and never opens a connection.
function fakeClient({ hashes = [], constraints = [], notNull = [], status, rawHashRows, failWhen, malformedFetch } = {}) {
  const queries = [], cursors = new Map();
  let tableIndex = 0;
  const client = {
    queries, cursors,
    async query(sql) {
      queries.push(sql);
      if (failWhen?.(sql)) throw new Error("private row payload postgres://secret@example.invalid/db");
      if (sql.startsWith("SELECT current_setting")) return { rows: status ?? [{ readOnly: "on", isolation: "repeatable read", version: "170005" }] };
      if (sql.startsWith("SET LOCAL ")) return { rows: [] };
      if (sql.startsWith("DECLARE ")) {
        const name = /^DECLARE ("[^"]+")/.exec(sql)[1];
        const rows = sql.includes("FROM pg_constraint c") ? constraints : sql.includes("FROM pg_attribute a") ? notNull
          : sql.endsWith("FOR SELECT 1") ? []
            : rawHashRows ?? [...(hashes[tableIndex++] ?? [])].sort().map(row_hash => ({ row_hash }));
        cursors.set(name, [...rows]);
        return { rows: [] };
      }
      if (sql.startsWith("FETCH ")) {
        const [, count, name] = /^FETCH FORWARD ([0-9]+) FROM ("[^"]+")$/.exec(sql);
        if (malformedFetch) return malformedFetch;
        return { rows: cursors.get(name).splice(0, Number(count)) };
      }
      if (sql.startsWith("CLOSE ")) { cursors.delete(sql.slice(6)); return { rows: [] }; }
      throw new Error("Unexpected synthetic query");
    },
  };
  return client;
}

describe("backup integrity evidence validation", () => {
  it("normalizes table/constraint ordering without mutating evidence", () => {
    const inventory = [table("z"), table("items")];
    const input = evidence(inventory, [constraint({ name: "z" }), constraint({ name: "a" })]);
    const before = clone(input), result = validateBackupIntegrity(input, inventory);
    expect(result.tables.map(t => t.name)).toEqual(["items", "z"]);
    expect(result.constraints.map(c => c.name)).toEqual(["a", "z"]);
    expect(input).toEqual(before);
  });
  it.each([
    ["unsupported version", e => { e.version = 2; }],
    ["unsupported algorithm", e => { e.algorithm = "md5"; }],
    ["unknown evidence field", e => { e.secret = "never accepted"; }],
    ["absent table", e => { e.tables = []; }],
    ["extra table", e => { e.tables.push({ ...table("extra"), sha256: sha("") }); }],
    ["duplicate table", e => { e.tables.push(clone(e.tables[0])); }],
    ["wrong table", e => { e.tables[0].name = "other"; }],
    ["wrong row count", e => { e.tables[0].rows = "1"; }],
    ["numeric row count", e => { e.tables[0].rows = 0; }],
    ["noncanonical row count", e => { e.tables[0].rows = "00"; }],
    ["negative row count", e => { e.tables[0].rows = "-1"; }],
    ["exponential row count", e => { e.tables[0].rows = "1e3"; }],
    ["uppercase digest", e => { e.tables[0].sha256 = "A".repeat(64); }],
    ["invalid digest", e => { e.tables[0].sha256 = "secret"; }],
    ["unknown table field", e => { e.tables[0].oid = 123; }],
    ["system schema", e => { e.tables[0].schema = "pg_temp_3"; }],
    ["malformed constraints", e => { e.constraints = {}; }],
    ["null constraint", e => { e.constraints = [null]; }],
    ["missing not-null inventory", e => { delete e.notNull; }],
    ["invalid not-null inventory", e => { e.notNull = null; }],
  ])("rejects %s", (_, mutate) => {
    const input = evidence(); mutate(input);
    code(() => validateBackupIntegrity(input, [table()]), "integrity_invalid");
  });
  it("bounds table counts, per-table rows and total rows", () => {
    code(() => validateBackupIntegrity(evidence(), Array(10001).fill(table())), "integrity_invalid");
    const tooMany = [table("items", "10000001")];
    code(() => validateBackupIntegrity(evidence(tooMany), tooMany), "integrity_bound_exceeded");
    const total = Array.from({ length: 11 }, (_, i) => table(`t${i}`, "10000000"));
    code(() => validateBackupIntegrity(evidence(total), total), "integrity_bound_exceeded");
  });
  it("accepts the explicit row bounds without converting counts to imprecise numbers", () => {
    const inventory = Array.from({ length: 10 }, (_, i) => table(`t${i}`, "10000000"));
    expect(validateBackupIntegrity(evidence(inventory), inventory).tables).toHaveLength(10);
  });
  it.each(["validated", "enforced"])("fails closed for false %s", flag => {
    code(() => validateBackupIntegrity(evidence([table()], [constraint({ [flag]: false })]), [table()]), "integrity_unvalidated_constraint");
  });
  it.each([
    ["unknown metadata", { oid: 1987 }], ["unknown type", { type: "?" }],
    ["missing definition", { definition: "" }], ["NUL definition", { definition: "a\0b" }],
    ["coerced flag", { deferrable: "false" }], ["impossible deferred", { initiallyDeferred: true }],
    ["impossible period", { type: "c", period: true }], ["negative inheritance", { inheritanceCount: -1 }],
    ["fractional inheritance", { inheritanceCount: 0.5 }], ["unbounded inheritance", { inheritanceCount: 32768 }],
    ["unknown target", { targetKind: "sequence" }], ["unknown table", { targetName: "omitted" }],
    ["system domain", { targetKind: "domain", targetSchema: "pg_catalog", type: "c" }],
    ["invalid domain type", { targetKind: "domain", type: "f" }],
    ["unresolved parent", { parent: { schema: "public", targetSchema: "public", targetName: "items", name: "absent" } }],
  ])("rejects constraint %s", (_, overrides) => {
    code(() => validateBackupIntegrity(evidence([table()], [constraint(overrides)]), [table()]), "integrity_invalid");
  });
  it("captures unused user domains and all supported pg_constraint types, including PG18 not-null", () => {
    const constraints = ["c", "f", "n", "p", "u", "t", "x"].map(type => constraint({ type, name: `c_${type}` }));
    constraints.push(constraint({ name: "domain_check", targetKind: "domain", targetName: "positive_number", type: "c", definition: "CHECK ((VALUE > 0))" }));
    expect(validateBackupIntegrity(evidence([table()], constraints), [table()]).constraints).toHaveLength(8);
  });
  it("rejects duplicate constraints while allowing equal names on distinct targets", () => {
    code(() => validateBackupIntegrity(evidence([table()], [constraint(), constraint()]), [table()]), "integrity_invalid");
    const inventory = [table(), table("other")];
    expect(validateBackupIntegrity(evidence(inventory, [constraint(), constraint({ targetName: "other" })]), inventory).constraints).toHaveLength(2);
  });
  it("normalizes stable parent references without OIDs", () => {
    const inventory = [table(), table("parent")];
    const constraints = [constraint({ targetName: "parent" }), constraint({
      parent: { schema: "public", targetSchema: "public", targetName: "parent", name: "items_pk" },
    })];
    expect(validateBackupIntegrity(evidence(inventory, constraints), inventory).constraints).toHaveLength(2);
  });
  it("bounds definition bytes, total evidence bytes and constraint count", () => {
    code(() => validateBackupIntegrity(evidence([table()], [constraint({ definition: "é".repeat(51201) })]), [table()]), "integrity_bound_exceeded");
    const large = Array.from({ length: 170 }, (_, i) => constraint({ name: `c_${i}`, definition: "x".repeat(100 * 1024) }));
    code(() => validateBackupIntegrity(evidence([table()], large), [table()]), "integrity_bound_exceeded");
    code(() => validateBackupIntegrity(evidence([table()], Array(100001).fill(constraint())), [table()]), "integrity_invalid");
  });
  it("bounds identifier UTF-8 bytes and rejects invalid Unicode", () => {
    for (const name of ["a".repeat(64), "é".repeat(32), "x\n", "\ud800"])
      code(() => validateBackupIntegrity(evidence([table(name)]), [table(name)]), "integrity_invalid");
    const inventory = [table('with "quotes" and spaces')];
    expect(validateBackupIntegrity(evidence(inventory), inventory).tables[0].name).toBe(inventory[0].name);
  });
  it("normalizes not-null identities across captured table columns and unused domains", () => {
    const input = evidence([table()], [], [domainNotNull(), columnNotNull({ column: "z" }), columnNotNull()]);
    expect(validateBackupIntegrity(input, [table()]).notNull).toEqual([columnNotNull(), columnNotNull({ column: "z" }), domainNotNull()]);
  });
  it.each([
    ["null record", null], ["unknown kind", columnNotNull({ targetKind: "table" })],
    ["unknown key", { ...columnNotNull(), notNull: true }], ["omitted column", { targetKind: "column", schema: "public", name: "items" }],
    ["null table column", columnNotNull({ column: null })], ["invalid column", columnNotNull({ column: "a\n" })],
    ["unknown table", columnNotNull({ name: "absent" })], ["system schema", domainNotNull({ schema: "pg_catalog" })],
    ["domain column", domainNotNull({ column: "id" })], ["unbounded identifier", domainNotNull({ name: "a".repeat(64) })],
  ])("rejects malformed not-null %s", (_, record) => {
    code(() => validateBackupIntegrity(evidence([table()], [], [record]), [table()]), "integrity_invalid");
  });
  it("rejects duplicate and excessive not-null records", () => {
    code(() => validateBackupIntegrity(evidence([table()], [], [columnNotNull(), columnNotNull()]), [table()]), "integrity_invalid");
    code(() => validateBackupIntegrity(evidence([table()], [], Array(100001).fill(domainNotNull())), [table()]), "integrity_invalid");
  });
});

describe("backup integrity snapshot capture", () => {
  it("hashes sorted complete row digests with duplicate-preserving newline framing", async () => {
    const hashes = [sha('{"id":2}'), sha('{"id":1}'), sha('{"id":2}')];
    const client = fakeClient({ hashes: [hashes], constraints: [constraint()] });
    const result = await captureBackupIntegrity(client, [table("items", "3")]);
    expect(result.tables).toEqual([{ ...table("items", "3"), sha256: digest(hashes) }]);
    expect(result.tables[0].sha256).not.toBe(digest([...new Set(hashes)]));
    expect(client.cursors.size).toBe(0);
    expect(client.queries.some(sql => /sha256\(convert_to\(to_jsonb\(t\)::text,'UTF8'\)\)/.test(sql))).toBe(true);
    expect(client.queries.some(sql => sql.includes('ORDER BY row_hash COLLATE "C"'))).toBe(true);
    expect(client.queries.join("\n")).not.toMatch(/\b(md5|DISTINCT|BEGIN|COMMIT|ROLLBACK)\b/);
  });
  it("produces the same result for different physical row ordering", async () => {
    const hashes = [sha("a"), sha("b"), sha("c")], inventory = [table("items", "3")];
    const a = await captureBackupIntegrity(fakeClient({ hashes: [hashes] }), inventory);
    const b = await captureBackupIntegrity(fakeClient({ hashes: [[...hashes].reverse()] }), inventory);
    expect(compareBackupIntegrity(a, b)).toBe(true);
  });
  it("uses bounded cursor chunks across more than 1000 rows and handles empty tables", async () => {
    const hashes = Array(2001).fill(sha("same"));
    const client = fakeClient({ hashes: [hashes, []] });
    const result = await captureBackupIntegrity(client, [table("items", "2001"), table("z")]);
    expect(result.tables.map(t => t.sha256)).toEqual([digest(hashes), sha("")]);
    expect(client.queries.filter(sql => sql.startsWith("FETCH FORWARD 1000 "))).toHaveLength(6);
  });
  it("proves a transaction block before applying only local canonical settings", async () => {
    const client = fakeClient();
    await captureBackupIntegrity(client, [table()]);
    expect(client.queries[1]).toMatch(/^DECLARE .* NO SCROLL CURSOR WITHOUT HOLD FOR SELECT 1$/);
    expect(client.queries[2]).toMatch(/^CLOSE /);
    expect(client.queries.filter(sql => sql.startsWith("SET LOCAL"))).toEqual([
      "SET LOCAL search_path = pg_catalog", "SET LOCAL TimeZone = 'UTC'", "SET LOCAL DateStyle = 'ISO, YMD'",
      "SET LOCAL IntervalStyle = 'iso_8601'", "SET LOCAL extra_float_digits = 3", "SET LOCAL bytea_output = 'hex'",
      "SET LOCAL lc_monetary = 'C'", "SET LOCAL standard_conforming_strings = on",
    ]);
  });
  it.each([
    [{ readOnly: "off", isolation: "repeatable read", version: "170005" }],
    [{ readOnly: "on", isolation: "read committed", version: "170005" }],
    [{ readOnly: "on", isolation: "serializable", version: "170005" }], [],
  ])("refuses an unverified snapshot status %#", async rows => {
    const client = fakeClient({ status: Array.isArray(rows) ? rows : [rows] });
    await expect(captureBackupIntegrity(client, [table()])).rejects.toMatchObject({ code: "integrity_snapshot_required" });
    expect(client.queries).toHaveLength(1);
  });
  it.each(["160005", "190001", "17", "secret", null])("refuses unsupported PostgreSQL version %s", async version => {
    const client = fakeClient({ status: [{ readOnly: "on", isolation: "repeatable read", version }] });
    await expect(captureBackupIntegrity(client, [table()])).rejects.toMatchObject({ code: "integrity_version_unsupported" });
    expect(client.queries).toHaveLength(1);
  });
  it.each(["170000", "180001"])("accepts supported major via %s", async version => {
    const client = fakeClient({ status: [{ readOnly: "on", isolation: "repeatable read", version }] });
    expect((await captureBackupIntegrity(client, [table()])).version).toBe(1);
  });
  it("does not proceed when non-hold cursor proves there is no transaction block", async () => {
    const client = fakeClient({ failWhen: sql => sql.endsWith("FOR SELECT 1") });
    await expect(captureBackupIntegrity(client, [table()])).rejects.toMatchObject({ code: "integrity_unavailable" });
    expect(client.queries).toHaveLength(2);
  });
  it("rejects malformed input without querying", async () => {
    const client = fakeClient();
    await expect(captureBackupIntegrity(client, [{ ...table(), rows: 2 }])).rejects.toMatchObject({ code: "integrity_invalid" });
    expect(client.queries).toHaveLength(0);
    await expect(captureBackupIntegrity(null, [table()])).rejects.toMatchObject({ code: "integrity_unavailable" });
  });
  it.each([[sha("a")], [sha("a"), sha("b"), sha("c")]])("refuses row-count drift and closes cursor %#", async (...hashes) => {
    const client = fakeClient({ hashes: [hashes] });
    await expect(captureBackupIntegrity(client, [table("items", "2")])).rejects.toMatchObject({ code: "integrity_row_count_mismatch" });
    expect(client.cursors.size).toBe(0);
  });
  it.each([
    [{ row_hash: "raw secret" }], [{ row_hash: sha("a"), raw: "never accepted" }],
    [{ row_hash: "f".repeat(64) }, { row_hash: "0".repeat(64) }], [null],
  ])("refuses malformed or unordered hash output %#", async (...rows) => {
    const client = fakeClient({ rawHashRows: rows });
    await expect(captureBackupIntegrity(client, [table("items", "2")])).rejects.toMatchObject({ code: "integrity_invalid" });
    expect(client.cursors.size).toBe(0);
  });
  it("bounds driver fetch framing and closes the cursor on failure", async () => {
    for (const malformedFetch of [{ rows: null }, { rows: Array(101).fill(constraint()) }]) {
      const client = fakeClient({ malformedFetch });
      await expect(captureBackupIntegrity(client, [table()])).rejects.toMatchObject({ code: "integrity_invalid" });
      expect(client.cursors.size).toBe(0);
    }
  });
  it("checks all user-schema constraints including domains before row capture", async () => {
    const client = fakeClient({ constraints: [constraint({ targetKind: "domain", targetName: "positive", type: "c", validated: false })] });
    await expect(captureBackupIntegrity(client, [table()])).rejects.toMatchObject({ code: "integrity_unvalidated_constraint" });
    expect(client.queries.some(sql => sql.includes("FROM ONLY"))).toBe(false);
    expect(client.cursors.size).toBe(0);
    const sql = client.queries.find(sql => sql.includes("FROM pg_constraint c"));
    expect(sql).toContain("LEFT JOIN pg_type");
    expect(sql).toContain("pg_get_constraintdef(c.oid,false)");
    expect(sql).toContain("to_jsonb(c)->>'conenforced'");
    expect(sql).toContain("to_jsonb(c)->>'conperiod'");
    expect(sql).toContain("LIMIT 100001");
    expect(sql).not.toMatch(/contype\s*=|information_schema\.|has_table_privilege/);
  });
  it("captures PG18 domain NOT NULL and detects its removal or changed validation state", async () => {
    const domain = constraint({ name: "text_not_null", targetKind: "domain", targetName: "required_text",
      type: "n", definition: "NOT NULL" });
    const client = fakeClient({ constraints: [domain], status: [{ readOnly: "on", isolation: "repeatable read", version: "180001" }] });
    const captured = await captureBackupIntegrity(client, [table()]);
    expect(captured.constraints).toEqual([domain]);
    code(() => compareBackupIntegrity(evidence(), captured), "integrity_mismatch");
    code(() => validateBackupIntegrity(evidence([table()], [{ ...domain, validated: false }]), [table()]), "integrity_unvalidated_constraint");
  });
  it.each(["170005", "180001"])("captures column and unused-domain NOT NULL independently of data on PG%s", async version => {
    const client = fakeClient({ notNull: [domainNotNull(), columnNotNull()],
      status: [{ readOnly: "on", isolation: "repeatable read", version }] });
    const captured = await captureBackupIntegrity(client, [table()]);
    expect(captured.notNull).toEqual([columnNotNull(), domainNotNull()]);
    expect(captured.tables[0].rows).toBe("0");
    for (const notNull of [[columnNotNull()], [domainNotNull()], []])
      code(() => compareBackupIntegrity({ ...captured, notNull }, captured), "integrity_mismatch");
    const sql = client.queries.find(sql => sql.includes("FROM pg_attribute a"));
    expect(sql).toContain("a.attnotnull"); expect(sql).toContain("t.typnotnull");
    expect(sql).toContain("t.typtype='d'"); expect(sql).toContain("NOT a.attisdropped");
    expect(client.cursors.size).toBe(0);
  });
  it("rejects unknown not-null columns before content reads and closes the cursor", async () => {
    const client = fakeClient({ notNull: [columnNotNull({ name: "uncaptured_table" })] });
    await expect(captureBackupIntegrity(client, [table()])).rejects.toMatchObject({ code: "integrity_invalid" });
    expect(client.queries.some(sql => sql.includes("FROM ONLY"))).toBe(false);
    expect(client.cursors.size).toBe(0);
  });
  it("quotes identifiers, never interpolating them as SQL syntax", async () => {
    const client = fakeClient();
    await captureBackupIntegrity(client, [table('x"; DROP TABLE forbidden; --', "0", 'my"schema')]);
    expect(client.queries.find(sql => sql.includes("FROM ONLY"))).toContain('FROM ONLY "my""schema"."x""; DROP TABLE forbidden; --" AS t');
  });
  it.each(["SELECT current_setting", "SET LOCAL", "FETCH FORWARD", "CLOSE"])("suppresses raw driver errors from %s", async prefix => {
    const client = fakeClient({ failWhen: sql => sql.startsWith(prefix) });
    try { await captureBackupIntegrity(client, [table()]); throw new Error("Expected refusal"); }
    catch (error) {
      expect(error).toBeInstanceOf(BackupCoverageError);
      expect(error.code).toBe("integrity_unavailable");
      expect(error.message).toBe("backup_coverage_integrity_unavailable");
      expect(error.cause).toBeUndefined();
    }
  });
});

describe("backup integrity comparison", () => {
  it("ignores ordering but requires the complete canonical table and constraint content", () => {
    const inventory = [table(), table("z")];
    const a = evidence(inventory, [constraint({ name: "a" }), constraint({ name: "b" })]), b = clone(a);
    b.tables.reverse(); b.constraints.reverse();
    expect(compareBackupIntegrity(a, b)).toBe(true);
  });
  it.each([
    ["row content", e => { e.tables[0].sha256 = sha("different"); }],
    ["row count", e => { e.tables[0].rows = "1"; }],
    ["missing constraint", e => { e.constraints = []; }],
    ["extra constraint", e => { e.constraints.push(constraint({ name: "extra" })); }],
    ["definition", e => { e.constraints[0].definition = "PRIMARY KEY (other)"; }],
    ["flags", e => { e.constraints[0].deferrable = true; }],
  ])("rejects %s drift without returning identifiers or contents", (_, mutate) => {
    const expected = evidence([table()], [constraint()]), actual = clone(expected); mutate(actual);
    code(() => compareBackupIntegrity(actual, expected), "integrity_mismatch");
  });
  it("rejects malformed actual and expected evidence", () => {
    code(() => compareBackupIntegrity(null, evidence()), "integrity_invalid");
    code(() => compareBackupIntegrity(evidence(), { ...evidence(), version: 0 }), "integrity_invalid");
  });
  it("publishes explicit frozen bounds", () => {
    expect(Object.isFrozen(BACKUP_INTEGRITY_LIMITS)).toBe(true);
    expect(BACKUP_INTEGRITY_LIMITS.evidenceBytes).toBe(16 * 1024 * 1024);
  });
});
