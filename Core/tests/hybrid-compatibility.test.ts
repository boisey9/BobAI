import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBobCoreRuntime } from "../src/runtime.js";
import { OpenAIResponsesProvider } from "../src/ai/openai-provider.js";
import { ZAIChatCompletionsProvider } from "../src/ai/zai-provider.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Unexpected live transport"); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const headers = { authorization: `Bearer ${TEST_DEVICE_TOKEN}`, "content-type": "application/json" };
const messages = [{ role: "user", content: "Synthetic compatibility check." }];

describe("hybrid contracts do not activate runtime routes or change provider selection", () => {
  it.each(["openai", "zai"] as const)("preserves ordinary chat through the configured %s provider", async aiProvider => {
    const openai = vi.spyOn(OpenAIResponsesProvider.prototype, "generate").mockResolvedValue({ model: "synthetic-openai-actual", text: "Synthetic Bob reply." });
    const zai = vi.spyOn(ZAIChatCompletionsProvider.prototype, "generate").mockResolvedValue({ model: "synthetic-zai-actual", text: "Synthetic Bob reply." });
    const runtime = createBobCoreRuntime(createTestConfig({ aiProvider }));
    const response = await runtime.app.request("/v1/chat", { method: "POST", headers, body: JSON.stringify({ messages }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ message: { role: "assistant", content: "Synthetic Bob reply." }, model: `synthetic-${aiProvider}-actual` });
    expect(aiProvider === "openai" ? openai : zai).toHaveBeenCalledTimes(1);
    expect(aiProvider === "openai" ? zai : openai).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{ route: { kind: "local" } }, { route: { kind: "cloud" } }, { route: { kind: "automatic" } },
    { processingMode: "local-only" }, { processingMode: "hosted-hybrid" }])("rejects explicit hybrid selection on legacy chat: %j", async hybrid => {
    const generate = vi.spyOn(OpenAIResponsesProvider.prototype, "generate");
    const runtime = createBobCoreRuntime(createTestConfig());
    const response = await runtime.app.request("/v1/chat", { method: "POST", headers, body: JSON.stringify({ messages, ...hybrid }) });
    expect(response.status).toBe(400); expect(generate).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(messages[0]!.content);
  });
  it("has no hybrid endpoints even if an unrecognized environment flag is set", async () => {
    vi.stubEnv("BOB_CORE_HYBRID_ENABLED", "true"); // Deliberately NOT a supported deployment flag.
    const generate = vi.spyOn(OpenAIResponsesProvider.prototype, "generate");
    const runtime = createBobCoreRuntime(createTestConfig());
    for (const path of ["/v1/local-nodes", "/v1/local-nodes/heartbeat", "/v1/inference-runs", "/v1/inference-runs/claim"])
      expect((await runtime.app.request(path, { method: "POST", headers, body: "{}" })).status).toBe(404);
    expect(generate).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
});
