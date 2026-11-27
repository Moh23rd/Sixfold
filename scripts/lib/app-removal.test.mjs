/* Fixtures for the app-removal classification, taken from the run that exposed
   it (45951962655 on the API 34 image): the platform killed the foreground app
   because the GMS fonts provider died under it, Android removed the task, and
   the smoke then compared the launcher's wallpaper to the page colour.

   The classifier decides whether the smoke may repeat the assertion. These
   fixtures pin both sides of that: a provider kill is retried, and a crash, an
   ANR or an app-requested kill is never retried. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyRemoval } from './app-removal.mjs';

const PACKAGE = 'io.github.moh23rd.sixfold';

// The line the API 34 failure left in the main buffer.
const PROVIDER_KILL =
  '11-27 06:37:00.702   523  1792 I ActivityManager: Killing 2721:' +
  'io.github.moh23rd.sixfold/u0a192 (adj 0): depends on provider ' +
  'com.google.android.gms/.fonts.provider.FontsProvider in dying proc ' +
  'com.google.android.gms.persistent (adj -10000)';
// Our own launch's force-stop: present in every run and never the reason the
// app vanished mid-check.
const LAUNCH_FORCE_STOP =
  '11-27 06:36:10.241   523  1792 I ActivityManager: Force stopping ' +
  'io.github.moh23rd.sixfold appid=10192 user=0: from pid 2671';
const AM_KILL_PROVIDER =
  '11-27 06:37:00.700  1000  1553  1638 I am_kill : [0,2721,io.github.moh23rd.sixfold,0,depends on provider com.google.android.gms/.fonts.provider.FontsProvider in dying proc com.google.android.gms.persistent]';
const AM_KILL_ANR =
  '11-22 13:33:15.321  1000  1553  1638 I am_kill : [0,2954,io.github.moh23rd.sixfold,200,user request after error]';
const AM_ANR =
  '11-22 13:33:12.229  1000  1553  1638 I am_anr  : [0,2954,io.github.moh23rd.sixfold,205975000,Input dispatching timed out]';
const FATAL = [
  '--------- beginning of crash',
  '11-27 06:37:00.100  2721  2721 E AndroidRuntime: FATAL EXCEPTION: main',
  'Process: io.github.moh23rd.sixfold, PID: 2721',
  'java.lang.RuntimeException: boom',
  '  at io.github.moh23rd.sixfold.MainActivity.onCreate(MainActivity.java:1)'
].join('\n');

test('a dying provider that takes the app with it is retryable', () => {
  const verdict = classifyRemoval({
    mainText: [LAUNCH_FORCE_STOP, PROVIDER_KILL].join('\n'),
    eventsText: '',
    crashText: '',
    packageName: PACKAGE
  });
  assert.equal(verdict.crashed, false);
  assert.equal(verdict.external, true);
  assert.match(verdict.line, /depends on provider/);
});

test('the events ring records the same provider kill', () => {
  const verdict = classifyRemoval({
    mainText: '',
    eventsText: AM_KILL_PROVIDER,
    crashText: '',
    packageName: PACKAGE
  });
  assert.equal(verdict.crashed, false);
  assert.equal(verdict.external, true);
});

test('a crash is never retryable', () => {
  const verdict = classifyRemoval({
    mainText: '',
    eventsText: '',
    crashText: FATAL,
    packageName: PACKAGE
  });
  assert.equal(verdict.crashed, true);
  assert.equal(verdict.external, false);
});

test('an ANR and its error kill are never retryable', () => {
  for (const eventsText of [AM_ANR, AM_KILL_ANR]) {
    const verdict = classifyRemoval({ mainText: '', eventsText, crashText: '', packageName: PACKAGE });
    assert.equal(verdict.crashed, true);
    assert.equal(verdict.external, false);
  }
});

test('an ANR recorded only in the main buffer is caught', () => {
  const verdict = classifyRemoval({
    mainText: '11-27 06:37:00.000  523  1792 E ActivityManager: ANR in io.github.moh23rd.sixfold',
    eventsText: '',
    crashText: '',
    packageName: PACKAGE
  });
  assert.equal(verdict.crashed, true);
  assert.equal(verdict.external, false);
});

test('a force-stop someone sent is not called a crash', () => {
  const verdict = classifyRemoval({
    mainText: LAUNCH_FORCE_STOP,
    eventsText: '11-27 06:37:00.700  1000  1553  1638 I am_kill : [0,2721,io.github.moh23rd.sixfold,0,user request]',
    crashText: '',
    packageName: PACKAGE
  });
  assert.equal(verdict.crashed, false);
  assert.equal(verdict.external, false);
});

test('an unexplained disappearance is not retryable', () => {
  const verdict = classifyRemoval({
    mainText: LAUNCH_FORCE_STOP,
    eventsText: '',
    crashText: '',
    packageName: PACKAGE
  });
  assert.equal(verdict.crashed, false);
  assert.equal(verdict.external, false);
  assert.equal(verdict.line, '');
});

test('another package dying is not evidence about this app', () => {
  const verdict = classifyRemoval({
    mainText:
      '11-27 06:37:00.702   523  1792 I ActivityManager: Killing 999:com.example.other/u0a1 ' +
      '(adj 0): depends on provider com.example/Provider in dying proc com.example',
    eventsText: '11-27 06:37:00.700  1000  1553  1638 I am_kill : [0,999,com.example.other,0,low memory]',
    crashText: 'FATAL EXCEPTION: main\nProcess: com.example.other, PID: 999',
    packageName: PACKAGE
  });
  assert.equal(verdict.crashed, false);
  assert.equal(verdict.external, false);
});
