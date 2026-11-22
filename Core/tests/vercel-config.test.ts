import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const config = JSON.parse(
  readFileSync(
    new URL("../vercel.json", import.meta.url),
    "utf8",
  ),
) as {
  git?: { deploymentEnabled?: Record<string, boolean> };
  $schema?: string;
  ignoreCommand?: string;
  env?: Record<string, string>;
};

describe("Vercel project configuration", () => {
  it("keeps main and the UI and Workbench publication branches disabled in both deployables", () => {
    const web = JSON.parse(readFileSync(new URL("../../Web/vercel.json", import.meta.url), "utf8"));
    for (const project of [config, web]) {
      expect(project.git?.deploymentEnabled?.main).toBe(false);
      expect(project.git?.deploymentEnabled?.["codex/control-center-ui-integration"]).toBe(false);
      expect(project.git?.deploymentEnabled?.["codex/workbench-s4"]).toBe(false);
      expect(project.git?.deploymentEnabled?.["codex/workbench-owner-preview"]).toBe(false);
      expect(project.git?.deploymentEnabled?.["codex/workbench-owner-project-reads"]).toBe(false);
      expect(project.git?.deploymentEnabled?.["codex/workbench-bobai-core-boundary"]).toBe(false);
      expect(project.env?.BOB_UI_REVIEW_ENABLED).toBeUndefined();
      expect(project.env?.BOB_OWNER_WORKBENCH_PREVIEW).toBeUndefined();
      expect(project.env?.BOB_OWNER_WORKBENCH_READS_ENABLED).toBeUndefined();
      expect(project.env?.BOB_OWNER_WORKBENCH_PROJECT).toBeUndefined();
    }
  });
  it("skips backend deployments when the Core project is unchanged", () => {
    expect(config.$schema).toBe(
      "https://openapi.vercel.sh/vercel.json",
    );
    expect(config.ignoreCommand).toBe(
      "git diff --quiet HEAD^ HEAD ./",
    );
  });

  it("enables only the approved Bob Core runtime feature flag", () => {
    expect(config.env).toEqual({
      BOB_CORE_SHARED_CONTEXT_ENABLED: "true",
    });
  });
});
