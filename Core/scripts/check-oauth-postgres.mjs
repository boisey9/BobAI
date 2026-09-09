// Real protocol and authorization checks in one empty fixture database, never production.
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "@neondatabase/serverless";
import { observeDatabaseErrors } from "./lib/database-errors.mjs";
import { assertRecoveryDrillTarget } from "./lib/recovery-drill-target.mjs";
import { quoteIdentifier } from "./lib/backup.mjs";
import { createOwnerAuth } from "../../Web/lib/owner-auth.ts";
import {
  approveProjectGrant,
  revokeProjectGrant,
  OAUTH_SCOPES,
} from "../../Web/lib/oauth-grants.ts";
import { createOAuthGateway } from "../src/security/oauth.ts";
import { createInterfaceCredentialGateway } from "../src/security/interface-credential.ts";
import { createBobCoreRuntime } from "../src/runtime.ts";
import { createTestConfig } from "../tests/test-config.ts";
import { checkOAuthBrowser } from "./lib/oauth-browser.mjs";
import { retireExpiredOAuthSessions } from "../../Web/lib/oauth-sessions.ts";
import { checkOAuthProvisioning } from "./lib/oauth-provisioning-fixture.mjs";
import { checkOwnerRoleProvisioning } from "./lib/owner-role-fixture.mjs";

process.umask(0o077);
// A driver error can carry its entire client configuration. Never serialize it.
process.on("uncaughtException", () => {
  console.error('{"event":"oauth.fixture.driver_failure"}');
  process.exit(1);
});
const adminURL = (
  await readFile(process.env.BOB_TEST_ADMIN_URL_FILE, "utf8")
).trim();
assertRecoveryDrillTarget(process.env.BOB_TEST_BRANCH_ID, adminURL);
const database = `bob_oauth_drill_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const admin = observeDatabaseErrors(
  new Pool({ connectionString: adminURL, max: 1 }),
);
let pool,
  authPool,
  authURL,
  ownerRole,
  created = false,
  phase = "create isolated fixture";
const authOrigin = "http://localhost:3999";
const issuer = `${authOrigin}/api/auth`;
const resource = "http://localhost:3998/mcp/linked";
const callback = "http://127.0.0.1:3997/callback";
const owner = "oauth-drill";
const password = randomBytes(36).toString("base64url");
try {
  await admin.query(
    `CREATE DATABASE ${quoteIdentifier(database)} TEMPLATE template0`,
  );
  created = true;
  const fixtureURL = new URL(adminURL);
  fixtureURL.pathname = `/${database}`;
  pool = observeDatabaseErrors(
    new Pool({ connectionString: fixtureURL.toString(), max: 4 }),
  );
  for (const name of (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await pool.query(
      await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"),
    );
  const scopedRole = `bob_web_drill_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  ownerRole = scopedRole;
  phase = "private owner role provisioning";
  authURL = await checkOwnerRoleProvisioning(fixtureURL.toString(), scopedRole);
  authPool = observeDatabaseErrors(
    new Pool({ connectionString: authURL.toString(), max: 4 }),
  );
  for (const query of [
    "SELECT * FROM bob_memory_items LIMIT 1",
    "SELECT * FROM bob_tasks LIMIT 1",
    "SELECT * FROM bob_operation_receipts LIMIT 1",
    "SELECT * FROM bob_events LIMIT 1",
    "UPDATE bob_projects SET status='archived' WHERE false",
    "DELETE FROM bob_projects WHERE false",
    "CREATE TABLE public.owner_role_must_not_create(id int)",
  ])
    await assert.rejects(
      authPool.query(query),
      (error) => error.code === "42501",
      "owner role cannot access unrelated state or DDL",
    );
  Object.assign(process.env, {
    NODE_ENV: "test",
    BOB_AUTH_BASE_URL: authOrigin,
    BOB_AUTH_SECRET: randomBytes(36).toString("base64url"),
    BOB_AUTH_OWNER_EMAIL: "oauth@bob.example",
    BOB_AUTH_CORE_OWNER_ID: owner,
    BOB_AUTH_MCP_RESOURCE: resource,
    BOB_AUTH_PASSWORD_LOGIN_ENABLED: "true",
    BOB_AUTH_OAUTH_ENABLED: "true",
  });
  phase = "bootstrap owner and projects";
  const signedUp = await createOwnerAuth(authPool, true).api.signUpEmail({
    body: {
      name: "Fixture",
      email: process.env.BOB_AUTH_OWNER_EMAIL,
      password,
    },
  });
  const userId = signedUp.user.id;
  for (const key of ["bobai", "second", "personal"])
    await pool.query(
      "INSERT INTO bob_projects(id,owner_id,project_key,name) VALUES($1,$2,$3,$3)",
      [randomUUID(), owner, key],
    );
  const auth = createOwnerAuth(authPool);
  let cookies = "";
  const collect = (response) => {
    const entries = new Map(
      cookies
        .split("; ")
        .filter(Boolean)
        .map((value) => value.split(/=(.*)/s).slice(0, 2)),
    );
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(";");
      const index = pair.indexOf("=");
      entries.set(pair.slice(0, index), pair.slice(index + 1));
    }
    cookies = [...entries].map(([key, value]) => `${key}=${value}`).join("; ");
  };
  const send = async (path, body, instance = auth, extra = {}) => {
    const response = await instance.handler(
      new Request(`${issuer}${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          origin: authOrigin,
          accept: "application/json",
          cookie: cookies,
          ...(body ? { "content-type": "application/json" } : {}),
          ...extra,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
    collect(response);
    return response;
  };
  let response = await send("/sign-in/email", {
    email: process.env.BOB_AUTH_OWNER_EMAIL,
    password,
  });
  assert.equal(response.status, 200, "owner sign-in");
  const headers = new Headers({ cookie: cookies, origin: authOrigin });
  phase = "register public and resource clients";
  const provisioning = createOwnerAuth(authPool, false, undefined, true);
  const publicClient = await provisioning.api.adminCreateOAuthClient({
    headers,
    body: {
      client_name: "Fixture MCP",
      redirect_uris: [callback],
      application_type: "native",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      scope: OAUTH_SCOPES.join(" "),
      resources: [resource],
      require_pkce: true,
    },
  });
  phase = "register private resource verifier";
  const verifierClient = await provisioning.api.adminCreateOAuthClient({
    headers,
    body: {
      client_name: "Fixture resource verifier",
      redirect_uris: ["https://internal.bob.example/unused"],
      token_endpoint_auth_method: "client_secret_basic",
      grant_types: ["authorization_code"],
      scope: OAUTH_SCOPES.join(" "),
      resources: [resource],
    },
  });
  assert.equal(
    typeof publicClient.client_id,
    "string",
    "public client identity",
  );
  assert.equal(
    typeof verifierClient.client_secret,
    "string",
    "private verifier credential",
  );
  const oauth = {
    issuer,
    resource,
    clientId: verifierClient.client_id,
    clientSecret: verifierClient.client_secret,
  };
  const config = createTestConfig({
    databaseURL: fixtureURL.toString(),
    ownerId: owner,
    sharedContextEnabled: true,
    oauth,
  });
  const { app } = createBobCoreRuntime(config);
  let introspectionCalls = 0;
  const verifyToken = async (url, options) => {
    introspectionCalls++;
    return auth.handler(new Request(url, options));
  };
  const gateway = createOAuthGateway(
    app.fetch,
    createInterfaceCredentialGateway(app.fetch, config),
    config,
    {
      fetch: verifyToken,
    },
  );
  const tokenRequest = async (body) => {
    await retireExpiredOAuthSessions(authPool);
    return auth.handler(
      new Request(`${issuer}/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
      }),
    );
  };
  async function authorize(projectKey = "bobai", scopes = OAUTH_SCOPES) {
    const verifier = randomBytes(48).toString("base64url");
    const query = new URLSearchParams({
      client_id: publicClient.client_id,
      redirect_uri: callback,
      response_type: "code",
      scope: OAUTH_SCOPES.join(" "),
      resource,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      state: randomUUID(),
    });
    phase = "authorization redirect";
    const started = await send(`/oauth2/authorize?${query}`);
    assert.ok(
      [200, 302].includes(started.status),
      `owner consent redirect status ${started.status}`,
    );
    const redirectURL =
      started.headers.get("location") ?? (await started.json()).url;
    assert.equal(typeof redirectURL, "string", "owner consent redirect");
    const signedQuery = new URL(
      redirectURL,
      authOrigin,
    ).searchParams.toString();
    let invalidApprovals = 0;
    const tampered = new URLSearchParams(signedQuery);
    tampered.set("state", "tampered");
    const invalid = await send(
      "/oauth2/consent",
      {
        accept: true,
        scope: scopes.join(" "),
        oauth_query: tampered.toString(),
      },
      createOwnerAuth(authPool, false, async () => {
        invalidApprovals++;
        throw new Error("Unexpected approval");
      }),
    );
    assert.equal(invalid.status, 400, "tampered signed request denied");
    assert.equal(
      invalidApprovals,
      0,
      "invalid request cannot create a project grant",
    );
    const input = {
      userId,
      clientId: publicClient.client_id,
      projectKey,
      surface: "chatgpt",
      scopes,
      oauthQuery: signedQuery,
      operationId: randomUUID(),
    };
    phase = "atomic project consent receipt";
    const grants = await Promise.all(
      Array.from({ length: 6 }, () => approveProjectGrant(authPool, input)),
    );
    assert.equal(
      new Set(grants.map((grant) => grant.id)).size,
      1,
      "concurrent approval replay",
    );
    await assert.rejects(
      approveProjectGrant(authPool, {
        ...input,
        projectKey: projectKey === "bobai" ? "second" : "bobai",
      }),
      "conflicting approval operation",
    );
    const grant = grants[0];
    phase = "provider consent response";
    const consent = await send(
      "/oauth2/consent",
      { accept: true, scope: scopes.join(" "), oauth_query: signedQuery },
      createOwnerAuth(authPool, false, grant),
    );
    assert.equal(consent.status, 200, "approved consent accepted");
    const result = await consent.json();
    const code = new URL(result.url).searchParams.get("code");
    assert.equal(typeof code, "string", "authorization code issued");
    assert.equal(
      new URL(result.url).searchParams.get("iss"),
      issuer,
      "issuer callback binding",
    );
    return { grant, code, verifier, query: signedQuery };
  }
  phase = "PKCE and scoped token issuance";
  const first = await authorize();
  phase = "PKCE token response";
  const exchange = await tokenRequest({
    grant_type: "authorization_code",
    client_id: publicClient.client_id,
    code: first.code,
    code_verifier: first.verifier,
    redirect_uri: callback,
    resource,
  });
  assert.equal(exchange.status, 200, "token exchange");
  const tokens = await exchange.json();
  assert.equal(typeof tokens.access_token, "string", "opaque access token");
  assert.equal(typeof tokens.refresh_token, "string", "refresh token");
  const mcpRequest = (token, projectKey = "bobai") =>
    new Request(resource, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "bob_get_context",
          arguments: { projectKey, surface: "web" },
        },
      }),
    });
  phase = "Core context response";
  const context = await gateway(mcpRequest(tokens.access_token));
  assert.equal(context.status, 200, "Core accepts approved opaque token");
  const parseMcp = async (response) => {
    const body = await response.text();
    return JSON.parse(
      body.startsWith("event:")
        ? body
            .split("\n")
            .find((line) => line.startsWith("data:"))
            .slice(5)
        : body,
    );
  };
  const content = await parseMcp(context);
  assert.equal(content.result.isError, undefined, "context tool succeeds");
  assert.equal(
    content.result.structuredContent.project.projectKey,
    "bobai",
    "project remains bound",
  );
  phase = "Personal denial response";
  const personal = await parseMcp(
    await gateway(mcpRequest(tokens.access_token, "personal")),
  );
  assert.equal(
    personal.result.structuredContent.project.projectKey,
    "bobai",
    "Personal request remains bound to approved project",
  );
  phase = "expiry, scope, and resource enforcement";
  await pool.query(
    'UPDATE bob_auth_oauth_access_token SET scopes=$1::jsonb WHERE "referenceId"=$2',
    [JSON.stringify(["mcp:context:read"]), first.grant.id],
  );
  const underScoped = await gateway(mcpRequest(tokens.access_token));
  assert.equal(underScoped.status, 403, "missing scope denied");
  assert.match(
    underScoped.headers.get("www-authenticate"),
    /insufficient_scope/,
    "missing scope challenge",
  );
  await pool.query(
    `UPDATE bob_auth_oauth_access_token SET scopes=$1::jsonb,"expiresAt"=now()-interval '1 second' WHERE "referenceId"=$2`,
    [JSON.stringify(OAUTH_SCOPES), first.grant.id],
  );
  assert.equal(
    (await gateway(mcpRequest(tokens.access_token))).status,
    401,
    "expired access token denied",
  );
  await pool.query(
    `UPDATE bob_auth_oauth_access_token SET "expiresAt"=now()+interval '15 minutes',resources=$1::jsonb WHERE "referenceId"=$2`,
    [JSON.stringify(["https://other.bob.example/mcp/linked"]), first.grant.id],
  );
  assert.equal(
    (await gateway(mcpRequest(tokens.access_token))).status,
    401,
    "incorrect audience denied",
  );
  await pool.query(
    'UPDATE bob_auth_oauth_access_token SET resources=$1::jsonb WHERE "referenceId"=$2',
    [JSON.stringify([resource]), first.grant.id],
  );
  phase = "standard revocation and credential isolation";
  const revoked = await auth.handler(
    new Request(`${issuer}/oauth2/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: publicClient.client_id,
        token: tokens.access_token,
        token_type_hint: "access_token",
      }),
    }),
  );
  assert.equal(revoked.status, 200, "standard access-token revocation");
  assert.equal(
    (await gateway(mcpRequest(tokens.access_token))).status,
    401,
    "revoked token rejected immediately",
  );
  const refreshed = await tokenRequest({
    grant_type: "refresh_token",
    client_id: publicClient.client_id,
    refresh_token: tokens.refresh_token,
    resource,
  });
  assert.equal(refreshed.status, 200, "approved refresh");
  const refreshedTokens = await refreshed.json();
  await revokeProjectGrant(authPool, first.grant.id, userId);
  assert.equal(
    (await gateway(mcpRequest(refreshedTokens.access_token))).status,
    401,
    "revoked grant rejected immediately",
  );
  assert.notEqual(
    (
      await tokenRequest({
        grant_type: "refresh_token",
        client_id: publicClient.client_id,
        refresh_token: refreshedTokens.refresh_token,
        resource,
      })
    ).status,
    200,
    "revoked grant cannot refresh",
  );
  phase = "wrong PKCE and code replay";
  const wrong = await authorize("second");
  assert.notEqual(
    (
      await tokenRequest({
        grant_type: "authorization_code",
        client_id: publicClient.client_id,
        code: wrong.code,
        code_verifier: randomBytes(48).toString("base64url"),
        redirect_uri: callback,
        resource,
      })
    ).status,
    200,
    "wrong PKCE denied",
  );
  const replay = await authorize("second");
  const exchangeBody = {
    grant_type: "authorization_code",
    client_id: publicClient.client_id,
    code: replay.code,
    code_verifier: replay.verifier,
    redirect_uri: callback,
    resource,
  };
  const exchanges = await Promise.all(
    Array.from({ length: 4 }, () => tokenRequest(exchangeBody)),
  );
  assert.equal(
    exchanges.filter((result) => result.status === 200).length,
    1,
    "authorization code consumed once under concurrency",
  );
  phase = "refresh replay and scope escalation";
  async function freshTokens() {
    const authorization = await authorize("second");
    const exchanged = await tokenRequest({
      grant_type: "authorization_code",
      client_id: publicClient.client_id,
      code: authorization.code,
      code_verifier: authorization.verifier,
      redirect_uri: callback,
      resource,
    });
    assert.equal(exchanged.status, 200, "independent refresh grant issued");
    return exchanged.json();
  }
  const audienceTokens = await freshTokens();
  assert.notEqual(
    (
      await tokenRequest({
        grant_type: "refresh_token",
        client_id: publicClient.client_id,
        refresh_token: audienceTokens.refresh_token,
        resource: "https://other.bob.example/mcp/linked",
      })
    ).status,
    200,
    "refresh cannot change audience",
  );
  const scopeTokens = await freshTokens();
  assert.notEqual(
    (
      await tokenRequest({
        grant_type: "refresh_token",
        client_id: publicClient.client_id,
        refresh_token: scopeTokens.refresh_token,
        resource,
        scope: "credentials:manage",
      })
    ).status,
    200,
    "refresh cannot expand scopes",
  );
  const replayTokens = await freshTokens();
  phase = "refresh rotation and replay";
  const beforeRotated = Number(
    (
      await pool.query(
        "SELECT count(*) FROM bob_auth_oauth_refresh_token WHERE revoked IS NOT NULL",
      )
    ).rows[0].count,
  );
  const rotated = await tokenRequest({
    grant_type: "refresh_token",
    client_id: publicClient.client_id,
    refresh_token: replayTokens.refresh_token,
    resource,
  });
  assert.equal(rotated.status, 200, "refresh rotates");
  const rotatedTokens = await rotated.json();
  const afterRotated = Number(
    (
      await pool.query(
        "SELECT count(*) FROM bob_auth_oauth_refresh_token WHERE revoked IS NOT NULL",
      )
    ).rows[0].count,
  );
  assert.equal(
    afterRotated - beforeRotated,
    1,
    "old refresh marked revoked atomically",
  );
  assert.equal(
    typeof rotatedTokens.refresh_token,
    "string",
    "replacement refresh returned",
  );
  assert.ok(
    rotatedTokens.refresh_token !== replayTokens.refresh_token,
    "replacement refresh is distinct",
  );
  assert.notEqual(
    (
      await tokenRequest({
        grant_type: "refresh_token",
        client_id: publicClient.client_id,
        refresh_token: replayTokens.refresh_token,
        resource,
      })
    ).status,
    200,
    "old refresh cannot replay",
  );
  assert.equal(
    (await gateway(mcpRequest(rotatedTokens.access_token, "second"))).status,
    401,
    "refresh replay invalidates token family",
  );
  const offline = await freshTokens();
  phase = "offline connection after browser session expiry";
  await pool.query(
    `UPDATE bob_auth_session SET "expiresAt"=now()-interval '1 second'`,
  );
  assert.equal(
    (await gateway(mcpRequest(offline.access_token, "second"))).status,
    401,
    "expired browser session access denied",
  );
  const offlineRefresh = await tokenRequest({
    grant_type: "refresh_token",
    client_id: publicClient.client_id,
    refresh_token: offline.refresh_token,
    resource,
  });
  assert.equal(
    offlineRefresh.status,
    200,
    "offline consent survives browser session expiry",
  );
  const offlineTokens = await offlineRefresh.json();
  assert.equal(
    (await gateway(mcpRequest(offlineTokens.access_token, "second"))).status,
    200,
    "renewed offline connection remains usable",
  );
  assert.equal(
    (await gateway(mcpRequest(offline.access_token, "second"))).status,
    401,
    "session cleanup does not revive its old access token",
  );
  await assert.rejects(
    approveProjectGrant(authPool, {
      userId,
      clientId: publicClient.client_id,
      projectKey: "personal",
      surface: "chatgpt",
      scopes: OAUTH_SCOPES,
      oauthQuery: "synthetic",
      operationId: randomUUID(),
    }),
    "Personal grants unavailable to MCP",
  );
  phase = "shared pre-introspection capacity";
  const attemptBucket = createHash("sha256")
    .update(`${owner}\0oauth:introspection-attempts`)
    .digest("hex");
  const seconds = Number(
    (await pool.query("SELECT extract(second FROM now()) AS seconds")).rows[0]
      .seconds,
  );
  if (seconds > 50)
    await new Promise((resolve) => setTimeout(resolve, (61 - seconds) * 1000));
  await pool.query(
    `UPDATE bob_credential_rate_limits SET request_count=199,
    window_start=date_trunc('minute',now()) WHERE owner_id=$1 AND credential_hash=$2 AND operation_class='core'`,
    [owner, attemptBucket],
  );
  const otherGateway = createOAuthGateway(app.fetch, app.fetch, config, {
    fetch: verifyToken,
  });
  const attemptsBefore = introspectionCalls;
  const attempts = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      (i % 2 ? gateway : otherGateway)(
        new Request(resource, {
          method: "POST",
          headers: {
            authorization: `Bearer invalid-${randomUUID()}`,
            "x-forwarded-for": `192.0.2.${i}`,
          },
          body: "{}",
        }),
      ),
    ),
  );
  assert.equal(
    attempts.filter((response) => response.status === 429).length,
    5,
  );
  assert.equal(
    attempts.filter((response) => response.status === 401).length,
    1,
  );
  assert.equal(
    introspectionCalls - attemptsBefore,
    1,
    "two gateways share capacity before token verification",
  );
  assert(
    attempts
      .filter((response) => response.status === 429)
      .every((response) => Number(response.headers.get("retry-after")) > 0),
  );
  await pool.query(
    "DELETE FROM bob_credential_rate_limits WHERE owner_id=$1 AND credential_hash=$2",
    [owner, attemptBucket],
  );
  console.log(
    JSON.stringify({
      event: "oauth.acceptance.passed",
      pkce: true,
      concurrentCodeConsumption: true,
      concurrentGrantReplay: true,
      standardTokenRevocation: true,
      projectGrantRevocation: true,
      personalIsolation: true,
      opaqueToken: true,
      expiry: true,
      scopeChallenge: true,
      audience: true,
      signedConsent: true,
      refreshReplay: true,
      offlineSessionExpiry: true,
      sharedPreIntrospectionLimit: true,
      restrictedWebRole: true,
    }),
  );
  phase = "offline client provisioning";
  await checkOAuthProvisioning(pool, authURL.toString(), password);
  if (process.argv.includes("--browser")) {
    phase = "local browser consent and revocation";
    // Protocol fixture rate buckets must not interfere with an independent UI run.
    await pool.query("DELETE FROM bob_auth_rate_limit");
    await checkOAuthBrowser({
      gateway,
      databaseURL: authURL.toString(),
      deviceToken: config.deviceToken,
      clientId: publicClient.client_id,
      password,
      resource,
      origin: authOrigin,
    });
  }
} catch (error) {
  console.error(
    JSON.stringify({
      event: "oauth.acceptance.failed",
      phase,
      error: error.name,
      code: error.body?.error,
      diagnostic: error.body?.error_description,
      message:
        error instanceof assert.AssertionError
          ? error.message
          : "Fixture operation failed.",
    }),
  );
  process.exitCode = 1;
} finally {
  if (authPool) await authPool.end();
  if (pool) await pool.end();
  if (created)
    await admin.query(
      `DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`,
    );
  if (ownerRole)
    await admin.query(`DROP ROLE IF EXISTS ${quoteIdentifier(ownerRole)}`);
  await admin.end();
}
