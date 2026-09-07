import { randomBytes } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { hashPassword } from "better-auth/crypto";
import { getMigrations } from "better-auth/db/migration";
import {
  createOwnerAuth,
  ownerAuthOptions,
  ownerEmail,
  withOwnerDatabase,
} from "../lib/owner-auth";

function argument(name: string) {
  return process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

async function main() {
  const mode = argument("mode");
  const output = argument("output");
  if (!output || !["schema", "bootstrap", "recover"].includes(mode ?? ""))
    throw new Error(
      "Use --mode=schema|bootstrap|recover --output=/absolute/path. Schema mode only writes a migration for review.",
    );
  const path = resolve(output);
  if (mode === "schema") {
    await withOwnerDatabase(async (pool) => {
      const plan = await getMigrations(ownerAuthOptions(pool, true));
      if (plan.unsafeChanges.length || plan.schemaProblems.length)
        throw new Error("Migration review requires resolving schema warnings.");
      await writeFile(
        path,
        `-- Generated from Better Auth 1.7.3. Review before applying.\n${await plan.compileMigrations()}\n`,
        { flag: "wx" },
      );
    });
    console.log("Auth migration generated for review. No schema was changed.");
    return;
  }
  const repository = resolve(import.meta.dirname, "../..");
  const relativePath = relative(repository, path);
  if (!relativePath.startsWith(".."))
    throw new Error("Setup/recovery output must be outside the repository.");
  if (
    mode === "recover" &&
    !process.argv.includes("--revoke-existing-sessions")
  )
    throw new Error("Recovery requires --revoke-existing-sessions.");
  const password = randomBytes(36).toString("base64url");
  // Create the private recovery artifact first; never print a password to logs.
  await writeFile(
    path,
    `Bob owner ${mode}\nEmail: ${ownerEmail()}\nTemporary password: ${password}\nEnable password sign-in only during setup/recovery. Add and verify a passkey, then disable password sign-in.\n`,
    { mode: 0o600, flag: "wx" },
  );
  try {
    await withOwnerDatabase(async (pool) => {
      if (mode === "bootstrap") {
        const existing = await pool.query(
          "SELECT id FROM bob_auth_user LIMIT 1",
        );
        if (existing.rowCount)
          throw new Error(
            "An owner already exists. Use the documented recovery procedure.",
          );
        await createOwnerAuth(pool, true).api.signUpEmail({
          body: { name: "Bob owner", email: ownerEmail(), password },
        });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const user = await client.query(
          "SELECT id FROM bob_auth_user WHERE email = $1 FOR UPDATE",
          [ownerEmail()],
        );
        if (user.rowCount !== 1)
          throw new Error("The configured owner does not exist.");
        const updated = await client.query(
          'UPDATE bob_auth_account SET password = $1, "updatedAt" = now() WHERE "userId" = $2 AND "providerId" = $3 RETURNING id',
          [await hashPassword(password), user.rows[0].id, "credential"],
        );
        if (updated.rowCount !== 1)
          throw new Error("Owner credential account requires manual review.");
        await client.query('DELETE FROM bob_auth_session WHERE "userId" = $1', [
          user.rows[0].id,
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  } catch (error) {
    await unlink(path);
    throw error;
  }
  console.log(
    `Owner ${mode} completed. The private output file contains the temporary password. Keep it outside the deployment and revoke password sign-in after passkey acceptance.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Owner setup failed.");
  process.exitCode = 1;
});
