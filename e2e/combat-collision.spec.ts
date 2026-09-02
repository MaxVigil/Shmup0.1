import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * S11 Collision, Damage and Destruction — minimal wiring-level browser
 * evidence (Combat §7.1, §8.4–8.5.1, AC-010–013/023–026/058–061). The session
 * seed is fixed through the existing crypto seed path (no production probe or
 * testing command), so the deterministic mission reliably produces an early
 * contact (session seed 40, ~6.5 s) and an early projectile destruction
 * (session seed 86, ~1 s). Exact collision rules, cooldowns, defeat freeze,
 * and feedback durations are unit-covered; the browser only proves the
 * authoritative Hull drives the visible/accessible Bar and that enemy
 * damage/destruction feedback renders and cleans up with zero errors.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };
const CONTACT_SESSION_SEED = 40;
const DESTRUCTION_SESSION_SEED = 86;
const FLASH_RUN_THRESHOLD = 15; // 24 px drone flash vs 9 px projectile

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

async function startCombatWithSeed(
  page: Page,
  sessionSeed: number,
): Promise<void> {
  await page.addInitScript((value) => {
    // Override the existing browser session-seed source deterministically.
    const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    globalThis.crypto.getRandomValues = (array) => {
      if (array instanceof Uint32Array) {
        array.fill(value >>> 0);
        return array;
      }
      return original(array);
    };
  }, sessionSeed);
  await page.goto('/');
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(page.locator('.ds-combat-hud').first()).toBeVisible();
}

/** Reads the Hull bar's accessible value and fill width in one snapshot. */
function readHullBar(
  page: Page,
): Promise<{ aria: string; fillWidthRatio: number } | null> {
  return page.evaluate(() => {
    const track = document.querySelector('.ds-combat-hud__track');
    const fill = document.querySelector('.ds-combat-hud__fill');
    if (track === null || fill === null) {
      return null;
    }
    const trackWidth = track.clientWidth;
    if (trackWidth === 0) {
      return null;
    }
    return {
      aria: track.getAttribute('aria-valuenow') ?? '',
      fillWidthRatio: fill.clientWidth / trackWidth,
    };
  });
}

/** V02-WI-04 C01: in-page rAF-rate flash sampler. Reads the composited Combat
 *  canvas through `toDataURL` every frame (no slow Playwright screenshot
 *  round-trip), so the one-time deterministic 6-step (100 ms) near-white
 *  destruction flash cannot straddle the sampling cadence. The scan is bounded
 *  to the upper half — the deterministic enemy entry/destruction zone (Combat
 *  §7.4, AC-073): top entries descend at 0.12 × viewport-height per second and
 *  side entries spawn within the upper half, so every destroyed-drone flash
 *  occurs there. Returns the longest near-white vertical run seen (feedback vs
 *  projectiles: a drone flash is a 24+ px square, a projectile 9 px tall).
 */
function scanCanvasForFlash(page: Page, windowMs: number): Promise<number> {
  return page.evaluate(
    (durationMs) =>
      new Promise<number>((resolve) => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          '.ds-combat-canvas canvas',
        );
        if (canvas === null) {
          resolve(0);
          return;
        }
        let maxRun = 0;
        const start = performance.now();
        const halfHeight = Math.floor(canvas.height / 2);
        const sample = (): void => {
          try {
            const url = canvas.toDataURL();
            const image = new Image();
            image.src = url;
            image.decode().then(() => {
              const ctx = document.createElement('canvas').getContext('2d', {
                willReadFrequently: true,
              });
              if (ctx === null) {
                resolve(maxRun);
                return;
              }
              ctx.canvas.width = canvas.width;
              ctx.canvas.height = halfHeight;
              ctx.drawImage(image, 0, 0);
              const data = ctx.getImageData(
                0,
                0,
                canvas.width,
                halfHeight,
              ).data;
              for (let x = 0; x < canvas.width; x += 2) {
                let run = 0;
                for (let y = 0; y < halfHeight; y += 1) {
                  const i = (y * canvas.width + x) * 4;
                  const nearWhite =
                    Math.abs(data[i] - 241) <= 3 &&
                    Math.abs(data[i + 1] - 245) <= 3 &&
                    Math.abs(data[i + 2] - 247) <= 3;
                  if (nearWhite) {
                    run += 1;
                    if (run > maxRun) {
                      maxRun = run;
                    }
                  } else {
                    run = 0;
                  }
                }
              }
              if (performance.now() - start < durationMs) {
                requestAnimationFrame(sample);
              } else {
                resolve(maxRun);
              }
            });
          } catch {
            if (performance.now() - start < durationMs) {
              requestAnimationFrame(sample);
            } else {
              resolve(maxRun);
            }
          }
        };
        requestAnimationFrame(sample);
      }),
    windowMs,
  );
}

test('authoritative Hull updates the visible/accessible Bar and the v0.2 CRITICAL HULL warning (AC-059, v0.2 §15.2–15.3)', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await startCombatWithSeed(page, CONTACT_SESSION_SEED);
  expect((await readHullBar(page))?.aria).toBe('100');

  // V02-WI-04 authored M01 staging (first arrival at 10 s) removes the legacy
  // natural early-contact seed. Park the aircraft off the e2 Ranged column
  // (x = 640) so the Ranged survives the automatic Machine Gun fire and its
  // aimed projectiles land deterministically (first hit ~62 s).
  await page.mouse.move(400, 480);

  // Drive the authoritative Hull to 25 through the dev-only Debug Set Hull
  // (V02-WI-04 C01: the corrected lower muzzle places the first Ranged shot
  // reliably inside the viewport). The first Ranged hit then takes Hull to 13,
  // strictly below 25, triggering the once-per-Mission-Instance 2 s CRITICAL
  // HULL message and the danger fill in the same authoritative snapshot
  // (v0.2 §15.3). The message is the rarest signal, so poll for it first.
  await page.keyboard.press('F1');
  await page.getByRole('button', { name: 'Set Hull: 25' }).click();
  await page.keyboard.press('F1');
  await expect
    .poll(async () => Number((await readHullBar(page))?.aria), {
      timeout: 5000,
    })
    .toBe(25);

  await expect(page.locator('.ds-combat-critical-hull')).toBeVisible({
    timeout: 90000,
  });
  await expect
    .poll(async () => Number((await readHullBar(page))?.aria), {
      timeout: 5000,
    })
    .toBeLessThan(25);
  const dangerFill = await page
    .locator('.ds-combat-hud__fill')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(dangerFill).toBe('rgb(217, 103, 103)'); // --color-danger
  const after = await readHullBar(page);
  expect(after).not.toBeNull();
  expect(
    Math.abs(after!.fillWidthRatio - Number(after!.aria) / 100),
  ).toBeLessThan(0.02);

  // The warning is a timed one-shot: it expires after ~2 s.
  await expect(page.locator('.ds-combat-critical-hull')).toBeHidden({
    timeout: 5000,
  });
  expect(pageErrors).toEqual([]);
});

test('enemy damage/destruction feedback renders and cleans up (AC-024, AC-058)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await startCombatWithSeed(page, DESTRUCTION_SESSION_SEED);

  // V02-WI-04 C01: authored staging replaces the legacy natural early-
  // destruction seed; the dev-only Debug Spawn Basic materializes one authored
  // Basic Drone per click at the engagement-band centre directly in the
  // automatic Machine Gun column. The in-page rAF-rate sampler reads the
  // composited canvas every frame, so the one-time deterministic 6-step
  // (100 ms) #f1f5f7 destruction flash (Combat §8.5.1) cannot be missed by a
  // slower screenshot cadence (the review-failure root cause).
  await page.keyboard.press('F1');
  await page.getByRole('button', { name: 'Spawn Basic' }).click();
  await page.getByRole('button', { name: 'Spawn Basic' }).click();
  await page.getByRole('button', { name: 'Spawn Basic' }).click();
  await page.keyboard.press('F1');

  // The destruction happens ~1-2 s after the spawn; a 12 s in-page window is
  // deterministic for the auto-fire column.
  const flashRun = await scanCanvasForFlash(page, 12000);
  expect(flashRun).toBeGreaterThanOrEqual(FLASH_RUN_THRESHOLD);

  // The flash expires and the destroyed drones do not return: the long white
  // run disappears again.
  const laterRun = await scanCanvasForFlash(page, 4000);
  expect(laterRun).toBeLessThan(FLASH_RUN_THRESHOLD);

  expect(pageErrors).toEqual([]);
});
