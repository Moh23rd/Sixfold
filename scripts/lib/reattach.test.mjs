/* The attach retry decision, without an emulator. A socket close during a cold
   start is a WebView restart and may reattach; a recorded death, a different
   process and an expired window must all keep the launch fatal. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { attachToLiveLaunch } from './reattach.mjs';

const PID = '2144';
const CLEAN = ['no crash, ANR or kill was recorded for the app'];
const ANR = [
  'event: 11-22 13:33:12.229  1000  1553  1638 I am_anr  : [0,2144,io.github.moh23rd.sixfold,205975000,Input dispatching timed out]'
];

const socketClosed = async () => {
  throw new Error('could not attach to the WebView devtools socket');
};

test('a socket close reattaches while the launched pid is alive', async () => {
  let attempts = 0;
  let clock = 0;
  const logs = [];
  const session = await attachToLiveLaunch({
    pid: PID,
    connect: async () => {
      attempts += 1;
      if (attempts === 1) await socketClosed();
      return 'session';
    },
    livePid: () => PID,
    deathReport: async () => CLEAN,
    wait: async () => { clock += 1000; },
    now: () => clock,
    log: (line) => logs.push(line)
  });
  assert.equal(session, 'session');
  assert.equal(attempts, 2);
  assert.equal(logs.length, 1);
});

test('a recorded ANR stays fatal even though the process is alive', async () => {
  let attempts = 0;
  await assert.rejects(
    attachToLiveLaunch({
      pid: PID,
      connect: async () => { attempts += 1; await socketClosed(); },
      livePid: () => PID,
      deathReport: async () => ANR,
      wait: async () => {},
      now: () => 0
    }),
    /am_anr/
  );
  assert.equal(attempts, 1);
});

test('a changed pid stays fatal', async () => {
  let attempts = 0;
  await assert.rejects(
    attachToLiveLaunch({
      pid: PID,
      connect: async () => { attempts += 1; await socketClosed(); },
      livePid: () => '9999',
      deathReport: async () => CLEAN,
      wait: async () => {},
      now: () => 0
    }),
    /launched process is gone/
  );
  assert.equal(attempts, 1);
});

test('an expired window stays fatal', async () => {
  let attempts = 0;
  const times = [0, 25000];
  await assert.rejects(
    attachToLiveLaunch({
      pid: PID,
      connect: async () => { attempts += 1; await socketClosed(); },
      livePid: () => PID,
      deathReport: async () => CLEAN,
      wait: async () => {},
      now: () => times.shift() ?? 25000
    }),
    /devtools socket/
  );
  assert.equal(attempts, 1);
});
