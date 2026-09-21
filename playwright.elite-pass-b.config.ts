import { defineConfig } from '@playwright/test';

/**
 * V02-WI-06 E04-C02 Elite Pass B harness config (Epic §20.1, V02-AC-028).
 * Runs ONLY the Elite workload timing spec against the production-optimized
 * UNINSTRUMENTED scenario artifact (scenarios ON so the read-only Elite
 * workload identity observer exists, workload counters OFF so no Pass A counter
 * is compiled in) served on port 4177. This config is never selected by the
 * default `verify:browser` projects: the ordinary production Pass B record keeps
 * using the ordinary `dist` artifact on 4174.
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
    baseURL: 'http://127.0.0.1:4177',
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
      name: 'elite-pass-b',
      testMatch: /wi06-evidence-elite-pass-b\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command:
        'npm run build:evidence-uninstrumented && npm run preview:evidence-uninstrumented-elite',
      url: 'http://127.0.0.1:4177',
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
