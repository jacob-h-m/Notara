const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/visual',
  timeout: 60000,
  use: {
    headless: true,
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 800 }
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ]
});
