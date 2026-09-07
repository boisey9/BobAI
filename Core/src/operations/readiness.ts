import { neon } from "@neondatabase/serverless";
import type { SharedContextService } from "../context/service.js";

export type Check = {
  status:
    "available" | "unavailable" | "not_configured" | "not_checked" | "stale";
  checkedAt: string | null;
  detail?: string;
};

export async function readiness(
  databaseURL: string | undefined,
  context: SharedContextService | undefined,
  projectKey: string,
  provider: Check,
) {
  const now = new Date().toISOString();
  const checks: Record<string, Check> = {
    process: { status: "available", checkedAt: now },
    database: { status: "not_configured", checkedAt: null },
    context: { status: "not_configured", checkedAt: null },
    provider:
      provider.checkedAt &&
      Date.now() - Date.parse(provider.checkedAt) > 300_000
        ? { ...provider, status: "stale" }
        : provider,
    scheduler: {
      status: "not_configured",
      checkedAt: null,
      detail: "Scheduled delivery has not been enabled.",
    },
  };
  await Promise.all([
    (async () => {
      if (!databaseURL) return;
      try {
        const sql = neon(databaseURL, {
          fetchOptions: { signal: AbortSignal.timeout(5_000) },
        });
        await sql`SELECT 1 AS available`;
        checks.database = { status: "available", checkedAt: now };
      } catch {
        checks.database = { status: "unavailable", checkedAt: now };
      }
    })(),
    (async () => {
      if (!context) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          context.build({ projectKey, surface: "web" }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Context probe timed out")),
              5_000,
            );
            timer.unref();
          }),
        ]);
        checks.context = {
          status: Object.values(result.sources).every(
            (source) => source.status === "available",
          )
            ? "available"
            : "unavailable",
          checkedAt: now,
        };
      } catch {
        checks.context = { status: "unavailable", checkedAt: now };
      } finally {
        if (timer) clearTimeout(timer);
      }
    })(),
  ]);
  return {
    status: Object.values(checks).every((check) => check.status === "available")
      ? "ready"
      : "degraded",
    checks,
  };
}
