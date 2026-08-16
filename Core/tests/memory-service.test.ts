import { describe, expect, it } from "vitest";

import { InMemoryMemoryStore } from "../src/memory/in-memory-store.js";
import { MemoryService } from "../src/memory/service.js";

function createService() {
  return new MemoryService(new InMemoryMemoryStore(), "rick", 6);
}

describe("Memory service", () => {
  it("stores explicit memory and prevents active duplicates", async () => {
    const service = createService();
    const first = await service.remember(
      "  I prefer   to be called Rick. ",
    );
    const second = await service.remember(
      "I prefer to be called Rick.",
    );

    expect(first.created).toBe(true);
    expect(first.item.scope).toBe("preference");
    expect(first.item.content).toBe("I prefer to be called Rick.");
    expect(second.created).toBe(false);
    expect(second.item.id).toBe(first.item.id);
  });

  it("handles remember, recall, and forget commands without the model", async () => {
    const service = createService();
    const remembered = await service.handleCommand(
      {
        type: "remember",
        content: "I prefer to be called Rick.",
      },
      "request-1",
    );
    const recalled = await service.handleCommand(
      { type: "recall", query: "called Rick" },
      "request-2",
    );
    const forgotten = await service.handleCommand(
      {
        type: "forget",
        query: "I prefer to be called Rick.",
      },
      "request-3",
    );

    expect(remembered.reply).toContain("I'll remember");
    expect(recalled.reply).toContain("I prefer to be called Rick.");
    expect(forgotten.reply).toContain("I forgot");
    expect(await service.list()).toEqual([]);
  });

  it("turns policy rejections into a safe chat response", async () => {
    const service = createService();
    const result = await service.handleCommand(
      {
        type: "remember",
        content: "My API key is sk-abcdefghijklmnopqrstuvwxyz1234567890",
      },
      "request-secret",
    );

    expect(result.operation).toBe("clarification");
    expect(result.reply).toContain("won't store");
    expect(await service.list()).toEqual([]);
  });

  it("injects only relevant normal memories into model context", async () => {
    const service = createService();
    await service.remember("I prefer to be called Rick.");
    await service.remember("My medical diagnosis is private.", {
      sensitivity: "sensitive",
    });
    await service.remember("The unrelated project color is blue.");

    const context = await service.buildContext(
      "What do I prefer to be called?",
    );

    expect(context).toContain("I prefer to be called Rick.");
    expect(context).not.toContain("medical diagnosis");
    expect(context).not.toContain("project color");
  });
});
