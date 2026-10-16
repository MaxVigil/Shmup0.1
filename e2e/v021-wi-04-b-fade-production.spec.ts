import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * V021-WI-04-B focused ordinary-production evidence (patch §4 committed
 * terminal fade, V021-DEC-001, V021-AC-005, Verification §18.1). The
 * production project runs against the fresh built artifact served by
 * `vite preview`: no Debug, no god mode, no forced terminal and no shortened
 * clock. One natural Defeat proves that the committed 30-step fade completes
 * before the single immutable Result is presented and that the unchanged
 * committed Defeat payload is applied exactly once. This is a short focused
 * journey check, not an integrated performance or release claim.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

async function startCombat(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
}

test('one natural ordinary-production Defeat completes its committed fade before presenting one Result (patch §4, V021-AC-005)', async ({
  page,
}) => {
  // A supported-input column-clearing sweep (dwell and advance across the
  // authored columns) flies the aircraft through the descending traffic; the
  // accepted V021-WI-01-C02 measurements record that this ordinary pointer path
  // is destroyed by descending-enemy contact inside the first authored block
  // (their lawn-mower profile died at 18.1 s), so the explicit budget covers the
  // simulation plus residual load, not the assertions. No Debug, god mode,
  // forced terminal or shortened clock is involved.
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await startCombat(page);

  const sweepY = Math.round(MINIMUM_VIEWPORT.height * 0.8);
  const leftX = Math.round(MINIMUM_VIEWPORT.width * 0.1);
  const rightX = Math.round(MINIMUM_VIEWPORT.width * 0.9);
  const columnStep = Math.round(MINIMUM_VIEWPORT.width * 0.04);
  const dwellMs = 1000;
  let sweepX = leftX;
  let lastMoveAt = 0;
  const sweep = async (): Promise<void> => {
    const now = Date.now();
    if (now - lastMoveAt < dwellMs) return;
    await page.mouse.move(sweepX, sweepY);
    sweepX = sweepX + columnStep > rightX ? leftX : sweepX + columnStep;
    lastMoveAt = now;
  };

  // Observe the destruction freeze through the accessible Hull bar and the
  // single Result Overlay. The committed Defeat fade runs between them: the
  // immutable result may not be presented on the freeze step. Both surfaces are
  // sampled in one page evaluation so a teardown between two reads can never
  // stall the observation.
  let frozenAt: number | null = null;
  let presentedAt: number | null = null;
  await expect
    .poll(
      async () => {
        await sweep();
        const sample = await page.evaluate(() => ({
          hull:
            document
              .querySelector('.ds-combat-hud__track')
              ?.getAttribute('aria-valuenow') ?? null,
          result:
            document.querySelector('[role="dialog"]')?.textContent ?? null,
        }));
        if (presentedAt === null) {
          if (sample.hull === '0' && frozenAt === null) frozenAt = Date.now();
          if (sample.result !== null) presentedAt = Date.now();
        }
        return sample.result ?? '';
      },
      { timeout: 180_000, intervals: [60, 100] },
    )
    .toContain('MISSION FAILED');

  expect(frozenAt).not.toBeNull();
  expect(presentedAt).not.toBeNull();
  // The 30 committed fade steps (0.5 s) separate the freeze from the
  // presentation; presenting on the freeze step would land far below the floor.
  expect((presentedAt as number) - (frozenAt as number)).toBeGreaterThanOrEqual(
    300,
  );

  // One immutable Result with the unchanged committed Defeat payload.
  const dialog = page.getByRole('dialog');
  await expect(
    page.getByRole('heading', { name: 'MISSION FAILED' }),
  ).toHaveCount(1);
  await expect(dialog.getByText('Reward')).toBeVisible();
  await expect(dialog.getByText('0 Credits')).toBeVisible();
  await expect(dialog.getByText('Repair cost')).toBeVisible();
  await expect(dialog.getByText('-8 Credits')).toBeVisible();

  // Continue applies the durable payload once and returns to Operations.
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 4')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Interception 02 (Locked)' }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});
