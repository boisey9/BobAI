# BobAI Release Audit Completion

Date: 2026-08-16
Scope: merged Memory v0.1 and Bob Core visual identity

## Audit objective

Validate the merged implementation as a release rather than relying on PR descriptions. Close all concrete gaps found in source control, add repeatable validation, and distinguish automated proof from owner-only production credentials and Apple signing.

## Findings closed

- Installed the production 1024 x 1024 opaque AppIcon instead of leaving only an SVG concept.
- Added a real Xcode asset catalog and selected it in `project.yml`.
- Added the Bob Core launch artwork and launch storyboard.
- Wired the previously unused complete state to the speech synthesizer lifecycle.
- Prevented Core interaction while Bob is thinking.
- Protected synthesized-speech state from stale delegate callbacks.
- Added Reduce Motion behavior to the animated Core.
- Updated microphone permission code to the current iOS 17 API.
- Exposed provider and memory status in the iPhone connection test.
- Added deterministic backend dependency installation with `npm ci`.
- Added permanent iOS asset, Debug build, simulator launch, screenshot, and Release build CI.
- Confirmed no open pull requests or TODO/FIXME markers remained after completion.

## Memory validation

- The dedicated Neon project contains both required Memory v0.1 tables.
- The migration has been applied to the main database branch.
- The store uses parameterized queries, per-owner filtering, duplicate prevention, soft deletion, and audit events.
- Automatic model context includes only normal-sensitivity search matches.
- Ordinary conversations are not automatically persisted.

## Security validation

- Provider keys and `DATABASE_URL` remain server-only.
- The iPhone stores only the Bob Core device token in Keychain.
- High-risk credential and identity formats are rejected by memory policy.
- Message and memory content are excluded from structured server logs.
- Authenticated memory routes remain behind the existing device bearer token.

## Acceptance boundary

Automated CI proves compilation, app resource packaging, simulator launch, backend type checking, and backend tests. Live authenticated production calls require the owner's private device token, and physical iPhone signing requires the owner's Apple account; those secrets are intentionally unavailable to CI and are not embedded in the repository.
