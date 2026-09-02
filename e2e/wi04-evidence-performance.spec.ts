import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { readEvidenceOwnership } from './evidence-ownership';

/**
 * V02-WI-04 C03/C04 Pass A — instrumented evidence build (Epic §20.1,
 * V02-AC-028; C03 delta 7/9, C04 deltas 1-3). Runs ONLY against the
 * instrumented evidence build (`playwright.evidence.config.ts` → 4175) where
 * the workload counters are compile-time enabled.
 *
 * C04 corrections:
 * - ONE explicit fixed session seed (19023) is forced through the browser
 *   entropy adapter BEFORE bootstrap; the derived canonical mission seed is
 *   asserted identical in Pass A and Pass B (FNV-1a derivation) and recorded
 *   with the session seed in both records.
 * - The exact regular e5 workload is proven at the SAME simulation step:
 *   the record's `exactRegularWorkloadSteps` counts fixed steps whose active
 *   mix is EXACTLY `3 Basic + 1 Ranged + 1 Hunter + 0 Elite` — no lingering
 *   earlier enemy. Every `>=` workload assertion is replaced with this exact
 *   simultaneous-state evidence.
 * - The observation stays alive long enough for the canonical Ranged first
 *   shot (180 steps after activation): the harness polls the record until at
 *   least one active enemy projectile AND non-zero enemy-projectile collision
 *   candidate work are observed, in addition to player-projectile and contact
 *   work. The e5 Encounter is materialised through the deterministic evidence
 *   scenario and sampled before the 10 s e1 arrival, so no earlier group can
 *   contaminate the sample; continuous automatic Machine Gun fire is
 *   preserved.
 */
const EVIDENCE_DIR = join(process.cwd(), '.agent-handoff', 'evidence');
const SESSION_SEED = 19023;
const CANONICAL_MISSION_SEED = 609704137;

/** 32-bit FNV-1a over the ASCII RNG-input string (Technical Foundation §8) —
 *  the exact canonical mission-seed derivation used to assert Pass A and Pass
 *  B agree. */
function fnv1a32(input: string): number {
  const FNV_OFFSET_BASIS = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

async function startCombat(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
}

test('Pass A records exact simultaneous-state e5 workload evidence with the canonical seed and Ranged projectile path (V02-WI-04 C03/C04, V02-AC-028)', async ({
  page,
}) => {
  test.setTimeout(120_000);
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

  // One explicit fixed session seed forced through the browser entropy adapter
  // BEFORE application bootstrap (C04 delta 1).
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

  // Materialise ONLY the authored Mission 01 e5 Encounter through the
  // deterministic evidence scenario (the plan consumed the canonical
  // Ranged/Hunter seed draws at creation). Sample before the 10 s e1 arrival
  // so no earlier group can contaminate the exact-state evidence.
  await page.evaluate(() => {
    window.__shmupEvidence__?.runBenchmarkScenario('m01-e5');
  });

  // Poll until the canonical Ranged first shot is observed (>= 1 active enemy
  // projectile and non-zero enemy-projectile collision candidate work) WHILE
  // the exact 3+1+1+0 state is simultaneously present. The record is read
  // promptly; if the session is disposed first (Defeat), the poll fails.
  let observed: NonNullable<Awaited<ReturnType<typeof readRecord>>> | null =
    null;
  await expect
    .poll(
      async () => {
        observed = await readRecord(page);
        if (observed === null) {
          return false;
        }
        return (
          observed.exactRegularWorkloadSteps > 0 &&
          observed.activeEnemyProjectilesMax >= 1 &&
          observed.collisionWorkMax.enemyProjectileCandidates > 0
        );
      },
      { timeout: 30000, intervals: [200, 300, 500] },
    )
    .toBe(true);
  expect(observed).not.toBeNull();
  const record = observed!;

  // Canonical seed identity: the observed mission seed equals the derived
  // canonical seed from the ONE fixed session seed (identical to Pass B).
  const derivedMissionSeed = fnv1a32(
    `shmup-mvp:rng-v1|${SESSION_SEED}|combat-mission|0`,
  );
  expect(derivedMissionSeed).toBe(CANONICAL_MISSION_SEED);
  expect(record.missionSeed).toBe(CANONICAL_MISSION_SEED);

  // EXACT simultaneous-state proof (C04 delta 2): no `>=` workload assertions.
  expect(record.exactRegularWorkloadSteps).toBeGreaterThan(30);
  // The Ranged projectile path (C04 delta 3) plus player-projectile and
  // contact collision work observed at the canonical collision owner.
  expect(record.activeEnemyProjectilesMax).toBeGreaterThanOrEqual(1);
  expect(record.collisionWorkMax.enemyProjectileCandidates).toBeGreaterThan(0);
  expect(record.collisionWorkMax.playerProjectileCandidates).toBeGreaterThan(0);
  expect(record.collisionWorkMax.contactCandidates).toBeGreaterThan(0);
  expect(record.steps).toBeGreaterThan(0);

  // Supplementary proportional frame-time sample (the authoritative timing is
  // the uninstrumented Pass B record).
  const windowStart = Date.now();
  const { deltas } = await page.evaluate(
    () =>
      new Promise<{ deltas: number[] }>((resolve) => {
        const collected: number[] = [];
        let last = performance.now();
        const start = performance.now();
        const tick = (): void => {
          const now = performance.now();
          collected.push(now - last);
          last = now;
          if (performance.now() - start < 3000) {
            requestAnimationFrame(tick);
          } else {
            resolve({ deltas: collected });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  const sampleWindowMs = Date.now() - windowStart;
  const sorted = [...deltas].sort((a, b) => a - b);
  const meanMs =
    deltas.length === 0
      ? 0
      : deltas.reduce((total, delta) => total + delta, 0) / deltas.length;

  // C05: evidence ownership — the current control runId + source fingerprint.
  const ownership = readEvidenceOwnership();

  const evidence = {
    label:
      'Pass A instrumented evidence build — non-reference local proxy evidence (V02-AC-028)',
    buildIdentifier: buildLines[0] ?? null,
    browser: await page.evaluate(() => navigator.userAgent),
    machine: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpuCount: cpus().length,
      totalMemBytes: totalmem(),
    },
    viewport: { width: 1366, height: 768 },
    workload:
      'Mission 01 e5 Encounter (3 Basic + 1 Ranged + 1 Hunter + 0 Elite) materialised through the deterministic evidence scenario at the fixed seed; sampled before the 10 s e1 arrival with continuous Machine Gun fire',
    sessionSeed: SESSION_SEED,
    canonicalSeed: record.missionSeed,
    runId: ownership.runId,
    sourceFingerprint: ownership.sourceFingerprint,
    sampleWindowMs,
    observedMaxima: {
      activeEnemiesByRole: record.activeEnemiesByRoleMax,
      exactRegularWorkloadSteps: record.exactRegularWorkloadSteps,
      workloadReachedSteps: record.workloadReachedSteps,
      activePlayerProjectiles: record.activePlayerProjectilesMax,
      activeEnemyProjectiles: record.activeEnemyProjectilesMax,
      collisionWorkMax: record.collisionWorkMax,
      steps: record.steps,
    },
    frameTimeMs: {
      count: deltas.length,
      mean: Number(meanMs.toFixed(3)),
      max: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
    },
    sustainedFps: meanMs > 0 ? Number((1000 / meanMs).toFixed(1)) : 0,
    pageErrors: pageErrors.length,
  };

  // Post-run cleanup: no Combat residue after resolving the running mission to
  // Operations (a natural result or Pause → Return to Base).
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

  expect(pageErrors).toEqual([]);

  // C05: the record is written ONLY after the cleanup assertions above have
  // actually passed, with a machine-readable cleanup object measured from the
  // real post-cleanup state.
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

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = join(
    EVIDENCE_DIR,
    'v02-wi-04-instrumented-regular-workload.json',
  );
  const finalEvidence = { ...evidence, cleanup };
  writeFileSync(path, `${JSON.stringify(finalEvidence, null, 2)}\n`);
  console.log('V02-WI04-PASS-A-RECORD', JSON.stringify(finalEvidence));
});

async function readRecord(page: Page): Promise<{
  missionSeed: number;
  activeEnemiesByRoleMax: Record<string, number>;
  activePlayerProjectilesMax: number;
  activeEnemyProjectilesMax: number;
  collisionWorkMax: {
    enemyProjectileCandidates: number;
    playerProjectileCandidates: number;
    contactCandidates: number;
  };
  exactRegularWorkloadSteps: number;
  workloadReachedSteps: number;
  steps: number;
} | null> {
  return page.evaluate(() => window.__shmupEvidence__?.read() ?? null);
}
