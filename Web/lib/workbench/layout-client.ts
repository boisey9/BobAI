import type { Board } from "../../components/workbench/fixtures";
import { layoutVersion, parseLayoutBoard, sameLayout, type SampleLayoutScope } from "./layout-contract";

export type SavedLayout = {
  binding: string;
  version: number;
  board: Board | null;
  expiresAt: string;
  replayed: boolean;
};

type Result =
  | { kind: "snapshot"; snapshot: SavedLayout }
  | { kind: "conflict" | "expired" | "unavailable" | "refused" };

export type LayoutIntent = {
  operationId: string;
  expectedVersion: number;
  board: Board;
};

function row(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createLayoutClient(scope: SampleLayoutScope) {
  const endpoint = "/api/review/workbench/layout?" + new URLSearchParams({
    project: scope.projectKey, fixture: scope.fixture,
  });

  async function request(binding?: string, intent?: LayoutIntent): Promise<Result> {
    try {
      const response = await fetch(endpoint, {
        method: intent ? "POST" : "GET",
        credentials: "same-origin", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
        headers: {
          "x-bob-layout-review": "1",
          ...(binding ? { "x-bob-layout-binding": binding } : {}),
          ...(intent ? { "content-type": "application/json" } : {}),
        },
        ...(intent ? { body: JSON.stringify(intent) } : {}),
      });
      const value: unknown = await response.json();
      if (!row(value)) return { kind: "unavailable" };
      if (response.status !== 200) {
        const code = row(value.error) ? value.error.code : null;
        if (response.status === 409 && (code === "layout_conflict" || code === "layout_operation_conflict")) return { kind: "conflict" };
        if (response.status === 403 && code === "layout_binding_changed") return { kind: "expired" };
        if ([400, 413, 415, 429].includes(response.status)) return { kind: "refused" };
        return { kind: "unavailable" };
      }
      if (value.projectKey !== scope.projectKey || value.projectId !== scope.projectId || value.fixture !== scope.fixture
          || typeof value.binding !== "string" || !/^(?:[a-f0-9]{64}|[A-Za-z0-9_-]{43})$/.test(value.binding)
          || (binding && value.binding !== binding) || !layoutVersion(value.version)
          || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))
          || typeof value.replayed !== "boolean" || (!intent && value.replayed)) return { kind: "unavailable" };
      const board = value.version > 0 ? parseLayoutBoard(value.board, scope.sourceIds) : null;
      if ((value.version > 0 && !board) || (value.version === 0 && value.board !== null)) return { kind: "unavailable" };
      if (intent && (!board || value.version !== intent.expectedVersion + 1 || !sameLayout(board, intent.board))) {
        return { kind: "unavailable" };
      }
      return { kind: "snapshot", snapshot: {
        binding: value.binding, version: value.version, board, expiresAt: value.expiresAt, replayed: value.replayed,
      } };
    } catch {
      return { kind: "unavailable" };
    }
  }

  return {
    read: (binding?: string) => request(binding),
    save: (binding: string, intent: LayoutIntent) => request(binding, intent),
  };
}
