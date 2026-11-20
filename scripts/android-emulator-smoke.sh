#!/usr/bin/env bash
# Boots a headless emulator, then hands over to the WebView assertions.
#
# This replaces the third-party emulator action so the same commands can be run
# on a workstation: the job is only useful if it is debuggable, and an action
# that fails with "sh exited 2" hides what happened. Everything here is plain
# SDK tooling: install the image if missing, create an AVD, start the emulator
# with a software GPU, wait for the boot broadcast, then install, launch and
# assert (scripts/assert-android-shell.mjs).
#
# Environment: ANDROID_SDK_ROOT or ANDROID_HOME must point at an SDK with
# cmdline-tools, platform-tools and build-tools. API_LEVEL and AVD_NAME are
# optional; FAILURE_DIR is where the logcat and a screenshot go on failure.
set -euo pipefail

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "$SDK" ]; then
  echo "::error::ANDROID_SDK_ROOT or ANDROID_HOME must point at an Android SDK"
  exit 1
fi

API="${API_LEVEL:-34}"
AVD="${AVD_NAME:-sixfold-smoke}"
IMAGE="system-images;android-$API;google_apis;x86_64"
ADB="$SDK/platform-tools/adb"
EMULATOR="$SDK/emulator/emulator"
# SDK layouts differ: some put the tools in cmdline-tools/latest/bin, others in
# a versioned directory that is only on PATH. Accept either.
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"
[ -x "$SDKMANAGER" ] || SDKMANAGER="$(command -v sdkmanager || true)"
[ -x "$AVDMANAGER" ] || AVDMANAGER="$(command -v avdmanager || true)"
APK="android/app/build/outputs/apk/debug/app-debug.apk"
OUT="${FAILURE_DIR:-emulator-failure}"
LOG="${OUT}/emulator.log"

mkdir -p "$OUT"

note() { echo "[emulator] $*"; }
die() { echo "::error::$*"; exit 1; }
# Every adb call is bounded. `adb shell` against a device that is up but not
# answering blocks forever, which turns a slow boot into a job that says
# nothing for twenty minutes.
adb_run() { timeout "${ADB_TIMEOUT:-20}" "$ADB" "$@" || true; }
adb_do() { timeout "${ADB_TIMEOUT:-120}" "$ADB" "$@"; }

[ -x "$ADB" ] || die "platform-tools are missing from $SDK"
[ -n "$SDKMANAGER" ] && [ -x "$SDKMANAGER" ] || die "sdkmanager is missing (install cmdline-tools)"
[ -n "$AVDMANAGER" ] && [ -x "$AVDMANAGER" ] || die "avdmanager is missing (install cmdline-tools)"
[ -f "$APK" ] || die "$APK has not been built (run npm run native:apk:debug)"

if [ ! -x "$EMULATOR" ]; then
  note "installing the emulator"
  "$SDKMANAGER" "emulator" >/dev/null || die "could not install the emulator"
fi
if [ ! -d "$SDK/system-images/android-$API/google_apis/x86_64" ]; then
  note "installing $IMAGE"
  yes | "$SDKMANAGER" --licenses >/dev/null 2>&1 || true
  "$SDKMANAGER" "$IMAGE" >/dev/null || die "could not install $IMAGE"
fi

# avdmanager (cmdline-tools) writes to ANDROID_USER_HOME/avd, but the emulator
# only searches ANDROID_AVD_HOME, ANDROID_SDK_HOME/avd and $HOME/.android/avd.
# When the host sets only the former, the emulator starts and immediately
# reports "Unknown AVD name". Pin both sides to the same directory.
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$HOME/.android/avd}"
mkdir -p "$ANDROID_AVD_HOME"
AVD_HOME="$ANDROID_AVD_HOME"
if [ ! -d "$AVD_HOME/$AVD.avd" ]; then
  note "creating the $AVD virtual device"
  echo no | "$AVDMANAGER" create avd -n "$AVD" -k "$IMAGE" --force >/dev/null \
    || die "could not create the $AVD virtual device"
fi
[ -f "$AVD_HOME/$AVD.ini" ] \
  || die "the $AVD virtual device is not in $AVD_HOME, where the emulator looks"

EMULATOR_PID=""
cleanup() {
  local status=$?
  if [ "$status" -ne 0 ] && [ -n "$EMULATOR_PID" ]; then
    note "capturing the emulator's logcat and a screenshot"
    adb_do logcat -d -t 400 > "$OUT/logcat.txt" 2>&1 || true
    adb_do exec-out screencap -p > "$OUT/screen.png" 2>/dev/null || true
  fi
  if [ -n "$EMULATOR_PID" ]; then
    kill "$EMULATOR_PID" 2>/dev/null || true
    wait "$EMULATOR_PID" 2>/dev/null || true
  fi
  exit "$status"
}
trap cleanup EXIT

note "starting the emulator (API $API)"
"$EMULATOR" -avd "$AVD" \
  -no-window -no-audio -no-boot-anim -no-snapshot \
  -gpu swiftshader_indirect -accel on \
  -camera-back none -camera-front none \
  > "$LOG" 2>&1 &
EMULATOR_PID=$!

# `adb wait-for-device` has no timeout: if the emulator dies on the way up the
# wait never returns and the job burns its whole timeout saying nothing.
appeared=""
for i in $(seq 1 90); do
  if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
    tail -n 40 "$LOG" || true
    die "the emulator exited before it reached adb"
  fi
  if adb_run devices | grep -qE "^emulator-[0-9]+[[:space:]]+device$"; then
    appeared=1
    break
  fi
  [ $((i % 15)) -eq 0 ] && note "waiting for the emulator to appear in adb ($((i * 2))s)"
  sleep 2
done
[ -n "$appeared" ] || die "the emulator never appeared in adb"

booted=""
for i in $(seq 1 150); do
  booted=$(adb_run shell getprop sys.boot_completed | tr -d '\r')
  [ "$booted" = "1" ] && break
  if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
    tail -n 40 "$LOG" || true
    die "the emulator exited before it booted"
  fi
  [ $((i % 15)) -eq 0 ] && note "waiting for the boot to finish ($((i * 2))s)"
  sleep 2
done
if [ "$booted" != "1" ]; then
  tail -n 40 "$LOG" || true
  die "the emulator did not finish booting"
fi
note "the emulator is booted"

# Animations change frame timing; the assertion polls the page, not the clock,
# but a still screen also keeps the logcat readable on failure.
for setting in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb_run shell settings put global "$setting" 0 >/dev/null 2>&1
done

export PATH="$SDK/platform-tools:$PATH"
node scripts/assert-android-shell.mjs

note "the emulator smoke passed"
