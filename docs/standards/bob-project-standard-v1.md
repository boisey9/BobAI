# Bob Project Standard v1

## Purpose

Every software or SaaS project connected to Bob uses the same separation of responsibilities so Bob Core can preserve project state across interfaces without turning the repository into a giant prompt.

## Authority model

- **User request**: current intent and highest-priority direction.
- **Bob Core**: authoritative active project state, decisions, tasks, approved memory, and cross-interface events.
- **Repository**: authoritative implementation, schemas, tests, dependencies, and deployment configuration.
- **Project documentation**: durable product, architecture, security, deployment, and decision rationale.
- **AI interface / developer agent**: replaceable execution surface. It must retrieve context rather than inventing project state.

## Required repository structure

```text
Project/
├── README.md
├── AGENTS.md
├── implementation.md
├── .bob/
│   └── project.yml
├── .codex/
│   └── config.toml             # when Codex is used
├── docs/
│   ├── product.md
│   ├── architecture.md
│   ├── security.md
│   ├── deployment.md
│   ├── standards/
│   ├── adr/
│   ├── changes/
│   └── archive/
├── src/                        # framework-specific implementation
├── tests/
└── .github/workflows/
```

Projects may add framework-specific directories, but the control documents above keep the same meaning.

## `.bob/project.yml`

The project manifest is small, stable, and contains no secrets. It identifies the Bob Core project key, repository, source-of-truth mapping, runtime providers, interfaces, and standards. Current tasks, decisions, and memories do **not** belong in this file; they belong in Bob Core.

## `AGENTS.md`

`AGENTS.md` is the executable agent contract, not project history. Keep it concise. It tells development agents to:

1. retrieve Bob Core context before substantial work;
2. inspect actual repository files;
3. follow the required engineering workflow;
4. honor security boundaries;
5. validate before claiming completion;
6. update the implementation audit trail.

Detailed policy belongs in `docs/standards/` and should be referenced rather than duplicated.

## Core project documentation

- `docs/product.md`: users, roles, workflows, business rules, UX intent, scope.
- `docs/architecture.md`: systems, data flow, APIs, integrations, important technical boundaries.
- `docs/security.md`: authentication, authorization, sensitive data, secrets, validation, logging, abuse cases, audit rules.
- `docs/deployment.md`: environments, providers, environment-variable names, migrations, deploy/verify/rollback process.
- `docs/adr/`: detailed rationale for durable architectural decisions.
- `docs/changes/`: one record per meaningful implementation change.
- `docs/archive/`: superseded or historical material that should not be loaded by default.

## `implementation.md`

`implementation.md` is a compact current-state index, not an endless transcript. It should summarize:

- current release and architecture;
- recently completed work;
- known bugs and risks;
- open technical questions;
- next recommended tasks;
- links to detailed `docs/changes/` records.

Detailed historical entries should periodically move to `docs/archive/`.

## Standard work packet

Bob converts a user request into eight execution concerns. The user does not need to manually write these sections every time.

1. **Objective** — business/user outcome.
2. **Scope** — what changes and what explicitly does not.
3. **Current state** — Bob Core context plus verified repository inspection.
4. **Design** — UX, data, API/schema, and component implications.
5. **Security** — auth, permissions, sensitive data, validation, logging, abuse risks.
6. **Implementation** — smallest safe change on a feature/fix branch.
7. **Validation** — tests, type checks, build, preview/runtime, and acceptance criteria.
8. **Close the loop** — docs, PR/deployment result, Bob Core tasks/events/decisions.

## Deployment gates

A release is not complete because a build is green. Report the three gates independently:

1. **Build** — compilation and deployment completed.
2. **Runtime** — deployed endpoints/processes respond correctly and runtime diagnostics are healthy.
3. **Functional** — the requested user workflow passes acceptance testing.

An observability permission failure must be reported separately from application failure.

## Branch and change discipline

- Meaningful work uses a feature/fix branch and pull request.
- Inspect before editing.
- Prefer small reversible changes.
- Never silently alter production data or schema without the appropriate gated workflow.
- Never commit credentials.
- Update Bob Core project state after meaningful completed work once audited write tools are available.
