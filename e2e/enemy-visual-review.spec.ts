import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * V02-WI-01 enemy visual review fixture (Epic §16.1, §16.5; V02-AC-024 asset
 * layer; V02-AC-025 bounded-fixture asset layer). Renders every approved
 * enemy sprite and its exact procedural fallback at the centrally configured
 * gameplay scale and complete rendered bounds for colour, grayscale, fallback,
 * and minimum-supported-viewport review, and captures the review sheets as
 * handoff evidence.
 *
 * Development project only: the fixture page is served solely by the Vite
 * development server and never ships in the production build.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };
const FIXTURE_URL = '/src/fixtures/enemy-visual-review/';
const EVIDENCE_DIR = join(process.cwd(), '.agent-handoff', 'evidence');

const KINDS = [
  'basic-drone',
  'ranged-drone',
  'hunter-drone',
  'elite-drone-armoured',
  'elite-drone-vulnerable',
] as const;

interface PixelSample {
  readonly width: number;
  readonly height: number;
  readonly opaque: number;
  readonly maxChannelDelta: number;
  readonly bodyPixels: number;
  readonly housingPixels: number;
  readonly accentPixels: number;
  /** Row index (0 = top) with the most opaque pixels. */
  readonly widestRowIndex: number;
  /** Opaque-pixel count in the widest row. */
  readonly maxRowWidth: number;
  /** Horizontal silhouette span (max opaque x − min opaque x). */
  readonly envelopeWidth: number;
  /** Vertical centroid (row) of all opaque pixels. */
  readonly centroidY: number;
}

async function samplePixels(
  page: Page,
  kind: string,
  variant: 'colour' | 'grayscale' | 'fallback',
): Promise<PixelSample | null> {
  return page.evaluate(
    ({ kind: sampleKind, variant: sampleVariant }) => {
      // Approved fallback palette (Design System §6.1), inlined because
      // `page.evaluate` serializes only the callback body.
      const bodyRgb = [0x52, 0x64, 0x71];
      const housingRgb = [0x18, 0x21, 0x28];
      const accentRgb = [0x65, 0xa9, 0xd6];
      const canvas = document.querySelector<HTMLCanvasElement>(
        `canvas[data-kind="${sampleKind}"][data-variant="${sampleVariant}"]`,
      );
      if (canvas === null) {
        return null;
      }
      const context = canvas.getContext('2d');
      if (context === null) {
        return null;
      }
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = image;
      const rowWidths = new Array<number>(canvas.height).fill(0);
      let opaque = 0;
      let maxChannelDelta = 0;
      let bodyPixels = 0;
      let housingPixels = 0;
      let accentPixels = 0;
      let massY = 0;
      let minX = canvas.width;
      let maxX = -1;
      const near = (value: number, target: number): boolean =>
        Math.abs(value - target) <= 6;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const a = data[i + 3] ?? 0;
        if (a === 0) {
          continue;
        }
        const row = Math.floor(i / 4 / canvas.width);
        const x = Math.floor((i / 4) % canvas.width);
        rowWidths[row] = (rowWidths[row] ?? 0) + 1;
        opaque += 1;
        massY += row;
        if (x < minX) {
          minX = x;
        }
        if (x > maxX) {
          maxX = x;
        }
        maxChannelDelta = Math.max(
          maxChannelDelta,
          Math.abs(r - g),
          Math.abs(g - b),
          Math.abs(r - b),
        );
        if (
          near(r, bodyRgb[0] ?? 0) &&
          near(g, bodyRgb[1] ?? 0) &&
          near(b, bodyRgb[2] ?? 0)
        ) {
          bodyPixels += 1;
        }
        if (
          near(r, housingRgb[0] ?? 0) &&
          near(g, housingRgb[1] ?? 0) &&
          near(b, housingRgb[2] ?? 0)
        ) {
          housingPixels += 1;
        }
        if (
          near(r, accentRgb[0] ?? 0) &&
          near(g, accentRgb[1] ?? 0) &&
          near(b, accentRgb[2] ?? 0)
        ) {
          accentPixels += 1;
        }
      }
      let widestRowIndex = 0;
      let maxRowWidth = 0;
      for (let row = 0; row < rowWidths.length; row += 1) {
        const count = rowWidths[row] ?? 0;
        if (count > maxRowWidth) {
          maxRowWidth = count;
          widestRowIndex = row;
        }
      }
      return {
        width: canvas.width,
        height: canvas.height,
        opaque,
        maxChannelDelta,
        bodyPixels,
        housingPixels,
        accentPixels,
        widestRowIndex,
        maxRowWidth,
        envelopeWidth: opaque > 0 ? maxX - minX : 0,
        centroidY: opaque > 0 ? massY / opaque : 0,
      };
    },
    { kind, variant },
  );
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

test('the fixture renders all five sprites and exact procedural fallbacks at the minimum viewport (V02-AC-024)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(FIXTURE_URL);
  await expect(
    page.locator('[data-testid="er-panels"] .er__panel'),
  ).toHaveCount(KINDS.length);
  for (const kind of KINDS) {
    await expect(page.locator(`canvas[data-kind="${kind}"]`)).toHaveCount(3);
  }

  // Local development server: the real bounded Boot preload prepares every
  // enemy image as ready.
  for (const kind of KINDS) {
    await expect(
      page.locator(`canvas[data-kind="${kind}"][data-variant="colour"]`),
    ).toHaveAttribute('data-status', 'ready');
  }

  const areas: Record<string, number> = {};
  for (const kind of KINDS) {
    const colour = await samplePixels(page, kind, 'colour');
    const grayscale = await samplePixels(page, kind, 'grayscale');
    const fallback = await samplePixels(page, kind, 'fallback');
    expect(colour).not.toBeNull();
    expect(grayscale).not.toBeNull();
    expect(fallback).not.toBeNull();

    // Complete rendered bounds are non-empty at the configured gameplay scale.
    expect(colour!.width).toBeGreaterThan(0);
    expect(colour!.height).toBeGreaterThan(0);
    areas[kind] = colour!.width * colour!.height;

    // The prepared sprite renders real content with true alpha background.
    expect(colour!.opaque).toBeGreaterThan(0);

    // The grayscale variant is genuinely desaturated for every opaque pixel.
    expect(grayscale!.opaque).toBeGreaterThan(0);
    expect(grayscale!.maxChannelDelta).toBeLessThanOrEqual(3);

    // The exact procedural fallback uses the approved neutral metallic body.
    expect(fallback!.opaque).toBeGreaterThan(0);
    expect(fallback!.bodyPixels).toBeGreaterThan(0);

    // C01 observable orientation regression: every fallback is nose-down —
    // its widest silhouette row and its vertical mass sit in the upper half
    // of the complete rendered bounds, matching the prepared sprites (whose
    // wings/mass are top-loaded and whose nose narrows towards the player).
    expect(fallback!.widestRowIndex).toBeLessThan(fallback!.height / 2);
    expect(fallback!.centroidY).toBeLessThan(fallback!.height / 2);

    // The prepared sprite agrees with the fallback orientation.
    expect(colour!.widestRowIndex).toBeLessThan(colour!.height / 2);
  }

  // C01 Hunter regression: at the minimum-viewport bounds the wings must
  // visibly span the majority of the complete rendered width so the craft
  // reads as an interceptor aircraft rather than a missile. The horizontal
  // silhouette envelope measures the true wing span; the widest row measures
  // the wing cross-section. A missile-like silhouette (slender fuselage with
  // small fins) fails both.
  const hunterFallback = await samplePixels(page, 'hunter-drone', 'fallback');
  expect(hunterFallback!.envelopeWidth).toBeGreaterThanOrEqual(
    hunterFallback!.width * 0.6,
  );
  expect(hunterFallback!.maxRowWidth).toBeGreaterThanOrEqual(
    hunterFallback!.width * 0.5,
  );

  // Approved relative gameplay-scale footprints (Epic §16.2–16.3).
  expect(areas['elite-drone-armoured']!).toBeGreaterThan(
    areas['ranged-drone']!,
  );
  expect(areas['ranged-drone']!).toBeGreaterThan(areas['basic-drone']!);
  expect(areas['basic-drone']!).toBeGreaterThan(areas['hunter-drone']!);
  expect(areas['elite-drone-vulnerable']!).toBeGreaterThanOrEqual(
    areas['elite-drone-armoured']! * 0.9,
  );

  // The Elite Vulnerable fallback exposes the pale-cyan Core accent; the
  // other four fallbacks contain no accent (geometry, not colour, carries
  // role distinction) and only Elite states carry the central housing plate.
  const vulnerable = await samplePixels(
    page,
    'elite-drone-vulnerable',
    'fallback',
  );
  const armoured = await samplePixels(page, 'elite-drone-armoured', 'fallback');
  expect(vulnerable!.accentPixels).toBeGreaterThan(0);
  expect(armoured!.accentPixels).toBe(0);
  for (const kind of ['basic-drone', 'ranged-drone', 'hunter-drone'] as const) {
    const fallback = await samplePixels(page, kind, 'fallback');
    expect(fallback!.accentPixels).toBe(0);
    expect(fallback!.housingPixels).toBe(0);
  }

  expect(pageErrors).toEqual([]);

  // Handoff evidence: real-scale review sheets at the minimum viewport.
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: join(
      EVIDENCE_DIR,
      'v02-wi-01-fixture-colour-grayscale-fallback-full.png',
    ),
    fullPage: true,
  });
  for (const kind of KINDS) {
    const panel = page.locator(`.er__panel[data-kind="${kind}"]`);
    await panel.screenshot({
      path: join(EVIDENCE_DIR, `v02-wi-01-fixture-${kind}.png`),
    });
  }
});

test('the fixture renders the stable procedural fallback deterministically when forced (V02-AC-025 asset layer)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${FIXTURE_URL}?force=fallback`);
  await expect(
    page.locator('[data-testid="er-panels"] .er__panel'),
  ).toHaveCount(KINDS.length);
  for (const kind of KINDS) {
    await expect(
      page.locator(`canvas[data-kind="${kind}"][data-variant="colour"]`),
    ).toHaveAttribute('data-status', 'fallback');
    const colour = await samplePixels(page, kind, 'colour');
    expect(colour).not.toBeNull();
    expect(colour!.opaque).toBeGreaterThan(0);
    expect(colour!.bodyPixels).toBeGreaterThan(0);
  }

  expect(pageErrors).toEqual([]);

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: join(EVIDENCE_DIR, 'v02-wi-01-fixture-forced-fallback.png'),
    fullPage: true,
  });
});
