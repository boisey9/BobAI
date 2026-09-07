import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  outputDir:
    process.env.BOB_E2E_OUTPUT_DIR ?? "/private/tmp/bob-web-browser-results",
  use: {
    browserName: "chromium",
    launchOptions: process.env.BOB_E2E_CHROME_PATH
      ? { executablePath: process.env.BOB_E2E_CHROME_PATH }
      : {},
    trace: "off", // Auth cookies and recovery passwords must not enter trace artifacts.
  },
});
