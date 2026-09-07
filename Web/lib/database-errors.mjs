// Driver Error objects can hold the Pool client and its connection string.
// Handle idle/disposal errors without allowing EventEmitter's default throw to
// serialize that object. Active queries still reject to their normal caller.
export function observeDatabaseErrors(pool, report = record => console.error(JSON.stringify(record))) {
  pool.on("error", error => {
    const code = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
      ? error.code : "unknown";
    try { report({ event: "database.connection_failed", code }); }
    catch { /* Diagnostic transport failure must not rethrow a driver object. */ }
  });
  return pool;
}
