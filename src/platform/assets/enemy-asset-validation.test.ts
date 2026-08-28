import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';
import { RUNTIME_ASSET_MANIFEST } from './runtime-asset-catalogue';

/**
 * V02-WI-01 asset validation (v0.2 Epic §16.1, §16.4; V02-DEC-014): the five
 * prepared runtime enemy PNGs must have real alpha transparency, the exact
 * approved dimensions, a combined pack size of at most `450,000 bytes`, and a
 * complete runtime manifest total within the unchanged `2 MiB` budget.
 * Source material under `assets/source/` is never read at runtime; these
 * checks inspect the committed runtime files only.
 */

const ENEMY_DIR = join(process.cwd(), 'assets', 'runtime', 'enemies');

/** Approved §16.4 dimensions (width × height) for each prepared enemy PNG. */
const APPROVED_ENEMY_DIMENSIONS: Record<string, readonly [number, number]> = {
  'basic-drone.png': [192, 101],
  'ranged-drone.png': [224, 163],
  'hunter-drone.png': [114, 192],
  'elite-drone-armoured.png': [214, 320],
  'elite-drone-vulnerable.png': [281, 320],
};

const ENEMY_PACK_BUDGET_BYTES = 450_000;
const COMPLETE_RUNTIME_BUDGET_BYTES = 2 * 1024 * 1024;

interface PngInfo {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
  readonly hasTransparentPixels: boolean;
}

/**
 * Minimal dependency-free PNG inspection: signature, IHDR (dimensions, bit
 * depth, colour type), then the inflated IDAT scan for any fully or partially
 * transparent pixel. The five approved files are 8-bit RGBA (colour type 6),
 * so transparency is read directly from the alpha byte.
 */
function inspectPng(buffer: Buffer): PngInfo {
  expect(buffer.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer.readUInt8(24);
  const colorType = buffer.readUInt8(25);

  const idatChunks: Buffer[] = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IDAT') {
      idatChunks.push(data);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idatChunks));

  let hasTransparentPixels = false;
  if (colorType === 6 || colorType === 4) {
    const bytesPerPixel = colorType === 6 ? 4 : 2;
    const stride = width * bytesPerPixel;
    for (let y = 0; y < height && !hasTransparentPixels; y += 1) {
      const rowStart = y * (stride + 1) + 1;
      for (let x = 0; x < width; x += 1) {
        const alpha = raw[rowStart + x * bytesPerPixel + bytesPerPixel - 1];
        if (alpha !== undefined && alpha < 255) {
          hasTransparentPixels = true;
          break;
        }
      }
    }
  }
  return { width, height, bitDepth, colorType, hasTransparentPixels };
}

function completeRuntimeTotalBytes(): number {
  const runtimeRoot = join(process.cwd(), 'assets', 'runtime');
  const all: string[] = [];
  const collect = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        collect(path);
      } else {
        all.push(path);
      }
    }
  };
  collect(runtimeRoot);
  return all.reduce((total, path) => total + statSync(path).size, 0);
}

describe('enemy runtime asset validation (V02-WI-01)', () => {
  it('declares exactly the five approved enemy PNGs in the central catalogue', () => {
    const enemyEntries = RUNTIME_ASSET_MANIFEST.filter(
      (entry) => entry.kind === 'enemy-image',
    );
    expect(enemyEntries).toHaveLength(5);
    for (const entry of enemyEntries) {
      expect(entry.sourcePath).toBe(
        `assets/runtime/enemies/${entry.id.replace('enemy-', '')}.png`,
      );
    }
  });

  it('matches the approved dimensions and has real alpha transparency (§16.4)', () => {
    const files = readdirSync(ENEMY_DIR).filter((file) =>
      file.endsWith('.png'),
    );
    expect(files.sort()).toEqual(Object.keys(APPROVED_ENEMY_DIMENSIONS).sort());
    for (const file of files) {
      const buffer = readFileSync(join(ENEMY_DIR, file));
      const info = inspectPng(buffer);
      const [expectedWidth, expectedHeight] = APPROVED_ENEMY_DIMENSIONS[
        file
      ] ?? [0, 0];
      expect(info.width).toBe(expectedWidth);
      expect(info.height).toBe(expectedHeight);
      expect(info.bitDepth).toBe(8);
      expect(info.colorType).toBe(6); // RGBA
      expect(info.hasTransparentPixels).toBe(true);
    }
  });

  it('keeps the enemy pack within 450,000 bytes (§16.1, V02-DEC-014)', () => {
    const enemyTotal = readdirSync(ENEMY_DIR)
      .filter((file) => file.endsWith('.png'))
      .reduce((total, file) => total + statSync(join(ENEMY_DIR, file)).size, 0);
    expect(enemyTotal).toBeGreaterThan(0);
    expect(enemyTotal).toBeLessThanOrEqual(ENEMY_PACK_BUDGET_BYTES);
  });

  it('keeps the complete runtime manifest within the unchanged 2 MiB budget', () => {
    const total = completeRuntimeTotalBytes();
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(COMPLETE_RUNTIME_BUDGET_BYTES);
  });
});
