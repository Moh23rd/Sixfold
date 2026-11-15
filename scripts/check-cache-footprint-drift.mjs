#!/usr/bin/env node
import fs from 'node:fs';

// A change under this amount is treated as normal content churn. Above it,
// storage growth needs review before it consumes the remaining 2 MiB headroom.
const MIN_INCREASE_BYTES = 24 * 1024;
const INCREASE_RATIO = 0.015;
const CEILING_WARNING_RATIO = 0.10;

function usage() {
  console.error('Usage: node scripts/check-cache-footprint-drift.mjs --current <report.json> --previous <report.json>');
  process.exit(2);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--current') args.current = argv[index + 1];
    else if (argv[index] === '--previous') args.previous = argv[index + 1];
    else usage();
    index += 1;
  }
  if (!args.current || !args.previous) usage();
  return args;
}

function readReport(file, label) {
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error('Could not read the ' + label + ' report at ' + file + ': ' + error.message);
  }

  let report;
  try {
    report = JSON.parse(source);
  } catch (error) {
    throw new Error('The ' + label + ' report at ' + file + ' is not valid JSON: ' + error.message);
  }

  if (!report || !Array.isArray(report.locales)) {
    throw new Error('The ' + label + ' report at ' + file + ' has no locales array');
  }
  return report;
}

function localesByCode(report, label) {
  const locales = new Map();
  for (const entry of report.locales) {
    if (!entry || typeof entry.locale !== 'string' || !Number.isFinite(entry.totalBytes) || entry.totalBytes < 0) {
      throw new Error('The ' + label + ' report contains an invalid locale entry');
    }
    if (locales.has(entry.locale)) {
      throw new Error('The ' + label + ' report contains duplicate locale ' + entry.locale);
    }
    locales.set(entry.locale, entry.totalBytes);
  }
  return locales;
}

function kibibytes(bytes) {
  return (bytes / 1024).toFixed(1);
}

function allowedIncrease(previousBytes) {
  return Math.max(MIN_INCREASE_BYTES, Math.ceil(previousBytes * INCREASE_RATIO));
}

function summaryDrift(row) {
  if (row.previousBytes === undefined) return 'New locale';
  return row.failed ? '**FAIL** (limit ' + kibibytes(row.limit) + ' KiB)' : 'OK';
}

function summaryCeiling(row, maxLocaleBytes) {
  if (row.currentBytes > maxLocaleBytes) {
    return '**OVER** (' + kibibytes(row.currentBytes - maxLocaleBytes) + ' KiB over)';
  }
  if (row.nearCeiling) {
    return '**WARN** (' + kibibytes(maxLocaleBytes - row.currentBytes) + ' KiB headroom)';
  }
  return 'OK';
}

function writeStepSummary({ currentPath, previousPath, maxLocaleBytes, rows, failures, nearCeiling }) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) return;

  const lines = [
    '## Locale cache footprint drift',
    '',
    'Previous: `' + previousPath + '`  ',
    'Current: `' + currentPath + '`  ',
    'Drift limit: the larger of **24.0 KiB** and **1.5%** of the prior footprint.  ',
    'Ceiling warning: within **10%** of the **' + kibibytes(maxLocaleBytes) + ' KiB** ceiling.',
    '',
    '| Locale | Previous | Current | Delta | Drift | Ceiling |',
    '| --- | ---: | ---: | ---: | --- | --- |'
  ];

  for (const row of rows) {
    const previous = row.previousBytes === undefined ? 'n/a' : kibibytes(row.previousBytes) + ' KiB';
    const current = kibibytes(row.currentBytes) + ' KiB';
    const delta = row.delta === undefined ? 'n/a' : (row.delta >= 0 ? '+' : '') + kibibytes(row.delta) + ' KiB';
    lines.push(
      '| ' + row.locale + ' | ' + previous + ' | ' + current + ' | ' + delta + ' | ' +
      summaryDrift(row) + ' | ' + summaryCeiling(row, maxLocaleBytes) + ' |'
    );
  }

  if (nearCeiling.length > 0) {
    lines.push('', '### Ceiling warnings', '');
    for (const row of nearCeiling) {
      if (row.currentBytes > maxLocaleBytes) {
        lines.push(
          '- **' + row.locale + '** is ' + kibibytes(row.currentBytes - maxLocaleBytes) +
          ' KiB over the ' + kibibytes(maxLocaleBytes) + ' KiB ceiling.'
        );
      } else {
        lines.push(
          '- **' + row.locale + '** has ' + kibibytes(maxLocaleBytes - row.currentBytes) +
          ' KiB of headroom left below the ' + kibibytes(maxLocaleBytes) + ' KiB ceiling.'
        );
      }
    }
  }

  if (failures.length > 0) {
    lines.push('', '### Drift failures', '');
    for (const row of failures) {
      lines.push(
        '- **' + row.locale + '** grew ' + kibibytes(row.delta) + ' KiB, above the ' +
        kibibytes(row.limit) + ' KiB limit.'
      );
    }
  }

  fs.appendFileSync(target, lines.join('\n') + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const currentReport = readReport(args.current, 'current');
  const previousReport = readReport(args.previous, 'previous');
  const current = localesByCode(currentReport, 'current');
  const previous = localesByCode(previousReport, 'previous');
  const maxLocaleBytes = currentReport.maxLocaleBytes;

  if (!Number.isFinite(maxLocaleBytes) || maxLocaleBytes <= 0) {
    throw new Error('The current report has no valid maxLocaleBytes');
  }

  const warningThreshold = maxLocaleBytes * (1 - CEILING_WARNING_RATIO);
  console.log('[cache footprint drift] previous: ' + args.previous);
  console.log('[cache footprint drift] current:  ' + args.current);
  console.log(
    '[cache footprint drift] limit:    max of ' + kibibytes(MIN_INCREASE_BYTES) + ' KiB and ' +
    (INCREASE_RATIO * 100).toFixed(1) + '% of the prior footprint'
  );
  console.log(
    '[cache footprint drift] warning:  within ' + (CEILING_WARNING_RATIO * 100).toFixed(0) +
    '% of the ' + kibibytes(maxLocaleBytes) + ' KiB ceiling'
  );
  console.log('');
  console.log('Locale   Previous      Current       Delta       Result');

  const rows = [];
  const failures = [];
  const nearCeiling = [];

  for (const [locale, currentBytes] of current) {
    const near = currentBytes >= warningThreshold;
    const row = {
      locale,
      currentBytes,
      previousBytes: previous.get(locale),
      delta: undefined,
      limit: undefined,
      failed: false,
      nearCeiling: near
    };
    rows.push(row);

    if (near) nearCeiling.push(row);

    if (row.previousBytes === undefined) {
      console.log(
        locale.padEnd(7) + '  ' + 'n/a'.padStart(10) + '  ' + kibibytes(currentBytes).padStart(10) + '  ' +
        'new locale (no baseline)' + (near ? '  near ceiling' : '')
      );
      continue;
    }

    row.delta = currentBytes - row.previousBytes;
    row.limit = allowedIncrease(row.previousBytes);
    row.failed = row.delta > row.limit;
    if (row.failed) failures.push(row);

    console.log(
      locale.padEnd(7) + '  ' +
      kibibytes(row.previousBytes).padStart(10) + '  ' +
      kibibytes(currentBytes).padStart(10) + '  ' +
      ((row.delta >= 0 ? '+' : '') + kibibytes(row.delta)).padStart(10) + '  ' +
      (row.failed ? 'FAIL (limit ' + kibibytes(row.limit) + ' KiB)' : 'ok') +
      (near ? '  near ceiling' : '')
    );
  }

  writeStepSummary({
    currentPath: args.current,
    previousPath: args.previous,
    maxLocaleBytes,
    rows,
    failures,
    nearCeiling
  });

  for (const row of nearCeiling) {
    if (row.currentBytes > maxLocaleBytes) {
      console.log(
        '::warning title=Cache footprint over ceiling (' + row.locale + ')::' +
        kibibytes(row.currentBytes) + ' KiB exceeds the ' + kibibytes(maxLocaleBytes) + ' KiB ceiling by ' +
        kibibytes(row.currentBytes - maxLocaleBytes) + ' KiB.'
      );
    } else {
      console.log(
        '::warning title=Cache footprint near ceiling (' + row.locale + ')::' +
        kibibytes(row.currentBytes) + ' KiB is within 10 percent of the ' + kibibytes(maxLocaleBytes) +
        ' KiB ceiling (' + kibibytes(maxLocaleBytes - row.currentBytes) + ' KiB headroom).'
      );
    }
  }

  console.log('');
  if (failures.length === 0) {
    console.log('[cache footprint drift] No locale grew beyond its allowed increase.');
    return;
  }

  for (const failure of failures) {
    console.log(
      '::error title=Cache footprint drift (' + failure.locale + ')::Grew ' +
      kibibytes(failure.delta) + ' KiB (' + kibibytes(failure.previousBytes) + ' -> ' +
      kibibytes(failure.currentBytes) + ' KiB), above the ' + kibibytes(failure.limit) + ' KiB limit.'
    );
  }
  console.log('[cache footprint drift] ' + failures.length + ' locale(s) exceeded the allowed increase.');
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.log('::error title=Cache footprint drift check::' + error.message);
  process.exitCode = 1;
}
