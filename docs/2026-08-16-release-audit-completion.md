# BobAI Release Audit Completion

Date: 2026-08-16
Scope: Memory v0.1, Bob Core visual identity, physical-iPhone interaction defects, and release automation

## Audit objective

Validate the merged implementation as a release rather than relying on PR descriptions. Close every concrete gap found in source control and physical-device feedback, add repeatable validation, and distinguish automated proof from owner-only production credentials and Apple signing.

## Findings closed

- Installed the production 1024 x 1024 opaque AppIcon instead of leaving only an SVG concept.
- Added the matching Bob Core launch artwork and launch storyboard.
- Added deterministic SVG-to-PNG generation and dependency-free release-asset validation.
- Hardened PNG validation so a grayscale, RGB, or indexed app icon carrying a hidden `tRNS` transparency chunk is rejected.
- Added focused regression tests for opaque RGB and `tRNS`-bearing RGB icons.
- Routed Bob's spoken replies through an explicit iOS voice-prompt playback session.
- Protected synthesized-speech state from stale delegate callbacks and exposed playback failures.
- Added automatic voice sending after a short pause and immediate sending from a second Core tap.
- Added keyboard focus management, a keyboard Done control, and tap/scroll/state-based dismissal.
- Wired the completion state to the real speech lifecycle.
- Prevented Core interaction while Bob is thinking.
- Added Reduce Motion behavior and fuller accessibility labels.
- Updated microphone permission code to the current iOS API.
- Corrected Bob's server instructions so he knows the iPhone reads successful replies aloud.
- Exposed safe provider error codes and Bob Core request IDs in the iPhone alert.
- Added Z.AI business-code classification and retryable fallback between `glm-4.7-flash` and `glm-4.5-flash`.
- Kept authentication, permission, policy, invalid-request, and exhausted-quota failures visible rather than hiding them behind fallback.
- Added a real provider reply probe to Bob Core settings.
- Exposed provider, model, and memory status in the connection result.
- Added deterministic backend dependency installation with `npm ci`.
- Added permanent iOS asset tests, Debug build, compiled-resource checks, simulator launch/survival test, screenshot artifact, and Release build CI.
- Added a Vercel ignored-build rule so iPhone-only and documentation commits do not consume Bob Core preview deployments.
- Resolved the only inline review finding and marked its thread complete.

## Memory validation

- The dedicated Neon project contains both required Memory v0.1 tables.
- The migration has been applied to the main database branch.
- The store uses parameterized queries, per-owner filtering, duplicate prevention, soft deletion, and audit events.
- Automatic model context includes only normal-sensitivity search matches.
- Ordinary conversations are not automatically persisted.
- Raw history import, concise approved memory, and executable skills remain separate layers.

## Security validation

- Provider keys and `DATABASE_URL` remain server-only.
- The iPhone stores only the Bob Core device token in Keychain.
- High-risk credential and identity formats are rejected by memory policy.
- Message and memory content are excluded from structured server logs.
- Authenticated memory routes remain behind the existing device bearer token.
- Provider failures expose sanitized codes and request identifiers without returning private upstream error details.
- No signing material, provisioning profile, API key, database URL, device token, or personal data is committed.

## Automated acceptance

- Bob Core TypeScript checking passed.
- The complete Bob Core automated test suite passed.
- Release-asset validator regression tests passed.
- The committed production assets passed structural validation.
- iOS Debug compilation passed.
- Compiled AppIcon, asset catalog, and launch storyboard checks passed.
- The simulator installed and launched BobAI and the process survived the smoke period.
- The simulator screenshot artifact was downloaded and inspected.
- iOS Release compilation passed.

## External deployment note

The Vercel free-plan daily deployment limit was reached during the audit because each branch commit previously created a Bob Core preview. The repository now contains an ignored-build rule to prevent future non-Core commits from consuming deployments. Existing production remains available; the first production build containing the final Bob Core changes must occur after the provider's deployment allowance resets or the account plan changes.

## Acceptance boundary

Automated CI proves source validation, compilation, resource packaging, simulator launch/survival, backend type checking, and backend behavior. The final acceptance check uses the owner's physical iPhone to confirm speaker routing, media volume, microphone timing, live Z.AI behavior, keyboard dismissal, and the configured private device token. Those secrets, hardware routes, and signing credentials are intentionally unavailable to CI and are not embedded in the repository.
