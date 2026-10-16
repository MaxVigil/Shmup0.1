import { evidenceDirectory } from '../scripts/evidence-output.mjs';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * S09 Player Weapons and Projectiles — representative cross-layer wiring and
 * browser-only evidence (Combat §8, AC-019, AC-021/022, AC-050, AC-076–077).
 * Exact cadence, velocity, lifetime, and geometry are covered by deterministic
 * unit tests; the browser proves only that the default Machine Gun path and
 * the Hangar-selected Cannon path each visibly render a projectile without any
 * firing input, that the solid `text-primary` projectile appears above the
 * aircraft, and that presentation survives resize without
 * duplicates, repeated asset requests, or page errors. Disposal has no user
 * path in S09 (mission end is S12); it is covered by the deterministic unit
 * layer plus the single-settled-canvas/HUD assertions below.
 *
 * V021-WI-04-A (patch §4, V021-DEC-002, V021-AC-004): the same owner also
 * captures NATIVE minimum-viewport pixels that distinguish every changed
 * silhouette from the shape it replaced — both player teardrops (the default
 * Machine Gun and the Hangar Cannon) and both non-Core enemy circles (the Ranged
 * shot and the Elite cannon, the same equal-diameter circle centred on each
 * unchanged authoritative projectile centre) — in the prepared and the forced
 * fallback enemy contexts. Each capture is measured from the rendered canvas
 * (connected clusters of one approved projectile colour, with their per-row and
 * per-column pixel extents), written to the attempt evidence directory, and
 * summarised in a small manifest for Product Owner visual review. Only
 * development surfaces are used: this project's Debug Overlay (F1), whose
 * authoritative spawn actions are the same `combat-debug/*` commands the
 * simulation owns. The projectiles themselves are always procedural, so the
 * prepared/fallback context changes only the enemy bodies in the frame.
 *
 * C01 correction (independent review 2026-10-09, S2 evidence reliability): the
 * enemy-shape acceptance predicate and the assertion over an accepted cluster
 * are the SAME condition, so a valid sub-pixel raster can no longer be selected
 * by a weaker predicate and then fail a stricter one, and every measured frame
 * writes its raw canvas, all measured clusters and the read-only observability
 * facts to the attempt directory BEFORE any silhouette assertion can fail. Both
 * silhouettes are accepted only on evidence the replaced rectangle can never
 * produce: the circle on equal rendered width/height, a filled area far below
 * its own box and a taper on BOTH axes, the teardrop on a gradual multi-row
 * leading taper, a trailing widest row, and a narrowing trailing row.
 *
 * C02 correction (Product Owner shape decision V021-DEC-002, 2026-10-09): the
 * focused calibration below proves that discrimination against the SUPERSEDED
 * horizontal/vertical ellipses, the older `fillRect` rectangles of every
 * projectile AABB, a filled square of the new diameter, a wrong-diameter circle,
 * a same-colour diamond, a wrong-colour diamond/circle and a merged pair at
 * every tested sub-pixel alignment, and that native circle rasters of both kinds
 * are accepted.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };
const EVIDENCE_DIR = evidenceDirectory();

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

interface AircraftSample {
  centerX: number;
  centerY: number;
  vw: number;
  vh: number;
}

/** Derives the authoritative aircraft centre from the Hull bar rect. */
function readAircraft(page: Page): Promise<AircraftSample | null> {
  return page.evaluate(() => {
    const hud = document.querySelector('.ds-combat-hud__bar');
    if (hud === null) {
      return null;
    }
    const rect = hud.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const shortSide = Math.min(vw, vh);
    const aircraftHeight = shortSide * 0.08;
    const gap = shortSide * 0.01;
    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top - gap - aircraftHeight / 2,
      vw,
      vh,
    };
  });
}

/** Screenshots the canvas and counts `text-primary` projectile pixels in the
 *  clear-sky band above the aircraft top edge. A single coarse presence
 *  sample, not a wall-clock motion inference. */
function projectilePixelCount(
  page: Page,
  width: number,
  height: number,
  skyBottom: number,
): Promise<number> {
  return page
    .locator('.ds-combat-canvas canvas')
    .screenshot()
    .then((shot) => {
      const dataUrl = `data:image/png;base64,${shot.toString('base64')}`;
      return page.evaluate(
        ({ dataUrl: source, width: w, height: h, bottom }) => {
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
            const left = Math.floor(w * 0.2);
            const right = Math.floor(w * 0.8);
            const band = Math.max(top, bottom - top);
            const data = ctx.getImageData(left, top, right - left, band).data;
            let count = 0;
            for (let index = 0; index < data.length; index += 4) {
              const r = data[index];
              const g = data[index + 1];
              const b = data[index + 2];
              if (
                Math.abs(r - 241) <= 3 &&
                Math.abs(g - 245) <= 3 &&
                Math.abs(b - 247) <= 3
              ) {
                count += 1;
              }
            }
            return count;
          });
        },
        { dataUrl, width, height, bottom: skyBottom },
      );
    });
}

/** Reads the aircraft, computes its top edge, and counts projectile pixels in
 *  the clear sky band between the top of the viewport and the aircraft. */
async function readProjectilePixels(page: Page): Promise<number> {
  const aircraft = await readAircraft(page);
  if (aircraft === null) {
    return 0;
  }
  const shortSide = Math.min(aircraft.vw, aircraft.vh);
  const aircraftTop = aircraft.centerY - (shortSide * 0.08) / 2;
  const skyBottom = Math.max(30, Math.floor(aircraftTop - 10));
  return projectilePixelCount(page, aircraft.vw, aircraft.vh, skyBottom);
}

/**
 * Shape classification of one measured cluster against the silhouette this
 * presentation must render, and against the shapes it replaced: the shared
 * player teardrop and the approved non-Core enemy circle, whose predicate and
 * assertion are the same decomposed evidence (see `circleEvidence`).
 */
function isTeardropCluster(cluster: MeasuredCluster): boolean {
  if (cluster.colour !== 'player') {
    return false;
  }
  // Projectile-sized: the authoritative AABB is 3 × 9, and a sub-pixel-aligned
  // shape measures at most one padded pixel beyond it on either axis.
  if (cluster.width < 2 || cluster.width > 4) {
    return false;
  }
  if (cluster.height < 5 || cluster.height > 11) {
    return false;
  }
  const widths = cluster.rowWidths;
  const widest = Math.max(...widths);
  if (widest < 2 || widest - Math.min(...widths) < 2) {
    return false;
  }
  // Pointed leading (upward) tip: the top rows are narrower than the widest row,
  // which sits in the trailing (lower) part of the teardrop.
  return (
    (widths[0] ?? 0) < widest &&
    widths.indexOf(widest) >= Math.floor(widths.length / 2)
  );
}

/** How many extents of one cluster axis are strictly narrower than its widest. */
function narrowedExtents(axis: readonly number[]): number {
  const widest = Math.max(...axis);
  return axis.filter((extent) => extent < widest).length;
}

/** The approved enemy-projectile diameter at `1280 × 600` (patch §4/V021-DEC-002). */
const ENEMY_CIRCLE_DIAMETER_PX = 7.2;
/** The approved size class: that diameter with the raster's own padded pixel. */
const ENEMY_CIRCLE_MIN_SPAN = 6;
const ENEMY_CIRCLE_MAX_SPAN = 9;
/** A circle covers about `π / 4` of its box, a filled square all of it. */
const ENEMY_CIRCLE_MIN_AREA_FRACTION = 0.6;
const ENEMY_CIRCLE_MAX_AREA_FRACTION = 0.93;
/** The filled area implies an equivalent diameter of about the approved `7.2 px`. */
const ENEMY_CIRCLE_MIN_EQUIVALENT_DIAMETER = 6;
const ENEMY_CIRCLE_MAX_EQUIVALENT_DIAMETER = 8.3;

/**
 * The complete measured circle evidence of one cluster (V021-WI-04-A, patch
 * §4/V021-DEC-002/V021-AC-004). Acceptance and the post-acceptance assertion are
 * BOTH derived from this one decomposition, so a cluster can never be selected
 * by a weaker predicate and then fail a stricter one (C01 review).
 *
 * Both non-Core enemy kinds render the SAME equal-diameter circle, whose
 * diameter is the longer side of each unchanged authoritative AABB
 * (`1.2% × 0.6%` / `0.6% × 1.2%` of the viewport short side = `7.2 px`):
 * 1. `colour`: the approved `danger` fill;
 * 2. `span`: that diameter with the pixel of raster slack, so the superseded
 *    horizontal Ranged ellipse (`~7 × 3`) and vertical cannon ellipse
 *    (`~3 × 7`) and the older `fillRect` rectangles of those AABBs fail here;
 * 3. `equalSpans`: the same rendered width and height, which both superseded
 *    ellipses and all three replaced rectangles also fail;
 * 4. `unpaintedCorners` and `taper`: a filled rectangle or square covers all
 *    four corners of its box and keeps a constant extent on every row and every
 *    column, a genuine circle raster can never do either;
 * 5. `area` and `diameter`: the filled area covers about `π / 4` of the box and
 *    implies the approved `7.2 px` diameter, which rejects the filled square
 *    (all of the box), a same-box diamond (about half) and a wrong-diameter
 *    circle.
 */
interface CircleEvidence {
  readonly colour: boolean;
  readonly span: boolean;
  readonly equalSpans: boolean;
  readonly unpaintedCorners: boolean;
  readonly taper: boolean;
  readonly area: boolean;
  readonly diameter: boolean;
  readonly areaFraction: number;
  readonly equivalentDiameter: number;
}

function circleEvidence(cluster: MeasuredCluster): CircleEvidence {
  const areaFraction = cluster.pixels / (cluster.width * cluster.height);
  const equivalentDiameter = 2 * Math.sqrt(cluster.pixels / Math.PI);
  return {
    colour: cluster.colour === 'danger',
    span:
      cluster.width >= ENEMY_CIRCLE_MIN_SPAN &&
      cluster.width <= ENEMY_CIRCLE_MAX_SPAN &&
      cluster.height >= ENEMY_CIRCLE_MIN_SPAN &&
      cluster.height <= ENEMY_CIRCLE_MAX_SPAN,
    equalSpans: Math.abs(cluster.width - cluster.height) <= 1,
    unpaintedCorners:
      (cluster.rowWidths[0] ?? 0) < cluster.width &&
      (cluster.rowWidths[cluster.rowWidths.length - 1] ?? 0) < cluster.width &&
      (cluster.columnHeights[0] ?? 0) < cluster.height &&
      (cluster.columnHeights[cluster.columnHeights.length - 1] ?? 0) <
        cluster.height,
    taper:
      narrowedExtents(cluster.rowWidths) > 0 &&
      narrowedExtents(cluster.columnHeights) > 0,
    area:
      areaFraction > ENEMY_CIRCLE_MIN_AREA_FRACTION &&
      areaFraction < ENEMY_CIRCLE_MAX_AREA_FRACTION,
    diameter:
      equivalentDiameter > ENEMY_CIRCLE_MIN_EQUIVALENT_DIAMETER &&
      equivalentDiameter < ENEMY_CIRCLE_MAX_EQUIVALENT_DIAMETER,
    areaFraction,
    equivalentDiameter,
  };
}

function isEnemyCircleCluster(cluster: MeasuredCluster): boolean {
  const evidence = circleEvidence(cluster);
  return (
    evidence.colour &&
    evidence.span &&
    evidence.equalSpans &&
    evidence.unpaintedCorners &&
    evidence.taper &&
    evidence.area &&
    evidence.diameter
  );
}

/** A measured lane band that satisfies the approved teardrop signature. */
function expectMeasuredTeardrop(playerLane: PlayerLaneSample): MeasuredBand {
  const bands = playerLane.bands.filter((band) => isMeasuredTeardrop(band));
  expect(bands.length).toBeGreaterThan(0);
  const band = bands[0]!;
  const widths = band.rowCoverage;
  const widest = Math.max(...widths);
  // The pointed leading tip widens gradually over several rows, the widest row
  // sits in the trailing part, and the trailing row narrows again at the rounded
  // end. A rectangle measures its full width from its first fully covered row
  // and keeps it, so it has at most one row that far below the widest one and
  // can never narrow again after a trailing widest row.
  expect(
    leadingTaperRows(widths, LEADING_TAPER_FRACTION),
  ).toBeGreaterThanOrEqual(TEARDROP_MIN_LEADING_TAPER_ROWS);
  expect(widths.indexOf(widest)).toBeGreaterThanOrEqual(
    Math.floor(widths.length * 0.6),
  );
  expect(widths[widths.length - 1]!).toBeLessThan(widest);
  // A rectangle would measure the same width on every row of its AABB.
  expect(widest - Math.min(...widths)).toBeGreaterThan(1);
  return band;
}

function classifyCluster(cluster: MeasuredCluster): readonly string[] {
  const labels: string[] = [];
  if (isTeardropCluster(cluster)) {
    labels.push('player-sized-tapering-cluster');
  }
  if (isEnemyCircleCluster(cluster)) {
    labels.push('enemy-circle-cluster');
  }
  return labels;
}

/** The analytic shape families this calibration rasterises synthetically. */
type SyntheticShape =
  | 'circle'
  | 'small-circle'
  | 'ellipse-horizontal'
  | 'ellipse-vertical'
  | 'diamond'
  | 'ranged-rectangle'
  | 'square-rectangle'
  | 'player-rectangle'
  | 'merged-circles';

/** Sub-samples per pixel axis in the synthetic raster below. */
const SYNTHETIC_SUB_SAMPLES = 8;
/** The sub-sample coverage at which the real colour tolerance counts a pixel. */
const SYNTHETIC_COVERAGE_THRESHOLD = 0.9;
/** The synthetic raster's shape centre, away from the canvas edges. */
const SYNTHETIC_CENTRE = 100.5;

/** The half extents and filled family of one synthetic shape. */
function syntheticShape(
  shape: SyntheticShape,
): readonly [number, number, 'disc' | 'diamond' | 'rectangle'] {
  switch (shape) {
    case 'circle':
    case 'merged-circles':
      return [3.6, 3.6, 'disc'];
    case 'small-circle':
      // The shorter AABB side instead of the approved `7.2 px` diameter.
      return [1.8, 1.8, 'disc'];
    case 'ellipse-horizontal':
      // The SUPERSEDED horizontal Ranged ellipse.
      return [3.6, 1.8, 'disc'];
    case 'ellipse-vertical':
      // The SUPERSEDED vertical Elite cannon ellipse.
      return [1.8, 3.6, 'disc'];
    case 'diamond':
      // The unchanged homing Core's shape in the projectile colour.
      return [3.6, 3.6, 'diamond'];
    case 'ranged-rectangle':
      return [3.6, 1.8, 'rectangle'];
    case 'square-rectangle':
      return [3.6, 3.6, 'rectangle'];
    case 'player-rectangle':
      return [1.5, 4.5, 'rectangle'];
  }
}

/**
 * An anti-aliasing-honest synthetic raster of one filled analytic shape at one
 * sub-pixel alignment, reported with the analyzer's painted-extent convention
 * (the bounding box of its painted pixels, with no empty rows or columns): a
 * pixel is painted when at least 90% of its `8 × 8` sub-samples fall inside the
 * shape, which is how the approved colour tolerance thresholds the real canvas.
 * It lets the acceptance predicate be checked for every shape and alignment
 * combination without a second renderer.
 */
function syntheticShapeProfile(
  shape: SyntheticShape,
  offsetX: number,
  offsetY: number,
): MeasuredCluster {
  const [halfX, halfY, family] = syntheticShape(shape);
  const centreX = SYNTHETIC_CENTRE + offsetX;
  const centreY = SYNTHETIC_CENTRE + offsetY;
  const insideShape = (x: number, y: number): boolean => {
    const dx = x - centreX;
    const dy = y - centreY;
    if (family === 'rectangle') {
      return Math.abs(dx) <= halfX && Math.abs(dy) <= halfY;
    }
    if (family === 'diamond') {
      return Math.abs(dx) / halfX + Math.abs(dy) / halfY <= 1;
    }
    if ((dx * dx) / (halfX * halfX) + (dy * dy) / (halfY * halfY) <= 1) {
      return true;
    }
    if (shape !== 'merged-circles') {
      return false;
    }
    // The merged pair: a second approved circle five pixels to the right.
    const second = dx - 5;
    return (
      (second * second) / (halfX * halfX) + (dy * dy) / (halfY * halfY) <= 1
    );
  };
  const painted = (x: number, y: number): boolean => {
    let insideCount = 0;
    for (let subY = 0; subY < SYNTHETIC_SUB_SAMPLES; subY += 1) {
      for (let subX = 0; subX < SYNTHETIC_SUB_SAMPLES; subX += 1) {
        if (
          insideShape(
            x + (subX + 0.5) / SYNTHETIC_SUB_SAMPLES,
            y + (subY + 0.5) / SYNTHETIC_SUB_SAMPLES,
          )
        ) {
          insideCount += 1;
        }
      }
    }
    return (
      insideCount / (SYNTHETIC_SUB_SAMPLES * SYNTHETIC_SUB_SAMPLES) >=
      SYNTHETIC_COVERAGE_THRESHOLD
    );
  };
  const members: { readonly x: number; readonly y: number }[] = [];
  const span = Math.ceil(Math.max(halfX, halfY)) + 4;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const first = Math.floor(SYNTHETIC_CENTRE - span);
  const last = Math.ceil(SYNTHETIC_CENTRE + span);
  for (let y = first; y <= last; y += 1) {
    for (let x = first; x <= last; x += 1) {
      if (!painted(x, y)) {
        continue;
      }
      members.push({ x, y });
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const rowWidths = new Array<number>(height).fill(0);
  const columnHeights = new Array<number>(width).fill(0);
  for (const member of members) {
    rowWidths[member.y - minY] = (rowWidths[member.y - minY] ?? 0) + 1;
    columnHeights[member.x - minX] = (columnHeights[member.x - minX] ?? 0) + 1;
  }
  return {
    colour: 'danger',
    pixels: members.length,
    minX,
    minY,
    width,
    height,
    rowWidths,
    columnHeights,
  };
}

/**
 * One measured band of consecutive covered canvas rows inside the Aircraft's
 * firing lane, with the coverage-weighted solid width of every row. Coverage is
 * estimated from each pixel's blend against the self-calibrated background, so a
 * sub-pixel tip still measures as a fraction of a pixel instead of being
 * thresholded away.
 */
interface MeasuredBand {
  readonly topRow: number;
  readonly rowCoverage: readonly number[];
}

/** The measured Aircraft firing lane: where a player teardrop actually flies. */
interface PlayerLaneSample {
  readonly laneHalfWidthPx: number;
  readonly backgroundTone: string;
  readonly bands: readonly MeasuredBand[];
}

/** The player projectile is 3 px wide at `1280 × 600`; the lane is its column. */
const LANE_HALF_WIDTH_PX = 4;
/** A row belongs to a measured band above this coverage. */
const LANE_ROW_COVERAGE = 0.2;
/**
 * A teardrop's pointed tip widens over several rows, so several leading rows are
 * more than this fraction of the way below the widest measured row. A rectangle
 * measures its full width from its first fully covered row and only its own two
 * edges are partial, so at most one leading row can be that far below.
 */
const LEADING_TAPER_FRACTION = 0.9;
const TEARDROP_MIN_LEADING_TAPER_ROWS = 3;

/**
 * The resolved `text-primary` token: the exact solid fill colour the Combat
 * presentation gives both player projectiles (read from the same Design System
 * custom property the presentation resolves).
 */
async function readPlayerProjectileRgb(page: Page): Promise<readonly number[]> {
  return page.evaluate(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-text-primary')
      .trim();
    const hex = /^#([0-9a-fA-F]{6})$/.exec(raw);
    if (hex !== null) {
      const value = Number.parseInt(hex[1] ?? '', 16);
      return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
    }
    const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(raw);
    if (rgb !== null) {
      return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    }
    return [241, 245, 247];
  });
}

/**
 * Measures the player projectile's own column above the Aircraft. The Aircraft
 * centre comes from the HUD bar the presentation owns, the background tone is
 * self-calibrated from the lane itself, and only pixels closer to the player
 * projectile colour than to any other approved projectile colour contribute, so
 * a passing enemy shot can never be measured as a player teardrop.
 */
async function measurePlayerLane(page: Page): Promise<PlayerLaneSample> {
  const aircraft = await readAircraft(page);
  if (aircraft === null) {
    return {
      laneHalfWidthPx: LANE_HALF_WIDTH_PX,
      backgroundTone: 'unknown',
      bands: [],
    };
  }
  const shot = await page.locator('.ds-combat-canvas canvas').screenshot();
  const dataUrl = `data:image/png;base64,${shot.toString('base64')}`;
  const topLimit = Math.floor(
    aircraft.centerY - (Math.min(aircraft.vw, aircraft.vh) * 0.08) / 2 - 2,
  );
  // LANE-BODY
  return page.evaluate(
    ({
      source,
      centerX,
      laneHalfWidth,
      top,
      rowCoverage,
      playerRgb: playerRgbInput,
    }) => {
      const empty = {
        laneHalfWidthPx: laneHalfWidth,
        backgroundTone: 'unknown',
        bands: [],
      };
      const playerRgb = playerRgbInput;
      const image = new Image();
      image.src = source;
      return image.decode().then(() => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context === null) {
          return empty;
        }
        context.drawImage(image, 0, 0);
        const left = Math.max(0, Math.floor(centerX - laneHalfWidth));
        const right = Math.min(
          canvas.width,
          Math.ceil(centerX + laneHalfWidth) + 1,
        );
        const rows = Math.min(canvas.height, top);
        const laneWidth = right - left;
        if (laneWidth <= 0 || rows <= 0) {
          return empty;
        }
        const { data } = context.getImageData(left, 0, laneWidth, rows);
        // Self-calibrated background: the most frequent exact lane colour.
        const tones = new Map<number, number>();
        for (let pixel = 0; pixel < laneWidth * rows; pixel += 1) {
          const key =
            ((data[pixel * 4] ?? 0) << 16) |
            ((data[pixel * 4 + 1] ?? 0) << 8) |
            (data[pixel * 4 + 2] ?? 0);
          tones.set(key, (tones.get(key) ?? 0) + 1);
        }
        let backgroundKey = 0;
        let backgroundCount = -1;
        for (const [key, count] of tones) {
          if (count > backgroundCount) {
            backgroundCount = count;
            backgroundKey = key;
          }
        }
        const background = [
          (backgroundKey >> 16) & 0xff,
          (backgroundKey >> 8) & 0xff,
          backgroundKey & 0xff,
        ];
        // LANE-COVERAGE
        const coverage = new Array<number>(rows).fill(0);
        for (let row = 0; row < rows; row += 1) {
          let total = 0;
          for (let column = 0; column < laneWidth; column += 1) {
            const offset = (row * laneWidth + column) * 4;
            const rgb = [
              data[offset] ?? 0,
              data[offset + 1] ?? 0,
              data[offset + 2] ?? 0,
            ];
            // Only neutral (player-white) pixels contribute: a passing red or
            // pale-cyan enemy projectile is excluded by its own channel
            // dominance, while a partially covered white pixel still counts.
            if (
              Math.abs((rgb[0] ?? 0) - (rgb[2] ?? 0)) > 30 ||
              Math.abs((rgb[1] ?? 0) - (rgb[2] ?? 0)) > 30
            ) {
              continue;
            }
            const ratios = rgb.map((value, channel) => {
              const span = Math.max(
                1,
                (playerRgb[channel] ?? 0) - (background[channel] ?? 0),
              );
              return (value - (background[channel] ?? 0)) / span;
            });
            const alpha = Math.min(
              1,
              Math.max(0, ratios.reduce((sum, ratio) => sum + ratio, 0) / 3),
            );
            if (alpha >= 0.1) {
              total += alpha;
            }
          }
          coverage[row] = total;
        }
        // Consecutive covered rows form one measured band (the lane holds at
        // most a few separated projectiles at this size).
        const bands = [];
        let start = -1;
        for (let row = 0; row <= rows; row += 1) {
          const covered = row < rows && (coverage[row] ?? 0) >= rowCoverage;
          if (covered && start < 0) {
            start = row;
          }
          if (!covered && start >= 0) {
            bands.push({
              topRow: start,
              rowCoverage: coverage.slice(start, row),
            });
            start = -1;
          }
        }
        return {
          laneHalfWidthPx: laneHalfWidth,
          backgroundTone: `#${backgroundKey.toString(16).padStart(6, '0')}`,
          bands,
        };
      });
    },
    {
      source: dataUrl,
      centerX: aircraft.centerX,
      laneHalfWidth: LANE_HALF_WIDTH_PX,
      top: topLimit,
      rowCoverage: LANE_ROW_COVERAGE,
      playerRgb: await readPlayerProjectileRgb(page),
    },
  );
}

/**
 * True when one measured lane band is the approved teardrop: the leading
 * (upward) rows widen gradually into a point, the widest row sits in the
 * trailing part, the trailing row narrows again (the rounded end), and the band
 * is the size of the authoritative 3 × 9 AABB. A rectangle measures its full
 * width from its own first fully covered row, so it has at most one row more
 * than 10% below the widest one; a diamond or ellipse measures a broad leading
 * row and its widest row in the middle. Neither can satisfy this.
 */
function isMeasuredTeardrop(band: MeasuredBand): boolean {
  const widths = band.rowCoverage;
  if (widths.length < 6 || widths.length > 12) {
    return false;
  }
  const widest = Math.max(...widths);
  if (widest < 2.2 || widest > 4.2) {
    return false;
  }
  if (
    leadingTaperRows(widths, LEADING_TAPER_FRACTION) <
    TEARDROP_MIN_LEADING_TAPER_ROWS
  ) {
    return false;
  }
  const widestIndex = widths.indexOf(widest);
  if (widestIndex < Math.floor(widths.length * 0.6)) {
    return false;
  }
  return (widths[widths.length - 1] ?? 0) < widest;
}

/**
 * How many leading rows of one measured lane band are more than `fraction` of
 * the way below the widest row. A teardrop's pointed tip widens over several
 * rows; the constant width of a rectangle (whose only partial rows are its own
 * two edges) leaves at most one such row.
 */
function leadingTaperRows(widths: readonly number[], fraction: number): number {
  const widest = Math.max(...widths);
  let rows = 0;
  for (const width of widths) {
    if (width >= widest * fraction) {
      break;
    }
    rows += 1;
  }
  return rows;
}

/** Polls the Aircraft firing lane until an approved teardrop is measured. */
async function waitForPlayerLane(page: Page): Promise<PlayerLaneSample> {
  const deadline = Date.now() + 30000;
  let last: PlayerLaneSample = {
    laneHalfWidthPx: LANE_HALF_WIDTH_PX,
    backgroundTone: 'unknown',
    bands: [],
  };
  while (Date.now() < deadline) {
    last = await measurePlayerLane(page);
    if (last.bands.some((band) => isMeasuredTeardrop(band))) {
      return last;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(
    `No approved player teardrop was measured in the Aircraft lane: ${JSON.stringify(
      last.bands,
    )}`,
  );
}

/**
 * Polls the rendered canvas until the required silhouettes are measurable, and
 * appends every polled measurement to the attempt-scoped sweep NDJSON so the
 * accepted frame, its neighbours, and every rejected candidate stay diagnosable.
 */
async function waitForSilhouettes(
  page: Page,
  label: string,
  accept: (sample: SilhouetteSample) => Promise<boolean>,
  timeoutMs = 30000,
): Promise<MeasuredCanvas> {
  const deadline = Date.now() + timeoutMs;
  let last: MeasuredCanvas = {
    sample: { canvasWidth: 0, canvasHeight: 0, clusters: [] },
    canvasPng: Buffer.alloc(0),
  };
  let poll = 0;
  while (Date.now() < deadline) {
    poll += 1;
    last = await measureProjectileSilhouettes(page);
    appendSweepRecord(label, 'enemy-circles', poll, last.sample);
    if (await accept(last.sample)) {
      return last;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(
    `No matching approved projectile silhouettes were measured: ${JSON.stringify(
      last.sample.clusters,
    )}`,
  );
}

/**
 * The approved enemy silhouettes one measured enemy-context capture must hold.
 */
interface MeasuredEnemyContext {
  readonly ranged: readonly MeasuredCluster[];
  readonly cannon: readonly MeasuredCluster[];
}

function enemyContextOf(
  sample: SilhouetteSample,
  observed: DevObservability | null,
): MeasuredEnemyContext {
  return {
    ranged: sample.clusters.filter(
      (cluster) =>
        isEnemyCircleCluster(cluster) &&
        isFiredByRole(cluster, observed, 'ranged-drone') &&
        isInFreeSpace(cluster, observed),
    ),
    cannon: sample.clusters.filter(
      (cluster) =>
        isEnemyCircleCluster(cluster) &&
        isFiredByRole(cluster, observed, 'elite-drone') &&
        isInFreeSpace(cluster, observed),
    ),
  };
}

/**
 * Measures one enemy-projectile scenario: both non-Core enemy circles fired by
 * their authoritative owners plus the shared player teardrop, all as native
 * minimum-viewport pixels. The raw frame, its clusters and the read-only
 * observability facts are written BEFORE any silhouette assertion can fail; the
 * labelled captures and manifest are written once the assertions pass.
 */
async function captureEnemyProjectileContext(
  page: Page,
  label: string,
  context: CaptureManifest['context'],
): Promise<CaptureManifest> {
  await startEnemyProjectileScenario(page);
  const measurement = await waitForSilhouettes(
    page,
    label,
    async (measured) => {
      const found = enemyContextOf(measured, await readDevObservability(page));
      return found.ranged.length > 0 && found.cannon.length > 0;
    },
    60_000,
  );
  const observed = await readDevObservability(page);
  const measured = enemyContextOf(measurement.sample, observed);
  // The player teardrop of the same scenario, measured in the Aircraft's lane.
  const playerLane = await waitForPlayerLane(page);
  // RAW-BEFORE-ASSERT (review C01): the accepted frame, every measured cluster
  // and the observability facts are on disk before this test can fail.
  await writeRawAttemptRecord(
    label,
    'enemy-circles',
    measurement,
    playerLane,
    observed,
  );

  expect(measured.ranged.length).toBeGreaterThan(0);
  expect(measured.cannon.length).toBeGreaterThan(0);
  for (const [kind, clusters] of [
    ['Ranged shot', measured.ranged],
    ['Elite cannon shot', measured.cannon],
  ] as const) {
    for (const cluster of clusters) {
      // The accepted cluster is asserted with exactly the decomposed evidence
      // the acceptance predicate used (C01 review), so this can never be a
      // stricter condition than the one that selected the frame. The SUPERSEDED
      // horizontal/vertical ellipses, the older rectangles of the same AABBs, a
      // filled square, a same-colour diamond and a wrong-diameter circle fail at
      // least one component at every sub-pixel alignment.
      const evidence = circleEvidence(cluster);
      console.log('V021-WI04A-CIRCLE', kind, JSON.stringify(evidence));
      expect(evidence.colour, `${kind} approved danger fill`).toBe(true);
      expect(evidence.span, `${kind} approved diameter size class`).toBe(true);
      expect(evidence.equalSpans, `${kind} equal visual width and height`).toBe(
        true,
      );
      expect(evidence.unpaintedCorners, `${kind} unpainted box corners`).toBe(
        true,
      );
      expect(evidence.taper, `${kind} two-axis taper`).toBe(true);
      expect(evidence.area, `${kind} circle area fraction`).toBe(true);
      expect(evidence.diameter, `${kind} equivalent diameter`).toBe(true);
      // The fixed visual diameter (patch §4/V021-DEC-002): the filled area
      // implies the approved `7.2 px`, never the `3.6 px` shorter AABB side.
      expect(
        Math.abs(evidence.equivalentDiameter - ENEMY_CIRCLE_DIAMETER_PX),
        `${kind} fixed 7.2 px visual diameter`,
      ).toBeLessThan(1.3);
    }
  }
  expectMeasuredTeardrop(playerLane);
  const manifest = await writeCapture(
    page,
    label,
    context,
    measurement.sample,
    playerLane,
  );
  // Both captured kinds carry the one approved enemy-circle classification, and
  // the attribution above separates them by the role that fired them.
  expect(
    manifest.measuredClusters.some((cluster) =>
      cluster.classification.includes('enemy-circle-cluster'),
    ),
  ).toBe(true);
  return manifest;
}

/**
 * Materialises both non-Core enemy projectile sources through the development
 * Debug Overlay — the authored Mission 01 e5 group (four Ranged drones) and the
 * authored Elite — and parks the Aircraft at the far-left firing lane so its
 * automatic Machine Gun fire cannot destroy them before they fire. The session
 * runs under God Mode so a Defeat cannot end the measurement.
 */
async function startEnemyProjectileScenario(page: Page): Promise<void> {
  await startCombat(page);
  await page.keyboard.press('F1');
  const debug = page.getByRole('dialog');
  await expect(debug.getByRole('heading', { name: 'Debug' })).toBeVisible();
  await debug.locator('.ds-checkbox', { hasText: 'God Mode' }).click();
  await debug.getByRole('button', { name: 'Spawn E5' }).click();
  await debug.getByRole('button', { name: 'Spawn Elite' }).click();
  await page.keyboard.press('F1');
  await expect(debug).toBeHidden();
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowLeft');
}

/** The small capture manifest written beside each labelled screenshot pair. */
interface CaptureManifest {
  readonly label: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly context: 'prepared' | 'forced-fallback';
  readonly canvas: { readonly width: number; readonly height: number };
  readonly canvasScreenshot: string;
  readonly pageScreenshot: string;
  /** The read-only development report of the active enemy mix and bounds. */
  readonly observedEnemies: DevObservability | null;
  /** The coverage-measured player projectile band in the Aircraft lane. */
  readonly playerLane: PlayerLaneSample | null;
  readonly measuredClusters: readonly (MeasuredCluster & {
    readonly classification: readonly string[];
  })[];
}

/** Read-only development observability of the running authoritative runtime. */
interface DevObservability {
  readonly activeEnemiesByType: Readonly<Record<string, number>>;
  readonly activeEnemyBounds: readonly {
    readonly type: string;
    readonly centerX: number;
    readonly centerY: number;
    readonly width: number;
    readonly height: number;
  }[];
}

async function readDevObservability(
  page: Page,
): Promise<DevObservability | null> {
  return page.evaluate(() => {
    const hook = (
      window as Window & {
        __shmupDevObservability__?: () => unknown;
      }
    ).__shmupDevObservability__;
    return (hook?.() as DevObservability | undefined) ?? null;
  });
}

/**
 * True when a measured cluster sits in the fired-projectile band below one
 * active enemy of the given authored role. The role's own complete rendered
 * bounds come from the read-only development observability report, so a
 * measurement is tied to the enemy that actually fired it instead of to an
 * arbitrary same-coloured shape.
 */
function isFiredByRole(
  cluster: MeasuredCluster,
  observability: DevObservability | null,
  role: string,
): boolean {
  if (observability === null) {
    return false;
  }
  const centerX = cluster.minX + cluster.width / 2;
  const centerY = cluster.minY + cluster.height / 2;
  return observability.activeEnemyBounds.some((bounds) => {
    if (bounds.type !== role) {
      return false;
    }
    return (
      Math.abs(centerX - bounds.centerX) <= bounds.width / 2 + 260 &&
      centerY >= bounds.centerY - bounds.height / 2 &&
      centerY <= bounds.centerY + bounds.height / 2 + 260
    );
  });
}

/** True when a measured cluster lies entirely outside every active enemy body
 *  (so artwork pixels inside a body can never satisfy a projectile check). */
function isInFreeSpace(
  cluster: MeasuredCluster,
  observability: DevObservability | null,
): boolean {
  if (observability === null) {
    return false;
  }
  return observability.activeEnemyBounds.every(
    (bounds) =>
      cluster.minX + cluster.width < bounds.centerX - bounds.width / 2 ||
      cluster.minX > bounds.centerX + bounds.width / 2 ||
      cluster.minY + cluster.height < bounds.centerY - bounds.height / 2 ||
      cluster.minY > bounds.centerY + bounds.height / 2,
  );
}

/** Writes the labelled captures and the measurement manifest for review. */
async function writeCapture(
  page: Page,
  label: string,
  context: CaptureManifest['context'],
  sample: SilhouetteSample,
  playerLane: PlayerLaneSample | null,
): Promise<CaptureManifest> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const canvasScreenshot = `${label}-canvas.png`;
  const pageScreenshot = `${label}-page.png`;
  writeFileSync(
    join(EVIDENCE_DIR, canvasScreenshot),
    await page.locator('.ds-combat-canvas canvas').screenshot(),
  );
  await page.screenshot({ path: join(EVIDENCE_DIR, pageScreenshot) });
  const manifest: CaptureManifest = {
    label,
    viewport: MINIMUM_VIEWPORT,
    context,
    canvas: { width: sample.canvasWidth, height: sample.canvasHeight },
    canvasScreenshot,
    pageScreenshot,
    observedEnemies: await readDevObservability(page),
    playerLane,
    measuredClusters: sample.clusters.map((cluster) => ({
      ...cluster,
      classification: classifyCluster(cluster),
    })),
  };
  const manifestPath = join(EVIDENCE_DIR, `${label}-measurements.json`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('V021-WI04A-CAPTURE', manifestPath);
  return manifest;
}

/**
 * The raw evidence of one measured frame: the exact captured pixels, every
 * measured cluster with its complete extents and derived shape evidence, and the
 * read-only observability facts of the same moment.
 */
interface RawMeasurementRecord {
  readonly schemaVersion: number;
  readonly label: string;
  readonly phase: string;
  readonly attemptDirectory: string;
  readonly capturedAt: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly canvas: { readonly width: number; readonly height: number };
  readonly canvasScreenshot: string;
  readonly observedEnemies: DevObservability | null;
  readonly playerLane: PlayerLaneSample | null;
  readonly clusters: readonly ClusterEvidence[];
}

/** Monotonic within one Playwright process; keeps repeated captures distinct. */
let rawRecordSequence = 0;

/**
 * Writes the raw record of one measurement BEFORE any silhouette assertion can
 * fail, so the exact frame, clusters and observability of a later failure stay
 * diagnosable. Files are attempt-scoped (`.agent-handoff/runs/attempt-*`), never
 * the historical `.agent-handoff/evidence/` review artefacts.
 */
async function writeRawAttemptRecord(
  label: string,
  phase: string,
  measurement: MeasuredCanvas,
  playerLane: PlayerLaneSample | null,
  observed: DevObservability | null,
): Promise<RawMeasurementRecord> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  rawRecordSequence += 1;
  const token = `${label}-raw-${String(rawRecordSequence).padStart(2, '0')}`;
  const canvasScreenshot = `${token}-canvas.png`;
  writeFileSync(join(EVIDENCE_DIR, canvasScreenshot), measurement.canvasPng);
  const record: RawMeasurementRecord = {
    schemaVersion: 1,
    label,
    phase,
    attemptDirectory: EVIDENCE_DIR,
    capturedAt: new Date().toISOString(),
    viewport: MINIMUM_VIEWPORT,
    canvas: {
      width: measurement.sample.canvasWidth,
      height: measurement.sample.canvasHeight,
    },
    canvasScreenshot,
    observedEnemies: observed,
    playerLane,
    clusters: measurement.sample.clusters.map(evidenceOf),
  };
  const recordPath = join(EVIDENCE_DIR, `${token}-measurements.json`);
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  console.log('V021-WI04A-RAW', recordPath);
  return record;
}

/**
 * Appends every polled measurement of one wait to an attempt-scoped NDJSON:
 * the frame that was accepted, the frames around it, and every candidate the
 * acceptance predicate rejected with the evidence that rejected it.
 */
function appendSweepRecord(
  label: string,
  phase: string,
  poll: number,
  sample: SilhouetteSample,
): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  appendFileSync(
    join(EVIDENCE_DIR, `${label}-sweep.ndjson`),
    `${JSON.stringify({
      schemaVersion: 1,
      label,
      phase,
      poll,
      polledAt: new Date().toISOString(),
      canvas: {
        width: sample.canvasWidth,
        height: sample.canvasHeight,
      },
      clusters: sample.clusters.map(evidenceOf),
    })}\n`,
  );
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
  // Settle until the Scene has booted and positioned the aircraft.
  await expect
    .poll(async () => (await readAircraft(page))?.centerY, { timeout: 5000 })
    .toBeGreaterThan(477);
}

/**
 * One measured rendered projectile silhouette: a connected cluster of canvas
 * pixels of exactly one approved projectile colour, with its native-pixel
 * extents. Anything larger than a projectile (an enemy body, the aircraft, the
 * destroyed-enemy flash) is measured as a cluster too and then discarded, so a
 * measurement can never be satisfied by a non-projectile surface.
 */
interface MeasuredCluster {
  readonly colour: 'player' | 'danger' | 'accent';
  readonly pixels: number;
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
  /** Solid pixels per row, top row first. */
  readonly rowWidths: readonly number[];
  /** Solid pixels per column, left column first. */
  readonly columnHeights: readonly number[];
}

interface SilhouetteSample {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly clusters: readonly MeasuredCluster[];
}

/** No approved projectile cluster is larger than this on either axis. */
const PROJECTILE_CLUSTER_LIMIT_PX = 16;
/** Approved projectile colours (`text-primary`, `danger`, `accent`). */
const PROJECTILE_COLOUR_TOLERANCE = 25;

/**
 * Segments one canvas image into approved projectile colour clusters. The same
 * analyzer serves the live Combat canvas and the calibration rasters below, so a
 * calibration result is produced by exactly the code path that measures the
 * evidence frame.
 */
async function measureCanvasSource(
  page: Page,
  source: string,
): Promise<SilhouetteSample> {
  return page.evaluate(
    ({ source: imageSource, limit, tolerance }) => {
      const targets = [
        { colour: 'player', rgb: [241, 245, 247] },
        { colour: 'danger', rgb: [217, 103, 103] },
        { colour: 'accent', rgb: [101, 169, 214] },
      ];
      const image = new Image();
      image.src = imageSource;
      return image.decode().then(() => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context === null) {
          return { canvasWidth: 0, canvasHeight: 0, clusters: [] };
        }
        context.drawImage(image, 0, 0);
        const { width, height } = canvas;
        const { data } = context.getImageData(0, 0, width, height);
        const classes = new Int8Array(width * height).fill(-1);
        for (let pixel = 0; pixel < width * height; pixel += 1) {
          const r = data[pixel * 4] ?? 0;
          const g = data[pixel * 4 + 1] ?? 0;
          const b = data[pixel * 4 + 2] ?? 0;
          for (let index = 0; index < targets.length; index += 1) {
            const rgb = targets[index]?.rgb ?? [-255, -255, -255];
            if (
              Math.abs(r - (rgb[0] ?? -255)) <= tolerance &&
              Math.abs(g - (rgb[1] ?? -255)) <= tolerance &&
              Math.abs(b - (rgb[2] ?? -255)) <= tolerance
            ) {
              classes[pixel] = index;
              break;
            }
          }
        }
        // 4-connected components per colour class: only clusters that could be
        // one projectile are returned.
        const clusters = [];
        const seen = new Uint8Array(width * height);
        for (let start = 0; start < width * height; start += 1) {
          const klass = classes[start] ?? -1;
          if (klass < 0 || seen[start] === 1) {
            continue;
          }
          const stack = [start];
          seen[start] = 1;
          const members = [];
          let minX = width;
          let maxX = -1;
          let minY = height;
          let maxY = -1;
          while (stack.length > 0) {
            const pixel = stack.pop() ?? 0;
            members.push(pixel);
            const x = pixel % width;
            const y = Math.floor(pixel / width);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            const neighbours = [
              x > 0 ? pixel - 1 : -1,
              x < width - 1 ? pixel + 1 : -1,
              y > 0 ? pixel - width : -1,
              y < height - 1 ? pixel + width : -1,
            ];
            for (const neighbour of neighbours) {
              if (neighbour < 0) {
                continue;
              }
              if (classes[neighbour] !== klass || seen[neighbour] === 1) {
                continue;
              }
              seen[neighbour] = 1;
              stack.push(neighbour);
            }
          }
          const clusterWidth = maxX - minX + 1;
          const clusterHeight = maxY - minY + 1;
          if (
            clusterWidth > limit ||
            clusterHeight > limit ||
            members.length < 3
          ) {
            continue;
          }
          const rowWidths = new Array<number>(clusterHeight).fill(0);
          const columnHeights = new Array<number>(clusterWidth).fill(0);
          for (const pixel of members) {
            rowWidths[Math.floor(pixel / width) - minY] += 1;
            columnHeights[(pixel % width) - minX] += 1;
          }
          clusters.push({
            colour: targets[klass]?.colour ?? 'player',
            pixels: members.length,
            minX,
            minY,
            width: clusterWidth,
            height: clusterHeight,
            rowWidths,
            columnHeights,
          });
        }
        return { canvasWidth: width, canvasHeight: height, clusters };
      });
    },
    {
      source,
      limit: PROJECTILE_CLUSTER_LIMIT_PX,
      tolerance: PROJECTILE_COLOUR_TOLERANCE,
    },
  );
}

/** One canvas measurement: the cluster sample plus the captured pixels. */
interface MeasuredCanvas {
  readonly sample: SilhouetteSample;
  readonly canvasPng: Buffer;
}

/** Measures the live Combat canvas and keeps the exact captured pixels. */
async function measureProjectileSilhouettes(
  page: Page,
): Promise<MeasuredCanvas> {
  const canvasPng = await page.locator('.ds-combat-canvas canvas').screenshot();
  const sample = await measureCanvasSource(
    page,
    `data:image/png;base64,${canvasPng.toString('base64')}`,
  );
  return { sample, canvasPng };
}

/**
 * The extent evidence of one cluster axis (rows for a horizontal shape, columns
 * for a vertical one): enough to state, for every written record, whether the
 * cluster fills its own AABB (a filled rectangle does, a filled circle cannot)
 * and how many extents are strictly narrower than the widest one (a rectangle
 * measures a constant extent on every row and every column, so this is always
 * zero for it).
 */
interface TaperEvidence {
  readonly first: number;
  readonly last: number;
  readonly widest: number;
  /** How many extents are strictly narrower than the widest one. */
  readonly narrowedExtents: number;
  /** Whether the extreme extents are strictly narrower than the widest one. */
  readonly narrowedEnds: number;
  /** Whether the first occurrence of the widest extent is strictly interior. */
  readonly widestInterior: boolean;
}

function taperEvidenceOf(axis: readonly number[]): TaperEvidence {
  const widest = Math.max(...axis);
  const first = axis[0] ?? 0;
  const last = axis[axis.length - 1] ?? 0;
  return {
    first,
    last,
    widest,
    narrowedExtents: narrowedExtents(axis),
    narrowedEnds: [first, last].filter((extent) => extent < widest).length,
    widestInterior:
      axis.indexOf(widest) > 0 && axis.indexOf(widest) < axis.length - 1,
  };
}

/** One measured cluster plus the shape evidence every record must explain. */
interface ClusterEvidence {
  readonly colour: MeasuredCluster['colour'];
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
  readonly pixels: number;
  readonly rowWidths: readonly number[];
  readonly columnHeights: readonly number[];
  /** True when the cluster covers every pixel of its own AABB. */
  readonly fillsAabb: boolean;
  readonly rows: TaperEvidence;
  readonly columns: TaperEvidence;
  readonly classification: readonly string[];
}

function evidenceOf(cluster: MeasuredCluster): ClusterEvidence {
  return {
    colour: cluster.colour,
    minX: cluster.minX,
    minY: cluster.minY,
    width: cluster.width,
    height: cluster.height,
    pixels: cluster.pixels,
    rowWidths: cluster.rowWidths,
    columnHeights: cluster.columnHeights,
    fillsAabb: cluster.pixels >= cluster.width * cluster.height,
    rows: taperEvidenceOf(cluster.rowWidths),
    columns: taperEvidenceOf(cluster.columnHeights),
    classification: classifyCluster(cluster),
  };
}

test('the default Machine Gun creates a visible projectile without firing input (Combat §8, AC-019)', async ({
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

  // No firing input exists in the routing table: the projectiles appear
  // purely from the deterministic fixed-step schedule.
  await expect
    .poll(async () => readProjectilePixels(page), { timeout: 5000 })
    .toBeGreaterThanOrEqual(10);

  // V021-WI-04-A: the pixels the Aircraft's own firing lane renders are the
  // approved teardrop, never the constant-extent rectangle this presentation
  // replaced (the prepared enemy context is the authored Mission 01 one).
  const machineGunLabel = 'v021-wi-04-a-prepared-machine-gun-1280x600';
  const machineGunLane = await waitForPlayerLane(page);
  const machineGunSample = await measureProjectileSilhouettes(page);
  await writeRawAttemptRecord(
    machineGunLabel,
    'player-lane',
    machineGunSample,
    machineGunLane,
    await readDevObservability(page),
  );
  expectMeasuredTeardrop(machineGunLane);
  await writeCapture(
    page,
    machineGunLabel,
    'prepared',
    machineGunSample.sample,
    machineGunLane,
  );

  // Representative browser-only resize wiring. Exact projectile reprojection,
  // geometry, speed, and identity are deterministic unit-test responsibilities.
  await page.setViewportSize({ width: 1500, height: 800 });
  await expect
    .poll(
      async () =>
        page
          .locator('.ds-combat-canvas canvas')
          .evaluate((element) => element.clientWidth),
      { timeout: 5000 },
    )
    .toBe(1500);
  await expect
    .poll(async () => readProjectilePixels(page), { timeout: 5000 })
    .toBeGreaterThanOrEqual(10);

  // A single settled Game/Scene: no duplicate canvas or HUD bridge.
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(page.locator('.ds-combat-hud')).toHaveCount(1);

  // The prepared aircraft texture is fetched exactly once for Combat entry.
  const aircraftFetches = requested.filter((url) =>
    /aircraft\/german-fighter\.png$/.test(url),
  ).length;
  expect(aircraftFetches).toBe(1);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('the Hangar-selected Cannon profile reaches Combat and creates a projectile (AC-021/022, AC-050)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Hangar → Change Weapon → select Cannon → Confirm (Base AC-021/022/050).
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Hangar' }).click();
  await expect(page.getByTestId('hangar-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Change Weapon' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByRole('radio', { name: /Machine Gun/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /Cannon/ })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  const panel = page.locator('.ds-aircraft-configuration-panel');
  await expect(panel.getByText('Cannon')).toBeVisible();

  // Back to Operations and into Combat with the equipped Cannon.
  await page.getByRole('button', { name: 'Operations' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(page.locator('.ds-combat-hud').first()).toBeVisible();

  // The Cannon profile renders its projectile visibly (no firing input).
  await expect
    .poll(async () => readProjectilePixels(page), { timeout: 5000 })
    .toBeGreaterThanOrEqual(10);

  // V021-WI-04-A: the Hangar-selected Cannon renders that same shared teardrop
  // silhouette in native minimum-viewport pixels.
  const cannonLabel = 'v021-wi-04-a-prepared-hangar-cannon-1280x600';
  const cannonLane = await waitForPlayerLane(page);
  const cannonSample = await measureProjectileSilhouettes(page);
  await writeRawAttemptRecord(
    cannonLabel,
    'player-lane',
    cannonSample,
    cannonLane,
    await readDevObservability(page),
  );
  expectMeasuredTeardrop(cannonLane);
  await writeCapture(
    page,
    cannonLabel,
    'prepared',
    cannonSample.sample,
    cannonLane,
  );

  expect(pageErrors).toEqual([]);
});

/**
 * The focused fail-sensitivity counter-case of this correction (review C01, C02).
 * The same segmentation and the same acceptance predicate the live evidence uses
 * are run over native-size rasters of the shapes this presentation REPLACED, of
 * the counter-cases a wrong colour, diameter or shape would produce, and of the
 * approved circle, swept across sub-pixel alignments. Both approved circle
 * rasters must be accepted, and no superseded ellipse, older rectangle, filled
 * square, wrong-diameter circle, diamond, wrong-colour shape or merged pair may
 * be.
 */
test('the circle evidence accepts every native circle raster and rejects the superseded ellipse, rectangle, square, diamond and merged rasters (V021-WI-04-A C02)', async ({
  page,
}) => {
  const caseNames = [
    'ranged-circle',
    'cannon-circle',
    'small-circle',
    'ranged-ellipse',
    'cannon-ellipse',
    'ranged-rectangle',
    'cannon-rectangle',
    'square-rectangle',
    'player-rectangle',
    'danger-diamond',
    'accent-diamond',
    'accent-circle',
    'merged-circles',
  ];
  const acceptedCases = ['ranged-circle', 'cannon-circle'];
  const columns = [
    60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720, 780,
  ];
  const offsets = [
    [0, 0],
    [0.1, 0.25],
    [0.25, 0.5],
    [0.35, 0.05],
    [0.5, 0.75],
    [0.6, 0.35],
    [0.75, 0.15],
    [0.9, 0.6],
  ];
  const rasters = await page.evaluate(
    ({ names, starts, shifts }) => {
      const token = (name: string, fallback: string): string => {
        const raw = getComputedStyle(document.documentElement)
          .getPropertyValue(name)
          .trim();
        return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
      };
      // The live canvas background and the two approved projectile colours, read
      // from the same Design System custom properties the presentation resolves,
      // so an anti-aliased edge pixel is thresholded exactly as in the measured
      // frame.
      const background = token('--color-canvas', '#080b0e');
      const danger = token('--color-danger', '#d96767');
      const accent = token('--color-accent', '#65a9d6');
      const images: { offsetX: number; offsetY: number; source: string }[] = [];
      for (const shift of shifts) {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 600;
        const context = canvas.getContext('2d');
        if (context === null) {
          continue;
        }
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
        for (let index = 0; index < names.length; index += 1) {
          const x = (starts[index] ?? 0) + (shift[0] ?? 0);
          const y = 100 + (shift[1] ?? 0);
          // The approved circle of both non-Core kinds: a `7.2 px` diameter
          // centered on the authoritative centre `(x + 3.6, y + 3.6)`.
          const circle = (radius: number): void => {
            context.beginPath();
            context.arc(x + 3.6, y + 3.6, radius, 0, Math.PI * 2);
            context.fill();
          };
          const diamond = (half: number): void => {
            context.beginPath();
            context.moveTo(x + half, y);
            context.lineTo(x + half * 2, y + half);
            context.lineTo(x + half, y + half * 2);
            context.lineTo(x, y + half);
            context.closePath();
            context.fill();
          };
          context.fillStyle = danger;
          switch (names[index]) {
            case 'ranged-circle':
              circle(3.6);
              break;
            case 'cannon-circle':
              circle(3.6);
              break;
            case 'small-circle':
              // The shorter AABB side (`3.6 px`) mistaken for the approved
              // `max(width, height)` diameter.
              circle(1.8);
              break;
            case 'ranged-ellipse':
              // The SUPERSEDED horizontal Ranged ellipse (`7.2 × 3.6`).
              context.beginPath();
              context.ellipse(x + 3.6, y + 1.8, 3.6, 1.8, 0, 0, Math.PI * 2);
              context.fill();
              break;
            case 'cannon-ellipse':
              // The SUPERSEDED vertical Elite cannon ellipse (`3.6 × 7.2`).
              context.beginPath();
              context.ellipse(x + 1.8, y + 3.6, 1.8, 3.6, 0, 0, Math.PI * 2);
              context.fill();
              break;
            case 'ranged-rectangle':
              // The older `fillRect` Ranged rectangle (`7.2 × 3.6`).
              context.fillRect(x, y, 7.2, 3.6);
              break;
            case 'cannon-rectangle':
              context.fillRect(x, y, 3.6, 7.2);
              break;
            case 'square-rectangle':
              // A filled SQUARE of the new diameter: equal extents, so only the
              // corner, taper and area evidence separates it from the circle.
              context.fillRect(x, y, 7.2, 7.2);
              break;
            case 'player-rectangle':
              // The player projectile's replaced rectangle, which sits inside
              // the approved circle's own size class.
              context.fillRect(x, y, 3, 9);
              break;
            case 'danger-diamond':
              // The unchanged homing Core's diamond shape in the projectile
              // colour: proves the shape evidence rejects it, not only colour.
              diamond(3.6);
              break;
            case 'accent-diamond':
              context.fillStyle = accent;
              diamond(3.6);
              break;
            case 'accent-circle':
              context.fillStyle = accent;
              circle(3.6);
              break;
            case 'merged-circles':
              // Two approved circles whose rasters touch: one oversized cluster
              // that no single projectile could produce.
              circle(3.6);
              context.beginPath();
              context.arc(x + 8.6, y + 3.6, 3.6, 0, Math.PI * 2);
              context.fill();
              break;
          }
        }
        images.push({
          offsetX: shift[0] ?? 0,
          offsetY: shift[1] ?? 0,
          source: canvas.toDataURL('image/png'),
        });
      }
      return images;
    },
    { names: caseNames, starts: columns, shifts: offsets },
  );
  expect(rasters.length).toBe(offsets.length);

  const acceptedCounts: Record<string, number> = {
    'ranged-circle': 0,
    'cannon-circle': 0,
  };
  const observed: string[] = [];
  const mustReject: string[] = [];
  const notAccepted: string[] = [];
  for (const raster of rasters) {
    const sample = await measureCanvasSource(page, raster.source);
    for (let index = 0; index < caseNames.length; index += 1) {
      const name = caseNames[index] ?? '';
      const column = columns[index] ?? 0;
      const located = sample.clusters.filter(
        (cluster) => cluster.minX >= column - 2 && cluster.minX < column + 40,
      );
      const where = `${name} @${raster.offsetX}/${raster.offsetY}`;
      expect(located.length, where).toBe(1);
      const cluster = located[0]!;
      const evidence = circleEvidence(cluster);
      const profile =
        `${cluster.width}x${cluster.height} ` +
        `rows[${cluster.rowWidths.join(',')}] ` +
        `cols[${cluster.columnHeights.join(',')}] ` +
        `pixels ${cluster.pixels}/${cluster.width * cluster.height} ` +
        `a:${evidence.areaFraction.toFixed(3)} ` +
        `d:${evidence.equivalentDiameter.toFixed(2)} ` +
        `circle:${isEnemyCircleCluster(cluster)}`;
      observed.push(`${where} ${profile}`);
      if (acceptedCases.includes(name)) {
        if (isEnemyCircleCluster(cluster)) {
          acceptedCounts[name] = (acceptedCounts[name] ?? 0) + 1;
        } else {
          notAccepted.push(`${where} ${profile}`);
        }
      } else if (isEnemyCircleCluster(cluster)) {
        mustReject.push(`${where} ${profile}`);
      }
    }
  }
  console.log(
    'V021-WI04A-CALIBRATION\n' +
      observed.join('\n') +
      '\nV021-WI04A-CALIBRATION-END',
  );
  // Fail-sensitivity: the SUPERSEDED horizontal/vertical ellipses, the older
  // filled rectangles of every projectile AABB (including the player's 3 × 9,
  // which sits inside the approved size class), a filled square of the new
  // diameter, a shorter-side circle, a same-colour diamond, the wrong-colour
  // diamond/circle and a merged pair of approved circles are all rejected at
  // EVERY alignment.
  expect(mustReject, 'rasters the circle evidence must reject').toEqual([]);
  // Robustness: the approved circle raster of both kinds is accepted at least
  // once. The live renderer's alignment coverage is measured separately by the
  // native frame sweep recorded in this attempt's `-sweep.ndjson`, because
  // Chromium's 2-D canvas and Phaser's WebGL renderer rasterise the same
  // analytic shape slightly differently at this size.
  for (const name of acceptedCases) {
    expect(acceptedCounts[name], `${name} rasters accepted`).toBeGreaterThan(0);
  }
  console.log('V021-WI04A-CALIBRATION-UNACCEPTED', notAccepted);

  // The same acceptance predicate against anti-aliasing-honest synthetic
  // profiles of every shape at every alignment: a pixel counts when at least 90%
  // of its 8 × 8 sub-samples are inside the shape, which is how the approved
  // colour tolerance thresholds the real canvas, and every profile is reported
  // with the analyzer's own painted-extent convention. The approved disc is
  // accepted, and the superseded ellipses, the older rectangles, the filled
  // square, the shorter-side circle, the diamond and the merged pair are
  // rejected, at every alignment.
  const acceptedShapes: readonly SyntheticShape[] = ['circle'];
  const rejectedShapes: readonly SyntheticShape[] = [
    'small-circle',
    'ellipse-horizontal',
    'ellipse-vertical',
    'diamond',
    'ranged-rectangle',
    'square-rectangle',
    'player-rectangle',
    'merged-circles',
  ];
  for (const [offsetX, offsetY] of offsets) {
    for (const shape of acceptedShapes) {
      const cluster = syntheticShapeProfile(shape, offsetX, offsetY);
      expect(
        isEnemyCircleCluster(cluster),
        `synthetic ${shape} @${offsetX}/${offsetY} rows[${cluster.rowWidths.join(',')}]`,
      ).toBe(true);
    }
    for (const shape of rejectedShapes) {
      const cluster = syntheticShapeProfile(shape, offsetX, offsetY);
      expect(
        isEnemyCircleCluster(cluster),
        `synthetic ${shape} @${offsetX}/${offsetY} rows[${cluster.rowWidths.join(',')}]`,
      ).toBe(false);
    }
  }

  // The player teardrop lane predicate, and its counter-case: the same replaced
  // rectangle measured as a coverage-weighted native profile. The accepted
  // profiles are the real ones every recorded 1280 × 600 capture measured
  // (machine gun, Hangar Cannon, both enemy contexts); the first rejected one is
  // the real profile a temporarily restored `fillRect` rectangle measured in this
  // correction's mutation check, which the previous tip-ratio condition accepted
  // by a 5% margin.
  const laneBand = (rowCoverage: readonly number[]): MeasuredBand => ({
    topRow: 0,
    rowCoverage,
  });
  const measuredTeardrops: readonly (readonly number[])[] = [
    [0.51, 0.75, 1.25, 1.5, 2, 2.51, 2.75, 2.75, 0.51],
    [0.51, 1, 1.25, 1.75, 2.25, 2.51, 2.75, 1.25],
    [0.65, 2.35, 2.35, 1.55, 2, 2.51, 2.75, 2.99, 2.35],
  ];
  for (const profile of measuredTeardrops) {
    expect(
      isMeasuredTeardrop(laneBand(profile)),
      `teardrop lane ${profile}`,
    ).toBe(true);
    expectMeasuredTeardrop({
      laneHalfWidthPx: LANE_HALF_WIDTH_PX,
      backgroundTone: '#080b0e',
      bands: [laneBand(profile)],
    });
  }
  const rejectedLaneProfiles: readonly (readonly number[])[] = [
    // The replaced rectangle: a constant row width where its AABB sits.
    [3, 3, 3, 3, 3, 3, 3, 3, 3],
    // The real profile of the same rectangle with a sub-pixel-aligned trailing
    // edge: its first fully covered row already has the full width.
    [
      1.5086, 3.0029, 3.0029, 3.0029, 3.0029, 3.0029, 3.0029, 3.1814, 3.1786,
      3.0029, 1.5086,
    ],
    // A shape whose widest row is in its leading (lower) part, and an ellipse or
    // diamond whose widest row is in the middle: not a teardrop.
    [0.51, 2.75, 2.75, 2, 1.5, 1.25, 0.75, 0.51, 0.45],
    [0.5, 1, 1.75, 2.5, 2.75, 2.5, 1.75, 1, 0.5],
  ];
  for (const profile of rejectedLaneProfiles) {
    expect(
      isMeasuredTeardrop(laneBand(profile)),
      `lane profile [${profile.join(',')}]`,
    ).toBe(false);
  }
});

test('captures both non-Core enemy circles and the player teardrop as non-rectangular pixels in the prepared enemy context (V021-WI-04-A)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize(MINIMUM_VIEWPORT);
  const manifest = await captureEnemyProjectileContext(
    page,
    'v021-wi-04-a-prepared-enemy-context-1280x600',
    'prepared',
  );

  // The measured frame really held all three authored roles plus the Elite.
  expect(manifest.observedEnemies?.activeEnemiesByType['ranged-drone']).toBe(4);
  expect(manifest.observedEnemies?.activeEnemiesByType['elite-drone']).toBe(1);
  expect(manifest.canvas).toEqual(MINIMUM_VIEWPORT);
  expect(pageErrors).toEqual([]);
});

test('captures both non-Core enemy circles and the player teardrop as non-rectangular pixels in the forced-fallback enemy context (V021-WI-04-A)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  const abortedEnemyImages: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // Every prepared enemy PNG request is aborted, so the same frame renders the
  // approved procedural fallback bodies while the projectiles (always
  // procedural, unchanged by V021-WI-04-A) keep their measured silhouettes.
  await page.route('**/enemies/*.png', async (route) => {
    abortedEnemyImages.push(route.request().url());
    await route.abort();
  });

  await page.setViewportSize(MINIMUM_VIEWPORT);
  const manifest = await captureEnemyProjectileContext(
    page,
    'v021-wi-04-a-forced-fallback-enemy-context-1280x600',
    'forced-fallback',
  );

  expect(abortedEnemyImages.length).toBeGreaterThanOrEqual(3);
  expect(manifest.observedEnemies?.activeEnemiesByType['ranged-drone']).toBe(4);
  expect(manifest.observedEnemies?.activeEnemiesByType['elite-drone']).toBe(1);
  expect(manifest.canvas).toEqual(MINIMUM_VIEWPORT);
  expect(pageErrors).toEqual([]);
});
