import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../scripts/lib/backup-integrity.mjs", async importOriginal => ({
  ...await importOriginal(), captureBackupIntegrity: vi.fn(),
}));
import { captureBackupIntegrity, INTEGRITY_ALGORITHM } from "../scripts/lib/backup-integrity.mjs";
import { assertEmptyRestoreDestination, assertRestoreVersion, verifyRestoredBackup } from "../scripts/lib/backup-restore-verification.mjs";

const tables = [{ schema: "pgx", name: "items", rows: "2" }];
const evidence = () => ({ version: 1, algorithm: INTEGRITY_ALGORITHM,
  tables: [{ ...tables[0], sha256: "a".repeat(64) }], constraints: [], notNull: [] });
const manifest = () => ({ version: 2, postgresVersion: "18.6", tables, integrity: evidence() });
function fixture({ rows = "2", major = 18, empty = 0, invalid = 0 } = {}) {
  return { query: vi.fn(async sql => {
    if (sql.includes("server_version_num")) return { rows: [{ major }] };
    if (sql.includes("c.relkind IN")) return { rows: [{ count: empty }] };
    // PostgreSQL JSON transports may emit properties in a different order.
    if (sql.includes("FROM pg_class")) return { rows: [{ name: "items", schema: "pgx" }] };
    if (sql.includes("count(*)::text")) return { rows: [{ count: rows }] };
    if (sql.includes("FROM pg_constraint")) return { rows: [{ count: invalid }] };
    return { rows: [] };
  }) };
}
beforeEach(() => { captureBackupIntegrity.mockReset(); captureBackupIntegrity.mockResolvedValue(evidence()); });

describe("restore integrity boundary", () => {
  it("rejects a nonempty pgx destination using a literal system-schema prefix", async () => {
    const client = fixture({ empty: 1 });
    await expect(assertEmptyRestoreDestination(client)).rejects.toThrow("must be empty");
    const sql = client.query.mock.calls[0][0];
    expect(sql).toContain("!~ '^pg_'"); expect(sql).not.toContain("LIKE 'pg_%'");
    expect(client.query).toHaveBeenCalledTimes(1);
  });
  it("accepts an empty destination", async () => {
    await expect(assertEmptyRestoreDestination(fixture())).resolves.toBeUndefined();
  });
  it.each([16, 17, 19])("rejects destination major %i for a version18 snapshot", async major => {
    await expect(assertRestoreVersion(fixture({ major }), manifest())).rejects.toThrow("same supported");
  });
  it("compares on a read-only transaction and returns only safe verification metadata", async () => {
    const client = fixture();
    expect(await verifyRestoredBackup(client, manifest())).toEqual({ tablesVerified: 1,
      integrityLevel: "full-content-and-constraints", constraintsVerified: 0 });
    expect(captureBackupIntegrity).toHaveBeenCalledWith(client, tables);
    expect(client.query.mock.calls[0][0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(client.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
    expect(client.query.mock.calls.every(([sql]) => /^(BEGIN|SET LOCAL|SELECT|ROLLBACK)/.test(sql))).toBe(true);
  });
  it("rejects count mismatch before fingerprint work and still rolls back", async () => {
    const client = fixture({ rows: "3" });
    await expect(verifyRestoredBackup(client, manifest())).rejects.toThrow("inventory");
    expect(captureBackupIntegrity).not.toHaveBeenCalled();
    expect(client.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
  });
  it("ignores source versus destination inventory ordering", async () => {
    const wanted = manifest();
    wanted.tables = [{ schema: "pgx", name: "é", rows: "0" }, { schema: "pgx", name: "A", rows: "0" }];
    wanted.integrity.tables = wanted.tables.map(t => ({ ...t, sha256: "a".repeat(64) }));
    const client = fixture(), query = client.query;
    client.query = vi.fn(sql => sql.includes("FROM pg_class") ? Promise.resolve({ rows: [{ schema: "pgx", name: "A" }, { schema: "pgx", name: "é" }] }) :
      sql.includes("count(*)::text") ? Promise.resolve({ rows: [{ count: "0" }] }) : query(sql));
    captureBackupIntegrity.mockResolvedValue({ ...wanted.integrity, tables: [...wanted.integrity.tables].reverse() });
    expect((await verifyRestoredBackup(client, wanted)).tablesVerified).toBe(2);
  });
  it("rejects changed content with identical counts", async () => {
    const changed = evidence(); changed.tables[0].sha256 = "b".repeat(64);
    captureBackupIntegrity.mockResolvedValue(changed);
    const client = fixture();
    await expect(verifyRestoredBackup(client, manifest())).rejects.toThrow("integrity_mismatch");
    expect(client.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
  });
  it("cannot return verification after an unconfirmed transaction close", async () => {
    const client = fixture(), query = client.query;
    client.query = vi.fn(sql => sql === "ROLLBACK" ? Promise.reject(new Error("close failed")) : query(sql));
    await expect(verifyRestoredBackup(client, manifest())).rejects.toThrow("close failed");
  });
  it("reports explicitly accepted legacy evidence as counts-only", async () => {
    expect(await verifyRestoredBackup(fixture(), { version: 1, tables })).toEqual({
      tablesVerified: 1, integrityLevel: "legacy-counts-only" });
    expect(captureBackupIntegrity).not.toHaveBeenCalled();
  });
  it("keeps the legacy invalid-foreign-key refusal", async () => {
    await expect(verifyRestoredBackup(fixture({ invalid: 1 }), { version: 1, tables })).rejects.toThrow("foreign keys");
  });
  it("refuses unknown versions before any query", async () => {
    const client = fixture();
    await expect(verifyRestoredBackup(client, { version: 3 })).rejects.toThrow("Unsupported");
    expect(client.query).not.toHaveBeenCalled();
  });
});
