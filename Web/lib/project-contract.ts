// Shared input/receipt checks. This module contains no server configuration.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PROJECT_BINDING = /^[A-Za-z0-9_-]{43}$/;
export type ProjectCreation = {
  operationId: string; projectKey: string; name: string;
  description: string | null; repository: string | null; expectedAnchorId: string;
};
export type ProjectReadiness = {
  authority: "bob-core"; anchor: { id: string; projectKey: "personal"; name: string };
  checkedAt: string; projectBinding: string;
};
export type CreatedProject = {
  id: string; projectKey: string; name: string; description: string | null;
  repository: string | null; status: "active"; createdAt: string; updatedAt: string;
};
export type ProjectReceipt = {
  authority: "bob-core"; project: CreatedProject; operationId: string; eventId: string; idempotent: boolean;
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}
function optionalText(value: unknown, maximum: number): string | null | false {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim().length > maximum) return false;
  return value.trim() || null;
}
function repositoryURL(value: unknown): string | null | false {
  const text = optionalText(value, 500);
  if (!text) return text;
  if (!text.startsWith("https://") || /\s/.test(text) || text.includes("?") || text.includes("#")) return false;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.href.length <= 500 ? url.href : false;
  } catch { return false; }
}

export function projectPayload(candidate: unknown): ProjectCreation | null {
  if (!record(candidate) || Object.keys(candidate).some(key => !["operationId", "projectKey", "name", "description", "repository", "expectedAnchorId"].includes(key))) return null;
  if (typeof candidate.operationId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(candidate.operationId)
      || typeof candidate.projectKey !== "string" || typeof candidate.name !== "string"
      || typeof candidate.expectedAnchorId !== "string" || !UUID.test(candidate.expectedAnchorId)) return null;
  const projectKey = candidate.projectKey.trim().toLowerCase();
  const name = candidate.name.trim();
  const description = optionalText(candidate.description, 4_000);
  const repository = repositoryURL(candidate.repository);
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(projectKey) || projectKey === "personal" || !name || name.length > 200
      || description === false || repository === false) return null;
  return { operationId: candidate.operationId, projectKey, name, description, repository, expectedAnchorId: candidate.expectedAnchorId.toLowerCase() };
}

export function publicProjectReadiness(candidate: unknown): Omit<ProjectReadiness, "projectBinding"> | null {
  if (!record(candidate) || candidate.authority !== "bob-core" || !record(candidate.anchor)
      || typeof candidate.anchor.id !== "string" || !UUID.test(candidate.anchor.id) || candidate.anchor.projectKey !== "personal"
      || typeof candidate.anchor.name !== "string" || !candidate.anchor.name.trim() || candidate.anchor.name.length > 200
      || !timestamp(candidate.checkedAt)) return null;
  return { authority: "bob-core", anchor: { id: candidate.anchor.id, projectKey: "personal", name: candidate.anchor.name }, checkedAt: candidate.checkedAt };
}

export function publicProjectReceipt(candidate: unknown, input: ProjectCreation): ProjectReceipt | null {
  if (!record(candidate) || candidate.authority !== "bob-core" || candidate.operationId !== input.operationId
      || typeof candidate.eventId !== "string" || !UUID.test(candidate.eventId) || typeof candidate.idempotent !== "boolean"
      || !record(candidate.project)) return null;
  const project = candidate.project;
  if (typeof project.id !== "string" || !UUID.test(project.id) || project.id === input.expectedAnchorId
      || project.projectKey !== input.projectKey || project.name !== input.name || project.description !== input.description
      || project.repository !== input.repository || project.status !== "active" || !timestamp(project.createdAt) || !timestamp(project.updatedAt)) return null;
  return { authority: "bob-core", operationId: input.operationId, eventId: candidate.eventId, idempotent: candidate.idempotent,
    project: { id: project.id, projectKey: input.projectKey, name: input.name, description: input.description,
      repository: input.repository, status: "active", createdAt: project.createdAt, updatedAt: project.updatedAt } };
}
