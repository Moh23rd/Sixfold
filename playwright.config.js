const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  workers: 1,
  // A shared runner occasionally misses a timing window in the long responsive
  // sweep; one retry absorbs that blip, while a real failure still fails both
  // attempts. Local runs stay strict.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
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
