import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * V02-WI-04 C03 fresh visual evidence (Epic §16.1, V02-AC-024/025; delta 5).
 *
 * The C01 evidence files were false-green: they spawned E1+E5, waited a fixed
 * 400 ms, installed the page-error observer too late, and asserted only the
 * output path. This replacement spawns ONLY the exact Mission 01 e5 Arrival
 * Group (3 Basic + 1 Ranged + 1 Hunter), parks the Aircraft at the left firing
 * lane so the evidence setup cannot prematurely destroy the group, and waits
 * for authoritative development observability to prove the exact active mix
 * AND that all five complete rendered bounds are inside the gameplay viewport
 * before capturing the actual Combat canvas. Page-error and request observers
 * are installed BEFORE navigation and the workload/request/fallback facts are
 * asserted — never merely the output path. Development project only.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };
const EVIDENCE_DIR = join(process.cwd(), '.agent-handoff', 'evidence');

type DevObservability = {
  readonly activeEnemiesByType: Readonly<Record<string, number>>;
  readonly activeEnemyBounds: readonly {
    readonly type: string;
    readonly centerX: number;
    readonly centerY: number;
    readonly width: number;
    readonly height: number;
  }[];
};

async function readDevObservability(
  page: Page,
): Promise<DevObservability | null> {
  return page.evaluate(() => {
    const hook = (
      window as Window & {
        __shmupDevObservability__?: () => unknown;
      }
    ).__shmupDevObservability__;
    return (hook?.() as DevObservability | undefined) ?? null;
  });
}

function isWorkloadFullyInside(
  observability: DevObservability,
  viewport: { width: number; height: number },
): boolean {
  if (
    observability.activeEnemiesByType['basic-drone'] !== 3 ||
    observability.activeEnemiesByType['ranged-drone'] !== 1 ||
    observability.activeEnemiesByType['hunter-drone'] !== 1
  ) {
    return false;
  }
  if (observability.activeEnemyBounds.length !== 5) {
    return false;
  }
  return observability.activeEnemyBounds.every(
    (bounds) =>
      bounds.centerX - bounds.width / 2 >= 0 &&
      bounds.centerX + bounds.width / 2 <= viewport.width &&
      bounds.centerY - bounds.height / 2 >= 0 &&
      bounds.centerY + bounds.height / 2 <= viewport.height,
  );
}

async function startMission(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
}

/** Parks the Aircraft at the far-left firing lane so its automatic Machine Gun
 *  fire cannot cross the e5 group (the setup must not prematurely destroy it). */
async function parkAircraftLeft(page: Page): Promise<void> {
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowLeft');
}

/** Materialises ONLY the authored Mission 01 e5 Arrival Group through the
 *  deterministic dev Debug command (V02-WI-04 C03: out-of-order encounters are
 *  now spawnable), then resumes the simulation. The e5 group is the only
 *  authored group on screen at mission time ~0. */
async function spawnE5Only(page: Page): Promise<void> {
  await page.keyboard.press('F1');
  await page.getByRole('button', { name: 'Spawn E5' }).click();
  await page.keyboard.press('F1');
}

async function captureCanvas(page: Page, fileName: string): Promise<string> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const shot = await page.locator('.ds-combat-canvas canvas').screenshot();
  const path = join(EVIDENCE_DIR, fileName);
  writeFileSync(path, shot);
  return path;
}

async function captureWorkload(
  page: Page,
  fileName: string,
): Promise<{ path: string; observed: DevObservability }> {
  let observed: DevObservability | null = null;
  await expect
    .poll(
      async () => {
        observed = await readDevObservability(page);
        return (
          observed !== null && isWorkloadFullyInside(observed, MINIMUM_VIEWPORT)
        );
      },
      { timeout: 30000, intervals: [200, 250, 500] },
    )
    .toBe(true);
  const path = await captureCanvas(page, fileName);
  return { path, observed: observed! };
}

test('captures only the exact Mission 01 e5 group fully inside the viewport at gameplay scale (V02-AC-024, V02-WI-04 C03)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  // Observers installed BEFORE navigation.
  const pageErrors: string[] = [];
  const requested: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => requested.push(request.url()));

  await page.setViewportSize(MINIMUM_VIEWPORT);
  await startMission(page);
  await parkAircraftLeft(page);
  await spawnE5Only(page);

  const { path, observed } = await captureWorkload(
    page,
    'v02-wi-04-m01-e5-viewport-review.png',
  );

  // Workload facts asserted from authoritative development observability.
  expect(observed.activeEnemiesByType).toEqual({
    'basic-drone': 3,
    'ranged-drone': 1,
    'hunter-drone': 1,
    'elite-drone': 0,
  });
  // All three regular roles are present at gameplay scale in the image.
  const roleTypes = new Set(
    observed.activeEnemyBounds.map((bounds) => bounds.type),
  );
  expect(roleTypes).toEqual(
    new Set(['basic-drone', 'ranged-drone', 'hunter-drone']),
  );

  // Request facts: the approved runtime enemy PNGs were requested and the
  // Combat canvas was actually captured with a non-trivial image.
  const enemyRequests = requested.filter((url) =>
    /\/enemies\/.*\.png/.test(url),
  );
  expect(enemyRequests.length).toBeGreaterThanOrEqual(3);
  expect(requested.some((url) => /\/assets\/source\//.test(url))).toBe(false);
  expect(path).toContain('v02-wi-04-m01-e5-viewport-review.png');
  const fileSize = statSync(path).size;
  expect(fileSize).toBeGreaterThan(5000);
  expect(pageErrors).toEqual([]);
  console.log('V02-WI04-VISUAL-REVIEW', path);
});

test('captures the exact e5 group through the forced prepared-asset fallback path (V02-AC-025, V02-WI-04 C03)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  // Observers installed BEFORE navigation; every enemy PNG request is aborted
  // so the exact procedural fallback geometry renders at gameplay scale.
  const pageErrors: string[] = [];
  const abortedEnemyImages: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/enemies/*.png', async (route) => {
    abortedEnemyImages.push(route.request().url());
    await route.abort();
  });

  await page.setViewportSize(MINIMUM_VIEWPORT);
  await startMission(page);
  await parkAircraftLeft(page);
  await spawnE5Only(page);

  const { path, observed } = await captureWorkload(
    page,
    'v02-wi-04-m01-e5-fallback-viewport.png',
  );

  // Workload facts proven from authoritative development observability.
  expect(observed.activeEnemiesByType).toEqual({
    'basic-drone': 3,
    'ranged-drone': 1,
    'hunter-drone': 1,
    'elite-drone': 0,
  });
  // Fallback facts: every enemy image request was actually aborted, the
  // fallback rendered (no page errors, canvas alive), and the three roles are
  // present.
  expect(abortedEnemyImages.length).toBeGreaterThanOrEqual(3);
  expect(await page.locator('.ds-combat-canvas canvas').count()).toBe(1);
  expect(pageErrors).toEqual([]);
  expect(path).toContain('v02-wi-04-m01-e5-fallback-viewport.png');
  const fileSize = statSync(path).size;
  expect(fileSize).toBeGreaterThan(5000);
  console.log('V02-WI04-FALLBACK-REVIEW', path);
});
