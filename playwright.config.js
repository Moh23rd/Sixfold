const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  workers: 1,
  // A failing spec has to be visible where a reviewer looks. The check run's
  // only channel is its annotations, so without the github reporter a red row
  // says "Process completed with exit code 1" and nothing else — the responsive
  // group failed that way on run 46166690757, and neither its job log nor its
  // uploaded report can be read without repository admin rights. The reporter
  // is CI-only: locally the list output is what a person reads.
  // The JSON file is what scripts/playwright-failure-summary.mjs reads to put
  // the failing specs in the job summary, which is readable where the job log
  // is not.
  reporter: process.env.CI
    ? [
        ['github'],
        ['list'],
        ['json', { outputFile: 'test-results/playwright-report.json' }],
        ['html', { open: 'never', outputFolder: 'playwright-report' }]
      ]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:8000',
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    // The welcome sheet is a first-install screen. Seed its "seen" flag so the
    // existing specs meet the app they are written for; welcome.spec.js opts
    // back out and starts with an empty install.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://127.0.0.1:8000',
          localStorage: [{ name: 'sixfold.welcome.v1', value: '1' }]
        }
      ]
    }
  },
  webServer: {
    command: 'python3 -m http.server 8000 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: true,
    timeout: 15000
  }
});
