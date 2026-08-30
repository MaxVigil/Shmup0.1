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
  await page.getByRole('button', { name: 'Interception' }).click();
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

/** Longest contiguous near-white vertical run in any scanned column (feedback
 *  vs projectiles: a drone flash is a 24 px square, a projectile 9 px tall).
 *  The screenshot Buffer is decoded in-page through `createImageBitmap` (no
 *  data-URL round-trip) and the scan is bounded to the upper half — the
 *  deterministic enemy entry/destruction zone (Combat §7.4, AC-073): top
 *  entries descend at 0.12 × viewport-height per second and side entries spawn
 *  within the upper half, so every destroyed-drone flash occurs there.
 */
function maxNearWhiteRun(
  page: Page,
  width: number,
  height: number,
): Promise<number> {
  return page
    .locator('.ds-combat-canvas canvas')
    .screenshot()
    .then((shot) => scanShot(page, shot, width, height));
}

/** In-page scan of one screenshot Buffer: `createImageBitmap` decode, 1:1 copy
 *  of the upper-half rows into a fresh canvas, and pixel read. Every second
 *  column is scanned (a 24 px flash always contains ≥12 even-indexed columns,
 *  so the vertical-run detection is unaffected) to keep every sample inside
 *  the one-time 100 ms flash window under parallel load — the root cause of
 *  the review failure was a sampling cadence that could exceed the flash
 *  lifetime, not the deterministic flash itself (diagnostic recorded in
 *  `.agent-handoff/evidence`; V02-WI-02 correction C02). */
function scanShot(
  page: Page,
  shot: Buffer,
  width: number,
  height: number,
): Promise<number> {
  const scanHeight = Math.floor(height / 2);
  const base64 = shot.toString('base64');
  return page.evaluate(
    async ({ base64: b64, width: w, scanHeight: h }) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'image/png' });
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx === null) {
        return 0;
      }
      // 1:1 copy of the screenshot's TOP `h` rows (no scaling distortion).
      ctx.drawImage(bitmap, 0, 0, w, h, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let maxRun = 0;
      for (let x = 0; x < w; x += 2) {
        let run = 0;
        for (let y = 0; y < h; y += 1) {
          const i = (y * w + x) * 4;
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
      return maxRun;
    },
    { base64, width, scanHeight },
  );
}

test('authoritative Hull updates the visible and accessible Hull Bar (AC-059)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await startCombatWithSeed(page, CONTACT_SESSION_SEED);
  expect((await readHullBar(page))?.aria).toBe('100');

  // A drone contacts the aircraft at ~6.5 s; the bar drops and persists.
  await expect
    .poll(async () => Number((await readHullBar(page))?.aria), {
      timeout: 20000,
    })
    .toBeLessThan(100);

  // Width and accessible value change in the same authoritative snapshot.
  const after = await readHullBar(page);
  expect(after).not.toBeNull();
  expect(after!.aria).toBe('75');
  expect(Math.abs(after!.fillWidthRatio - 0.75)).toBeLessThan(0.02);

  // The bar remains at the damaged ratio (not a transient flash artifact).
  const later = await readHullBar(page);
  expect(later!.aria).toBe('75');
  expect(pageErrors).toEqual([]);
});

test('enemy damage/destruction feedback renders and cleans up (AC-024, AC-058)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await startCombatWithSeed(page, DESTRUCTION_SESSION_SEED);

  // The first projectile destruction of seed 86 happens at ~1 s. The flash is
  // a one-time deterministic 6-step (100 ms) #f1f5f7 24 px square (Combat
  // §8.5.1); poll with the dense in-page sampler so a single slow screenshot
  // cannot straddle the whole window under parallel load (root cause of the
  // review failure; diagnostic recorded in `.agent-handoff/evidence`).
  let sawFlash = false;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !sawFlash) {
    if ((await maxNearWhiteRun(page, 1280, 600)) >= FLASH_RUN_THRESHOLD) {
      sawFlash = true;
    }
  }
  expect(sawFlash).toBe(true);

  // The flash expires and the destroyed drone does not return: the long white
  // run disappears again.
  await expect
    .poll(async () => maxNearWhiteRun(page, 1280, 600), {
      timeout: 8000,
      intervals: [100, 100, 100, 100, 100, 100],
    })
    .toBeLessThan(FLASH_RUN_THRESHOLD);

  expect(pageErrors).toEqual([]);
});
