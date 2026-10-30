import { InMemorySharedContextStore } from "../src/context/in-memory-store.js";
import { SharedContextService } from "../src/context/service.js";
import { InMemoryMemoryStore } from "../src/memory/in-memory-store.js";
import { MemoryService } from "../src/memory/service.js";
import type { HybridBinding, InferenceRequest, DeviceGrant, HeartbeatRecord } from "../src/hybrid/contracts.js";
import type { RoutingFacts } from "../src/hybrid/routing-policy.js";

export const ids = {
  project: "11111111-1111-4111-8111-111111111111", instance: "22222222-2222-4222-8222-222222222222",
  device: "33333333-3333-4333-8333-333333333333", grant: "44444444-4444-4444-8444-444444444444",
  run: "55555555-5555-4555-8555-555555555555", attempt: "66666666-6666-4666-8666-666666666666",
  content: "77777777-7777-4777-8777-777777777777", other: "88888888-8888-4888-8888-888888888888",
};
export const binding: HybridBinding = { ownerId: "synthetic-owner", projectId: ids.project, projectKey: "bobai", environment: "testing", instanceId: ids.instance };
export const identity = { deviceId: ids.device, grantId: ids.grant, grantGeneration: 1 };
export const model = { name: "synthetic-model:small", digest: `sha256:${"a".repeat(64)}` };
export const enabledPolicy = { enabled: true, revision: 1 };

export async function hybridFixture() {
  const now = Date.now(), stamp = new Date(now).toISOString();
  const store = new InMemorySharedContextStore({ projects: [{
    id: ids.project, ownerId: binding.ownerId, projectKey: "bobai", name: "Synthetic BobAI", status: "active",
    description: null, repository: null, metadata: {}, createdAt: stamp, updatedAt: stamp,
  }], decisions: [{ id: ids.other, ownerId: binding.ownerId, projectId: ids.project,
    title: "Synthetic approved decision", decision: "Keep one Bob identity.", reason: null, status: "active",
    supersedesDecisionId: null, source: "synthetic-owner", metadata: {}, createdAt: stamp, updatedAt: stamp }],
  });
  const memory = new MemoryService(new InMemoryMemoryStore(), binding.ownerId, 6);
  await memory.remember("Synthetic approved project fact.", { scope: "project", metadata: { projectKey: "bobai", approvalStatus: "approved" } });
  const service = new SharedContextService(store, binding.ownerId, memory);
  const context = await service.build({ projectKey: "bobai", surface: "web" });
  const request: InferenceRequest = { version: 1, operationId: "synthetic-hybrid-request-1", binding: { ...binding },
    processingMode: "hosted-hybrid", route: { kind: "local", deviceId: ids.device, model: { ...model } },
    messages: [{ role: "user", content: "Synthetic inference only." }],
  };
  const models = [{ model: { ...model }, maxInputBytes: 262144, maxOutputTokens: 4096 }];
  const grant: DeviceGrant = { binding: { ...binding }, identity: { ...identity }, status: "approved",
    approvedAt: stamp, expiresAt: new Date(now + 3600000).toISOString(), capabilities: ["health:report", "inference:ollama"], models: structuredClone(models) };
  const heartbeat: HeartbeatRecord = { binding: { ...binding }, identity: { ...identity }, receivedAt: stamp, report: {
    version: 1, operationId: "synthetic-heartbeat-1", sequence: 1, observedAt: stamp, workerVersion: "synthetic-v1",
    capabilities: ["health:report", "inference:ollama"], models: structuredClone(models),
    ollama: { version: "synthetic-v1", transport: "loopback", cloudDisabled: true },
    health: { uptimeSeconds: 1, memoryTotalBytes: 1024, memoryAvailableBytes: 512, busy: false },
  } };
  const facts: RoutingFacts = { binding: { ...binding }, now: Date.now(), context, device: { grant, heartbeat },
    cloud: { aiProvider: "openai", aiModel: "synthetic-cloud", maxOutputTokens: 700 },
    authorization: { binding: { ...binding }, principalId: "synthetic-web-owner", surface: "web", status: "active",
      checkedAt: stamp, expiresAt: new Date(now + 60000).toISOString(), permissions: ["inference:cloud", "inference:local"] },
  };
  return { request, facts, context, grant, heartbeat, service, store };
}
export type HybridFixture = Awaited<ReturnType<typeof hybridFixture>>;
