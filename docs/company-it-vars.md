# Company pilot: IT/VARS review package

Status: preparation only. No company mailbox is connected and no company authorization is inferred from personal Bob access.

The initial pilot is single-user and separately funded. IT/VARS must approve the tenant, application registration, identity policy, endpoints, permissions, model providers, retention, logging, and revocation before any Microsoft source is connected.

| Review item | Proposed boundary / required decision |
| --- | --- |
| Infrastructure | Separate company repository from a reviewed release; independent Core, Web, PostgreSQL, authentication, secrets, object storage and billing |
| Identity | Company Entra sign-in after tenant approval; single-user allowlist for the pilot; revocable sessions and separate app/client registrations |
| Endpoints | Company Web origin, Core REST/MCP resource origin, OAuth authorization/token/JWKS/discovery endpoints, approved webhook callback URLs; actual hostnames supplied in the deployment manifest |
| Microsoft sources | Approved sources read-only first, scoped to the pilot user and the minimum selected data; request exact Graph delegated/application permissions only after the required source workflow is specified |
| External changes | Disabled until owner-review, source revalidation, idempotency and audit workflow pass; no email sending authorization in this package |
| Data destinations | Company database/backups plus explicitly approved model provider endpoint; no personal deployment, Apple sources, personal memories, or personal chat archive |
| Models | Existing replaceable provider boundary retained; IT chooses approved providers, geography/contract terms and allowed data classes before activation |
| Retention | Full conversation persistence off; approved records retained under company policy; proposed encrypted backup retention thirty days, subject to IT approval |
| Logging | IDs, source, timestamps, outcome and safe diagnostics only; no raw prompts, calendar/mail content, tokens or sensitive memory |
| Revocation | Disable company user, sessions, project grants, App installation/Graph consent, provider access and signing credentials independently; test loss of company access while personal Bob remains usable |

The migration manifest selects exact projects and enumerates records, provenance, IDs, relationships, format version, content hash and destination. Exclude all credentials/authentication tables, credential-bearing metadata, Personal records and unrelated fixtures. Owner review precedes export. An isolated destination must prove counts/relationships and client reconnection with new credentials before controlled cutover. Keep rollback to the prior instance available. Personal ChatGPT/Codex conversation history is not a migration dependency.
