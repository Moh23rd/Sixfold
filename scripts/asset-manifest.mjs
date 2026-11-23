#!/usr/bin/env node
// A single generated record of the shell's content. The worker cache name is
// still a human-readable release epoch, but this manifest makes the bytes
// behind every shell URL auditable: if an asset changes without the manifest
// being regenerated, CI can name the file before it reaches a packaged shell.
//
//   node scripts/asset-manifest.mjs          # rewrite asset-manifest.json
//   node scripts/asset-manifest.mjs --check  # fail if the file is stale

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, 'asset-manifest.json');
const CHECK = process.argv.includes('--check');

function shellPaths() {
  const source = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const match = source.match(/const SHELL = \[([\s\S]*?)\n\];/);
  if (!match) throw new Error('could not find the SHELL list in sw.js');

  const paths = [];
  for (const line of match[1].split('\n')) {
    const literal = line.match(/^\s*['"]([^'"]+)['"]\s*,?/);
    if (!literal) continue;
    const value = literal[1].split('?')[0].replace(/^\.\//, '');
    if (value && value !== '.') paths.push(value);
  }
  if (paths.length === 0) throw new Error('the SHELL list parsed to no files');
  return paths;
}

function hash(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function build() {
  const seen = new Set();
  const shell = [];
  for (const relative of shellPaths()) {
    if (seen.has(relative)) throw new Error(relative + ' appears in SHELL more than once');
    seen.add(relative);
    const full = path.join(ROOT, relative);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      throw new Error(relative + ' is listed in SHELL but is missing');
    }
    shell.push({
      path: relative,
      bytes: fs.statSync(full).size,
      sha256: hash(full)
    });
  }
  return { shell };
}

function readManifest() {
  if (!fs.existsSync(MANIFEST)) throw new Error('asset-manifest.json has not been generated');
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch (error) {
    throw new Error('asset-manifest.json is not valid JSON: ' + error.message);
  }
}

function compare(expected, actual) {
  const problems = [];
  const actualByPath = new Map();
  if (!Array.isArray(actual.shell)) return ['asset-manifest.json has no shell array'];

  for (const entry of actual.shell) {
    if (!entry || typeof entry.path !== 'string') {
      problems.push('asset-manifest.json contains an invalid shell entry');
      continue;
    }
    if (actualByPath.has(entry.path)) problems.push(entry.path + ' appears twice in asset-manifest.json');
    actualByPath.set(entry.path, entry);
  }

  for (const entry of expected.shell) {
    const current = actualByPath.get(entry.path);
    if (!current) {
      problems.push(entry.path + ' is missing from asset-manifest.json');
      continue;
    }
    if (current.sha256 !== entry.sha256) problems.push(entry.path + ' has a stale content hash');
    if (current.bytes !== entry.bytes) problems.push(entry.path + ' has a stale byte size');
    actualByPath.delete(entry.path);
  }
  for (const extra of actualByPath.keys()) {
    problems.push(extra + ' is in asset-manifest.json but no longer in SHELL');
  }
  return problems;
}

try {
  const generated = build();
  if (CHECK) {
    const problems = compare(generated, readManifest());
    if (problems.length > 0) {
      for (const problem of problems) console.log('::error title=Asset manifest out of date::' + problem);
      console.log('[asset manifest] ' + problems.length + ' problem(s); run npm run assets:manifest.');
      process.exitCode = 1;
    } else {
      console.log('[asset manifest] ' + generated.shell.length + ' shell files match their content hashes.');
    }
  } else {
    fs.writeFileSync(MANIFEST, JSON.stringify(generated, null, 2) + '\n');
    console.log('[asset manifest] wrote ' + generated.shell.length + ' content hashes to asset-manifest.json');
  }
} catch (error) {
  console.log('::error title=Asset manifest::' + error.message);
  process.exitCode = 1;
}
