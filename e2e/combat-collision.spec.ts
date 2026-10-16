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
/** The longest near-white run and the near-white area the superseded 100 ms
 *  square produced: it was a `size × size` block (≈50 × 50 px, ~2500 px) at the
 *  destruction centre, while the approved glint and slim fragment highlights
 *  measure ~17 px and a few hundred px. Both limits therefore prove the block is
 *  gone without constraining the approved burst. */
const PROJECTILE_WHITE_RUN_LIMIT = 40;
const PROJECTILE_WHITE_AREA_LIMIT = 1000;
/** A burst frame shows a `danger` span of at least this many pixels on one row:
 *  the destroyed Basic Drone's broken ring reaches far beyond its own ~50 px
 *  footprint, while a Ranged projectile is a `7.2 px` circle. */
const DESTRUCTION_BURST_EXTENT = 30;
/** The longest continuous burst run the sampled frames may show: the regular
 *  effect lasts 12 executed steps (0.2 s) and the Elite 15 (0.25 s), so a burst
 *  that persisted across the window would prove a leaked surface. */
const DESTRUCTION_BURST_STREAK_LIMIT = 40;

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

/** One in-page destruction-feedback observation window. */
interface DestructionFeedbackSample {
  /** Longest near-white vertical run seen: the approved glint/highlights span
   *  ~17 px, while the superseded white square was a `size × size` block
   *  (≈50 px tall on a current Basic Drone). */
  readonly maxWhitishRun: number;
  /** Near-white pixels in the scanned half: the superseded square alone covered
   *  ~2500 px, while the approved glint and slim highlights cover a few hundred. */
  readonly maxWhitishPixels: number;
  /** Widest single-row `danger` span seen: the V021-WI-05 broken ring/fragments
   *  reach far beyond the destroyed drone's own footprint, while a Ranged
   *  projectile is only a `7.2 px` circle. */
  readonly maxDangerExtent: number;
  /** Frames that showed a burst, and the longest unbroken burst streak. */
  readonly burstFrames: number;
  readonly longestBurstStreak: number;
}

/**
 * V02-WI-04 C01 / V021-WI-05: in-page rAF-rate destruction-feedback sampler.
 * Reads the composited Combat canvas through `toDataURL` every frame (no slow
 * Playwright screenshot round-trip), so the one-time short destruction effect
 * cannot straddle the sampling cadence. The scan is bounded to the upper half —
 * the deterministic enemy entry/destruction zone (Combat §7.4, AC-073): top
 * entries descend at `0.12 × viewport-height` per second and side entries spawn
 * within the upper half, so every destruction occurs there.
 *
 * Two facts are measured per frame: the longest near-white vertical run (the
 * superseded white square would dominate it at 24+ px) and the widest
 * `danger`-coloured horizontal span on one row (the approved V021-WI-05 broken
 * ring and fragments reach ~70 px on a destroyed Basic Drone, whereas an enemy
 * body is grey, a Ranged projectile is a `7.2 px` circle, and the aircraft
 * damage flash is below this scanned half).
 */
function scanCanvasForDestructionFeedback(
  page: Page,
  windowMs: number,
): Promise<DestructionFeedbackSample> {
  return page.evaluate(
    (options) =>
      new Promise<DestructionFeedbackSample>((resolve) => {
        const result = {
          maxWhitishRun: 0,
          maxWhitishPixels: 0,
          maxDangerExtent: 0,
          burstFrames: 0,
          longestBurstStreak: 0,
        };
        const canvas = document.querySelector<HTMLCanvasElement>(
          '.ds-combat-canvas canvas',
        );
        if (canvas === null) {
          resolve(result);
          return;
        }
        let streak = 0;
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
                resolve(result);
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
              let frameExtent = 0;
              let whitishPixels = 0;
              for (let x = 0; x < canvas.width; x += 1) {
                let run = 0;
                for (let y = 0; y < halfHeight; y += 1) {
                  const i = (y * canvas.width + x) * 4;
                  const nearWhite =
                    Math.abs(data[i] - 241) <= 3 &&
                    Math.abs(data[i + 1] - 245) <= 3 &&
                    Math.abs(data[i + 2] - 247) <= 3;
                  if (nearWhite) {
                    whitishPixels += 1;
                    run += 1;
                    if (run > result.maxWhitishRun) {
                      result.maxWhitishRun = run;
                    }
                  } else {
                    run = 0;
                  }
                }
              }
              if (whitishPixels > result.maxWhitishPixels) {
                result.maxWhitishPixels = whitishPixels;
              }
              for (let y = 0; y < halfHeight; y += 1) {
                let minX = -1;
                let maxX = -1;
                for (let x = 0; x < canvas.width; x += 1) {
                  const i = (y * canvas.width + x) * 4;
                  const red = data[i];
                  const green = data[i + 1];
                  const blue = data[i + 2];
                  // The approved `danger` shatter composited over the dark
                  // canvas at any opacity above ~40%.
                  const dangerish =
                    red >= 60 && red - green >= 40 && red - blue >= 38;
                  if (dangerish) {
                    if (minX < 0) {
                      minX = x;
                    }
                    maxX = x;
                  }
                }
                if (minX >= 0 && maxX - minX > frameExtent) {
                  frameExtent = maxX - minX;
                }
              }
              if (frameExtent > result.maxDangerExtent) {
                result.maxDangerExtent = frameExtent;
              }
              if (frameExtent >= options.burstExtent) {
                result.burstFrames += 1;
                streak += 1;
                if (streak > result.longestBurstStreak) {
                  result.longestBurstStreak = streak;
                }
              } else {
                streak = 0;
              }
              if (performance.now() - start < options.durationMs) {
                requestAnimationFrame(sample);
              } else {
                resolve(result);
              }
            });
          } catch {
            if (performance.now() - start < options.durationMs) {
              requestAnimationFrame(sample);
            } else {
              resolve(result);
            }
          }
        };
        requestAnimationFrame(sample);
      }),
    { durationMs: windowMs, burstExtent: DESTRUCTION_BURST_EXTENT },
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

test('enemy damage/destruction feedback renders and cleans up (patch §4.1, AC-024, AC-058)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await startCombatWithSeed(page, DESTRUCTION_SESSION_SEED);

  // V02-WI-04 C01: authored staging replaces the legacy natural early-
  // destruction seed; the dev-only Debug Spawn Basic materializes one authored
  // Basic Drone per click at the engagement-band centre directly in the
  // automatic Machine Gun column. V021-WI-05 (patch §4.1, V021-DEC-005)
  // replaced the 100 ms white square with the procedural shatter, so the
  // in-page rAF-rate sampler now reads both the absence of that block and the
  // presence of the danger-coloured burst that reaches beyond the drone.
  await page.keyboard.press('F1');
  await page.getByRole('button', { name: 'Spawn Basic' }).click();
  await page.getByRole('button', { name: 'Spawn Basic' }).click();
  await page.getByRole('button', { name: 'Spawn Basic' }).click();
  await page.keyboard.press('F1');

  // The destruction happens ~1-2 s after the spawn; a 12 s in-page window is
  // deterministic for the auto-fire column.
  const burst = await scanCanvasForDestructionFeedback(page, 12000);
  expect(burst.maxDangerExtent).toBeGreaterThanOrEqual(
    DESTRUCTION_BURST_EXTENT,
  );
  expect(burst.burstFrames).toBeGreaterThan(0);
  // The effect is transient, never a leaked surface.
  expect(burst.longestBurstStreak).toBeLessThanOrEqual(
    DESTRUCTION_BURST_STREAK_LIMIT,
  );
  // No white block: neither the longest near-white run nor the near-white area
  // approaches the superseded `size × size` square.
  expect(burst.maxWhitishRun).toBeLessThan(PROJECTILE_WHITE_RUN_LIMIT);
  expect(burst.maxWhitishPixels).toBeLessThan(PROJECTILE_WHITE_AREA_LIMIT);

  // A later window shows the destroyed drones' bursts are gone.
  const later = await scanCanvasForDestructionFeedback(page, 4000);
  expect(later.longestBurstStreak).toBeLessThanOrEqual(
    DESTRUCTION_BURST_STREAK_LIMIT,
  );
  expect(later.maxWhitishRun).toBeLessThan(PROJECTILE_WHITE_RUN_LIMIT);
  expect(later.maxWhitishPixels).toBeLessThan(PROJECTILE_WHITE_AREA_LIMIT);

  expect(pageErrors).toEqual([]);
});
