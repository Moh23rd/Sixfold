const { test, expect } = require('@playwright/test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('the shell reports bytes by asset class with provenance', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-cache-budgets.mjs', '--json'],
    { cwd: root, encoding: 'utf8' }
  );

  expect(result.status, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.total.bytes).toBeGreaterThan(0);
  expect(report.total.bytes).toBeLessThanOrEqual(report.total.budget);
  expect(report.classes.map((entry) => entry.name)).toEqual([
    'documents', 'css', 'js', 'i18n', 'icons', 'fonts'
  ]);

  const icons = report.classes.find((entry) => entry.name === 'icons');
  expect(icons.entries).toBeGreaterThan(0);
  expect(icons.largest[0].path).toMatch(/^icons\//);
  expect(icons.largest[0].bytes).toBeGreaterThan(0);

  for (const entry of report.classes) {
    expect(entry.failed, entry.name + ' should fit its budget').toBe(false);
    expect(entry.bytes).toBeLessThanOrEqual(entry.budget);
  }
});

test('the plain report names each class and its largest file', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-cache-budgets.mjs'],
    { cwd: root, encoding: 'utf8' }
  );

  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('[cache budgets] raw shell:');
  expect(result.stdout).toContain('Largest icons files:');
  expect(result.stdout).toContain('icons/icon-192.png');
  expect(result.stdout).toContain('[cache budgets] every asset class is within its budget.');
});
