import { fixture, groups, initialBoard, type Board } from "../../components/workbench/fixtures";
import { workbenchSampleProjects } from "./sample-projects";

export const layoutSchema = 1;
export const layoutRevisionLimit = 40;
export const boardDraftId = "task-draft";

export function sampleLayoutScope(projectKey: string, fixtureMode: string) {
  const project = workbenchSampleProjects.find(value => value.projectKey === projectKey);
  if (!project || (fixtureMode !== "standard" && fixtureMode !== "stress")) return null;
  const sources = fixture(project.projectKey, fixtureMode === "stress").sources;
  return {
    projectKey: project.projectKey,
    projectId: project.id,
    fixture: fixtureMode,
    sourceIds: sources.map(source => source.id),
    defaultBoard: initialBoard(sources),
  };
}

export type SampleLayoutScope = NonNullable<ReturnType<typeof sampleLayoutScope>>;

export function layoutVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= layoutRevisionLimit;
}

export function parseLayoutBoard(value: unknown, sourceIds: readonly string[]): Board | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== groups.length) return null;
  const input = value as Record<string, unknown>;
  const remaining = new Set(sourceIds);
  const board: Board = { reference: [], review: [], focus: [] };
  for (const { id } of groups) {
    const list = input[id];
    if (!Array.isArray(list) || list.length > sourceIds.length) return null;
    for (const card of list) {
      if (typeof card !== "string" || !remaining.delete(card)) return null;
      board[id].push(card);
    }
  }
  return remaining.size === 0 ? board : null;
}

export function sourceLayout(board: Board): Board {
  return {
    reference: board.reference.filter(card => card !== boardDraftId),
    review: board.review.filter(card => card !== boardDraftId),
    focus: board.focus.filter(card => card !== boardDraftId),
  };
}

export function sameLayout(left: Board, right: Board) {
  return groups.every(({ id }) => left[id].length === right[id].length
    && left[id].every((card, position) => card === right[id][position]));
}

export function replaceSourceLayout(current: Board, next: Board): Board {
  if (sameLayout(sourceLayout(current), next)) return current;
  const lane = groups.find(({ id }) => current[id].includes(boardDraftId));
  if (!lane) return next;
  const id = lane.id;
  const draftIndex = current[id].indexOf(boardDraftId);
  const anchor = current[id].slice(draftIndex + 1).find(card => next[id].includes(card));
  const arranged = [...next[id]];
  arranged.splice(anchor === undefined ? Math.min(draftIndex, arranged.length) : arranged.indexOf(anchor), 0, boardDraftId);
  return { ...next, [id]: arranged };
}
