#!/bin/bash
# Builds the signed release AAB for Google Play.
#
# Usage (from apps/mobile): bash scripts/build-android-release.sh
# Output: android/app/build/outputs/bundle/release/app-release.aab
#
# Only the keys a release needs are passed in — .env itself is skipped, so
# dev-only flags (EXPO_PUBLIC_FORCE_PRO, the test-store iOS RevenueCat key)
# can never end up in a build. Signing comes from
# ~/.gradle/gradle.properties (see plugins/withReleaseSigning.js).
set -euo pipefail
cd "$(dirname "$0")/.."

env_value() { grep "^$1=" .env | cut -d= -f2- || true; }

export EXPO_NO_DOTENV=1
export EXPO_PUBLIC_PEXELS_API_KEY="$(env_value EXPO_PUBLIC_PEXELS_API_KEY)"
export EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY="$(env_value EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY)"
export EXPO_PUBLIC_SENTRY_DSN="$(env_value EXPO_PUBLIC_SENTRY_DSN)"

case "$EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY" in
  goog_*) ;;
  *) echo "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY must be the goog_ Play key" >&2; exit 1 ;;
esac

# Sentry source maps: crash reports show real file/line numbers only if the
# build uploads its source maps, which needs an org auth token. Kept outside
# the repo, next to the upload keystore.
TOKEN_FILE="$HOME/Desktop/Project/puraevents-signing/sentry-auth-token"
if [ -s "$TOKEN_FILE" ]; then
  SENTRY_AUTH_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  export SENTRY_AUTH_TOKEN
else
  echo "No Sentry auth token at $TOKEN_FILE — building without source map upload." >&2
  export SENTRY_DISABLE_AUTO_UPLOAD=true
fi

npx expo prebuild --platform android --no-install
(cd android && ./gradlew app:bundleRelease)
ls -la android/app/build/outputs/bundle/release/app-release.aab
