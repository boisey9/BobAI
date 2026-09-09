import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";

// Credentials remain in local child-process memory. Traces are disabled.
export async function checkOAuthBrowser({
  gateway,
  databaseURL,
  deviceToken,
  clientId,
  password,
  resource,
  origin,
}) {
  const web = fileURLToPath(new URL("../../../Web/", import.meta.url));
  const output = await mkdtemp(join(tmpdir(), "bob-oauth-browser-"));
  const env = {
    ...process.env,
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    BOB_AUTH_ENABLED: "true",
    BOB_AUTH_DATABASE_URL: databaseURL,
    BOB_CORE_BASE_URL: new URL(resource).origin,
    BOB_CORE_DEVICE_TOKEN: deviceToken,
    BOB_E2E_OAUTH_ORIGIN: origin,
    BOB_E2E_OAUTH_RESOURCE: resource,
    BOB_E2E_OAUTH_CLIENT_ID: clientId,
    BOB_E2E_OAUTH_PASSWORD: password,
    BOB_E2E_OUTPUT_DIR: output,
    BOB_E2E_CHROME_PATH:
      process.env.BOB_E2E_CHROME_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  };
  const core = serve({
    fetch: gateway,
    hostname: "localhost",
    port: Number(new URL(resource).port),
  });
  const next = spawn(
    process.execPath,
    [
      join(web, "node_modules/next/dist/bin/next"),
      "dev",
      "--hostname",
      "localhost",
      "--port",
      new URL(origin).port,
    ],
    { cwd: web, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  const nextOutput = [];
  next.stdout.on("data", (chunk) => nextOutput.push(chunk));
  next.stderr.on("data", (chunk) => nextOutput.push(chunk));
  let finished;
  const nextClosed = new Promise((resolve) => next.once("close", resolve));
  try {
    const deadline = Date.now() + 90_000;
    let ready = false;
    while (!ready && Date.now() < deadline && next.exitCode === null) {
      try {
        ready = (
          await fetch(`${origin}/api/health`, {
            signal: AbortSignal.timeout(4_000),
          })
        ).ok;
      } catch {}
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(ready, "local Web fixture started");
    const browser = spawn(
      process.execPath,
      [
        join(web, "node_modules/@playwright/test/cli.js"),
        "test",
        "project-linking.spec.ts",
      ],
      { cwd: web, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    const browserOutput = [];
    browser.stdout.on("data", (chunk) => browserOutput.push(chunk));
    browser.stderr.on("data", (chunk) => browserOutput.push(chunk));
    const timeout = setTimeout(() => browser.kill("SIGTERM"), 180_000);
    try {
      finished = await new Promise((resolve, reject) => {
        browser.once("error", reject);
        browser.once("close", resolve);
      });
    } finally {
      clearTimeout(timeout);
    }
    await writeFile(join(output, "browser.log"), Buffer.concat(browserOutput), {
      mode: 0o600,
    });
    assert.equal(
      finished,
      0,
      `OAuth browser acceptance failed. Private local evidence: ${output}`,
    );
    console.log(
      JSON.stringify({
        event: "oauth.browser.passed",
        passwordContinuation: true,
        passkeyContinuation: true,
        consent: true,
        decline: true,
        csrf: true,
        revocation: true,
      }),
    );
  } finally {
    next.kill("SIGTERM");
    await Promise.race([
      nextClosed,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    core.closeAllConnections();
    await new Promise((resolve) => core.close(resolve));
    await writeFile(join(output, "web.log"), Buffer.concat(nextOutput), {
      mode: 0o600,
    });
  }
}
