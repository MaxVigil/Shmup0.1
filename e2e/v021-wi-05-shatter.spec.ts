import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { evidenceDirectory } from '../scripts/evidence-output.mjs';

/**
 * V021-WI-05 focused development-browser destruction evidence (patch §4.1,
 * V021-DEC-005, V021-AC-009, Verification §18.1).
 *
 * This file is the cross-layer wiring case only: the real application, the real
 * fixed-step simulation and the real Phaser canvas prove that
 *
 * - a true regular destruction (a Debug-spawned Basic Drone destroyed by the
 *   automatic Machine Gun) draws the procedural shatter — a `danger` burst whose
 *   widest single row reaches far beyond the destroyed enemy's own complete
 *   visual dimension — and never the superseded white square;
 * - the same measured burst is drawn when every prepared enemy PNG request is
 *   aborted, so the forced-fallback enemy bodies carry the identical procedural
 *   shatter at `1280 x 600`;
 * - a true Elite destruction (the approved development `Spawn Elite` plus the
 *   canonical `Elite: Vulnerable` phase command) reaches the same renderer
 *   through the Elite record variant;
 * - a bounded dense-kill window keeps the browser frame loop healthy and leaves
 *   no leaked burst surface behind (a local observation, never an integrated
 *   performance claim).
 *
 * The exact per-step geometry and lifetime (six/ten fragments, one broken ring,
 * the Elite's second ring from effect step `4`, the exact 12/15 executed steps,
 * monotone shrink/fade, terminal-zero multiplication, own-expiry removal, the
 * prepared-versus-fallback fill equality, resize and disposal) stay at their
 * lowest owners: the deterministic `src/application/combat/*` regressions and
 * the real-renderer `combat-scene-destruction-shatter.test.ts`. The in-page
 * sampler below inherits the accepted V021-WI-04 C01 / AC-024 scan and its
 * thresholds, so a renderer that still drew the white square, an effect that
 * never expired or a burst that did not scale with the destroyed enemy's
 * dimension produces different measurements here.
 *
 * The development Debug Overlay is toggled by dispatching the app's own `F1`
 * `keydown` on `window` (the listener the Combat Screen owns). Playwright's real
 * `F1` press is delivered for only the first two presses in this Chromium build
 * — measured while writing this spec — and the accepted V021-WI-04-B evidence
 * dispatches `blur`/`focus` the same way; the DOM buttons are clicked through
 * real Playwright locator actions.
 */

const MINIMUM_VIEWPORT = { width: 1280, height: 600 } as const;
/** The accepted V02-WI-04 C01 / V021-WI-05 session seed (session seed 86). */
const SESSION_SEED = 86;
/** The Aircraft hold altitude used while tracking a Debug-spawned Elite. */
const AIRCRAFT_ALTITUDE = 480;
/**
 * A burst frame is a frame whose widest single `danger` row spans at least this
 * many pixels. The destroyed Basic Drone's complete visual dimension is `50 px`
 * at `1280 x 600` and its burst measures `63 px`, while a Ranged projectile is a
 * `7.2 px` circle, an Elite Core is a solid `accent` diamond and an enemy body is
 * grey, so no non-burst surface reaches this span.
 */
const BURST_ROW_EXTENT = 30;
/** The longest near-white run / near-white area the superseded `size × size`
 *  white square produced (~50 px / ~2500 px) versus the approved glint and slim
 *  highlights (measured 18 px / 344 px here). Both limits prove the block is
 *  gone without constraining the approved burst. */
const WHITE_RUN_LIMIT = 40;
const WHITE_AREA_LIMIT = 1000;
/** The longest continuous burst streak the sampled frames may show: the regular
 *  effect lasts 12 executed steps (0.2 s) and the Elite 15 (0.25 s), so a burst
 *  that persisted across the window would prove a leaked surface. */
const BURST_STREAK_LIMIT = 40;
/** The Elite window tolerates the Elite burst plus the regular destructions its
 *  own sweep can cause while the Aircraft tracks it. */
const ELITE_BURST_FRAME_LIMIT = 90;
/** Which detected burst frame of a window is captured as the pixel evidence. */
const CAPTURE_BURST_FRAME = 4;
/** The Elite's canonical sweep speed and the Machine Gun projectile speed
 *  (`0.12 × viewport width` / `0.55 × viewport height` per second), used to lead
 *  the automatic fire while the Aircraft tracks a Debug-spawned Elite. */
const ELITE_SWEEP_SPEED_PX_PER_SECOND = 0.12 * MINIMUM_VIEWPORT.width;
const PROJECTILE_SPEED_PX_PER_SECOND = 0.55 * MINIMUM_VIEWPORT.height;
/** Tracking cadence, the fixed tail that still contains the whole 15-step Elite
 *  effect after the destruction was observed, and the bounded kill budget. */
const ELITE_TRACK_INTERVAL_MS = 60;
const ELITE_BURST_TAIL_MS = 1500;
const ELITE_KILL_BUDGET_MS = 150_000;
/** The tolerance within which the prepared and the forced-fallback burst
 *  measurements must agree: the widest measured span is frame quantised (the
 *  sampler measures whichever progress frame it observes), so the two runs are
 *  compared with a finite slack instead of equality. */
const BURST_EXTENT_PARITY = 12;
/** The tracked-box half size of the Elite observation: the complete Elite effect
 *  reaches at most `0.9 × size` (about `36 px` for the Elite's `40.1 px` complete
 *  visual dimension at `1280 x 600`), so `60 px` contains it plus the tracker's
 *  own staleness while staying far smaller than the viewport. */
const ELITE_TRACK_BOX_HALF_SIZE = 60;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

/** Opens the real application and starts one Interception 01 mission with the
 *  fixed session seed, waiting for the settled single Combat canvas. */
async function startCombat(
  page: Page,
  { godMode = false } = {},
): Promise<void> {
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
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  if (godMode) {
    await openDebug(page);
    await debugPanel(page)
      .locator('.ds-checkbox', { hasText: 'God Mode' })
      .click();
    await closeDebug(page);
  }
}

/** The Debug Overlay dialog locator of the running Combat screen. */
function debugPanel(page: Page) {
  return page.getByRole('dialog');
}

/**
 * Toggles the development Debug Overlay. `page.keyboard.press('F1')` reaches the
 * Combat Screen listener only for the first two presses per page in this
 * Chromium build, so the app's own `F1` `keydown` is dispatched on `window`,
 * which is the identical listener path (the accepted V021-WI-04-B evidence
 * dispatches `blur`/`focus` the same way).
 */
async function toggleDebug(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1' }));
  });
  await page.waitForTimeout(150);
}

async function openDebug(page: Page): Promise<void> {
  await toggleDebug(page);
  await expect(
    debugPanel(page).getByRole('heading', { name: 'Debug' }),
  ).toBeVisible({ timeout: 5000 });
}

async function closeDebug(page: Page): Promise<void> {
  await toggleDebug(page);
  await expect(debugPanel(page)).toBeHidden({ timeout: 5000 });
}

/** One accepted Debug action click on a currently eligible button. */
async function clickDebugAction(page: Page, name: string): Promise<void> {
  await debugPanel(page).getByRole('button', { name }).click({ timeout: 5000 });
}

interface Observability {
  readonly elite: {
    readonly phase: string;
    readonly phaseElapsedSeconds: number;
  } | null;
  readonly activeEnemiesByType: Readonly<Record<string, number>>;
  readonly activeEnemyBounds: readonly {
    readonly type: string;
    readonly centerX: number;
    readonly centerY: number;
    readonly width: number;
    readonly height: number;
  }[];
  readonly destroyedEnemiesByType: Readonly<Record<string, number>>;
  readonly destroyedByProjectileEnemiesByType: Readonly<Record<string, number>>;
  readonly missionTimeSeconds: number;
  readonly godModeEnabled: boolean;
}

/** The read-only development observability snapshot of the running runtime. */
async function readObservability(page: Page): Promise<Observability | null> {
  return page.evaluate(() => {
    const hook = (
      window as Window & { __shmupDevObservability__?: () => unknown }
    ).__shmupDevObservability__;
    return (hook?.() as Observability | undefined) ?? null;
  });
}

/** Which detected burst frame of a window is captured as the pixel evidence. */

/** One in-page destruction-observation window. */
interface BurstObservation {
  /** Widest single-row `danger` span seen in the scanned upper half. */
  readonly maxDangerExtent: number;
  /** Frames that showed a burst (a single-row `danger` span >= the limit). */
  readonly burstFrames: number;
  /** Longest unbroken run of burst frames: a leaked surface never ends. */
  readonly longestBurstStreak: number;
  /** Longest near-white vertical run and largest near-white pixel count. */
  readonly maxWhitishRun: number;
  readonly maxWhitishPixels: number;
  /** Frames sampled, and the twelve widest single-row spans (descending). */
  readonly sampledFrames: number;
  readonly widestExtents: readonly number[];
  /** The captured burst frame: its own measured span and its canvas PNG. */
  readonly burstFrameExtent: number;
  readonly burstFrameImage: string | null;
}

/**
 * In-page requestAnimationFrame destruction sampler. Every frame is snapshotted
 * with `createImageBitmap(canvas)` (a copy taken inside the rendering frame, so
 * no long PNG encode/decode round trip starves the page), measured at full
 * resolution on the top half — the deterministic enemy entry/destruction zone
 * (Combat §7.4, AC-073) — and the frame that shows the burst is also copied into
 * a 2D canvas inside that same frame, so the saved PNG is genuinely the measured
 * frame.
 *
 * Two facts are measured per frame: the longest near-white vertical run and the
 * near-white pixel count (the superseded white square dominated both) and the
 * widest `danger`-coloured horizontal span on one row (the approved broken ring
 * and fragments reach far beyond the destroyed enemy's own footprint).
 */
function sampleDestructionWindow(
  page: Page,
  windowMs: number,
): Promise<BurstObservation> {
  return page.evaluate(
    (options) =>
      new Promise<BurstObservation>((resolve) => {
        const result = {
          maxDangerExtent: 0,
          burstFrames: 0,
          longestBurstStreak: 0,
          maxWhitishRun: 0,
          maxWhitishPixels: 0,
          sampledFrames: 0,
          widestExtents: [] as number[],
          burstFrameExtent: 0,
          burstFrameImage: null as string | null,
        };
        const extents: number[] = [];
        const stopSignal = globalThis as unknown as {
          __v021wi05StopSampling?: boolean;
        };
        stopSignal.__v021wi05StopSampling = false;
        const canvas = document.querySelector<HTMLCanvasElement>(
          '.ds-combat-canvas canvas',
        );
        if (canvas === null) {
          resolve(result);
          return;
        }
        const scanHeight = Math.floor(canvas.height / 2);
        const scratch = document.createElement('canvas');
        scratch.width = canvas.width;
        scratch.height = scanHeight;
        const scanContext = scratch.getContext('2d', {
          willReadFrequently: true,
        });
        const captured = document.createElement('canvas');
        captured.width = canvas.width;
        captured.height = canvas.height;
        const captureContext = captured.getContext('2d');
        if (scanContext === null || captureContext === null) {
          resolve(result);
          return;
        }
        let streak = 0;
        let burstFrameIndex = 0;
        let captureArmed = false;
        const startedAt = performance.now();
        const sample = (): void => {
          // The burst-frame copy must happen inside the rendering frame, while
          // the canvas still holds the presented frame.
          if (captureArmed) {
            captureContext.drawImage(canvas, 0, 0);
          }
          const snapshot = createImageBitmap(canvas);
          void snapshot.then((bitmap) => {
            scanContext.clearRect(0, 0, canvas.width, scanHeight);
            scanContext.drawImage(
              bitmap,
              0,
              0,
              canvas.width,
              scanHeight,
              0,
              0,
              canvas.width,
              scanHeight,
            );
            bitmap.close();
            const data = scanContext.getImageData(
              0,
              0,
              canvas.width,
              scanHeight,
            ).data;
            result.sampledFrames += 1;
            let frameExtent = 0;
            let whitishPixels = 0;

            for (let x = 0; x < canvas.width; x += 1) {
              let run = 0;
              for (let y = 0; y < scanHeight; y += 1) {
                const index = (y * canvas.width + x) * 4;
                const nearWhite =
                  Math.abs(data[index] - 241) <= 3 &&
                  Math.abs(data[index + 1] - 245) <= 3 &&
                  Math.abs(data[index + 2] - 247) <= 3;
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
            for (let y = 0; y < scanHeight; y += 1) {
              let minX = -1;
              let maxX = -1;
              for (let x = 0; x < canvas.width; x += 1) {
                const index = (y * canvas.width + x) * 4;
                const red = data[index];
                const green = data[index + 1];
                const blue = data[index + 2];
                // The approved `danger` shatter composited over the dark canvas
                // at any opacity above ~35%.
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
            extents.push(frameExtent);
            if (frameExtent > result.maxDangerExtent) {
              result.maxDangerExtent = frameExtent;
            }
            if (frameExtent >= options.burstExtent) {
              burstFrameIndex += 1;
              result.burstFrames += 1;
              streak += 1;
              if (streak > result.longestBurstStreak) {
                result.longestBurstStreak = streak;
              }
              if (burstFrameIndex === options.captureBurstFrame) {
                result.burstFrameExtent = frameExtent;
                result.burstFrameImage = captured.toDataURL('image/png');
              }
              captureArmed = burstFrameIndex + 1 === options.captureBurstFrame;
            } else {
              streak = 0;
              burstFrameIndex = 0;
              captureArmed = false;
            }
            if (
              performance.now() - startedAt < options.durationMs &&
              stopSignal.__v021wi05StopSampling !== true
            ) {
              requestAnimationFrame(sample);
            } else {
              resolve({
                ...result,
                widestExtents: [...extents]
                  .sort((left, right) => right - left)
                  .slice(0, 12),
              });
            }
          });
        };
        requestAnimationFrame(sample);
      }),
    {
      durationMs: windowMs,
      burstExtent: BURST_ROW_EXTENT,
      captureBurstFrame: CAPTURE_BURST_FRAME,
    },
  );
}

/** Aggregated measurements of one set of frames inside the scanned region. */
interface BurstMetrics {
  /** Widest single-row `danger` span seen in the scanned region. */
  readonly maxDangerExtent: number;
  /** Frames that showed a burst (a single-row `danger` span >= the limit). */
  readonly burstFrames: number;
  /** Longest unbroken run of burst frames: a leaked surface never ends. */
  readonly longestBurstStreak: number;
  /** Longest near-white vertical run and largest near-white pixel count. */
  readonly maxWhitishRun: number;
  readonly maxWhitishPixels: number;
  /** Frames measured in this set, and its twelve widest spans (descending). */
  readonly sampledFrames: number;
  readonly widestExtents: readonly number[];
}

/**
 * Box-scoped destruction observation of a TRACKED enemy, split by that enemy's
 * own authoritative state. The Elite's Armoured phase fires `danger`-coloured
 * cannon projectiles and the authored Mission 01 waves fire `danger`-coloured
 * Ranged projectiles, so a whole-canvas `danger` span cannot be attributed to
 * one effect. This observation therefore scans only a small box around the
 * tracked Elite's own centre — the box that contains the complete burst of that
 * destruction — and reports the frames measured while the Elite was still alive
 * (`baseline`) separately from the frames measured after the authoritative
 * destruction was observed (`burst`). A destruction that drew nothing would
 * leave `burst` indistinguishable from `baseline`, while a white square would
 * dominate the near-white run, the near-white area and the widest span of
 * `burst`.
 */
interface BoxBurstObservation {
  readonly baseline: BurstMetrics;
  readonly burst: BurstMetrics;
  /** The widest measured `burst` frame, copied in-frame and kept as its PNG. */
  readonly widestFrameExtent: number;
  readonly widestFrameImage: string | null;
  readonly frames: number;
  readonly scannedRegion: 'tracked-box';
}

/** The in-page tracked-box signal: the live box around the tracked Elite plus
 *  whether the authoritative destruction has already been observed. */
interface BurstBoxSignal {
  centerX: number;
  centerY: number;
  halfWidth: number;
  halfHeight: number;
  phase: 'alive' | 'destroyed';
}

/** Publishes one tracked-box signal frame to the in-page box sampler. */
function publishBoxSignal(page: Page, signal: BurstBoxSignal): Promise<void> {
  return page.evaluate((value) => {
    (
      globalThis as unknown as { __v021wi05BurstBox?: unknown }
    ).__v021wi05BurstBox = value;
  }, signal);
}

/**
 * Box-scoped requestAnimationFrame sampler for a tracked enemy. Every frame is
 * snapshotted with `createImageBitmap(canvas)` inside the rendering frame, the
 * current tracked box is read back at full resolution, and every `burst`-phase
 * frame is also copied into a 2D canvas in that same frame; the widest measured
 * `burst` frame is kept and serialised once at the end, so the saved PNG is
 * genuinely the frame whose span was measured. It shares the accepted
 * near-white and `danger` predicates (and the constants) with
 * `sampleDestructionWindow`.
 */
function sampleTrackedBoxWindow(
  page: Page,
  windowMs: number,
): Promise<BoxBurstObservation> {
  return page.evaluate(
    (options) =>
      new Promise<BoxBurstObservation>((resolve) => {
        const emptyMetrics = () => ({
          maxDangerExtent: 0,
          burstFrames: 0,
          longestBurstStreak: 0,
          maxWhitishRun: 0,
          maxWhitishPixels: 0,
          sampledFrames: 0,
          widestExtents: [] as number[],
        });
        const sets = { baseline: emptyMetrics(), burst: emptyMetrics() };
        const streaks = { baseline: 0, burst: 0 };
        let frames = 0;
        let widestFrameExtent = 0;
        const signal = globalThis as unknown as {
          __v021wi05BurstBox?: {
            centerX: number;
            centerY: number;
            halfWidth: number;
            halfHeight: number;
            phase: string;
          };
          __v021wi05StopSampling?: boolean;
        };
        signal.__v021wi05StopSampling = false;
        const canvas = document.querySelector<HTMLCanvasElement>(
          '.ds-combat-canvas canvas',
        );
        const scratch = document.createElement('canvas');
        const scanContext = scratch.getContext('2d', {
          willReadFrequently: true,
        });
        const frameCanvas = document.createElement('canvas');
        const frameContext = frameCanvas.getContext('2d');
        const bestCanvas = document.createElement('canvas');
        const bestContext = bestCanvas.getContext('2d');
        if (canvas !== null) {
          frameCanvas.width = canvas.width;
          frameCanvas.height = canvas.height;
          bestCanvas.width = canvas.width;
          bestCanvas.height = canvas.height;
        }
        if (
          canvas === null ||
          scanContext === null ||
          frameContext === null ||
          bestContext === null
        ) {
          resolve({
            baseline: sets.baseline,
            burst: sets.burst,
            widestFrameExtent: 0,
            widestFrameImage: null,
            frames: 0,
            scannedRegion: 'tracked-box',
          });
          return;
        }
        const startedAt = performance.now();
        const finalise = (metrics: {
          maxDangerExtent: number;
          burstFrames: number;
          longestBurstStreak: number;
          maxWhitishRun: number;
          maxWhitishPixels: number;
          sampledFrames: number;
          widestExtents: number[];
        }) => ({
          ...metrics,
          widestExtents: [...metrics.widestExtents]
            .sort((left, right) => right - left)
            .slice(0, 12),
        });
        const finish = (): void => {
          resolve({
            baseline: finalise(sets.baseline),
            burst: finalise(sets.burst),
            widestFrameExtent,
            widestFrameImage:
              widestFrameExtent > 0 ? bestCanvas.toDataURL('image/png') : null,
            frames,
            scannedRegion: 'tracked-box',
          });
        };
        const schedule = (): void => {
          if (
            performance.now() - startedAt < options.durationMs &&
            signal.__v021wi05StopSampling !== true
          ) {
            requestAnimationFrame(sample);
          } else {
            finish();
          }
        };

        const sample = (): void => {
          const box = signal.__v021wi05BurstBox;
          if (box === undefined) {
            schedule();
            return;
          }
          const halfWidth = Math.max(8, Math.round(box.halfWidth));
          const halfHeight = Math.max(8, Math.round(box.halfHeight));
          const x0 = Math.max(
            0,
            Math.min(canvas.width - 1, Math.round(box.centerX - halfWidth)),
          );
          const y0 = Math.max(
            0,
            Math.min(canvas.height - 1, Math.round(box.centerY - halfHeight)),
          );
          const width = Math.max(1, Math.min(canvas.width - x0, halfWidth * 2));
          const height = Math.max(
            1,
            Math.min(canvas.height - y0, halfHeight * 2),
          );
          const phase: 'baseline' | 'burst' =
            box.phase === 'destroyed' ? 'burst' : 'baseline';
          if (phase === 'burst') {
            frameContext.drawImage(canvas, 0, 0);
          }
          const snapshot = createImageBitmap(canvas);
          void snapshot.then((bitmap) => {
            scratch.width = width;
            scratch.height = height;
            scanContext.clearRect(0, 0, width, height);
            scanContext.drawImage(
              bitmap,
              x0,
              y0,
              width,
              height,
              0,
              0,
              width,
              height,
            );
            bitmap.close();
            const data = scanContext.getImageData(0, 0, width, height).data;
            frames += 1;
            const metrics = sets[phase];
            metrics.sampledFrames += 1;
            let frameExtent = 0;
            let whitishPixels = 0;
            for (let x = 0; x < width; x += 1) {
              let run = 0;
              for (let y = 0; y < height; y += 1) {
                const index = (y * width + x) * 4;
                const nearWhite =
                  Math.abs(data[index] - 241) <= 3 &&
                  Math.abs(data[index + 1] - 245) <= 3 &&
                  Math.abs(data[index + 2] - 247) <= 3;
                if (nearWhite) {
                  whitishPixels += 1;
                  run += 1;
                  if (run > metrics.maxWhitishRun) {
                    metrics.maxWhitishRun = run;
                  }
                } else {
                  run = 0;
                }
              }
            }
            if (whitishPixels > metrics.maxWhitishPixels) {
              metrics.maxWhitishPixels = whitishPixels;
            }
            for (let y = 0; y < height; y += 1) {
              let minX = -1;
              let maxX = -1;
              for (let x = 0; x < width; x += 1) {
                const index = (y * width + x) * 4;
                const red = data[index];
                const green = data[index + 1];
                const blue = data[index + 2];
                if (red >= 60 && red - green >= 40 && red - blue >= 38) {
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
            if (frameExtent > metrics.maxDangerExtent) {
              metrics.maxDangerExtent = frameExtent;
            }
            if (frameExtent >= options.burstExtent) {
              streaks[phase] += 1;
              metrics.burstFrames += 1;
              if (streaks[phase] > metrics.longestBurstStreak) {
                metrics.longestBurstStreak = streaks[phase];
              }
              metrics.widestExtents.push(frameExtent);
            } else {
              streaks[phase] = 0;
            }
            if (phase === 'burst' && frameExtent >= widestFrameExtent) {
              bestContext.drawImage(frameCanvas, 0, 0);
              widestFrameExtent = frameExtent;
            }
            schedule();
          });
        };
        requestAnimationFrame(sample);
      }),
    { durationMs: windowMs, burstExtent: BURST_ROW_EXTENT },
  );
}

function measuredFacts(observation: BurstObservation) {
  return {
    maxDangerExtent: observation.maxDangerExtent,
    burstFrames: observation.burstFrames,
    longestBurstStreak: observation.longestBurstStreak,
    maxWhitishRun: observation.maxWhitishRun,
    maxWhitishPixels: observation.maxWhitishPixels,
    sampledFrames: observation.sampledFrames,
    widestExtents: observation.widestExtents,
    burstFrameExtent: observation.burstFrameExtent,
    burstFrameCaptured: observation.burstFrameImage !== null,
  };
}

/**
 * Writes one measured observation into this run's isolated evidence directory:
 * the canvas PNG of the captured frame plus its measurement record. The PNG is
 * written only when a frame really was captured, so a missing burst can never be
 * presented as a picture.
 */
function writeEvidenceRecord(
  name: string,
  image: string | null,
  measurement: unknown,
  extra: Record<string, unknown>,
): string {
  const directory = evidenceDirectory();
  const record = {
    schemaVersion: 1,
    workItem: 'V021-WI-05',
    kind: 'development-browser-destruction-burst-observation',
    referenceClaim: false,
    surface:
      'ordinary development server, real application, real Phaser WebGL canvas',
    viewport: MINIMUM_VIEWPORT,
    sessionSeed: SESSION_SEED,
    thresholds: {
      burstRowExtent: BURST_ROW_EXTENT,
      whiteRunLimit: WHITE_RUN_LIMIT,
      whiteAreaLimit: WHITE_AREA_LIMIT,
      burstStreakLimit: BURST_STREAK_LIMIT,
      captureBurstFrame: CAPTURE_BURST_FRAME,
    },
    measurement,
    ...extra,
    capturedAt: new Date().toISOString(),
  };
  const jsonPath = join(directory, `${name}-1280x600-measurements.json`);
  writeFileSync(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
  if (image !== null) {
    const base64 = image.split(',')[1] ?? '';
    writeFileSync(
      join(directory, `${name}-1280x600-canvas.png`),
      Buffer.from(base64, 'base64'),
    );
  }
  console.log(`[V021-WI-05] evidence written: ${jsonPath}`);
  return jsonPath;
}

/** Writes one whole-upper-half destruction window (the regular, fallback and
 *  dense cases) with its captured burst frame. */
function writeBurstEvidence(
  name: string,
  observation: BurstObservation,
  extra: Record<string, unknown>,
): string {
  return writeEvidenceRecord(
    name,
    observation.burstFrameImage,
    measuredFacts(observation),
    extra,
  );
}

/**
 * The regular-destruction scenario both the prepared and the forced-fallback
 * runs use: three Debug-spawned Basic Drones in the automatic Machine Gun
 * column, each destroyed for real by the authoritative collision owner, with one
 * measured burst window and the captured burst frame.
 */
async function captureRegularBurst(
  page: Page,
  context: 'prepared' | 'forced-fallback',
): Promise<BurstObservation> {
  await startCombat(page);
  await page.mouse.move(640, AIRCRAFT_ALTITUDE);
  await openDebug(page);
  await clickDebugAction(page, 'Spawn Basic');
  await clickDebugAction(page, 'Spawn Basic');
  await clickDebugAction(page, 'Spawn Basic');
  await closeDebug(page);

  const observation = await sampleDestructionWindow(page, 12_000);
  const state = await readObservability(page);
  console.log(
    `[V021-WI-05] ${context} window ${JSON.stringify(measuredFacts(observation))}`,
  );
  // A true regular destruction happened and reached the renderer.
  expect(observation.burstFrames).toBeGreaterThan(0);
  expect(observation.maxDangerExtent).toBeGreaterThanOrEqual(BURST_ROW_EXTENT);
  expect(observation.burstFrameExtent).toBeGreaterThanOrEqual(BURST_ROW_EXTENT);
  expect(observation.burstFrameImage).not.toBeNull();
  // Three real destructions through the approved development spawn surface.
  expect(
    state?.destroyedEnemiesByType['basic-drone'] ?? 0,
  ).toBeGreaterThanOrEqual(3);
  // The effect is transient, never a leaked surface.
  expect(observation.longestBurstStreak).toBeLessThanOrEqual(
    BURST_STREAK_LIMIT,
  );
  // No white block: neither the longest near-white run nor the near-white area
  // approaches the superseded `size × size` square.
  expect(observation.maxWhitishRun).toBeLessThan(WHITE_RUN_LIMIT);
  expect(observation.maxWhitishPixels).toBeLessThan(WHITE_AREA_LIMIT);
  writeBurstEvidence(`v021-wi-05-${context}-regular-kill-burst`, observation, {
    context,
    destroyedEnemiesByType: state?.destroyedEnemiesByType ?? null,
    activeEnemiesByType: state?.activeEnemiesByType ?? null,
    destroyedByProjectileEnemiesByType:
      state?.destroyedByProjectileEnemiesByType ?? null,
    expectedDestroyedRole: 'basic-drone',
  });
  return observation;
}

test('a true regular destruction draws the procedural shatter, never the superseded white square, and cleans it up (patch §4.1, V021-AC-009)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const observation = await captureRegularBurst(page, 'prepared');

  // A later window shows the destroyed drones' bursts are gone: the effect never
  // became a leaked surface.
  const later = await sampleDestructionWindow(page, 4000);
  console.log(
    `[V021-WI-05] regular later window ${JSON.stringify(measuredFacts(later))}`,
  );
  expect(later.longestBurstStreak).toBeLessThanOrEqual(BURST_STREAK_LIMIT);
  expect(later.maxWhitishRun).toBeLessThan(WHITE_RUN_LIMIT);
  expect(later.maxWhitishPixels).toBeLessThan(WHITE_AREA_LIMIT);
  writeBurstEvidence('v021-wi-05-regular-later-window', later, {
    context: 'prepared',
    purpose:
      'the later quiet window proves the destroyed drones bursts were removed instead of persisting on the canvas',
  });
  expect(observation.burstFrames).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test('the measured destruction burst renders over the prepared and the forced-fallback enemy bodies alike at 1280 x 600 (patch §4.1, V021-DEC-005)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const prepared = await captureRegularBurst(page, 'prepared');

  // Every prepared enemy PNG request is aborted, so the same authoritative
  // destructions render over the approved procedural fallback bodies while the
  // destruction shatter stays the identical procedural effect.
  const abortedEnemyImages: string[] = [];
  await page.route('**/enemies/*.png', async (route) => {
    abortedEnemyImages.push(route.request().url());
    await route.abort();
  });
  const fallback = await captureRegularBurst(page, 'forced-fallback');
  expect(abortedEnemyImages.length).toBeGreaterThanOrEqual(3);

  // The burst scales from the destroyed enemy's complete visual dimension and
  // never from a prepared asset, so both contexts measure the same effect within
  // the sampler's frame-quantisation tolerance.
  expect(
    Math.abs(fallback.maxDangerExtent - prepared.maxDangerExtent),
  ).toBeLessThanOrEqual(BURST_EXTENT_PARITY);
  expect(
    Math.abs(fallback.burstFrameExtent - prepared.burstFrameExtent),
  ).toBeLessThanOrEqual(BURST_EXTENT_PARITY);
  console.log(
    `[V021-WI-05] prepared ${prepared.maxDangerExtent}px/${prepared.burstFrameExtent}px forced-fallback ${fallback.maxDangerExtent}px/${fallback.burstFrameExtent}px parity limit ${BURST_EXTENT_PARITY}px`,
  );
  writeBurstEvidence('v021-wi-05-prepared-fallback-parity', fallback, {
    context: 'forced-fallback',
    preparedContext: {
      maxDangerExtent: prepared.maxDangerExtent,
      burstFrameExtent: prepared.burstFrameExtent,
      burstFrames: prepared.burstFrames,
    },
    abortedEnemyImageRequests: abortedEnemyImages.length,
    parityLimitPx: BURST_EXTENT_PARITY,
    parityMeasuredPx: Math.abs(
      fallback.maxDangerExtent - prepared.maxDangerExtent,
    ),
  });
  expect(prepared.burstFrames).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

/** Ends the current destruction window (a stop signal, never a measurement
 *  change): the window has already covered the whole observed effect. */
async function stopDestructionWindow(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      globalThis as unknown as { __v021wi05StopSampling?: boolean }
    ).__v021wi05StopSampling = true;
  });
}

/** Applies the canonical development `Elite: Vulnerable` phase transition. */
async function forceEliteVulnerable(page: Page): Promise<boolean> {
  await toggleDebug(page);
  const dialog = debugPanel(page);
  const visible = await dialog.isVisible().catch(() => false);
  if (!visible) {
    return false;
  }
  const applied = await dialog
    .getByRole('button', { name: 'Elite: Vulnerable' })
    .click({ timeout: 3000 })
    .then(
      () => true,
      () => false,
    );
  await closeDebug(page);
  return applied;
}

/** One tracked movement step: real pointer input aimed at where the swept Elite
 *  will be when the automatic Machine Gun fire reaches its row. */
function eliteAimX(
  elite: { readonly centerX: number; readonly centerY: number },
  previousX: number | null,
): number {
  const velocity =
    previousX === null
      ? 0
      : Math.max(
          -ELITE_SWEEP_SPEED_PX_PER_SECOND,
          Math.min(
            ELITE_SWEEP_SPEED_PX_PER_SECOND,
            (elite.centerX - previousX) / (ELITE_TRACK_INTERVAL_MS / 1000),
          ),
        );
  const flightSeconds = Math.min(
    2,
    Math.max(
      0.2,
      (AIRCRAFT_ALTITUDE - elite.centerY) / PROJECTILE_SPEED_PX_PER_SECOND,
    ),
  );
  return Math.min(
    MINIMUM_VIEWPORT.width - 40,
    Math.max(40, elite.centerX + velocity * flightSeconds),
  );
}

test('a true Elite destruction reaches the same procedural shatter through the Elite record variant (patch §4.1, V021-DEC-005)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // God Mode keeps the tracked Aircraft alive while the Debug-spawned Elite
  // fires its cannons and homing Cores; it changes no collision, destruction or
  // presentation rule.
  await startCombat(page, { godMode: true });
  await openDebug(page);
  await clickDebugAction(page, 'Spawn Elite');
  await clickDebugAction(page, 'Elite: Vulnerable');
  await closeDebug(page);

  // The tracked box follows the Elite's own centre and is frozen on the observed
  // destruction, so its `burst` set can only contain that destruction's effect.
  const first = await readObservability(page);
  const firstElite = first?.activeEnemyBounds.find(
    (bounds) => bounds.type === 'elite-drone',
  );
  expect(firstElite).toBeDefined();
  const initialCentre = {
    x: firstElite?.centerX ?? MINIMUM_VIEWPORT.width / 2,
    y: firstElite?.centerY ?? 0,
  };
  await publishBoxSignal(page, {
    centerX: initialCentre.x,
    centerY: initialCentre.y,
    halfWidth: ELITE_TRACK_BOX_HALF_SIZE,
    halfHeight: ELITE_TRACK_BOX_HALF_SIZE,
    phase: 'alive',
  });

  const window = sampleTrackedBoxWindow(page, ELITE_KILL_BUDGET_MS);
  const startedAt = Date.now();
  let previous = first;
  let killed = false;
  let forcedVulnerable = 0;
  let movements = 0;
  let eliteBounds: { readonly width: number; readonly height: number } = {
    width: firstElite?.width ?? 0,
    height: firstElite?.height ?? 0,
  };
  let destructionCentre = initialCentre;
  while (Date.now() - startedAt < ELITE_KILL_BUDGET_MS) {
    const state = await readObservability(page);
    if (state === null) {
      break;
    }
    if ((state.destroyedEnemiesByType['elite-drone'] ?? 0) > 0) {
      killed = true;
      break;
    }
    const elite = state.activeEnemyBounds.find(
      (bounds) => bounds.type === 'elite-drone',
    );
    if (elite === undefined) {
      break;
    }
    eliteBounds = { width: elite.width, height: elite.height };
    destructionCentre = { x: elite.centerX, y: elite.centerY };
    await publishBoxSignal(page, {
      centerX: elite.centerX,
      centerY: elite.centerY,
      halfWidth: ELITE_TRACK_BOX_HALF_SIZE,
      halfHeight: ELITE_TRACK_BOX_HALF_SIZE,
      phase: 'alive',
    });
    const previousElite = previous?.activeEnemyBounds.find(
      (bounds) => bounds.type === 'elite-drone',
    );
    await page.mouse.move(
      eliteAimX(elite, previousElite?.centerX ?? null),
      AIRCRAFT_ALTITUDE,
    );
    movements += 1;
    previous = state;
    if (state.elite?.phase === 'armoured') {
      if (await forceEliteVulnerable(page)) {
        forcedVulnerable += 1;
      }
    }
    await page.waitForTimeout(ELITE_TRACK_INTERVAL_MS);
  }
  if (killed) {
    // Freeze the tracked box on the destruction centre and start the `burst`
    // set; the whole 15-step Elite effect is inside this tail.
    await publishBoxSignal(page, {
      centerX: destructionCentre.x,
      centerY: destructionCentre.y,
      halfWidth: ELITE_TRACK_BOX_HALF_SIZE,
      halfHeight: ELITE_TRACK_BOX_HALF_SIZE,
      phase: 'destroyed',
    });
    await page.waitForTimeout(ELITE_BURST_TAIL_MS);
  }
  await stopDestructionWindow(page);
  const observation = await window;
  const state = await readObservability(page);
  console.log(
    `[V021-WI-05] elite killed=${killed} forcedVulnerable=${forcedVulnerable} movements=${movements} elapsedMs=${Date.now() - startedAt} bounds=${JSON.stringify(eliteBounds)} baseline=${JSON.stringify(observation.baseline)} burst=${JSON.stringify(observation.burst)} widest=${observation.widestFrameExtent}`,
  );

  expect(killed).toBe(true);
  expect(observation.frames).toBeGreaterThan(0);
  expect(state?.activeEnemiesByType['elite-drone']).toBe(0);
  expect(state?.destroyedByProjectileEnemiesByType['elite-drone']).toBe(1);
  // The tracked box was quiet while the Elite still existed: no `danger` surface
  // in it reached a burst span, so the `burst` set cannot be a pre-existing
  // surface.
  expect(observation.baseline.maxDangerExtent).toBeLessThan(BURST_ROW_EXTENT);
  // The authoritative destruction drew the procedural shatter right there.
  expect(observation.burst.burstFrames).toBeGreaterThan(0);
  expect(observation.burst.maxDangerExtent).toBeGreaterThanOrEqual(
    BURST_ROW_EXTENT,
  );
  expect(observation.widestFrameImage).not.toBeNull();
  // Bounded: the Elite effect is 15 executed steps, so a burst that persisted
  // across the whole tail would prove a leaked surface.
  expect(observation.burst.longestBurstStreak).toBeLessThanOrEqual(
    BURST_STREAK_LIMIT,
  );
  expect(observation.burst.burstFrames).toBeLessThanOrEqual(
    ELITE_BURST_FRAME_LIMIT,
  );
  // No white block at the destruction centre.
  expect(observation.burst.maxWhitishRun).toBeLessThan(WHITE_RUN_LIMIT);
  expect(observation.burst.maxWhitishPixels).toBeLessThan(WHITE_AREA_LIMIT);
  writeEvidenceRecord(
    'v021-wi-05-elite-kill-burst',
    observation.widestFrameImage,
    {
      scannedRegion: observation.scannedRegion,
      trackedBoxHalfSizePx: ELITE_TRACK_BOX_HALF_SIZE,
      destructionCentre,
      baseline: observation.baseline,
      burst: observation.burst,
      widestFrameExtent: observation.widestFrameExtent,
      frames: observation.frames,
      destructionObservedAfterMs: Date.now() - startedAt,
    },
    {
      context: 'elite',
      eliteRole: 'elite-drone',
      eliteCompleteVisualBounds: eliteBounds,
      tracking: {
        mode: 'real pointer input, velocity- and flight-time-led automatic fire',
        movements,
        forcedVulnerableTransitions: forcedVulnerable,
        elapsedMs: Date.now() - startedAt,
        developmentSupportUsed: [
          'Debug Spawn Elite',
          'Debug Elite: Vulnerable',
          'Debug God Mode',
        ],
      },
      attribution:
        'the tracked box follows the Elite centre; `baseline` are the frames measured while the Elite existed and `burst` the frames after the authoritative destruction was observed, and the widest `burst` frame is the saved PNG',
      destroyedEnemiesByType: state?.destroyedEnemiesByType ?? null,
      destroyedByProjectileEnemiesByType:
        state?.destroyedByProjectileEnemiesByType ?? null,
    },
  );
  expect(pageErrors).toEqual([]);
});

test('a bounded dense-kill window keeps the browser frame loop healthy and leaves no leaked burst behind (local observation, Verification §18.1)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await startCombat(page, { godMode: true });
  await page.mouse.move(640, AIRCRAFT_ALTITUDE);

  // A representative dense snapshot from approved development surfaces only: the
  // authored E1 Encounter (92 Basics) plus one Hunter, plus six Basics destroyed
  // one after another inside the automatic fire column. The Ranged and Elite
  // roles are deliberately NOT part of this snapshot: they fire `danger`-coloured
  // projectiles continuously, which would make the `danger` measurement of the
  // destruction bursts unattributable. Their destruction presentation is owned by
  // the deterministic and real-renderer regressions and by the Elite case above.
  await openDebug(page);
  await clickDebugAction(page, 'Spawn E1');
  const activeRow = debugPanel(page).locator('.ds-field-row', {
    hasText: 'Active Enemies',
  });
  await expect(activeRow).toContainText('Basic 92');
  await clickDebugAction(page, 'Spawn Hunter');
  for (let spawn = 0; spawn < 6; spawn += 1) {
    await clickDebugAction(page, 'Spawn Basic');
  }
  const activeEnemyText = (await activeRow.textContent())?.trim() ?? '';
  await closeDebug(page);

  // The page's own animation-frame intervals across the dense window.
  await page.evaluate(() => {
    const probe = globalThis as unknown as {
      __v021wi05Frames?: number[];
      __v021wi05StopFrames?: boolean;
    };
    probe.__v021wi05Frames = [];
    probe.__v021wi05StopFrames = false;
    let last = performance.now();
    const tick = (now: number): void => {
      probe.__v021wi05Frames?.push(now - last);
      last = now;
      if (probe.__v021wi05StopFrames !== true) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });

  const observation = await sampleDestructionWindow(page, 12_000);
  const state = await readObservability(page);
  const pageFrames = await page.evaluate(() => {
    const probe = globalThis as unknown as {
      __v021wi05Frames?: number[];
      __v021wi05StopFrames?: boolean;
    };
    probe.__v021wi05StopFrames = true;
    return probe.__v021wi05Frames ?? [];
  });
  const sorted = [...pageFrames].sort((left, right) => left - right);
  const observed = {
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
  console.log(
    `[V021-WI-05] dense window ${JSON.stringify(measuredFacts(observation))} frames ${JSON.stringify(observed)}`,
  );
  const record = {
    schemaVersion: 1,
    workItem: 'V021-WI-05',
    kind: 'bounded-local-destruction-cost-and-cleanup-observation',
    referenceClaim: false,
    recordingSurface:
      'development project, 1280 x 600 viewport, real Phaser canvas',
    stepModel: { fixedStepMilliseconds: 16.67, regularEffectSteps: 12 },
    window: {
      denseWindowMs: 12_000,
      laterWindowMs: 4_000,
      measurement: measuredFacts(observation),
    },
    denseKillSnapshot: {
      activeEnemyRow: activeEnemyText,
      note: 'authored E1 (92 Basics) plus one Debug-spawned Hunter and six Debug-spawned Basics destroyed one after another in the automatic Machine Gun column; the Ranged and Elite roles are excluded because their continuous danger-coloured projectiles would make the destruction measurement unattributable',
    },
    destroyedEnemiesByType: state?.destroyedEnemiesByType ?? null,
    observed,
    limitations: [
      'One local development-server window with bounded Debug spawns; it is not the accepted dense-workload FPS scenario and certifies no release performance.',
      'The sampled frame intervals include the in-page sampler own per-frame readback cost, so they are an upper bound of the frame interval rather than a reference measurement.',
      'Only enemy counts and destruction causes are observable without a test hook; projectile and burst surface counts are covered by the deterministic boundaries and the real-renderer regression.',
    ],
    capturedAt: new Date().toISOString(),
  };
  const outputPath = join(
    evidenceDirectory(),
    'v021-wi-05-destruction-cost-observation.json',
  );
  writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`[V021-WI-05] cost observation written: ${outputPath}`);

  expect(observation.burstFrames).toBeGreaterThan(0);
  expect(observation.maxDangerExtent).toBeGreaterThanOrEqual(BURST_ROW_EXTENT);

  // Cleanup: a later quiet window shows no leaked burst surface.
  const later = await sampleDestructionWindow(page, 4000);
  console.log(
    `[V021-WI-05] dense later window ${JSON.stringify(measuredFacts(later))}`,
  );
  expect(later.longestBurstStreak).toBeLessThanOrEqual(BURST_STREAK_LIMIT);
  writeBurstEvidence('v021-wi-05-dense-window-later', later, {
    context: 'dense-later-window',
    purpose:
      'the later window of the dense-kill observation proves the bursts were removed instead of persisting on the canvas',
  });

  // Bounded sanity only: a stalled frame loop would show multi-frame gaps far
  // above the 16.7 ms fixed step while the bursts render.
  if (sorted.length > 0) {
    expect(observed.maxFrameIntervalMs ?? 0).toBeLessThan(200);
  }
  expect(pageErrors).toEqual([]);
});
