"use client";
import { useState } from "react";
export function ProjectConnections({
  initial,
  csrf,
}: {
  initial: {
    id: string;
    name: string;
    surface: string;
    scopes: string[];
    createdAt: string;
    clientName: string | null;
    clientId: string;
  }[];
  csrf: string;
}) {
  const [connections, setConnections] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function revoke(id: string) {
    setBusy(id);
    setMessage("");
    try {
      const result = await fetch(`/api/connections/${id}`, {
        method: "DELETE",
        headers: { "x-bob-csrf-token": csrf },
      });
      if (!result.ok) throw new Error();
      setConnections((current) => current.filter((item) => item.id !== id));
      setMessage("Connection revoked.");
    } catch {
      setMessage("Revocation could not be confirmed. Retry when connected.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="panel" style={{ padding: 24, marginTop: 24 }}>
      <h2>Project connections</h2>
      {connections.length === 0 ? (
        <p>No approved project connections.</p>
      ) : (
        connections.map((item) => (
          <article key={item.id} style={{ marginBlock: 20 }}>
            <h3>
              {item.name} · {item.surface}
            </h3>
            <p>{item.clientName ?? "Project client"}</p>
            <p className="connection-identity">
              Client identity: {item.clientId}
            </p>
            <p>
              {item.scopes.includes("mcp:task:write")
                ? "Project context, task updates and selected tools"
                : "Project context and selected tools"}
            </p>
            <p>
              Approved{" "}
              {new Intl.DateTimeFormat("en-CA", {
                timeZone: "America/Toronto",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(item.createdAt))}
            </p>
            <button
              className="secondary-button"
              disabled={busy !== null}
              onClick={() => revoke(item.id)}
            >
              {busy === item.id ? "Revoking…" : "Revoke connection"}
            </button>
          </article>
        ))
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
