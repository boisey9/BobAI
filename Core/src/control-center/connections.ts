type Query = {
  query: (
    text: string,
    values: unknown[],
    options?: { fetchOptions?: { signal?: AbortSignal } },
  ) => Promise<unknown[]>;
};

/** Safe owner-only projection; never return client secrets or token material. */
export async function readProjectConnections(
  sql: Query,
  ownerId: string,
  projectId: string,
  owner: boolean,
) {
  const checkedAt = new Date().toISOString();
  const unavailable = () => ({
    status: "unavailable" as const, checkedAt, truncated: false, grants: [],
  });
  if (!owner) return unavailable();

  try {
    const rows = await sql.query(
      `SELECT g.id::text, g.surface, g.scopes, g.created_at, g.revoked_at
       FROM public.bob_oauth_project_grants g
       JOIN public.bob_projects p ON p.id=g.project_id AND p.owner_id=g.owner_id
       WHERE g.owner_id=$1 AND p.id=$2::uuid AND p.deleted_at IS NULL
       ORDER BY g.created_at DESC, g.id LIMIT 101`,
      [ownerId, projectId],
      { fetchOptions: { signal: AbortSignal.timeout(5000) } },
    );
    const grants = rows.slice(0, 100).map(value => {
      const row = value as Record<string, unknown>;
      if (
        typeof row.id !== "string" || !/^[a-f0-9-]{36}$/.test(row.id) ||
        !["codex", "chatgpt", "copilot", "other"].includes(String(row.surface)) ||
        !Array.isArray(row.scopes) ||
        row.scopes.some(scope => typeof scope !== "string" || scope.length > 100)
      ) throw new Error("Invalid connection record");
      const date = (value: unknown) => {
        if (value == null) throw new Error("Missing connection timestamp");
        const parsed = new Date(value as string);
        if (!Number.isFinite(parsed.getTime())) throw new Error("Invalid connection timestamp");
        return parsed.toISOString();
      };
      return {
        id: row.id, surface: row.surface as string, scopes: row.scopes as string[],
        createdAt: date(row.created_at),
        revokedAt: row.revoked_at == null ? null : date(row.revoked_at),
      };
    });
    return { status: "available" as const, checkedAt, truncated: rows.length > 100, grants };
  } catch {
    // An older schema, denied read or malformed response is unknown, never zero.
    return unavailable();
  }
}
