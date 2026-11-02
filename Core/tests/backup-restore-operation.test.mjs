import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runRestoreDatabase, writeRestoreOutcome } from "../scripts/lib/backup-restore-operation.mjs";
import { objectKeys, sha256 } from "../scripts/lib/backup.mjs";

const roots = [];
const id = "33333333-3333-4333-8333-333333333333", instance = "testing-fixture", startedAt = "2026-11-01T18:00:00.000Z";
const secret = "synthetic-private-sentinel", algorithm = "sha256-jsonb-row-multiset-v1";
const verification = { tablesVerified: 1, integrityLevel: "full-content-and-constraints", constraintsVerified: 0 };
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

// No real encryption, database, process execution or network occurs. Actual
// private files exercise the operating boundary, and the injected command writes
// deterministic plaintext fixtures to the operation's own temporary directory.
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "bob-restore-operation-"))); roots.push(root);
  const archive = Buffer.from("synthetic archive ciphertext"), manifestCiphertext = Buffer.from("synthetic manifest ciphertext");
  const tables = [{ schema: "public", name: "bob_tasks", rows: "1" }];
  const receipt = { version: 2, id, instance, startedAt, keys: objectKeys(instance, id, startedAt),
    bytes: archive.length, archiveSha256: sha256(archive), manifestSha256: sha256(manifestCiphertext),
    recipientFingerprint: sha256("synthetic public recipient"), integrity: { version: 1, algorithm } };
  const manifest = { format: "bob-disaster-backup", version: 2, id, instance, startedAt,
    postgresVersion: "18.6", snapshot: "00000001-00000002-1", archiveSha256: receipt.archiveSha256,
    recipientFingerprint: receipt.recipientFingerprint, tables,
    integrity: { version: 1, algorithm, tables: tables.map(t => ({ ...t, sha256: "a".repeat(64) })), constraints: [], notNull: [] } };
  const options = { archive: join(root, "archive.dump.age"), manifest: join(root, "manifest.age"), receipt: join(root, "receipt.json"),
    identity: join(root, "synthetic.age"), destinationURLFile: join(root, "destination-url"), confirmEmptyDestination: true,
    age: "synthetic-age", pgRestore: "synthetic-pg-restore" };
  await writeFile(options.archive, archive, { mode: 0o600 }); await writeFile(options.manifest, manifestCiphertext, { mode: 0o600 });
  await writeFile(options.receipt, JSON.stringify(receipt), { mode: 0o600 });
  await writeFile(options.identity, "synthetic private age identity", { mode: 0o600 });
  await writeFile(options.destinationURLFile, `postgresql://synthetic_operator:${secret}@fixture.invalid/synthetic_restore`, { mode: 0o600 });
  const events = [], temporary = new Set();
  const runCommand = vi.fn(async (command, args, env, label) => {
    if (command === options.age) {
      const output = args[args.indexOf("--output") + 1]; temporary.add(dirname(output));
      const isManifest = output.endsWith("manifest.json");
      expect(args.at(-1)).not.toBe(isManifest ? options.manifest : options.archive);
      expect(await readFile(args.at(-1))).toEqual(isManifest ? manifestCiphertext : archive);
      events.push(isManifest ? "decrypt:manifest" : "decrypt:archive");
      await writeFile(output, isManifest ? JSON.stringify(manifest) : "synthetic plaintext archive", { mode: 0o600 });
      return;
    }
    expect(command).toBe(options.pgRestore); events.push("restore");
  });
  const verify = vi.fn(async client => { events.push("verify"); return { ...verification }; });
  return { root, options, archive, manifestCiphertext, receipt, manifest, events, temporary, runCommand, verify };
}

function safeFailure(outcome, code) {
  expect(outcome.exitCode).not.toBe(0); expect(outcome.result.event).toBe("restore.failed");
  if (code) expect(outcome.result.code).toBe(code);
  expect(JSON.stringify(outcome)).not.toContain(secret);
  expect(JSON.stringify(outcome)).not.toContain("postgresql://");
  expect(JSON.stringify(outcome)).not.toContain("Error:");
  expect(outcome.result).not.toHaveProperty("error");
}

// Stateful transaction double, deliberately not a SQL evaluator. It models
// committed versus pending unsafe-access counters so ordering/fault tests can
// prove all-or-none orchestration. The separate real PostgreSQL fixture owns SQL
// semantics and representative authentication-schema acceptance.
async function operationFixture() {
  const f = await fixture();
  const names = ["bob_backup_runs", "bob_projects", "bob_oauth_project_grants", "bob_auth_oauth_client", "bob_auth_oauth_resource",
    "bob_auth_oauth_access_token", "bob_auth_oauth_refresh_token", "bob_auth_oauth_consent", "bob_auth_session", "bob_auth_verification"];
  let committed = Object.fromEntries(names.map(name => [name, name === "bob_backup_runs" ? 1 : 2])), pending;
  const initial = structuredClone(committed);
  const config = { database: "synthetic_restore", role: "synthetic_operator", sessionRole: "synthetic_operator", major: 18,
    empty: 0, schemas: [], tables: new Set(names), failMutation: undefined, readbackFailure: undefined,
    commitFailure: false, rollbackFailure: false, closeFailure: false, removeFailure: false, restoreFailure: false };
  const client = { query: vi.fn(async (sql, params = []) => {
    if (sql === "SELECT 1 AS synthetic_verify_probe") return { rows: [{ synthetic_verify_probe: 1 }] };
    if (sql.includes("current_database()")) {
      f.events.push("identity"); return { rows: [{ database_name: config.database, current_role: config.role,
        session_role: config.sessionRole, major: config.major }] };
    }
    if (sql.includes("nspname=ANY") || sql.includes("nspname = ANY")) {
      f.events.push("authority-profile"); return { rows: config.schemas.map(schema => ({ schema })) };
    }
    if (sql.includes("c.relkind IN")) { f.events.push("empty"); return { rows: [{ count: config.empty }] }; }
    if (sql.includes("server_version_num")) return { rows: [{ major: config.major }] };
    if (sql.startsWith("BEGIN")) { expect(pending).toBeUndefined(); pending = structuredClone(committed); f.events.push("begin"); return { rows: [] }; }
    if (sql === "COMMIT") {
      expect(pending).toBeDefined(); committed = pending; pending = undefined; f.events.push("commit");
      config.onCommit?.();
      if (config.commitFailure) throw Error(secret); return { rows: [] };
    }
    if (sql === "ROLLBACK") {
      f.events.push("rollback"); if (config.rollbackFailure) throw Error(secret); pending = undefined; return { rows: [] };
    }
    if (/^(SET LOCAL|LOCK TABLE)/.test(sql)) return { rows: [] };
    if (sql.includes("to_regclass")) return { rows: [{ exists: config.tables.has(params[0]?.replace(/^public\./, "")) }] };
    const target = sql.match(/(?:UPDATE|DELETE FROM|FROM)\s+(?:public\.)?"?(bob_[a-z_]+)"?/i)?.[1];
    if (/^(UPDATE|DELETE FROM)/.test(sql.trim())) {
      expect(pending).toBeDefined(); expect(f.events).toContain("verify");
      expect(target).toBeDefined(); f.events.push(`mutate:${target}`);
      if (target === config.failMutation) throw Error(secret);
      pending[target] = 0;
      return { rows: target === "bob_backup_runs" ? [{ id }] : [], rowCount: 2 };
    }
    if (sql.includes(" AS remaining")) {
      expect(pending).toBeDefined(); f.events.push(`readback:${target}`);
      config.afterReadback?.(target, pending);
      return { rows: [{ remaining: config.readbackFailure === target ? 1 : pending[target] }] };
    }
    throw Error(`Unexpected synthetic query: ${sql}`);
  }) };
  const openDestination = vi.fn(async url => {
    f.events.push("open"); expect(url).toContain("fixture.invalid/synthetic_restore");
    return { client, close: async () => { f.events.push("close"); config.onClose?.(); if (config.closeFailure) throw Error(secret); } };
  });
  const remove = vi.fn(async (path, options) => {
    f.events.push("remove"); roots.push(path);
    if (config.removeFailure) throw Error(secret);
    return rm(path, options);
  });
  const command = f.runCommand.getMockImplementation();
  f.runCommand.mockImplementation(async (...args) => {
    await command(...args);
    if (args[0] === f.options.pgRestore) { config.empty = 25; if (config.restoreFailure) throw Error(secret); }
  });
  f.verify.mockImplementation(async suppliedClient => {
    expect(typeof suppliedClient.query).toBe("function");
    expect(await suppliedClient.query("SELECT 1 AS synthetic_verify_probe")).toEqual({ rows: [{ synthetic_verify_probe: 1 }] });
    f.events.push("verify"); return { ...verification };
  });
  return { ...f, client, config, initial, state: () => ({ committed: structuredClone(committed), pending: pending && structuredClone(pending) }),
    deps: { openDestination, runCommand: f.runCommand, verify: f.verify, remove }, openDestination, remove,
    run: overrides => runRestoreDatabase(f.options, { openDestination, runCommand: f.runCommand, verify: f.verify, remove, ...overrides }) };
}

describe("restore operation input refusal", () => {
  it.each([undefined, false, "true"])("requires explicit empty-destination confirmation %j before effects", async confirm => {
    const f = await fixture(), openDestination = vi.fn(); f.options.confirmEmptyDestination = confirm;
    safeFailure(await runRestoreDatabase(f.options, { openDestination, runCommand: f.runCommand, verify: f.verify }));
    expect(openDestination).not.toHaveBeenCalled(); expect(f.runCommand).not.toHaveBeenCalled(); expect(f.verify).not.toHaveBeenCalled();
  });
  it.each(["archive", "manifest", "receipt", "identity", "destinationURLFile"])("refuses missing %s before opening a destination", async name => {
    const f = await fixture(), openDestination = vi.fn(); delete f.options[name];
    safeFailure(await runRestoreDatabase(f.options, { openDestination, runCommand: f.runCommand }));
    expect(openDestination).not.toHaveBeenCalled(); expect(f.runCommand).not.toHaveBeenCalled();
  });
  it.each(["archive", "manifest", "receipt", "identity", "destinationURLFile"])("refuses relative %s before effects", async name => {
    const f = await fixture(), openDestination = vi.fn(); f.options[name] = "relative-synthetic-private-sentinel";
    safeFailure(await runRestoreDatabase(f.options, { openDestination, runCommand: f.runCommand }));
    expect(openDestination).not.toHaveBeenCalled(); expect(f.runCommand).not.toHaveBeenCalled();
  });
  it.each(["archive-hash", "manifest-hash", "archive-length", "receipt-json", "receipt-version"])
  ("checks actual file bytes: %s refuses before opening a destination", async kind => {
    const f = await fixture(), openDestination = vi.fn();
    if (kind === "archive-hash") await writeFile(f.options.archive, Buffer.alloc(f.archive.length, "x"));
    if (kind === "manifest-hash") await writeFile(f.options.manifest, Buffer.alloc(f.manifestCiphertext.length, "x"));
    if (kind === "archive-length") await writeFile(f.options.archive, Buffer.concat([f.archive, Buffer.from("x")]));
    if (kind === "receipt-json") await writeFile(f.options.receipt, "{synthetic-private-sentinel");
    if (kind === "receipt-version") { f.receipt.version = 3; await writeFile(f.options.receipt, JSON.stringify(f.receipt)); }
    safeFailure(await runRestoreDatabase(f.options, { openDestination, runCommand: f.runCommand }));
    expect(openDestination).not.toHaveBeenCalled(); expect(f.runCommand).not.toHaveBeenCalled();
  });
  it.each(["identity", "destinationURLFile"])("refuses public permissions on %s", async name => {
    const f = await fixture(), openDestination = vi.fn(); await chmod(f.options[name], 0o644);
    safeFailure(await runRestoreDatabase(f.options, { openDestination, runCommand: f.runCommand }));
    expect(openDestination).not.toHaveBeenCalled(); expect(f.runCommand).not.toHaveBeenCalled();
  });
  it("refuses malformed destination URL without emitting its contents", async () => {
    const f = await fixture(), openDestination = vi.fn(); await writeFile(f.options.destinationURLFile, secret);
    safeFailure(await runRestoreDatabase(f.options, { openDestination, runCommand: f.runCommand }));
    expect(openDestination).not.toHaveBeenCalled(); expect(f.runCommand).not.toHaveBeenCalled();
  });
  it.each([
    "host%3Devil%20dbname%3Dx", "synthetic_restore%2Fother", "synthetic_restore?host=evil",
    "synthetic_restore?sslmode=require&sslmode=verify-full", "synthetic_restore?options=-csearch_path%3Devil",
    "synthetic_restore?user=other", "synthetic_restore?dbname=other",
  ])("refuses transport-retargeting destination %s before effects", async suffix => {
    const f = await fixture(), openDestination = vi.fn();
    await writeFile(f.options.destinationURLFile, `postgresql://synthetic_operator:${secret}@fixture.invalid/${suffix}`);
    safeFailure(await runRestoreDatabase(f.options, { openDestination, runCommand: f.runCommand }), "restore_input_invalid");
    expect(openDestination).not.toHaveBeenCalled(); expect(f.runCommand).not.toHaveBeenCalled();
  });
  it.each(["EP-SYNTHETIC-POOLER.Example.Invalid", "%66ixture.invalid", "0x7f.0x0.0x0.0x1"])
  ("refuses pooled or encoded ambiguous hostname %s before effects", async hostname => {
    const f = await fixture(), openDestination = vi.fn();
    await writeFile(f.options.destinationURLFile, `postgresql://synthetic_operator:${secret}@${hostname}/synthetic_restore`);
    safeFailure(await runRestoreDatabase(f.options, { openDestination, runCommand: f.runCommand }), "restore_input_invalid");
    expect(openDestination).not.toHaveBeenCalled(); expect(f.runCommand).not.toHaveBeenCalled();
  });
});

describe("restore destination and authority gates", () => {
  it("normalizes mixed-case DNS identically for the client and pg_restore", async () => {
    const f = await operationFixture();
    await writeFile(f.options.destinationURLFile, `postgresql://synthetic_operator:${secret}@FiXtUrE.InVaLiD/synthetic_restore`);
    expect((await f.run()).exitCode).toBe(0);
    expect(new URL(f.openDestination.mock.calls[0][0]).hostname).toBe("fixture.invalid");
    const command = f.runCommand.mock.calls.find(([name]) => name === f.options.pgRestore);
    expect(command[2].PGHOST).toBe("fixture.invalid");
  });
  it("uses the same normalized verified-TLS database identity for client and pg_restore", async () => {
    const f = await operationFixture();
    await writeFile(f.options.destinationURLFile,
      `postgresql://synthetic_operator:${secret}@fixture.invalid/synthetic_restore?sslmode=require&channel_binding=require`);
    expect((await f.run()).exitCode).toBe(0);
    const destination = new URL(f.openDestination.mock.calls[0][0]);
    expect(destination.searchParams.get("sslmode")).toBe("verify-full");
    expect(destination.searchParams.get("channel_binding")).toBe("require");
    const command = f.runCommand.mock.calls.find(([name]) => name === f.options.pgRestore);
    expect(command[2]).toMatchObject({ PGDATABASE: "synthetic_restore", PGUSER: "synthetic_operator", PGHOST: "fixture.invalid",
      PGSSLMODE: "verify-full", PGCHANNELBINDING: "require" });
    expect(command[1]).toContain("--dbname=synthetic_restore");
  });
  it.each(["database", "role", "sessionRole"])("refuses a different connected %s before restore", async field => {
    const f = await operationFixture(); f.config[field] = "wrong-target";
    safeFailure(await f.run(), "restore_destination_mismatch");
    expect(f.runCommand).not.toHaveBeenCalled(); expect(f.verify).not.toHaveBeenCalled();
    expect(f.events).not.toContain("begin"); expect(f.events).toContain("close");
  });
  it("refuses a nonempty target without decrypting or dropping anything", async () => {
    const f = await operationFixture(); f.config.empty = 1;
    safeFailure(await f.run(), "restore_destination_not_empty");
    expect(f.runCommand).not.toHaveBeenCalled(); expect(f.state().committed).toEqual(f.initial);
    expect(f.client.query.mock.calls.some(([sql]) => /DROP|TRUNCATE/i.test(sql))).toBe(false);
  });
  it("refuses the wrong PostgreSQL major before pg_restore", async () => {
    const f = await operationFixture(); f.config.major = 17;
    safeFailure(await f.run(), "restore_version_mismatch");
    expect(f.events).not.toContain("restore"); expect(f.verify).not.toHaveBeenCalled(); expect(f.events).not.toContain("begin");
  });
  it.each(["bob_workflow", "bob_owner_delegation", "bob_private_checks"])
  ("refuses unsupported destination authority schema %s before restoration", async schema => {
    const f = await operationFixture(); f.config.schemas = [schema];
    safeFailure(await f.run(), "restore_authority_profile_unsupported");
    expect(f.events).not.toContain("restore"); expect(f.verify).not.toHaveBeenCalled(); expect(f.events).not.toContain("begin");
  });
  it.each(["bob_workflow", "bob_owner_delegation", "bob_private_checks"])
  ("refuses unsupported manifest authority schema %s before restoration", async schema => {
    const f = await operationFixture(), table = { schema, name: "synthetic_authority", rows: "0" };
    f.manifest.tables.push(table); f.manifest.integrity.tables.push({ ...table, sha256: "b".repeat(64) });
    safeFailure(await f.run(), "restore_authority_profile_unsupported");
    expect(f.events).not.toContain("restore"); expect(f.verify).not.toHaveBeenCalled(); expect(f.events).not.toContain("begin");
  });
  it("refuses an unsupported authority namespace present only in unused-domain evidence", async () => {
    const f = await operationFixture();
    f.manifest.integrity.notNull.push({ targetKind: "domain", schema: "bob_private_checks", name: "unused_authority", column: null });
    safeFailure(await f.run(), "restore_authority_profile_unsupported");
    expect(f.events).not.toContain("restore"); expect(f.verify).not.toHaveBeenCalled(); expect(f.events).not.toContain("begin");
  });
  it("rechecks the connected role before quarantine after verification", async () => {
    const f = await operationFixture();
    f.verify.mockImplementationOnce(async () => { f.events.push("verify"); f.config.role = "changed-role"; return { ...verification }; });
    const outcome = await f.run(); safeFailure(outcome, "restore_destination_mismatch");
    expect(outcome.result.destinationMayContainRestoredData).toBe(true);
    expect(f.events).toContain("restore"); expect(f.events.filter(x => x.startsWith("mutate:"))).toEqual([]);
    expect(f.state().committed).toEqual(f.initial);
  });
});

describe("restore phase order and atomic copied-access quarantine", () => {
  it("decrypts only its verified staged bytes after the caller replaces an original artifact", async () => {
    const f = await operationFixture(), open = f.openDestination.getMockImplementation();
    f.openDestination.mockImplementationOnce(async url => {
      await writeFile(f.options.archive, Buffer.alloc(f.archive.length, "x")); return open(url);
    });
    const outcome = await f.run(); expect(outcome.exitCode).toBe(0);
    expect(f.events).toContain("decrypt:archive");
    expect(await readFile(f.options.archive)).toEqual(Buffer.alloc(f.archive.length, "x"));
  });
  it("does not restore after decryption failure, and still closes and cleans temporary files", async () => {
    const f = await operationFixture(); f.runCommand.mockRejectedValueOnce(Error(secret));
    const outcome = await f.run(); safeFailure(outcome, "restore_decryption_failed");
    expect(outcome.result.destinationMayContainRestoredData).toBe(false);
    expect(f.verify).not.toHaveBeenCalled(); expect(f.events).not.toContain("begin");
    expect(f.events).toContain("close"); expect(f.events).toContain("remove");
  });
  it("binds the decrypted manifest to the actual ciphertext before pg_restore", async () => {
    const f = await operationFixture(); f.manifest.archiveSha256 = "f".repeat(64);
    const outcome = await f.run(); safeFailure(outcome, "restore_manifest_invalid");
    expect(outcome.result.destinationMayContainRestoredData).toBe(false); expect(f.events).not.toContain("restore");
    expect(f.verify).not.toHaveBeenCalled(); expect(f.events).not.toContain("begin");
  });
  it.each([false, true])("requires explicit counts-only acceptance for legacy bundles: %j", async accept => {
    const f = await operationFixture(); f.receipt.version = 1; delete f.receipt.integrity;
    f.manifest.version = 1; delete f.manifest.integrity; f.options.allowLegacyCountsOnly = accept;
    await writeFile(f.options.receipt, JSON.stringify(f.receipt));
    f.verify.mockImplementationOnce(async () => { f.events.push("verify"); return { tablesVerified: 1, integrityLevel: "legacy-counts-only" }; });
    const outcome = await f.run();
    if (accept) {
      expect(outcome.exitCode).toBe(0); expect(outcome.result.integrityLevel).toBe("legacy-counts-only");
      expect(outcome.result).not.toHaveProperty("constraintsVerified");
    } else {
      safeFailure(outcome, "restore_manifest_invalid"); expect(f.events).not.toContain("restore"); expect(f.verify).not.toHaveBeenCalled();
    }
  });
  it("verifies before mutating and commits all copied access and ledger changes before success", async () => {
    const f = await operationFixture(), outcome = await f.run();
    expect(outcome.exitCode).toBe(0); expect(outcome.result).toMatchObject({ event: "restore.verified", backupId: id, snapshotAt: startedAt,
      ...verification, copiedInterfaceCredentialsRevoked: true, runtimeAcceptanceRequired: true });
    expect(JSON.stringify(outcome)).not.toContain(secret); expect(outcome.result).not.toHaveProperty("error");
    const firstMutation = f.events.findIndex(event => event.startsWith("mutate:"));
    expect(f.events.indexOf("restore")).toBeLessThan(f.events.indexOf("verify"));
    expect(f.events.indexOf("verify")).toBeLessThan(f.events.indexOf("begin"));
    expect(f.events.indexOf("begin")).toBeLessThan(firstMutation);
    expect(f.events.indexOf("commit")).toBeGreaterThan(f.events.findLastIndex(event => event.startsWith("readback:")));
    expect(f.events.indexOf("commit")).toBeLessThan(f.events.indexOf("close"));
    expect(f.events).toContain("remove"); expect(f.state().pending).toBeUndefined();
    expect(Object.values(f.state().committed)).toEqual(Object.values(f.initial).map(() => 0));
    expect(f.events).toContain("mutate:bob_auth_oauth_resource");
    const restoreCall = f.runCommand.mock.calls.find(([command]) => command === f.options.pgRestore);
    expect(restoreCall[1]).toEqual(expect.arrayContaining(["--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", "--dbname=synthetic_restore"]));
    expect(restoreCall[1]).not.toContain("--clean"); expect(restoreCall[1]).not.toContain("--create");
    expect(restoreCall[1].join(" ")).not.toContain(secret);
    for (const directory of f.temporary) await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(f.options.archive)).toEqual(f.archive); // Input artifacts stay available for reconciliation.
  });
  it("does no quarantine or ledger mutation after integrity verification fails", async () => {
    const f = await operationFixture(); f.verify.mockRejectedValueOnce(Error(secret));
    const outcome = await f.run(); safeFailure(outcome, "restore_integrity_failed");
    expect(outcome.result.destinationMayContainRestoredData).toBe(true);
    expect(f.events).toContain("restore"); expect(f.events).not.toContain("begin"); expect(f.events).not.toContain("commit");
    expect(f.state().committed).toEqual(f.initial); expect(f.events).toContain("close"); expect(f.events).toContain("remove");
  });
  it.each(["bob_projects", "bob_auth_oauth_client", "bob_auth_oauth_resource", "bob_auth_session"])
  ("rolls back the complete mutation transaction when %s mutation fails", async table => {
    const f = await operationFixture(); f.config.failMutation = table;
    const outcome = await f.run(); safeFailure(outcome, "restore_quarantine_failed");
    expect(outcome.result.commitUncertain).toBe(false); expect(f.events).toContain("rollback"); expect(f.events).not.toContain("commit");
    expect(f.state().committed).toEqual(f.initial); expect(f.state().pending).toBeUndefined();
    expect(f.events).toContain("close"); expect(f.events).toContain("remove");
  });
  it.each(["bob_backup_runs", "bob_projects", "bob_auth_oauth_resource", "bob_auth_oauth_access_token"])
  ("rolls back every mutation after failed %s readback", async table => {
    const f = await operationFixture(); f.config.readbackFailure = table;
    const outcome = await f.run(); safeFailure(outcome, "restore_quarantine_readback_failed");
    expect(f.events).toContain(`readback:${table}`); expect(f.events).toContain("rollback"); expect(f.events).not.toContain("commit");
    expect(f.state().committed).toEqual(f.initial); expect(f.state().pending).toBeUndefined();
  });
  it("reports an applied COMMIT with a lost acknowledgement as uncertain, never success", async () => {
    const f = await operationFixture(); f.config.commitFailure = true;
    const outcome = await f.run(); safeFailure(outcome, "restore_commit_unconfirmed");
    expect(outcome.result.commitUncertain).toBe(true); expect(outcome.result.destinationMayContainRestoredData).toBe(true);
    expect(f.events.filter(x => x === "commit")).toHaveLength(1);
    expect(Object.values(f.state().committed)).toEqual(Object.values(f.initial).map(() => 0));
    expect(f.events).toContain("close"); expect(f.events).toContain("remove");
  });
  it("does not convert an unconfirmed rollback into a confirmed failed transaction", async () => {
    const f = await operationFixture(); f.config.failMutation = "bob_auth_session"; f.config.rollbackFailure = true;
    const outcome = await f.run(); safeFailure(outcome, "restore_rollback_unconfirmed");
    expect(f.events).toContain("rollback"); expect(f.events).not.toContain("commit");
    expect(f.events).toContain("close"); expect(f.events).toContain("remove");
  });
  it("marks a failed pg_restore target as possibly populated and refuses an automatic destructive retry", async () => {
    const f = await operationFixture(); f.config.restoreFailure = true;
    const outcome = await f.run(); safeFailure(outcome, "restore_command_failed");
    expect(outcome.result.destinationMayContainRestoredData).toBe(true);
    expect(f.verify).not.toHaveBeenCalled(); expect(f.events).not.toContain("begin");
    const commands = f.runCommand.mock.calls.length; safeFailure(await f.run(), "restore_destination_not_empty");
    expect(f.runCommand).toHaveBeenCalledTimes(commands);
    expect(f.client.query.mock.calls.some(([sql]) => /DROP|TRUNCATE/i.test(sql))).toBe(false);
  });
  it.each(["close", "remove", "both"])("suppresses successful receipt after %s cleanup failure", async failure => {
    const f = await operationFixture(); f.config.closeFailure = failure !== "remove"; f.config.removeFailure = failure !== "close";
    const outcome = await f.run(); safeFailure(outcome, "restore_cleanup_failed");
    expect(outcome.result.cleanupUncertain).toBe(true); expect(outcome.result.destinationMayContainRestoredData).toBe(true);
    expect(f.events).toContain("commit"); expect(f.events).toContain("close"); expect(f.events).toContain("remove");
    expect(Object.values(f.state().committed)).toEqual(Object.values(f.initial).map(() => 0));
  });
  it("preserves uncertain commit as the primary outcome when both cleanup steps also fail", async () => {
    const f = await operationFixture(); Object.assign(f.config, { commitFailure: true, closeFailure: true, removeFailure: true });
    const outcome = await f.run(); safeFailure(outcome, "restore_commit_unconfirmed");
    expect(outcome.result.commitUncertain).toBe(true); expect(outcome.result.cleanupUncertain).toBe(true);
    expect(f.events).toContain("close"); expect(f.events).toContain("remove");
  });
  it("preserves integrity refusal when cleanup also fails", async () => {
    const f = await operationFixture(); f.verify.mockRejectedValueOnce(Error(secret));
    Object.assign(f.config, { closeFailure: true, removeFailure: true });
    const outcome = await f.run(); safeFailure(outcome, "restore_integrity_failed");
    expect(outcome.result.cleanupUncertain).toBe(true); expect(f.events).not.toContain("begin");
    expect(f.events).toContain("close"); expect(f.events).toContain("remove");
  });
});

describe("restore cancellation at authority boundaries", () => {
  it.each([["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129], ["synthetic-private-sentinel", 1]])
  ("refuses an already-aborted %s operation before destination or command effects", async (reason, exitCode) => {
    const f = await operationFixture(), controller = new AbortController(); controller.abort(reason); f.options.signal = controller.signal;
    const outcome = await f.run(); safeFailure(outcome, "restore_interrupted"); expect(outcome.exitCode).toBe(exitCode);
    expect(outcome.result.destinationMayContainRestoredData).toBe(false); expect(outcome.result.commitUncertain).toBe(false);
    expect(f.openDestination).not.toHaveBeenCalled(); expect(f.runCommand).not.toHaveBeenCalled(); expect(f.verify).not.toHaveBeenCalled();
  });
  it("stops before quarantine when cancellation arrives during verification", async () => {
    const f = await operationFixture(), controller = new AbortController(); f.options.signal = controller.signal;
    f.verify.mockImplementationOnce(async () => { f.events.push("verify"); controller.abort("SIGINT"); return { ...verification }; });
    const outcome = await f.run(); safeFailure(outcome, "restore_interrupted"); expect(outcome.exitCode).toBe(130);
    expect(outcome.result.destinationMayContainRestoredData).toBe(true); expect(outcome.result.commitUncertain).toBe(false);
    expect(f.events).not.toContain("begin"); expect(f.events).not.toContain("commit"); expect(f.state().committed).toEqual(f.initial);
    expect(f.events).toContain("close"); expect(f.events).toContain("remove");
    expect(f.runCommand.mock.calls.every(call => call[5] === controller.signal)).toBe(true);
  });
  it("preserves interruption from the guarded verification query without forwarding another SQL call", async () => {
    const f = await operationFixture(), controller = new AbortController(); f.options.signal = controller.signal;
    f.verify.mockImplementationOnce(async client => {
      f.events.push("verify"); controller.abort("SIGTERM");
      await client.query("SELECT 1 AS synthetic_verify_probe"); return { ...verification };
    });
    const outcome = await f.run(); safeFailure(outcome, "restore_interrupted"); expect(outcome.exitCode).toBe(143);
    expect(f.client.query.mock.calls.some(([sql]) => sql === "SELECT 1 AS synthetic_verify_probe")).toBe(false);
    expect(f.events).not.toContain("begin"); expect(f.events).not.toContain("commit");
  });
  it("rolls back completed quarantine mutations when cancellation arrives before COMMIT", async () => {
    const f = await operationFixture(), controller = new AbortController(); f.options.signal = controller.signal;
    f.config.afterReadback = (_table, pending) => { if (Object.values(pending).every(count => count === 0)) controller.abort("SIGTERM"); };
    const outcome = await f.run(); safeFailure(outcome, "restore_interrupted"); expect(outcome.exitCode).toBe(143);
    expect(f.events).toContain("begin"); expect(f.events).toContain("rollback"); expect(f.events).not.toContain("commit");
    expect(f.state().committed).toEqual(f.initial); expect(f.state().pending).toBeUndefined();
    expect(outcome.result.commitUncertain).toBe(false); expect(f.events).toContain("close"); expect(f.events).toContain("remove");
  });
  it.each([false, true])("keeps commit uncertainty when interrupted during the COMMIT response (rejected: %j)", async rejected => {
    const f = await operationFixture(), controller = new AbortController(); f.options.signal = controller.signal;
    f.config.onCommit = () => controller.abort("SIGHUP"); f.config.commitFailure = rejected;
    const outcome = await f.run(); safeFailure(outcome, "restore_commit_unconfirmed");
    expect(outcome.result.commitUncertain).toBe(true); expect(outcome.result.destinationMayContainRestoredData).toBe(true);
    expect(f.events.filter(event => event === "commit")).toHaveLength(1);
    expect(Object.values(f.state().committed)).toEqual(Object.values(f.initial).map(() => 0));
    expect(f.events).toContain("close"); expect(f.events).toContain("remove");
  });
  it("does not publish success when interrupted during close after an acknowledged COMMIT", async () => {
    const f = await operationFixture(), controller = new AbortController(); f.options.signal = controller.signal;
    f.config.onClose = () => controller.abort("SIGTERM");
    const outcome = await f.run(); safeFailure(outcome, "restore_interrupted"); expect(outcome.exitCode).toBe(143);
    expect(outcome.result.commitUncertain).toBe(false); expect(outcome.result.destinationMayContainRestoredData).toBe(true);
    expect(f.events).toContain("commit"); expect(f.events).toContain("close"); expect(f.events).toContain("remove");
    expect(Object.values(f.state().committed)).toEqual(Object.values(f.initial).map(() => 0));
  });
});

describe("restore terminal acknowledgement", () => {
  const success = () => ({ exitCode: 0, result: { event: "restore.verified", backupId: id, snapshotAt: startedAt,
    ...verification, copiedInterfaceCredentialsRevoked: true, runtimeAcceptanceRequired: true } });
  it("acknowledges successful output without changing its result", async () => {
    const outcome = success(), write = vi.fn(async () => {});
    expect(await writeRestoreOutcome({ ...outcome, write })).toBe(0);
    expect(write).toHaveBeenCalledExactlyOnceWith("stdout", outcome.result);
  });
  it("never emits success when already interrupted before terminal delivery", async () => {
    const controller = new AbortController(); controller.abort("SIGINT"); const write = vi.fn(async () => {});
    expect(await writeRestoreOutcome({ ...success(), signal: controller.signal, write })).toBe(130);
    expect(write.mock.calls.some(([stream]) => stream === "stdout")).toBe(false);
    expect(write).toHaveBeenCalledWith("stderr", expect.objectContaining({ event: "restore.failed", backupId: id,
      code: "restore_interrupted", destinationMayContainRestoredData: true, commitUncertain: false, cleanupUncertain: false }));
  });
  it("reports a lost successful output acknowledgement without rerunning the operation", async () => {
    const write = vi.fn().mockRejectedValueOnce(Error(secret)).mockResolvedValueOnce(undefined);
    expect(await writeRestoreOutcome({ ...success(), write })).toBe(1);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]).toEqual(["stderr", expect.objectContaining({ event: "restore.failed", backupId: id,
      code: "restore_output_failed", destinationMayContainRestoredData: true, commitUncertain: false, cleanupUncertain: false })]);
    expect(JSON.stringify(write.mock.calls)).not.toContain(secret);
  });
  it.each(["primary", "fallback"])("releases a stalled %s acknowledgement on cancellation and observes its later rejection", async stage => {
    const controller = new AbortController(), unhandled = [], listener = error => unhandled.push(error);
    process.on("unhandledRejection", listener);
    let rejectPending, entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const write = vi.fn((stream) => {
      if (stage === "fallback" && stream === "stdout") return Promise.reject(Error(secret));
      if ((stage === "primary" && stream === "stdout") || stage === "fallback") {
        entered(); return new Promise((_resolve, reject) => { rejectPending = reject; });
      }
      return Promise.resolve();
    });
    try {
      const pending = writeRestoreOutcome({ ...success(), signal: controller.signal, write });
      await ready; controller.abort("SIGTERM");
      expect(await pending).toBe(143); rejectPending(Error(secret));
      await new Promise(resolve => setImmediate(resolve));
      expect(unhandled).toEqual([]); expect(write.mock.calls[0][0]).toBe("stdout");
      expect(write.mock.calls.at(-1)).toEqual(["stderr", expect.objectContaining({ event: "restore.failed", backupId: id })]);
      expect(JSON.stringify(write.mock.calls)).not.toContain(secret);
    } finally { process.removeListener("unhandledRejection", listener); }
  });
  it("preserves a prior uncertain commit and cleanup flags when terminal delivery fails or is interrupted", async () => {
    const result = { event: "restore.failed", backupId: id, code: "restore_commit_unconfirmed", phase: "quarantine",
      destinationMayContainRestoredData: true, commitUncertain: true, cleanupUncertain: true };
    const controller = new AbortController(); controller.abort("SIGHUP"); const write = vi.fn().mockRejectedValue(Error(secret));
    expect(await writeRestoreOutcome({ result, exitCode: 1, signal: controller.signal, write })).toBe(1);
    expect(write).toHaveBeenCalledExactlyOnceWith("stderr", result);
  });
});

describe("restore import and command boundary", () => {
  it("imports the operation without running commands or opening a destination", () => {
    const module = new URL("../scripts/lib/backup-restore-operation.mjs", import.meta.url).href;
    const output = execFileSync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(module)});`],
      { env: { PATH: "/usr/bin:/bin" }, encoding: "utf8", timeout: 8000 });
    expect(output).toBe("");
  });
  it.each([["--unexpected=synthetic-private-sentinel"], ["synthetic-private-sentinel"], ["--confirm-empty-destination"]])
  ("refuses CLI arguments %j with safe structured output", args => {
    let failure;
    try { execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/restore-database.mjs", import.meta.url)), ...args],
      { env: { PATH: "/usr/bin:/bin" }, encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) { failure = error; }
    expect(failure).toBeDefined(); expect(failure.status).not.toBe(0); expect(failure.signal).toBeNull();
    expect(failure.stdout).toBe(""); expect(failure.stderr).not.toContain(secret);
    const result = JSON.parse(failure.stderr.trim()); expect(result.event).toBe("restore.failed");
    expect(result.code).toMatch(/^restore_/); expect(result).not.toHaveProperty("error");
  });
});
