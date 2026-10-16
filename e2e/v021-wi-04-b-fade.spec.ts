import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { evidenceDirectory } from '../scripts/evidence-output.mjs';

/**
 * V021-WI-04-B focused development-browser evidence (patch §4 committed
 * terminal fade, V021-DEC-001, V021-AC-005, Verification §18.1). The
 * development project drives the real Debug terminal actions through the
 * ordinary committed-write path and asserts the journey-level contract the
 * deterministic layer cannot: a committed terminal runs its exit/fade before
 * the one immutable Result is presented, and a browser-safety event during the
 * committed Defeat fade freezes the remaining steps behind the Resume-only
 * terminal-exit Pause instead of presenting the result.
 *
 * The exact per-step opacity values, the named included/excluded surfaces, the
 * zero-opacity cleanup and the 0/1/14/15/16 and 29/30/31 boundaries are owned
 * by the deterministic simulation/renderer regressions; this file adds the
 * bounded local dense-snapshot frame-cost observation (never an integrated
 * performance claim).
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

/** Opens the real application and starts one Interception mission, waiting for
 *  the settled single Combat canvas (the dev StrictMode transient is disposed). */
async function startCombat(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
}

/** Opens the development Debug Overlay and returns its dialog locator. */
async function openDebug(page: Page) {
  await page.keyboard.press('F1');
  const debug = page.getByRole('dialog');
  await expect(debug.getByRole('heading', { name: 'Debug' })).toBeVisible();
  return debug;
}

test('the committed Success terminal runs its 0.25 s fade concurrently with the exit before one Result is presented (patch §4, V021-AC-005)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);

  // Park on the auto-fire column so player projectiles and enemy surfaces are
  // on screen at the moment the terminal freezes gameplay.
  await page.mouse.move(640, 480);
  const debug = await openDebug(page);
  const triggeredAt = Date.now();
  await debug.getByRole('button', { name: 'Win Mission' }).click();

  // The committed Success becomes eligible immediately (no extra 15 steps)
  // while the 15 fading steps run inside the existing 30-step centring, and
  // the immutable Result opens only once that exit has completed.
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'MISSION COMPLETE' }),
  ).toBeVisible({ timeout: 20000 });
  const elapsed = Date.now() - triggeredAt;
  expect(elapsed).toBeGreaterThanOrEqual(600);
  await expect(dialog.getByText('Credits earned')).toBeVisible();
  await expect(dialog.getByText('8 Credits', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'MISSION COMPLETE' }),
  ).toHaveCount(1);
  await expect(debug.getByRole('heading', { name: 'Debug' })).toHaveCount(0);

  // The one committed Success payload is applied exactly once.
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 20')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('the committed Evacuated terminal runs the shared 30-step fade over the exit before one Result is presented (patch §4, V021-DEC-001)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);

  const debug = await openDebug(page);
  const triggeredAt = Date.now();
  await debug.getByRole('button', { name: 'Evacuate Mission' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'EVACUATED' })).toBeVisible({
    timeout: 20000,
  });
  expect(Date.now() - triggeredAt).toBeGreaterThanOrEqual(600);
  await expect(dialog).toContainText('Mission not completed');
  await expect(dialog.getByText('Retained 50%')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'EVACUATED' })).toHaveCount(1);

  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByText('Credits: 12')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('the committed Defeat runs exactly 30 fade steps with a stationary Aircraft before one Result is presented (patch §4, V021-DEC-001)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);

  // A stationary Aircraft: no centring and no upward flight during the
  // committed Defeat fade.
  await page.mouse.move(400, 480);
  const debug = await openDebug(page);
  const triggeredAt = Date.now();
  await debug.getByRole('button', { name: 'Lose Mission' }).click();

  // The 0.5 s (30-step) committed fade must complete before the immutable
  // Result Overlay is presented; a 400 ms floor fails any early presentation.
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'MISSION FAILED' }),
  ).toBeVisible({
    timeout: 20000,
  });
  expect(Date.now() - triggeredAt).toBeGreaterThanOrEqual(400);
  await expect(debug.getByRole('heading', { name: 'Debug' })).toHaveCount(0);
  await expect(
    dialog.getByRole('heading', { name: 'MISSION FAILED' }),
  ).toHaveCount(1);
  await expect(dialog.getByText('Reward')).toBeVisible();
  await expect(dialog.getByText('0 Credits')).toBeVisible();
  await expect(dialog.getByText('-8 Credits')).toBeVisible();

  // The unchanged atomic Defeat commitment (paid full Repair) is applied once.
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 4')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('a dense frozen snapshot fades without stalling the browser frame loop (bounded local observation, Verification §18.1)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);

  // Build a representative dense frozen snapshot from approved development
  // surfaces only: the authored E1 Encounter (92 Basics) plus one spawned
  // Ranged/Hunter/Elite, with the Aircraft kept on the auto-fire column so
  // player projectiles are also on screen when the terminal freezes gameplay.
  await page.mouse.move(640, 480);
  const debug = await openDebug(page);
  const activeRow = debug.locator('.ds-field-row', {
    hasText: 'Active Enemies',
  });
  await debug.getByRole('button', { name: 'Spawn E1' }).click();
  await expect(activeRow).toContainText('Basic 92');
  await debug.getByRole('button', { name: 'Spawn Ranged' }).click();
  await debug.getByRole('button', { name: 'Spawn Hunter' }).click();
  await debug.getByRole('button', { name: 'Spawn Elite' }).click();
  const activeEnemyText = (await activeRow.textContent())?.trim() ?? '';

  // Sample the page's own animation-frame intervals across the committed fade
  // window. This is a bounded local observation of one frozen snapshot on the
  // development server, not an integrated or reference performance claim.
  await page.evaluate(() => {
    const probe = globalThis as unknown as {
      __v021wi04bFrames?: number[];
      __v021wi04bStop?: boolean;
    };
    probe.__v021wi04bFrames = [];
    probe.__v021wi04bStop = false;
    let last = performance.now();
    const tick = (now: number) => {
      probe.__v021wi04bFrames?.push(now - last);
      last = now;
      if (!probe.__v021wi04bStop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const triggeredAt = Date.now();
  await debug.getByRole('button', { name: 'Lose Mission' }).click();
  // While the committed fade is still running the immutable Result is not
  // presented; capture the frozen, not-yet-faded surface state.
  await page.waitForTimeout(150);
  await expect(
    page.getByRole('heading', { name: 'MISSION FAILED' }),
  ).toHaveCount(0);
  await page.locator('.ds-combat-canvas canvas').screenshot({
    path: join(evidenceDirectory(), 'v021-wi-04-b-defeat-fade-frozen.png'),
  });

  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'MISSION FAILED' }),
  ).toBeVisible({
    timeout: 20000,
  });
  const fadeWindowMs = Date.now() - triggeredAt;
  const frames = await page.evaluate(() => {
    const probe = globalThis as unknown as {
      __v021wi04bFrames?: number[];
      __v021wi04bStop?: boolean;
    };
    probe.__v021wi04bStop = true;
    return probe.__v021wi04bFrames ?? [];
  });

  const sorted = [...frames].sort((left, right) => left - right);
  const observed = {
    committedFadeWindowMs: fadeWindowMs,
    sampledFrames: sorted.length,
    meanFrameIntervalMs:
      sorted.length === 0
        ? null
        : Number(
            (
              sorted.reduce((total, value) => total + value, 0) / sorted.length
            ).toFixed(2),
          ),
    maxFrameIntervalMs:
      sorted.length === 0 ? null : Number(Math.max(...sorted).toFixed(2)),
    p95FrameIntervalMs:
      sorted.length === 0
        ? null
        : Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    framesOver33ms: sorted.filter((value) => value > 33).length,
  };
  const record = {
    schemaVersion: 1,
    workItem: 'V021-WI-04-B',
    kind: 'bounded-local-fade-cost-observation',
    referenceClaim: false,
    recordingSurface:
      'development project, 1280 x 600 viewport, real Phaser canvas',
    fixedStepModel: {
      committedDefeatFadeSteps: 30,
      fadeSeconds: 0.5,
      stepMilliseconds: 16.67,
    },
    denseFrozenSnapshot: {
      activeEnemyRow: activeEnemyText,
      enemyCount: 92 + 3,
      note: 'authored E1 (92 Basics) plus one debug-spawned Ranged, Hunter and Elite; player projectiles in flight from the auto-fire column',
    },
    observed,
    limitations: [
      'One local development-server snapshot with bounded Debug spawns; it is not the accepted dense-workload FPS scenario and certifies no release performance.',
      'The read model reports enemies only; projectile counts are not observable without a test hook, so the projectile surfaces are covered by the deterministic boundaries and the real-renderer regression plus the frozen canvas capture.',
    ],
    capturedAt: new Date().toISOString(),
  };
  const outputPath = join(
    evidenceDirectory(),
    'v021-wi-04-b-fade-cost-observation.json',
  );
  writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`[V021-WI-04-B] fade-cost observation written to ${outputPath}`);

  // Bounded sanity only: a stalled frame loop would show multi-frame gaps far
  // above the 16.7 ms fixed step while the frozen surfaces fade.
  if (sorted.length > 0)
    expect(observed.maxFrameIntervalMs ?? 0).toBeLessThan(120);

  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 4')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('a safety event during the committed Defeat fade freezes and hides the immutable result behind the Resume-only terminal-exit Pause (patch §4, V021-DEC-001)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);
  await openDebug(page);

  // Commit the Defeat and drop window focus immediately afterwards, well
  // inside the 0.5 s (30-step) committed fade window.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === 'Lose Mission',
    );
    if (button === undefined) throw new Error('Lose Mission button missing');
    button.click();
    requestAnimationFrame(() => window.dispatchEvent(new Event('blur')));
  });

  // The remaining fade steps freeze behind the Resume-only terminal-exit
  // Pause, and the immutable Defeat is not presented while they are frozen.
  const pause = page.getByRole('dialog');
  await expect(
    pause.getByText(
      'Mission result saved. Combat remains paused — select Resume to finish.',
    ),
  ).toBeVisible({ timeout: 5000 });
  await expect(pause.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'MISSION FAILED' }),
  ).toHaveCount(0);
  await page.waitForTimeout(1000);
  await expect(
    page.getByRole('heading', { name: 'MISSION FAILED' }),
  ).toHaveCount(0);
  await expect(page.getByText('-8 Credits')).toHaveCount(0);

  // Focus return does not auto-resume; only the explicit Resume continues the
  // remaining committed fade steps and presents the one immutable result.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(500);
  await expect(
    pause.getByText(
      'Mission result saved. Combat remains paused — select Resume to finish.',
    ),
  ).toBeVisible();
  await pause.getByRole('button', { name: 'Resume' }).click();

  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'MISSION FAILED' }),
  ).toBeVisible({
    timeout: 20000,
  });
  await expect(
    page.getByRole('heading', { name: 'MISSION FAILED' }),
  ).toHaveCount(1);
  await expect(dialog.getByText('-8 Credits')).toBeVisible();

  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 4')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
