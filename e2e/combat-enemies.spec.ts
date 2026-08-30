import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * S10 Enemy Groups and Movement — minimal representative cross-layer/browser
 * evidence (Combat §7, AC-009/015–018, AC-049, AC-054, AC-072–075). Exact
 * seed fixtures, schedule counts, entry placement, trajectories, and escape
 * are covered by deterministic unit tests; the browser proves only that the
 * existing seed path visibly renders solid `danger` Basic Drone squares and
 * that one entry/resize/cleanup path preserves the canvas, render/lazy/request
 * boundaries, and has zero page errors. No 110 s waits and no wall-clock
 * timing/trajectory inference.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

/** Counts `danger` (#d96767) Basic Drone pixels in the upper canvas region
 *  where drones enter; a single coarse presence sample, not motion inference. */
function dronePixelCount(
  page: Page,
  width: number,
  height: number,
): Promise<number> {
  return page
    .locator('.ds-combat-canvas canvas')
    .screenshot()
    .then((shot) => {
      const dataUrl = `data:image/png;base64,${shot.toString('base64')}`;
      return page.evaluate(
        ({ dataUrl: source, width: w, height: h }) => {
          const image = new Image();
          image.src = source;
          return image.decode().then(() => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', {
              willReadFrequently: true,
            });
            if (ctx === null) {
              return 0;
            }
            ctx.drawImage(image, 0, 0);
            const top = Math.floor(h * 0.03);
            const bottom = Math.floor(h * 0.55);
            const data = ctx.getImageData(0, top, w, bottom - top).data;
            let count = 0;
            for (let index = 0; index < data.length; index += 4) {
              const r = data[index];
              const g = data[index + 1];
              const b = data[index + 2];
              if (
                Math.abs(r - 217) <= 3 &&
                Math.abs(g - 103) <= 3 &&
                Math.abs(b - 103) <= 3
              ) {
                count += 1;
              }
            }
            return count;
          });
        },
        { dataUrl, width, height },
      );
    });
}

async function startCombat(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(page.locator('.ds-combat-hud').first()).toBeVisible();
}

test('Basic Drones from the existing seed path visibly render as danger squares (Combat §7, AC-054)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await startCombat(page);

  // The 0 s group spawns fully outside and begins entering on its first
  // movement update; danger pixels appear within ~0.5 s for any seed.
  await expect
    .poll(async () => dronePixelCount(page, 1280, 600), { timeout: 5000 })
    .toBeGreaterThanOrEqual(10);

  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  expect(pageErrors).toEqual([]);
});

test('one entry/resize/cleanup path preserves canvas, render and request boundaries with zero errors (S10)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await startCombat(page);
  await expect
    .poll(async () => dronePixelCount(page, 1280, 600), { timeout: 5000 })
    .toBeGreaterThanOrEqual(10);

  // Resize: active drones reproject and remain visibly rendered.
  await page.setViewportSize({ width: 1500, height: 800 });
  await expect
    .poll(
      async () =>
        page
          .locator('.ds-combat-canvas canvas')
          .evaluate((el) => el.clientWidth),
      { timeout: 5000 },
    )
    .toBe(1500);
  await expect
    .poll(async () => dronePixelCount(page, 1500, 800), { timeout: 5000 })
    .toBeGreaterThanOrEqual(10);

  // No duplicates, no repeated prepared-texture fetches, no errors.
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(page.locator('.ds-combat-hud')).toHaveCount(1);
  const aircraftFetches = requested.filter((url) =>
    /aircraft\/german-fighter\.png$/.test(url),
  ).length;
  expect(aircraftFetches).toBe(1);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
