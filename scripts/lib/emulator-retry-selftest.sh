#!/usr/bin/env bash
# Shared by scripts/android-emulator-smoke.sh (CI runs it on the API 34 row's
# own boot) and scripts/test-emulator-retry.sh (a workstation, on an emulator
# the smoke boots for it). It proves the exit-4 retry without waiting for the
# platform to kill the app: a wrapper around adb removes the app for exactly the
# assertion process that first samples pixels.
#
# The wrapper only answers for one process, so the repeat cannot inherit the
# fake removal: if the smoke relaunched the assertion and the assertion then
# exited 0 without ever reaching a real sample, verification would still fail
# on the call log (one install, one assertion, no second attempt).

# What the platform writes when the low-memory killer takes the app; the
# assertion quotes this line in its failure. A memory kill is used because the
# CI rows run the AOSP image, which has no GMS provider that could die under
# the app; the classifier treats both records as the same platform removal.
: "${SMOKE_FAKE_KILL:=11-27 06:37:00.702   523  1792 I ActivityManager: Killing 2721:io.github.moh23rd.sixfold/u0a192 (adj 0): low memory}"
export SMOKE_FAKE_KILL

# retry_selftest_prepare <work-dir> <real-adb>
#   Writes <work-dir>/adb and exports SMOKE_FAKE_DIR, SMOKE_REAL_ADB and
#   SMOKE_ADB. The caller must use SMOKE_ADB for the rest of the run.
retry_selftest_prepare() {
  local work=$1
  local real=$2
  mkdir -p "$work/state"
  export SMOKE_FAKE_DIR="$work/state"
  export SMOKE_REAL_ADB="$real"

  cat > "$work/adb" <<'WRAPPER'
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

owner=$(cat "$dir/owner" 2>/dev/null || true)

# The first pixel sample of the first attempt arrives after the launch proof.
# Arm the removal there, after letting this sample through. A boot that died
# before the removal was reported leaves a stale arming behind; the next
# assertion on the new boot has to arm again, or the row would pass without
# ever exercising the retry.
if [ -f "$dir/killed" ] && [ ! -f "$dir/consumed" ] \
  && { [ -z "$owner" ] || ! kill -0 "$owner" 2>/dev/null; }; then
  rm -f "$dir/killed" "$dir/owner"
  owner=""
fi
if [[ "$args" == *"exec-out screencap -p"* ]] && [ ! -f "$dir/killed" ]; then
  printf '%s\n' "$PPID" > "$dir/owner"
  : > "$dir/killed"
  record kill-armed
  exec "$real" "$@"
fi

if [ -f "$dir/killed" ] && [ -n "$owner" ] && kill -0 "$owner" 2>/dev/null; then
  case "$args" in
    "shell pidof $pkg") record fake-pidof; : > "$dir/consumed"; exit 1 ;;
    "shell dumpsys activity activities") record fake-resumed; echo "  mResumedActivity: null"; exit 0 ;;
    "logcat -d -b crash") record fake-crash; exit 0 ;;
    "logcat -d -b events") record fake-events; exit 0 ;;
    "logcat -d -t 4000") record fake-kill-line; printf '%s\n' "$SMOKE_FAKE_KILL"; exit 0 ;;
  esac
fi

exec "$real" "$@"
WRAPPER
  chmod +x "$work/adb"
  export SMOKE_ADB="$work/adb"
  : > "$SMOKE_FAKE_DIR/calls.log"
}

# retry_selftest_reset <work-dir>
#   Forgets the previous boot's records, so the verification judges the attempt
#   that actually decided the row. A boot lost mid-retry must not turn the next
#   attempt's one install into a false two-install pass.
retry_selftest_reset() {
  local state=$1/state
  rm -f "$state/killed" "$state/owner" "$state/consumed" "$state/retry-taken"
  : > "$state/calls.log"
}

# retry_selftest_verify <work-dir> <smoke-status>
#   Non-zero with a CI annotation when the smoke did not take the exit-4 branch
#   and repeat it exactly once.
retry_selftest_verify() {
  local state=$1/state
  local status=$2
  local problem=""
  local installs

  [ "$status" -eq 0 ] || problem="the smoke exited $status instead of 0"
  [ -f "$state/killed" ] \
    || problem="${problem:+$problem; }the wrapper never armed the removal"
  [ -f "$state/retry-taken" ] \
    || problem="${problem:+$problem; }the smoke never took the exit-4 retry"
  [ -f "$state/consumed" ] \
    || problem="${problem:+$problem; }the assertion never asked whether the app was still there"
  installs=$(grep -c '^install-start ' "$state/calls.log" 2>/dev/null || true)
  [ "${installs:-0}" -eq 2 ] \
    || problem="${problem:+$problem; }saw ${installs:-0} assertion runs (installs), expected 2"

  if [ -n "$problem" ]; then
    printf '::error::retry self-test failed: %s\n' "$problem"
    return 1
  fi
}

# retry_selftest_report <work-dir>
#   Prints what the detected removal and the repeat cost.
retry_selftest_report() {
  local state=$1/state
  local finished armed removed second_install second_done
  finished=$(date +%s%3N)
  armed=$(awk '/^kill-armed / {print $2}' "$state/calls.log" | tail -1)
  removed=$(awk '/^fake-pidof / {print $2}' "$state/calls.log" | tail -1)
  second_install=$(awk '/^install-start / {print $2}' "$state/calls.log" | tail -1)
  second_done=$(awk '/^install-done / {print $2}' "$state/calls.log" | tail -1)
  printf 'the first sample armed the removal; the next question about the app got %s %sms later\n' \
    "'gone'" "$((removed - armed))"
  printf 'the repeat spent %sms on the install and %sms on the whole check\n' \
    "$((second_done - second_install))" "$((finished - second_done))"
  printf 'PASS: exit 4 was classified from the platform%s record and the smoke repeated the assertion once, passing\n' "'s"
}
