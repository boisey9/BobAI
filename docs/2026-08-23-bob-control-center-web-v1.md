# Bob Control Center Web v1

Date: 2026-08-23

## Objective

Create the primary desktop administration and monitoring interface for Bob while preserving Bob Core as the single backend and source of authoritative project state.

## Product boundary

- **Bob Core:** identity, memory, projects, decisions, tasks, activity, permissions, and tool orchestration.
- **Web Control Center:** owner administration, monitoring, project visibility, and future approvals.
- **BobAI iOS:** voice, quick status, notifications, and mobile approvals.
- **Codex / ChatGPT:** AI interfaces connected to the same Core.

The web application is not a second Bob database and does not connect directly to Neon.

## Implementation

A new `Web/` Next.js App Router application was added to the existing repository as an independently deployable Vercel project.

### Owner authentication

- Password is verified only on the server.
- A short-lived signed session is stored in an HTTP-only, secure, same-site cookie.
- The session contains no Bob Core credential.
- The login route does not accept a redirect destination, preventing open-redirect behavior.

### Bob Core access

- All Bob Core calls execute on the Next.js server.
- `BOB_CORE_DEVICE_TOKEN` is read only from the server environment.
- The token is never serialized into page props or client JavaScript.
- Requests use `cache: no-store` and a bounded timeout.
- The web surface is recorded as `web` in Bob Core context activity.

### Dashboard

- Core, Memory, Shared Context, and Activity health cards.
- Active project overview and source-of-truth status.
- Active task and decision panels.
- Cross-project operational activity timeline.
- Connected-interface last-seen panel.
- Explicit privacy statement separating operational events from private reasoning.
- Responsive layout for desktop, tablet, and mobile browsers.

## Security considerations

- No credential has a `NEXT_PUBLIC_` prefix.
- No direct browser-to-Bob-Core request is implemented.
- Security headers disable framing, MIME sniffing, camera, microphone, and geolocation access.
- The dashboard is dynamically rendered and protected by an owner session.
- Error messages expose safe Core request IDs when available but not upstream credentials.
- Activity detail rendering uses a small allowlist rather than rendering arbitrary event metadata.

## Deployment model

The web app requires a new Vercel project rooted at `Web/`. It must not replace the existing Bob Core project rooted at `Core/`.

```text
Vercel project: bob-core
Root: Core/
Purpose: API + MCP + memory/project orchestration

Vercel project: bob-control-center
Root: Web/
Purpose: owner-only responsive administration UI
```

## Validation plan

- Web TypeScript strict check.
- Next.js production build.
- Bob Core full check after adding the `web` context surface.
- Owner login and invalid-login behavior.
- Public `/api/health` runtime probe.
- Authenticated dashboard runtime verification.
- Confirm no Bob Core token appears in generated client assets or HTML.
- Responsive browser verification at desktop and phone widths.

## Next steps

1. Add a Bob Core projects-list endpoint and multi-project switcher.
2. Add audited task and decision write tools with explicit confirmation.
3. Add deployment health adapters for Vercel and GitHub.
4. Add owner approval queue for sensitive actions.
5. Add per-client revocable credentials before broader use.
