#!/usr/bin/env node
/* Proves the debug APK actually starts, not just that it compiles.

   The APK job builds, signs and inspects the artifact, but nothing in it opens
   the app: a plugin that throws at registration or a WebView that never gets
   past the launch layer would still ship green. This script runs on a booted
   emulator (the workflow boots it), installs the APK, launches it, and then
   talks to the app's own WebView over the DevTools protocol — which Capacitor
   enables for debug builds — to assert what a player would actually get:

     1. the WebView reached `home-ready`, i.e. the launch layer finished and the
        hub built;
     2. the hub rendered;
     3. a card opens its game, which proves the game screens mount and lay out;
     4. the Haptics plugin is present in the bridge's plugin map;
     5. calling it settles instead of failing as unimplemented.

   Run it with an emulator attached and the debug APK already built. */

import { execFileSync } from 'node:child_process';

const PACKAGE = 'io.github.moh23rd.sixfold';
const ACTIVITY = `${PACKAGE}/.MainActivity`;
const APK = 'android/app/build/outputs/apk/debug/app-debug.apk';
const PORT = 9222;

function log(message) {
  console.log(`[emulator] ${message}`);
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function adb(args, timeout = 120000) {
  try {
    // Bounded: a wedged adb server otherwise hangs the job with no output.
    return execFileSync('adb', args, { encoding: 'utf8', stdio: 'pipe', timeout }).trim();
  } catch (error) {
    const detail = (error.stderr || error.message || '').toString().trim();
    throw new Error(`adb ${args.join(' ')} failed: ${detail}`);
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(what, probe, timeoutMs = 60000, everyMs = 400) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await wait(everyMs);
  }
  fail(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}${last ? `: ${last.message}` : ''}`);
}

function attach(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url.replace('://localhost', '://127.0.0.1'));
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener(
      'error',
      () => reject(new Error('could not attach to the WebView devtools socket')),
      { once: true }
    );
  });
}

function session(socket) {
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });

  const evaluate = async (expression, awaitPromise = false) => {
    const id = nextId++;
    const answer = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise }
    }));
    const result = await answer;
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception && result.exceptionDetails.exception.description;
      throw new Error(description || result.exceptionDetails.text || 'the expression threw');
    }
    return result.result.value;
  };

  return { evaluate };
}

async function devtoolsTarget() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  if (!response.ok) throw new Error(`devtools listing returned ${response.status}`);
  const targets = await response.json();
  return targets.find((target) => target.type === 'page' && /localhost|index\.html/.test(target.url)) || null;
}

let forwarded = false;
try {
  await until('the device to finish booting', () => adb(['shell', 'getprop', 'sys.boot_completed']) === '1', 180000, 1000);

  log(`installing ${APK}`);
  adb(['install', '-r', '-t', APK]);

  // Not `am start -W`: the hub animates from the first frame, so the activity
  // never goes idle and the wait reports a timeout even though it launched.
  // The process and the WebView target below are the real evidence.
  adb(['shell', 'am', 'force-stop', PACKAGE]);
  const started = adb(['shell', 'am', 'start', '-n', ACTIVITY]);
  if (/^Error/im.test(started) || /does not exist/i.test(started)) {
    fail(`the activity did not start: ${started}`);
  }

  const pid = await until('the app process', () => adb(['shell', 'pidof', PACKAGE]));
  log(`running as pid ${pid}`);

  adb(['forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`]);
  forwarded = true;

  const target = await until('the WebView devtools target', devtoolsTarget, 90000);
  log(`attached to ${target.url}`);

  const socket = await attach(target.webSocketDebuggerUrl);
  const { evaluate } = session(socket);

  await until(
    'the WebView to reach home-ready',
    () => evaluate("document.documentElement.classList.contains('home-ready')"),
    90000,
    300
  );
  log('the WebView reached home-ready');

  const hub = await evaluate("Boolean(document.getElementById('hub'))");
  if (!hub) fail('the hub did not render after home-ready');

  // The hub only proves the cover built. Opening a card is what proves the
  // game screens mount and lay out, so tap Merge and wait for its view: the
  // screen's own marker, a laid-out container, and its title.
  const tapped = await evaluate(
    "(() => { const card = document.querySelector('.home-game[data-game=\"merge\"]');" +
      " if (!card) return 'the hub has no merge card'; card.click(); return ''; })()"
  );
  if (tapped) fail(tapped);

  const mergeScreen =
    "(() => { if (document.body.dataset.screen !== 'merge') return null;" +
    " const view = document.querySelector('main.app'); if (!view) return null;" +
    " const heading = view.querySelector('h1');" +
    " const title = heading ? heading.textContent.trim() : '';" +
    " const height = view.getBoundingClientRect().height;" +
    " return height > 100 && /Merge/.test(title)" +
    " ? { title, height: Math.round(height) } : null; })()";

  const game = await until('the merge screen to render', () => evaluate(mergeScreen), 30000, 250);
  log(`opened Merge from the hub: \"${game.title}\" rendered at ${game.height}px`);

  const haptics = await evaluate(
    "(() => { const plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;" +
      ' return { present: Boolean(plugin), vibrate: Boolean(plugin && typeof plugin.vibrate === "function") }; })()'
  );
  if (!haptics || !haptics.present || !haptics.vibrate) {
    fail('the Haptics plugin is not registered in the WebView bridge');
  }
  log('the Haptics plugin is registered');

  // A JS-only shim could fake the proxy, so the native call has to settle. On a
  // device without a motor it rejects, which still proves the bridge handled
  // it; "not implemented" is the failure this is looking for.
  const call = await evaluate(
    '(async () => { try { await window.Capacitor.Plugins.Haptics.vibrate({ pattern: [12] });' +
      ' return { ok: true }; } catch (error) {' +
      ' return { ok: false, message: String((error && error.message) || error) }; } })()',
    true
  );
  if (!call.ok && /not implemented/i.test(call.message || '')) {
    fail(`the Haptics plugin rejected as unimplemented: ${call.message}`);
  }
  log(`the Haptics call settled: ${call.ok ? 'resolved' : `rejected (${call.message})`}`);

  socket.close();
  log('the Android shell starts, renders and exposes its native plugins');
} catch (error) {
  fail(error.message);
} finally {
  if (forwarded) {
    try {
      adb(['forward', '--remove', `tcp:${PORT}`]);
    } catch (error) {
      // Best effort: the job's exit status is what matters.
    }
  }
}
