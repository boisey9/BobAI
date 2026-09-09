import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export async function checkOAuthProvisioning(pool, databaseURL, password) {
  const directory = await mkdtemp(join(tmpdir(), "bob-oauth-operator-"));
  try {
    const input = join(directory, "password");
    await writeFile(input, password, { mode: 0o600 });
    for (const kind of ["resource", "public"]) {
      const output = join(directory, `${kind}.jsonl`);
      const args = [
        "--import",
        "tsx",
        fileURLToPath(
          new URL("../../../Web/scripts/oauth-client.ts", import.meta.url),
        ),
        `--kind=${kind}`,
        `--owner-password-file=${input}`,
        `--output=${output}`,
        ...(kind === "public"
          ? [
              "--name=Operator fixture",
              "--application-type=native",
              "--redirect-uri=http://127.0.0.1:3997/callback",
            ]
          : []),
      ];
      const result = spawnSync(process.execPath, args, {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        env: { ...process.env, BOB_AUTH_DATABASE_URL: databaseURL },
        encoding: "utf8",
        timeout: 30_000,
      });
      const phaseLine = result.stderr
        ?.split("\n")
        .find((line) => line.startsWith('{"event":"oauth.client.failed"'));
      const phase = phaseLine
        ? JSON.parse(phaseLine).phase
        : (result.error?.code ?? "process startup");
      assert.equal(
        result.status,
        0,
        `${kind} private operator registration succeeds (${phase})`,
      );
      const records = (await readFile(output, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert.equal(
        (await stat(output)).mode & 0o777,
        0o600,
        "private output permissions",
      );
      assert.equal(records[1].status, "registration-confirmed");
      const stored = (
        await pool.query(
          'SELECT "clientSecret","grantTypes" FROM bob_auth_oauth_client WHERE "clientId"=$1',
          [records[0].clientId],
        )
      ).rows[0];
      assert.ok(stored);
      assert.equal(
        stored.grantTypes.includes("client_credentials"),
        false,
        "no machine grant",
      );
      if (kind === "resource") {
        assert.equal(typeof stored.clientSecret, "string");
        assert.notEqual(
          stored.clientSecret,
          records[0].clientSecret,
          "verifier secret is not stored in cleartext",
        );
        assert.equal(
          result.stdout.includes(records[0].clientSecret),
          false,
          "secret absent from stdout",
        );
        assert.equal(
          result.stderr.includes(records[0].clientSecret),
          false,
          "secret absent from stderr",
        );
      } else
        assert.equal(
          stored.clientSecret,
          null,
          "public client has no shared secret",
        );
    }
    console.log(
      JSON.stringify({
        event: "oauth.provisioning.passed",
        privateOutput: true,
        confidentialVerifier: true,
        publicPkceClient: true,
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
