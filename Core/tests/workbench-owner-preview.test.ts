import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ownerWorkbenchEnabled } from "../../Web/lib/workbench/owner-preview.js";

describe("owner Workbench preview opt-in", () => {
  beforeEach(() => {
    vi.stubEnv("BOB_OWNER_WORKBENCH_PREVIEW", "true");
    vi.stubEnv("BOB_AUTH_ENABLED", "true");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("allows an opted-in Production deployment using the owner authentication stack", () => {
    expect(ownerWorkbenchEnabled()).toBe(true);
  });

  it.each([
    ["BOB_OWNER_WORKBENCH_PREVIEW", undefined],
    ["BOB_OWNER_WORKBENCH_PREVIEW", "false"],
    ["BOB_AUTH_ENABLED", undefined],
    ["BOB_AUTH_ENABLED", "false"],
    ["VERCEL_ENV", "preview"],
    ["VERCEL_ENV", "development"],
    ["VERCEL_ENV", undefined],
  ])("fails closed with %s set to %s", (key, value) => {
    vi.stubEnv(key, value);
    expect(ownerWorkbenchEnabled()).toBe(false);
  });

  it("permits an opted-in local owner authentication fixture", () => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);
    expect(ownerWorkbenchEnabled()).toBe(true);
  });
});
