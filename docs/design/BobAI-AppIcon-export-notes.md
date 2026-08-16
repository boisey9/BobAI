# BobAI App Icon Export Notes

Production status: installed.

- Source artwork: `docs/design/BobAI-AppIcon.svg`
- Installed iOS source image: `BobAI/Resources/Assets.xcassets/AppIcon.appiconset/BobAI-AppIcon-1024.png`
- Dimensions: 1024 x 1024 pixels
- Color mode: opaque RGB, no alpha channel
- Xcode asset name: `AppIcon`

The near-black full-bleed field, concentric cyan/electric-blue rings, and centered luminous `B` match the interactive `BobCoreView`. iOS applies the final platform mask; the source image itself remains square and opaque.

`scripts/validate_release_assets.py` fails CI if the icon is missing, incorrectly sized, transparent, or disconnected from `project.yml`.
