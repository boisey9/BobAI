"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function OwnerLogin({ passwordEnabled }: { passwordEnabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.passkey();
      if (result.error)
        setError(
          result.error.message ?? "Passkey sign-in could not be completed.",
        );
      else window.location.assign("/");
    } catch {
      setError("Sign-in is unavailable. Retry when connected.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-form">
      <button
        type="button"
        className="primary-button"
        disabled={busy}
        onClick={signIn}
      >
        {busy ? "Waiting for your passkey…" : "Sign in with a passkey"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {passwordEnabled && (
        <form action="/api/session" method="post" className="login-form">
          <label htmlFor="password">Setup or recovery password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <button type="submit" className="secondary-button">
            Continue setup or recovery
          </button>
        </form>
      )}
    </div>
  );
}
