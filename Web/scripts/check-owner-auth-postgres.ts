import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createOwnerAuth, withOwnerDatabase } from "../lib/owner-auth";

async function main() {
  if (process.env.BOB_TEST_BRANCH_ID !== "br-crimson-truth-ayza0tdz")
    throw new Error(
      "This acceptance fixture requires the isolated continuity branch.",
    );
  if (process.env.BOB_AUTH_OWNER_EMAIL !== "owner@bob.example")
    throw new Error("Use the synthetic acceptance owner only.");
  await withOwnerDatabase(async (pool) => {
    const schema = await pool.query(
      "SELECT to_regclass('public.bob_auth_user') AS table_name",
    );
    if (!schema.rows[0].table_name)
      await pool.query(
        await readFile(
          new URL("../../Core/migrations/004_owner_auth.sql", import.meta.url),
          "utf8",
        ),
      );
    const auth = createOwnerAuth(pool, true);
    const email = "owner@bob.example";
    const password = "isolated-acceptance-password-only-000000000";
    if (
      !(
        await pool.query("SELECT id FROM bob_auth_user WHERE email = $1", [
          email,
        ])
      ).rowCount
    ) {
      await auth.api.signUpEmail({
        body: { name: "Test owner", email, password },
      });
    }
    const publicAuth = createOwnerAuth(pool);
    const origin = process.env.BOB_AUTH_BASE_URL!;
    const post = (
      path: string,
      body: unknown,
      cookie?: string,
      requestOrigin = origin,
    ) =>
      publicAuth.handler(
        new Request(`${origin}/api/auth${path}`, {
          method: "POST",
          headers: {
            origin: requestOrigin,
            "content-type": "application/json",
            "x-forwarded-for": "192.0.2.83",
            ...(cookie ? { cookie } : {}),
          },
          body: JSON.stringify(body),
        }),
      );
    assert.equal(
      (
        await post("/sign-up/email", {
          email: "intruder@bob.example",
          name: "Intruder",
          password,
        })
      ).status,
      400,
    );
    assert.equal(
      (await pool.query("SELECT count(*)::int AS count FROM bob_auth_user"))
        .rows[0].count,
      1,
    );
    assert.equal(
      (
        await post(
          "/sign-in/email",
          { email, password },
          undefined,
          "https://untrusted.example",
        )
      ).status,
      403,
    );
    const login = await post("/sign-in/email", { email, password });
    assert.equal(login.status, 200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    assert(cookie.includes("bob_owner.session_token="));
    const requestHeaders = new Headers({ cookie });
    const session = await publicAuth.api.getSession({
      headers: requestHeaders,
    });
    assert.equal(session?.user.email, email);
    const options = await publicAuth.handler(
      new Request(`${origin}/api/auth/passkey/generate-register-options`, {
        headers: { cookie, origin },
      }),
    );
    assert.equal(options.status, 200);
    const challenge = await options.json();
    assert.equal(challenge.rp.id, "localhost");
    assert.equal(challenge.authenticatorSelection.userVerification, "required");
    const noSession = await publicAuth.handler(
      new Request(`${origin}/api/auth/passkey/generate-register-options`, {
        headers: { origin },
      }),
    );
    assert.equal(noSession.status, 401);
    await publicAuth.api.revokeSession({
      headers: requestHeaders,
      body: { token: session!.session.token },
    });
    assert.equal(
      await createOwnerAuth(pool).api.getSession({ headers: requestHeaders }),
      null,
    );
    console.log(
      "PASS: sole-owner signup restriction, origin enforcement, durable login, passkey challenge requiring user verification, unauthenticated enrollment denial, immediate session revocation after a new auth instance.",
    );
  });
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Auth acceptance failed.",
  );
  process.exitCode = 1;
});
