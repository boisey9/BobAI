import { test, expect } from "@playwright/test";
import path from "node:path";
const base = "http://127.0.0.1:3419/prototype/project-workflow";
const screen = (name: string) => path.resolve("../review/screens", name + ".png");
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3419") throw new Error("prototype_attempted_external_request");
    return route.continue();
  });
  await page.goto(base);
  await expect(page.getByRole("heading", { name: "Bob Core", exact: true })).toBeVisible();
});
test("desktop coherent journey and demo approval", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await expect(page.getByRole("button", { name: "Approve demo candidate" })).toBeEnabled();
  await page.screenshot({ path: screen("desktop-ready"), fullPage: true });
  await page.getByRole("button", { name: "Approve demo candidate" }).click();
  await expect(page.getByRole("heading", { name: "Accepted in this demo" })).toBeVisible();
  await expect(page.getByText("No live approval or release occurred.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve demo candidate" })).toBeDisabled();
});
test("mobile journey remains usable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Work", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: screen("mobile-ready"), fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: screen("mobile-320-ready"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve demo candidate" })).toBeVisible();
  await page.screenshot({ path: screen("mobile-owner-review"), fullPage: true });
});
test("changed specification invalidates approval and changes-requested cannot accept", async ({ page }) => {
  await page.getByLabel("Specification · acceptance criteria").fill("Changed acceptance criteria");
  await expect(page.getByRole("button", { name: "Approve demo candidate" })).toBeDisabled();
  await expect(page.getByText("This candidate has changed.")).toBeVisible();
  await page.screenshot({ path: screen("desktop-candidate-changed"), fullPage: true });
  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(page.getByRole("heading", { name: "Changes requested" })).toBeVisible();
});
test("capture stays scoped to the selected synthetic project", async ({ page }) => {
  await page.getByLabel("Capture a next step for Bob Core").fill("Review the first work packet");
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(page.getByText("Review the first work packet", { exact: true })).toBeVisible();
  await page.getByLabel("Active project").selectOption("sample");
  await expect(page.getByText("Review the first work packet", { exact: true })).toHaveCount(0);
  await page.getByLabel("Active project").selectOption("bobcore");
  await expect(page.getByText("Review the first work packet", { exact: true })).toBeVisible();
});
test("loading, empty and source failure expose honest states and recovery", async ({ page }) => {
  await page.getByText("Prototype review controls", { exact: true }).click();
  for (const [value, heading] of [["loading", "Retrieving project context…"], ["empty", "This project has no work packet yet."], ["error", "Your project could not be refreshed."]]) {
    await page.getByLabel("Inspect a state").selectOption(value);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve demo candidate" })).toHaveCount(0);
    await page.screenshot({ path: screen("desktop-" + value), fullPage: true });
  }
  await page.getByRole("button", { name: "Retry project refresh" }).click();
  await expect(page.getByRole("button", { name: "Approve demo candidate" })).toBeEnabled();
  await page.getByLabel("Inspect a state").selectOption("empty");
  await page.getByRole("button", { name: "Capture the first next step" }).click();
  await expect(page.getByLabel("Capture a next step for Bob Core")).toBeFocused();
});
test("offline capture is visibly pending, then one same-request recovery", async ({ page }) => {
  await page.getByText("Prototype review controls", { exact: true }).click();
  await page.getByLabel("Inspect a state").selectOption("recovery");
  await page.getByLabel("Capture a next step for Bob Core").fill("Recover one pending capture");
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(page.getByText("Pending · not confirmed. Retry the same request.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve demo candidate" })).toBeDisabled();
  await page.screenshot({ path: screen("desktop-offline-pending"), fullPage: true });
  await page.getByRole("button", { name: "Retry same request" }).click();
  await expect(page.getByText("Recover one pending capture", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Demo recovery complete. The same request was confirmed once.")).toBeVisible();
});
