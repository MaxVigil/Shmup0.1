import { readFileSync } from 'node:fs';

import { evidenceDirectory } from './scripts/evidence-output.mjs';
import { computeSourceFingerprint } from './scripts/evidence-source-fingerprint.mjs';

/**
 * V021-PATCH-STAB-01 C02-SIMPLE local spot-check config (patch specification
 * §7 / V021-DEC-008, Verification §11 and §18.1 step 5).
 *
 * Runs ONLY `v021-performance-spot-check.spec.ts` against the ORDINARY
 * production artifact (`npm run build`, no evidence capability enabled) served
 * on port 4178 — one six-second Mission 01 spot check at `1366 × 768`. Never
 * part of the ordinary `verify:browser` projects or of `verify:smoke`.
 *
 * The module performs output routing and identity only: it opens a fresh
 * evidence attempt directory and forwards the active run id and current source
 * fingerprint to the case, which records them beside the raw sample. No
 * application hook, Debug surface or scenario build is involved.
 */
const directory = evidenceDirectory();
console.log(`Patch-dense spot-check evidence directory: ${directory}`);
try {
  const control = JSON.parse(
    readFileSync('.agent-handoff/control.json', 'utf8'),
  ) as { runId?: unknown };
  if (typeof control.runId === 'string') {
    process.env.SHMUP_EVIDENCE_RUN_ID ??= control.runId;
  }
} catch {
  // No readable active handoff: the record keeps a null run id instead of a
  // fabricated one.
}
try {
  process.env.SHMUP_EVIDENCE_SOURCE_FINGERPRINT ??= JSON.stringify(
    computeSourceFingerprint(),
  );
} catch {
  // Without a computable fingerprint the record keeps null, never a guess.
}

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  workers: 1,
  timeout: 180_000,
  use: {
    browserName: 'chromium',
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    baseURL: 'http://127.0.0.1:4178',
    // Same reasoning as the ordinary projects: the fixed-step simulation must
    // run at ~1:1 wall time while the six-second sample is taken.
    launchOptions: {
      args: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
      ],
    },
  },
  projects: [
    {
      name: 'patch-dense',
      testMatch: /v021-performance-spot-check\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command:
        'npm run build && npm run preview -- --host 127.0.0.1 --port 4178',
      url: 'http://127.0.0.1:4178',
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
