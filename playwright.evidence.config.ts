import { defineConfig } from '@playwright/test';

/**
 * V02-WI-04 C03 Pass A evidence harness config (Epic §20.1, V02-AC-028).
 * Runs ONLY the evidence-workload specs against the evidence-only production
 * build (instrumented counters, compile-time enabled) served on 4175. This
 * config is never selected by the default `verify:browser` projects, so the
 * evidence build is not part of the ordinary gates.
 *
 * V02-WI-06 E04-C02 adds the Elite workload identity project: the same
 * instrumented build and the same server, but the exact Elite §20.1 workload at
 * the authored `05:20` Elite creation step.
 */
export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  workers: 1,
  timeout: 300_000,
  use: {
    browserName: 'chromium',
    viewport: { width: 1366, height: 768 },
    baseURL: 'http://127.0.0.1:4175',
    // Keep the fixed-step sim at ~1:1 wall time during the long workload wait.
    launchOptions: {
      args: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
      ],
    },
  },
  projects: [
    {
      name: 'evidence',
      testMatch: /wi04-evidence-performance\.spec\.ts/,
    },
    {
      name: 'elite-evidence',
      testMatch: /wi06-evidence-elite-pass-a\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'npm run build:evidence && npm run preview:evidence',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
