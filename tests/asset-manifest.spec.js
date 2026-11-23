const { test, expect } = require('@playwright/test');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'asset-manifest.json');

test('the shell content-hash manifest is generated and current', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/asset-manifest.mjs', '--check'],
    { cwd: root, encoding: 'utf8' }
  );

  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain('shell files match their content hashes');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  expect(manifest.shell.length).toBeGreaterThan(20);
  for (const entry of manifest.shell) {
    expect(entry.path).not.toContain('\\');
    expect(entry.path).not.toContain('..');
    expect(entry.bytes).toBeGreaterThan(0);
    expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(manifest.shell.some((entry) => entry.path === 'css/styles.css')).toBe(true);
  expect(manifest.shell.some((entry) => entry.path === 'icons/icon-512.png')).toBe(true);
});
