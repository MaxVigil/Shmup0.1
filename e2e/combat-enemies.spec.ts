import { evidenceDirectory } from '../scripts/evidence-output.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

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
const EVIDENCE_DIR = evidenceDirectory();

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

/** Reads the development Debug Overlay's Field Rows as label → value (Combat
 *  §11, Epic §17): the canonical observability surface used to prove that the
 *  render below is the real authoritative Hunter and not a fixture. */
async function readDebugFields(
  dialog: Locator,
): Promise<ReadonlyMap<string, string>> {
  const rows = await dialog.evaluate((element) =>
    Array.from(element.querySelectorAll('.ds-field-row')).map((row) => ({
      label: row.children[0]?.textContent?.trim() ?? '',
      value: row.children[1]?.textContent?.trim() ?? '',
    })),
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.label, row.value);
  }
  return map;
}

interface RenderedSilhouette {
  readonly pixels: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly centroidX: number;
  readonly centroidY: number;
  /** Long-axis orientation of the rendered pixels measured from the horizontal
   *  screen axis, in degrees inside `[0, 180)`. Screen `y` grows downward and
   *  the configured enemy artwork is authored nose-down, so an unrotated or
   *  no-op render measures `90` and the authoritative v0.2.1 heading tilts it. */
  readonly axisDegrees: number;
  /** The most frequent canvas colour, the self-calibrated background tone. */
  readonly backgroundTone: string;
  /** The concrete pixel sample the measurement used, in canvas pixels. `xMax`
   *  and `yMax` are exclusive, and `laneXMin`/`laneXMax` are the excluded
   *  Aircraft automatic-fire projectile lane band. */
  readonly region: {
    readonly xMin: number;
    readonly xMax: number;
    readonly yMin: number;
    readonly yMax: number;
    readonly laneXMin: number;
    readonly laneXMax: number;
  };
}

/** Authoritative complete rendered bounds of one active enemy, as reported by
 *  the development-only `window.__shmupDevObservability__()` read model (the
 *  same surface the other evidence specs read). It is a read-only report of the
 *  simulated runtime: it can locate the measured Hunter, but it never produces
 *  the measurement. */
interface EnemyBounds {
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
}

interface DevObservability {
  readonly activeEnemiesByType: Readonly<Record<string, number>>;
  readonly activeEnemyBounds: readonly (EnemyBounds & {
    readonly type: string;
  })[];
}

interface RenderedFrame {
  readonly silhouette: RenderedSilhouette;
  readonly png: Uint8Array;
}

/** The HUD-free Approach corridor and the excluded Aircraft projectile lane, as
 *  ratios of the canvas box, so the page resolves them for the exact screenshot
 *  it measured instead of assuming a viewport. */
const SAMPLE_REGION = {
  xMinRatio: 0,
  xMaxRatio: 0.6,
  yMinRatio: 0.1,
  yMaxRatio: 0.7,
} as const;
const PROJECTILE_LANE_REGION = {
  xMinRatio: 0.46,
  xMaxRatio: 0.54,
} as const;

/** One screen-space direction folded into the undirected axis range `[0, 180)`. */
function axisDegreesOf(dx: number, dy: number): number {
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 180) % 180;
}

/** The acute angle between two undirected axes, in degrees (`0`–`90`). */
function axisMisalignmentDegrees(first: number, second: number): number {
  const difference = Math.abs(first - second) % 180;
  return Math.min(difference, 180 - difference);
}

/** Distance from a measured pixel centroid to the authoritative track segment
 *  bracketed by the two runtime reports that surround one canvas screenshot. */
function distanceToSegmentPx(
  point: { readonly x: number; readonly y: number },
  from: EnemyBounds,
  to: EnemyBounds,
): number {
  const deltaX = to.centerX - from.centerX;
  const deltaY = to.centerY - from.centerY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - from.centerX, point.y - from.centerY);
  }
  const along = Math.min(
    1,
    Math.max(
      0,
      ((point.x - from.centerX) * deltaX + (point.y - from.centerY) * deltaY) /
        lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (from.centerX + along * deltaX),
    point.y - (from.centerY + along * deltaY),
  );
}

/**
 * Reads the authoritative runtime's own report of the active Hunter's complete
 * rendered bounds, or `null` when no Hunter is active. Read immediately before
 * and immediately after a canvas screenshot, the two reports bracket the
 * measured silhouette in the session under test without contributing anything
 * to the measurement itself.
 */
async function readHunterBounds(page: Page): Promise<EnemyBounds | null> {
  return page.evaluate(() => {
    const observability = (
      window as unknown as {
        readonly __shmupDevObservability__?: () => DevObservability;
      }
    ).__shmupDevObservability__?.();
    const hunter = observability?.activeEnemyBounds.find(
      (bounds) => bounds.type === 'hunter-drone',
    );
    return hunter === undefined
      ? null
      : {
          centerX: hunter.centerX,
          centerY: hunter.centerY,
          width: hunter.width,
          height: hunter.height,
        };
  });
}

/**
 * Captures the real Combat canvas and measures its rendered silhouette from the
 * actual canvas pixels in the real page — never from a state flag or a
 * production hook.
 *
 * The most frequent canvas colour is the self-calibrated background (Combat
 * renders one flat background via `cameras.main.setBackgroundColor`), and every
 * pixel inside the sampled corridor that differs from it belongs to the measured
 * silhouette.
 *
 * Three real constraints of the running Combat screen shape the sample:
 * 1. Every Overlay renders a full-viewport Scrim above the canvas
 *    (`primitives.css` `.ds-overlay__scrim`), so a frame may only be measured
 *    with no Overlay open — Combat is sampled while running.
 * 2. `.ds-combat-canvas` is `inset: 0`, so the DOM Combat HUD (the viewport
 *    system column at the top, the utility cluster at the top-right, and the
 *    Aircraft's own Hull bar band) is composited inside the canvas' box. The
 *    sample is therefore restricted to the HUD-free upper-left corridor
 *    `x < 0.6 W`, `0.1 H ≤ y < 0.7 H` — exactly the corridor the authored
 *    `upper-left` Side Entry Hunter traverses on its Approach (it enters at
 *    `x = -21 px`, `y = 0.20 × 600 = 120 px` and closes on the resting Aircraft
 *    at `(0.5 W, 0.8 H)`), which contains no HUD chrome.
 * 3. The Aircraft fires its Machine Gun automatically from the first Combat
 *    frame, so a stream of small near-white projectiles travels up the canvas
 *    centre lane (`x ≈ 0.5 W`) through that corridor even before any Hunter
 *    exists. The sample excludes that lane band (`0.46 W ≤ x < 0.54 W`) — it is
 *    a different object at a known screen position, not part of the measured
 *    silhouette.
 *
 * `axisDegrees` is the pixel-covariance long axis: the direction the rendered
 * artwork actually points, independent of every simulation value.
 */
async function captureCorridorFrame(page: Page): Promise<RenderedFrame> {
  const png = await page.locator('.ds-combat-canvas canvas').screenshot();
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  const silhouette = await page.evaluate(
    async ({
      source,
      sample,
      lane,
    }: {
      source: string;
      sample: typeof SAMPLE_REGION;
      lane: typeof PROJECTILE_LANE_REGION;
    }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) {
        throw new Error('Missing 2D context for the Combat canvas sample');
      }
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, width, height);
      // 1. Self-calibrated background: the most frequent exact canvas colour.
      const toneCounts = new Map<number, number>();
      for (let index = 0; index < data.length; index += 4) {
        const key =
          ((data[index] ?? 0) << 16) |
          ((data[index + 1] ?? 0) << 8) |
          (data[index + 2] ?? 0);
        toneCounts.set(key, (toneCounts.get(key) ?? 0) + 1);
      }
      let backgroundKey = 0;
      let backgroundCount = -1;
      for (const [key, count] of toneCounts) {
        if (count > backgroundCount) {
          backgroundCount = count;
          backgroundKey = key;
        }
      }
      const backgroundRed = (backgroundKey >> 16) & 0xff;
      const backgroundGreen = (backgroundKey >> 8) & 0xff;
      const backgroundBlue = backgroundKey & 0xff;
      // 2. The HUD-free upper-left Approach corridor of the authored `upper-left`
      //    Hunter, with the Aircraft's automatic-fire projectile lane excluded.
      //    DOM Combat HUD chrome (the top-centre system column and the top-right
      //    utility cluster) and the Aircraft with its own Hull bar band are all
      //    outside the corridor. `corridorBottom` and `laneXMax` are exclusive.
      const corridorRight = Math.floor(width * sample.xMaxRatio);
      const corridorTop = Math.floor(height * sample.yMinRatio);
      const corridorBottom = Math.floor(height * sample.yMaxRatio);
      const laneXMin = Math.floor(width * lane.xMinRatio);
      const laneXMax = Math.floor(width * lane.xMaxRatio);
      let pixels = 0;
      let sumX = 0;
      let sumY = 0;
      let sumXX = 0;
      let sumYY = 0;
      let sumXY = 0;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let index = 0; index < data.length; index += 4) {
        const pixel = index / 4;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        if (x >= corridorRight || y < corridorTop || y >= corridorBottom) {
          continue;
        }
        if (x >= laneXMin && x < laneXMax) {
          continue;
        }
        const r = data[index] ?? 0;
        const g = data[index + 1] ?? 0;
        const b = data[index + 2] ?? 0;
        const delta = Math.max(
          Math.abs(r - backgroundRed),
          Math.abs(g - backgroundGreen),
          Math.abs(b - backgroundBlue),
        );
        if (delta <= 24) {
          continue;
        }
        pixels += 1;
        sumX += x;
        sumY += y;
        sumXX += x * x;
        sumYY += y * y;
        sumXY += x * y;
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
      const backgroundTone = `#${backgroundKey.toString(16).padStart(6, '0')}`;
      const region = {
        xMin: Math.floor(width * sample.xMinRatio),
        xMax: corridorRight,
        yMin: corridorTop,
        yMax: corridorBottom,
        laneXMin,
        laneXMax,
      };
      if (pixels === 0) {
        return {
          pixels: 0,
          minX: 0,
          minY: 0,
          maxX: 0,
          maxY: 0,
          centroidX: 0,
          centroidY: 0,
          axisDegrees: 0,
          backgroundTone,
          region,
        };
      }
      const centroidX = sumX / pixels;
      const centroidY = sumY / pixels;
      const covarianceXX = sumXX / pixels - centroidX * centroidX;
      const covarianceYY = sumYY / pixels - centroidY * centroidY;
      const covarianceXY = sumXY / pixels - centroidX * centroidY;
      const axisRadians =
        0.5 * Math.atan2(2 * covarianceXY, covarianceXX - covarianceYY);
      const axisDegrees = ((axisRadians * 180) / Math.PI + 180) % 180;
      return {
        pixels,
        minX,
        minY,
        maxX,
        maxY,
        centroidX,
        centroidY,
        axisDegrees,
        backgroundTone,
        region,
      };
    },
    { source: dataUrl, sample: SAMPLE_REGION, lane: PROJECTILE_LANE_REGION },
  );
  return { silhouette, png };
}

test('a Debug-spawned Hunter renders the authoritative nose and that nose owns its travel (V021-AC-003, patch §3/§6–§7)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await startCombat(page);

  // (0) Sampling precondition — measured, not assumed. With no Hunter active the
  // sampled corridor contains zero rendered pixels: its only Combat content is
  // the Aircraft's automatic Machine Gun stream, which travels the excluded
  // canvas-centre lane. Mission 01's first authored encounter
  // (`interception-01-e1`, 92 Basic Drones entering from the top) does not start
  // until 4 s of Combat time, and the attempt's own Debug read reports the
  // mission clock it was taken at, so a contaminated sample is impossible to
  // hide: any authored enemy inside the corridor would make this frame read
  // non-empty and fail the run instead of silently measuring it.
  const backgroundFrame = await captureCorridorFrame(page);
  expect(backgroundFrame.silhouette.pixels).toBe(0);

  // The development Debug surface is the supported harness for rendering a real
  // Hunter at the minimum viewport: it pauses Combat (`lifecycle.ts`: running +
  // no Overlay → Debug pauses the authoritative runtime) and its `Spawn Hunter`
  // action relays the authoritative `combat-debug/spawn-enemy` command, which
  // places the Hunter into the CURRENT mission's authored Side Placement rather
  // than inventing geometry.
  await page.keyboard.press('F1');
  const debug = page.getByRole('dialog');
  await expect(debug.getByRole('heading', { name: 'Debug' })).toBeVisible();
  const beforeSpawn = await readDebugFields(debug);
  await debug.getByRole('button', { name: 'Spawn Hunter' }).click();
  // The spawned Hunter is authoritative — the current mission's authored Side
  // Entry member — and no Combat time elapses while Debug is open.
  await expect
    .poll(async () => (await readDebugFields(debug)).get('Active Enemies'), {
      timeout: 5000,
    })
    .toContain('Hunter 1');
  const afterSpawn = await readDebugFields(debug);
  expect(afterSpawn.get('Mission Clock')).toBe(
    beforeSpawn.get('Mission Clock'),
  );

  await debug.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Resume the real fixed-step simulation and measure it while it runs, because
  // every Overlay Scrim covers the canvas and the Debug Overlay is no exception:
  // the Side Entry member first completes its ~0.39 s horizontal entry at
  // `18% VH/s` (it spawns at `x = -21 px`, `y = 120 px`), then flies its 2.0 s
  // Approach leg at the same speed toward the resting Aircraft at `(640, 480)`.
  // Both samples therefore land inside the Approach, and each is bracketed by
  // the authoritative runtime's own reports of the active Hunter's complete
  // rendered bounds, read immediately before and immediately after that
  // screenshot.
  await page.waitForTimeout(1100);
  const firstBounds = await readHunterBounds(page);
  const firstFrame = await captureCorridorFrame(page);
  const firstBoundsAfter = await readHunterBounds(page);
  await page.waitForTimeout(600);
  const secondBounds = await readHunterBounds(page);
  const secondFrame = await captureCorridorFrame(page);
  const secondBoundsAfter = await readHunterBounds(page);
  expect(firstBounds).not.toBeNull();
  expect(firstBoundsAfter).not.toBeNull();
  expect(secondBounds).not.toBeNull();
  expect(secondBoundsAfter).not.toBeNull();

  const first = firstFrame.silhouette;
  const second = secondFrame.silhouette;
  const firstWidthPx = first.maxX - first.minX + 1;
  const firstHeightPx = first.maxY - first.minY + 1;
  const secondWidthPx = second.maxX - second.minX + 1;
  const secondHeightPx = second.maxY - second.minY + 1;
  const firstTiltDegrees = Math.abs(90 - first.axisDegrees);
  const secondTiltDegrees = Math.abs(90 - second.axisDegrees);
  const travelX = second.centroidX - first.centroidX;
  const travelY = second.centroidY - first.centroidY;
  const travelDistancePx = Math.hypot(travelX, travelY);
  const travelAxisDegrees = axisDegreesOf(travelX, travelY);
  const noseAxisMisalignmentDegrees = axisMisalignmentDegrees(
    second.axisDegrees,
    travelAxisDegrees,
  );
  // The authoritative cross-check locates the measured pixels on the reported
  // track instead of guessing this machine's screenshot latency, which is large
  // and variable here (the recorded `boundsReportBracketPx` values span ~9 px
  // to ~88 px of Hunter travel, i.e. about 0.1 s to 0.8 s). Combat runs while
  // it is captured (no Overlay is open, and every Overlay Scrim covers the
  // canvas), the Approach moves the Hunter along one constant heading, and its
  // position is monotone, so the pixels of one screenshot can only belong to an
  // instant inside the segment the two surrounding reports bracket. The location
  // precision of one frame is therefore that recorded bracket width, while this
  // tolerance bounds only the agreement between the sprite's own picture-mass
  // centre and the reported centre of its complete rendered bounds: the evidence
  // records 0.02 px to 0.28 px across the frames measured so far, so 4 px keeps
  // an order of magnitude of margin and stays far below the ~33 px sprite and
  // the 768 px corridor.
  const centroidTrackTolerancePx = 4;
  const firstOffsetFromReportedTrackPx = distanceToSegmentPx(
    { x: first.centroidX, y: first.centroidY },
    firstBounds!,
    firstBoundsAfter!,
  );
  const secondOffsetFromReportedTrackPx = distanceToSegmentPx(
    { x: second.centroidX, y: second.centroidY },
    secondBounds!,
    secondBoundsAfter!,
  );
  const firstBoundsReportBracketPx = Math.hypot(
    firstBoundsAfter!.centerX - firstBounds!.centerX,
    firstBoundsAfter!.centerY - firstBounds!.centerY,
  );
  const secondBoundsReportBracketPx = Math.hypot(
    secondBoundsAfter!.centerX - secondBounds!.centerX,
    secondBoundsAfter!.centerY - secondBounds!.centerY,
  );

  // Evidence first: the real frames and the measured numbers land on disk even if
  // an assertion below fails, so a reviewer reads the truth of the attempt rather
  // than a retelling of it.
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(EVIDENCE_DIR, 'v021-wi-03-hunter-heading-1280x600-background.png'),
    backgroundFrame.png,
  );
  writeFileSync(
    join(EVIDENCE_DIR, 'v021-wi-03-hunter-heading-1280x600-frame-a.png'),
    firstFrame.png,
  );
  writeFileSync(
    join(EVIDENCE_DIR, 'v021-wi-03-hunter-heading-1280x600-frame-b.png'),
    secondFrame.png,
  );
  writeFileSync(
    join(EVIDENCE_DIR, 'v021-wi-03-hunter-heading-1280x600.json'),
    `${JSON.stringify(
      {
        viewport: MINIMUM_VIEWPORT,
        sample: {
          region: first.region,
          corridorRatios: SAMPLE_REGION,
          excludedProjectileLaneRatios: PROJECTILE_LANE_REGION,
          method:
            'real canvas pixels differing from the most frequent canvas ' +
            'colour by more than 24 in any channel, sampled in the HUD-free ' +
            'upper-left Approach corridor with the Aircraft automatic-fire ' +
            'projectile lane excluded; sampled with no Overlay open, because ' +
            'every Overlay Scrim covers the canvas',
        },
        backgroundFrameBeforeHunterSpawn: {
          pixels: backgroundFrame.silhouette.pixels,
          backgroundTone: backgroundFrame.silhouette.backgroundTone,
        },
        debugReadBeforeSpawn: {
          missionClock: beforeSpawn.get('Mission Clock') ?? null,
        },
        debugReadAfterSpawn: {
          activeEnemies: afterSpawn.get('Active Enemies') ?? null,
          missionClock: afterSpawn.get('Mission Clock') ?? null,
          combatSeed: afterSpawn.get('Combat Seed') ?? null,
        },
        authoritativeBoundsFirstFrame: {
          beforeCapture: firstBounds,
          afterCapture: firstBoundsAfter,
        },
        authoritativeBoundsSecondFrame: {
          beforeCapture: secondBounds,
          afterCapture: secondBoundsAfter,
        },
        firstFrame: {
          ...first,
          widthPx: firstWidthPx,
          heightPx: firstHeightPx,
          tiltFromVerticalDegrees: firstTiltDegrees,
          offsetFromReportedTrackPx: firstOffsetFromReportedTrackPx,
          boundsReportBracketPx: firstBoundsReportBracketPx,
        },
        secondFrame: {
          ...second,
          widthPx: secondWidthPx,
          heightPx: secondHeightPx,
          tiltFromVerticalDegrees: secondTiltDegrees,
          offsetFromReportedTrackPx: secondOffsetFromReportedTrackPx,
          boundsReportBracketPx: secondBoundsReportBracketPx,
        },
        travel: {
          x: travelX,
          y: travelY,
          distancePx: travelDistancePx,
          axisDegrees: travelAxisDegrees,
        },
        noseAxisMisalignmentDegrees,
        centroidTrackTolerancePx,
      },
      null,
      2,
    )}\n`,
  );

  // (a) The measured frames really contain one rendered Hunter: a real pixel mass
  // inside the Hunter's rotated complete rendered bounds (24.8 x 41.8 CSS px at
  // this viewport ⇒ a ≤ 48.6 x 42.4 rotated envelope at the ~60° Approach
  // heading), never a speck, and never clipped by any sample edge.
  expect(first.pixels).toBeGreaterThanOrEqual(120);
  expect(second.pixels).toBeGreaterThanOrEqual(120);
  for (const [frame, widthPx, heightPx] of [
    [first, firstWidthPx, firstHeightPx],
    [second, secondWidthPx, secondHeightPx],
  ] as const) {
    expect(widthPx).toBeGreaterThan(12);
    expect(heightPx).toBeGreaterThan(12);
    expect(widthPx).toBeLessThanOrEqual(90);
    expect(heightPx).toBeLessThanOrEqual(90);
    expect(frame.minX).toBeGreaterThan(frame.region.xMin);
    expect(frame.minY).toBeGreaterThan(frame.region.yMin);
    expect(frame.maxX).toBeLessThan(frame.region.xMax);
    expect(frame.maxY).toBeLessThan(frame.region.yMax);
    // The excluded projectile lane did not clip the Hunter either: the measured
    // silhouette stays clear of the band.
    expect(frame.maxX).toBeLessThan(frame.region.laneXMin);
  }

  // (b) Orientation evidence (§3, V021-AC-003): the configured Hunter artwork is
  // authored nose-down, so an unrotated or no-op render measures a vertical long
  // axis (`axisDegrees` 90 ⇒ tilt 0). The authoritative Approach heading toward
  // the resting Aircraft is ~60° off the vertical screen axis, so both frames
  // must measure that tilt from the pixels themselves.
  expect(firstTiltDegrees).toBeGreaterThan(40);
  expect(firstTiltDegrees).toBeLessThan(85);
  expect(secondTiltDegrees).toBeGreaterThan(40);
  expect(secondTiltDegrees).toBeLessThan(85);

  // (c) One heading owns BOTH movement and the rendered nose (§3, §6–§7): the
  // travel measured between the two frames must lie along the rendered long axis
  // of that same Hunter. An unrotated sprite (long axis 90° while this travel is
  // ~30°) fails, a mirrored tilt (long axis ~150°) fails, and the travel is
  // itself far from vertical, so the check cannot pass by accident.
  expect(travelDistancePx).toBeGreaterThan(25);
  expect(Math.abs(90 - travelAxisDegrees)).toBeGreaterThan(30);
  expect(noseAxisMisalignmentDegrees).toBeLessThan(25);

  // (d) The measured pixel mass is the Hunter the authoritative runtime reports:
  // each rendered centroid sits on the segment the two runtime reports bracket
  // around that screenshot, so the pixels are located on the reported track
  // without assuming a screenshot latency. The bracket has real width (the
  // Hunter really moved between the two reports), so the check is a segment and
  // not a single point.
  expect(firstBoundsReportBracketPx).toBeGreaterThan(1);
  expect(secondBoundsReportBracketPx).toBeGreaterThan(1);
  expect(firstOffsetFromReportedTrackPx).toBeLessThanOrEqual(
    centroidTrackTolerancePx,
  );
  expect(secondOffsetFromReportedTrackPx).toBeLessThanOrEqual(
    centroidTrackTolerancePx,
  );
  // Simulation-side agreement: the reported envelope is wider than tall, which
  // for this 24.8 x 41.8 artwork means the heading is more than 45° off the
  // vertical screen axis (`w·cos θ + h·sin θ > w·sin θ + h·cos θ ⇔ tan θ > 1`) —
  // the same ~60° the pixels measured.
  expect(firstBounds?.width ?? 0).toBeGreaterThan(firstBounds?.height ?? 0);
  expect(secondBounds?.width ?? 0).toBeGreaterThan(secondBounds?.height ?? 0);

  expect(pageErrors).toEqual([]);
});
