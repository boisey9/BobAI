export type CoreStatus = {
  checks?: Record<
    string,
    { status: string; checkedAt: string | null; detail?: string }
  >;
  status: string;
  service: string;
  version: string;
  provider?: string;
  model: string;
  memory?: {
    enabled: boolean;
    storage: string;
    capture: string;
    retrieval: string;
  };
  sharedContext?: {
    enabled: boolean;
    version: string;
    storage: string;
  };
  requestId: string;
};

export type ActivityItem = {
  id: string;
  projectKey: string | null;
  projectName: string | null;
  eventType: string;
  summary: string;
  source: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type ProjectItem = {
  projectKey: string;
  name: string;
  description: string | null;
  repository: string | null;
  status: "active" | "archived";
  updatedAt: string;
};

export type DecisionItem = {
  id: string;
  title: string;
  decision: string;
  reason: string | null;
  status: string;
  source: string;
  updatedAt: string;
};

export type TaskItem = {
  version?: number;
  id: string;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "blocked" | "done" | "cancelled";
  priority: "low" | "normal" | "high" | "critical";
  source: string;
  dueAt: string | null;
  updatedAt: string;
};

export type ContextPackage = {
  revision?: string;
  partial?: boolean;
  sources?: Record<
    string,
    {
      status: "available" | "unavailable";
      checkedAt: string;
      latestChangeAt: string | null;
      truncated: boolean;
    }
  >;
  handoffs?: Array<{
    id: string;
    outcome: string;
    unresolved: string[];
    nextActions: string[];
    source: string;
    createdAt: string;
  }>;
  authority: {
    source: string;
    version: string;
    rule: string;
  };
  request: {
    projectKey: string;
    task: string | null;
    surface: string;
  };
  project: ProjectItem;
  decisions: DecisionItem[];
  tasks: TaskItem[];
  recentEvents: ActivityItem[];
  memories: Array<{
    id: string;
    scope: string;
    subject: string | null;
    content: string;
    source: string;
    projectKey: string | null;
    updatedAt: string;
  }>;
  generatedAt: string;
};

export type InterfaceCredentialSummary = {
  id: string;
  surface: string;
  scopes: string[];
  enabled: boolean;
  createdAt: string | null;
};

export type PendingApproval = {
  id: string;
  title: string;
  decisionTitle: string;
  proposal: string;
  reason: string | null;
  source: string;
  interfaceId: string | null;
  surface: string | null;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
};

export type ControlCenterAdminData = {
  projects: ProjectItem[];
  selectedProject: ProjectItem;
  interfaces: InterfaceCredentialSummary[];
  legacyCredentialCount: number;
  approvals: PendingApproval[];
  releaseEvents: ActivityItem[];
  generatedAt: string;
  requestId: string;
};

export type DashboardData = {
  status: CoreStatus | null;
  context: ContextPackage | null;
  activity: ActivityItem[];
  controlCenter: ControlCenterAdminData | null;
  errors: string[];
};
