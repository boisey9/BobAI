import { afterEach, describe, expect, it, vi } from "vitest";
import { getDashboardHealth } from "../../Web/lib/dashboard-health.js";
import type { CoreStatus } from "../../Web/lib/types.js";

type Check = NonNullable<CoreStatus["checks"]>[string];
const checkedAt = "2026-10-31T12:00:00.000Z";
const check = (status: string, timestamp: string | null = checkedAt): Check => ({ status, checkedAt: timestamp });

function status(overrides: Record<string, Check> = {}, aggregate = "degraded"): CoreStatus {
  return {
    status: aggregate, service: "bob-core", version: "0.2.0", model: "synthetic-model", requestId: "synthetic-request",
    checks: {
      process: check("available"), database: check("available"), context: check("available"),
      provider: check("not_checked", null), backup: check("not_configured", null), scheduler: check("not_configured", null),
      ...overrides,
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("dashboard health presentation", () => {
  it("separates a connected Core from unobserved inference and unconfigured operations", () => {
    const health = getDashboardHealth(status());
    expect(health.connectivity).toMatchObject({ value: "Connected", state: "healthy" });
    expect(health.inference).toMatchObject({ value: "Not checked", state: "neutral" });
    expect(health.operations).toMatchObject({ value: "Attention needed", state: "warning" });
    expect(health.operations.detail).toContain("Backup: not configured");
    expect(health.operations.detail).toContain("Scheduler: not configured");
  });

  it("does not turn missing status or legacy aggregate-only success into verified checks", () => {
    expect(getDashboardHealth(null).connectivity).toMatchObject({ value: "Unavailable", state: "offline" });
    expect(getDashboardHealth(null).inference.value).toBe("Unverified");
    expect(getDashboardHealth(null).operations.value).toBe("Unverified");
    const legacy = status({}, "ready");
    delete legacy.checks;
    for (const summary of Object.values(getDashboardHealth(legacy))) {
      expect(summary).toMatchObject({ value: "Unverified", state: "neutral" });
    }
  });

  it.each(["process", "database", "context"])("does not let aggregate readiness hide a failed %s check", dependency => {
    expect(getDashboardHealth(status({ [dependency]: check("unavailable") }, "ready")).connectivity)
      .toMatchObject({ value: "Attention needed", state: "warning" });
  });

  it.each(["unavailable", "stale", "not_configured"])("retains known connectivity trouble (%s) when another check is missing", reported => {
    const input = status({ database: check(reported) });
    delete input.checks?.context;
    expect(getDashboardHealth(input).connectivity).toMatchObject({ value: "Attention needed", state: "warning" });
  });

  it.each(["not_checked", "future_status"])("keeps an unverified essential check (%s) distinct from failure", reported => {
    expect(getDashboardHealth(status({ context: check(reported) })).connectivity)
      .toMatchObject({ value: "Unverified", state: "neutral" });
  });

  it.each(["process", "database", "context"])("requires the %s check before claiming connectivity", dependency => {
    const input = status();
    delete input.checks?.[dependency];
    expect(getDashboardHealth(input).connectivity.value).toBe("Unverified");
  });

  it.each([
    ["not_checked", "Not checked", "neutral"],
    ["unavailable", "Last attempt failed", "warning"],
    ["stale", "Stale observation", "warning"],
    ["not_configured", "Not configured", "warning"],
    ["future_status", "Unverified", "neutral"],
  ])("presents provider %s without changing connectivity", (reported, value, state) => {
    const health = getDashboardHealth(status({ provider: check(reported!) }));
    expect(health.inference).toMatchObject({ value, state });
    expect(health.connectivity.value).toBe("Connected");
  });

  it("requires a timestamp for success and describes its process scope", () => {
    const health = getDashboardHealth(status({ provider: check("available") }));
    expect(health.inference).toMatchObject({ value: "Observed success", state: "healthy" });
    expect(health.inference.detail).toContain("this Core process");
    expect(health.operations.value).toBe("Attention needed");
  });

  it.each([null, "", "not-a-time", "0", "2026-10-31", "2026-13-31T12:00:00Z", "2026-02-31T12:00:00Z"])("rejects a success observation with invalid timestamp %s", timestamp => {
    expect(getDashboardHealth(status({ provider: check("available", timestamp) })).inference)
      .toMatchObject({ value: "Unverified", state: "neutral" });
  });

  it("does not infer provider success from configured provider/model or passing operations", () => {
    const input = status({ backup: check("available"), scheduler: check("available") }, "ready");
    input.provider = "openai";
    delete input.checks?.provider;
    const health = getDashboardHealth(input);
    expect(health.inference.value).toBe("Unverified");
    expect(health.operations).toMatchObject({ value: "Checks passing", state: "healthy" });
    expect(health.operations.detail).toContain("do not establish full recovery readiness");
  });

  it.each(["unavailable", "stale", "not_configured"])("preserves backup attention (%s) even when scheduler passes", reported => {
    const health = getDashboardHealth(status({ backup: check(reported), scheduler: check("available") }, "ready"));
    expect(health.operations).toMatchObject({ value: "Attention needed", state: "warning" });
    expect(health.operations.detail).toContain(`Backup: ${reported.replaceAll("_", " ")}`);
    expect(health.connectivity.value).toBe("Connected");
  });

  it("does not hide a failed backup behind missing scheduler evidence", () => {
    const input = status({ backup: check("unavailable") });
    delete input.checks?.scheduler;
    expect(getDashboardHealth(input).operations.value).toBe("Attention needed");
  });

  it.each(["backup", "scheduler"])("requires %s evidence before reporting operations passing", dependency => {
    const input = status({ backup: check("available"), scheduler: check("available") });
    delete input.checks?.[dependency];
    expect(getDashboardHealth(input).operations).toMatchObject({ value: "Unverified", state: "neutral" });
  });

  it.each(["not_checked", "future_status"])("does not treat unverified operational evidence (%s) as passing", reported => {
    expect(getDashboardHealth(status({ backup: check(reported), scheduler: check("available") })).operations)
      .toMatchObject({ value: "Unverified", state: "neutral" });
  });

  it("only presents the supplied snapshot without network access or mutation", () => {
    const fetch = vi.fn(() => { throw new Error("Network access forbidden"); });
    vi.stubGlobal("fetch", fetch);
    const input = status();
    for (const item of Object.values(input.checks!)) Object.freeze(item);
    Object.freeze(input.checks);
    Object.freeze(input);
    expect(() => getDashboardHealth(input)).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
