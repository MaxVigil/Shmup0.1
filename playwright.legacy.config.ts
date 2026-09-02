import { defineConfig } from '@playwright/test';

/**
 * V02-WI-04 C03 legacy five-Basic proxy harness config (Epic §20.1, delta 8).
 * Runs the shared `legacy-proxy-performance.spec.ts` against a locally served
 * build on port 4176 — either the reconstructed immutable base copy or the
 * current evidence build (selected by the runner). Never part of the ordinary
 * `verify:browser` projects.
 */
export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  workers: 1,
  timeout: 280_000,
  use: {
    browserName: 'chromium',
    viewport: { width: 1366, height: 768 },
    baseURL: 'http://127.0.0.1:4176',
    launchOptions: {
      args: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
      ],
    },
  },
  projects: [
    {
      name: 'legacy',
      testMatch: /legacy-proxy-performance\.spec\.ts/,
    },
  ],
});
