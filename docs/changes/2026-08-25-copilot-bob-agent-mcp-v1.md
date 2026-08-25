# GitHub Copilot Bob Agent MCP v1

Date: 2026-08-25

## Objective

Make the repository-level **Bob** custom agent connect directly to Bob Core through the dedicated, project-bound Copilot credential so GitHub Copilot can read and safely synchronize the same BobAI project state used by the Control Center and other Bob interfaces.

The intended owner experience is:

```text
Open GitHub Copilot app
  -> select repository boisey9/BobAI
  -> select Bob
  -> talk or work normally
  -> Bob reads and writes safe project state through Bob Core
```

No VS Code dependency is required for the Copilot cloud-agent path.

## Architecture

```text
GitHub Copilot app / Copilot cloud agent
  -> repository custom agent: .github/agents/bob.agent.md
  -> Agents secret: COPILOT_MCP_BOB_CORE_TOKEN
  -> https://bob-core.vercel.app/mcp/sync
  -> dedicated credential: copilot-bobai
  -> Bob Core
  -> Neon project state
  -> Bob Control Center / future Bob interfaces
```

Bob Core remains authoritative. Copilot is a reasoning and execution interface, not a separate owner of Bob memory or state.

## Repository custom agent

The Bob agent profile embeds the remote MCP server under the server name `bob-core`.

The agent explicitly allows:

- repository read, search, edit, and command execution tools needed for engineering work;
- the repository-scoped GitHub MCP tools;
- `bob_get_context`;
- `bob_record_event`;
- `bob_create_task`;
- `bob_update_task`;
- `bob_propose_decision`.

The agent is user-invocable but is not automatically selected by model inference. Rick deliberately selects **Bob** when Bob Core continuity is wanted.

## Dedicated Copilot credential

Bob Core already contains the structured credential:

```text
Credential ID: copilot-bobai
Project:       bobai
Surface:       copilot
Enabled:       true
```

Scopes:

```text
mcp:context:read
mcp:sync
mcp:event:write
mcp:task:write
mcp:decision:propose
```

The raw token remains outside the repository and Bob Core database. It is stored locally on Rick's Mac at:

```text
~/.bob/copilot-token
```

Bob Core stores only its SHA-256 hash and non-secret metadata.

## One required owner configuration step

Add the raw token as a GitHub **Agents secret** for the BobAI repository.

GitHub repository path:

```text
boisey9/BobAI
  -> Settings
  -> Secrets and variables
  -> Agents
  -> Secrets
  -> New repository secret
```

Secret name:

```text
COPILOT_MCP_BOB_CORE_TOKEN
```

Copy the raw token to the Mac clipboard without displaying it:

```bash
cat ~/.bob/copilot-token | pbcopy
```

Paste the clipboard value into the secret field and save it. Do not add the word `Bearer`; the agent profile adds the bearer prefix in the Authorization header.

Only Agents secrets beginning with `COPILOT_MCP_` are available to MCP server configuration. Actions, Codespaces, and Dependabot secrets are separate and must not be used for this connection.

## Copilot app acceptance

1. Open the standalone GitHub Copilot app.
2. Select the `boisey9/BobAI` repository/project.
3. Open the agent picker or type `/agent`.
4. Select **Bob**.
5. Send the read-only acceptance prompt:

```text
Connect to Bob Core. Tell me the current BobAI project status, the highest-priority active tasks, and one active decision. Do not change anything yet.
```

Expected result:

- Bob calls `bob_get_context`;
- the response identifies Bob Core as the authority;
- it returns current BobAI tasks and decisions without requiring Rick to re-explain the project.

Then send the two-way task acceptance prompt:

```text
Create a normal-priority Bob Core task named "Copilot two-way sync test" with the description "Created from GitHub Copilot to verify Bob Core synchronization." Record a concise acceptance event after the task is created.
```

Expected result:

- `bob_create_task` succeeds;
- `bob_record_event` succeeds;
- the task appears in Bob Control Center;
- Copilot activity appears with source `copilot`;
- another Bob interface can retrieve the same task.

Finally send the decision-boundary prompt:

```text
Propose this decision to Bob Core: "Copilot acceptance proves Bob Core two-way synchronization." Reason: "The same task and activity became visible through the shared Core." Do not claim the decision is active.
```

Expected result:

- `bob_propose_decision` succeeds;
- no active decision is created directly;
- a pending owner-review item appears in Bob Control Center;
- Rick can approve or reject it from the owner approval inbox.

## Acceptance gates

### Connection gate

- Bob custom agent is visible in the app;
- MCP server starts;
- five Bob Core tools are available;
- `bob_get_context` succeeds.

### Two-way task gate

- Copilot-created task persists in Bob Core;
- Control Center displays the task;
- activity source is `copilot`;
- the task is visible from another Bob interface.

### Owner decision gate

- Copilot can propose a decision;
- the proposal remains pending;
- only the Control Center owner action can activate or reject it.

## Security boundaries

- The raw token is never committed.
- The token is stored as a GitHub Agents secret and masked in Copilot cloud-agent logs.
- The credential is restricted to project `bobai` and surface `copilot`.
- Copilot cannot directly write persistent memory.
- Copilot cannot activate, supersede, or revoke decisions.
- Copilot cannot delete or cancel tasks.
- The MCP tools do not grant database, email, deployment, or arbitrary Bob Core administration access.
- Every write uses a stable unique `operationId` for safe retries.
- Activity stores operational outcomes, not raw prompts or private reasoning.

## Failure diagnosis

### Bob agent is missing

Confirm `.github/agents/bob.agent.md` is present on the repository default branch, then refresh the repository selection and agent picker.

### Bob Core tools are missing

Confirm the Agents secret exists with the exact name:

```text
COPILOT_MCP_BOB_CORE_TOKEN
```

Confirm it is an **Agents** secret, not an Actions secret.

### Authentication fails

Re-copy the local raw token:

```bash
cat ~/.bob/copilot-token | pbcopy
```

Replace the Agents secret value. Do not paste the token into issues, commits, chat transcripts, or logs.

### `bob_get_context` works but writes do not

Verify the Control Center still shows `copilot-bobai` enabled with all five MCP scopes. Do not generate a new credential unless the stored raw token is lost or explicitly revoked.

## Rollback

Remove the embedded `mcp-servers` block from `.github/agents/bob.agent.md` or disable `copilot-bobai` in Bob Control Center. Removing the GitHub Agents secret also prevents future authenticated MCP sessions. Existing Bob Core tasks, decisions, and activity remain intact.

## Official GitHub references

- GitHub Copilot app supports custom MCP servers from app settings and can use MCP configurations associated with repositories or Copilot CLI.
- Repository custom agents can embed MCP server definitions in YAML frontmatter.
- MCP headers can reference GitHub Agents secrets using the `${{ secrets.COPILOT_MCP_* }}` syntax.
- Repository-level Agents secrets are configured under `Settings -> Secrets and variables -> Agents`.
