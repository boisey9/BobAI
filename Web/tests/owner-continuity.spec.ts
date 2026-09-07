import { test, expect } from "@playwright/test";

test("owner passkey, revocation, approvals and workspace isolation", async ({
  page,
  context,
  browser,
}) => {
  const origin = process.env.BOB_E2E_BASE_URL;
  test.skip(
    !origin,
    "Requires the documented isolated Core/Web/PostgreSQL acceptance fixture.",
  );
  if (!/^http:\/\/localhost:\d+$/.test(origin!))
    throw new Error("This synthetic fixture may only run on localhost.");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
  await page.goto(`${origin}/login`);
  await page
    .getByLabel("Setup or recovery password")
    .fill("isolated-acceptance-password-only-000000000");
  await page
    .getByRole("button", { name: "Continue setup or recovery" })
    .click();
  await expect(page).toHaveURL(`${origin}/account`);
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByRole("status")).toContainText("Passkey saved", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/login`);
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(`${origin}/`, { timeout: 30_000 });

  const unauthorizedMutation = await context.request.post(
    `${origin}/api/chat`,
    {
      data: {
        projectKey: "bobai",
        messages: [{ role: "user", content: "Denied without CSRF" }],
      },
    },
  );
  expect(unauthorizedMutation.status()).toBe(403);
  await page.goto(`${origin}/chat?project=bobai`);
  await page.getByRole("textbox").fill("Resume project work");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Workspace: BobAI. Memory: Project fixture only.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Personal", exact: true }).click();
  await expect(
    page.getByText("Workspace: BobAI. Memory: Project fixture only.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("textbox").fill("Plan my day");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Workspace: Personal. Memory: Personal fixture only.", {
      exact: true,
    }),
  ).toBeVisible();

  // A second browser receives a distinct durable session; revocation must affect it.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto(`${origin}/login`);
  await other
    .getByLabel("Setup or recovery password")
    .fill("isolated-acceptance-password-only-000000000");
  await other
    .getByRole("button", { name: "Continue setup or recovery" })
    .click();
  await expect(other).toHaveURL(`${origin}/account`);
  await page.goto(`${origin}/account`);
  await page.getByRole("button", { name: "Revoke other sessions" }).click();
  await expect(page.getByRole("status")).toHaveText("Other sessions revoked.");
  await other.reload();
  await expect(other).toHaveURL(`${origin}/login`);
  await otherContext.close();
  await page.goto(`${origin}/?project=bobai`);
  const approve = page.getByRole("button", {
    name: "Approve decision",
    exact: true,
  });
  await expect(approve.first()).toBeVisible();
  await approve.first().click();
  await expect(
    page.getByText("Acceptance fixture was approved.", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/login`);
});
