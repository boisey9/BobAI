import type { ActivityItem } from "@/lib/types";

const displayableDetailKeys = new Set([
  "status",
  "surface",
  "hasTask",
  "environment",
  "branch",
  "pr",
]);

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  }).format(date);
}

function detailLabels(item: ActivityItem): string[] {
  return Object.entries(item.details)
    .filter(([key, value]) => displayableDetailKeys.has(key) && value !== null)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);
}

function sourceSymbol(source: string): string {
  switch (source.toLowerCase()) {
    case "codex":
      return "⌘";
    case "chatgpt":
      return "✦";
    case "bobai":
      return "B";
    case "web":
      return "◫";
    case "vercel":
      return "▲";
    case "github":
      return "◉";
    default:
      return "•";
  }
}

export function ActivityTimeline({ activity }: { activity: ActivityItem[] }) {
  if (activity.length === 0) {
    return (
      <div className="empty-panel">
        <span aria-hidden="true">◎</span>
        <strong>No operational activity yet</strong>
        <p>Context retrievals and audited actions will appear here.</p>
      </div>
    );
  }

  return (
    <div className="activity-list">
      {activity.map((item) => {
        const details = detailLabels(item);
        return (
          <article className="activity-row" key={item.id}>
            <div className="activity-icon" aria-hidden="true">
              {sourceSymbol(item.source)}
            </div>
            <div className="activity-body">
              <div className="activity-heading">
                <strong>{item.summary}</strong>
                <time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
              </div>
              <div className="activity-meta">
                <span>{item.projectName ?? item.projectKey ?? "Bob Core"}</span>
                <span>{item.source}</span>
                <span>{item.eventType}</span>
              </div>
              {details.length > 0 && (
                <div className="detail-chips">
                  {details.map((detail) => (
                    <span key={detail}>{detail}</span>
                  ))}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
