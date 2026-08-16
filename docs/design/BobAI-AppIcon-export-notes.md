# BobAI App Icon Export Notes

Target: iOS AppIcon source image, 1024 × 1024 pixels.

- Export without transparency.
- Keep the near-black field, concentric cyan/electric-blue rings, and centered luminous `B`.
- Avoid adding text other than the `B` mark.
- Preserve generous safe space so the mark remains clear at small Home Screen and Spotlight sizes.
- Use the same Core visual vocabulary as `BobCoreView` so the launch icon and voice interaction feel like one identity.

## Production generation

The production PNG is generated during `./scripts/bootstrap.sh` by `scripts/generate_app_icon.swift` and written to:

`BobAI/Resources/Assets.xcassets/AppIcon.appiconset/BobAI-AppIcon-1024.png`

The generator uses native AppKit/Core Graphics, produces an opaque RGB PNG with no alpha channel, and requires no third-party graphics dependency. The asset catalog is named `AppIcon`, matching `ASSETCATALOG_COMPILER_APPICON_NAME` in `project.yml`.
