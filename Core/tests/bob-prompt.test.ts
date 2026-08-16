import { describe, expect, it } from "vitest";

import {
  BOB_INSTRUCTIONS,
  buildBobInstructions,
} from "../src/prompts/bob.js";

describe("Bob Core instructions", () => {
  it("tells the model that the iPhone client speaks replies aloud", () => {
    expect(BOB_INSTRUCTIONS).toContain(
      "automatically reads every successful assistant reply aloud",
    );
    expect(BOB_INSTRUCTIONS).toContain(
      "Do not describe yourself as text-only",
    );
    expect(BOB_INSTRUCTIONS).toContain(
      "automatic sending after a short pause",
    );
  });

  it("keeps approved memory below the trusted Bob instructions", () => {
    const instructions = buildBobInstructions(
      JSON.stringify([{ content: "Call the user Rick." }]),
    );

    expect(instructions).toContain("Call the user Rick.");
    expect(instructions.indexOf("Do not describe yourself as text-only"))
      .toBeLessThan(instructions.indexOf("<approved_memory>"));
  });
});
