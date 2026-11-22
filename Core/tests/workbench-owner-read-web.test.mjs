import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readWorkbenchCore } from "../../Web/lib/bob-core.js";
import { ownerWorkbenchEnabled, ownerWorkbenchReadsEnabled } from "../../Web/lib/workbench/owner-preview.js";
import { parseOwnerWorkbenchProjects } from "../../Web/lib/workbench/owner-projects.js";
import { createWorkbenchReader } from "../../Web/lib/workbench/read-adapters.js";

vi.mock("../../Web/lib/session", () => ({}));

const grant = {
  projectKey: "fixture-project",
  id: "a1000000-0000-4000-8000-000000000001",
  repository: "fictional/workbench",
};
const checkedAt = "2026-11-21T10:00:00.000Z";
const selectedProject = { ...grant, name: "Fixture project", status: "active", updatedAt: checkedAt };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("owner Workbench read policy", () => {
  beforeEach(() => {
    vi.stubEnv("BOB_AUTH_ENABLED", "true");
    vi.stubEnv("BOB_OWNER_WORKBENCH_PREVIEW", "true");
    vi.stubEnv("BOB_OWNER_WORKBENCH_READS_ENABLED", undefined);
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
  });

  it("keeps real reads off while the existing preview is enabled", () => {
    expect(ownerWorkbenchEnabled()).toBe(true);
    expect(ownerWorkbenchReadsEnabled()).toBe(false);
  });

  it("enables real reads independently and requires the owner auth stack", () => {
    vi.stubEnv("BOB_OWNER_WORKBENCH_PREVIEW", undefined);
    vi.stubEnv("BOB_OWNER_WORKBENCH_READS_ENABLED", "true");
    expect(ownerWorkbenchReadsEnabled()).toBe(true);
    expect(ownerWorkbenchEnabled()).toBe(false);
    vi.stubEnv("BOB_AUTH_ENABLED", "false");
    expect(ownerWorkbenchReadsEnabled()).toBe(false);
  });

  it("denies a Vercel Preview opt-in and supports isolated local testing", () => {
    vi.stubEnv("BOB_OWNER_WORKBENCH_READS_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(ownerWorkbenchReadsEnabled()).toBe(false);
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);
    expect(ownerWorkbenchReadsEnabled()).toBe(true);
  });
});

describe("owner-verified project registrations", () => {
  it("accepts multiple independently pinned UUIDs, including a project without a repository", () => {
    const other = {
      projectKey: "another-fixture", id: "a2000000-0000-4000-8000-000000000001", repository: null,
    };
    expect(parseOwnerWorkbenchProjects(JSON.stringify([
      { ...grant, id: grant.id.toUpperCase() }, other,
    ]))).toEqual([grant, other]);
  });

  it.each([
    undefined, "{", "[]", JSON.stringify([null]), JSON.stringify([{}]),
    JSON.stringify([{ ...grant, id: "unverified" }]),
    JSON.stringify([{ ...grant, repository: " " }]),
    JSON.stringify([{ ...grant, projectKey: "Fixture" }]),
    JSON.stringify([{ ...grant, unexpected: true }]),
    JSON.stringify([grant, { ...grant, projectKey: "another", id: grant.id.toUpperCase() }]),
    JSON.stringify([grant, { ...grant, id: "a3000000-0000-4000-8000-000000000001" }]),
  ])("fails closed on invalid or ambiguous registration %s", (input) => {
    expect(parseOwnerWorkbenchProjects(input)).toBeNull();
  });
});

describe("Workbench server transport", () => {
  beforeEach(() => {
    vi.stubEnv("BOB_CORE_BASE_URL", "https://workbench-core.example");
    vi.stubEnv("BOB_CORE_DEVICE_TOKEN", "fictional-owner-credential");
  });

  it("uses only GET, skips the audited context endpoint, and never falls back on failure", async () => {
    const fetch = vi.fn(async (address) => {
      const url = new URL(address);
      if (url.pathname === "/v1/control-center") {
        return Response.json({ selectedProject, projects: [selectedProject], generatedAt: checkedAt });
      }
      if (url.pathname === "/v1/tasks") {
        return Response.json({ authority: "bob-core", project: grant, tasks: [], nextCursor: null, checkedAt });
      }
      return new Response(null, { status: 503 });
    });
    vi.stubGlobal("fetch", fetch);
    const result = await createWorkbenchReader({ get: readWorkbenchCore }, [grant], "owner").read(grant.projectKey);
    expect(result).toMatchObject({ status: "ready", tasks: { status: "available" }, context: { status: "unavailable" } });
    expect(fetch.mock.calls.map(([address]) => address)).toEqual([
      "https://workbench-core.example/v1/control-center?project=fixture-project&view=workbench",
      "https://workbench-core.example/v1/tasks?project=fixture-project&limit=10",
      "https://workbench-core.example/v1/workbench/context?project=fixture-project&surface=web",
    ]);
    for (const call of fetch.mock.calls) {
      expect(call[1]).toMatchObject({
        method: "GET", redirect: "error", cache: "no-store",
        headers: { authorization: "Bearer fictional-owner-credential" },
      });
      expect(call[1]?.body).toBeUndefined();
    }
  });

  it.each([undefined, "a4000000-0000-4000-8000-000000000001"])(
    "fails closed before reading contents if the selected catalog UUID is %s", async (id) => {
      const candidate = { ...selectedProject, id };
      const get = vi.fn(async () => Response.json({
        selectedProject: candidate, projects: [candidate], generatedAt: checkedAt,
      }));
      expect(await createWorkbenchReader({ get }, [grant], "owner").read(grant.projectKey)).toEqual({ status: "denied" });
      expect(get).toHaveBeenCalledExactlyOnceWith("/v1/control-center?project=fixture-project&view=workbench");
    },
  );

  it("refuses a stale UUID in the project chooser before starting either content read", async () => {
    const other = { projectKey: "other-project", repository: null, id: "a5000000-0000-4000-8000-000000000001" };
    const changed = { ...selectedProject, ...other, id: "a6000000-0000-4000-8000-000000000001" };
    const get = vi.fn(async () => Response.json({
      selectedProject, projects: [selectedProject, changed], generatedAt: checkedAt,
    }));
    expect(await createWorkbenchReader({ get }, [grant, other], "owner").read(grant.projectKey)).toEqual({ status: "denied" });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it.each([
    "/v1/context?project=fixture-project", "/v1/chat", "/v1/tasks/not-a-list",
    "/v1/control-center?project=fixture-project",
    "/v1/control-center?project=fixture-project&view=workbench?also-other",
    "/v1/control-center?project=fixture-project&view=workbench&view=other",
    "//third-party.example/v1/tasks", "https://third-party.example/v1/tasks",
    "/v1/tasks?project=fixture-project#fragment", "/v1/control-center/../chat",
  ])("never attaches the server credential to an unexpected path %s", (path) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(() => readWorkbenchCore(path)).toThrow("Invalid Workbench read path.");
    expect(fetch).not.toHaveBeenCalled();
  });
});
