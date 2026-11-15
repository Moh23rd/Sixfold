#!/usr/bin/env node
import fs from 'node:fs';

// A change under this amount is treated as normal content churn. Above it,
// storage growth needs review before it consumes the remaining 2 MiB headroom.
const MIN_INCREASE_BYTES = 24 * 1024;
const INCREASE_RATIO = 0.015;

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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const current = localesByCode(readReport(args.current, 'current'), 'current');
  const previous = localesByCode(readReport(args.previous, 'previous'), 'previous');

  console.log('[cache footprint drift] previous: ' + args.previous);
  console.log('[cache footprint drift] current:  ' + args.current);
  console.log(
    '[cache footprint drift] limit:    max of ' + kibibytes(MIN_INCREASE_BYTES) + ' KiB and ' +
    (INCREASE_RATIO * 100).toFixed(1) + '% of the prior footprint'
  );
  console.log('');
  console.log('Locale   Previous      Current       Delta       Result');

  const failures = [];
  for (const [locale, currentBytes] of current) {
    const previousBytes = previous.get(locale);
    if (previousBytes === undefined) {
      console.log(locale.padEnd(7) + '  ' + 'n/a'.padStart(10) + '  ' + kibibytes(currentBytes).padStart(10) + '  ' + 'new locale (no baseline)');
      continue;
    }

    const delta = currentBytes - previousBytes;
    const limit = allowedIncrease(previousBytes);
    const failed = delta > limit;
    if (failed) failures.push({ locale, previousBytes, currentBytes, delta, limit });

    console.log(
      locale.padEnd(7) + '  ' +
      kibibytes(previousBytes).padStart(10) + '  ' +
      kibibytes(currentBytes).padStart(10) + '  ' +
      ((delta >= 0 ? '+' : '') + kibibytes(delta)).padStart(10) + '  ' +
      (failed ? 'FAIL (limit ' + kibibytes(limit) + ' KiB)' : 'ok')
    );
  }

  console.log('');
  if (failures.length === 0) {
    console.log('[cache footprint drift] No locale grew beyond its allowed increase.');
    return;
  }

  for (const failure of failures) {
    console.error(
      '::error title=Cache footprint drift (' + failure.locale + ')::Grew ' +
      kibibytes(failure.delta) + ' KiB (' + kibibytes(failure.previousBytes) + ' -> ' +
      kibibytes(failure.currentBytes) + ' KiB), above the ' + kibibytes(failure.limit) + ' KiB limit.'
    );
  }
  console.error('[cache footprint drift] ' + failures.length + ' locale(s) exceeded the allowed increase.');
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error('::error title=Cache footprint drift check::' + error.message);
  process.exitCode = 1;
}
