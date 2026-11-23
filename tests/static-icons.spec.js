const { test, expect } = require('@playwright/test');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const snapshots = JSON.parse(fs.readFileSync(path.join(root, 'assets/icon-snapshots.json'), 'utf8'));

test('the static icon outputs match the one master and their snapshots', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-icon-snapshots.mjs'],
    { cwd: root, encoding: 'utf8' }
  );

  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain('static icon files match assets/icon.png snapshots');
  expect(snapshots.source).toBe('assets/icon.png');
  expect(snapshots.files.length).toBeGreaterThan(20);
  expect(snapshots.files.some((entry) => entry.path === 'icons/icon-192.png')).toBe(true);
  expect(snapshots.files.some((entry) => entry.path.endsWith('/mipmap-xxxhdpi/ic_launcher_foreground.png'))).toBe(true);
  expect(snapshots.files.some((entry) => /-(ar|hi|kn|han)\.png$/.test(entry.path))).toBe(false);
});
