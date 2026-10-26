import { afterEach, describe, expect, it, vi } from "vitest";
import { APIConnectionTimeoutError, APIUserAbortError } from "openai/error";
import { OpenAIResponsesProvider } from "../src/ai/openai-provider.js";
import { createApp } from "../src/app.js";
import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";
import { createTestConfig, TEST_DEVICE_TOKEN } from "./test-config.js";

const messages = [{ role: "user" as const, content: "Synthetic continuity request." }];

function response(text = "Bob's synthetic response.") {
  return Response.json({ id: "resp_synthetic", object: "response", model: "synthetic-model",
    output: [{ id: "msg_synthetic", type: "message", role: "assistant", status: "completed",
      content: [{ type: "output_text", text, annotations: [] }] }],
  });
}

function stalledTransport() {
  const network = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
    const signal = init?.signal;
    const abort = () => reject(new DOMException("Synthetic transport abort", "AbortError"));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  }));
  vi.stubGlobal("fetch", network);
  return network;
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("OpenAI Responses transport", () => {
  it("passes Core identity/context and explicit reasoning through the real SDK without storing content", async () => {
    const network = vi.fn<typeof fetch>(async () => response());
    vi.stubGlobal("fetch", network);
    const service = new SharedContextService(new InMemorySharedContextStore({ projects: [{
      id: "11111111-1111-4111-8111-111111111111", ownerId: "rick", projectKey: "bobai", name: "Synthetic BobAI",
      description: null, repository: null, status: "active", metadata: {},
      createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z",
    }] }), "rick");
    const sharedContext = await service.build({ projectKey: "bobai", surface: "codex" });
    const provider = new OpenAIResponsesProvider(createTestConfig({ aiModel: "synthetic-model", openaiReasoningEffort: "low" }));
    expect(await provider.generate(messages, { sharedContext })).toEqual({ text: "Bob's synthetic response.", model: "synthetic-model" });
    const body = JSON.parse(String(network.mock.calls[0]![1]!.body));
    expect(body).toMatchObject({ model: "synthetic-model", input: messages, max_output_tokens: 700,
      reasoning: { effort: "low" }, store: false });
    expect(body.instructions).toContain("You are Bob");
    expect(body.instructions).toContain(JSON.stringify(sharedContext));
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("omits reasoning by default and preserves approved memory instructions", async () => {
    const network = vi.fn<typeof fetch>(async () => response());
    vi.stubGlobal("fetch", network);
    await new OpenAIResponsesProvider(createTestConfig()).generate(messages, { memoryContext: "Synthetic approved memory." });
    const body = JSON.parse(String(network.mock.calls[0]![1]!.body));
    expect(body).not.toHaveProperty("reasoning");
    expect(body.instructions).toContain("Synthetic approved memory.");
    expect(body.store).toBe(false);
  });

  it("returns a rate-limit failure without waiting for a long Retry-After or making another request", async () => {
    vi.useFakeTimers();
    const network = vi.fn<typeof fetch>(async () => Response.json({ error: { code: "rate_limit_exceeded", message: "synthetic" } },
      { status: 429, headers: { "retry-after": "240" } }));
    vi.stubGlobal("fetch", network);
    const controller = new AbortController();
    let failure: unknown;
    const pending = new OpenAIResponsesProvider(createTestConfig()).generate(messages, { signal: controller.signal })
      .catch(error => { failure = error; });
    await vi.advanceTimersByTimeAsync(35_001);
    const beforeDeadline = failure;
    controller.abort();
    await vi.runAllTimersAsync();
    await pending;
    expect(beforeDeadline).toMatchObject({ status: 429 });
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("stops a stalled transport at 15 seconds without an SDK retry", async () => {
    vi.useFakeTimers();
    const network = stalledTransport();
    const controller = new AbortController();
    let failure: unknown;
    const pending = new OpenAIResponsesProvider(createTestConfig()).generate(messages, { signal: controller.signal })
      .catch(error => { failure = error; });
    await vi.advanceTimersByTimeAsync(15_001);
    const atTransportDeadline = failure;
    controller.abort();
    await vi.runAllTimersAsync();
    await pending;
    expect(atTransportDeadline).toBeInstanceOf(APIConnectionTimeoutError);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("propagates caller cancellation to the transport", async () => {
    const network = stalledTransport();
    const controller = new AbortController();
    const pending = new OpenAIResponsesProvider(createTestConfig()).generate(messages, { signal: controller.signal });
    const rejected = expect(pending).rejects.toBeInstanceOf(APIUserAbortError);
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(1));
    controller.abort();
    await rejected;
    expect(network.mock.calls[0]![1]!.signal?.aborted).toBe(true);
  });

  it("rejects an empty successful response without claiming a generated answer", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => response("  ")));
    await expect(new OpenAIResponsesProvider(createTestConfig()).generate(messages)).rejects.toThrow("empty response");
  });

  it("returns a bounded, sanitized API error when the real SDK transport times out", async () => {
    vi.useFakeTimers();
    const network = stalledTransport();
    const config = createTestConfig();
    const app = createApp({ config, aiProvider: new OpenAIResponsesProvider(config) });
    const pending = app.request("/v1/chat", { method: "POST",
      headers: { authorization: `Bearer ${TEST_DEVICE_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    await vi.advanceTimersByTimeAsync(15_001);
    const result = await pending;
    expect(result.status).toBe(503);
    const body = await result.json();
    expect(body).toMatchObject({ error: { code: "openai_connection_failed" } });
    expect(JSON.stringify(body)).not.toContain("Synthetic transport abort");
    expect(JSON.stringify(body)).not.toContain(messages[0]!.content);
    expect(network).toHaveBeenCalledTimes(1);
  });
});
