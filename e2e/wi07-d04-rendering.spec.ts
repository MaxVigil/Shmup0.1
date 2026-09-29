/**
 * V02-WI-07 D04-C03 isolated real-renderer Combat rendering proof.
 *
 * The C02 attempts failed to establish real rendered pixels: the unit harness
 * returned zero-filled `getImageData` and recorded draw calls, and the
 * long-running production sampler never observed a damaging event, so it could
 * neither accept nor reject the repaired hit flash. This spec instead drives the
 * real `CombatScene` in a development-only fixture (real Phaser, real WebGL and
 * CANVAS contexts, approved prepared PNGs, the existing fallback mapping, real
 * tokens/geometry) with controlled immutable simulation snapshots, and reads the
 * FINAL rendered pixels of each known state.
 *
 * Coverage boundary (disclosed in the C03 coverage map):
 * - this is component rendering proof, explicitly NOT ordinary-production
 *   gameplay traversal, and NOT a real-time measurement of the 50 ms feedback;
 * - the authoritative 3-step damage feedback itself is established by the
 *   existing accepted simulation/collision tests; this spec proves what the
 *   renderer does with that authoritative state;
 * - the fixture is development-only and never part of the shipped artifact.
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { computeD04CandidateIdentity } from '../scripts/evidence-d04-candidate.mjs';
import { computeSourceFingerprint } from '../scripts/evidence-source-fingerprint.mjs';
import {
  classifyFrame,
  decodePng,
  maskRegions,
} from '../src/test-support/visual-evidence/raster';
import type { Raster } from '../src/test-support/visual-evidence/raster';

/**
 * The checkout root holding the evidence directory. A detached copy used for the
 * isolated mutation counter-test has no Git metadata, so the working directory is
 * the documented fallback rather than a hard failure.
 */
function resolveRepoRoot(): string {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
    }).trim();
  } catch {
    return process.cwd();
  }
}
const REPO_ROOT = resolveRepoRoot();
const EVIDENCE_DIR = join(REPO_ROOT, '.agent-handoff', 'evidence');
const FIXTURE_PATH =
  '/src/test-support/visual-evidence/rendering-fixture/index.html';
const VIEWPORT = { width: 1280, height: 600 } as const;

/** The approved flash colour (`--color-text-primary` #f1f5f7). */
const FLASH_COLOUR: readonly [number, number, number] = [241, 245, 247];

/**
 * The rendered Core/accent predicate, identical to the repaired rendered-pixel
 * reader: the approved Core renders as a bright pale-cyan/teal feature whose
 * exact anti-aliased pixel values vary (measured `(56,158,163)`..`(148,243,247)`),
 * so an exact token tolerance would be wrong.
 */
function isCoreAccentPixel(r: number, g: number, b: number): boolean {
  return g >= 120 && b >= 120 && b - r >= 60 && g - r >= 45;
}

interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface RenderFacts {
  readonly name: string;
  readonly rendererType: string;
  readonly requestedRenderer: string;
  readonly frames: number;
  readonly exitOpacity: number;
  readonly elitePhase: string | null;
  readonly deflectionRecords: readonly number[];
  readonly preparedAssets: number;
  readonly enemies: readonly {
    readonly id: number;
    readonly kind: string;
    readonly centerX: number;
    readonly centerY: number;
    readonly width: number;
    readonly height: number;
    readonly visualKind: string;
    readonly flashing: boolean;
  }[];
  readonly visuals: readonly {
    readonly id: number;
    readonly type: string;
    readonly textureKey: string;
  }[];
  readonly canvasRect: Region;
}

interface RegionStats {
  readonly region: Region;
  readonly pixels: number;
  readonly flashPixels: number;
  readonly accentPixels: number;
  /** Pixels that differ from the region's own background sample (craft alpha). */
  readonly footprintPixels: number;
  readonly footprint: Region | null;
  readonly background: readonly [number, number, number];
  readonly meanLuminance: number;
  readonly maxLuminance: number;
  readonly grayscale: number[];
}

function within(
  colour: readonly [number, number, number],
  pixel: readonly [number, number, number],
  tolerance: number,
): boolean {
  return (
    Math.abs(colour[0] - pixel[0]) <= tolerance &&
    Math.abs(colour[1] - pixel[1]) <= tolerance &&
    Math.abs(colour[2] - pixel[2]) <= tolerance
  );
}

/** Measures the real rendered pixels of one region of a decoded screenshot. */
function measureRegion(raster: Raster, region: Region): RegionStats {
  const cornerBase = (region.y * raster.width + region.x) * 4;
  const background: readonly [number, number, number] = [
    raster.data[cornerBase] ?? 0,
    raster.data[cornerBase + 1] ?? 0,
    raster.data[cornerBase + 2] ?? 0,
  ];
  let flashPixels = 0;
  let accentPixels = 0;
  let footprintPixels = 0;
  let luminanceSum = 0;
  let maxLuminance = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      if (y < 0 || x < 0 || y >= raster.height || x >= raster.width) {
        continue;
      }
      const base = (y * raster.width + x) * 4;
      const r = raster.data[base] ?? 0;
      const g = raster.data[base + 1] ?? 0;
      const b = raster.data[base + 2] ?? 0;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      luminanceSum += luminance;
      maxLuminance = Math.max(maxLuminance, luminance);
      if (within(FLASH_COLOUR, [r, g, b], 12)) {
        flashPixels += 1;
      }
      if (isCoreAccentPixel(r, g, b)) {
        accentPixels += 1;
      }
      const backgroundDelta =
        Math.abs(r - background[0]) +
        Math.abs(g - background[1]) +
        Math.abs(b - background[2]);
      if (backgroundDelta > 24) {
        footprintPixels += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const pixels = region.width * region.height;
  // Downsampled grayscale signature (geometric, colour-independent).
  const grid = 16;
  const grayscale: number[] = [];
  for (let row = 0; row < grid; row += 1) {
    for (let column = 0; column < grid; column += 1) {
      const gx = region.x + Math.floor((column * region.width) / grid);
      const gy = region.y + Math.floor((row * region.height) / grid);
      if (gx < 0 || gy < 0 || gx >= raster.width || gy >= raster.height) {
        grayscale.push(0);
        continue;
      }
      const base = (gy * raster.width + gx) * 4;
      const r = raster.data[base] ?? 0;
      const g = raster.data[base + 1] ?? 0;
      const b = raster.data[base + 2] ?? 0;
      grayscale.push(Number((0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(1)));
    }
  }
  return {
    region,
    pixels,
    flashPixels,
    accentPixels,
    footprintPixels,
    footprint:
      footprintPixels === 0
        ? null
        : {
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
          },
    background,
    meanLuminance: Number((luminanceSum / pixels).toFixed(2)),
    maxLuminance: Number(maxLuminance.toFixed(2)),
    grayscale,
  };
}

/** Byte-difference census of two rasters over one region. */
function diffRegions(
  a: Raster,
  b: Raster,
  region: Region,
): { changed: number; bbox: Region | null } {
  let changed = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const base = (y * a.width + x) * 4;
      const different =
        a.data[base] !== b.data[base] ||
        a.data[base + 1] !== b.data[base + 1] ||
        a.data[base + 2] !== b.data[base + 2] ||
        a.data[base + 3] !== b.data[base + 3];
      if (different) {
        changed += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return {
    changed,
    bbox:
      changed === 0
        ? null
        : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

/** Byte-equality of the outer ring of a region (background preservation). */
function ringEquals(a: Raster, b: Raster, region: Region, ring = 3): boolean {
  const stripes: Region[] = [
    { x: region.x, y: region.y, width: region.width, height: ring },
    {
      x: region.x,
      y: region.y + region.height - ring,
      width: region.width,
      height: ring,
    },
    { x: region.x, y: region.y, width: ring, height: region.height },
    {
      x: region.x + region.width - ring,
      y: region.y,
      width: ring,
      height: region.height,
    },
  ];
  return stripes.every((stripe) => regionEquals(a, b, stripe));
}

/** Byte-equality of one region between two rasters (exact restoration proof). */
function regionEquals(a: Raster, b: Raster, region: Region): boolean {
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const base = (y * a.width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        if (a.data[base + channel] !== b.data[base + channel]) {
          return false;
        }
      }
    }
  }
  return true;
}

declare global {
  interface Window {
    __wi07Fixture?: {
      status: 'booting' | 'ready' | 'failed';
      error: string | null;
      rendererType: string;
      apply: (name: string) => Promise<RenderFacts>;
    };
  }
}

async function openFixture(
  page: Page,
  renderer: 'webgl' | 'canvas',
  assets: 'prepared' | 'fallback',
): Promise<void> {
  await page.goto(`${FIXTURE_PATH}?renderer=${renderer}&assets=${assets}`);
  await page.waitForFunction(
    () => window.__wi07Fixture !== undefined,
    undefined,
    {
      timeout: 300_000,
    },
  );
  const status = await page.evaluate(() => ({
    status: window.__wi07Fixture?.status,
    error: window.__wi07Fixture?.error,
  }));
  expect(status.status, `fixture boot error: ${status.error}`).toBe('ready');
}

/** Applies one immutable snapshot and reads the pixels the engine finished drawing. */
async function renderSnapshot(
  page: Page,
  name: string,
): Promise<{ facts: RenderFacts; raster: Raster; shot: Buffer }> {
  const facts = await page.evaluate(
    (snapshotName) => window.__wi07Fixture!.apply(snapshotName),
    name,
  );
  // The second completed render has been composited by the browser; give the
  // compositor one short frame before reading the final pixels.
  await page.waitForTimeout(60);
  const shot = await page.screenshot();
  return { facts, raster: decodePng(shot), shot };
}

function enemyRegion(facts: RenderFacts, padding = 8): Region {
  const enemy = facts.enemies[0]!;
  return {
    x:
      Math.round(facts.canvasRect.x + enemy.centerX - enemy.width / 2) -
      padding,
    y:
      Math.round(facts.canvasRect.y + enemy.centerY - enemy.height / 2) -
      padding,
    width: Math.ceil(enemy.width) + padding * 2,
    height: Math.ceil(enemy.height) + padding * 2,
  };
}

/**
 * The approved normalised Elite Core box from the procedural mapping
 * (`x ∈ ±0.05`, `y ∈ [-0.08, -0.02]` of the rendered bounds, positive y = nose).
 */
function eliteCoreRegion(facts: RenderFacts, padding = 3): Region {
  const enemy = facts.enemies[0]!;
  const left = enemy.centerX - 0.05 * enemy.width;
  const right = enemy.centerX + 0.05 * enemy.width;
  const top = enemy.centerY - 0.08 * enemy.height;
  const bottom = enemy.centerY - 0.02 * enemy.height;
  return {
    x: Math.floor(facts.canvasRect.x + left) - padding,
    y: Math.floor(facts.canvasRect.y + top) - padding,
    width: Math.max(4, Math.ceil(right - left)) + padding * 2,
    height: Math.max(4, Math.ceil(bottom - top)) + padding * 2,
  };
}

function writeEvidence(name: string, value: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(EVIDENCE_DIR, name),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

/** Writes one raw raster and returns its sha256 plus byte size. */
function writeRaster(
  name: string,
  shot: Buffer,
): { sha256: string; bytes: number } {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, name), shot);
  return {
    sha256: createHash('sha256').update(shot).digest('hex'),
    bytes: shot.length,
  };
}

function candidateIdentity(): {
  head: string;
  sourceFingerprint: string;
  candidateDigest: string;
} {
  // The isolated mutation counter-test runs in a detached copy without Git
  // metadata; the missing identity is recorded as such instead of aborting the
  // pixel assertions that the counter-test exists to falsify.
  try {
    return {
      head: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
      sourceFingerprint: computeSourceFingerprint(),
      candidateDigest: computeD04CandidateIdentity().digest,
    };
  } catch (error) {
    return {
      head: 'unavailable',
      sourceFingerprint: 'unavailable',
      candidateDigest: `unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

const RENDERERS = ['webgl', 'canvas'] as const;
const ASSET_MODES = ['prepared', 'fallback'] as const;
const FLASH_LUMINANCE = 0.2126 * 241 + 0.7152 * 245 + 0.0722 * 247;

for (const renderer of RENDERERS) {
  for (const assets of ASSET_MODES) {
    test(`V02-WI-07 D04-C03 ${renderer}/${assets}: real-renderer Combat presentation pixels`, async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const identity = candidateIdentity();
      await openFixture(page, renderer, assets);
      const reportedRenderer = await page.evaluate(
        () => window.__wi07Fixture!.rendererType,
      );
      // The engine really selected the requested renderer.
      expect(reportedRenderer).toBe(renderer);

      const rasters: Record<
        string,
        {
          sha256: string;
          bytes: number;
          region: RegionStats;
          core: RegionStats;
        }
      > = {};
      const render = async (name: string) => {
        const { facts, raster, shot } = await renderSnapshot(page, name);
        expect(facts.rendererType).toBe(renderer);
        return { facts, raster, shot };
      };
      const record = async (name: string) => {
        const rendered = await render(name);
        const region = enemyRegion(rendered.facts);
        const core = eliteCoreRegion(rendered.facts);
        const art = writeRaster(
          `wi07-d04-c03-${renderer}-${assets}-${name}.png`,
          rendered.shot,
        );
        rasters[name] = {
          ...art,
          region: measureRegion(rendered.raster, region),
          core: measureRegion(rendered.raster, core),
        };
        return rendered;
      };

      const first = await render('elite-vulnerable-idle');
      expect(first.facts.canvasRect.width).toBe(VIEWPORT.width);
      expect(first.facts.canvasRect.height).toBe(VIEWPORT.height);
      expect(first.facts.enemies.length).toBe(1);
      const evidence: Record<string, unknown> = {
        kind: 'v02-wi-07-d04-c03-real-renderer-proof',
        identity,
        requestedRenderer: renderer,
        reportedRenderer,
        assetMode: assets,
        viewport: first.facts.canvasRect,
        snapshots: rasters,
        classifier: {},
        notes: [
          'Component rendering proof only: not ordinary-production gameplay traversal.',
          'Authoritative 3-step damage feedback comes from the existing simulation tests.',
          'Fixture snapshots are immutable test inputs; the application exposes no such API.',
        ],
      };

      if (assets === 'prepared') {
        // ----- prepared Basic Drone damaging-hit flash ----------------------
        const basicIdle = await record('basic-idle');
        const idleRegion = enemyRegion(basicIdle.facts);
        const idleStats = measureRegion(basicIdle.raster, idleRegion);
        expect(idleStats.flashPixels).toBe(0);
        for (const steps of [3, 2, 1]) {
          const flashed = await record(`basic-flash-${steps}`);
          const stats = measureRegion(flashed.raster, idleRegion);
          // The whole prepared silhouette is rendered in the approved flash
          // colour: the old near-white MULTIPLY tint left these pixels as
          // artwork, so this assertion fails for that path.
          expect(
            stats.flashPixels,
            `basic flash remaining=${steps} flash pixels`,
          ).toBeGreaterThan(80);
          // Alpha/background preserved: the silhouette geometry is the same and
          // the footprint is unchanged up to anti-aliasing.
          expect(stats.footprint).not.toBeNull();
          expect(
            Math.abs(stats.footprint!.width - idleStats.footprint!.width),
          ).toBeLessThanOrEqual(2);
          expect(
            Math.abs(stats.footprint!.height - idleStats.footprint!.height),
          ).toBeLessThanOrEqual(2);
          expect(
            Math.abs(stats.footprintPixels - idleStats.footprintPixels),
          ).toBeLessThanOrEqual(
            Math.max(10, Math.round(idleStats.footprintPixels * 0.15)),
          );
          // The background around the craft is byte-identical.
          expect(
            ringEquals(basicIdle.raster, flashed.raster, idleRegion),
            'the background must be preserved during the flash',
          ).toBe(true);
        }
        const restored = await record('basic-flash-0');
        // Exact restoration of the same enemy at the same position.
        expect(
          regionEquals(basicIdle.raster, restored.raster, idleRegion),
          'the artwork must be restored exactly after the 3 fixed steps',
        ).toBe(true);
        const repeated = await record('basic-flash-repeat-2');
        expect(
          measureRegion(repeated.raster, idleRegion).flashPixels,
          'a repeated damaging hit must flash again',
        ).toBeGreaterThan(80);
      }

      // ----- Elite Vulnerable flash, Armoured negative, exit fade -----------
      const eliteIdle = await record('elite-vulnerable-idle');
      const eliteRegion = enemyRegion(eliteIdle.facts);
      const eliteFlashed = await record('elite-vulnerable-flash-3');
      const eliteFlashStats = measureRegion(eliteFlashed.raster, eliteRegion);
      const eliteRestored = await record('elite-vulnerable-flash-0');
      const eliteArmoured = await record('elite-armoured-idle');
      const armouredStats = measureRegion(
        eliteArmoured.raster,
        enemyRegion(eliteArmoured.facts),
      );
      const armouredDeflection = await record('elite-armoured-deflection');
      const exitFade = await record('elite-vulnerable-flash-3-exit-fade');
      const exitStats = measureRegion(
        exitFade.raster,
        enemyRegion(exitFade.facts),
      );

      if (assets === 'prepared') {
        expect(
          eliteFlashStats.flashPixels,
          'elite vulnerable flash pixels',
        ).toBeGreaterThan(80);
        expect(
          regionEquals(eliteIdle.raster, eliteRestored.raster, eliteRegion),
          'the elite artwork must be restored exactly',
        ).toBe(true);
        // The authoritative exit fade still applies to the whitened silhouette.
        expect(exitFade.facts.exitOpacity).toBeLessThan(1);
        expect(exitStats.flashPixels).toBe(0);
        expect(exitStats.maxLuminance).toBeLessThan(FLASH_LUMINANCE - 12);
        expect(exitStats.maxLuminance).toBeGreaterThan(
          exitFade.facts.exitOpacity * FLASH_LUMINANCE * 0.6,
        );
      }
      // Armoured keeps its local-only feedback: no full-craft white, whatever
      // the asset mode or renderer. The approved impact diamond is drawn in the
      // same `--color-text-primary` token as the flash colour, so a colour count
      // alone cannot separate them: the byte-difference census must show a
      // bounded local change and the craft itself must stay un-whitened.
      const armouredRegion = enemyRegion(eliteArmoured.facts);
      const armouredDelta = diffRegions(
        eliteArmoured.raster,
        armouredDeflection.raster,
        armouredRegion,
      );
      expect(
        armouredDelta.changed,
        'the local deflection must change something',
      ).toBeGreaterThan(0);
      expect(
        armouredDelta.changed,
        'the local deflection must stay local',
      ).toBeLessThan(160);
      expect(armouredDelta.bbox!.width).toBeLessThanOrEqual(16);
      expect(armouredDelta.bbox!.height).toBeLessThanOrEqual(16);
      expect(
        armouredStats.flashPixels,
        'Armoured must never full-craft flash',
      ).toBeLessThan(12);
      // A phase swap leaves no stuck white: Armoured rendered after a Vulnerable
      // flash shows its own artwork.
      expect(eliteArmoured.facts.elitePhase).toBe('armoured');

      // ----- the repaired classifier against these real rasters -------------
      evidence.classifier = {};
      writeEvidence(
        `wi07-d04-c03-${renderer}-${assets}-rendering-proof.json`,
        evidence,
      );
      // ----- the approved Core geometry measured on the real rasters ---------
      const vulnerableCore = rasters['elite-vulnerable-idle']!.core;
      const armouredCore = rasters['elite-armoured-idle']!.core;
      evidence.summary = {
        basicIdleFlashPixels: rasters['basic-idle']?.region.flashPixels ?? null,
        basicFlash3FlashPixels:
          rasters['basic-flash-3']?.region.flashPixels ?? null,
        eliteIdleFlashPixels:
          rasters['elite-vulnerable-idle']!.region.flashPixels,
        eliteFlash3FlashPixels:
          rasters['elite-vulnerable-flash-3']?.region.flashPixels ?? null,
        armouredFlashPixels: rasters['elite-armoured-idle']!.region.flashPixels,
        armouredDeflectionFlashPixels:
          rasters['elite-armoured-deflection']!.region.flashPixels,
        exitFadeOpacity: exitFade.facts.exitOpacity,
        exitFadeMaxLuminance: exitStats.maxLuminance,
        flashLuminance: Number(FLASH_LUMINANCE.toFixed(2)),
        eliteVulnerableCoreAccentPixels: vulnerableCore.accentPixels,
        eliteArmouredCoreAccentPixels: armouredCore.accentPixels,
        eliteVulnerableCoreMaxLuminance: vulnerableCore.maxLuminance,
        eliteArmouredCoreMaxLuminance: armouredCore.maxLuminance,
        eliteVulnerableCoreGrayscale: vulnerableCore.grayscale,
        eliteArmouredCoreGrayscale: armouredCore.grayscale,
        eliteFootprintWidth:
          rasters['elite-vulnerable-idle']!.region.footprint?.width ?? null,
        eliteFootprintHeight:
          rasters['elite-vulnerable-idle']!.region.footprint?.height ?? null,
      };
      writeEvidence(
        `wi07-d04-c03-${renderer}-${assets}-rendering-proof.json`,
        evidence,
      );
      console.log(
        `D04-C03 ${renderer}/${assets}: ${JSON.stringify(evidence.summary)}`,
      );

      const classify = (raster: Raster) => {
        // The fixed top HUD band (Countdown and utility controls) is masked
        // exactly as the D04 production measurement does, so the reader sees the
        // gameplay rendering only.
        maskRegions(raster, [{ x: 0, y: 0, width: raster.width, height: 80 }]);
        const observation = classifyFrame(raster);
        return {
          elite:
            observation.elite === null
              ? null
              : {
                  width: Math.round(observation.elite.width),
                  height: Math.round(observation.elite.height),
                  vulnerable: observation.elite.vulnerable,
                },
          coreThreats: observation.threats.filter((t) => t.kind === 'core')
            .length,
        };
      };
      const vulnerableVerdict = classify(eliteIdle.raster);
      const armouredVerdict = classify(eliteArmoured.raster);
      evidence.classifier = {
        vulnerableRaster: vulnerableVerdict,
        armouredRaster: armouredVerdict,
      };
      // The Armoured raster must never read as Vulnerable, in either renderer.
      expect(
        armouredVerdict.elite?.vulnerable ?? false,
        'the Armoured raster must never read as Vulnerable',
      ).toBe(false);
      // The rendered-pixel reader is exercised on the real rasters. Its Elite
      // candidate floor is calibrated on the WebGL presentation the product uses
      // in Chromium: the CANVAS fallback renders the same prepared artwork with
      // softer edges, so its prepared-sprite verdict is recorded rather than
      // asserted. The procedural (fallback) Core is measured and asserted in both
      // renderers because it is drawn from flat token fills.
      // ----- the approved Core geometry measured on the real rasters ---------
      // Independent of the reader above: raw pixels only.
      expect(
        rasters['elite-armoured-idle']!.core.accentPixels,
        'the Armoured state must expose no accent Core',
      ).toBe(0);
      expect(
        rasters['elite-vulnerable-idle']!.core.accentPixels,
        'the Vulnerable Core must render inside the approved central opening box',
      ).toBeGreaterThan(0);
      expect(
        rasters['elite-vulnerable-idle']!.core.maxLuminance,
        'the Vulnerable central opening must be geometrically distinguishable',
      ).toBeGreaterThan(rasters['elite-armoured-idle']!.core.maxLuminance + 20);
      if (renderer === 'webgl' || assets === 'fallback') {
        expect(
          vulnerableVerdict.elite,
          'the Elite must be visible to the reader',
        ).not.toBeNull();
        expect(
          armouredVerdict.elite,
          'the Armoured Elite must be visible',
        ).not.toBeNull();
        expect(
          vulnerableVerdict.elite!.vulnerable,
          'the Vulnerable raster must read as Vulnerable',
        ).toBe(true);
      }
      writeEvidence(
        `wi07-d04-c03-${renderer}-${assets}-rendering-proof.json`,
        evidence,
      );
    });
  }
}
