import type { CoreStatus } from "./types.js";

export type DashboardHealthState = "healthy" | "warning" | "offline" | "neutral";

export type DashboardHealthSummary = {
  value: string;
  detail: string;
  state: DashboardHealthState;
};

export type DashboardHealth = {
  connectivity: DashboardHealthSummary;
  inference: DashboardHealthSummary;
  operations: DashboardHealthSummary;
};

type Check = NonNullable<CoreStatus["checks"]>[string];

const adverseStatuses = new Set(["unavailable", "stale", "not_configured"]);
const reportedStatuses = new Set([
  "available", "unavailable", "stale", "not_configured", "not_checked",
]);

function reportedState(check: Check | undefined): string {
  return check && reportedStatuses.has(check.status)
    ? check.status.replaceAll("_", " ")
    : "unverified";
}

function hasTimestamp(check: Check): boolean {
  if (typeof check.checkedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(check.checkedAt)
    || !Number.isFinite(Date.parse(check.checkedAt))) return false;
  // Date.parse normalizes some invalid calendar dates, such as February 31.
  const date = check.checkedAt.slice(0, 10);
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}

function inferenceSummary(check: Check | undefined): DashboardHealthSummary {
  switch (check?.status) {
    case "available":
      if (hasTimestamp(check)) return {
        value: "Observed success", state: "healthy",
        detail: "The last generation observed by this Core process succeeded. This is not a global provider health check.",
      };
      break;
    case "not_checked":
      return {
        value: "Not checked", state: "neutral",
        detail: "This Core process has no generation observation. Provider availability has not been verified.",
      };
    case "unavailable":
      return {
        value: "Last attempt failed", state: "warning",
        detail: "The last generation observed by this Core process failed. This does not establish a current provider-wide outage.",
      };
    case "stale":
      return {
        value: "Stale observation", state: "warning",
        detail: "Core reports that its process-local generation observation is stale. Current inference availability is unverified.",
      };
    case "not_configured":
      return {
        value: "Not configured", state: "warning",
        detail: "Core reports inference as not configured. No successful generation is confirmed.",
      };
  }
  return {
    value: "Unverified", state: "neutral",
    detail: "No recognized provider observation with sufficient evidence was returned.",
  };
}

/** Present existing observations only; never probe, activate, or infer health from the aggregate. */
export function getDashboardHealth(status: CoreStatus | null): DashboardHealth {
  const checks = status?.checks;
  const connections = [checks?.process, checks?.database, checks?.context];
  const connectionDetails = `Process: ${reportedState(checks?.process)}. Database: ${reportedState(checks?.database)}. Context: ${reportedState(checks?.context)}.`;
  const connectivity: DashboardHealthSummary = !status
    ? { value: "Unavailable", state: "offline", detail: "No Core status response was received." }
    : connections.some(check => check && adverseStatuses.has(check.status))
      ? { value: "Attention needed", state: "warning", detail: connectionDetails }
      : connections.every(check => check?.status === "available")
        ? {
          value: "Connected", state: "healthy",
          detail: "Core process, database and context checks succeeded. This does not verify the selected project's contents.",
        }
        : { value: "Unverified", state: "neutral", detail: connectionDetails };

  const operations = [checks?.backup, checks?.scheduler];
  const operationDetails = `Backup: ${reportedState(checks?.backup)}. Scheduler: ${reportedState(checks?.scheduler)}. These checks do not establish full recovery readiness.`;
  const operationsSummary: DashboardHealthSummary = operations.some(check => check && adverseStatuses.has(check.status))
    ? { value: "Attention needed", state: "warning", detail: operationDetails }
    : operations.every(check => check?.status === "available")
      ? { value: "Checks passing", state: "healthy", detail: operationDetails }
      : { value: "Unverified", state: "neutral", detail: operationDetails };

  return { connectivity, inference: inferenceSummary(checks?.provider), operations: operationsSummary };
}
