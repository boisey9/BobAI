#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "XcodeGen is required to generate BobAI.xcodeproj."
  echo "If you use Homebrew, install it with: brew install xcodegen"
  exit 1
fi

if ! xcrun --find swift >/dev/null 2>&1; then
  echo "The Xcode Swift toolchain is required to generate the BobAI app icon."
  exit 1
fi

APP_ICON_PATH="BobAI/Resources/Assets.xcassets/AppIcon.appiconset/BobAI-AppIcon-1024.png"
xcrun swift scripts/generate_app_icon.swift "$APP_ICON_PATH"

xcodegen generate

echo "BobAI.xcodeproj generated successfully with the Bob Core app icon."
open BobAI.xcodeproj
