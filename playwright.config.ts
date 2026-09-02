import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  // STAB-E2E-WI03 (documented verification-reliability change): cap workers so
  // the timing-sensitive Combat e2e evidence (real-time movement windows, the
  // 100 ms destruction flash sampler) is not starved by parallel browser
  // scheduling on the reference machine. Every test still runs and every
  // assertion is unchanged; the suite simply runs with bounded concurrency.
  // Root cause: under the aggregate `npm run verify:all` (production build +
  // DEV and preview servers) and the machine's ambient load, default worker
  // parallelism made these unchanged wall-clock measurements intermittently
  // miss their deterministic windows.
  workers: 1,
  use: {
    browserName: 'chromium',
    viewport: { width: 1366, height: 768 },
    // STAB-E2E-WI03 + V02-WI-04 C01: real-time mission-clock evidence (the
    // natural Defeat at ~147 s, the e5 workload performance window) must not
    // be slowed by headless Chromium background rAF/timer throttling during
    // long idle waits; these flags keep the fixed-step sim at ~1:1 wall time.
    launchOptions: {
      args: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
      ],
    },
  },
  projects: [
    {
      name: 'development',
      use: { baseURL: 'http://127.0.0.1:4173' },
      // S14 test-cost delta: the full behavioural browser suite runs against
      // the development server once. The compact production smoke (Delivery §7
      // plus production-only checks) is the production project's contract and
      // is not repeated against the dev server. V02-WI-04 C03: the evidence
      // build Pass A and the legacy proxy harness are separate evidence-only
      // runs (own configs/ports) and never run against the dev server.
      testIgnore:
        /production-smoke\.spec\.ts|wi04-evidence-performance\.spec\.ts|legacy-proxy-performance\.spec\.ts/,
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
      // STAB-E2E-WI01: readiness is TCP-level. This Playwright version starts
      // every top-level webServer for every project run, so the DEV gate also
      // launches the production preview server; `vite preview` without a
      // `dist/` artifact answers HTTP 404 for its readiness URL and the DEV
      // gate used to time out before running a single test. The preview
      // process binds and listens regardless of the artifact, so `port`
      // readiness passes and the production smoke (which builds `dist/`
      // first) still asserts the real artifact contents.
      command: 'npm run preview -- --host 127.0.0.1 --port 4174',
      port: 4174,
      reuseExistingServer: false,
    },
  ],
});
