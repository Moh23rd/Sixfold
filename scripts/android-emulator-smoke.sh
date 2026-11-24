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
# A hosted runner can lose the emulator mid-run: qemu disappears, and the
# assertion is left holding the last frame the compositor painted — which after
# a rotation is the theme's cream window background, not the app's page colour.
# The assertion reports that case with exit status 3 instead of a colour
# mismatch, and this script restarts the emulator and runs it again.
#
# Environment: ANDROID_SDK_ROOT or ANDROID_HOME must point at an SDK with
# cmdline-tools, platform-tools and build-tools. API_LEVEL and AVD_NAME are
# optional; FAILURE_DIR is where the logcat and a screenshot go on failure.
# SMOKE_ATTEMPTS bounds the boot+assert attempts on an emulator that dies.
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
ATTEMPTS="${SMOKE_ATTEMPTS:-3}"

mkdir -p "$OUT"
: > "$LOG"

note() { echo "[emulator] $*"; }
die() { echo "::error::$*"; exit 1; }
# Every adb call is bounded. `adb shell` against a device that is up but not
# answering blocks forever, which turns a slow boot into a job that says
# nothing for twenty minutes. Polls ignore failures: an unready device is the
# expected answer while it boots.
adb_run() { timeout 20 "$ADB" "$@" || true; }

[ -x "$ADB" ] || die "platform-tools are missing from $SDK"
[ -x "$SDKMANAGER" ] || die "sdkmanager is missing (install cmdline-tools)"
[ -x "$AVDMANAGER" ] || die "avdmanager is missing (install cmdline-tools)"
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
if [ ! -d "$ANDROID_AVD_HOME/$AVD.avd" ]; then
  note "creating the $AVD virtual device"
  echo no | "$AVDMANAGER" create avd -n "$AVD" -k "$IMAGE" --force >/dev/null \
    || die "could not create the $AVD virtual device"
fi
[ -f "$ANDROID_AVD_HOME/$AVD.ini" ] \
  || die "the $AVD virtual device is not in $ANDROID_AVD_HOME, where the emulator looks"

EMULATOR_PID=""

stop_emulator() {
  if [ -n "$EMULATOR_PID" ]; then
    kill "$EMULATOR_PID" 2>/dev/null || true
    wait "$EMULATOR_PID" 2>/dev/null || true
    EMULATOR_PID=""
  fi
  # A dead emulator leaves its transport in adb. Drop the server so the next
  # boot is seen as a new device rather than a stale offline one.
  timeout 20 "$ADB" kill-server >/dev/null 2>&1 || true
}

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    note "capturing the emulator's logcat, screen and device state"
    # The whole ring, not a tail. A failing palette check reports itself tens of
    # seconds after the tap that caused it, and this emulator writes about 300
    # lines a second: a 400-line tail covered barely one second, so the run #163
    # artifact could not show what the app did before the failure.
    timeout 120 "$ADB" logcat -d > "$OUT/logcat.txt" 2>&1 || true
    timeout 120 "$ADB" exec-out screencap -p > "$OUT/screen.png" 2>/dev/null || true
    # A lost device is the failure this artifact has to explain: record what
    # adb still sees, whether the emulator process survived, and what the
    # kernel said about it. Without these, "device offline" is a guess.
    timeout 20 "$ADB" devices -l > "$OUT/adb-devices.txt" 2>&1 || true
    timeout 20 "$ADB" get-state > "$OUT/adb-state.txt" 2>&1 || true
    if [ -n "$EMULATOR_PID" ] && kill -0 "$EMULATOR_PID" 2>/dev/null; then
      echo "alive" > "$OUT/emulator-alive.txt"
      ps -o pid,stat,etime,pcpu,rss,args -p "$EMULATOR_PID" > "$OUT/emulator-process.txt" 2>&1 || true
    else
      echo "gone" > "$OUT/emulator-alive.txt"
    fi
    { dmesg --ctime 2>/dev/null || sudo -n dmesg --ctime 2>/dev/null; } | tail -n 200 > "$OUT/dmesg.txt" || true
  fi
  stop_emulator
  exit "$status"
}
trap cleanup EXIT

# Boot one emulator and wait until Android reports the boot broadcast. Returns
# non-zero when the emulator exits on the way up; the caller decides whether to
# spend another attempt on it.
boot_emulator() {
  note "starting the emulator (API $API, attempt $attempt/$ATTEMPTS)"
  echo "=== attempt $attempt ===" >> "$LOG"
  # EMULATOR_GPU exists because the renderer is host-dependent: emulator 37's
  # SwiftShader GLES path segfaults in its RenderThread when `screencap` reads
  # the composited window, while ANGLE over SwiftShader Vulkan survives the same
  # read. Default to the renderer the assertion's pixel checks are known to
  # survive; a workstation can override it to compare.
  "$EMULATOR" -avd "$AVD" \
    -no-window -no-audio -no-boot-anim -no-snapshot \
    -gpu "${EMULATOR_GPU:-swangle}" -accel on \
    -camera-back none -camera-front none \
    >> "$LOG" 2>&1 &
  EMULATOR_PID=$!

  # `adb wait-for-device` has no timeout: if the emulator dies on the way up the
  # wait never returns and the job burns its whole timeout saying nothing.
  local appeared=""
  local i
  for i in $(seq 1 90); do
    if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
      echo "::error::the emulator exited before it reached adb"
      tail -n 40 "$LOG" || true
      EMULATOR_PID=""
      return 1
    fi
    if adb_run devices | grep -qE "^emulator-[0-9]+[[:space:]]+device$"; then
      appeared=1
      break
    fi
    [ $((i % 15)) -eq 0 ] && note "waiting for the emulator to appear in adb ($((i * 2))s)"
    sleep 2
  done
  if [ -z "$appeared" ]; then
    echo "::error::the emulator never appeared in adb"
    tail -n 40 "$LOG" || true
    return 1
  fi

  local booted=""
  for i in $(seq 1 150); do
    booted=$(adb_run shell getprop sys.boot_completed | tr -d '\r')
    [ "$booted" = "1" ] && break
    if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
      echo "::error::the emulator exited before it booted"
      tail -n 40 "$LOG" || true
      EMULATOR_PID=""
      return 1
    fi
    [ $((i % 15)) -eq 0 ] && note "waiting for the boot to finish ($((i * 2))s)"
    sleep 2
  done
  if [ "$booted" != "1" ]; then
    echo "::error::the emulator did not finish booting"
    tail -n 40 "$LOG" || true
    return 1
  fi
  note "the emulator is booted"
}

attempt=0
status=1
while [ "$attempt" -lt "$ATTEMPTS" ]; do
  attempt=$((attempt + 1))
  booted=""
  if boot_emulator; then
    booted=1
    # Animations change frame timing; the assertion polls the page, not the
    # clock, but a still screen also keeps the logcat readable on failure.
    for setting in window_animation_scale transition_animation_scale animator_duration_scale; do
      adb_run shell settings put global "$setting" 0 >/dev/null 2>&1
    done
    # A startup ANR draws a system dialog over the hub and dims the window
    # behind it, so a pixel check sees the dialog's scrim instead of the app.
    # The assertion still proves the app came up and painted; it does not need
    # the platform's debug dialog on top.
    adb_run shell settings put global hide_error_dialogs 1 >/dev/null 2>&1
    # A screen that dims or sleeps between the install and the first sample
    # makes every pixel check read a black window.
    adb_run shell svc power stayon true >/dev/null 2>&1
    export PATH="$SDK/platform-tools:$PATH"
    status=0
    node scripts/assert-android-shell.mjs || status=$?
    # The assertion treats a live page's failure as the app's, but a WebView
    # that stops answering because qemu went away looks the same from Node.
    # Ask the device itself; a gone emulator is the retryable case.
    if [ "$status" -ne 0 ] && [ "$status" -ne 3 ]; then
      if ! kill -0 "$EMULATOR_PID" 2>/dev/null \
        || [ "$(timeout 20 "$ADB" get-state 2>/dev/null)" != "device" ]; then
        note "the emulator is gone after a failure (status $status); treating it as lost"
        status=3
      fi
    fi
  else
    status=1
  fi

  if [ "$status" -eq 0 ]; then
    note "the emulator smoke passed on attempt $attempt"
    exit 0
  fi

  # Exit 3 is the assertion saying the emulator stopped answering; a boot that
  # never completed is the same class of loss. Both are worth another boot.
  # A colour mismatch (exit 1) on a live emulator is a real failure and is not
  # retried, so a regression cannot be hidden by a second attempt.
  if { [ -z "$booted" ] || [ "$status" -eq 3 ]; } && [ "$attempt" -lt "$ATTEMPTS" ]; then
    note "attempt $attempt lost the emulator (status $status); restarting it"
    stop_emulator
    sleep 2
    continue
  fi

  # A colour mismatch on a live emulator is the app's, not the emulator's:
  # report it now instead of spending another boot on it.
  exit "$status"
done

exit "$status"
