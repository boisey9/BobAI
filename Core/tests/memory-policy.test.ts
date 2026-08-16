import { describe, expect, it } from "vitest";

import {
  assertMemoryContentAllowed,
  inferMemoryScope,
  inferMemorySensitivity,
  normalizeMemoryContent,
} from "../src/memory/policy.js";

describe("Memory policy", () => {
  it("normalizes whitespace without changing meaning", () => {
    expect(
      normalizeMemoryContent("  I   prefer\n to be called Rick.  "),
    ).toBe("I prefer to be called Rick.");
  });

  it("rejects provider keys and database credentials", () => {
    expect(() =>
      assertMemoryContentAllowed(
        "My API key is sk-abcdefghijklmnopqrstuvwxyz1234567890",
      ),
    ).toThrow("won't store");
    expect(() =>
      assertMemoryContentAllowed(
        "Database is postgresql://user:password@example.com/db",
      ),
    ).toThrow("won't store");
  });

  it("rejects financial and government identifiers", () => {
    expect(() =>
      assertMemoryContentAllowed("My credit card number is 4111 1111 1111 1111"),
    ).toThrow("won't store");
    expect(() =>
      assertMemoryContentAllowed("My SIN is 123 456 789"),
    ).toThrow("won't store");
  });

  it("infers useful scopes", () => {
    expect(inferMemoryScope("I prefer concise replies.")).toBe(
      "preference",
    );
    expect(inferMemoryScope("The BobAI project uses Vercel.")).toBe(
      "project",
    );
    expect(inferMemoryScope("My daughter enjoys soccer.")).toBe(
      "personal",
    );
    expect(inferMemoryScope("The office opens at eight.")).toBe("fact");
  });

  it("classifies private personal data as sensitive", () => {
    expect(
      inferMemorySensitivity("My medical diagnosis changed."),
    ).toBe("sensitive");
    expect(
      inferMemorySensitivity("I prefer concise spoken answers."),
    ).toBe("normal");
  });
});
