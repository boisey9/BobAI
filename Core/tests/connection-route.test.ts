import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { mountBobControlCenter } from "../src/control-center/mount.js";
import { createInterfaceCredentialGateway, type InterfaceCredential } from "../src/security/interface-credential.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const { tag, query } = vi.hoisted(() => ({ tag: vi.fn(), query: vi.fn() }));
vi.mock("@neondatabase/serverless", async importOriginal => ({
  ...await importOriginal<typeof import("@neondatabase/serverless")>(),
  neon: () => Object.assign(tag, { query }),
}));
const projectId = "11111111-1111-4111-8111-111111111111";
const token = "bobif_web_synthetic_abcdefghijklmnopqrstuvwxyz0123456789";
const owner: InterfaceCredential = {
  id: "synthetic-owner", surface: "web", projectKey: null,
  scopes: ["control-center:read", "control-center:owner"],
};

beforeEach(() => {
  tag.mockReset(); query.mockReset();
  tag.mockImplementation(async (strings: TemplateStringsArray) => strings.join("").includes("FROM public.bob_projects") ? [{
    id: projectId, project_key: "bobai", name: "BobAI", description: null,
    repository: "boisey9/BobAI", status: "active", metadata: {}, updated_at: "2026-11-11T00:00:00Z",
  }] : []);
  query.mockResolvedValue([{
    id: "22222222-2222-4222-8222-222222222222", surface: "chatgpt", scopes: ["mcp:context:read"],
    created_at: "2026-11-11T00:00:00Z", revoked_at: null,
    client_secret: "PRIVATE-FIXTURE-MUST-NOT-LEAK",
  }]);
});

function fixture(credential: InterfaceCredential | null = owner) {
  const config = createTestConfig({ databaseURL: "postgresql://synthetic:unused@example.invalid/test" });
  const generate = vi.fn(async () => { throw new Error("No inference permitted"); });
  const app = createApp({ config, aiProvider: { generate } });
  mountBobControlCenter(app, config);
  const gateway = createInterfaceCredentialGateway(app.fetch.bind(app), config, async () => credential);
  const read = (project = "bobai", bearer = token) => gateway(new Request(`https://core.test/v1/control-center?project=${project}`, {
    headers: { authorization: `Bearer ${bearer}`, "x-bob-core-interface-id": "forged-owner",
      "x-bob-core-interface-surface": "web", "x-bob-core-interface-scopes": "control-center:owner,control-center:read" },
  }));
  return { read, generate };
}

describe("owner connection projection through the authenticated Core route", () => {
  it.each(["owner-web", "primary"])("binds %s reads to the selected project and omits secrets", async boundary => {
    const f = fixture();
    const response = await f.read("bobai", boundary === "primary" ? TEST_DEVICE_TOKEN : token);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.oauthConnections).toMatchObject({ status: "available", grants: [{ surface: "chatgpt" }] });
    expect(query.mock.calls[0]?.[1]).toEqual(["rick", projectId]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE-FIXTURE");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(f.generate).not.toHaveBeenCalled();
  });
  it.each<InterfaceCredential>([
    { ...owner, projectKey: "bobai" },
    { ...owner, scopes: ["control-center:read"] },
    { ...owner, surface: "codex", projectKey: "bobai" },
  ])("never queries grants for a non-owner boundary despite forged headers: %j", async credential => {
    const response = await fixture(credential).read();
    expect(response.status).toBe(200);
    expect((await response.json()).oauthConnections).toMatchObject({ status: "unavailable", grants: [] });
    expect(query).not.toHaveBeenCalled();
  });
  it("denies wrong-project, missing-scope and revoked access before database reads", async () => {
    const cases: Array<[InterfaceCredential | null, string, number]> = [
      [{ ...owner, projectKey: "bobai" }, "another-project", 403],
      [{ ...owner, scopes: ["context:read"] }, "bobai", 403],
      [null, "bobai", 401],
    ];
    for (const [credential, project, status] of cases) {
      expect((await fixture(credential).read(project)).status).toBe(status);
    }
    expect(tag).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
  });
  it("does not query grants for a missing project", async () => {
    expect((await fixture().read("missing-project")).status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });
  it("keeps administration available when optional grant permission is denied", async () => {
    query.mockRejectedValue(new Error("private database diagnostic"));
    const response = await fixture().read();
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.selectedProject.projectKey).toBe("bobai");
    expect(result.oauthConnections).toMatchObject({ status: "unavailable", grants: [] });
    expect(JSON.stringify(result)).not.toContain("private database diagnostic");
  });
});
