#!/usr/bin/env bash
# Install and launch the current debug APK on one connected Android device.
#
# Usage:
#   npm run smoke:apk
#   ADB_SERIAL=emulator-5554 npm run smoke:apk
#   APK_PATH=/path/to/app-debug.apk npm run smoke:apk
#
# By default, the newest artifacts/**/app-debug.apk is used. This is a smoke
# check, not a full test suite. It verifies the install, launch, installed
# version and process, then saves a screenshot.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ADB=${ADB:-adb}
PACKAGE="io.github.moh23rd.sixfold"
ACTIVITY="$PACKAGE/$PACKAGE.MainActivity"
SCREENSHOT_DIR="$ROOT/artifacts/smoke"

fail() {
  printf 'smoke: %s\n' "$*" >&2
  exit 1
}

if ! command -v "$ADB" >/dev/null 2>&1; then
  fail "adb was not found. Install Android platform-tools and put adb on PATH."
fi

if [ -z "${APK_PATH:-}" ]; then
  newest_apk=""
  if [ -d "$ROOT/artifacts" ]; then
    while IFS= read -r candidate; do
      if [ -z "$newest_apk" ] || [ "$candidate" -nt "$newest_apk" ]; then
        newest_apk=$candidate
      fi
    done < <(find "$ROOT/artifacts" -type f -name 'app-debug.apk' -print 2>/dev/null)
  fi
  [ -n "$newest_apk" ] || fail "no app-debug.apk found under artifacts/. Download the artifact first or set APK_PATH."
  APK_PATH=$newest_apk
fi

# Treat a relative override as relative to the project root, not the caller's
# current directory.
if [ -n "${APK_PATH:-}" ] && [ ! -f "$APK_PATH" ] && [ -f "$ROOT/$APK_PATH" ]; then
  APK_PATH="$ROOT/$APK_PATH"
fi

if [ ! -f "$APK_PATH" ]; then
  fail "APK not found at $APK_PATH. Download the artifact first or set APK_PATH."
fi

if [ -n "${ADB_SERIAL:-}" ]; then
  serial=$ADB_SERIAL
  state=$("$ADB" -s "$serial" get-state 2>/dev/null || true)
  [ "$state" = "device" ] || fail "device $serial is not available in 'device' state (got '${state:-unknown}')."
else
  devices=$("$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1 }')
  count=$(printf '%s\n' "$devices" | grep -c . || true)
  if [ "$count" -eq 0 ]; then
    "$ADB" devices -l >&2 || true
    fail "no authorized Android device found. Enable USB debugging, approve the prompt, or start an emulator."
  fi
  if [ "$count" -gt 1 ]; then
    "$ADB" devices -l >&2 || true
    fail "multiple devices are connected. Re-run with ADB_SERIAL=<serial> npm run smoke:apk"
  fi
  serial=$(printf '%s\n' "$devices" | sed -n '1p')
fi

printf 'Device: %s\n' "$serial"
printf 'APK:    %s\n' "$APK_PATH"

if ! install_output=$("$ADB" -s "$serial" install -r "$APK_PATH" 2>&1); then
  printf '%s\n' "$install_output" >&2
  if printf '%s\n' "$install_output" | grep -q 'INSTALL_FAILED_UPDATE_INCOMPATIBLE'; then
    fail "the installed app uses a different signing key. Run: adb -s $serial uninstall $PACKAGE && npm run smoke:apk"
  fi
  fail "install failed."
fi
if ! printf '%s\n' "$install_output" | grep -q 'Success'; then
  printf '%s\n' "$install_output" >&2
  fail "install did not report success."
fi
printf 'Install: success\n'

package_dump=$("$ADB" -s "$serial" shell dumpsys package "$PACKAGE" 2>/dev/null | tr -d '\r')
version_name=$(printf '%s\n' "$package_dump" | awk -F= '/versionName=/{ print $2; exit }' | awk '{ print $1 }')
version_code=$(printf '%s\n' "$package_dump" | awk '/versionCode=/{ for (i = 1; i <= NF; i++) if ($i ~ /^versionCode=/) { split($i, a, "="); print a[2]; exit } }')
printf 'Installed version: %s (versionCode %s)\n' "${version_name:-unknown}" "${version_code:-unknown}"

"$ADB" -s "$serial" logcat -c >/dev/null 2>&1 || true
"$ADB" -s "$serial" shell am force-stop "$PACKAGE" >/dev/null 2>&1 || true

launch_output=$("$ADB" -s "$serial" shell am start -W -n "$ACTIVITY" 2>&1 | tr -d '\r')
printf '%s\n' "$launch_output"
if ! printf '%s\n' "$launch_output" | grep -q 'Status: ok'; then
  fail "the app did not launch successfully."
fi

pid=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  pid=$("$ADB" -s "$serial" shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' | awk 'NR == 1 && NF { print $1 }' || true)
  [ -n "$pid" ] && break
  sleep 1
done
[ -n "$pid" ] || fail "the app process did not stay running."
printf 'Process: running (pid %s)\n' "$pid"

sleep 3
mkdir -p "$SCREENSHOT_DIR"
safe_serial=$(printf '%s' "$serial" | tr -c 'A-Za-z0-9._-' '_')
screenshot="$SCREENSHOT_DIR/sixfold-$safe_serial.png"
if "$ADB" -s "$serial" exec-out screencap -p >"$screenshot" 2>/dev/null && [ -s "$screenshot" ]; then
  printf 'Screenshot: %s\n' "$screenshot"
else
  rm -f "$screenshot"
  printf 'Screenshot: unavailable (continuing)\n'
fi

crashes=$("$ADB" -s "$serial" logcat -d -v brief 2>/dev/null | grep -E 'FATAL EXCEPTION|ANR in |Process: '"$PACKAGE" || true)
if [ -n "$crashes" ]; then
  printf '\nRecent crash/ANR lines:\n%s\n' "$crashes" >&2
  fail "the app logged a crash or ANR during launch."
fi

cat <<'EOF'

Smoke check passed.

Minimum manual check:
  1. The Sixfold home screen is visible (not a blank/stuck splash).
  2. The header is not under the status bar/cutout and the bottom controls are not under the gesture bar.
  3. Open one game, make one move, and rotate once if you want a quick layout check.

That is enough for this build. The full API 24/28/35/36 matrix is only needed when changing native layout or system-bar behavior.
EOF
