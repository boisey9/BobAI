import { z } from "zod";
import { fingerprint } from "../context/operations.js";
import type { ContextSurface, SharedContextPackage } from "../context/types.js";
import { buildBobInstructions } from "../prompts/bob.js";
import { HYBRID_LIMITS, type HybridBinding } from "./contracts.js";

const sources = ["decisions", "tasks", "events", "memories", "handoffs"] as const;
const requiredSources = ["decisions", "tasks", "memories", "handoffs"] as const;
const timestamp = z.iso.datetime({ offset: true });
export function fresh(value: unknown, now: number, maxAgeMs: number): value is string {
  if (!timestamp.safeParse(value).success) return false;
  const time = Date.parse(value as string);
  return time <= now + HYBRID_LIMITS.clockSkewMs && now - time < maxAgeMs;
}

// Input must come from the existing authenticated SharedContextService. These
// checks contain stale/mismatched internal evidence; they are not authentication.
export function prepareHybridContext(context: SharedContextPackage, binding: HybridBinding, surface: ContextSurface, now: number) {
  if (context.authority.source !== "bob-core" || context.authority.version !== "0.2"
    || context.project.id !== binding.projectId || context.project.projectKey !== binding.projectKey
    || context.project.ownerId !== binding.ownerId || context.project.status !== "active"
    || context.request.projectKey !== binding.projectKey || context.request.surface !== surface)
    return { ok: false as const, code: "context_binding_mismatch" as const };
  if (!context.revision || context.revision.length > 128 || typeof context.partial !== "boolean"
    || !fresh(context.generatedAt, now, HYBRID_LIMITS.contextFreshMs))
    return { ok: false as const, code: "context_unavailable" as const };
  for (const name of sources) {
    const source = context.sources[name];
    if (!source || !["available", "unavailable"].includes(source.status) || typeof source.truncated !== "boolean")
      return { ok: false as const, code: "context_unavailable" as const };
    if (name !== "events" && (source.status !== "available" || !fresh(source.checkedAt, now, HYBRID_LIMITS.contextFreshMs)))
      return { ok: false as const, code: "context_unavailable" as const };
  }
  if (![context.decisions, context.tasks, context.handoffs, context.memories, context.recentEvents].every(Array.isArray))
    return { ok: false as const, code: "context_unavailable" as const };
  if ([...context.decisions, ...context.tasks, ...context.handoffs].some(item => item.ownerId !== binding.ownerId || item.projectId !== binding.projectId)
    || context.decisions.some(item => item.status !== "active")
    || context.memories.some(item => (item.projectKey !== null && item.projectKey !== binding.projectKey)
      || (item.scope === "project" && item.projectKey !== binding.projectKey))
    || context.recentEvents.some(item => item.ownerId !== binding.ownerId || (item.projectId !== null && item.projectId !== binding.projectId)))
    return { ok: false as const, code: "context_binding_mismatch" as const };

  const truncatedSources = sources.filter(name => context.sources[name].truncated);
  const partial = context.partial || truncatedSources.length > 0 || sources.some(name => context.sources[name].status === "unavailable");
  return {
    ok: true as const,
    capture: {
      authority: "bob-core" as const, revision: context.revision, generatedAt: context.generatedAt,
      // Operational events can change the overall revision. Bind relevant state separately;
      // later dispatch must compare this hash without recapturing a run's content.
      stateHash: `sha256:${fingerprint({ binding, decisions: context.decisions, tasks: context.tasks,
        memories: context.memories, handoffs: context.handoffs,
        sources: requiredSources.map(name => [name, context.sources[name].status, context.sources[name].truncated]) })}`,
      partial, truncatedSources,
    },
    instructions: buildBobInstructions(undefined, context),
  };
}
