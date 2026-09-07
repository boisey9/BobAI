"use client";
import { useState, type FormEvent } from "react";

type Message = { role: "user" | "assistant"; content: string };

export function WorkspaceChat({
  projectKey,
  csrf,
}: {
  projectKey: string;
  csrf: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<string | null>(null);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (pending || !draft.trim()) return;
    const next = [
      ...messages,
      { role: "user" as const, content: draft.trim() },
    ].slice(-20);
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-bob-csrf": csrf },
        body: JSON.stringify({ projectKey, messages: next }),
        signal: AbortSignal.timeout(60_000),
      });
      const result = await response.json();
      if (!response.ok || !result.message?.content)
        throw new Error(result.error || "Bob could not respond.");
      setMessages([...next, result.message]);
      setDraft("");
      const checkedAt = result.context?.sources?.tasks?.checkedAt;
      setFreshness(
        result.context
          ? `${result.context.partial ? "Partial context — some sources are unavailable or bounded" : "Context retrieved"}${checkedAt ? ` · ${new Date(checkedAt).toLocaleTimeString()}` : ""}`
          : "Context freshness unavailable",
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Bob could not respond.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      className="panel"
      style={{ padding: 24 }}
      aria-label="Workspace conversation"
    >
      <div role="log" aria-live="polite" aria-label="Conversation">
        {!messages.length && (
          <p>
            Continue this project or talk through your day. Task capture and
            reminders require their dedicated controls.
          </p>
        )}
        {messages.map((message, index) => (
          <article
            key={index}
            style={{ marginBottom: 24, whiteSpace: "pre-wrap" }}
          >
            <strong>{message.role === "user" ? "You" : "Bob"}</strong>
            <p>{message.content}</p>
          </article>
        ))}
      </div>
      {freshness && <p role="status">{freshness}</p>}
      {error && <p role="alert">{error}</p>}
      <form onSubmit={send}>
        <label htmlFor="bob-message">Message Bob in {projectKey}</label>
        <textarea
          id="bob-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={4_000}
          rows={4}
          required
          disabled={pending}
          style={{ width: "100%", margin: "12px 0", padding: 12 }}
        />
        <button
          type="submit"
          className="primary-button"
          disabled={pending || !draft.trim()}
        >
          {pending ? "Bob is responding…" : "Send"}
        </button>
      </form>
    </section>
  );
}
