import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * S10 Enemy Groups and Movement — minimal representative cross-layer/browser
 * evidence (Combat §7, AC-009/015–018, AC-049, AC-054, AC-072–075; v0.2 §16).
 * Exact seed fixtures, authored staging, entry placement, trajectories, and
 * escape are covered by deterministic unit tests; the browser proves only that
 * the authored Mission 01 staging visibly renders Basic Drone sprites (the
 * prepared image body or its exact procedural fallback) and that one
 * entry/resize/cleanup path preserves the canvas, render/lazy/request
 * boundaries, and has zero page errors. No wall-clock timing/trajectory
 * inference.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

/** Counts Basic Drone body pixels in the canvas (v0.2 §16). Accepts the full
 *  prepared-sprite body tone range (`#616265` core and its darker shaded
 *  neighbours) plus the exact procedural fallback fill (`--color-border-strong`
 *  `#526471`); a single coarse presence sample, not motion inference. The full
 *  canvas is scanned except the Aircraft's own vertical band (the German
 *  Fighter sprite also carries mid-gray body tones near the drone values), so
 *  the sample is robust across authored staging, sprite scaling, and
 *  post-resize reprojection without a false Aircraft match. */
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
            const data = ctx.getImageData(0, 0, w, h).data;
            // The Aircraft rests at 80% of the viewport height; exclude its
            // band so its mid-gray body tones never count as a drone.
            const aircraftTop = Math.floor(h * 0.75);
            const aircraftBottom = Math.floor(h * 0.85);
            let count = 0;
            for (let index = 0; index < data.length; index += 4) {
              const y = Math.floor(index / 4 / w);
              if (y >= aircraftTop && y < aircraftBottom) {
                continue;
              }
              const r = data[index];
              const g = data[index + 1];
              const b = data[index + 2];
              // Prepared sprite body #616265 (97, 98, 101) with its darker
              // shaded neighbours, or the fallback fill #526471 (82, 100,
              // 113), both with ±14 tolerance; the background and near-white
              // projectiles never match, and the Aircraft band is excluded.
              if (
                (Math.abs(r - 97) <= 14 &&
                  Math.abs(g - 98) <= 14 &&
                  Math.abs(b - 101) <= 14) ||
                (Math.abs(r - 82) <= 14 &&
                  Math.abs(g - 100) <= 14 &&
                  Math.abs(b - 113) <= 14)
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

test('authored Mission 01 staging visibly renders Basic Drones (Combat §7, AC-054, v0.2 §16)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await startCombat(page);

  // The authored Mission 01 e1 encounter arrives at 10 s and begins entering
  // on its first movement update; Basic Drone pixels appear within the 20 s
  // poll window for any seed (V02-AC-003 authored staging).
  await expect
    .poll(async () => dronePixelCount(page, 1280, 600), { timeout: 20000 })
    .toBeGreaterThanOrEqual(5);

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
    .poll(async () => dronePixelCount(page, 1280, 600), { timeout: 20000 })
    .toBeGreaterThanOrEqual(5);

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
    .toBeGreaterThanOrEqual(5);

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
