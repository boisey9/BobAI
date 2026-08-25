# Bob Control Center Web

Responsive, owner-only administration and monitoring interface for Bob Core.

## Architecture

The web application is a client of the existing Bob Core backend. It does not own or duplicate project state.

```text
Browser
  -> signed owner session
Next.js server
  -> server-only scoped Bob Core credential
Bob Core
  -> Neon/Postgres
```

The browser never receives `BOB_CORE_DEVICE_TOKEN`. Dashboard pages are server-rendered with `cache: no-store`, and Bob Core remains authoritative for projects, decisions, tasks, approved memory, interface permissions, and activity.

## Control Center v2

V2 turns the dashboard into an owner command center while preserving Bob Core as the authority.

Current capabilities:

- owner password login with an HMAC-signed, HTTP-only session cookie;
- Core, Memory, Shared Context, and approval health cards;
- multi-project selector for projects visible to the scoped web credential;
- release gates separated into Build, Runtime, and Functional status;
- active tasks and authoritative decisions;
- owner approval inbox for AI-generated decision proposals;
- approve or reject a proposal without allowing an AI interface to activate decisions itself;
- connected-interface inventory with safe scope metadata;
- enable or revoke structured interface credentials;
- protection against disabling the Control Center's own credential;
- privacy-safe operational activity timeline;
- responsive desktop, tablet, and mobile layout;
- public web-service health endpoint at `/api/health`.

No credential hash or raw token is returned to the browser. Credential rotation still requires generating a fresh raw token in a trusted local environment and registering only its hash in Bob Core.

## Required Bob Core credential scopes

The server-side Control Center credential is project-bound to the project it administers and should have only:

```text
status:read
context:read
activity:read
control-center:read
decision:review
credentials:manage
```

The same raw credential remains server-only in Vercel. Do not use a `NEXT_PUBLIC_` variable.

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
3. **Functional:** project switching, approvals, credential controls, project state, and activity pass authenticated owner testing.

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
