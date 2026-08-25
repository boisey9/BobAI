import type {
  ActivityItem,
  ContextPackage,
  ControlCenterAdminData,
  CoreStatus,
  DashboardData,
  InterfaceCredentialSummary,
} from "@/lib/types";

const REQUEST_TIMEOUT_MS = 15_000;

type CoreErrorBody = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
};

type CoreRequestOptions = {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
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

async function requestCore<T>(
  path: string,
  options: CoreRequestOptions = {},
): Promise<T> {
  const { baseURL, token } = configuration();
  const method = options.method ?? "GET";
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "user-agent": "Bob-Control-Center-Web/0.2",
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
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

export async function getControlCenterAdmin(
  projectKey: string,
): Promise<ControlCenterAdminData> {
  const query = new URLSearchParams({ project: projectKey });
  return requestCore<ControlCenterAdminData>(
    `/v1/control-center?${query.toString()}`,
  );
}

export async function resolveDecisionApproval(input: {
  taskId: string;
  project: string;
  action: "approve" | "reject";
  note?: string;
}): Promise<{ resolution: string; decisionTitle: string }> {
  return requestCore<{ resolution: string; decisionTitle: string }>(
    `/v1/control-center/approvals/${encodeURIComponent(input.taskId)}`,
    {
      method: "POST",
      body: {
        project: input.project,
        action: input.action,
        ...(input.note ? { note: input.note } : {}),
      },
    },
  );
}

export async function setInterfaceCredentialEnabled(input: {
  credentialId: string;
  project: string;
  enabled: boolean;
}): Promise<{ credential: InterfaceCredentialSummary }> {
  return requestCore<{ credential: InterfaceCredentialSummary }>(
    `/v1/control-center/credentials/${encodeURIComponent(input.credentialId)}`,
    {
      method: "POST",
      body: {
        project: input.project,
        enabled: input.enabled,
      },
    },
  );
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
  const [statusResult, contextResult, activityResult, controlCenterResult] =
    await Promise.allSettled([
      getCoreStatus(),
      getProjectContext(projectKey),
      getActivity(80),
      getControlCenterAdmin(projectKey),
    ]);
  const errors: string[] = [];

  return {
    status: settledValue(statusResult, "Core status", errors),
    context: settledValue(contextResult, "Project context", errors),
    activity: settledValue(activityResult, "Activity", errors) ?? [],
    controlCenter: settledValue(
      controlCenterResult,
      "Control Center administration",
      errors,
    ),
    errors,
  };
}
