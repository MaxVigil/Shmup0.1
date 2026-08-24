import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    viewport: { width: 1366, height: 768 },
  },
  projects: [
    {
      name: 'development',
      use: { baseURL: 'http://127.0.0.1:4173' },
      // S14 test-cost delta: the full behavioural browser suite runs against
      // the development server once. The compact production smoke (Delivery §7
      // plus production-only checks) is the production project's contract and
      // is not repeated against the dev server.
      testIgnore: /production-smoke\.spec\.ts/,
    },
    {
      name: 'production',
      use: { baseURL: 'http://127.0.0.1:4174' },
      // S14 test-cost delta: production re-verifies the golden path and the
      // production-only boundaries (base path, lazy Combat chunk, Debug
      // exclusion, console, request boundary, artifact hygiene) instead of
      // repeating the full DEV behaviour suite against the built artifact.
      testMatch: /production-smoke\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4174',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
    },
  ],
});
