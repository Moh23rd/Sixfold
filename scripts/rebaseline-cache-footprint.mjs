#!/usr/bin/env node
// Rebaseline a measured locale-cache footprint only with an explicit reason
// and approver. The output is still a normal footprint report, so the CI drift
// check can consume it; the extra metadata travels with the artifact and makes
// the accepted increase visible in review instead of silently resetting it.

import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error(
    'Usage: node scripts/rebaseline-cache-footprint.mjs --current <report.json> --output <baseline.json> ' +
      '--reason <why> --approved-by <name> [--previous <report.json>]'
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!['--current', '--output', '--reason', '--approved-by', '--previous'].includes(flag)) usage();
    if (!argv[index + 1] || argv[index + 1].startsWith('--')) usage();
    const key = flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    args[key] = argv[index + 1];
    index += 1;
  }
  if (!args.current || !args.output || !args.reason || !args.approvedBy) usage();
  return args;
}

function readReport(file, label) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error('Could not read the ' + label + ' report at ' + file + ': ' + error.message);
  }
  if (!report || !Array.isArray(report.locales) || report.locales.length === 0) {
    throw new Error('The ' + label + ' report has no locales array');
  }
  if (!Number.isFinite(report.maxLocaleBytes) || report.maxLocaleBytes <= 0) {
    throw new Error('The ' + label + ' report has no valid maxLocaleBytes');
  }
  const seen = new Set();
  for (const entry of report.locales) {
    if (!entry || typeof entry.locale !== 'string' || !Number.isFinite(entry.totalBytes) || entry.totalBytes < 0) {
      throw new Error('The ' + label + ' report contains an invalid locale entry');
    }
    if (seen.has(entry.locale)) throw new Error('The ' + label + ' report repeats ' + entry.locale);
    seen.add(entry.locale);
  }
  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.reason.trim().length < 10) {
    throw new Error('The rebaseline reason must be at least 10 characters');
  }
  if (args.approvedBy.trim().length < 2) {
    throw new Error('The rebaseline needs an approver');
  }

  const current = readReport(args.current, 'current');
  const previous = args.previous ? readReport(args.previous, 'previous') : null;
  const baseline = {
    ...current,
    baseline: {
      approvedBy: args.approvedBy.trim(),
      reason: args.reason.trim(),
      createdAt: new Date().toISOString(),
      source: path.basename(args.current),
      previous: args.previous ? path.basename(args.previous) : null
    }
  };

  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(baseline, null, 2) + '\n');
  console.log(
    '[cache footprint baseline] recorded ' + baseline.locales.length + ' locales at ' +
      (baseline.maxLocaleBytes / 1024).toFixed(0) + ' KiB from ' + args.current
  );
  console.log('::notice title=Cache footprint rebaseline::' + args.approvedBy.trim() + ': ' + args.reason.trim());
}

try {
  main();
} catch (error) {
  console.log('::error title=Cache footprint rebaseline::' + error.message);
  process.exitCode = 1;
}
