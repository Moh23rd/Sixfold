#!/usr/bin/env node
/*
 * Shell pin drift.
 *
 * Every shell URL carries a ?v= pin, and that pin is the cache key: an installed
 * app keeps serving './js/theme.js?v=6.0.13' until the pin changes, so a file
 * edited without a bump ships new bytes under an old URL and every reader keeps
 * the old copy. Nothing fails visibly, which is why this needs a guard.
 *
 * The comparison is git history, not the version numbers: the commit that last
 * changed a file must be the commit that set its pin, or one of its ancestors.
 *
 *   node scripts/check-shell-pins.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'licenses.html'];
const WORKER = 'sw.js';

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function tryGit(args) {
  try {
    return git(args).trim();
  } catch (err) {
    return '';
  }
}

function read(file) {
  return readFileSync(join(root, file), 'utf8');
}

/* ---------- where the pins live ---------- */

// The worker keeps its versions either in a constant at column zero ('./js/
// daily.js?v=' + DAILY_CODE) or as a literal ('./js/settings.js?v=5.4.0'). Both
// forms resolve to one line a blame can point at.
function workerPins() {
  const lines = read(WORKER).split('\n');
  const constants = new Map();
  lines.forEach((line, index) => {
    const match = line.match(/^const ([A-Z0-9_]+) = '[^']*';/);
    if (match) constants.set(match[1], index + 1);
  });

  const start = lines.findIndex((line) => line.startsWith('const SHELL ='));
  if (start === -1) throw new Error('could not find the SHELL list in ' + WORKER);
  const end = lines.findIndex((line, index) => index > start && line.startsWith('];'));
  if (end === -1) throw new Error('the SHELL list in ' + WORKER + ' is not closed');

  const pins = [];
  for (let index = start; index < end; index += 1) {
    // './js/theme.js?v=' + THEME_JS keeps the constant outside the literal, so
    // the entry itself carries only the path and the ?v= marker.
    const entry = lines[index].match(/^\s*'(\.\/[^']*)'(?:\s*\+\s*([A-Z0-9_]+))?/);
    if (!entry) continue;
    const query = entry[1].indexOf('?v=');
    if (query === -1) continue;
    const path = entry[1].slice(2, query);
    const constant = entry[2] || '';
    if (constant && !constants.has(constant)) {
      throw new Error(WORKER + ' pins ' + path + ' with an undefined constant ' + constant);
    }
    pins.push({
      path,
      label: constant ? constant + ' in ' + WORKER : 'literal pin in ' + WORKER,
      file: WORKER,
      line: constant ? constants.get(constant) : index + 1
    });
  }
  return pins;
}

// The pages pin their own scripts, styles, fonts and install art as attribute
// values or, in the boot scripts, inside a string. The line is the blame target
// either way.
function pagePins(file) {
  const pins = [];
  read(file).split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/([\w./:-]+)\?v=[\w.-]+/g)) {
      const path = match[1].replace(/^https?:\/\/[^/]+\/(?:Sixfold\/)?/, '').replace(/^\.?\//, '');
      pins.push({ path, label: match[0] + ' in ' + file, file, line: index + 1 });
    }
  });
  return pins;
}

/* ---------- history ---------- */

function blame(file) {
  const rows = new Map();
  let sha = '';
  let line = 0;
  for (const row of git(['blame', '--line-porcelain', '--', file]).split('\n')) {
    const header = row.match(/^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/);
    if (header) {
      sha = header[1];
      line = Number(header[2]);
      continue;
    }
    if (row.startsWith('\t')) rows.set(line, sha);
  }
  return rows;
}

// The last commit that changed the file. A local edit is not a commit and
// cannot be compared with a pin yet, so it comes back empty.
function lastCommit(file) {
  return tryGit(['log', '-1', '--format=%H', '--', file]);
}

function isAncestor(older, newer) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', older, newer], { cwd: root, stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
}

function main() {
  if (tryGit(['rev-parse', '--is-inside-work-tree']) !== 'true') {
    console.log('[shell pins] not a git checkout; skipping the drift check');
    return;
  }
  // A shallow clone has no history to compare against, so a green run would be
  // meaningless. Say so instead of pretending the pins are current.
  if (tryGit(['rev-parse', '--is-shallow-repository']) === 'true') {
    console.log('[shell pins] shallow clone; fetch the full history to check pin drift');
    return;
  }

  const pins = [...workerPins(), ...PAGES.flatMap((page) => pagePins(page))];
  if (pins.length === 0) throw new Error('no ?v= pins found in the shell');

  const problems = [];
  const checked = new Set();
  const blames = new Map();
  const history = new Map();

  for (const pin of pins) {
    // The same path can be pinned by the worker and by a page, and both pins
    // have to move with it, so every pin site is checked once.
    const site = pin.file + ':' + pin.line + ':' + pin.path;
    if (checked.has(site)) continue;
    checked.add(site);

    if (!existsSync(join(root, pin.path))) {
      problems.push(pin.label + ' pins ' + pin.path + ', which the source tree does not have');
      continue;
    }

    if (!blames.has(pin.file)) blames.set(pin.file, blame(pin.file));
    if (!history.has(pin.path)) history.set(pin.path, lastCommit(pin.path));

    const pinned = blames.get(pin.file).get(pin.line);
    const changed = history.get(pin.path);
    // A locally edited pin blames to the all-zero commit, and a locally edited
    // file has no last commit: neither can be compared until both are committed.
    if (!pinned || /^0+$/.test(pinned)) {
      problems.push(pin.label + ' has uncommitted changes, so it cannot pin ' + pin.path);
    } else if (!changed) {
      problems.push(pin.path + ' is not committed yet, so its pin cannot be compared');
    } else if (!isAncestor(changed, pinned)) {
      problems.push(
        pin.path + ' changed in ' + changed.slice(0, 7) + ', after its pin (' + pin.label +
        ') was last set in ' + pinned.slice(0, 7) + '. Bump the pin.'
      );
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.log('::error title=Shell pin drift::' + problem);
    console.log('[shell pins] ' + problems.length + ' pin(s) are older than the file they serve.');
    process.exitCode = 1;
    return;
  }

  console.log('[shell pins] ' + checked.size + ' pins agree with the commit that set each one.');
}

try {
  main();
} catch (error) {
  console.log('::error title=Shell pin check::' + error.message);
  process.exitCode = 1;
}
