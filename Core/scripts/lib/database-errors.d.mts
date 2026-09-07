export function observeDatabaseErrors<T extends { on(event: "error", listener: (error: unknown) => void): unknown }>(
  pool: T, report?: (record: { event: "database.connection_failed"; code: string }) => void,
): T;
