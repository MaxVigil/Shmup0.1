import { inflateSync } from 'node:zlib';

/**
 * V02-WI-06 E04-C01-M01 rendered-pixel reader for manual visual evidence.
 *
 * The human-controlled Mission 03 review session may observe ONLY what a player
 * sees: the pixels of the rendered Combat canvas (captured with ordinary browser
 * screenshot APIs) and the visible DOM/HUD. This module is a pure, dependency-
 * free test-support helper: it decodes a PNG raster and classifies its visible
 * shapes so the runner can recognize the player-visible Elite and its
 * Armoured/Vulnerable state for bounded, passively selected captures. It never
 * imports application, domain, Phaser, or persistence modules and never receives
 * hidden gameplay state.
 */

export interface Raster {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  readonly data: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  return pb <= pc ? b : c;
}

/** Decodes a non-interlaced 8-bit PNG (colour type 2 or 6) into RGBA pixels. */
export function decodePng(buffer: Uint8Array): Raster {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let index = 0; index < signature.length; index += 1) {
    if (buffer[index] !== signature[index]) {
      throw new Error('decodePng: not a PNG file.');
    }
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  while (offset + 8 <= buffer.length) {
    const length =
      (buffer[offset]! << 24) |
      (buffer[offset + 1]! << 16) |
      (buffer[offset + 2]! << 8) |
      buffer[offset + 3]!;
    const type = String.fromCharCode(
      buffer[offset + 4]!,
      buffer[offset + 5]!,
      buffer[offset + 6]!,
      buffer[offset + 7]!,
    );
    const dataStart = offset + 8;
    if (type === 'IHDR') {
      width =
        (buffer[dataStart]! << 24) |
        (buffer[dataStart + 1]! << 16) |
        (buffer[dataStart + 2]! << 8) |
        buffer[dataStart + 3]!;
      height =
        (buffer[dataStart + 4]! << 24) |
        (buffer[dataStart + 5]! << 16) |
        (buffer[dataStart + 6]! << 8) |
        buffer[dataStart + 7]!;
      const bitDepth = buffer[dataStart + 8]!;
      const colorType = buffer[dataStart + 9]!;
      const interlace = buffer[dataStart + 12]!;
      if (bitDepth !== 8 || interlace !== 0) {
        throw new Error(
          'decodePng: only 8-bit non-interlaced PNG is supported.',
        );
      }
      if (colorType === 6) {
        channels = 4;
      } else if (colorType === 2) {
        channels = 3;
      } else {
        throw new Error(`decodePng: unsupported colour type ${colorType}.`);
      }
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + length + 4;
  }
  const raw = new Uint8Array(
    inflateSync(Buffer.concat(idat.map((part) => Buffer.from(part)))),
  );
  const stride = width * channels;
  const data = new Uint8Array(width * height * 4);
  let rawOffset = 0;
  let previous = new Uint8Array(stride);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[rawOffset]!;
    rawOffset += 1;
    const line = raw.subarray(rawOffset, rawOffset + stride);
    rawOffset += stride;
    const current = new Uint8Array(stride);
    for (let index = 0; index < stride; index += 1) {
      const rawByte = line[index]!;
      const left = index >= channels ? current[index - channels]! : 0;
      const up = previous[index]!;
      const upLeft = index >= channels ? previous[index - channels]! : 0;
      let value = rawByte;
      if (filter === 1) {
        value = rawByte + left;
      } else if (filter === 2) {
        value = rawByte + up;
      } else if (filter === 3) {
        value = rawByte + Math.floor((left + up) / 2);
      } else if (filter === 4) {
        value = rawByte + paeth(left, up, upLeft);
      }
      current[index] = value & 0xff;
    }
    for (let column = 0; column < width; column += 1) {
      const source = column * channels;
      const target = (row * width + column) * 4;
      data[target] = current[source]!;
      data[target + 1] = current[source + 1]!;
      data[target + 2] = current[source + 2]!;
      data[target + 3] = channels === 4 ? current[source + 3]! : 255;
    }
    previous = current;
  }
  return { width, height, data };
}

/** Clears visible HUD rectangles so only the gameplay surface is classified. */
export function maskRegions(
  raster: Raster,
  regions: readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[],
): void {
  for (const region of regions) {
    const left = Math.max(0, Math.floor(region.x));
    const top = Math.max(0, Math.floor(region.y));
    const right = Math.min(raster.width, Math.ceil(region.x + region.width));
    const bottom = Math.min(raster.height, Math.ceil(region.y + region.height));
    for (let row = top; row < bottom; row += 1) {
      for (let column = left; column < right; column += 1) {
        const base = (row * raster.width + column) * 4;
        raster.data[base] = 0;
        raster.data[base + 1] = 0;
        raster.data[base + 2] = 0;
        raster.data[base + 3] = 0;
      }
    }
  }
}

function insideShape(
  shape: VisibleShape,
  point: { readonly centerX: number; readonly centerY: number },
): boolean {
  return (
    point.centerX >= shape.centerX - shape.width / 2 &&
    point.centerX <= shape.centerX + shape.width / 2 &&
    point.centerY >= shape.top &&
    point.centerY <= shape.bottom
  );
}

export interface VisibleShape {
  readonly centerX: number;
  readonly centerY: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/** Everything the pilot is allowed to observe: rendered shapes + visible HUD. */
export interface FrameObservation {
  /** The one large upper-area craft (the Elite), when it is on screen. */
  readonly elite: (VisibleShape & { readonly vulnerable: boolean }) | null;
  /** Regular enemies, lowest (closest to escaping) first. */
  readonly enemies: readonly VisibleShape[];
  /** Incoming enemy projectiles: `shot` = danger rectangles, `core` = accent. */
  readonly threats: readonly (VisibleShape & {
    readonly kind: 'shot' | 'core';
  })[];
  /** The player aircraft (largest, lowest craft). */
  readonly aircraft: VisibleShape | null;
}

/** Coarse cell size (px) used for connected-component clustering. */
const CELL = 4;

type PixelClass = 'grey' | 'danger' | 'accent' | 'none';

function classifyPixel(r: number, g: number, b: number): PixelClass {
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  // The Combat canvas background is near-black; anything meaningfully brighter
  // is a rendered craft, projectile, or core.
  if (maximum < 26) {
    return 'none';
  }
  if (r > 110 && r > g + 40 && r > b + 40) {
    return 'danger';
  }
  if (b > 105 && b > r + 25 && g >= r && b >= g) {
    return 'accent';
  }
  // Craft sprites use a restrained dark metallic palette, so the grey test is
  // deliberately permissive and relies on shape/area to reject noise.
  if (maximum >= 60 && maximum - minimum < 70) {
    return 'grey';
  }
  return 'none';
}

interface Cluster {
  minColumn: number;
  maxColumn: number;
  minRow: number;
  maxRow: number;
  pixels: number;
}

function clusterClass(
  raster: Raster,
  pixelClass: PixelClass,
): readonly VisibleShape[] {
  const columns = Math.ceil(raster.width / CELL);
  const rows = Math.ceil(raster.height / CELL);
  const grid = new Uint8Array(columns * rows);
  const pixelCount = new Uint32Array(columns * rows);
  for (let y = 0; y < raster.height; y += 1) {
    const rowBase = y * raster.width * 4;
    const gridRow = Math.floor(y / CELL) * columns;
    for (let x = 0; x < raster.width; x += 1) {
      const base = rowBase + x * 4;
      if (raster.data[base + 3]! === 0) {
        continue;
      }
      const found = classifyPixel(
        raster.data[base]!,
        raster.data[base + 1]!,
        raster.data[base + 2]!,
      );
      if (found !== pixelClass) {
        continue;
      }
      const cell = gridRow + Math.floor(x / CELL);
      grid[cell] = 1;
      pixelCount[cell] = pixelCount[cell]! + 1;
    }
  }
  const visited = new Uint8Array(columns * rows);
  const shapes: VisibleShape[] = [];
  const stack: number[] = [];
  for (let index = 0; index < grid.length; index += 1) {
    if (grid[index] !== 1 || visited[index] === 1) {
      continue;
    }
    const cluster: Cluster = {
      minColumn: columns,
      maxColumn: 0,
      minRow: rows,
      maxRow: 0,
      pixels: 0,
    };
    stack.push(index);
    visited[index] = 1;
    while (stack.length > 0) {
      const cell = stack.pop()!;
      const column = cell % columns;
      const row = Math.floor(cell / columns);
      cluster.pixels += pixelCount[cell]!;
      cluster.minColumn = Math.min(cluster.minColumn, column);
      cluster.maxColumn = Math.max(cluster.maxColumn, column);
      cluster.minRow = Math.min(cluster.minRow, row);
      cluster.maxRow = Math.max(cluster.maxRow, row);
      const neighbours = [
        column > 0 ? cell - 1 : -1,
        column < columns - 1 ? cell + 1 : -1,
        row > 0 ? cell - columns : -1,
        row < rows - 1 ? cell + columns : -1,
      ];
      for (const neighbour of neighbours) {
        if (
          neighbour >= 0 &&
          grid[neighbour] === 1 &&
          visited[neighbour] !== 1
        ) {
          visited[neighbour] = 1;
          stack.push(neighbour);
        }
      }
    }
    if (cluster.pixels < 12) {
      continue;
    }
    const top = cluster.minRow * CELL;
    const bottom = Math.min(raster.height, (cluster.maxRow + 1) * CELL);
    const left = cluster.minColumn * CELL;
    const right = Math.min(raster.width, (cluster.maxColumn + 1) * CELL);
    shapes.push({
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
      top,
      bottom,
      width: right - left,
      height: bottom - top,
    });
  }
  return shapes;
}

/**
 * Classifies one rendered frame into the visible facts the manual review runner
 * may use. The Aircraft is the largest craft on screen; the Elite is the large
 * craft strictly above it — never claimed without a visible Aircraft, which is
 * how an entering mid-screen Aircraft used to be misread as the Elite; regular
 * enemies are the remaining craft above the Aircraft.
 */
export function classifyFrame(raster: Raster): FrameObservation {
  const grey = clusterClass(raster, 'grey');
  const danger = clusterClass(raster, 'danger');
  const accent = clusterClass(raster, 'accent');
  const sprites = grey.filter((shape) => shape.width * shape.height >= 200);
  const byArea = [...sprites].sort(
    (a, b) => b.width * b.height - a.width * a.height,
  );
  const aircraft = byArea[0] ?? null;
  const aboveAircraft = (shape: VisibleShape): boolean =>
    aircraft !== null && shape.bottom < aircraft.top - 20;
  const eliteCandidate =
    byArea
      .filter(
        (shape) =>
          shape !== aircraft &&
          shape.height >= 30 &&
          shape.top < raster.height * 0.45 &&
          aboveAircraft(shape),
      )
      .sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
  const elite =
    eliteCandidate === null
      ? null
      : {
          ...eliteCandidate,
          vulnerable: accent.some((shape) =>
            insideShape(eliteCandidate, shape),
          ),
        };
  const enemies = byArea
    .filter(
      (shape) =>
        shape !== aircraft &&
        shape !== eliteCandidate &&
        shape.top < raster.height * 0.7 &&
        aboveAircraft(shape),
    )
    .sort((a, b) => b.bottom - a.bottom);
  // Accent/danger shapes inside the Aircraft's own silhouette are its own
  // lighting, not incoming projectiles (a projectile already overlapping the
  // Aircraft could not be dodged anyway).
  const threats = [
    ...danger
      .filter((shape) => aircraft === null || !insideShape(aircraft, shape))
      .map((shape) => ({ ...shape, kind: 'shot' as const })),
    ...accent
      .filter(
        (shape) =>
          (aircraft === null || !insideShape(aircraft, shape)) &&
          (eliteCandidate === null ||
            shape.centerY < eliteCandidate.top - 8 ||
            shape.centerY > eliteCandidate.bottom + 8),
      )
      .map((shape) => ({ ...shape, kind: 'core' as const })),
  ];
  return { elite, enemies, threats, aircraft };
}
