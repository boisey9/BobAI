import { randomBytes } from "node:crypto";
import { lstat, readFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createOwnerAuth,
  ownerEmail,
  withOwnerDatabase,
} from "../lib/owner-auth";
import { oauthEnabled, OAUTH_SCOPES, mcpResource } from "../lib/oauth-grants";
import { writePrivateRecoveryOutput } from "./private-recovery-output";

const argument = (name: string) =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
let phase = "configuration";
async function main() {
  const kind = argument("kind");
  const output = argument("output");
  const passwordFile = argument("owner-password-file");
  if (
    !oauthEnabled() ||
    !output ||
    !passwordFile ||
    !["resource", "public"].includes(kind ?? "")
  )
    throw new Error(
      "Enable OAuth locally and supply --kind=resource|public --output=/private/path --owner-password-file=/private/path.",
    );
  phase = "private password input";
  const passwordStat = await lstat(passwordFile);
  if (!passwordStat.isFile() || passwordStat.mode & 0o077)
    throw new Error("Owner password input must be a private regular file.");
  const contents = (await readFile(passwordFile, "utf8")).trim();
  const password =
    contents.match(/^Temporary password: (.+)$/m)?.[1] ?? contents;
  if (password.length < 20 || password.includes("\n"))
    throw new Error("Invalid private password file format.");
  const origin = new URL(process.env.BOB_AUTH_BASE_URL!).origin;
  const resource = mcpResource();
  const redirect =
    kind === "resource" ? `${origin}/account` : argument("redirect-uri");
  if (!redirect)
    throw new Error(
      "Public clients require the exact --redirect-uri supplied by that client.",
    );
  // Persist the generated identity before registration. An uncertain response
  // can be reconciled by this ID without creating another credential.
  const identity = {
    clientId: randomBytes(24).toString("base64url"),
    ...(kind === "resource"
      ? { clientSecret: randomBytes(36).toString("base64url") }
      : {}),
  };
  phase = "private output reservation";
  const artifact = await writePrivateRecoveryOutput(
    output,
    JSON.stringify({
      version: 1,
      status: "registration-pending",
      kind,
      issuer: `${origin}/api/auth`,
      resource,
      redirect,
      ...identity,
    }) + "\n",
    resolve(import.meta.dirname, "../.."),
  );
  await withOwnerDatabase(async (pool) => {
    phase = "owner verification";
    // Temporary password verification is enabled only in this offline operator
    // process. The deployed sign-in setting is not modified.
    const auth = createOwnerAuth(pool, true, undefined, identity);
    const signedIn = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: ownerEmail(), password }),
      }),
    );
    if (!signedIn.ok)
      throw new Error(
        "Owner verification failed; no OAuth client was registered.",
      );
    const cookies = signedIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const headers = new Headers({ origin, cookie: cookies });
    try {
      phase = "client registration";
      // createOwnerAuth intentionally erases plugin API types for the Web build;
      // registration remains a Better Auth server-only endpoint.
      const api = auth.api as typeof auth.api & {
        adminCreateOAuthClient(input: {
          headers: Headers;
          body: Record<string, unknown>;
        }): Promise<{ client_id: string }>;
      };
      const created = await api.adminCreateOAuthClient({
        headers,
        body: {
          client_name:
            kind === "resource"
              ? "Bob Core resource verifier"
              : (argument("name") ?? "Owner-approved MCP client"),
          redirect_uris: [redirect],
          application_type:
            kind === "resource"
              ? new URL(origin).protocol === "http:"
                ? "native"
                : "web"
              : (argument("application-type") ?? "web"),
          token_endpoint_auth_method:
            kind === "resource" ? "client_secret_basic" : "none",
          grant_types:
            kind === "resource"
              ? ["authorization_code"]
              : ["authorization_code", "refresh_token"],
          scope: OAUTH_SCOPES.join(" "),
          require_pkce: true,
        },
      });
      if (created.client_id !== identity.clientId)
        throw new Error("Registered client identity requires reconciliation.");
      await appendFile(
        artifact,
        JSON.stringify({
          status: "registration-confirmed",
          clientId: identity.clientId,
        }) + "\n",
      );
    } finally {
      await auth.api.signOut({ headers });
    }
  });
  console.log(
    "OAuth client registered. Credentials are in the private output file; no deployment configuration was changed.",
  );
}
main().catch(() => {
  console.error(JSON.stringify({ event: "oauth.client.failed", phase }));
  console.error(
    "OAuth registration was not confirmed. Retain the private artifact and reconcile its client ID before retrying. No credentials were logged.",
  );
  process.exitCode = 1;
});
