# BobAI First Imported Bob Project Review

Date: 2026-08-27

## Objective

Review whether BobAI is legitimately the first project imported into Bob Core and define the designation without confusing repository implementation truth with Bob Core project-state authority.

## Evidence reviewed

- The owner Control Center reports exactly one registered Bob project.
- That registered project is `BobAI` with project key `bobai` and repository `boisey9/BobAI`.
- BobAI already has durable Bob Core project state: decisions, tasks, events, interface credentials, approved project memory, and shared context are attached to the BobAI project.
- BobAI has already passed Bootstrap Import v1 production data acceptance, including curated project memories and the idempotent `project.imported` event.
- `.bob/project.yml` declares project key `bobai`, name `BobAI`, active status, repository `boisey9/BobAI`, and Bob Core as the source of truth for project state, active decisions, active tasks, and approved memory.
- Codex has retrieved BobAI context from Bob Core without the owner restating the project, proving the shared-context side of the import contract.
- Structured project-bound credentials exist for connected external interfaces, and Bob Core rejects silent project switching.
- No second Bob Core project has yet been registered through the owner Control Center.

## Conclusion

BobAI is officially the first and currently only imported Bob project.

It is therefore **Bob Import #1** and the reference implementation for the Bob Project Standard. Future project imports should be validated against BobAI's authority boundaries and import acceptance contract rather than by copying project history into prompts.

This designation does not move project authority into the repository. Bob Core remains authoritative for registered project identity and operational state; the repository remains authoritative for implementation and technical configuration.

## Formal import identity

BobAI's `.bob/project.yml` now records:

```yaml
import:
  status: imported
  sequence: 1
  imported_at: 2026-08-27
  reference_project: true
```

The import sequence is a stable owner-assigned ordering, not a database primary key. BobAI keeps sequence `1` permanently. A future imported project receives the next sequence only after it satisfies the import contract.

## Import baseline for future projects

A future project is considered fully imported only when it has:

1. a unique active Bob Core project registration and stable project key;
2. a repository `.bob/project.yml` aligned to the Bob Project Standard;
3. matching repository/Bob Core project identity and source-of-truth boundaries;
4. project-bound decisions, tasks, events, and approved memory/context where applicable;
5. explicit interface permissions scoped to that project;
6. owner-visible project state in Control Center;
7. proof that at least one interface can retrieve project context from Bob Core without the owner re-explaining it;
8. proof that an interface cannot silently retrieve or mutate another Bob project.

BobAI is **Import #1** and the reference project for this baseline.
