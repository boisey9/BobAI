import { redirect } from "next/navigation";
import { BobMark } from "@/components/bob-mark";
import { hasOwnerSession } from "@/lib/session";
import { ownerAuthEnabled, ownerPasswordLoginEnabled } from "@/lib/owner-auth";
import { OwnerLogin } from "@/components/owner-login";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (await hasOwnerSession()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="login-page">
      <section className="login-card">
        <BobMark />
        <div className="login-copy">
          <p className="eyebrow">Owner access</p>
          <h1>One place to understand what Bob is doing.</h1>
          <p>
            Review Core health, project state, decisions, tasks, and
            privacy-safe operational activity across every connected interface.
          </p>
        </div>

        {error === "invalid" && <p className="form-error" role="alert">That password was not accepted.</p>}
        {ownerAuthEnabled() ? (
          <OwnerLogin passwordEnabled={ownerPasswordLoginEnabled()} />
        ) : (
          <form action="/api/session" method="post" className="login-form">
            <label htmlFor="password">Control Center password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
            <button type="submit" className="primary-button">
              Open Control Center
            </button>
          </form>
        )}

        <div className="privacy-note">
          <span aria-hidden="true">◉</span>
          <p>
            The browser never receives the Bob Core bearer token. Authentication
            and Core requests remain on the server.
          </p>
        </div>
      </section>
      <div className="login-orbit" aria-hidden="true" />
    </main>
  );
}
