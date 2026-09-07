"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function OwnerSecurity() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: "passkey" | "others" | "signout") {
    setBusy(true);
    setMessage("");
    try {
      const result =
        action === "passkey"
          ? await authClient.passkey.addPasskey({ name: "Bob owner" })
          : action === "others"
            ? await authClient.revokeOtherSessions()
            : await authClient.signOut();
      if (result?.error)
        setMessage(result.error.message ?? "The change could not be saved.");
      else if (action === "signout") window.location.assign("/login");
      else
        setMessage(
          action === "passkey"
            ? "Passkey saved. Verify it in a separate browser before disabling recovery sign-in."
            : "Other sessions revoked.",
        );
    } catch {
      setMessage(
        "The change could not be confirmed. Reconnect and review your account.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h1>Owner access</h1>
      <p>
        Add a passkey on this device. Keep a second passkey and your offline
        recovery instructions in a place you control.
      </p>
      <div className="project-links">
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => run("passkey")}
        >
          Add a passkey
        </button>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => run("others")}
        >
          Revoke other sessions
        </button>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => run("signout")}
        >
          Sign out
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
