#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "XcodeGen is required to generate BobAI.xcodeproj."
  echo "If you use Homebrew, install it with: brew install xcodegen"
  exit 1
fi

xcodegen generate

echo "BobAI.xcodeproj generated successfully."
open BobAI.xcodeproj
