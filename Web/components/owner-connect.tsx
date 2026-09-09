"use client";
import { useState } from "react";

const labels: Record<string, string> = {
  offline_access: "Keep this connection available between sessions",
  "mcp:context:read": "Read approved project context",
  "mcp:sync": "Use the project tool connection",
  "mcp:event:write": "Record project activity",
  "mcp:task:write": "Create and update project tasks",
  "mcp:decision:propose": "Submit decisions for your review",
};
export function OwnerConnect({
  oauthQuery,
  clientId,
  clientName,
  requestedScopes,
  projects,
  csrf,
}: {
  oauthQuery: string;
  clientId: string;
  clientName: string;
  requestedScopes: string[];
  projects: { key: string; name: string }[];
  csrf: string;
}) {
  const [projectKey, setProject] = useState("");
  const [surface, setSurface] = useState(
    clientId.startsWith("https://chatgpt.com/") ? "chatgpt" : "other",
  );
  const [scopes, setScopes] = useState(requestedScopes);
  const [operationId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(accept: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await fetch("/api/connections/consent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bob-csrf-token": csrf,
        },
        body: JSON.stringify({
          accept,
          projectKey,
          surface,
          scopes,
          oauthQuery,
          operationId,
        }),
      });
      const data = await result.json();
      if (!result.ok || typeof data.url !== "string")
        throw new Error(data.error ?? "Connection could not be confirmed.");
      // The authorization server validates and constructs this callback URL.
      window.location.assign(data.url);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Connection could not be confirmed. Retry shortly.",
      );
      setBusy(false);
    }
  }
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h1>Connect a project to {clientName}</h1>
      <p>
        Choose the project and permissions this connection can use. You can
        revoke it from Owner access at any time.
      </p>
      <p className="connection-identity">Client identity: {clientId}</p>
      <div className="login-form connection-form">
        <label htmlFor="connection-project">Project</label>
        <select
          id="connection-project"
          value={projectKey}
          onChange={(e) => setProject(e.target.value)}
          disabled={busy}
        >
          <option value="">Select a project</option>
          {projects.map((project) => (
            <option key={project.key} value={project.key}>
              {project.name}
            </option>
          ))}
        </select>
        <label htmlFor="connection-surface">Where you will use Bob</label>
        <select
          id="connection-surface"
          value={surface}
          onChange={(e) => setSurface(e.target.value)}
          disabled={busy}
        >
          <option value="chatgpt">ChatGPT</option>
          <option value="codex">Codex</option>
          <option value="copilot">GitHub Copilot</option>
          <option value="other">Another engineering client</option>
        </select>
        <fieldset disabled={busy}>
          <legend>Permissions requested</legend>
          {requestedScopes.map((scope) => (
            <label key={scope} className="permission-option">
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                disabled={["mcp:sync", "mcp:context:read"].includes(scope)}
                onChange={(e) =>
                  setScopes((current) =>
                    e.target.checked
                      ? [...current, scope]
                      : current.filter((value) => value !== scope),
                  )
                }
              />
              <span>{labels[scope] ?? scope}</span>
            </label>
          ))}
        </fieldset>
        <p>
          Personal memories and Apple sources are outside this connection.
          Decision proposals require your review before becoming active.
        </p>
        <button
          className="primary-button"
          disabled={busy || !projectKey}
          onClick={() => submit(true)}
        >
          {busy ? "Confirming…" : "Approve project connection"}
        </button>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => submit(false)}
        >
          Decline
        </button>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
