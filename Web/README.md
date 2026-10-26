# Bob Control Center Web

Responsive, owner-only administration and monitoring interface for Bob Core.

The repository includes workspace chat, context freshness, Better Auth owner passkeys/sessions, and project-scoped OAuth consent behind explicit configuration gates. Legacy password/HMAC authentication remains available when Better Auth is disabled. Source availability does not establish the deployed configuration or operational acceptance. See [deployment and offline owner recovery](../docs/deployment.md) and [release acceptance](../docs/release-gates.md).

The local [2026-10-26 authentication/session/consent reconciliation](../docs/changes/2026-10-26-web-auth-session-consent-reconciliation.md) adds private authentication error handling, explicit optional `handoffs:write` consent, and owner consistency proofs for later task/project/checkpoint interfaces. It preserves database-backed session revocation, guarded workflow integration, existing password gates, and server-only Core credentials. Proofs are not authentication grants. No credentials, settings, migrations, or deployments were activated by this work; live acceptance remains separate.

The successor [task/context/project reconciliation](../docs/changes/2026-10-26-web-task-context-project-reconciliation.md) consumes the task and project proofs in owner-authenticated, CSRF-protected routes. It adds task capture/edit/completion with current-version checks and receipt recovery, project creation through Core's existing Personal anchor contract, and honest source status for context, decisions, memory, handoffs and activity. The existing governed-workspace entry gate still takes precedence. These are local source changes, not deployed acceptance.

Pending task and project requests retain synthetic or owner-entered content in this tab's `sessionStorage` until a receipt or definitive rejection is confirmed. Retries preserve the operation ID and payload; a historical receipt is followed by a fresh task read before editing. Recovery is bound to the same owner/Core/project connection and does not grant access. Closing the tab, clearing storage, or changing that connection may require manual reconciliation; session storage is not a durable backup or a new memory authority. Owner-reviewed checkpoint import remains a separate reconciliation slice.

## Architecture

The web application is a client of the existing Bob Core backend. It does not own or duplicate project state.

```text
Browser
  -> signed owner session
  -> session-bound signed owner-action token
Next.js server
  -> server-only owner Control Center credential
Bob Core
  -> Neon/Postgres
```

The browser never receives `BOB_CORE_DEVICE_TOKEN`. Dashboard pages are server-rendered with `cache: no-store`, and Bob Core remains authoritative for projects, decisions, tasks, approved memory, interface permissions, and activity.

## Control Center v2

V2 turns the dashboard into an owner command center while preserving Bob Core as the authority.

Current capabilities:

- owner passkey/database sessions behind the existing gate, with legacy password/HMAC login only when Better Auth is disabled;
- session-bound signed CSRF protection for approval and credential mutation forms;
- Core, Memory, Shared Context, and approval health cards;
- owner-wide project selector for Bob projects registered to the same owner;
- project-scoped context, activity, approvals, release events, and interface inventory after a project is selected;
- bounded implementation activity with release acceptance explicitly unverified;
- explicit task reads, capture, versioned edits and completion; proposals remain separate from active decisions;
- owner project creation without granting iPhone or AI interfaces new project access;
- source freshness, availability, truncation and context revision, with bounded Today suggestions;
- owner approval inbox for AI-generated decision proposals;
- approve or reject a proposal without allowing an AI interface to activate decisions itself;
- connected-interface inventory with safe scope metadata;
- enable or revoke structured interface credentials;
- protection against disabling the Control Center's own credential;
- privacy-safe operational activity timeline;
- responsive desktop, tablet, and mobile layout;
- public web-service health endpoint at `/api/health`.

No credential hash or raw token is returned to the browser. Credential rotation still requires generating a fresh raw token in a trusted local environment and registering only its hash in Bob Core.

## Owner action protection

Sensitive owner POST actions do not depend on Safari/Vercel `Origin`, `Host`, forwarded-host, or Fetch Metadata heuristics.

After validating the signed owner session, the server derives a dedicated HMAC owner-action token from that session and `BOB_CONTROL_CENTER_SESSION_SECRET`. The dashboard embeds that token in authenticated approval and credential forms. Mutation routes require the same active session plus a constant-time token match before they call Bob Core.

The session cookie remains `HttpOnly`, `SameSite=Strict`, and `Secure` in production. The owner-action token is not a Bob Core credential, is not persisted in Neon, and grants no authority by itself without the matching owner session.

## Owner-wide credential boundary

Normal Bob interface credentials remain project-bound. Codex, GitHub Copilot, Microsoft Copilot, ChatGPT, BobAI, and future project clients cannot silently switch to another project.

The server-side Control Center credential is the deliberate owner-admin exception. It may be marked `ownerWide: true` only when:

- its trusted surface is `web`;
- it carries the dedicated `control-center:owner` capability;
- it also carries the ordinary scopes required for the operation.

Bob Core then leaves the project selector under explicit owner control instead of binding the request back to the project row where the credential is stored. Context, activity, approvals, credentials, and release data remain scoped to the selected project on each request.

An `ownerWide` flag without `control-center:owner`, or on any non-web surface, remains project-bound.

## Required Bob Core credential scopes

The owner Control Center credential should have only:

```text
status:read
context:read
activity:read
control-center:read
control-center:owner
decision:review
credentials:manage
```

The same raw credential remains server-only in Vercel. Do not use a `NEXT_PUBLIC_` variable.

In the existing Core gateway, a verified owner-wide `web` credential carrying `control-center:owner` may perform task writes and project creation. Ordinary project credentials still need their own `tasks:write` scope and cannot create projects. Task reads require `context:read`. Listing source requirements does not authorize changing an existing credential; this reconciliation changes none.

## Environment variables

Copy `.env.example` to `.env.local` and replace every placeholder.

```bash
cp .env.example .env.local
```

Required variables:

- `BOB_CORE_BASE_URL`
- `BOB_CORE_DEVICE_TOKEN`
- `BOB_CONTROL_CENTER_OWNER_PASSWORD`
- `BOB_CONTROL_CENTER_SESSION_SECRET`
- `BOB_CONTROL_CENTER_DEFAULT_PROJECT`

Generate a session secret locally:

```bash
openssl rand -base64 48
```

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Validation:

```bash
npm run check
```

## Vercel deployment

Use a separate Vercel project for the same GitHub repository:

- Root Directory: `Web`
- Framework: Next.js
- Node.js: 24
- Production Branch: `main`

Add all required environment variables as encrypted Vercel project variables. Use separate Preview values when appropriate. Do not reuse the `bob-core` Vercel project; Bob Core and the web interface are separate deployable clients with different security boundaries.

## Release acceptance

A release is complete only when all three gates pass independently:

1. **Build:** GitHub Actions and Vercel build succeed.
2. **Runtime:** `/api/health`, login, and server-side Bob Core calls respond correctly.
3. **Functional:** the owner sees all registered projects, switching to another project loads only that project's context/activity/admin state, approvals and credential controls operate on the selected project, and normal project-bound interface isolation remains intact.

## Privacy and safety

The Control Center shows operational outcomes, timestamps, sources, safe diagnostics, decisions, tasks, and non-secret permission metadata. It is not a chain-of-thought viewer.

The following never belong in UI payloads or activity:

- raw interface tokens;
- token hashes;
- provider keys or database URLs;
- private reasoning;
- raw prompts by default;
- sensitive memory content.

Decision proposals remain pending until the owner approves them. External AI interfaces cannot directly activate decisions, write memory, or bypass project-bound permissions.
