const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('the launcher icon stays full-bleed and static', () => {
  const result = execFileSync(process.execPath, ['scripts/guard-adaptive-icon.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8'
  });
  expect(result).toContain('no locale-qualified launcher resources');

  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const xml = fs.readFileSync(
      path.join(root, 'android/app/src/main/res/mipmap-anydpi-v26', name),
      'utf8'
    );
    expect(xml, name + ' keeps the full-bleed layer').not.toContain('<inset');
    expect(xml).toContain('@mipmap/ic_launcher_background');
    expect(xml).toContain('@mipmap/ic_launcher_foreground');
  }

  const res = path.join(root, 'android/app/src/main/res');
  const allowed = new Set(['anydpi-v26', 'ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']);
  for (const entry of fs.readdirSync(res)) {
    if (!entry.startsWith('mipmap-')) continue;
    expect(allowed.has(entry.slice('mipmap-'.length)), entry + ' is not locale-qualified').toBe(true);
  }

  const scripts = require('../package.json').scripts;
  expect(scripts['native:assets:android']).toContain('guard-adaptive-icon.mjs');
  expect(scripts['assets:icons']).toContain('build-static-icons.py');
  expect(scripts['assets:icons']).toContain('--write');
  for (const size of [180, 192, 512, 1024]) {
    for (const locale of ['ar', 'hi', 'kn', 'han']) {
      expect(
        fs.existsSync(path.join(root, `icons/icon-${size}-${locale}.png`)),
        `icons/icon-${size}-${locale}.png must not return`
      ).toBe(false);
    }
  }
});

test('the guard rejects a locale-qualified launcher directory', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sixfold-res-'));
  try {
    const res = path.join(temp, 'android/app/src/main/res');
    fs.cpSync(path.join(root, 'android/app/src/main/res'), res, { recursive: true });
    fs.mkdirSync(path.join(res, 'mipmap-ar-hdpi'));
    fs.copyFileSync(
      path.join(res, 'mipmap-hdpi/ic_launcher_foreground.png'),
      path.join(res, 'mipmap-ar-hdpi/ic_launcher_foreground.png')
    );

    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/guard-adaptive-icon.mjs'), '--check'],
      { cwd: temp, encoding: 'utf8' }
    );

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('mipmap-ar-hdpi is locale-qualified');
    expect(result.stderr).toContain('the launcher icon is static');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
