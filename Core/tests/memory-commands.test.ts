import { describe, expect, it } from "vitest";

import { parseMemoryCommand } from "../src/memory/commands.js";

describe("Memory chat commands", () => {
  it("parses an explicit remember command", () => {
    expect(
      parseMemoryCommand(
        "Bob, remember that I prefer to be called Rick.",
      ),
    ).toEqual({
      type: "remember",
      content: "I prefer to be called Rick.",
    });
  });

  it("parses recall commands with and without a query", () => {
    expect(parseMemoryCommand("What do you remember?")).toEqual({
      type: "recall",
      query: null,
    });
    expect(
      parseMemoryCommand("Bob, what do you remember about my name?"),
    ).toEqual({
      type: "recall",
      query: "my name",
    });
  });

  it("parses an explicit forget command", () => {
    expect(
      parseMemoryCommand(
        "Bob, forget: I prefer to be called Rick.",
      ),
    ).toEqual({
      type: "forget",
      query: "I prefer to be called Rick",
    });
  });

  it("does not intercept an ordinary conversation", () => {
    expect(
      parseMemoryCommand("Can you help me plan tomorrow?"),
    ).toBeNull();
  });
});
