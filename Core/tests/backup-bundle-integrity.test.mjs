import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mocked = vi.hoisted(() => ({ spawn: vi.fn(), capture: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocked.spawn }));
vi.mock("../scripts/lib/backup-integrity.mjs", async importOriginal => ({
  ...await importOriginal(), captureBackupIntegrity: mocked.capture,
}));
import { createEncryptedBundle, objectKeys, sha256, validateBackupReceipt, validateManifest }
  from "../scripts/lib/backup.mjs";

const id = "33333333-3333-4333-8333-333333333333";
const instance = "fixture", startedAt = "2026-11-01T15:00:00.000Z";
const snapshot = "00000001-00000002-1";
const algorithm = "sha256-jsonb-row-multiset-v1";
const tables = [
  { schema: "pgx", name: "settings", rows: "1" },
  { schema: "public", name: "bob_tasks", rows: "2" },
];
const integrity = () => ({ version: 1, algorithm,
  tables: tables.map((table, i) => ({ ...table, sha256: String(i + 1).repeat(64) })), constraints: [], notNull: [] });
const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

// This envelope is deliberately NOT encryption. The fake child boundary lets
// these tests inspect what would be sent to age, without executing tools,
// creating real keys, or making any database/network connection.
const envelope = bytes => Buffer.from(`synthetic-envelope:${bytes.toString("base64")}`);
const openEnvelope = bytes => Buffer.from(bytes.toString().slice("synthetic-envelope:".length), "base64");

async function fixture({ failure } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "bob-bundle-integrity-test-"));
  roots.push(directory);
  const events = [];
  const client = { query: vi.fn(async sql => {
    if (sql.includes("pg_export_snapshot()")) {
      events.push("snapshot");
      return { rows: [{ snapshot, version: "18.6" }] };
    }
    if (sql.includes("FROM pg_class")) {
      events.push("inventory");
      return { rows: tables.map(({ schema, name }) => ({ schema, name })) };
    }
    const table = tables.find(t => sql.includes(`FROM ONLY "${t.schema}"."${t.name}"`));
    if (table) { events.push(`count:${table.name}`); return { rows: [{ count: table.rows }] }; }
    throw new Error("Unexpected synthetic database query.");
  }) };
  mocked.capture.mockImplementation(async (receivedClient, receivedTables) => {
    events.push("integrity");
    expect(receivedClient).toBe(client);
    expect(receivedTables).toEqual(tables);
    if (failure === "integrity") throw new Error("Synthetic integrity capture failed.");
    return integrity();
  });
  mocked.spawn.mockImplementation((command, args, options) => {
    const child = new EventEmitter();
    child.stderr = new PassThrough();
    if (command === "synthetic-pg-dump") {
      events.push("spawn:dump");
      child.stdout = new PassThrough();
      queueMicrotask(() => {
        child.stdout.end(Buffer.from("synthetic database archive"));
        child.emit("close", failure === "dump" ? 1 : 0);
      });
    } else {
      expect(command).toBe("synthetic-age");
      const output = args[args.indexOf("--output") + 1];
      const stage = output.endsWith("manifest.age") ? "manifest" : "archive";
      events.push(`spawn:${stage}`);
      const chunks = [];
      child.stdin = new Writable({
        write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); },
        final(callback) {
          const finish = async () => {
            if (failure !== stage) await writeFile(output, envelope(Buffer.concat(chunks)), { mode: 0o600 });
            callback();
            child.emit("close", failure === stage ? 1 : 0);
          };
          finish().catch(error => { callback(error); child.emit("error", error); });
        },
      });
    }
    return child;
  });
  const input = { client, connectionString: "postgresql://capture:synthetic@fixture.invalid/postgres",
    directory, recipient: "age1" + "a".repeat(58), id, instance, startedAt,
    pgDump: "synthetic-pg-dump", age: "synthetic-age",
    expectedTables: tables.map(({ schema, name }) => ({ schema, name })),
    coverage: { version: 1, projectKey: "bobai", synthetic: true } };
  return { input, client, events, directory };
}

function boundFixture() {
  const receipt = { version: 2, id, instance, startedAt, keys: objectKeys(instance, id, startedAt),
    bytes: 42, archiveSha256: "a".repeat(64), manifestSha256: "b".repeat(64),
    recipientFingerprint: "c".repeat(64), integrity: { version: 1, algorithm } };
  const manifest = { format: "bob-disaster-backup", version: 2, id, instance, startedAt,
    postgresVersion: "18.6", snapshot, archiveSha256: receipt.archiveSha256,
    recipientFingerprint: receipt.recipientFingerprint, tables: structuredClone(tables), integrity: integrity() };
  return { manifest, receipt, actualArchiveHash: receipt.archiveSha256 };
}

describe("snapshot-bound encrypted integrity bundle", () => {
  it("captures integrity through the same held client before dumping the exported snapshot", async () => {
    const f = await fixture();
    let finishCapture, announceCapture;
    const entered = new Promise(resolve => { announceCapture = resolve; });
    const capture = new Promise(resolve => { finishCapture = resolve; });
    mocked.capture.mockImplementation(async (client, inventory) => {
      expect(client).toBe(f.client); expect(inventory).toEqual(tables);
      f.events.push("integrity:start"); announceCapture();
      await capture; f.events.push("integrity:end"); return integrity();
    });
    const pending = createEncryptedBundle(f.input);
    await entered;
    expect(mocked.spawn).not.toHaveBeenCalled();
    finishCapture();
    const result = await pending;
    expect(f.client.query.mock.calls.filter(([sql]) => sql.includes("pg_export_snapshot()"))).toHaveLength(1);
    expect(mocked.capture).toHaveBeenCalledExactlyOnceWith(f.client, tables);
    expect(f.events.indexOf("integrity:end")).toBeLessThan(f.events.indexOf("spawn:dump"));
    const [command, args, options] = mocked.spawn.mock.calls[0];
    expect(command).toBe("synthetic-pg-dump");
    expect(args.filter(arg => arg.startsWith("--snapshot="))).toEqual([`--snapshot=${snapshot}`]);
    expect(options.env.PGOPTIONS).toBe("-c default_transaction_read_only=on");

    const encryptedArchive = await readFile(result.archive);
    const encryptedManifest = await readFile(result.manifestFile);
    const manifest = JSON.parse(openEnvelope(encryptedManifest));
    expect(manifest).toMatchObject({ version: 2, snapshot, postgresVersion: "18.6",
      tables, integrity: integrity(), coverage: f.input.coverage });
    expect(result.receipt).toMatchObject({ version: 2, archiveSha256: sha256(encryptedArchive),
      manifestSha256: sha256(encryptedManifest), bytes: encryptedArchive.length,
      integrity: { version: 1, algorithm } });
    expect(result.receipt.manifestSha256).not.toBe(sha256(openEnvelope(encryptedManifest)));
    expect(JSON.parse(await readFile(join(f.directory, "receipt.json"), "utf8"))).toEqual(result.receipt);
    expect(await readdir(f.directory)).toEqual(["backup.dump.age", "backup.manifest.age", "receipt.json"]);
    for (const key of ["tables", "constraints", "snapshot"]) expect(result.receipt).not.toHaveProperty(key);
    for (const table of integrity().tables) expect(JSON.stringify(result.receipt)).not.toContain(table.sha256);
    expect(() => validateManifest(manifest, result.receipt, sha256(encryptedArchive))).not.toThrow();
  });

  it.each(["integrity", "dump", "archive", "manifest"])("does not produce a successful receipt when %s fails", async failure => {
    const f = await fixture({ failure });
    await expect(createEncryptedBundle(f.input)).rejects.toThrow();
    expect(await readdir(f.directory)).not.toContain("receipt.json");
    if (failure === "integrity") expect(mocked.spawn).not.toHaveBeenCalled();
  });

  it("refuses missing integrity evidence before starting a dump", async () => {
    const f = await fixture();
    mocked.capture.mockResolvedValue(undefined);
    await expect(createEncryptedBundle(f.input)).rejects.toThrow();
    expect(mocked.spawn).not.toHaveBeenCalled();
    expect(await readdir(f.directory)).toEqual([]);
  });
});

describe("integrity manifest and receipt binding", () => {
  it("accepts a complete v2 pair and requires its public integrity descriptor", () => {
    const f = boundFixture();
    expect(() => validateBackupReceipt(f.receipt, { requireIntegrity: true })).not.toThrow();
    expect(() => validateManifest(f.manifest, f.receipt, f.actualArchiveHash)).not.toThrow();
  });

  it.each([
    ["missing manifest evidence", f => { delete f.manifest.integrity; }],
    ["missing receipt descriptor", f => { delete f.receipt.integrity; }],
    ["missing manifest ciphertext hash", f => { delete f.receipt.manifestSha256; }],
    ["malformed manifest ciphertext hash", f => { f.receipt.manifestSha256 = "bad-hash"; }],
    ["altered archive ciphertext", f => { f.actualArchiveHash = "d".repeat(64); }],
    ["swapped backup identity", f => { f.manifest.id = "other-backup-id"; }],
    ["swapped recipient", f => { f.manifest.recipientFingerprint = "d".repeat(64); }],
    ["swapped instance keys", f => { f.receipt.keys = objectKeys("other", id, startedAt); }],
    ["mismatched versions", f => { f.receipt.version = 1; delete f.receipt.integrity; }],
    ["unknown manifest version", f => { f.manifest.version = 3; }],
    ["unsupported integrity algorithm", f => { f.manifest.integrity.algorithm = "sha256-unknown"; }],
    ["unsupported receipt algorithm", f => { f.receipt.integrity.algorithm = "sha256-unknown"; }],
    ["unsupported evidence version", f => { f.manifest.integrity.version = 2; }],
    ["unsupported receipt descriptor version", f => { f.receipt.integrity.version = 2; }],
    ["plaintext table evidence in receipt descriptor", f => { f.receipt.integrity.tables = integrity().tables; }],
    ["missing table fingerprint", f => { f.manifest.integrity.tables.pop(); }],
    ["unexpected table fingerprint", f => { f.manifest.integrity.tables.push({ schema: "other", name: "private", rows: "0", sha256: "f".repeat(64) }); }],
    ["duplicate table fingerprint", f => { f.manifest.integrity.tables.push({ ...f.manifest.integrity.tables[0] }); }],
    ["different table identity", f => { f.manifest.integrity.tables[0].schema = "different"; }],
    ["different table row count", f => { f.manifest.integrity.tables[0].rows = "99"; }],
    ["malformed table digest", f => { f.manifest.integrity.tables[0].sha256 = "not-a-digest"; }],
    ["missing constraint inventory", f => { delete f.manifest.integrity.constraints; }],
    ["missing snapshot binding", f => { delete f.manifest.snapshot; }],
    ["malformed snapshot binding", f => { f.manifest.snapshot = "not a snapshot"; }],
    ["unsupported PostgreSQL version", f => { f.manifest.postgresVersion = "16.8"; }],
  ])("rejects %s", (_name, change) => {
    const f = boundFixture(); change(f);
    expect(() => validateManifest(f.manifest, f.receipt, f.actualArchiveHash)).toThrow();
  });

  it("rejects legacy by default and accepts only explicit legacy verification without integrity claims", () => {
    const f = boundFixture();
    f.manifest.version = f.receipt.version = 1;
    delete f.manifest.integrity; delete f.manifest.snapshot; delete f.receipt.integrity;
    expect(() => validateBackupReceipt(f.receipt)).not.toThrow();
    expect(() => validateBackupReceipt(f.receipt, { requireIntegrity: true })).toThrow();
    expect(() => validateManifest(f.manifest, f.receipt, f.actualArchiveHash)).toThrow();
    expect(() => validateManifest(f.manifest, f.receipt, f.actualArchiveHash, { allowLegacy: true })).not.toThrow();
    f.manifest.integrity = integrity();
    expect(() => validateManifest(f.manifest, f.receipt, f.actualArchiveHash, { allowLegacy: true })).toThrow();
    delete f.manifest.integrity; f.receipt.integrity = { version: 1, algorithm };
    expect(() => validateManifest(f.manifest, f.receipt, f.actualArchiveHash, { allowLegacy: true })).toThrow();
  });
});
