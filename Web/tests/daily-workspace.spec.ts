import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
const fixtureRequire = createRequire(path.join(__dirname, "daily-workspace.spec.ts"));
const { build } = fixtureRequire("../../Core/node_modules/esbuild");
const root = path.resolve(__dirname, "..");
const uuid = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const binding = "A".repeat(43);
const stamp = "2026-11-01T15:00:00Z";
const make = (n: number, extra: Record<string, unknown> = {}) => ({ id: uuid(n), projectId: uuid(100), version: 1, title: `Task ${n}`,
  description: `Details for task ${n}`, status: "open", priority: "normal", source: "web", dueAt: null,
  createdAt: stamp, updatedAt: stamp, completedAt: null, editable: true, requiresApproval: false, ...extra });
let script = "", css = "";
test.setTimeout(30000);
test.beforeAll(async () => {
  const result = await build({ absWorkingDir: root, bundle: true, write: false, outfile: "/private/tmp/bob-ux-fixture.js", format: "iife", jsx: "automatic", platform: "browser",
    stdin: { resolveDir: root, sourcefile: "ux-fixture.tsx", loader: "tsx", contents: `import {createRoot} from 'react-dom/client'; import {TaskManager} from './components/task-manager'; import {DailyNavigation} from './components/daily-navigation'; import {taskListView,taskSelection} from './lib/daily-workspace'; import styles from './components/daily-workspace.module.css'; const p=new URLSearchParams(location.search); createRoot(document.getElementById('root')!).render(<div className="app-shell"><aside className="sidebar"><DailyNavigation project="bobai"/></aside><main className={"dashboard-main "+styles.workspaceMain}><section id="today" style={{height:200}}>Today</section><DailyNavigation project="bobai" mobile/><TaskManager project="bobai" projectName="Synthetic BobAI" csrfToken="synthetic-csrf" initialView={taskListView(p.get('taskView'))} initialTaskId={taskSelection(p.get('task'))}/></main></div>);` },
    plugins: [{ name: "fixture-navigation", setup(b: any) {
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
      b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, (args: any) => ({ loader: "js", contents: args.path === "navigation" ? "export const useRouter=()=>({refresh(){}});" : "import React from 'react'; export default function Link(p){return React.createElement('a',p);}", resolveDir: root }));
    } }],
  });
  script = result.outputFiles.find((f: any) => f.path.endsWith(".js")).text;
  css = await readFile(path.join(root, "app/globals.css"), "utf8") + result.outputFiles.find((f: any) => f.path.endsWith(".css")).text;
});
async function setup(page: Page, query = "", loseFirstSave = false, detailMode: "normal" | "retry" = "normal") {
  const rows = [make(1, { title: "Overdue important", priority: "critical", dueAt: "2026-11-01T14:00:00Z" }), make(2, { title: "Future work", dueAt: "2026-11-03T15:00:00Z" }),
    make(3, { title: "Finished work", status: "done" }), make(4, { title: "Decision review", requiresApproval: true, editable: false })];
  const extra = make(99, { title: "Older task beyond first page", version: 7, dueAt: "2026-11-04T14:15:12.345Z" });
  let detailReads = 0;
  const posts: any[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  let saved: any = null;
  await page.clock.install({ time: new Date(stamp) });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://bob-ux.test") return route.abort();
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>` });
    if (url.pathname.startsWith("/api/tasks")) {
      if (url.searchParams.get("project") !== "bobai") throw new Error("Unexpected project request");
      if (route.request().method() !== "GET") {
        const body = route.request().postDataJSON(); posts.push(body);
        if (route.request().headers()["x-bob-task-binding"] !== binding) throw new Error("Missing task binding");
        if (url.pathname === "/api/tasks") {
          saved ??= make(90, { title: body.title });
          if (loseFirstSave && posts.length === 1) return route.abort();
          if (!rows.some(r => r.id === saved.id)) rows.unshift(saved);
          return route.fulfill({ json: { task: saved, created: true, changed: true, idempotent: posts.length > 1 } });
        }
        const existing = [...rows, extra].find(t => t.id === url.pathname.split("/").at(-1))!;
        Object.assign(existing, { ...body, title: body.newTitle ?? existing.title, version: existing.version + 1 });
        return route.fulfill({ json: { task: existing, created: false, changed: true, idempotent: false } });
      }
      const id = url.pathname.split("/")[3];
      if (id) {
        detailReads += 1;
        if (detailMode === "retry" && detailReads === 1) return route.fulfill({ status: 503, json: { error: { message: "Temporarily unavailable. Retry opening this task." } } });
        const task = [...rows, extra].find(t => t.id === id);
        return task ? route.fulfill({ json: { task, taskBinding: binding, project: { id: uuid(100), projectKey: "bobai", name: "Synthetic BobAI" }, checkedAt: stamp } }) : route.fulfill({ status: 404, json: { error: { message: "This task is unavailable in this workspace." } } });
      }
      return route.fulfill({ json: { tasks: url.searchParams.has("cursor") ? [extra] : rows, nextCursor: url.searchParams.has("cursor") ? null : uuid(4), taskBinding: binding, checkedAt: stamp } });
    }
    return route.abort();
  });
  await page.goto(`https://bob-ux.test/?project=bobai${query}`);
  await expect(page.getByRole("button", { name: "Save task", exact: true })).toBeEnabled();
  return { posts, rows, extra, pageErrors };
}
test("filters loaded records honestly and keeps completed work out of Active", async ({ page }) => {
  await setup(page);
  await expect(page.getByRole("article", { name: "Task: Finished work", exact: true })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Task: Decision review", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.getByRole("article", { name: "Task: Finished work", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Active", exact: true }).click();
  await page.getByLabel("Search loaded tasks").fill("beyond first page");
  await expect(page.getByText("No matches in the loaded records. Load more or change the filters.")).toBeVisible();
  await page.getByRole("button", { name: "Load more tasks" }).click();
  await expect(page.getByRole("article", { name: "Task: Older task beyond first page", exact: true })).toBeVisible();
  await expect(page.getByText(/End of the returned list/)).toBeVisible();
  await page.getByLabel("Search loaded tasks").clear();
  await page.screenshot({ path: "/private/tmp/bobcore-daily-ux-desktop.png", fullPage: true });
});
test("opens a task beyond the first page directly without writing or losing its project", async ({ page }) => {
  const f = await setup(page, `&task=${uuid(99)}&taskView=overdue`);
  const selected = page.getByLabel("Selected task", { exact: true });
  await expect(selected.getByRole("heading", { name: "Older task beyond first page" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Overdue", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(f.posts).toHaveLength(0);
  await selected.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("What needs to happen?")).toBeFocused();
  await page.getByLabel("What needs to happen?").fill("Updated title");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText(/Saved in Bob Core · Updated title/)).toBeVisible();
  expect(f.pageErrors).toEqual([]);
  expect(f.posts[0].expectedVersion).toBe(7); expect(f.posts[0]).not.toHaveProperty("dueAt");
});
test("compact capture retains an identical uncertain request for safe retry", async ({ page }) => {
  const f = await setup(page, "", true);
  await expect(page.getByLabel("Details", { exact: true })).not.toBeVisible();
  await page.getByLabel("What needs to happen?").fill("A small next step");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry same request" })).toBeVisible();
  await page.getByRole("button", { name: "Retry same request" }).click();
  await expect(page.getByText(/Saved in Bob Core · A small next step/)).toBeVisible();
  expect(f.pageErrors).toEqual([]);
  expect(f.posts).toHaveLength(2); expect(f.posts[0]).toEqual(f.posts[1]);
  expect(f.rows.filter(r => r.title === "A small next step")).toHaveLength(1);
});
test("approval items remain non-editable and navigation follows the visible section", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "All records", exact: true }).click();
  const approval = page.getByRole("article", { name: "Task: Decision review", exact: true });
  await expect(approval.getByRole("link", { name: "Review in Approvals" })).toBeVisible();
  await expect(approval.getByRole("button", { name: "Complete", exact: true })).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "Control Center navigation", exact: true });
  await nav.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(nav.getByRole("link", { name: "Tasks", exact: true })).toHaveAttribute("aria-current", "location");
  await expect(nav.getByRole("link", { name: "Today", exact: true })).not.toHaveAttribute("aria-current", "location");
});
test("a missing task is an explicit error, not an empty success", async ({ page }) => {
  await setup(page, `&task=${uuid(777)}`);
  await expect(page.getByRole("alert")).toContainText("This task is unavailable in this workspace.");
});
test("a temporary selected-task read failure can be retried without writing", async ({ page }) => {
  const f = await setup(page, `&task=${uuid(99)}`, false, "retry");
  await expect(page.getByRole("alert")).toContainText("Temporarily unavailable");
  await page.getByRole("button", { name: "Retry opening task" }).click();
  await expect(page.getByLabel("Selected task", { exact: true }).getByRole("heading", { name: "Older task beyond first page" })).toBeVisible();
  expect(f.posts).toHaveLength(0);
});
test("a selected-task connection change clears records and prevents writes", async ({ page }) => {
  const f = await setup(page);
  await page.getByRole("button", { name: "Overdue important", exact: true }).click();
  await expect(page.getByLabel("Selected task", { exact: true })).toBeVisible();
  // A new response on a different connection must never unlock mutation controls.
  await page.route(`**/api/tasks/${uuid(99)}?project=bobai`, route => route.fulfill({json: {task: f.extra, taskBinding: "B".repeat(43)}}));
  await page.getByRole("button", { name: "Close selected task" }).click();
  await page.getByRole("button", { name: "Load more tasks" }).click();
  await page.getByRole("button", { name: "Older task beyond first page", exact: true }).click();
  await expect(page.getByText(/The Core connection changed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save task", exact: true })).toBeDisabled();
  await expect(page.getByRole("article")).toHaveCount(0);
  expect(f.posts).toHaveLength(0);
});
test("mobile capture and filters remain usable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await expect(page.getByRole("navigation", { name: "Mobile workspace navigation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Control Center navigation", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Due today", exact: true }).click();
  await expect(page.getByRole("article", { name: "Task: Overdue important", exact: true })).toBeVisible();
  await page.screenshot({ path: "/private/tmp/bobcore-daily-ux-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
