import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { classifyFrame, decodePng, maskRegions } from './raster';
import type { Raster } from './raster';

/**
 * V02-WI-06 E04-C01-M01 raster counter-fixtures for manual visual evidence.
 *
 * These deterministic fixtures prove the rendered-pixel reader used by the
 * human-controlled Mission 03 review session: it localizes the visible Elite,
 * distinguishes its Armoured/Vulnerable state from rendered geometry, finds
 * regular enemies and incoming projectiles, honours masked HUD regions and
 * tolerates absence/noise. Nothing here drives gameplay.
 */

function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

function fillRect(
  raster: Raster,
  x: number,
  y: number,
  width: number,
  height: number,
  colour: readonly [number, number, number],
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      if (
        row < 0 ||
        column < 0 ||
        row >= raster.height ||
        column >= raster.width
      ) {
        continue;
      }
      const base = (row * raster.width + column) * 4;
      raster.data[base] = colour[0];
      raster.data[base + 1] = colour[1];
      raster.data[base + 2] = colour[2];
      raster.data[base + 3] = 255;
    }
  }
}

const GREY: readonly [number, number, number] = [190, 190, 190];
const DANGER: readonly [number, number, number] = [217, 103, 103];
const ACCENT: readonly [number, number, number] = [101, 169, 214];

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Test-local PNG encoder: proves decodePng against real encoded bytes. */
function encodePng(raster: Raster): Uint8Array {
  const stride = raster.width * 4;
  const raw = new Uint8Array((stride + 1) * raster.height);
  for (let row = 0; row < raster.height; row += 1) {
    raw[row * (stride + 1)] = 0;
    raw.set(
      raster.data.subarray(row * stride, (row + 1) * stride),
      row * (stride + 1) + 1,
    );
  }
  const chunk = (type: string, body: Uint8Array): Uint8Array => {
    const out = new Uint8Array(body.length + 12);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    for (let index = 0; index < 4; index += 1) {
      out[4 + index] = type.charCodeAt(index);
    }
    out.set(body, 8);
    view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, raster.width);
  ihdrView.setUint32(4, raster.height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(Buffer.from(raw)))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('rendered-pixel reader boundary (V02-WI-06 E04-C01-M01)', () => {
  it('decodes a real PNG raster and localizes the same visible shapes', () => {
    const raster = createRaster(1280, 600);
    fillRect(raster, 620, 98, 32, 46, GREY);
    fillRect(raster, 615, 456, 50, 48, GREY);
    const decoded = decodePng(encodePng(raster));
    expect(decoded.width).toBe(1280);
    expect(decoded.height).toBe(600);
    expect(Array.from(decoded.data.subarray(0, 64))).toEqual(
      Array.from(raster.data.subarray(0, 64)),
    );
    const encoded = classifyFrame(raster);
    const observation = classifyFrame(decoded);
    expect(observation.elite?.centerX).toBeCloseTo(
      encoded.elite?.centerX ?? -1,
      6,
    );
    expect(observation.aircraft?.centerX).toBeCloseTo(
      encoded.aircraft?.centerX ?? -1,
      6,
    );
    expect(observation.aircraft?.centerY).toBeCloseTo(480, 0);
  });

  it('localizes the Elite, the aircraft, and regular enemies from rendered geometry only', () => {
    const raster = createRaster(1280, 600);
    // Elite: large craft in the upper combat zone (~31 x 46 at 1280x600).
    fillRect(raster, 620, 98, 32, 46, GREY);
    // Two regular enemies above the aircraft.
    fillRect(raster, 258, 300, 33, 17, GREY);
    fillRect(raster, 515, 240, 31, 22, GREY);
    // Aircraft at the 80% VH hold pose.
    fillRect(raster, 615, 456, 50, 48, GREY);
    const observation = classifyFrame(raster);
    expect(observation.elite).not.toBeNull();
    expect(observation.elite?.centerX).toBeCloseTo(636, 0);
    expect(observation.elite?.vulnerable).toBe(false);
    expect(observation.aircraft?.centerY).toBeCloseTo(480, 0);
    expect(observation.enemies).toHaveLength(2);
    // Lowest enemy (closest to escaping) first.
    expect(observation.enemies[0]?.centerX).toBeCloseTo(274, 0);
  });

  it('distinguishes the Elite Vulnerable state by its exposed centred Core geometry', () => {
    const armoured = createRaster(1280, 600);
    fillRect(armoured, 620, 98, 32, 46, GREY);
    fillRect(armoured, 615, 456, 50, 48, GREY);
    expect(classifyFrame(armoured).elite?.vulnerable).toBe(false);
    const vulnerable = createRaster(1280, 600);
    fillRect(vulnerable, 620, 98, 32, 46, GREY);
    fillRect(vulnerable, 615, 456, 50, 48, GREY);
    // The exposed Core is a small accent-coloured shape inside the silhouette.
    fillRect(vulnerable, 630, 112, 12, 12, ACCENT);
    expect(classifyFrame(vulnerable).elite?.vulnerable).toBe(true);
  });

  it('detects incoming danger shots and accent Cores as threats', () => {
    const raster = createRaster(1280, 600);
    fillRect(raster, 615, 456, 50, 48, GREY);
    // Ranged shot (horizontal danger rectangle) and Elite cannon (vertical).
    fillRect(raster, 592, 300, 8, 4, DANGER);
    fillRect(raster, 758, 210, 4, 9, DANGER);
    // A homing Core above the aircraft.
    fillRect(raster, 640, 260, 8, 8, ACCENT);
    const observation = classifyFrame(raster);
    expect(observation.threats.filter((t) => t.kind === 'shot')).toHaveLength(
      2,
    );
    expect(observation.threats.filter((t) => t.kind === 'core')).toHaveLength(
      1,
    );
  });

  it('does not read the aircraft-attached accent HUD bar or its own lighting as threats', () => {
    // Root cause of the disclosed rehearsals' unconditional dodging: the HUD
    // layer is composited into the captured frame, so the aircraft-attached
    // accent Hull bar and the Aircraft's own accents looked like immediate
    // projectiles. Masked HUD boxes and the Aircraft silhouette fix that.
    const unmasked = createRaster(1280, 600);
    fillRect(unmasked, 615, 456, 50, 48, GREY);
    fillRect(unmasked, 630, 510, 32, 8, ACCENT);
    const masked = createRaster(1280, 600);
    fillRect(masked, 615, 456, 50, 48, GREY);
    fillRect(masked, 630, 510, 32, 8, ACCENT);
    maskRegions(masked, [{ x: 626, y: 506, width: 40, height: 16 }]);
    expect(classifyFrame(unmasked).threats.length).toBeGreaterThanOrEqual(1);
    expect(classifyFrame(masked).threats).toHaveLength(0);
    // Aircraft lighting accents inside the silhouette are never threats.
    const lighting = createRaster(1280, 600);
    fillRect(lighting, 615, 456, 50, 48, GREY);
    fillRect(lighting, 632, 464, 8, 8, ACCENT);
    expect(classifyFrame(lighting).threats).toHaveLength(0);
  });

  it('never claims an Elite from an entering mid-screen Aircraft', () => {
    // Regression from the disclosed preflight: while the Aircraft descends from
    // mid-screen, the largest craft was read as an Elite and its own accents as
    // a Vulnerable Core, producing false prepared-state captures.
    const entering = createRaster(1280, 600);
    fillRect(entering, 728, 232, 36, 48, GREY);
    fillRect(entering, 744, 246, 8, 8, ACCENT);
    const observation = classifyFrame(entering);
    expect(observation.elite).toBeNull();
    expect(observation.aircraft?.centerY).toBeCloseTo(256, 0);
    expect(observation.enemies).toHaveLength(0);
  });

  it('never claims an Elite from a large craft below the Aircraft', () => {
    const raster = createRaster(1280, 600);
    fillRect(raster, 615, 456, 50, 48, GREY);
    fillRect(raster, 600, 300, 40, 40, GREY);
    const observation = classifyFrame(raster);
    expect(observation.aircraft?.top).toBeCloseTo(456, 0);
    expect(observation.elite).toBeNull();
  });

  it('tolerates absence and noise without inventing visible shapes', () => {
    const empty = createRaster(1280, 600);
    const observation = classifyFrame(empty);
    expect(observation.elite).toBeNull();
    expect(observation.aircraft).toBeNull();
    expect(observation.enemies).toHaveLength(0);
    expect(observation.threats).toHaveLength(0);
    const noisy = createRaster(1280, 600);
    for (let index = 0; index < 400; index += 1) {
      fillRect(noisy, (index * 37) % 1270, (index * 53) % 590, 2, 2, GREY);
    }
    const noisyObservation = classifyFrame(noisy);
    expect(noisyObservation.aircraft).toBeNull();
    expect(noisyObservation.enemies).toHaveLength(0);
  });
});
