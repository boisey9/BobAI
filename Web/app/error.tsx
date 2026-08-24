"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Bob Control Center render failed", error.name);
  }, [error]);

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-copy">
          <p className="eyebrow">Control Center error</p>
          <h1>Bob’s dashboard could not render.</h1>
          <p>
            No project state was changed. Retry the request or verify the web
            application environment variables.
          </p>
        </div>
        <button className="primary-button" type="button" onClick={reset}>
          Retry
        </button>
      </section>
    </main>
  );
}
