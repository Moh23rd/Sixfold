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
        surface SystemBars rewrote when the strip went stale.

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
  const png = decodePng(adbBuffer(['exec-out', 'screencap', '-p']));
  return { top: stripColour(png, 'top'), bottom: stripColour(png, 'bottom') };
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

  // The strip behind the bars is the window drawable. It has to agree with the
  // page before a palette tap, and it has to follow the tap: this is the exact
  // regression where the bar restyle rewrote the drawable after the report and
  // the strip sat on the colour the app opened with until a restart.
  const before = (
    await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--page').trim()")
  ).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(before)) fail(`the page colour is not a hex value: ${before}`);

  await until(
    `the window strip to match the page (${before}) before the palette tap`,
    async () => {
      const strip = await readStrip();
      return strip.top === before && strip.bottom === before ? strip : null;
    },
    30000,
    500
  );
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

  // Poll rather than sleep: the colour crosses the bridge asynchronously, and a
  // slow runner should still pass. A stale strip never matches and reports what
  // it actually showed.
  const deadline = Date.now() + 30000;
  let seenStrip = null;
  while (Date.now() < deadline) {
    seenStrip = await readStrip();
    if (seenStrip.top === after && seenStrip.bottom === after) break;
    await wait(600);
  }
  if (!seenStrip || seenStrip.top !== after || seenStrip.bottom !== after) {
    fail(
      `the window strip did not follow the ${targetPalette} palette: expected ${after},` +
        ` got top ${seenStrip && seenStrip.top} bottom ${seenStrip && seenStrip.bottom}`
    );
  }
  log(`the window strip followed the ${targetPalette} palette: ${after}`);

  const closed = await evaluate(
    "(() => { const done = document.getElementById('sheet-done');" +
      " if (!done) return 'the appearance sheet has no done button'; done.click(); return ''; })()"
  );
  if (closed) fail(closed);

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
