const { test, expect } = require('@playwright/test');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts', 'check-cache-footprint-drift.mjs');

function report(arabicBytes) {
  return {
    measuredAt: '2026-11-15T00:00:00.000Z',
    maxLocaleBytes: 2 * 1024 * 1024,
    locales: [
      { locale: 'en', totalBytes: 1400000, entries: 39 },
      { locale: 'ar', totalBytes: arabicBytes, entries: 44 }
    ]
  };
}

test('near-ceiling footprints warn and write the drift table to the step summary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sixfold-footprint-drift-'));
  const currentPath = path.join(dir, 'current.json');
  const previousPath = path.join(dir, 'previous.json');
  const summaryPath = path.join(dir, 'summary.md');

  try {
    const arabicBytes = 1900000;
    fs.writeFileSync(currentPath, JSON.stringify(report(arabicBytes), null, 2));
    fs.writeFileSync(previousPath, JSON.stringify(report(arabicBytes), null, 2));

    const result = spawnSync(process.execPath, [
      script,
      '--current', currentPath,
      '--previous', previousPath
    ], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summaryPath }
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('::warning title=Cache footprint near ceiling (ar)::');
    expect(result.stdout).toContain('1855.5 KiB is within 10 percent of the 2048.0 KiB ceiling');
    expect(result.stdout.match(/::warning title=Cache footprint near ceiling/g)).toHaveLength(1);
    expect(result.stdout).not.toContain('::error');

    const summary = fs.readFileSync(summaryPath, 'utf8');
    expect(summary).toContain('## Locale cache footprint drift');
    expect(summary).toContain('| Locale | Previous | Current | Delta | Drift | Ceiling |');
    expect(summary).toContain('| ar | 1855.5 KiB | 1855.5 KiB | +0.0 KiB | OK | **WARN** (192.5 KiB headroom) |');
    expect(summary).toContain('### Ceiling warnings');
    expect(summary).toContain('**ar** has 192.5 KiB of headroom left below the 2048.0 KiB ceiling.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
