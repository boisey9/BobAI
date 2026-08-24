import type {
  ActivityItem,
  ContextPackage,
  CoreStatus,
  DashboardData,
} from "@/lib/types";

const REQUEST_TIMEOUT_MS = 15_000;

type CoreErrorBody = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
};

function configuration() {
  const baseURL = (
    process.env.BOB_CORE_BASE_URL?.trim() || "https://bob-core.vercel.app"
  ).replace(/\/$/, "");
  const token = process.env.BOB_CORE_DEVICE_TOKEN?.trim();

  if (!token) {
    throw new Error("BOB_CORE_DEVICE_TOKEN is not configured for the web server.");
  }
  if (process.env.NODE_ENV === "production" && !baseURL.startsWith("https://")) {
    throw new Error("BOB_CORE_BASE_URL must use HTTPS in production.");
  }

  return { baseURL, token };
}

async function requestCore<T>(path: string): Promise<T> {
  const { baseURL, token } = configuration();
  const response = await fetch(`${baseURL}${path}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "user-agent": "Bob-Control-Center-Web/0.1",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as CoreErrorBody;
    const message = body.error?.message || `Bob Core returned HTTP ${response.status}.`;
    const requestId = body.error?.requestId;
    throw new Error(requestId ? `${message} Request: ${requestId}` : message);
  }

  return (await response.json()) as T;
}

export async function getCoreStatus(): Promise<CoreStatus> {
  return requestCore<CoreStatus>("/v1/status");
}

export async function getProjectContext(projectKey: string): Promise<ContextPackage> {
  const query = new URLSearchParams({
    project: projectKey,
    surface: "web",
  });
  const response = await requestCore<{ context: ContextPackage }>(
    `/v1/context?${query.toString()}`,
  );
  return response.context;
}

export async function getActivity(limit = 50): Promise<ActivityItem[]> {
  const query = new URLSearchParams({ limit: String(Math.max(1, Math.min(limit, 100))) });
  const response = await requestCore<{ activity: ActivityItem[] }>(
    `/v1/activity?${query.toString()}`,
  );
  return response.activity;
}

function settledValue<T>(
  result: PromiseSettledResult<T>,
  label: string,
  errors: string[],
): T | null {
  if (result.status === "fulfilled") return result.value;
  const detail = result.reason instanceof Error ? result.reason.message : "Unknown error";
  errors.push(`${label}: ${detail}`);
  return null;
}

export async function getDashboardData(projectKey: string): Promise<DashboardData> {
  const [statusResult, contextResult, activityResult] = await Promise.allSettled([
    getCoreStatus(),
    getProjectContext(projectKey),
    getActivity(60),
  ]);
  const errors: string[] = [];

  return {
    status: settledValue(statusResult, "Core status", errors),
    context: settledValue(contextResult, "Project context", errors),
    activity: settledValue(activityResult, "Activity", errors) ?? [],
    errors,
  };
}
