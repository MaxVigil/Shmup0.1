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
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);
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

/** Longest contiguous near-white vertical run in any column (feedback vs
 *  projectiles: a drone flash is a 24 px square, a projectile 9 px tall). */
function maxNearWhiteRun(
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
            let maxRun = 0;
            for (let x = 0; x < w; x += 1) {
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
          });
        },
        { dataUrl, width, height },
      );
    });
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

  // The first projectile destruction of seed 86 happens at ~1 s; poll fast for
  // the 24 px white flash (distinct from the 9 px projectiles).
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
