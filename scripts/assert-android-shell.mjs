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
     5. calling it settles instead of failing as unimplemented;
     6. a palette tap repaints the window strip behind the system bars — the
        surface SystemBars rewrote when the strip went stale;
     7. the page surface itself repaints on that tap — the composited scroller
        used to keep the previous appearance's raster.

   Run it with an emulator attached and the debug APK already built. */

import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';

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

/* A pixel sample is only evidence when the guest itself answers. A wedged
   emulator keeps its adb transport and answers `get-state` with "device", and
   `screencap` keeps returning the last frame the compositor produced. That
   frame can predate the app's repair after a rotation, so a dead emulator looks
   exactly like a stale strip. The shell script restarts the emulator on this
   exit code; nothing here should report an app defect for it. */
const EMULATOR_GONE = 3;
class EmulatorLost extends Error {}

function answerShell(timeout = 8000) {
  try {
    execFileSync('adb', ['shell', 'echo', 'ok'], { encoding: 'utf8', stdio: 'pipe', timeout });
    return true;
  } catch (error) {
    return false;
  }
}

async function deviceLive(attempts = 3) {
  for (let i = 0; i < attempts; i += 1) {
    if (adbState() === 'device' && answerShell()) return true;
    await wait(700);
  }
  return false;
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

function adbBuffer(args, timeout = 120000) {
  try {
    // A screenshot is a megabyte or two, well past the default 1 MB buffer.
    return execFileSync('adb', args, { stdio: 'pipe', timeout, maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    const detail = (error.stderr || error.message || '').toString().trim();
    throw new Error(`adb ${args.join(' ')} failed: ${detail}`);
  }
}

/* adb drops its transport while Android applies a rotation or a UI-mode
   change. The WebView socket usually survives that, but the next shell call
   fails with "device offline", which used to end the smoke. Wait for the
   device before touching it again, and retry the calls that trigger the
   change. */
const TRANSIENT_ADB = /device offline|no devices\/emulators found|device not found|connection reset|protocol fault|closed/i;

function adbState() {
  try {
    return execFileSync('adb', ['get-state'], { encoding: 'utf8', stdio: 'pipe', timeout: 10000 }).trim();
  } catch (error) {
    return ((error.stdout || '') + ' ' + (error.stderr || '')).trim();
  }
}

async function settleDevice(what, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let state = '';
  while (Date.now() < deadline) {
    state = adbState();
    if (state === 'device') return true;
    await wait(500);
  }
  log(`adb has not returned after ${what} (last state: ${state || 'nothing'})`);
  return false;
}

async function adbRetry(args, what, attempts = 6, fatal = true) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return adb(args);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !TRANSIENT_ADB.test(error.message)) break;
      log(`${what}: adb failed (${error.message}); waiting for the device (${attempt}/${attempts})`);
      await settleDevice(what);
    }
  }
  if (fatal && !(await deviceLive())) throw new EmulatorLost(`${what}: the emulator stopped answering`);
  throw lastError;
}

/* Reads the PNG `screencap -p` returns. The smoke runs on a bare runner with no
   image library, and the package tree has no PNG dependency of its own, so the
   decoder is the few lines this job actually needs: 8-bit RGB/RGBA, no
   interlacing. */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('screencap did not return a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const name = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (name === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      if (data[12] !== 0) throw new Error('the screenshot is interlaced');
    } else if (name === 'IDAT') {
      idat.push(data);
    } else if (name === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (depth !== 8 || (type !== 6 && type !== 2)) {
    throw new Error(`unexpected screenshot format (bit depth ${depth}, colour type ${type})`);
  }

  const bpp = type === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = previous ? previous[x] : 0;
      const upLeft = previous && x >= bpp ? previous[x - bpp] : 0;
      let predictor;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        predictor = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      } else throw new Error(`unknown PNG filter ${filter}`);
      row[x] = (line[x] + predictor) & 0xff;
    }
  }
  return { width, height, bpp, pixels };
}

/* The dominant colour of the band behind the system bars. The window drawable is
   the only thing there: the SystemBars plugin insets the WebView by the bar
   heights, so the strip is exactly the surface the palette report paints. Icons
   and the clock sit in those rows too, so take the mode rather than one pixel,
   and skip pure black (a simulated cutout or a letterboxed row). */
function stripColour(png, edge) {
  const from = edge === 'top' ? Math.round(png.height * 0.012) : Math.round(png.height * 0.965);
  const to = edge === 'top' ? Math.round(png.height * 0.055) : Math.round(png.height * 0.995);
  const counts = new Map();
  for (let y = from; y < to; y += 2) {
    for (let x = 0; x < png.width; x += 8) {
      const at = y * png.width * png.bpp + x * png.bpp;
      const r = png.pixels[at];
      const g = png.pixels[at + 1];
      const b = png.pixels[at + 2];
      if (r === 0 && g === 0 && b === 0) continue;
      const key = (r << 16) | (g << 8) | b;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  let best = null;
  let seen = 0;
  for (const [key, count] of counts) {
    if (count > seen) {
      best = key;
      seen = count;
    }
  }
  return best === null ? null : `#${best.toString(16).padStart(6, '0')}`;
}

async function readStrip() {
  if (!(await deviceLive())) throw new EmulatorLost('reading the window strip: the emulator stopped answering');
  const started = Date.now();
  const png = decodePng(adbBuffer(['exec-out', 'screencap', '-p']));
  const took = Date.now() - started;
  if (!(await deviceLive())) throw new EmulatorLost('reading the window strip: the emulator stopped answering');
  // A screencap that takes tens of seconds is the compositor stalling; the
  // frame it returned is not a fresh paint, so it must not count as evidence.
  if (took > 12000) throw new Error(`the screenshot took ${Math.round(took / 1000)}s, so it is stale`);
  return { top: stripColour(png, 'top'), bottom: stripColour(png, 'bottom') };
}

/* The page surface the WebView actually paints, read from the device. The
   hub's left margin is page background only — no card, tile or scrim reaches
   it — so the dominant colour down that column is what the compositor has on
   screen for `--page`. A stale layer keeps this on the previous appearance's
   colour while every control already shows the new one. */
async function readPageSurface() {
  if (!(await deviceLive())) throw new EmulatorLost('reading the page surface: the emulator stopped answering');
  const started = Date.now();
  const png = decodePng(adbBuffer(['exec-out', 'screencap', '-p']));
  const took = Date.now() - started;
  if (!(await deviceLive())) throw new EmulatorLost('reading the page surface: the emulator stopped answering');
  if (took > 12000) throw new Error(`the screenshot took ${Math.round(took / 1000)}s, so it is stale`);
  const from = Math.round(png.width * 0.004);
  const to = Math.round(png.width * 0.018);
  const top = Math.round(png.height * 0.2);
  const bottom = Math.round(png.height * 0.95);
  const counts = new Map();
  for (let y = top; y < bottom; y++) {
    for (let x = from; x < to; x++) {
      const at = y * png.width * png.bpp + x * png.bpp;
      const key = (png.pixels[at] << 16) | (png.pixels[at + 1] << 8) | png.pixels[at + 2];
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  let best = null;
  let seen = 0;
  for (const [key, count] of counts) {
    if (count > seen) {
      best = key;
      seen = count;
    }
  }
  return best === null ? null : `#${best.toString(16).padStart(6, '0')}`;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Waits for the window strip to show the page colour. A configuration change
   makes Android rewrite the drawable from the theme's resource, and the shell
   reports the page colour back over the bridge, so this waits rather than
   sleeps. A stale strip never matches and reports what it kept showing. */
async function awaitStrip(expected, what, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let seen = null;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      seen = await readStrip();
      lastError = null;
    } catch (error) {
      lastError = error;
      if (error instanceof EmulatorLost) {
        // Give a genuine adb reconnect a chance, then stop: without a guest
        // there is no paint to sample, and the last frame it produced is not
        // the app's fault.
        if (!(await settleDevice(what, 15000)) || !(await deviceLive())) throw error;
        continue;
      }
      // A screencap can land in the gap while adb reconnects after a rotation
      // or a UI-mode switch. Wait for the device and sample again; the strip
      // deadline still bounds the whole check.
      await settleDevice(what, 15000);
      continue;
    }
    if (seen.top === expected) return seen;
    await wait(600);
  }
  // Before calling a mismatch an app defect, take one more sample: the frame
  // the loop kept seeing may be the last one a dying emulator composed. This
  // read either shows the repair, or raises EmulatorLost, or confirms a live
  // device still painting the wrong colour.
  try {
    const final = await readStrip();
    if (final.top === expected) return final;
    seen = final;
    lastError = null;
  } catch (error) {
    lastError = error;
    if (error instanceof EmulatorLost) throw error;
  }
  fail(
    `${what}: expected the strip on ${expected},` +
      ` got top ${seen && seen.top} bottom ${seen && seen.bottom}` +
      (lastError ? ` (the last read failed: ${lastError.message})` : '')
  );
}

/* Like `until`, but answers null instead of exiting when the deadline passes,
   so the launch can report a death with its recorded reason before giving up. */
async function waitFor(what, probe, timeoutMs = 60000, everyMs = 400) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return { value };
    } catch (error) {
      // A dead emulator is not a slow page: report it as such instead of
      // timing out as if the WebView never came up. A lost transport or a
      // refused devtools socket only counts as loss if the guest itself has
      // stopped answering, so a slow WebView still fails as a timeout.
      if (error instanceof EmulatorLost) throw error;
      if (/device offline|no devices\/emulators found|device not found|connection reset|protocol fault|closed|fetch failed|ECONNREFUSED|ETIMEDOUT/i.test(error.message)) {
        if (!(await deviceLive())) throw new EmulatorLost(`${what}: the emulator stopped answering`);
      }
      last = error;
    }
    await wait(everyMs);
  }
  return { value: null, error: last };
}

async function until(what, probe, timeoutMs = 60000, everyMs = 400) {
  const { value, error } = await waitFor(what, probe, timeoutMs, everyMs);
  if (value) return value;
  fail(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}${error ? `: ${error.message}` : ''}`);
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

  // A cold-starting WebView can be torn down and recreated while the script is
  // waiting on it. Without this, a pending evaluate never settles and Node
  // empties the event loop with a top-level await outstanding (exit 13).
  socket.addEventListener('close', () => {
    for (const entry of pending.values()) entry.reject(new Error('the WebView devtools socket closed'));
    pending.clear();
  });

  // A WebView whose renderer has stopped answering (a startup ANR) never
  // settles a pending evaluate, which used to stall the whole job. Bound every
  // call so the launch's home-ready wait fails with a reason instead.
  const evaluate = async (expression, awaitPromise = false, timeoutMs = 20000) => {
    const id = nextId++;
    const answer = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`the WebView did not answer within ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
    });
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

let currentSession = null;

function appPid() {
  try {
    return adb(['shell', 'pidof', PACKAGE], 15000);
  } catch (error) {
    return '';
  }
}

function adbSafe(args) {
  try {
    return adb(args, 20000);
  } catch (error) {
    return '';
  }
}

/* Why the process disappeared. A launch that dies before it paints leaves
   nothing behind but a missing pid, so the log used to say only that the app
   was gone while the emulator was fine — enough to relaunch, not enough to know
   what happened. Android keeps crashes in a buffer of their own, and the events
   buffer names the reason the platform killed a process ("bg anr", "low
   memory", ...). Read both and report them where the death is noticed. */
async function processDeathReport(pid = '') {
  const report = [];
  const crash = adbSafe(['logcat', '-d', '-b', 'crash', '-t', '400']);
  // Start the window where the trace names the process, not a fixed number of
  // lines from the end: a Java crash's FATAL EXCEPTION line and a native
  // tombstone's pid line are near the top of a block that can be long.
  const crashLines = crash.trim().split('\n');
  const named = crashLines.findIndex((line) => line.includes(PACKAGE));
  if (named >= 0) {
    for (const line of crashLines.slice(Math.max(0, named - 2), named + 38)) report.push(`crash: ${line}`);
  }
  const events = adbSafe(['logcat', '-d', '-b', 'events', '-t', '800'])
    .split('\n')
    .filter((line) => line.includes(PACKAGE) && /am_(crash|anr|kill|proc_died)/.test(line))
    // Another launch's death is not this one's answer; the events record names
    // the pid in its second field.
    .filter((line) => !pid || line.includes(`,${pid},`));
  for (const line of events) report.push(`event: ${line.trim()}`);
  return report.length ? report : ['no crash, ANR or kill was recorded for the app'];
}

/* The platform's own account of a stalled launch: the ANR dump of the app's
   threads. The events buffer records only that input timed out; the dump names
   the thread that stopped answering and what it was waiting on. Android keeps
   the dumps in /data/anr, which a release adbd cannot read, so ask adbd for
   root first and say when the build refuses. The smoke's system images are
   userdebug, so CI gets the dump. */
async function anrTraceReport() {
  const root = adbSafe(['root'], 20000);
  if (/cannot run as root/i.test(root)) return ['anr: adbd cannot run as root, so no trace was readable'];
  // Switching adbd to root restarts it; the device is briefly away.
  await settleDevice('reading the last ANR trace', 15000);

  const newest = adbSafe(['shell', 'ls', '-t', '/data/anr'], 20000)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^ls:/.test(line))[0];
  if (!newest) return ['anr: no trace was readable from /data/anr'];

  const text = adbSafe(['exec-out', 'cat', `/data/anr/${newest}`], 30000);
  if (!text) return [`anr: /data/anr/${newest} could not be read`];

  const lines = text.split('\n');
  // Each section is headed by `----- pid N ...` (the process's threads) or
  // `----- Waiting Channels: pid N ...` (the kernel waits). The app's are the
  // ones with its Cmd line; a process frozen before it could be dumped has
  // only the second kind.
  const sections = [];
  for (let at = 0; at < lines.length; at++) {
    const header = /^----- (?:pid|Waiting Channels: pid) (\d+)/.exec(lines[at]);
    if (!header) continue;
    const end = lines.findIndex((line, after) => after > at && line === `----- end ${header[1]} -----`);
    sections.push({ from: at, to: end > at ? end : lines.length - 1 });
  }
  const ours = sections.filter((section) =>
    lines.slice(section.from, section.to + 1).some((line) => line.startsWith(`Cmd line: ${PACKAGE}`))
  );
  if (!ours.length) {
    return [`anr: /data/anr/${newest} does not name ${PACKAGE}; its head follows`].concat(
      lines.slice(0, 40).map((line) => `anr: ${line}`)
    );
  }
  const block = lines.slice(ours[0].from, ours[ours.length - 1].to + 1);
  const reason = lines[0].startsWith('Subject: ') ? [`anr: ${lines[0]}`] : [];
  const shown = block.slice(0, 200).map((line) => `anr: ${line}`);
  if (block.length > 200) shown.push(`anr: (${block.length - 200} more lines in /data/anr/${newest})`);
  return [`anr: /data/anr/${newest}`].concat(reason, shown);
}

/* The one line a failing check carries: an events record says why the platform
   ended the process ("anr", "excessive cpu", "low memory"), a crash buffer
   line says where. Prefer the named reason, then the trace, then whatever was
   recorded. */
function describeDeath(report) {
  const line =
    report.find((entry) => /^event: .*am_(anr|kill|crash)/.test(entry)) ||
    report.find((entry) => entry.startsWith('crash: ')) ||
    report[0];
  return line ? line.replace(/^(event|crash): /, '') : 'no cause was recorded';
}

/* Starts the activity and points the devtools port at its WebView. A cold
   boot can start the process and then lose the WebView before it exposes the
   socket (adbd keeps refusing `webview_devtools_remote_<pid>` and the launcher
   is left on screen), so the launch has to be repeatable. */
async function launchApp() {
  adb(['shell', 'am', 'force-stop', PACKAGE]);
  const started = adb(['shell', 'am', 'start', '-n', ACTIVITY]);
  if (/^Error/im.test(started) || /does not exist/i.test(started)) {
    fail(`the activity did not start: ${started}`);
  }
  // A launch can die before `pidof` ever sees it. That is still a death, so
  // report what the platform recorded instead of only the timeout.
  const launched = await waitFor('the app process', appPid, 45000, 300);
  if (!launched.value) {
    const report = await processDeathReport();
    for (const line of report) log(line);
    for (const line of await anrTraceReport()) log(line);
    fail(`the app process did not start: ${describeDeath(report)}`);
  }
  const pid = launched.value;
  log(`running as pid ${pid}`);
  if (forwarded) {
    try {
      adb(['forward', '--remove', `tcp:${PORT}`]);
    } catch (error) {
      // A forward that is already gone is the state we want.
    }
  }
  adb(['forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`]);
  forwarded = true;
  return pid;
}

async function connectToWebView() {
  // The reattach path is called from a probe that must be able to time out, so
  // a missing target throws instead of ending the process.
  const found = await waitFor('the WebView devtools target', devtoolsTarget, 45000);
  if (!found.value) {
    const live = await deviceLive();
    throw new Error(
      `the WebView devtools target did not appear (app pid ${appPid() || 'gone'},` +
        ` emulator ${live ? 'alive' : 'not answering'})` +
        (found.error ? `: ${found.error.message}` : '')
    );
  }
  const target = found.value;
  const socket = await attach(target.webSocketDebuggerUrl);
  const bound = { socket, target, closed: false, evaluate: session(socket).evaluate };
  socket.addEventListener('close', () => { bound.closed = true; });
  currentSession = bound;
  log(`attached to ${target.url}`);
  return bound;
}

/* The launch layer's own marker: documentElement gets `home-ready` once the
   launch layer finished and the hub built, which is the first evidence that a
   cold start painted rather than only connected. A socket that appeared and
   then died with its process is what a failed first launch looks like, so the
   socket alone does not prove a start. */
async function homeReady() {
  try {
    // A page torn down mid-launch has no documentElement; that is "not ready",
    // not a probe failure that would hide the death recorded for the process.
    return await evaluate(
      "Boolean(document.documentElement && document.documentElement.classList.contains('home-ready'))"
    );
  } catch (error) {
    // A dead or replaced WebView is a launch failure to report; anything else
    // is a real error.
    if (/devtools target|devtools socket|did not answer/i.test(error.message)) {
      log(`the WebView is not ready: ${error.message}`);
      return false;
    }
    throw error;
  }
}

/* Starts the app and proves it painted. This launch is the one the checks run
   on: the start a player gets is the one asserted, not a second, warmer start.
   The smoke used to spend a cold launch and then restart the app to assert the
   fresh process, but that restart was not free. In run #142 the second start
   (pid 4057) attached to the WebView's devtools socket at 04:35:42 and never
   reported home-ready; at 04:35:49 the platform recorded `Input dispatching
   timed out ... Waited 5004ms for FocusEvent(hasFocus=true)`, and at 04:35:54
   it killed the process (`am_kill ... user request after error`). With error
   dialogs hidden, ActivityManager has no dialog to show for an ANR and ends
   the app instead; the relaunch that followed then turned a dead launch into a
   green run. One launch removes the restart, and a death on it fails the smoke
   with the crash or kill the platform recorded.
   Only the emulator going away stays recoverable (exit status 3), because that
   is not the app's failure. */
async function startAndProveLaunch() {
  log('starting the app');
  let pid = '';
  let problem = null;
  try {
    pid = await launchApp();
    await connectToWebView();
    const ready = await waitFor('the WebView to reach home-ready', homeReady, 60000, 300);
    if (!ready.value) problem = ready.error ? ready.error.message : 'it never reached home-ready';
  } catch (error) {
    if (error instanceof EmulatorLost) throw error;
    problem = error.message;
  }
  if (problem) {
    // Put the cause in the log and in the failing annotation: a missing pid on
    // its own is what made an earlier dead launch look like a slow one.
    const report = await processDeathReport(pid);
    for (const line of report) log(line);
    for (const line of await anrTraceReport()) log(line);
    fail(
      `the launch failed (app pid ${pid || 'unknown'}):` +
        ` ${describeDeath(report)} [${problem}]`
    );
  }
  log('the WebView reached home-ready');
}

// Reattach on a dropped socket, then repeat the expression: the first target
// can be replaced while Capacitor loads the page, which used to end the run.
async function evaluate(expression, awaitPromise = false) {
  if (!currentSession || currentSession.closed) await connectToWebView();
  try {
    return await currentSession.evaluate(expression, awaitPromise);
  } catch (error) {
    if (!/devtools socket closed/i.test(error.message)) throw error;
    log('the WebView devtools socket closed; reattaching');
    await connectToWebView();
    return currentSession.evaluate(expression, awaitPromise);
  }
}

async function devtoolsTarget() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  if (!response.ok) throw new Error(`devtools listing returned ${response.status}`);
  const targets = await response.json();
  return targets.find((target) => target.type === 'page' && /localhost|index\.html/.test(target.url)) || null;
}

let forwarded = false;
let rotationSetting = null;
let nightSetting = null;
try {
  await until('the device to finish booting', () => adb(['shell', 'getprop', 'sys.boot_completed']) === '1', 180000, 1000);

  log(`installing ${APK}`);
  adb(['install', '-r', '-t', APK]);

  // Not `am start -W`: the hub animates from the first frame, so the activity
  // never goes idle and the wait reports a timeout even though it launched.
  // The process and the WebView target are the real evidence, and both are
  // asserted before any check runs.
  await startAndProveLaunch();

  const hub = await evaluate("Boolean(document.getElementById('hub'))");
  if (!hub) fail('the hub did not render after home-ready');

  // The strip behind the bars is the window drawable. It has to agree with the
  // page before a palette tap, and it has to follow the tap: this is the exact
  // regression where the bar restyle rewrote the drawable after the report and
  // the strip sat on the colour the app opened with until a restart.
  const before = (
    await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--page').trim()")
  ).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(before)) fail(`the page colour is not a hex value: ${before}`);

  // The top band is the window drawable behind the status bar. The bottom of
  // the hub is content (the daily card reaches the bottom edge under gesture
  // navigation), so it is not a window sample; both bands share one drawable,
  // and the top is enough to prove it followed the page.
  await awaitStrip(before, 'the window strip before the palette tap');
  log(`the window strip is on the page colour: ${before}`);

  const currentPalette = await evaluate(
    "window.MergeTheme && window.MergeTheme.palette ? window.MergeTheme.palette() : null"
  );
  const targetPalette = ['ocean', 'forest', 'berry'].find((id) => id !== currentPalette) || 'ocean';
  const opener = await evaluate(
    "(() => { const button = document.getElementById('appearance');" +
      " if (!button) return 'the hub has no appearance button'; button.click(); return ''; })()"
  );
  if (opener) fail(opener);

  const swatch = await evaluate(
    '(() => { const option = document.querySelector(' +
      JSON.stringify(`#palettes [data-palette-opt="${targetPalette}"]`) +
      "); if (!option) return 'the appearance sheet has no " + targetPalette + " swatch';" +
      " option.click(); return ''; })()"
  );
  if (swatch) fail(swatch);

  const after = (
    await until(
      `the ${targetPalette} palette to apply`,
      async () => {
        const colour = await evaluate(
          "getComputedStyle(document.documentElement).getPropertyValue('--page').trim()"
        );
        return colour.toLowerCase() !== before ? colour.toLowerCase() : null;
      },
      15000,
      250
    )
  ).toLowerCase();

  // Close the sheet before reading pixels: while it is open its card covers
  // the navigation-bar band, so the bottom sample would be the card's colour
  // rather than the window drawable behind the bars.
  const closed = await evaluate(
    "(() => { const done = document.getElementById('sheet-done');" +
      " if (!done) return 'the appearance sheet has no done button'; done.click(); return ''; })()"
  );
  if (closed) fail(closed);
  // Wait out the sheet's 320ms leave and the fade before sampling.
  await wait(900);

  // Poll rather than sleep: the colour crosses the bridge asynchronously, and a
  // slow runner should still pass. A stale strip never matches and reports what
  // it actually showed.
  const deadline = Date.now() + 30000;
  let seenStrip = null;
  while (Date.now() < deadline) {
    seenStrip = await readStrip();
    if (seenStrip.top === after) break;
    await wait(600);
  }
  if (!seenStrip || seenStrip.top !== after) {
    fail(
      `the window strip did not follow the ${targetPalette} palette: expected ${after},` +
        ` got top ${seenStrip && seenStrip.top} bottom ${seenStrip && seenStrip.bottom}`
    );
  }
  log(`the window strip followed the ${targetPalette} palette: ${after}`);

  // The page surface itself, not only the strip: the WebView's composited
  // scrollers used to keep the previous appearance's raster, so the hub stayed
  // on the old page colour while every control took the new one.
  // Poll rather than sample once: a screencap is slow enough on a loaded
  // emulator to return a stale frame. A stale surface never matches, and the
  // failure reports what it kept showing.
  const surfaceDeadline = Date.now() + 30000;
  let paletteSurface = null;
  while (Date.now() < surfaceDeadline) {
    try {
      paletteSurface = await readPageSurface();
    } catch (error) {
      // Same reconnect gap as the strip read: retry until the deadline.
      await settleDevice('reading the page surface', 15000);
      continue;
    }
    if (paletteSurface === after) break;
    await wait(600);
  }
  if (paletteSurface !== after) {
    if (!(await deviceLive())) throw new EmulatorLost('reading the page surface: the emulator stopped answering');
    fail(
      `the page surface did not repaint on the ${targetPalette} palette:` +
        ` expected ${after}, got ${paletteSurface}`
    );
  }
  log(`the page surface is on the ${targetPalette} palette: ${paletteSurface}`);

  // A configuration change is the other path that rewrites the window: Android
  // re-applies the SystemBars style on a rotation or a day/night switch, and
  // that writes the theme's windowBackground over the page colour. No appearance
  // event fires with it, so the shell has to report the page colour again.
  // Put the page on light first, so a system switch to dark has something to
  // disagree with: the decor resource turns dark while the page must stay light.
  rotationSetting = adb(['shell', 'settings', 'get', 'system', 'accelerometer_rotation']);
  nightSetting = (
    (await adbRetry(['shell', 'cmd', 'uimode', 'night'], 'reading the system night mode')).match(/Night mode:\s*(\w+)/i) || []
  )[1] || 'no';
  const reopen = await evaluate(
    "(() => { const button = document.getElementById('appearance');" +
      " if (!button) return 'the hub has no appearance button'; button.click(); return ''; })()"
  );
  if (reopen) fail(reopen);
  const light = await evaluate(
    "(() => { const option = document.querySelector('#sheet [data-theme-opt=\"light\"]');" +
      " if (!option) return 'the appearance sheet has no light option'; option.click(); return ''; })()"
  );
  if (light) fail(light);
  const lightDone = await evaluate(
    "(() => { const done = document.getElementById('sheet-done');" +
      " if (!done) return 'the appearance sheet has no done button'; done.click(); return ''; })()"
  );
  if (lightDone) fail(lightDone);
  await wait(900);
  const lightPage = (
    await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--page').trim()")
  ).toLowerCase();
  await awaitStrip(lightPage, 'the strip before the configuration changes');

  log('switching the system to dark while the app stays light');
  await settleDevice('switching the system to dark');
  await adbRetry(['shell', 'cmd', 'uimode', 'night', 'yes'], 'switching the system to dark');
  await settleDevice('switching the system to dark');
  await until(
    'the system to report night mode',
    () => evaluate("matchMedia('(prefers-color-scheme: dark)').matches"),
    30000,
    250
  );
  await awaitStrip(lightPage, 'the strip after the system turned dark');
  log('the strip stayed on the page colour through the system theme change');

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

  // The rotation is the last step. Returning to portrait is the same
  // configuration pass in reverse, but this emulator's SwiftShader render
  // thread segfaults on the return (a host crash, not an app crash), and the
  // reverse pass proves nothing the forward one did not. The cleanup below
  // still puts the device back, best effort, after the result is decided.
  log('rotating the device');
  adb(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
  await adbRetry(['shell', 'settings', 'put', 'system', 'user_rotation', '1'], 'rotating to landscape');
  await settleDevice('rotating to landscape');
  await until('the WebView to turn landscape', () => evaluate('innerWidth > innerHeight'), 30000, 250);
  await awaitStrip(lightPage, 'the strip after rotating to landscape');
  log('the strip stayed on the page colour through the rotation');

  if (currentSession) currentSession.socket.close();
  log('the Android shell starts, renders and exposes its native plugins');
} catch (error) {
  if (error instanceof EmulatorLost) {
    console.error(`::error::${error.message}`);
    console.error('::error::the emulator went away before the app could repaint; the smoke will restart it');
    process.exit(EMULATOR_GONE);
  }
  fail(error.message);
} finally {
  // The smoke may have turned the emulator to landscape and to night mode. Put
  // the device back the way it was found, so a local run is not left changed.
  try {
    // If the emulator died on the final rotation, the device is gone; waiting
    // out every retry would only delay a run that has already passed.
    if (await settleDevice('restoring the device settings', 15000)) {
      if (rotationSetting !== null) {
        await adbRetry(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', rotationSetting], 'restoring the rotation setting', 3, false);
      }
      await adbRetry(['shell', 'settings', 'put', 'system', 'user_rotation', '0'], 'restoring the portrait rotation', 3, false);
      if (nightSetting !== null) {
        await adbRetry(['shell', 'cmd', 'uimode', 'night', nightSetting], 'restoring the system night mode', 3, false);
      }
    }
  } catch (error) {
    // Best effort: the job's exit status is what matters.
  }
  if (forwarded) {
    try {
      adb(['forward', '--remove', `tcp:${PORT}`]);
    } catch (error) {
      // Best effort: the job's exit status is what matters.
    }
  }
}
