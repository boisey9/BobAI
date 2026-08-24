import { describe, expect, it } from "vitest";

import { contextRequestSchema } from "../src/contracts.js";
import { CONTEXT_SURFACES } from "../src/context/types.js";

describe("Bob Control Center web surface", () => {
  it("is an explicit Shared Context surface", () => {
    expect(CONTEXT_SURFACES).toContain("web");
    expect(
      contextRequestSchema.parse({
        project: "bobai",
        surface: "web",
      }),
    ).toMatchObject({
      project: "bobai",
      surface: "web",
    });
  });
});
