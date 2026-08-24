# Bob Control Center Web

Responsive, owner-only administration and monitoring interface for Bob Core.

## Architecture

The web application is a client of the existing Bob Core backend. It does not own or duplicate project state.

```text
Browser
  -> signed owner session
Next.js server
  -> server-only Bob Core bearer token
Bob Core
  -> Neon/Postgres
```

The browser never receives `BOB_CORE_DEVICE_TOKEN`. Dashboard pages are server-rendered with `cache: no-store`, and Bob Core remains authoritative for project decisions, tasks, memory, and activity.

## Current features

- owner password login with an HMAC-signed, HTTP-only session cookie;
- Core, Memory, Shared Context, and Activity health cards;
- selected project overview;
- active tasks and decisions;
- privacy-safe operational activity timeline;
- connected-interface last-seen summary;
- responsive desktop, tablet, and mobile layout;
- public web-service health endpoint at `/api/health`.

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

Never use a `NEXT_PUBLIC_` prefix for credentials.

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

Create a separate Vercel project for the same GitHub repository with:

- Root Directory: `Web`
- Framework: Next.js
- Node.js: 24
- Production Branch: `main`

Add all required environment variables as encrypted Vercel project variables. Use separate Preview values when appropriate. Do not reuse the existing `bob-core` Vercel project; Bob Core and the web interface are separate deployable clients with different root directories and security boundaries.

## Release acceptance

A release is complete only when all three gates pass:

1. **Build:** GitHub Actions and Vercel build succeed.
2. **Runtime:** `/api/health`, login, and server-side Bob Core calls respond correctly.
3. **Functional:** health cards, project state, and activity render correctly after authenticated login.

## Privacy

The Control Center shows operational outcomes, timestamps, sources, safe diagnostics, decisions, and tasks. It is not a chain-of-thought viewer. Raw prompts, private reasoning, credentials, and sensitive memories do not belong in the activity timeline.
