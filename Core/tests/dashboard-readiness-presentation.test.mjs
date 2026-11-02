import { createElement } from "../../Web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../Web/node_modules/react-dom/server.node.js";
import { describe, expect, it } from "vitest";
import { SystemReadiness } from "../../Web/components/system-readiness";
import { getDashboardHealth } from "../../Web/lib/dashboard-health";

const stamp = "2026-10-31T14:26:40.000Z";
const available = { status: "available", checkedAt: stamp };
const fixture = () => ({
  status: "degraded", service: "bob-core", version: "0.2.0", model: "synthetic-model", requestId: "synthetic-request",
  checks: { process: available, database: available, context: available,
    provider: { status: "not_checked", checkedAt: null },
    scheduler: { status: "not_configured", checkedAt: null, detail: "Scheduled delivery has not been enabled." },
    backup: { status: "not_configured", checkedAt: null } },
});
const render = status => renderToStaticMarkup(createElement(SystemReadiness, { status, health: getDashboardHealth(status) }));

describe("separate dashboard readiness presentation", () => {
  it("shows connected Core alongside unobserved inference and visible backup setup warnings", () => {
    const html = render(fixture());
    for (const text of ["Core connectivity", "Connected", "Inference status", "Not checked", "Operational readiness", "Attention needed",
      "Backup monitoring: not configured", "backup protection is unverified here", "Scheduled delivery has not been enabled.",
      "Configured model: synthetic-model", "only to the responding Core process", "Selected-project results appear below.",
      "restore drills or independent recovery-key custody", "2026-10-31", "(Toronto)"])
      expect(html).toContain(text);
    expect(html).not.toContain("Degraded");
  });

  it.each([
    ["stale", "Last verified backup snapshot: 2026-10-28T15:57:06.136Z."],
    ["unavailable", "No verified encrypted backup is recorded."],
    ["unavailable", "The latest job or retention cleanup failed."],
    ["unavailable", "Backup verification records could not be read."],
  ])("retains reported backup %s details even when other checks pass", (status, detail) => {
    const data = fixture();
    data.checks.provider = available; data.checks.scheduler = available;
    data.checks.backup = { status, detail, checkedAt: stamp };
    const html = render(data);
    expect(html).toContain(`Backup monitoring: ${status}`);
    expect(html).toContain(detail);
    expect(html).toContain("Attention needed");
    expect(html).toContain("Connected");
  });

  it("keeps backup uncertainty visible when Core returns no status or legacy status without checks", () => {
    for (const status of [null, { ...fixture(), checks: undefined, status: "ready" }]) {
      const html = render(status);
      expect(html).toContain("Backup monitoring: not reported");
      expect(html).toContain("Backup protection is unverified here.");
      expect(html).toContain("Check time not reported");
      expect(html).not.toContain(">Connected<");
    }
  });

  it("escapes diagnostic text and retains the recovery limitation even when reported checks pass", () => {
    const data = fixture(); data.checks.scheduler = available; data.checks.provider = available;
    data.checks.backup = { ...available, detail: "<script>unsafe()</script>" };
    const html = render(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Checks passing");
    expect(html).toContain("Release acceptance remains separate.");
  });
});
