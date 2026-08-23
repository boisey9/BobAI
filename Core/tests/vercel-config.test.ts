import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const config = JSON.parse(
  readFileSync(
    new URL("../vercel.json", import.meta.url),
    "utf8",
  ),
) as {
  $schema?: string;
  ignoreCommand?: string;
  env?: Record<string, string>;
};

describe("Vercel project configuration", () => {
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
