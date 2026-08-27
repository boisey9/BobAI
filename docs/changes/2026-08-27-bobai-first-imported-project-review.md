# BobAI First Imported Bob Project Review

Date: 2026-08-27

## Objective

Review whether BobAI is legitimately the first project imported into Bob Core and define the designation without confusing repository implementation truth with Bob Core project-state authority.

## Evidence reviewed

- The owner Control Center reports exactly one registered Bob project.
- That registered project is `BobAI` with project key `bobai` and repository `boisey9/BobAI`.
- BobAI already has durable Bob Core project state: decisions, tasks, events, interface credentials, and shared context are attached to the BobAI project.
- `.bob/project.yml` declares project key `bobai`, name `BobAI`, active status, repository `boisey9/BobAI`, and Bob Core as the source of truth for project state, active decisions, active tasks, and approved memory.
- No second Bob Core project has yet been registered through the owner Control Center.

## Conclusion

BobAI is the first and currently only registered/imported Bob project. It is therefore the reference implementation for the Bob Project Standard and the baseline project against which future imports should be validated.

This designation does not move project authority into the repository. Bob Core remains authoritative for the registered project identity and operational state; the repository remains authoritative for implementation and technical configuration.

## Import baseline for future projects

A future project should not be considered fully imported until it has:

1. a unique Bob Core project registration;
2. a repository/project manifest aligned to the Bob Project Standard;
3. project-bound decisions, tasks, events, and approved memory/context where applicable;
4. explicit interface permissions scoped to that project;
5. owner-visible project state in Control Center;
6. proof that an interface cannot silently cross into another Bob project.

BobAI is **Import #1** for this baseline.
