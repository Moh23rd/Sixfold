/* Fixtures for the launch death report, taken from what a real dying launch
   left behind (run 45027793423): logcat's buffer switches, another app's ANR,
   an older launch of this package, and the ANR dump headed by a Subject.

   The report used to be exercised only by an emulator that had just lost the
   app, which is why a header line could be quoted as the buffer's reach for
   several commits. These fixtures run in a second, with no device. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { anrTraceLines, describeDeath, parseDeathReport } from './death-report.mjs';

const PACKAGE = 'io.github.moh23rd.sixfold';

// The format Android 14 writes to the events buffer. Only the first line of
// each record is needed: the report quotes whole lines.
const AM_ANR =
  '11-22 13:33:12.229  1000  1553  1638 I am_anr  : [0,2954,io.github.moh23rd.sixfold,205975000,Input dispatching timed out (37a1e0c io.github.moh23rd.sixfold/.MainActivity is not responding. Waited 5004ms for FocusEvent(hasFocus=true))]';
const AM_KILL =
  '11-22 13:33:15.321  1000  1553  1638 I am_kill : [0,2954,io.github.moh23rd.sixfold,200,user request after error]';
const AM_PROC_DIED =
  '11-22 13:33:15.402  1000  1553  1638 I am_proc_died: [0,2954,io.github.moh23rd.sixfold,200,13]';

const EVENTS = [
  '--------- beginning of events',
  '11-22 13:33:11.900  1010  1600  1600 I am_proc_start: [0,2954,10012,io.github.moh23rd.sixfold,...]',
  AM_ANR,
  '11-22 13:33:12.420  1000  1601  1601 I am_anr  : [0,1017,com.google.android.apps.messaging,205975100,Input dispatching timed out (another app)]',
  // An earlier launch of the same package; its death must not answer for 2954.
  '11-22 13:33:10.500  1000  1553  1638 I am_proc_died: [0,4057,io.github.moh23rd.sixfold,200,13]',
  AM_KILL,
  AM_PROC_DIED,
  ''
].join('\n');

const SUBJECT =
  'Subject: Input dispatching timed out (37a1e0c io.github.moh23rd.sixfold/.MainActivity is not responding. Waited 5004ms for FocusEvent(hasFocus=true))';

// A dump of another process: no section names this app, but the file's Subject
// still describes that process's stall.
const FOREIGN_ANR = [
  'Subject: Input dispatching timed out (another app)',
  '----- pid 1017 at 2026-11-22 13:33:12.300 -----',
  'Cmd line: com.google.android.apps.messaging',
  '----- end 1017 -----',
  ''
].join('\n');

const TRACE = [
  SUBJECT,
  '----- pid 1017 at 2026-11-22 13:33:12.300 -----',
  'Cmd line: com.google.android.apps.messaging',
  '"main" prio=5 tid=1 Sleeping',
  '----- end 1017 -----',
  '----- pid 2954 at 2026-11-22 13:33:12.272 -----',
  'Cmd line: io.github.moh23rd.sixfold',
  '"main" prio=5 tid=1 Sleeping',
  '  | group="main" sCount=1 ucsCount=0 flags=1 obj=0x1 self=0x1',
  '  at java.lang.Thread.sleep(Native method)',
  '  at io.github.moh23rd.sixfold.MainActivity.lambda$onCreate$0(MainActivity.java:60)',
  '----- end 2954 -----',
  ''
].join('\n');

test('the events report names only this launch, with the ring reach', () => {
  const report = parseDeathReport({ eventsText: EVENTS, packageName: PACKAGE, pid: '2954' });
  assert.equal(report[0], `event: ${AM_ANR}`);
  assert.equal(report[1], `event: ${AM_KILL}`);
  assert.equal(report[2], `event: ${AM_PROC_DIED}`);
  assert.equal(
    report[3],
    'event: the events buffer held 7 lines, the oldest from 11-22 13:33:11.900'
  );
  assert.ok(!report.join('\n').includes('4057'), 'an earlier launch answered for this one');
  assert.ok(!report.join('\n').includes('messaging'), 'another app answered for this one');
});

test('the ring reach skips logcat switches, and is honest when the ring is empty', () => {
  const reach = parseDeathReport({
    eventsText: '--------- beginning of events\n--------- beginning of crash\n',
    packageName: PACKAGE
  });
  assert.deepEqual(reach, [
    'event: the events buffer held 2 lines, the oldest from a line without a timestamp'
  ]);
  assert.deepEqual(parseDeathReport({ packageName: PACKAGE }), [
    'no crash, ANR or kill was recorded for the app'
  ]);
});

test("an earlier launch's crash does not answer when the pid is known", () => {
  const older = [
    '11-22 13:00:00.000  1000  1553  1638 E AndroidRuntime: FATAL EXCEPTION: main',
    'Process: io.github.moh23rd.sixfold, PID: 4057',
    'java.lang.IllegalStateException: the older launch',
    ''
  ].join('\n');
  assert.deepEqual(
    parseDeathReport({ crashText: older, packageName: PACKAGE, pid: '2954' }),
    ['no crash, ANR or kill was recorded for the app']
  );
});

test('a replay of the same buffer is the same report', () => {
  // The smoke can read the buffers twice (a death, then the launch report); the
  // report is a pure function of the text, so nothing may vary between reads.
  const once = parseDeathReport({ eventsText: EVENTS, packageName: PACKAGE, pid: '2954' });
  const twice = parseDeathReport({ eventsText: EVENTS, packageName: PACKAGE, pid: '2954' });
  assert.deepEqual(twice, once);
});

test('the crash report starts at the newest block', () => {
  const crash = [
    '11-22 13:00:00.000  1000  1553  1638 E AndroidRuntime: FATAL EXCEPTION: main',
    'Process: io.github.moh23rd.sixfold, PID: 4057',
    'java.lang.IllegalStateException: the older launch',
    '11-22 13:33:12.000  1000  1553  1638 E AndroidRuntime: FATAL EXCEPTION: main',
    'Process: io.github.moh23rd.sixfold, PID: 2954',
    'java.lang.IllegalStateException: the launch that died',
    '\tat android.os.Handler.dispatchMessage(Handler.java:106)',
    '\tat io.github.moh23rd.sixfold.MainActivity.onCreate(MainActivity.java:60)',
    ''
  ].join('\n');
  const report = parseDeathReport({ crashText: crash, packageName: PACKAGE, pid: '2954' });
  assert.ok(report[0].startsWith('crash: 11-22 13:33:12.000'), report[0]);
  assert.ok(report.some((line) => line.includes('PID: 2954')));
  assert.ok(report.some((line) => line.includes('the launch that died')));
  assert.ok(!report.join('\n').includes('the older launch'));
});

test('the ANR report quotes the subject and only the app section', () => {
  const trace = anrTraceLines(TRACE, 'anr_2026-11-22-13-33-12-272', PACKAGE);
  assert.equal(trace[0], 'anr: /data/anr/anr_2026-11-22-13-33-12-272');
  assert.equal(trace[1], `anr: ${SUBJECT}`);
  assert.ok(trace.some((line) => line.includes('Cmd line: io.github.moh23rd.sixfold')));
  assert.ok(trace.some((line) => line.includes('lambda$onCreate$0(MainActivity.java:60)')));
  assert.ok(!trace.join('\n').includes('messaging'), 'another app section leaked into the report');
});

test('an ANR file that does not name the app is shown, but never answers for it', () => {
  const trace = anrTraceLines(FOREIGN_ANR, 'anr_2026-11-22-13-33-12-272', PACKAGE);
  assert.equal(
    trace[0],
    `anr: /data/anr/anr_2026-11-22-13-33-12-272 does not name ${PACKAGE}; its head follows`
  );
  assert.ok(trace.includes('anr: Subject: Input dispatching timed out (another app)'));
  const report = parseDeathReport({ eventsText: EVENTS, packageName: PACKAGE, pid: '2954' });
  const cause = describeDeath(report, trace);
  assert.equal(cause, AM_ANR, 'another app\'s subject became this launch\'s cause');
});

test('the annotation quotes the subject, then what the platform recorded', () => {
  const report = parseDeathReport({ eventsText: EVENTS, packageName: PACKAGE, pid: '2954' });
  const trace = anrTraceLines(TRACE, 'anr_2026-11-22-13-33-12-272', PACKAGE);
  assert.equal(
    describeDeath(report, trace),
    'Input dispatching timed out (37a1e0c io.github.moh23rd.sixfold/.MainActivity is not responding.' +
      ' Waited 5004ms for FocusEvent(hasFocus=true)); the platform recorded: ' +
      AM_ANR
  );
});

test('a death with no trace falls back to the event, and a silent one says so', () => {
  const report = parseDeathReport({ eventsText: EVENTS, packageName: PACKAGE, pid: '2954' });
  assert.equal(describeDeath(report), AM_ANR);
  assert.equal(describeDeath([], []), 'no cause was recorded');
});
