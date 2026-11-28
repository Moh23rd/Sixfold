#!/usr/bin/env node
// Names the specs behind a red Playwright row in the job summary.
//
// The github reporter already annotates each failure, but a reviewer who is
// looking at the run's Overview sees only the check's conclusion; the summary
// is the one page that is readable without repository admin rights. The JSON
// reporter writes the same run's results next to it, and this script turns
// them into a table of spec file, line, title and first error line.
//
// Usage: node scripts/playwright-failure-summary.mjs [report.json]
// The Markdown is appended to $GITHUB_STEP_SUMMARY, or printed when unset.
//
// This is diagnostics, never a gate: a report that is missing (the job timed
// out, or Playwright never started) is reported in the summary and exits 0, so
// the step cannot replace the real failure with its own.

import { appendFileSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

const reportPath = process.argv[2] || 'test-results/playwright-report.json';
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

const stripAnsi = (value) => value.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');

function cell(value) {
  return stripAnsi(String(value)).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
}

function firstLine(error) {
  if (!error) return '';
  const message = typeof error === 'string' ? error : error.message || '';
  return cell(message.split('\n').find((line) => line.trim()) || '');
}

function failuresOf(spec, file) {
  const failures = [];
  for (const test of spec.tests || []) {
    const results = test.results || [];
    const failed = results.filter((result) => result.status === 'failed' || result.status === 'timedOut');
    if (!failed.length && !test.status?.startsWith('unexpected') && test.status !== 'failed') continue;
    const last = failed[failed.length - 1] || results[results.length - 1] || {};
    failures.push({
      file: spec.file || file,
      line: spec.line,
      title: spec.title,
      error: firstLine(last.error)
    });
  }
  return failures;
}

function collect(suites, file, out) {
  for (const suite of suites || []) {
    const owner = suite.file || file;
    for (const spec of suite.specs || []) out.push(...failuresOf(spec, owner));
    collect(suite.suites, owner, out);
  }
  return out;
}

function render(report) {
  const rows = collect(report.suites, report.config?.rootDir, []);
  // The report's file fields are relative to testDir (`hub-hero.spec.js`), not
  // the repository root; the summary shows the path a person would open.
  const testDir = report.config?.rootDir ? basename(report.config.rootDir) : '';
  for (const row of rows) {
    if (testDir && row.file && !row.file.includes('/')) row.file = `${testDir}/${row.file}`;
  }
  const lines = ['## Playwright failures', ''];

  if (!rows.length) {
    lines.push('Playwright reported a failed run, but no individual spec failed.');
    const errors = (report.errors || []).map((error) => firstLine(error)).filter(Boolean);
    if (errors.length) {
      lines.push('', 'The run reported these errors:');
      lines.push('');
      for (const error of errors) lines.push(`- ${error}`);
    }
    return lines;
  }

  lines.push(`**${rows.length} failing test${rows.length === 1 ? '' : 's'}**`);
  lines.push('');
  lines.push('| Spec | Test | Failure |');
  lines.push('| --- | --- | --- |');
  for (const row of rows) {
    const location = row.line ? `${row.file}:${row.line}` : row.file;
    lines.push(`| \`${cell(location)}\` | ${cell(row.title)} | ${row.error || 'no error recorded'} |`);
  }
  lines.push('');
  lines.push('The full report is in this job’s `playwright-report-*` artifact.');
  return lines;
}

let markdown;
try {
  markdown = render(JSON.parse(readFileSync(reportPath, 'utf8')));
} catch (error) {
  markdown = [
    '## Playwright failures',
    '',
    `No Playwright JSON report was available at \`${reportPath}\`, so the failing specs cannot be listed here.`,
    '',
    `Reading it failed with: ${cell(error.message)}`
  ];
}

const text = `${markdown.join('\n')}\n`;
if (summaryPath) appendFileSync(summaryPath, text);
else process.stdout.write(text);
