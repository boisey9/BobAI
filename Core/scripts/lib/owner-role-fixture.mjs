import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export async function checkOwnerRoleProvisioning(databaseURL, role) {
  const directory = await mkdtemp(join(tmpdir(), "bob-owner-role-"));
  try {
    const input = join(directory, "admin-url");
    const output = join(directory, "runtime-url");
    await writeFile(input, databaseURL, { mode: 0o600 });
    const run = (file) =>
      spawnSync(
        process.execPath,
        [
          fileURLToPath(
            new URL("../provision-owner-role.mjs", import.meta.url),
          ),
          `--admin-url-file=${input}`,
          `--role=${role}`,
          `--output=${file}`,
        ],
        { encoding: "utf8", timeout: 30_000 },
      );
    const created = run(output);
    assert.equal(created.status, 0, "restricted owner role CLI succeeds");
    const credential = await readFile(output, "utf8");
    const url = new URL(credential);
    assert.equal(url.username, role);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    assert(
      !created.stdout.includes(url.password) &&
        !created.stderr.includes(url.password),
      "runtime secret never printed",
    );
    assert.equal(
      run(output).status,
      1,
      "existing private artifact cannot be overwritten",
    );
    assert(
      (await readFile(output, "utf8")) === credential,
      "original credential preserved",
    );
    const second = join(directory, "duplicate-role");
    assert.equal(run(second).status, 1, "existing role cannot be changed");
    await assert.rejects(
      stat(second),
      (error) => error.code === "ENOENT",
      "uncommitted artifact removed",
    );
    return url;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
