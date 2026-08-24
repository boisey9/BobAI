export type CoreStatus = {
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

export type DashboardData = {
  status: CoreStatus | null;
  context: ContextPackage | null;
  activity: ActivityItem[];
  errors: string[];
};
