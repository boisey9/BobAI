import { randomBytes, randomUUID, createHash } from "node:crypto";
import { test, expect } from "@playwright/test";

test("owner reviews a project connection, declines another, and revokes access", async ({
  page,
  context,
  playwright,
}) => {
  const origin = process.env.BOB_E2E_OAUTH_ORIGIN;
  test.skip(!origin, "Requires the isolated PostgreSQL OAuth browser fixture.");
  if (!/^http:\/\/localhost:\d+$/.test(origin!))
    throw new Error("OAuth fixture requires localhost.");
  const resource = process.env.BOB_E2E_OAUTH_RESOURCE!;
  const clientId = process.env.BOB_E2E_OAUTH_CLIENT_ID!;
  const callback = "http://127.0.0.1:3997/callback";
  const scopes = "offline_access mcp:context:read mcp:sync mcp:task:write";
  // A real MCP client's token exchange carries no owner-browser cookies.
  const client = await playwright.request.newContext();
  const protectedResponse = await client.get(
    new URL(
      "/.well-known/oauth-protected-resource/mcp/linked",
      resource,
    ).toString(),
  );
  expect(protectedResponse.status()).toBe(200);
  const protectedMetadata = await protectedResponse.json();
  expect(protectedMetadata.resource).toBe(resource);
  expect(protectedMetadata.authorization_servers).toEqual([
    `${origin}/api/auth`,
  ]);
  const discovery = await client.get(
    `${origin}/.well-known/oauth-authorization-server/api/auth`,
  );
  expect(discovery.status()).toBe(200);
  const provider = await discovery.json();
  expect(provider.issuer).toBe(`${origin}/api/auth`);
  expect(provider.code_challenge_methods_supported).toContain("S256");
  expect(provider.registration_endpoint).toBeUndefined();
  expect(provider.token_endpoint).toBe(`${origin}/api/auth/oauth2/token`);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  await page.route(`${callback}**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Client callback received</h1>",
    }),
  );
  const begin = async () => {
    const verifier = randomBytes(48).toString("base64url");
    const state = randomUUID();
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callback,
      response_type: "code",
      scope: scopes,
      resource,
      state,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    });
    await page.goto(`${provider.authorization_endpoint}?${query}`);
    return { verifier, state };
  };
  const first = await begin();
  await expect(
    page.getByRole("button", { name: "Continue setup or recovery" }),
  ).toBeVisible();
  await page
    .getByLabel("Setup or recovery password")
    .fill(process.env.BOB_E2E_OAUTH_PASSWORD!);
  await page
    .getByRole("button", { name: "Continue setup or recovery" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Connect a project to Fixture MCP" }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(
    page.locator("#connection-project option[value=personal]"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Approve project connection" }),
  ).toBeDisabled();
  await page.screenshot({
    path: `${process.env.BOB_E2E_OUTPUT_DIR}/project-consent.png`,
    fullPage: true,
  });
  const deniedCsrf = await context.request.post(
    `${origin}/api/connections/consent`,
    { data: { accept: true } },
  );
  expect(deniedCsrf.status()).toBe(403);
  const genericConsent = await context.request.post(
    `${origin}/api/auth/oauth2/consent`,
    { data: { accept: true } },
  );
  expect(genericConsent.status()).toBe(404);
  await page.getByLabel("Project", { exact: true }).selectOption("bobai");
  await page.getByLabel("Where you will use Bob").selectOption("chatgpt");
  await page
    .getByRole("button", { name: "Approve project connection" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Client callback received" }),
  ).toBeVisible();
  const received = new URL(page.url());
  expect(received.searchParams.get("state") === first.state).toBe(true);
  const code = received.searchParams.get("code");
  expect(typeof code === "string" && code.length > 0).toBe(true);
  const exchange = await client.post(`${origin}/api/auth/oauth2/token`, {
    form: {
      grant_type: "authorization_code",
      client_id: clientId,
      code: code!,
      code_verifier: first.verifier,
      redirect_uri: callback,
      resource,
    },
  });
  expect(exchange.status()).toBe(200);
  let tokens = await exchange.json();
  const read = () =>
    client.post(resource, {
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "bob_get_context", arguments: { projectKey: "bobai" } },
      },
    });
  expect((await read()).status()).toBe(200);
  const second = await begin();
  await expect(
    page.getByRole("heading", { name: "Connect a project to Fixture MCP" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Client callback received" }),
  ).toBeVisible();
  const declined = new URL(page.url());
  expect(declined.searchParams.get("error")).toBe("access_denied");
  expect(declined.searchParams.get("state") === second.state).toBe(true);
  await page.goto(`${origin}/account`);
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByRole("status")).toContainText("Passkey saved", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in with a passkey" }),
  ).toBeVisible();
  await begin();
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect a project to Fixture MCP" }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Client callback received" }),
  ).toBeVisible();
  await page.goto(`${origin}/account`);
  const renewed = await client.post(`${origin}/api/auth/oauth2/token`, {
    form: {
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: tokens.refresh_token,
      resource,
    },
  });
  expect(renewed.status()).toBe(200);
  tokens = await renewed.json();
  expect((await read()).status()).toBe(200);
  const grant = page.locator("article").filter({
    has: page.getByRole("heading", { name: "bobai · chatgpt", exact: true }),
  });
  await grant.getByRole("button", { name: "Revoke connection" }).click();
  await expect(
    page.getByText("Connection revoked.", { exact: true }),
  ).toBeVisible();
  expect((await read()).status()).toBe(401);
  await page.reload();
  await expect(grant).toHaveCount(0);
  expect(errors).toEqual([]);
  await client.dispose();
});
