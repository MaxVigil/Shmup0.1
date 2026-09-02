import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import { readEvidenceOwnership } from './evidence-ownership';

/**
 * V02-WI-04 C04 legacy five-Basic production proxy harness (Epic §20.1, delta
 * 5/7). THE SAME harness runs against BOTH the reconstructed immutable base
 * (with the injected identity hook) and the current uninstrumented scenario
 * build. Both sides use the SAME exact five-Basic workload materialization
 * (`window.__legacyBenchmarkIdentity__.spawnFiveBasic()`), the same fixed
 * session seed (19023), the same browser, machine, 1366×768 viewport,
 * automatic Machine Gun fire, fixed-step method, and sample duration, in
 * uninstrumented production optimization mode. Each record PROVES exactly five
 * Basic + zero other enemies concurrently via `readActiveByType()`, and
 * includes mean/p95/p99/max frame time, sustained FPS, minimum sustained
 * window FPS, long tasks, heap before/after, page errors, and cleanup facts.
 *
 * Record paths are selected by `LEGACY_PROXY_RECORD`; `LEGACY_PROXY_SIDE`
 * labels base/post-integration; `LEGACY_PROXY_BUILD_IDENTIFIER` overrides the
 * recorded build identity (the base copy has no git, so the known revision is
 * injected by the runner).
 */
const DEFAULT_EVIDENCE_DIR = join(process.cwd(), '.agent-handoff', 'evidence');
const SESSION_SEED = 19023;

async function startCombat(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
}

async function heapAfterGc(
  page: Page,
  context: BrowserContext,
): Promise<number> {
  const client = await context.newCDPSession(page);
  await client.send('HeapProfiler.collectGarbage');
  const { usedSize } = await client.send('Runtime.getHeapUsage');
  await client.detach();
  return usedSize;
}

async function spawnFiveBasic(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__legacyBenchmarkIdentity__?.spawnFiveBasic();
  });
}

async function readActiveByType(
  page: Page,
): Promise<Record<string, number> | null> {
  return page.evaluate(
    () => window.__legacyBenchmarkIdentity__?.readActiveByType() ?? null,
  );
}

test('records the legacy five-Basic production proxy with exact concurrent workload proof (V02-WI-04 C04, V02-AC-028)', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1366, height: 768 });

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const buildLines: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'info' &&
      message.text().startsWith('[shmup] build ')
    ) {
      buildLines.push(message.text());
    }
  });

  // One fixed session seed forced through the browser entropy adapter before
  // bootstrap, identical on both proxy sides.
  await page.addInitScript((value) => {
    const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    globalThis.crypto.getRandomValues = (array) => {
      if (array instanceof Uint32Array) {
        array.fill(value >>> 0);
        return array;
      }
      return original(array);
    };
  }, SESSION_SEED);

  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await startCombat(page);

  // Materialise the exact five-Basic workload and PROVE exactly five Basic +
  // zero other enemies are concurrently active (never wall-clock alone).
  await spawnFiveBasic(page);
  let identity: Record<string, number> | null = null;
  await expect
    .poll(
      async () => {
        identity = await readActiveByType(page);
        return (
          identity !== null &&
          identity['basic-drone'] === 5 &&
          identity['ranged-drone'] === 0 &&
          identity['hunter-drone'] === 0 &&
          identity['elite-drone'] === 0
        );
      },
      { timeout: 30000, intervals: [200, 300, 500] },
    )
    .toBe(true);
  expect(identity).not.toBeNull();
  const identityProof = identity!;

  const heapBeforeGcBytes = await heapAfterGc(page, context);
  const windowStart = Date.now();
  const { deltas, longTasks } = await page.evaluate(
    () =>
      new Promise<{ deltas: number[]; longTasks: number[] }>((resolve) => {
        const collected: number[] = [];
        const tasks: number[] = [];
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            tasks.push(entry.duration);
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
        let last = performance.now();
        const start = performance.now();
        const tick = (): void => {
          const now = performance.now();
          collected.push(now - last);
          last = now;
          if (performance.now() - start < 6000) {
            requestAnimationFrame(tick);
          } else {
            observer.disconnect();
            resolve({ deltas: collected, longTasks: tasks });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  const sampleWindowMs = Date.now() - windowStart;
  const heapUsedAfterGcBytes = await heapAfterGc(page, context);

  const sorted = [...deltas].sort((a, b) => a - b);
  const percentile = (fraction: number): number =>
    sorted.length === 0
      ? 0
      : (sorted[
          Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
        ] ?? 0);
  const meanMs =
    deltas.length === 0
      ? 0
      : deltas.reduce((total, delta) => total + delta, 0) / deltas.length;
  const sustainedWindowFps: number[] = [];
  {
    let bucketFrames = 0;
    let bucketTime = 0;
    for (const delta of deltas) {
      bucketFrames += 1;
      bucketTime += delta;
      if (bucketTime >= 1000) {
        sustainedWindowFps.push(bucketFrames / (bucketTime / 1000));
        bucketFrames = 0;
        bucketTime = 0;
      }
    }
  }
  const minimumSustainedWindowFps =
    sustainedWindowFps.length === 0
      ? 0
      : Number(Math.min(...sustainedWindowFps).toFixed(1));

  // C05: evidence ownership — the current control runId + source fingerprint.
  const ownership = readEvidenceOwnership();

  const evidence = {
    label:
      'legacy five-Basic production proxy — non-reference local proxy evidence (V02-AC-028, Epic §20.1)',
    buildIdentifier:
      process.env.LEGACY_PROXY_BUILD_IDENTIFIER ?? buildLines[0] ?? null,
    side: process.env.LEGACY_PROXY_SIDE ?? 'unknown',
    browser: await page.evaluate(() => navigator.userAgent),
    machine: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpuCount: cpus().length,
      totalMemBytes: totalmem(),
    },
    viewport: { width: 1366, height: 768 },
    sessionSeed: SESSION_SEED,
    workloadMethod:
      'exact five-Basic materialization via the deterministic identity scenario (spawnFiveBasic), proven exactly 5 Basic + 0 other enemies concurrently',
    identityProof: identityProof,
    sampleWindowMs,
    frameTimeMs: {
      count: deltas.length,
      mean: Number(meanMs.toFixed(3)),
      p95: Number(percentile(0.95).toFixed(3)),
      p99: Number(percentile(0.99).toFixed(3)),
      max: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
    },
    sustainedFps: meanMs > 0 ? Number((1000 / meanMs).toFixed(1)) : 0,
    minimumSustainedWindowFps,
    longTasks: {
      count: longTasks.length,
      maxMs: Number(
        longTasks.reduce((max, value) => Math.max(max, value), 0).toFixed(3),
      ),
    },
    heapUsedBeforeGcBytes: heapBeforeGcBytes,
    heapUsedAfterGcBytes,
    // C05: evidence ownership — the current control runId + source fingerprint.
    runId: ownership.runId,
    sourceFingerprint: ownership.sourceFingerprint,
    pageErrors: pageErrors.length,
  };

  expect(evidence.frameTimeMs.count).toBeGreaterThan(100);
  expect(evidence.minimumSustainedWindowFps).toBeGreaterThanOrEqual(50);
  expect(pageErrors).toEqual([]);

  // Post-run cleanup facts: no Combat residue after resolving to Operations.
  if ((await page.getByRole('dialog').count()) > 0) {
    await page.getByRole('button', { name: 'Continue' }).click();
  } else {
    await page.keyboard.press('KeyP');
    await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to Base' }).click();
  }
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.ds-combat-hud')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // C05 delta 2: the machine-readable cleanup object is recorded ONLY after
  // the cleanup assertions above actually passed, measured from the real
  // post-cleanup state — never pre-authored prose.
  const cleanup = {
    operationsVisible: await page.getByTestId('operations-screen').isVisible(),
    canvasCount: await page.locator('canvas').count(),
    combatHudCount: await page.locator('.ds-combat-hud').count(),
    dialogOverlayCount: await page.getByRole('dialog').count(),
  };
  expect(cleanup.operationsVisible).toBe(true);
  expect(cleanup.canvasCount).toBe(0);
  expect(cleanup.combatHudCount).toBe(0);
  expect(cleanup.dialogOverlayCount).toBe(0);

  mkdirSync(process.env.LEGACY_PROXY_EVIDENCE_DIR ?? DEFAULT_EVIDENCE_DIR, {
    recursive: true,
  });
  const path = join(
    process.env.LEGACY_PROXY_EVIDENCE_DIR ?? DEFAULT_EVIDENCE_DIR,
    process.env.LEGACY_PROXY_RECORD ?? 'legacy-five-basic-proxy.json',
  );
  const finalEvidence = { ...evidence, cleanup };
  writeFileSync(path, `${JSON.stringify(finalEvidence, null, 2)}\n`);
  console.log('V02-WI04-LEGACY-PROXY', JSON.stringify(finalEvidence));
});
