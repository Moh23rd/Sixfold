/* The shell-pin guard, proved against a throwaway repository.

   The guard compares git history rather than version strings, so only a real
   repository can exercise it: a clean shell has to pass, a file edited without
   its ?v= bump has to fail and name the pins left behind, and the bump has to
   pass again. Without this the guard could rot into a check that prints "pins
   agree" no matter what, and every installed copy would keep serving old bytes
   under an old URL while the shell looked current. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const GUARD = fileURLToPath(new URL('../check-shell-pins.mjs', import.meta.url));

// A commit needs an identity, and the fixture must not depend on the machine's
// git config: a signing or hook setting would fail the commit, not the guard.
const IDENTITY = {
  GIT_AUTHOR_NAME: 'Pin Fixture',
  GIT_AUTHOR_EMAIL: 'pins@example.invalid',
  GIT_COMMITTER_NAME: 'Pin Fixture',
  GIT_COMMITTER_EMAIL: 'pins@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1'
};

const worker = (theme) =>
  [
    `const THEME_JS = '${theme}';`,
    'const SHELL = [',
    "  './index.html',",
    "  './js/theme.js?v=' + THEME_JS",
    '];',
    ''
  ].join('\n');

// index.html pins theme.js too, so the same path is pinned twice: once through
// the worker's constant and once as a page URL, and both pins have to move.
const page = (theme) =>
  [
    '<!doctype html>',
    '<html lang="en">',
    '  <body>',
    `    <script src="./js/theme.js?v=${theme}"></script>`,
    '    <script src="./js/app.js?v=1.0.0"></script>',
    '  </body>',
    '</html>',
    ''
  ].join('\n');

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'sixfold-pins-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'js'));
  mkdirSync(join(dir, 'scripts'));
  // The guard reads its root from its own path, so the copy under test runs
  // against the fixture while the file itself is the committed one.
  copyFileSync(GUARD, join(dir, 'scripts', 'check-shell-pins.mjs'));

  const write = (file, text) => writeFileSync(join(dir, file), text);
  const git = (...args) => {
    const run = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...IDENTITY }
    });
    assert.equal(run.status, 0, `git ${args.join(' ')} failed: ${run.stderr}${run.stdout}`);
    return run.stdout.trim();
  };
  // Returns the commit, so a test can assert the drift message names it.
  const commit = (message) => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const guard = () =>
    spawnSync(process.execPath, ['scripts/check-shell-pins.mjs'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...IDENTITY }
    });

  git('-c', 'init.defaultBranch=main', 'init', '-q');
  write('sw.js', worker('1.0.0'));
  write('index.html', page('1.0.0'));
  write('licenses.html', '<!doctype html>\n<html lang="en"><body><p>GPL-3.0-only</p></body></html>\n');
  write('js/theme.js', "export const theme = 'warm';\n");
  write('js/app.js', "export const app = 1;\n");
  const baseline = commit('shell with pinned scripts');

  return { write, commit, guard, baseline };
}

test('a pinned shell passes', (t) => {
  const { guard } = fixture(t);
  const run = guard();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  // theme.js through sw.js, theme.js and app.js through index.html.
  assert.match(run.stdout, /\[shell pins\] 3 pins agree with the commit that set each one\./);
});

test('a file edited under its pin fails, naming every pin left behind', (t) => {
  const { write, commit, guard, baseline } = fixture(t);
  write('js/theme.js', "export const theme = 'cool';\n");
  const drifted = commit('restyle the theme');

  const run = guard();
  assert.equal(run.status, 1, run.stdout + run.stderr);

  // Both sites pin the same path, and a bump of only one of them is the
  // mistake this guard exists to catch, so both must be reported.
  for (const label of ['THEME_JS in sw.js', './js/theme.js?v=1.0.0 in index.html']) {
    assert.ok(
      run.stdout.includes(
        `js/theme.js changed in ${drifted.slice(0, 7)}, after its pin (${label}) was ` +
          `last set in ${baseline.slice(0, 7)}. Bump the pin.`
      ),
      `no drift reported for ${label}:\n${run.stdout}`
    );
  }
  assert.match(run.stdout, /\[shell pins\] 2 pin\(s\) are older than the file they serve\./);
  // The unedited pin is still current, so it must not be named.
  assert.ok(!run.stdout.includes('js/app.js'), run.stdout);
});

test('bumping the pins makes the guard pass again', (t) => {
  const { write, commit, guard } = fixture(t);
  write('js/theme.js', "export const theme = 'cool';\n");
  commit('restyle the theme');
  write('sw.js', worker('1.0.1'));
  write('index.html', page('1.0.1'));
  commit('bump the theme pin');

  const run = guard();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /\[shell pins\] 3 pins agree with the commit that set each one\./);
});
