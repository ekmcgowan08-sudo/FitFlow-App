import { defineConfig, devices } from '@playwright/test';

// Talks to a real API + Postgres + this dashboard's dev server, all
// already running — see e2e/README.md for how to bring them up. Not a
// component-test setup: every spec here exercises the full stack the
// same way a person would, which is the point (these replace the
// scratch verification scripts used to manually check this dashboard
// throughout its own development).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // specs share seeded demo accounts; parallel runs would race each other's state
  retries: process.env.CI ? 1 : 0,
  // 'html' always writes playwright-report/ (open: 'never' so CI
  // doesn't try to launch a browser to view it) — CI uploads that
  // directory as a build artifact on failure; see .github/workflows/ci.yml.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The sandbox this suite was developed in ships Chromium at a
        // fixed path with PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 (no `npx
        // playwright install`). CI or a developer machine with a normal
        // Playwright install won't have PLAYWRIGHT_CHROMIUM_PATH set, so
        // this falls back to Playwright's own managed browser.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--no-sandbox'] }
          : {},
      },
    },
  ],
});
