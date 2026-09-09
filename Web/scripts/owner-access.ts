import { randomBytes } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { hashPassword } from "better-auth/crypto";
import { getMigrations } from "better-auth/db/migration";
import {
  createOwnerAuth,
  ownerAuthOptions,
  ownerEmail,
  withOwnerDatabase,
} from "../lib/owner-auth";
import { writePrivateRecoveryOutput } from "./private-recovery-output";

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
  if (
    mode === "recover" &&
    !process.argv.includes("--revoke-existing-sessions")
  )
    throw new Error("Recovery requires --revoke-existing-sessions.");
  const password = randomBytes(36).toString("base64url");
  // Create the private recovery artifact first; never print a password to logs.
  const artifact = await writePrivateRecoveryOutput(
    output,
    `Bob owner ${mode}\nEmail: ${ownerEmail()}\nTemporary password: ${password}\nEnable password sign-in only during setup/recovery. Add and verify a passkey, then disable password sign-in.\n`,
    resolve(import.meta.dirname, "../.."),
  );
  let commitAttempted = false;
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
        // An API/database commit may succeed even when its response is lost.
        commitAttempted = true;
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
        const grants = await client.query(
          "SELECT to_regclass('public.bob_oauth_project_grants') IS NOT NULL AS exists",
        );
        if (grants.rows[0].exists) {
          await client.query(
            "UPDATE bob_oauth_project_grants SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1",
            [user.rows[0].id],
          );
          for (const table of [
            "bob_auth_oauth_access_token",
            "bob_auth_oauth_refresh_token",
            "bob_auth_oauth_consent",
          ])
            await client.query(`DELETE FROM ${table} WHERE "userId"=$1`, [
              user.rows[0].id,
            ]);
        }
        await client.query('DELETE FROM bob_auth_session WHERE "userId" = $1', [
          user.rows[0].id,
        ]);
        commitAttempted = true;
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  } catch (error) {
    if (!commitAttempted) await unlink(artifact);
    else
      console.error(
        "Retain the private artifact and verify owner access before retrying this uncertain operation.",
      );
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
