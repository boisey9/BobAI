# Bob Control Center Owner Multi-Project v1 — 2026-09-03

## Objective

Allow the authenticated owner Control Center to see and explicitly switch between every Bob project registered to the same owner while preserving strict project binding for ordinary Bob interfaces.

## Production symptom

After RFQ Import #2 was accepted, Bob Core contained both `bobai` and `rfq`, but the production Control Center still showed:

- active project: BobAI;
- registered projects: 1;
- project selector: BobAI only.

The RFQ import itself was valid. The limitation came from the Control Center's server credential remaining project-bound to the BobAI project row.

## Design

Add one explicit owner-admin capability to structured interface credentials:

```text
control-center:owner
```

The capability does not make a credential owner-wide by itself. Bob Core removes project binding only when all of these are true:

1. credential metadata explicitly contains `ownerWide: true`;
2. trusted surface is `web`;
3. scopes include `control-center:owner`.

All other credentials remain bound to the project row where they are registered.

The existing owner Control Center credential remains stored under BobAI but can be upgraded in Bob Core metadata after the new Core release is deployed. Its raw token remains unchanged and server-only.

## Selected-project isolation

Owner-wide project listing does not mean mixed project data.

For every dashboard selection, the Web server explicitly sends the selected project key to:

- `/v1/context`;
- `/v1/activity`;
- `/v1/control-center`.

The selected project's approvals, interface credentials, release events, decisions, tasks, memories, and activity are therefore assembled independently.

Approval and credential mutations continue to carry the selected project in the owner-protected POST body. Bob Core still performs scope and project validation.

## Security boundaries preserved

- Codex, GitHub Copilot, Microsoft Copilot, ChatGPT, BobAI, and future external interfaces remain project-bound.
- `ownerWide: true` is ignored for non-`web` surfaces.
- `ownerWide: true` is ignored without `control-center:owner`.
- The browser never receives the Bob Core credential or its hash.
- The owner session remains HMAC-signed, HttpOnly, Secure in production, and SameSite Strict.
- Owner mutations still require the session-bound CSRF token.
- The owner credential still needs the normal operation-specific scopes such as `context:read`, `activity:read`, `control-center:read`, `decision:review`, and `credentials:manage`.
- No MCP capability is added to the owner credential.

## Code changes

- `Core/src/security/interface-credential.ts`
  - add `control-center:owner` scope;
  - recognize the explicit `ownerWide` web credential contract;
  - leave project binding unchanged for every other credential.
- `Core/tests/interface-credential.test.ts`
  - verify the owner-wide contract;
  - verify missing capability or non-web surface remains project-bound;
  - verify owner-wide Control Center requests can retain an explicitly selected project.
- `Web/lib/bob-core.ts`
  - make activity retrieval explicitly project-scoped so owner-wide access cannot mix activity between selected projects.
- `Web/README.md` and `docs/standards/bob-interface-standard-v1.md`
  - document the owner-only exception and acceptance requirements.

## Production credential migration

After Bob Core and Web deploy successfully, update only the existing server-side Control Center credential metadata:

```text
id: control-center-bobai
surface: web
ownerWide: true
add scope: control-center:owner
```

Do not rotate or print the raw token. Do not change any Codex/Copilot credential.

## Acceptance gates

1. Core typecheck/tests pass.
2. Web typecheck/build passes.
3. Bob Core and Control Center previews succeed.
4. Production deployments succeed after merge.
5. Existing Control Center credential metadata is upgraded without exposing the raw token.
6. Authenticated Control Center project selector shows both BobAI and MicroBird RFQ.
7. Selecting RFQ loads RFQ context/activity/admin state and does not show BobAI project data as RFQ data.
8. Selecting BobAI returns BobAI state normally.
9. RFQ Codex isolation test remains valid: `codex-rfq` cannot switch to `bobai`.

## Rollback

Remove `ownerWide` and `control-center:owner` from the Control Center credential metadata. The same credential immediately returns to project-bound BobAI behavior without token rotation. Code may remain deployed safely because the owner-wide behavior is opt-in.
