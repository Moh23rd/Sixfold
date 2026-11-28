/* The attach retry decision, without an emulator. A socket close during a cold
   start is a WebView restart and may reattach; a recorded death, a different
   process and an expired window must all keep the launch fatal. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ATTACH_RETRY_WINDOW, attachToLiveLaunch, chooseLivePage } from './reattach.mjs';

const PID = '2144';
const CLEAN = ['no crash, ANR or kill was recorded for the app'];
const ANR = [
  'event: 11-22 13:33:12.229  1000  1553  1638 I am_anr  : [0,2144,io.github.moh23rd.sixfold,205975000,Input dispatching timed out]'
];

const socketClosed = async () => {
  throw new Error('could not attach to the WebView devtools socket');
};

const page = (fields) => ({ url: 'https://localhost/', visible: 'visible', focused: false, origin: 0, bridge: 'alive', ...fields });

test('the newest live visible page is the one the player sees', () => {
  const older = page({ origin: 1000 });
  const newer = page({ origin: 2000 });
  assert.equal(chooseLivePage([older, newer]), newer);
});

test('a focused live page wins over a newer unfocused one', () => {
  const older = page({ origin: 1000, focused: true });
  const newer = page({ origin: 2000 });
  assert.equal(chooseLivePage([older, newer]), older);
});

test('a page whose bridge is gone is never chosen, however current it looks', () => {
  // The API 26 relaunch: the destroyed activity's page is the newest, focused
  // and visible target, but its plugin thread died with its bridge, so it can
  // never report the native paint hand-off.
  const zombie = page({ origin: 2000, focused: true, bridge: 'gone' });
  const live = page({ origin: 1000 });
  assert.equal(chooseLivePage([zombie, live]), live);
});

test('a page that has not registered its plugins yet is skipped', () => {
  const starting = page({ origin: 2000, focused: true, bridge: 'starting' });
  const live = page({ origin: 1000 });
  assert.equal(chooseLivePage([starting, live]), live);
});

test('no live visible page is no page at all', () => {
  assert.equal(chooseLivePage([page({ bridge: 'gone' })]), null);
  assert.equal(chooseLivePage([page({ visible: 'hidden' })]), null);
  assert.equal(chooseLivePage([]), null);
});

test('a dead page that spends the probe budget still reattaches inside the window', async () => {
  // The bridge probe can wait ten seconds before it calls a page gone. That has
  // to leave room for the reattach a leftover page needs: the window bounds when
  // another attach may start, and the first one is allowed to finish.
  let attempts = 0;
  let clock = 0;
  const logs = [];
  const session = await attachToLiveLaunch({
    pid: PID,
    connect: async () => {
      attempts += 1;
      if (attempts === 1) {
        clock += 10000; // the whole probe budget on a page whose bridge is gone
        throw new Error('no WebView page can reach a native bridge (1 page: gone)');
      }
      clock += 500; // the replacement page answers its first probe
      return 'session';
    },
    livePid: () => PID,
    deathReport: async () => CLEAN,
    wait: async (ms) => { clock += ms; },
    now: () => clock,
    log: (line) => logs.push(line)
  });
  assert.equal(session, 'session');
  assert.equal(attempts, 2);
  assert.match(logs[0], /native bridge/);
  assert.ok(clock < ATTACH_RETRY_WINDOW, `reattached at ${clock}ms, the window is ${ATTACH_RETRY_WINDOW}ms`);
});

test('a second dead page passes the window and stays fatal', async () => {
  // Two full probe budgets plus the retry delay no longer fit, which is the
  // limit this budget buys: one leftover page is recoverable, two are not.
  let attempts = 0;
  let clock = 0;
  await assert.rejects(
    attachToLiveLaunch({
      pid: PID,
      connect: async () => {
        attempts += 1;
        clock += 10000;
        throw new Error('no WebView page can reach a native bridge (1 page: gone)');
      },
      livePid: () => PID,
      deathReport: async () => CLEAN,
      wait: async (ms) => { clock += ms; },
      now: () => clock
    }),
    /native bridge/
  );
  assert.equal(attempts, 2);
  assert.ok(clock >= ATTACH_RETRY_WINDOW);
});

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
