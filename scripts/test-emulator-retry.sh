#!/usr/bin/env bash
# Runs the exit-4 retry self-test on a workstation: the smoke boots its own
# emulator (this script needs no attached device), the wrapper from
# scripts/lib/emulator-retry-selftest.sh removes the app for the assertion
# process that takes the first pixel sample, and the smoke must classify that
# as exit 4 and repeat the assertion once, passing. CI runs the same smoke with
# SMOKE_RETRY_SELF_TEST=1 on the API 34 row, reusing that row's boot instead of
# starting a second emulator.
#
# The APK must already be built (npm run native:apk:debug). API_LEVEL,
# AVD_NAME and SMOKE_IMAGE_TAG are honored; the default image is the row's own.
set -euo pipefail

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "$SDK" ]; then
  echo "::error::ANDROID_SDK_ROOT or ANDROID_HOME must point at an Android SDK"
  exit 1
fi
API="${API_LEVEL:-34}"
AVD="${AVD_NAME:-sixfold-smoke-$API}"
APK="android/app/build/outputs/apk/debug/app-debug.apk"
[ -f "$APK" ] || { echo "::error::$APK has not been built (run npm run native:apk:debug)"; exit 1; }

REAL_ADB="$SDK/platform-tools/adb"
[ -x "$REAL_ADB" ] || { echo "::error::platform-tools are missing from $SDK"; exit 1; }
if "$REAL_ADB" devices | grep -qE "^(emulator|usb|[0-9])[^[:space:]]*[[:space:]]+device$"; then
  echo "::error::a device is already attached; this self-test boots its own emulator"
  "$REAL_ADB" devices
  exit 1
fi

if [ -n "${SMOKE_TEST_DIR:-}" ]; then
  # Kept for a reader who wants to see the call log after a failure.
  WORK="$SMOKE_TEST_DIR"
  mkdir -p "$WORK"
else
  WORK=$(mktemp -d)
  trap 'rm -rf "$WORK"' EXIT
fi

LOG="$WORK/smoke.log"
status=0
API_LEVEL="$API" AVD_NAME="$AVD" FAILURE_DIR="$WORK/failure" SMOKE_ATTEMPTS=1 \
  SMOKE_LAUNCH_ONLY=0 SMOKE_RETRY_SELF_TEST=1 \
  bash scripts/android-emulator-smoke.sh > "$LOG" 2>&1 || status=$?

echo "--- smoke output (last 40 lines) ---"
tail -n 40 "$LOG"
echo "--- adb calls the wrapper answered ---"
cat "$WORK/failure/retry-selftest/state/calls.log" 2>/dev/null || true

if [ "$status" -ne 0 ]; then
  echo "::error::the retry self-test failed (the smoke exited $status)"
  exit "$status"
fi

echo "PASS: the exit-4 branch was exercised end to end and the row came from the repeat"
