#!/usr/bin/env bash
# Sidecar APK builder. Reads versionName from android/app/build.gradle, builds
# an incremental debug APK, drops it on the Desktop with a versioned filename,
# and also keeps SidecarBuild.apk as an alias to the latest.
#
# Usage:
#   ./scripts/build-apk.sh
#
# To publish a new version:
#   1. Bump versionCode + versionName in android/app/build.gradle
#   2. Run this script
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

VERSION_NAME=$(grep -Eo 'versionName "[^"]+"' android/app/build.gradle | head -1 | cut -d'"' -f2)
VERSION_CODE=$(grep -Eo 'versionCode [0-9]+' android/app/build.gradle | head -1 | awk '{print $2}')

echo "▶ Building Sidecar v${VERSION_NAME} (code ${VERSION_CODE})"

echo "▶ Bundling JS…"
npx react-native bundle \
  --platform android --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res \
  | tail -3

echo "▶ Running gradle assembleDebug…"
cd android
./gradlew assembleDebug --console=plain 2>&1 | tail -5
cd ..

APK_SRC="android/app/build/outputs/apk/debug/app-debug.apk"
DEST="${HOME}/Desktop/SidecarBuild-v${VERSION_NAME}.apk"
LATEST="${HOME}/Desktop/SidecarBuild.apk"

cp -f "$APK_SRC" "$DEST"
cp -f "$APK_SRC" "$LATEST"

SIZE=$(du -h "$DEST" | cut -f1)
echo ""
echo "✓ Built ${SIZE}"
echo "  → ${DEST}"
echo "  → ${LATEST}  (alias to latest)"
