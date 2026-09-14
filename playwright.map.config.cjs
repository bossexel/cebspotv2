const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/map',
  outputDir: './.codex-tmp/map-review/test-results',
  timeout: 20000,
  workers: 1,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    // Use an installed Chrome, or MAP_TEST_CHANNEL=msedge. No browser download is required.
    channel: process.env.MAP_TEST_CHANNEL || 'chrome',
    headless: true,
    viewport: { width: 390, height: 780 },
    deviceScaleFactor: 2,
    hasTouch: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
