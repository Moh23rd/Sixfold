#!/usr/bin/env bash
# Proves the exit-4 retry end to end, without waiting for the platform to kill
# the app on its own: a wrapper around adb removes the app for exactly the
# assertion process that first samples pixels. That process must classify the
# removal, exit 4, and be repeated by the smoke on the same boot; the repeat
# runs against the untouched device and has to pass.
#
# The wrapper only answers for one process, so the repeat cannot inherit the
# fake removal: if the smoke relaunched the assertion and the assertion then
# exited 0 without ever reaching a real sample, this test would still fail on
# the call log (one install, one assertion, no second attempt).
#
# Runs the real smoke, so it boots its own emulator and needs a machine with no
# other device attached. The APK must already be built (npm run native:apk:debug).
set -euo pipefail

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "$SDK" ]; then
  echo "::error::ANDROID_SDK_ROOT or ANDROID_HOME must point at an Android SDK"
  exit 1
fi
API="${API_LEVEL:-34}"
AVD="sixfold-smoke-$API"
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

export SMOKE_FAKE_DIR="$WORK/state"
mkdir -p "$SMOKE_FAKE_DIR"
export SMOKE_REAL_ADB="$REAL_ADB"
# What the platform writes when it kills a client for a dying provider; the
# assertion quotes this line in its failure.
export SMOKE_FAKE_KILL="11-27 06:37:00.702   523  1792 I ActivityManager: Killing 2721:io.github.moh23rd.sixfold/u0a192 (adj 0): depends on provider com.google.android.gms/.fonts.provider.FontsProvider in dying proc com.google.android.gms.persistent (adj -10000)"

cat > "$WORK/adb" <<'WRAPPER'
#!/usr/bin/env bash
# Real adb until the first pixel read arms the kill; then a platform removal
# for that one assertion process only.
set -u
dir="${SMOKE_FAKE_DIR:?}"
real="${SMOKE_REAL_ADB:?}"
pkg=io.github.moh23rd.sixfold
args="$*"
log="$dir/calls.log"
record() { printf '%s %s\n' "$1" "$(date +%s%3N)" >> "$log"; }

if [[ "$args" == install\ * ]]; then
  record install-start
  "$real" "$@"; status=$?
  record install-done
  exit "$status"
fi

# The first pixel sample of the first attempt arrives after the launch proof.
# Arm the removal there, after letting this sample through.
if [ ! -f "$dir/killed" ] && [[ "$args" == *"exec-out screencap -p"* ]]; then
  printf '%s\n' "$PPID" > "$dir/owner"
  : > "$dir/killed"
  record kill-armed
  exec "$real" "$@"
fi

owner=$(cat "$dir/owner" 2>/dev/null || true)
if [ -f "$dir/killed" ] && [ -n "$owner" ] && kill -0 "$owner" 2>/dev/null; then
  case "$args" in
    "shell pidof $pkg") record fake-pidof; exit 1 ;;
    "shell dumpsys activity activities") record fake-resumed; echo "  mResumedActivity: null"; exit 0 ;;
    "logcat -d -b crash") record fake-crash; exit 0 ;;
    "logcat -d -b events") record fake-events; exit 0 ;;
    "logcat -d -t 4000") record fake-kill-line; printf '%s\n' "$SMOKE_FAKE_KILL"; exit 0 ;;
  esac
fi

exec "$real" "$@"
WRAPPER
chmod +x "$WORK/adb"
export SMOKE_ADB="$WORK/adb"

LOG="$WORK/smoke.log"
status=0
API_LEVEL="$API" AVD_NAME="$AVD" FAILURE_DIR="$WORK/failure" SMOKE_ATTEMPTS=1 SMOKE_LAUNCH_ONLY=0 \
  bash scripts/android-emulator-smoke.sh > "$LOG" 2>&1 || status=$?

echo "--- smoke output (last 40 lines) ---"
tail -n 40 "$LOG"
echo "--- adb calls the wrapper answered ---"
cat "$SMOKE_FAKE_DIR/calls.log" 2>/dev/null || true

problem=""
[ "$status" -eq 0 ] || problem="the smoke exited $status instead of 0"
grep -q 'the platform removed the app mid-check (status 4); repeating' "$LOG" \
  || problem="${problem:+$problem; }the smoke never took the exit-4 retry"
[ -f "$SMOKE_FAKE_DIR/killed" ] \
  || problem="${problem:+$problem; }the wrapper never armed the removal"
installs=$(grep -c '^install-start ' "$SMOKE_FAKE_DIR/calls.log" 2>/dev/null || true)
[ "${installs:-0}" -eq 2 ] \
  || problem="${problem:+$problem; }saw ${installs:-0} assertion runs (installs), expected 2"
grep -q 'fake-pidof' "$SMOKE_FAKE_DIR/calls.log" 2>/dev/null \
  || problem="${problem:+$problem; }the assertion never asked whether the app was still there"
grep -q 'the Android shell starts, renders and exposes its native plugins' "$LOG" \
  || problem="${problem:+$problem; }the repeated assertion did not finish its checks"

if [ -n "$problem" ]; then
  echo "::error::retry self-test failed: $problem"
  exit 1
fi

finished=$(date +%s%3N)
armed=$(grep '^kill-armed ' "$SMOKE_FAKE_DIR/calls.log" | awk '{print $2}')
removed=$(grep '^fake-pidof ' "$SMOKE_FAKE_DIR/calls.log" | awk '{print $2}')
second_install=$(grep '^install-start ' "$SMOKE_FAKE_DIR/calls.log" | tail -1 | awk '{print $2}')
second_done=$(grep '^install-done ' "$SMOKE_FAKE_DIR/calls.log" | tail -1 | awk '{print $2}')
echo "--- result ---"
echo "the first sample armed the removal; the next question about the app got 'gone' $((removed - armed))ms later"
echo "the repeat spent $((second_done - second_install))ms on the install and $((finished - second_done))ms on the whole check"
echo "PASS: exit 4 was classified from the platform's record and the smoke repeated the assertion once, passing"
