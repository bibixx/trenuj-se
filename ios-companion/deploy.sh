#!/usr/bin/env bash
# Build + install Workout Feed to a connected iPhone - no Xcode GUI needed.
# Usage: ./deploy.sh [device-identifier]   (defaults to the first connected device)
set -euo pipefail
cd "$(dirname "$0")"

DERIVED="${DERIVED:-/tmp/trenuj-dd}"

echo "- Building (signed) for device..."
xcodebuild -quiet -project TrenujCompanion.xcodeproj -scheme TrenujCompanion \
  -configuration Debug -destination 'generic/platform=iOS' \
  -allowProvisioningUpdates -derivedDataPath "$DERIVED" build

APP="$DERIVED/Build/Products/Debug-iphoneos/TrenujCompanion.app"

DEVICE="${1:-}"
if [ -z "$DEVICE" ]; then
  DEVICE="$(xcrun devicectl list devices 2>/dev/null | grep ' connected ' | grep -oE '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}' | head -1 || true)"
fi

if [ -z "$DEVICE" ]; then
  echo "x No connected device found. Connect your iPhone (unlocked), or pass its identifier." >&2
  exit 1
fi

echo "- Installing to $DEVICE..."
xcrun devicectl device install app --device "$DEVICE" "$APP"
echo "OK Installed se.trenuj.companion"
