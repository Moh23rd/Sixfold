const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('adaptive icons stay full-bleed with foreground-only localization', () => {
  const result = execFileSync(process.execPath, ['scripts/guard-adaptive-icon.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8'
  });
  expect(result).toContain('only locale foreground PNGs are localized');

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
  for (const locale of ['ar', 'hi', 'kn', 'zh', 'ja']) {
    expect(fs.existsSync(path.join(res, `mipmap-${locale}-anydpi-v26`))).toBe(false);
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      expect(
        fs.existsSync(path.join(res, `mipmap-${locale}-${density}/ic_launcher_foreground.png`)),
        `${locale}/${density} keeps its transparent foreground`
      ).toBe(true);
    }
    for (const entry of fs.readdirSync(res)) {
      if (!entry.startsWith(`mipmap-${locale}-`)) continue;
      const dir = path.join(res, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const name of fs.readdirSync(dir)) {
        if (name === 'ic_launcher_foreground.png') continue;
        expect(
          /^ic_launcher.*\.(png|xml)$/i.test(name),
          `${entry}/${name} must not exist; localized launcher art is foreground-only`
        ).toBe(false);
      }
    }
  }

  const scripts = require('../package.json').scripts;
  expect(scripts['native:assets:android']).toContain('guard-adaptive-icon.mjs');
  expect(fs.existsSync(path.join(root, 'icons/icon-192-ar.png'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'icons/icon-192-han.png'))).toBe(true);
});

test('guard rejects a stray locale launcher PNG', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sixfold-res-'));
  try {
    const res = path.join(temp, 'android/app/src/main/res');
    fs.cpSync(path.join(root, 'android/app/src/main/res'), res, { recursive: true });
    fs.copyFileSync(
      path.join(res, 'mipmap-hdpi/ic_launcher.png'),
      path.join(res, 'mipmap-ar-hdpi/ic_launcher.png')
    );

    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/guard-adaptive-icon.mjs'), '--check'],
      { cwd: temp, encoding: 'utf8' }
    );

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('mipmap-ar-hdpi/ic_launcher.png');
    expect(result.stderr).toContain('only the locale foreground may be localized');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
