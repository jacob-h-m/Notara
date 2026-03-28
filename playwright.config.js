// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/visual",
  timeout: 60000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    baseURL: "http://127.0.0.1:5173",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  outputDir: "./test-results",
});
