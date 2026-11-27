import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const checker = path.join(root, 'scripts/check-unload-bridge.mjs');

function run(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sixfold-unload-'));
  try {
    for (const [name, source] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), source);
    }
    const result = spawnSync(process.execPath, [checker, dir], { cwd: root, encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('a bridge call from a pagehide handler fails the guard', () => {
  const result = run({
    'unload.js':
      '(function () {\n' +
      "  var bridge = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;\n" +
      "  document.addEventListener('pagehide', function () { bridge.cancel(); });\n" +
      '})();\n'
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /unload\.js:3/);
  assert.match(result.stderr, /pagehide handler calls the native bridge \(bridge\.cancel\(\)\)/);
});

test('the guard follows a plugin map taken off the Capacitor proxy', () => {
  const result = run({
    'native.js':
      '(function () {\n' +
      '  var cap = window.Capacitor;\n' +
      '  var plugins = cap.Plugins || {};\n' +
      "  window.addEventListener('beforeunload', function () {\n" +
      '    plugins.App.minimizeApp();\n' +
      '  });\n' +
      '})();\n'
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /plugins\.App\.minimizeApp\(\)/);
});

test('a bridge call outside an unload handler passes, including a named handler', () => {
  const result = run({
    'clean.js':
      '(function () {\n' +
      "  var bridge = window.Capacitor.Plugins.Haptics;\n" +
      "  function stop() { bridge.cancel(); }\n" +
      "  document.addEventListener('visibilitychange', stop);\n" +
      "  document.addEventListener('pagehide', function () { sessionStorage.setItem('x', '1'); });\n" +
      '  stop();\n' +
      '})();\n'
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /keep the bridge quiet while a page unloads/);
});

test('an allowed call is reported as a pass, not a failure', () => {
  const result = run({
    'allowed.js':
      '(function () {\n' +
      '  var bridge = window.Capacitor.Plugins.Haptics;\n' +
      "  document.addEventListener('unload', function () { bridge.cancel(); /* unload-bridge: allow */ });\n" +
      '})();\n'
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
