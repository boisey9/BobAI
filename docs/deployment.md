# Deployment and recovery

## Environments and release order

Personal production, isolated staging, and the future company instance must have different databases, authentication secrets, credentials, and integration registrations. Keep SwiftUI, Hono, Next.js, Vercel, and Neon. The current development branch is `codex/daily-continuity`; its automatic Vercel Git deployments are disabled pending verified branch-specific staging configuration. Other branches retain their existing deployment behavior. [Vercel branch deployment configuration](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled).

1. Review migrations `003_durable_continuity.sql` and `004_owner_auth.sql` in a PR.
2. Use an isolated Neon branch. Apply 003 before running new Core; apply 004 only in the auth database used by Web. Neither migration runs automatically at application startup.
3. Configure staging Core and Web with isolated credentials. Confirm Web's Core URL and credential point to the same isolated instance. Keep auth disabled initially.
4. Pass Core tests, Web build, actual PostgreSQL concurrency/isolation checks, and browser acceptance. Full iOS build/runtime acceptance runs in macOS CI; a physical iPhone remains a separate gate.
5. Establish the permanent Web HTTPS hostname before creating real passkeys. Configure the sole owner email privately, a distinct auth secret, and a separate auth database URL secret. Bootstrap through the offline operator command.
6. Temporarily enable setup password login. Enroll and verify two passkeys, revoke a session in another browser, exercise offline recovery, and verify approvals/credential controls again. Disable setup password login.
7. Complete OAuth/device/backup acceptance before rotating or removing compatibility credentials. The primary Core token remains unchanged in this release.
8. Apply approved additive migrations, deploy Core first, verify capabilities, then deploy Web/iPhone. Mark build, runtime, and functional evidence independently in Bob Core and the change record.

## Configuration

Existing Core settings are documented in `Core/.env.example`; Web settings are in `Web/.env.example`. Never prefix a Core credential or auth configuration secret with `NEXT_PUBLIC_`.

| New Web variable | Purpose |
| --- | --- |
| `BOB_AUTH_ENABLED` | Enables database-backed owner auth; default false |
| `BOB_AUTH_BASE_URL` | Permanent HTTPS Web origin; localhost only in development |
| `BOB_AUTH_OWNER_EMAIL` | Sole owner identity, supplied through secure deployment configuration |
| `BOB_AUTH_SECRET` | Independent random secret, at least 32 characters |
| `BOB_AUTH_DATABASE_URL` | Auth database connection, isolated in staging |
| `BOB_AUTH_PASSWORD_LOGIN_ENABLED` | Temporary bootstrap/recovery access; default false |

Better Auth tables are prefixed `bob_auth_`. The existing Core data owner ID is not replaced by the authentication user ID. Web authenticates the configured owner and uses its existing server-only owner Core credential.

## Operator commands

After `npm ci` in Core and Web, run from `Web/` with the required auth variables injected from a secure environment:

```sh
node --import ../Core/node_modules/tsx/dist/loader.mjs scripts/owner-access.ts --mode=schema --output=/absolute/path/review-auth.sql
node --import ../Core/node_modules/tsx/dist/loader.mjs scripts/owner-access.ts --mode=bootstrap --output=/private/offline-location/bob-owner-setup.txt
```

Schema mode produces SQL for review and never applies it. The committed 004 migration additionally enforces the single-owner constraint; preserve that constraint when reviewing later generated schema changes. Bootstrap refuses an existing owner and requires an output file outside the repository. Never paste its private output into a chat, issue, build log, or commit.

For loss of passkeys, access the database through the owner's independent secure account, load the auth configuration, and run:

```sh
node --import ../Core/node_modules/tsx/dist/loader.mjs scripts/owner-access.ts --mode=recover --output=/private/offline-location/bob-owner-recovery.txt --revoke-existing-sessions
```

This replaces the temporary password hash and revokes owner sessions. Temporarily enable password sign-in on the canonical Web deployment, enroll and independently verify a new passkey, then disable password sign-in. Remove lost-device passkeys through the authenticated Better Auth API during the recovery review. Revoke affected Core/device/OAuth credentials separately; owner session revocation is not credential rotation.

## Verification commands

```sh
cd Core
npm ci
npm run check
# Supply only an isolated test connection and branch ID through environment:
node --import tsx scripts/check-continuity-postgres.mjs
cd ../Web
npm ci
npm run check
node --import ../Core/node_modules/tsx/dist/loader.mjs scripts/check-owner-auth-postgres.ts
```

The auth acceptance fixture requires the synthetic owner `owner@bob.example` and the explicit isolated acceptance branch. Run `Core/scripts/serve-continuity-preview.mjs` for a fresh synthetic Core owner and pending approval. Point local Web at that server with auth enabled and the synthetic auth owner. Set `BOB_E2E_BASE_URL=http://localhost:3418`, optionally `BOB_E2E_CHROME_PATH`, and run `npm run test:browser`. A fresh Core fixture is required for each approval acceptance run. No live owner account or production URL is allowed by the browser fixture.

## Backup and disaster restoration gate

Nightly encrypted logical backups are still to be implemented. Acceptance requires a private object-store destination, thirty-day lifecycle policy, encryption before upload using only a recovery public key in the deployment, independent offline decryption-key custody, and a monitored last-success record. Never treat a database branch or a project-selective export as proof of this requirement.

The restoration drill must download and authenticate an encrypted artifact, decrypt on an isolated operator machine, restore into an empty destination, compare record counts and foreign-key relationships, rotate restored access credentials, then exercise owner login, context, task mutation/replay, approvals and revocation. Record backup age, data-loss interval, restoration duration, artifact identifier, and test results. RPO 24 hours/RTO two hours are unproven until that drill succeeds.

## Rollback

Keep the prior Core/Web deployment and a pre-migration backup. The new schema is additive: roll back application code first and leave new tables/columns intact while assessing the incident. Do not drop receipts, handoffs, auth data, or versions to undo a release. Once legacy access is retired, never roll back to a build that silently re-enables it; use the offline recovery path or a reviewed forward fix. Company cutover requires a separate export manifest, isolated import evidence, new credentials and a documented return to the personal instance.
