const { test, expect } = require('@playwright/test');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts', 'rebaseline-cache-footprint.mjs');

function report() {
  return {
    measuredAt: '2026-11-23T00:00:00.000Z',
    maxLocaleBytes: 2 * 1024 * 1024,
    locales: [
      { locale: 'en', totalBytes: 1400000, entries: 39 },
      { locale: 'ar', totalBytes: 1900000, entries: 44 }
    ]
  };
}

test('a rebaseline carries its reason and approver without changing the measured data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sixfold-rebaseline-'));
  const current = path.join(dir, 'current.json');
  const output = path.join(dir, 'approved.json');
  try {
    fs.writeFileSync(current, JSON.stringify(report(), null, 2));
    const result = spawnSync(process.execPath, [
      script,
      '--current', current,
      '--output', output,
      '--reason', 'Arabic catalog grew for the new accessibility copy',
      '--approved-by', 'release-review'
    ], { encoding: 'utf8' });

    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(result.stdout).toContain('recorded 2 locales');
    expect(result.stdout).toContain('::notice title=Cache footprint rebaseline::');

    const saved = JSON.parse(fs.readFileSync(output, 'utf8'));
    expect(saved.locales).toEqual(report().locales);
    expect(saved.maxLocaleBytes).toBe(2 * 1024 * 1024);
    expect(saved.baseline.approvedBy).toBe('release-review');
    expect(saved.baseline.reason).toContain('accessibility copy');
    expect(saved.baseline.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a rebaseline without a reason or approver is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sixfold-rebaseline-'));
  const current = path.join(dir, 'current.json');
  try {
    fs.writeFileSync(current, JSON.stringify(report()));
    const noReason = spawnSync(process.execPath, [
      script, '--current', current, '--output', path.join(dir, 'out.json'),
      '--reason', 'too short', '--approved-by', 'release-review'
    ], { encoding: 'utf8' });
    expect(noReason.status).toBe(1);
    expect(noReason.stdout).toContain('at least 10 characters');

    const noApprover = spawnSync(process.execPath, [
      script, '--current', current, '--output', path.join(dir, 'out.json'),
      '--reason', 'A sufficiently detailed reason for this baseline'
    ], { encoding: 'utf8' });
    expect(noApprover.status).toBe(2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
