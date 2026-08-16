# BobAI App Icon Installation

Date: 2026-08-16

## Objective

Install the approved Bob Core icon as the actual iOS application icon and ensure the generated Xcode project selects it for the BobAI target.

## State found

PR #8 had already merged the animated Bob Core interface and editable app-icon design source into `main`. The repository did not contain an `Assets.xcassets/AppIcon.appiconset`, so Xcode had no production app-icon asset to compile.

## Files changed

- Added `BobAI/Resources/Assets.xcassets/Contents.json`.
- Added `BobAI/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json`.
- Added `scripts/generate_app_icon.swift`.
- Updated `scripts/bootstrap.sh` to generate the opaque 1024 × 1024 PNG before XcodeGen runs.
- Updated `project.yml` to set `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon`.
- Updated `.gitignore` for the generated PNG.

## Implementation details

- The icon is generated deterministically with native macOS AppKit/Core Graphics; no external image package is required.
- The generated bitmap is opaque RGB with no alpha channel.
- The visual uses the approved near-black field, electric-blue concentric rings, energy particles, and luminous `B`.
- The editable SVG source remains under `docs/design/` for future revisions.
- `project.yml` remains the Xcode project source of truth.
- Bundle identifier, signing, permissions, Bob Core authentication, provider configuration, and voice behavior are unchanged.

## Local validation

1. Pull the latest `main` branch.
2. Run `./scripts/bootstrap.sh`.
3. Confirm the script reports that it generated `BobAI-AppIcon-1024.png`.
4. In Xcode, open `Assets.xcassets > AppIcon` and confirm the Bob Core icon appears.
5. Delete the prior BobAI installation from the simulator or iPhone if iOS retains the old cached icon.
6. Build and install BobAI again.

## Expected result

The glowing blue Bob Core `B` appears as the BobAI icon on the iPhone Home Screen and in Xcode's AppIcon asset catalog.
