# Local private-test preparation

`synthetic-testing-manifest.json` is deliberately incomplete and inactive. Never use it to infer live setup approval. All targets, accepted policy values and cost authority remain unset.

Run PostgreSQL acceptance using existing installed binaries (no installer):

```
env -i PATH=/usr/local/bin:/usr/bin:/bin node Core/scripts/run-isolated-workflow-postgres.mjs --pg-bin=/absolute/installed/postgres/bin
```

The runner prints its owned temporary validation path; fixtures contain only synthetic data. It preserves data/receipts and stops the cluster normally. An external kill/power failure can leave an uncertain process: inspect the retained SYNTHETIC-ONLY marker and exact owned path before stopping it; do not kill other PostgreSQL processes or blindly rerun mutations.

Migration order: workflow001 then002, then workflow grant-version002; auth proof-store001 on the explicitly selected auth target. Base project/memory/auth schemas must already be verified on the empty isolated test target. Source migration digests are recorded; do not run these on shared/live targets from this plan.

Before any owner-data storage: prove restricted role backup coverage across public/bob_workflow/bob_owner_delegation, complete encrypted snapshot/restore plus role/config custody, revoke copied authority, reconcile durable receipts and preserve immutable approvals/policy/history. Existing public-only backup role is insufficient without a reviewed new-schema/RLS strategy.

Rollback: disable new writes/feature routes, keep receipt reads available through an approved authenticated path, reconcile uncertain operations, revert compatible Core/Web pair while retaining tables/history. Populated down migrations deliberately refuse destruction. No deletion or automatic rollback SQL is provided.

Hosted acceptance remains a later exact environment approval. No URLs, credentials, live flag changes, runtime producer, external dispatch or actual provider configuration exists here.
